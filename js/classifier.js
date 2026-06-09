// classifier.js
// detecta qual exercício o usuário está fazendo e conta as repetições
// usa os ângulos dos pontos do MediaPipe pra tomar as decisões
// OBS: depende de pose.js ter carregado antes (usa window.PoseDetector e window.LANDMARKS)

// exercícios que vêm pré-prontos no app (não personalizados)
const BUILT_IN_EXERCISES = ['Agachamento', 'Polichinelo', 'Flexão', 'Avanço', 'Joelho Alto'];

// pontos ganhos por repetição de cada exercício
// exercícios mais difíceis dão mais pontos
const POINTS = {
  'Agachamento': { base: 10, qualityBonus: 5 },
  'Polichinelo':  { base: 8,  qualityBonus: 3 },
  'Flexão':       { base: 15, qualityBonus: 7 },
  'Avanço':       { base: 10, qualityBonus: 4 },
  'Joelho Alto':  { base: 5,  qualityBonus: 2 },
  'custom':       { base: 8,  qualityBonus: 3 }
};

// === CLASSE PRINCIPAL DE DETECÇÃO ===
class ExerciseClassifier {
  constructor() {
    this.customExercises = []; // lista de exercícios personalizados do usuário
    this.reset();
  }

  reset() {
    this._expectedExercise = null; // no modo guiado, o exercício já é sabido
    this.currentExercise = null;
    this.repCount        = 0;
    this.totalScore      = 0;
    this.qualityScores   = [];
    this.issues          = new Set();

    // máquinas de estado por exercício – guardam se está "em cima" ou "embaixo"
    this._states       = {};
    this._repMinAngles = {};
    this._repMaxAngles = {};
    this._lastRep      = {};

    // buffer pra estabilizar a detecção – evita trocar de exercício por 1 frame errado
    this._detectionBuffer = [];
    this._bufferSize = 5;

    // estados específicos de cada exercício
    this._jjState     = 'closed'; // polichinelo: 'closed' | 'open'
    this._jjOpened    = false;
    this._lungeLastSide = null;
    this._hkLastLeg   = null;
    this._pushupState = 'up';
    this._custState2  = {}; // rastreamento de exercícios personalizados

    // contador de rep por qualidade: 'rest' | 'peak'
    this._qPhase = {};
  }

  setCustomExercises(list) {
    this.customExercises = list || [];
  }

  // modo guiado: já sei qual exercício é, pulo a detecção automática
  setExpectedExercise(name) {
    if (this._expectedExercise === name) return;
    this._expectedExercise    = name;
    this._states              = {};
    this._repMinAngles        = {};
    this._repMaxAngles        = {};
    this._detectionBuffer     = [];
    this._jjState             = 'closed';
    this._jjOpened            = false;
    this._pushupState         = 'up';
    this._custState2          = {};
    this._qPhase              = {};
  }

  // === ATUALIZAÇÃO A CADA FRAME ===
  // essa é a função chamada pelo app.js com os pontos do MediaPipe a cada frame
  // retorna o exercício atual, se completou rep, a qualidade e o feedback
  update(landmarks) {
    const result = {
      exercise:     null,
      repCompleted: false,
      quality:      0,
      feedback:     [],
      angles:       {},
      pointsEarned: 0
    };

    if (!landmarks) return result;

    const angles = window.PoseDetector.getKeyAngles(landmarks);
    if (!angles) return result;

    result.angles = angles;

    const gl  = (i) => window.PoseDetector.getLandmark(landmarks, i);
    const vis = (lm, t = 0.5) => window.PoseDetector.isVisible(lm, t);

    // no modo guiado já sei o exercício; no modo livre detecto automaticamente
    if (this._expectedExercise) {
      this.currentExercise = this._expectedExercise;
    } else {
      const detected = this._detectExercise(landmarks, angles, gl, vis);
      if (detected) {
        this._detectionBuffer.push(detected);
        if (this._detectionBuffer.length > this._bufferSize) this._detectionBuffer.shift();
        const stable = this._getMostFrequent(this._detectionBuffer);
        if (stable && stable !== this.currentExercise) this.currentExercise = stable;
      } else {
        this._detectionBuffer.push(null);
        if (this._detectionBuffer.length > this._bufferSize) this._detectionBuffer.shift();
        const stable = this._getMostFrequent(this._detectionBuffer);
        if (!stable) this.currentExercise = null;
      }
    }

    if (!this.currentExercise) {
      result.feedback = ['Posicione-se em frente à câmera'];
      return result;
    }

    result.exercise = {
      name: this.currentExercise,
      type: BUILT_IN_EXERCISES.includes(this.currentExercise) ? 'builtin' : 'custom'
    };

    // chama o processador específico do exercício atual
    let repResult = { repCompleted: false, quality: 0.5, feedback: [] };

    switch (this.currentExercise) {
      case 'Agachamento':
        repResult = this._processSquat(angles, landmarks, gl, vis);
        break;
      case 'Polichinelo':
        repResult = this._processJumpingJack(angles, landmarks, gl, vis);
        break;
      case 'Flexão':
        repResult = this._processPushUp(angles, landmarks, gl, vis);
        break;
      case 'Avanço':
        repResult = this._processLunge(angles, landmarks, gl, vis);
        break;
      case 'Joelho Alto':
        repResult = this._processHighKnees(angles, landmarks, gl, vis);
        break;
      default:
        repResult = this._processCustomExercise(this.currentExercise, angles);
        break;
    }

    // --- contador de rep por qualidade ---
    // conta uma rep sempre que a qualidade sobe acima de 80% e volta abaixo de 40%
    // serve como fallback quando a máquina de estado não detecta (ângulos fora do limiar)
    if (!this._qPhase) this._qPhase = {};
    const qKey = this.currentExercise || '__none__';
    if (!this._qPhase[qKey]) this._qPhase[qKey] = 'rest';

    const q = repResult.quality;
    if (this._qPhase[qKey] === 'rest' && q >= 0.80) {
      this._qPhase[qKey] = 'peak';
    } else if (this._qPhase[qKey] === 'peak' && q < 0.40) {
      this._qPhase[qKey] = 'rest';
      if (!repResult.repCompleted) {
        repResult.repCompleted = true;
        repResult.quality      = 0.80;
      }
    }

    // se completou uma rep (via máquina de estado OU via qualidade), calcula os pontos
    if (repResult.repCompleted) {
      this.repCount++;
      const pts = POINTS[this.currentExercise] || POINTS['custom'];
      let earned = pts.base;
      if (repResult.quality > 0.8) earned += pts.qualityBonus;
      this.totalScore   += earned;
      result.pointsEarned = earned;
      this.qualityScores.push(repResult.quality);
    }

    result.repCompleted = repResult.repCompleted;
    result.quality      = repResult.quality;
    result.feedback     = repResult.feedback;

    return result;
  }

  // === DETECÇÃO AUTOMÁTICA DE EXERCÍCIO ===
  // analisa a posição do corpo e tenta identificar qual exercício está sendo feito
  // a ordem dos ifs importa: coloco os mais específicos primeiro pra evitar falsos positivos
  _detectExercise(landmarks, angles, gl, vis) {
    const lShoulder = gl(window.LANDMARKS.LEFT_SHOULDER);
    const rShoulder = gl(window.LANDMARKS.RIGHT_SHOULDER);
    const lHip      = gl(window.LANDMARKS.LEFT_HIP);
    const rHip      = gl(window.LANDMARKS.RIGHT_HIP);
    const lKnee     = gl(window.LANDMARKS.LEFT_KNEE);
    const rKnee     = gl(window.LANDMARKS.RIGHT_KNEE);
    const lAnkle    = gl(window.LANDMARKS.LEFT_ANKLE);
    const rAnkle    = gl(window.LANDMARKS.RIGHT_ANKLE);
    const lElbow    = gl(window.LANDMARKS.LEFT_ELBOW);
    const rElbow    = gl(window.LANDMARKS.RIGHT_ELBOW);
    const lWrist    = gl(window.LANDMARKS.LEFT_WRIST);
    const rWrist    = gl(window.LANDMARKS.RIGHT_WRIST);
    const nose      = gl(window.LANDMARKS.NOSE);

    // flexão: pessoa está na horizontal (prancha), detectada pelo espalhamento x vs y
    if (vis(lShoulder) && vis(rShoulder) && vis(lHip) && vis(rHip) && vis(lAnkle) && vis(rAnkle)) {
      const midShoulderY  = (lShoulder.y + rShoulder.y) / 2;
      const midHipY       = (lHip.y + rHip.y) / 2;
      const midAnkleY     = (lAnkle.y + rAnkle.y) / 2;
      const midShoulderX  = (lShoulder.x + rShoulder.x) / 2;
      const midAnkleX     = (lAnkle.x + rAnkle.x) / 2;
      const horizontalDist = Math.abs(midShoulderX - midAnkleX);
      const verticalDist   = Math.abs(midShoulderY - midAnkleY);
      const isProne = horizontalDist > 0.25 && verticalDist < 0.35;

      if (isProne && vis(lElbow) && vis(rElbow)) {
        const avgElbow = ((angles.leftElbow || 150) + (angles.rightElbow || 150)) / 2;
        if (avgElbow < 170) return 'Flexão';
      }
    }

    // polichinelo: braços acima da cabeça OU ao lado do corpo + pés juntos/abertos
    if (vis(lWrist) && vis(rWrist) && vis(lShoulder) && vis(rShoulder)) {
      const wristAvgY    = (lWrist.y + rWrist.y) / 2;
      const shoulderAvgY = (lShoulder.y + rShoulder.y) / 2;
      const armsUp       = wristAvgY < shoulderAvgY - 0.05;
      const hipAvgY      = vis(lHip) && vis(rHip) ? (lHip.y + rHip.y) / 2 : null;
      const armsDown     = hipAvgY ? wristAvgY > hipAvgY - 0.05 : wristAvgY > shoulderAvgY + 0.1;
      const feetSpread   = vis(lAnkle) && vis(rAnkle)
        ? Math.abs(lAnkle.x - rAnkle.x) > 0.18
        : false;
      const feetClose    = vis(lAnkle) && vis(rAnkle)
        ? Math.abs(lAnkle.x - rAnkle.x) < 0.18
        : true;

      if ((armsUp && feetSpread) || (armsDown && feetClose)) {
        return 'Polichinelo';
      }
    }

    // joelho alto: um joelho visualmente acima da linha do quadril
    if (vis(lKnee) && vis(lHip) && vis(rKnee) && vis(rHip)) {
      const lKneeHigher = lKnee.y < lHip.y - 0.03;
      const rKneeHigher = rKnee.y < rHip.y - 0.03;
      if (lKneeHigher || rKneeHigher) {
        const avgKneeAngle = ((angles.leftKnee || 180) + (angles.rightKnee || 180)) / 2;
        if (avgKneeAngle > 100) return 'Joelho Alto';
      }
    }

    // avanço: um joelho muito dobrado e o outro estendido (assimetria)
    if (angles.leftKnee !== null && angles.rightKnee !== null) {
      const diff   = Math.abs(angles.leftKnee - angles.rightKnee);
      const oneDown = (angles.leftKnee < 110 && angles.rightKnee > 145) ||
                      (angles.rightKnee < 110 && angles.leftKnee > 145);
      if (oneDown && diff > 40) return 'Avanço';
    }

    // agachamento: ambos os joelhos dobrados de forma simétrica
    if (angles.leftKnee !== null && angles.rightKnee !== null &&
        vis(lKnee) && vis(rKnee)) {
      const avgKnee  = (angles.leftKnee + angles.rightKnee) / 2;
      const kneeDiff = Math.abs(angles.leftKnee - angles.rightKnee);
      if (avgKnee < 170 && kneeDiff < 40) return 'Agachamento';
    }

    // testa exercícios personalizados por último
    if (this.customExercises.length > 0) {
      const customMatch = this._matchCustomExercise(angles);
      if (customMatch) return customMatch;
    }

    return null;
  }

  // === PROCESSAMENTO: AGACHAMENTO ===
  // máquina de estado simples: up → down → up = 1 rep
  _processSquat(angles, landmarks, gl, vis) {
    const result = { repCompleted: false, quality: 1.0, feedback: [] };
    if (angles.leftKnee === null && angles.rightKnee === null) return result;

    const lKnee   = angles.leftKnee  || 170;
    const rKnee   = angles.rightKnee || 170;
    const avgKnee = (lKnee + rKnee) / 2;

    const key = 'squat';
    if (!this._states[key]) {
      this._states[key]       = 'up';
      this._repMinAngles[key] = avgKnee;
    }

    if (avgKnee < this._repMinAngles[key]) {
      this._repMinAngles[key] = avgKnee;
    }

    if (this._states[key] === 'up' && avgKnee < 110) {
      this._states[key] = 'down';
      this._repMinAngles[key] = avgKnee;
    } else if (this._states[key] === 'down' && avgKnee > 160) {
      result.repCompleted = true;

      // avalia a qualidade quando completa a rep
      const issues = [];
      const minReached = this._repMinAngles[key];

      if (minReached > 120) {
        issues.push('Desça mais');
        result.quality -= 0.25;
      }

      const lKneeLM  = gl(window.LANDMARKS.LEFT_KNEE);
      const lAnkleLM = gl(window.LANDMARKS.LEFT_ANKLE);
      const rKneeLM  = gl(window.LANDMARKS.RIGHT_KNEE);
      const rAnkleLM = gl(window.LANDMARKS.RIGHT_ANKLE);

      if (vis(lKneeLM) && vis(lAnkleLM) && lKneeLM.x - lAnkleLM.x > 0.05) {
        issues.push('Joelhos passando dos pés');
        result.quality -= 0.2;
      }
      if (vis(rKneeLM) && vis(rAnkleLM) && rAnkleLM.x - rKneeLM.x > 0.05) {
        issues.push('Joelhos passando dos pés');
        result.quality -= 0.2;
      }

      if (angles.trunkAngle !== null && angles.trunkAngle > 40) {
        issues.push('Incline o tronco menos');
        result.quality -= 0.15;
      }

      result.quality = Math.max(0, Math.min(1, result.quality));
      result.feedback = issues.length === 0
        ? ['Ótimo agachamento! Continue assim.']
        : issues;
      issues.forEach(i => this.issues.add(i));

      this._states[key] = 'up';
      this._repMinAngles[key] = avgKnee;
    } else {
      // qualidade = profundidade do agachamento (0 em pé, 1 em 90°)
      // faz a barra subir conforme o usuário desce, independente de erros de forma
      const depth = Math.max(0, Math.min(1, (170 - avgKnee) / 80));
      result.quality = depth;

      if (avgKnee < 160) {
        if (avgKnee > 110) {
          result.feedback = ['Desça mais — tente chegar a 90°'];
        } else {
          result.feedback = ['Boa posição! Suba agora.'];
        }
      } else {
        result.feedback = ['Inicie o agachamento flexionando os joelhos.'];
      }
    }

    return result;
  }

  // === PROCESSAMENTO: POLICHINELO ===
  // fechado → aberto → fechado = 1 rep
  _processJumpingJack(angles, landmarks, gl, vis) {
    const result = { repCompleted: false, quality: 1.0, feedback: [] };

    const lWrist    = gl(window.LANDMARKS.LEFT_WRIST);
    const rWrist    = gl(window.LANDMARKS.RIGHT_WRIST);
    const lShoulder = gl(window.LANDMARKS.LEFT_SHOULDER);
    const rShoulder = gl(window.LANDMARKS.RIGHT_SHOULDER);
    const lHip      = gl(window.LANDMARKS.LEFT_HIP);
    const rHip      = gl(window.LANDMARKS.RIGHT_HIP);
    const lAnkle    = gl(window.LANDMARKS.LEFT_ANKLE);
    const rAnkle    = gl(window.LANDMARKS.RIGHT_ANKLE);

    if (!vis(lWrist) || !vis(rWrist) || !vis(lShoulder) || !vis(rShoulder)) {
      result.feedback = ['Garanta que os braços estejam visíveis'];
      return result;
    }

    const wristAvgY    = (lWrist.y + rWrist.y) / 2;
    const shoulderAvgY = (lShoulder.y + rShoulder.y) / 2;
    const hipAvgY      = vis(lHip) && vis(rHip) ? (lHip.y + rHip.y) / 2 : shoulderAvgY + 0.2;
    const footSpread   = vis(lAnkle) && vis(rAnkle) ? Math.abs(lAnkle.x - rAnkle.x) : 0;

    const armsUp     = wristAvgY < shoulderAvgY - 0.1;
    const armsDown   = wristAvgY > hipAvgY - 0.05;
    const feetOpen   = footSpread > 0.25;
    const feetClosed = footSpread < 0.15;

    const isOpen   = armsUp && feetOpen;
    const isClosed = armsDown && feetClosed;

    if (this._jjState === 'closed' && isOpen) {
      this._jjState  = 'open';
      this._jjOpened = true;
    } else if (this._jjState === 'open' && isClosed && this._jjOpened) {
      result.repCompleted = true;
      this._jjState  = 'closed';
      this._jjOpened = false;

      // mede a simetria dos braços e pernas pra calcular a qualidade
      const wristLeftY   = lWrist.y;
      const wristRightY  = rWrist.y;
      const armsSymmetry = 1 - Math.min(Math.abs(wristLeftY - wristRightY) * 5, 0.5);
      const legSymmetry  = vis(lAnkle) && vis(rAnkle)
        ? 1 - Math.min(Math.abs((lAnkle.x - lShoulder.x) - (rShoulder.x - rAnkle.x)) * 3, 0.4)
        : 0.7;

      result.quality  = (armsSymmetry + legSymmetry) / 2;
      result.feedback = result.quality > 0.8
        ? ['Excelente polichinelo!']
        : ['Tente abrir mais os braços e as pernas simetricamente.'];
    } else {
      // qualidade = abertura da posição (0 fechado, 1 totalmente aberto)
      const armQ  = armsUp ? 1.0 : Math.max(0, 1 - (wristAvgY - shoulderAvgY) / 0.15);
      const feetQ = Math.min(1, footSpread / 0.28);
      result.quality = Math.max(0, Math.min(1, (armQ + feetQ) / 2));

      if (this._jjState === 'closed') {
        result.feedback = ['Abra os braços e pernas ao mesmo tempo.'];
      } else {
        result.feedback = ['Feche os braços e pernas para completar.'];
      }
    }

    return result;
  }

  // === PROCESSAMENTO: FLEXÃO ===
  // cotovelos esticados → dobrados → esticados = 1 rep
  _processPushUp(angles, landmarks, gl, vis) {
    const result = { repCompleted: false, quality: 1.0, feedback: [] };

    const lElbow   = angles.leftElbow  || 170;
    const rElbow   = angles.rightElbow || 170;
    const avgElbow = (lElbow + rElbow) / 2;

    const lHip      = gl(window.LANDMARKS.LEFT_HIP);
    const rHip      = gl(window.LANDMARKS.RIGHT_HIP);
    const lShoulder = gl(window.LANDMARKS.LEFT_SHOULDER);
    const rShoulder = gl(window.LANDMARKS.RIGHT_SHOULDER);
    const lAnkle    = gl(window.LANDMARKS.LEFT_ANKLE);
    const rAnkle    = gl(window.LANDMARKS.RIGHT_ANKLE);

    const key = 'pushup';
    if (!this._states[key]) {
      this._states[key]       = 'up';
      this._repMinAngles[key] = avgElbow;
    }

    if (avgElbow < this._repMinAngles[key]) {
      this._repMinAngles[key] = avgElbow;
    }

    if (this._states[key] === 'up' && avgElbow < 100) {
      this._states[key] = 'down';
      this._repMinAngles[key] = avgElbow;
    } else if (this._states[key] === 'down' && avgElbow > 150) {
      result.repCompleted = true;
      this._states[key]   = 'up';

      const issues = [];

      // verifica o alinhamento do corpo – o quadril não pode estar muito alto ou baixo
      if (vis(lHip, 0.4) && vis(lShoulder, 0.4) && vis(lAnkle, 0.4)) {
        const midHipY      = (lHip.y + rHip.y) / 2;
        const midShoulderY = (lShoulder.y + rShoulder.y) / 2;
        const midAnkleY    = (lAnkle.y + rAnkle.y) / 2;
        const expectedHipY = (midShoulderY + midAnkleY) / 2;
        const sag = midHipY - expectedHipY;

        if (sag > 0.06) {
          issues.push('Quadril muito baixo – contraia o abdômen');
          result.quality -= 0.25;
        } else if (sag < -0.06) {
          issues.push('Quadril muito alto – alinhe o corpo');
          result.quality -= 0.2;
        }
      }

      if (this._repMinAngles[key] > 115) {
        issues.push('Desça mais – aproxime o peito do chão');
        result.quality -= 0.2;
      }

      result.quality  = Math.max(0, Math.min(1, result.quality));
      result.feedback = issues.length === 0 ? ['Ótima flexão!'] : issues;
      issues.forEach(i => this.issues.add(i));
      this._repMinAngles[key] = avgElbow;
    } else {
      // qualidade = profundidade da flexão (0 com cotovelos esticados, 1 com cotovelos dobrados a 90°)
      const depth = Math.max(0, Math.min(1, (170 - avgElbow) / 80));
      result.quality  = depth;
      result.feedback = this._states[key] === 'up'
        ? ['Flexione os cotovelos para descer.']
        : ['Empurre para cima para completar a repetição.'];
    }

    return result;
  }

  // === PROCESSAMENTO: AVANÇO ===
  // em pé → joelho esquerdo/direito abaixo → em pé = 1 rep
  _processLunge(angles, landmarks, gl, vis) {
    const result = { repCompleted: false, quality: 1.0, feedback: [] };

    const lKnee = angles.leftKnee;
    const rKnee = angles.rightKnee;
    if (lKnee === null || rKnee === null) return result;

    const key = 'lunge';
    if (!this._states[key]) this._states[key] = 'standing';

    const leftDown  = lKnee < 110 && rKnee > 145;
    const rightDown = rKnee < 110 && lKnee > 145;
    const standing  = lKnee > 160 && rKnee > 160;

    if (standing) {
      if (this._states[key] === 'left' || this._states[key] === 'right') {
        result.repCompleted = true;

        const activeKnee = this._states[key] === 'left' ? lKnee : rKnee;
        const issues = [];
        if (activeKnee > 115) {
          issues.push('Desça mais no avanço – tente 90°');
          result.quality -= 0.25;
        }
        result.quality  = Math.max(0, result.quality);
        result.feedback = issues.length === 0 ? ['Ótimo avanço!'] : issues;
        issues.forEach(i => this.issues.add(i));
        this._lungeLastSide = this._states[key];
      }
      this._states[key] = 'standing';
    } else if (leftDown && this._states[key] === 'standing') {
      this._states[key] = 'left';
      result.feedback   = ['Avanço esquerdo – volte para a posição inicial.'];
    } else if (rightDown && this._states[key] === 'standing') {
      this._states[key] = 'right';
      result.feedback   = ['Avanço direito – volte para a posição inicial.'];
    } else if (leftDown || rightDown) {
      // qualidade = profundidade do avanço (0 em pé, 1 com joelho a 90°)
      const activeKnee = leftDown ? lKnee : rKnee;
      result.quality  = Math.max(0, Math.min(1, (170 - activeKnee) / 80));
      result.feedback = ['Volte para a posição inicial.'];
    } else {
      result.quality  = 0.0;
      result.feedback = ['Dê um passo à frente para iniciar o avanço.'];
    }

    return result;
  }

  // === PROCESSAMENTO: JOELHO ALTO ===
  // alterna joelho esquerdo e direito acima da linha do quadril
  _processHighKnees(angles, landmarks, gl, vis) {
    const result = { repCompleted: false, quality: 1.0, feedback: [] };

    const lKnee = gl(window.LANDMARKS.LEFT_KNEE);
    const rKnee = gl(window.LANDMARKS.RIGHT_KNEE);
    const lHip  = gl(window.LANDMARKS.LEFT_HIP);
    const rHip  = gl(window.LANDMARKS.RIGHT_HIP);

    if (!vis(lKnee) || !vis(rKnee) || !vis(lHip) || !vis(rHip)) {
      result.feedback = ['Garanta que os joelhos e quadril estejam visíveis.'];
      return result;
    }

    const lRaised = lKnee.y < lHip.y - 0.05;
    const rRaised = rKnee.y < rHip.y - 0.05;

    const key = 'hk';
    if (!this._states[key]) this._states[key] = 'none';

    if (lRaised && this._states[key] !== 'left') {
      if (this._states[key] === 'right' || this._states[key] === 'none') {
        if (this._states[key] === 'right') {
          result.repCompleted = true;
          const hipHeight = lHip.y - lKnee.y;
          result.quality  = Math.min(1, hipHeight / 0.12);
          result.feedback = result.quality > 0.8
            ? ['Joelho alto – ótima elevação!']
            : ['Eleve mais o joelho.'];
        }
        this._states[key] = 'left';
      }
    } else if (rRaised && this._states[key] !== 'right') {
      if (this._states[key] === 'left' || this._states[key] === 'none') {
        if (this._states[key] === 'left') {
          result.repCompleted = true;
          const hipHeight = rHip.y - rKnee.y;
          result.quality  = Math.min(1, hipHeight / 0.12);
          result.feedback = result.quality > 0.8
            ? ['Joelho alto – ótima alternância!']
            : ['Eleve mais o joelho.'];
        }
        this._states[key] = 'right';
      }
    } else if (!lRaised && !rRaised) {
      this._states[key] = 'none';
      result.quality  = 0.0;
      result.feedback = ['Eleve o joelho acima do quadril.'];
    }

    // em todos os casos, mostrar a qualidade proporcional à altura do joelho
    if (!result.repCompleted) {
      const activeKnee   = lRaised ? lKnee : (rRaised ? rKnee : null);
      const activeHip    = lRaised ? lHip  : (rRaised ? rHip  : null);
      if (activeKnee && activeHip) {
        result.quality = Math.min(1, Math.max(0, (activeHip.y - activeKnee.y) / 0.12));
      }
    }

    return result;
  }

  // === PROCESSAMENTO: EXERCÍCIO PERSONALIZADO ===
  // esse foi o mais difícil de fazer – precisa calibrar em tempo real qual articulação se move
  // fase 1: calibra por 15 frames capturando a posição inicial do usuário
  // fase 2: detecta a oscilação em relação ao template gravado
  _processCustomExercise(name, angles) {
    const result = { repCompleted: false, quality: 0.7, feedback: [] };

    const template = this.customExercises.find(e => e.name === name);
    if (!template?.angleTemplate) {
      result.feedback = [`Executando: ${name}`];
      return result;
    }

    if (!this._custState2) this._custState2 = {};
    let s = this._custState2[name];

    // fase de calibração: captura 15 frames pra descobrir a posição de repouso do usuário
    if (!s) {
      this._custState2[name] = s = { phase: 'cal', frames: [] };
    }

    if (s.phase === 'cal') {
      const KEYS = ['leftKnee','rightKnee','leftHip','rightHip','leftElbow','rightElbow'];
      const snap = {};
      for (const k of KEYS) if (angles[k] != null) snap[k] = angles[k];
      s.frames.push(snap);

      if (s.frames.length < 15) {
        result.feedback = [`${name}: calibrando... ${s.frames.length}/15`];
        return result;
      }

      // média dos frames capturados = posição de repouso do usuário
      const initial = {};
      for (const k of KEYS) {
        const vals = s.frames.map(f => f[k]).filter(v => v != null);
        if (vals.length) initial[k] = vals.reduce((a,b)=>a+b,0)/vals.length;
      }

      // descobre qual articulação se move mais em direção ao template
      let primaryKey = null, maxDiff = 0;
      for (const k of KEYS) {
        if (initial[k] != null && template.angleTemplate[k] != null) {
          const diff = Math.abs(initial[k] - template.angleTemplate[k]);
          if (diff > maxDiff) { maxDiff = diff; primaryKey = k; }
        }
      }

      if (!primaryKey || maxDiff < 10) {
        // sem eixo principal claro, usa o método de distância euclidiana
        s.phase    = 'dist';
        s.initial  = initial;
        result.feedback = [`${name}: pronto! Execute o movimento.`];
        return result;
      }

      s.primaryKey = primaryKey;
      s.midpoint   = (initial[primaryKey] + template.angleTemplate[primaryKey]) / 2;
      s.goingDown  = template.angleTemplate[primaryKey] < initial[primaryKey];
      s.phase      = 'track';
      s.repPhase   = 'rest';
      result.feedback = [`${name}: pronto! Execute o movimento.`];
      return result;
    }

    // rastreamento pelo eixo principal: cruza o ponto médio pra contar a rep
    if (s.phase === 'track') {
      const val = angles[s.primaryKey];
      if (val == null) {
        result.feedback = ['Garanta que o corpo esteja visível'];
        return result;
      }

      const atPeak = s.goingDown ? val < s.midpoint : val > s.midpoint;

      if (s.repPhase === 'rest' && atPeak) {
        s.repPhase = 'peak';
        result.feedback = [`${name}: posição! Volte ao início.`];
      } else if (s.repPhase === 'peak' && !atPeak) {
        result.repCompleted = true;
        result.quality = 0.8;
        result.feedback = [`${name}: repetição! ✓`];
        s.repPhase = 'rest';
      } else {
        result.feedback = [atPeak ? `${name}: volte ao início` : `${name}: execute o movimento`];
      }
      return result;
    }

    // fallback: distância euclidiana quando não tem eixo principal claro
    const dist       = this._angleDistance(angles, template.angleTemplate);
    const distToInit = s.initial ? this._angleDistance(angles, s.initial) : 1;
    if (!s.distPhase) s.distPhase = 'rest';

    if (s.distPhase === 'rest' && dist < 0.25) {
      s.distPhase = 'peak';
      result.feedback = [`${name}: posição! Volte ao início.`];
    } else if (s.distPhase === 'peak' && dist > 0.30) {
      result.repCompleted = true;
      result.quality = 0.7;
      result.feedback = [`${name}: repetição! ✓`];
      s.distPhase = 'rest';
    } else {
      result.feedback = [dist < 0.25 ? `${name}: volte ao início` : `${name}: execute o movimento`];
    }
    return result;
  }

  // compara os ângulos atuais com o template do exercício personalizado
  // usa os 6 ângulos mais estáveis pra calcular a distância euclidiana normalizada
  _matchCustomExercise(angles) {
    let bestMatch = null;
    let bestDist  = 0.25; // limiar máximo

    for (const ex of this.customExercises) {
      if (!ex.angleTemplate) continue;
      const dist = this._angleDistance(angles, ex.angleTemplate);
      if (dist < bestDist) {
        bestDist  = dist;
        bestMatch = ex.name;
      }
    }

    return bestMatch;
  }

  // distância euclidiana entre dois conjuntos de ângulos (normalizada por 180°)
  _angleDistance(a, b) {
    const keys = ['leftKnee', 'rightKnee', 'leftHip', 'rightHip', 'leftElbow', 'rightElbow'];
    let sum = 0;
    let count = 0;
    for (const k of keys) {
      if (a[k] !== null && a[k] !== undefined && b[k] !== null && b[k] !== undefined) {
        const diff = (a[k] - b[k]) / 180;
        sum += diff * diff;
        count++;
      }
    }
    return count > 0 ? Math.sqrt(sum / count) : 1;
  }

  // retorna o valor mais frequente no array; exige pelo menos 2 ocorrências pra ser estável
  _getMostFrequent(arr) {
    const freq = {};
    let maxVal = null;
    let maxCount = 0;
    for (const v of arr) {
      if (v === null) continue;
      freq[v] = (freq[v] || 0) + 1;
      if (freq[v] > maxCount) { maxCount = freq[v]; maxVal = v; }
    }
    return maxCount >= 2 ? maxVal : null;
  }

  // retorna o resumo das estatísticas do classificador
  getStats() {
    return {
      repCount:   this.repCount,
      totalScore: this.totalScore,
      avgQuality: this.qualityScores.length > 0
        ? this.qualityScores.reduce((a, b) => a + b, 0) / this.qualityScores.length
        : 0,
      issues: Array.from(this.issues)
    };
  }
}

// === GRAVADOR DE EXERCÍCIOS ===
// grava um exercício personalizado: captura os ângulos por alguns segundos
// e produz um template que o classificador usa pra reconhecer o movimento no futuro
class ExerciseRecorder {
  constructor() {
    this.name            = '';
    this.frames          = [];
    this._landmarkFrames = [];
    this.recording       = false;
  }

  startRecording(name) {
    this.name            = name;
    this.frames          = [];
    this._landmarkFrames = [];
    this.recording       = true;
  }

  // chamado a cada frame durante a gravação – guarda os ângulos e os pontos pra animação 3D
  addFrame(angles, landmarks) {
    if (!this.recording || !angles) return;

    const keys = ['leftKnee', 'rightKnee', 'leftHip', 'rightHip', 'leftElbow', 'rightElbow'];
    const frame = {};
    for (const k of keys) {
      frame[k] = angles[k] !== null && angles[k] !== undefined ? angles[k] : null;
    }
    this.frames.push(frame);

    // salva os pontos do corpo em formato compacto pra reproduzir no personagem 3D depois
    if (landmarks && window.LANDMARKS) {
      const L    = window.LANDMARKS;
      const snap = {};
      const save = (key, idx) => {
        const lm = landmarks[idx];
        if (lm && (lm.visibility === undefined || lm.visibility > 0.3)) {
          snap[key] = { x: Math.round(lm.x * 1000) / 1000, y: Math.round(lm.y * 1000) / 1000 };
        }
      };
      save('nose', L.NOSE);
      save('lS',   L.LEFT_SHOULDER);
      save('rS',   L.RIGHT_SHOULDER);
      save('lE',   L.LEFT_ELBOW);
      save('rE',   L.RIGHT_ELBOW);
      save('lW',   L.LEFT_WRIST);
      save('rW',   L.RIGHT_WRIST);
      save('lH',   L.LEFT_HIP);
      save('rH',   L.RIGHT_HIP);
      save('lK',   L.LEFT_KNEE);
      save('rK',   L.RIGHT_KNEE);
      save('lA',   L.LEFT_ANKLE);
      save('rA',   L.RIGHT_ANKLE);
      this._landmarkFrames.push(snap);
    }
  }

  // finaliza a gravação e calcula o template do exercício
  // retorna o objeto pronto pra salvar no Firebase
  stopRecording() {
    this.recording = false;
    if (this.frames.length === 0) return null;

    const keys = ['leftKnee', 'rightKnee', 'leftHip', 'rightHip', 'leftElbow', 'rightElbow'];

    // média de um slice de frames
    const avgFrames = (slice) => {
      const out = {};
      for (const k of keys) {
        const vals = slice.map(f => f[k]).filter(v => v !== null && v !== undefined);
        out[k] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      }
      return out;
    };

    // template geral = média de todos os frames
    const angleTemplate = avgFrames(this.frames);

    // frame de pico = o frame mais diferente da posição neutra em pé
    const NEUTRAL = {leftKnee:170, rightKnee:170, leftHip:170, rightHip:170, leftElbow:165, rightElbow:165};
    let maxDev = -1, peakIdx = 0;
    this.frames.forEach((f, i) => {
      const dev = keys.reduce((s, k) => {
        const v = f[k] ?? NEUTRAL[k];
        return s + (v - NEUTRAL[k]) ** 2;
      }, 0);
      if (dev > maxDev) { maxDev = dev; peakIdx = i; }
    });
    const lo = Math.max(0, peakIdx - 3);
    const hi = Math.min(this.frames.length, peakIdx + 4);
    const peakAngles = avgFrames(this.frames.slice(lo, hi));

    // dados de animação 3D a partir dos pontos gravados
    let animFrames  = null;
    let motionRange = null;

    if (this._landmarkFrames.length >= 5) {
      const src = this._landmarkFrames;

      // limita a 30 frames pra não encher o Firestore
      const TARGET = Math.min(src.length, 30);
      animFrames = [];
      for (let i = 0; i < TARGET; i++) {
        animFrames.push(src[Math.floor(i * src.length / TARGET)]);
      }

      // calcula o range de movimento de cada articulação
      const jKeys = ['nose','lS','rS','lE','rE','lW','rW','lH','rH','lK','rK','lA','rA'];
      motionRange = {};
      for (const k of jKeys) {
        const xs = animFrames.map(f => f[k]?.x).filter(v => v != null);
        const ys = animFrames.map(f => f[k]?.y).filter(v => v != null);
        if (xs.length < 2) { motionRange[k] = 0; continue; }
        const rx = Math.max(...xs) - Math.min(...xs);
        const ry = Math.max(...ys) - Math.min(...ys);
        motionRange[k] = Math.round(Math.max(rx, ry) * 1000) / 1000;
      }
    }

    const template = {
      name:          this.name,
      angleTemplate,
      peakAngles,
      signature:     this._computeSignature(angleTemplate),
      frameCount:    this.frames.length,
      createdAt:     new Date().toISOString()
    };

    if (animFrames) {
      template.animFrames  = animFrames;
      template.motionRange = motionRange;
    }

    this.frames          = [];
    this._landmarkFrames = [];
    return template;
  }

  // gera uma string identificadora do template (pra debug)
  _computeSignature(template) {
    const keys = ['leftKnee', 'rightKnee', 'leftHip', 'rightHip', 'leftElbow', 'rightElbow'];
    return keys.map(k => template[k] !== null ? Math.round(template[k]) : 'X').join('-');
  }

  get frameCount() {
    return this.frames.length;
  }
}

window.ExerciseClassifier = ExerciseClassifier;
window.ExerciseRecorder   = ExerciseRecorder;
