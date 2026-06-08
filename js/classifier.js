/**
 * classifier.js – Exercise classification and rep counting.
 * Loaded as a regular script (no ES modules).
 * Depends on pose.js being loaded first (uses window.PoseDetector, window.LANDMARKS).
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const BUILT_IN_EXERCISES = ['Agachamento', 'Polichinelo', 'Flexão', 'Avanço', 'Joelho Alto'];

// Points per rep for each exercise
const POINTS = {
  'Agachamento': { base: 10, qualityBonus: 5 },
  'Polichinelo':  { base: 8,  qualityBonus: 3 },
  'Flexão':       { base: 15, qualityBonus: 7 },
  'Avanço':       { base: 10, qualityBonus: 4 },
  'Joelho Alto':  { base: 5,  qualityBonus: 2 },
  'custom':       { base: 8,  qualityBonus: 3 }
};

// ════════════════════════════════════════════════════════════════════════════
// ExerciseClassifier
// ════════════════════════════════════════════════════════════════════════════
class ExerciseClassifier {
  constructor() {
    this.customExercises = []; // [{name, angleTemplate, signature}]
    this.reset();
  }

  reset() {
    this._expectedExercise = null; // guided mode: skip auto-detection
    // Current exercise tracking
    this.currentExercise = null;
    this.repCount        = 0;
    this.totalScore      = 0;
    this.qualityScores   = [];
    this.issues          = new Set();

    // Per-exercise state machines
    this._states = {};
    this._repMinAngles = {};   // track lowest angle per rep cycle
    this._repMaxAngles = {};   // track highest angle per rep cycle
    this._lastRep      = {};   // timestamp of last counted rep per exercise

    // Consecutive detection frames for stability
    this._detectionBuffer = [];
    this._bufferSize = 5;

    // Jumping jack specific
    this._jjState     = 'closed'; // 'closed' | 'open'
    this._jjOpened    = false;

    // Lunge specific
    this._lungeLastSide = null;

    // High knees specific
    this._hkLastLeg = null;

    // Push-up specific
    this._pushupState = 'up';
  }

  setCustomExercises(list) {
    this.customExercises = list || [];
  }

  // Guided mode: skip auto-detection and track only this exercise
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
  }

  // ── update ─────────────────────────────────────────────────────────────────
  /**
   * Main entry point: called each frame with MediaPipe landmarks.
   * Returns classification result.
   *
   * @param {Array}  landmarks  – MediaPipe poseLandmarks array
   * @returns {{
   *   exercise: {name: string, type: string} | null,
   *   repCompleted: boolean,
   *   quality: number,       // 0-1
   *   feedback: string[],
   *   angles: Object,
   *   pointsEarned: number
   * }}
   */
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

    const gl = (i) => window.PoseDetector.getLandmark(landmarks, i);
    const vis = (lm, t = 0.5) => window.PoseDetector.isVisible(lm, t);

    // ── Guided mode: use expected exercise directly (skip auto-detection) ──
    if (this._expectedExercise) {
      this.currentExercise = this._expectedExercise;
    } else {
      // ── Auto-detect mode ──
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

    // ── Run rep counter + quality for the current exercise ──
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

  // ── _detectExercise ────────────────────────────────────────────────────────
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

    // ── Push-up detection (person horizontal) ──
    // When person is in plank: hips are between shoulder y and ankle y,
    // and trunk is roughly horizontal (y-spread is small relative to x-spread)
    if (vis(lShoulder) && vis(rShoulder) && vis(lHip) && vis(rHip) && vis(lAnkle) && vis(rAnkle)) {
      const midShoulderY = (lShoulder.y + rShoulder.y) / 2;
      const midHipY      = (lHip.y + rHip.y) / 2;
      const midAnkleY    = (lAnkle.y + rAnkle.y) / 2;
      const midShoulderX = (lShoulder.x + rShoulder.x) / 2;
      const midAnkleX    = (lAnkle.x + rAnkle.x) / 2;
      const horizontalDist = Math.abs(midShoulderX - midAnkleX);
      const verticalDist   = Math.abs(midShoulderY - midAnkleY);
      // Person is horizontal if they span more X than Y
      const isProne = horizontalDist > 0.25 && verticalDist < 0.35;

      if (isProne && vis(lElbow) && vis(rElbow)) {
        const avgElbow = ((angles.leftElbow || 150) + (angles.rightElbow || 150)) / 2;
        if (avgElbow < 170) return 'Flexão';
      }
    }

    // ── Jumping Jack (arms above head or wrists near hips) ──
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

    // ── High Knees (knee raised high) ──
    if (vis(lKnee) && vis(lHip) && vis(rKnee) && vis(rHip)) {
      const lKneeHigher = lKnee.y < lHip.y - 0.03;
      const rKneeHigher = rKnee.y < rHip.y - 0.03;
      if (lKneeHigher || rKneeHigher) {
        // Make sure person is standing (not squatting)
        const avgKneeAngle = ((angles.leftKnee || 180) + (angles.rightKnee || 180)) / 2;
        if (avgKneeAngle > 100) return 'Joelho Alto';
      }
    }

    // ── Lunge (one knee deeply bent, other extended) ──
    if (angles.leftKnee !== null && angles.rightKnee !== null) {
      const diff = Math.abs(angles.leftKnee - angles.rightKnee);
      const oneDown = (angles.leftKnee < 110 && angles.rightKnee > 145) ||
                      (angles.rightKnee < 110 && angles.leftKnee > 145);
      if (oneDown && diff > 40) return 'Avanço';
    }

    // ── Squat (both knees visible, bending symmetrically) ──
    if (angles.leftKnee !== null && angles.rightKnee !== null &&
        vis(lKnee) && vis(rKnee)) {
      const avgKnee = (angles.leftKnee + angles.rightKnee) / 2;
      const kneeDiff = Math.abs(angles.leftKnee - angles.rightKnee);
      // Both knees bending, roughly symmetrically
      if (avgKnee < 170 && kneeDiff < 40) return 'Agachamento';
    }

    // ── Custom exercise matching ──
    if (this.customExercises.length > 0) {
      const customMatch = this._matchCustomExercise(angles);
      if (customMatch) return customMatch;
    }

    return null;
  }

  // ── _processSquat ─────────────────────────────────────────────────────────
  _processSquat(angles, landmarks, gl, vis) {
    const result = { repCompleted: false, quality: 1.0, feedback: [] };
    if (angles.leftKnee === null && angles.rightKnee === null) return result;

    const lKnee = angles.leftKnee   || 170;
    const rKnee = angles.rightKnee  || 170;
    const avgKnee = (lKnee + rKnee) / 2;

    const key = 'squat';
    if (!this._states[key]) {
      this._states[key]      = 'up';
      this._repMinAngles[key] = avgKnee;
    }

    // Track minimum angle reached this cycle
    if (avgKnee < this._repMinAngles[key]) {
      this._repMinAngles[key] = avgKnee;
    }

    // State machine
    if (this._states[key] === 'up' && avgKnee < 110) {
      this._states[key] = 'down';
      this._repMinAngles[key] = avgKnee;
    } else if (this._states[key] === 'down' && avgKnee > 160) {
      // Rep completed (down → up)
      result.repCompleted = true;

      // Quality assessment
      const issues = [];
      const minReached = this._repMinAngles[key];

      if (minReached > 120) {
        issues.push('Desça mais');
        result.quality -= 0.25;
      }

      // Check knee over toe
      const lKneeLM = gl(window.LANDMARKS.LEFT_KNEE);
      const lAnkleLM = gl(window.LANDMARKS.LEFT_ANKLE);
      const rKneeLM = gl(window.LANDMARKS.RIGHT_KNEE);
      const rAnkleLM = gl(window.LANDMARKS.RIGHT_ANKLE);

      if (vis(lKneeLM) && vis(lAnkleLM) && lKneeLM.x - lAnkleLM.x > 0.05) {
        issues.push('Joelhos passando dos pés');
        result.quality -= 0.2;
      }
      if (vis(rKneeLM) && vis(rAnkleLM) && rAnkleLM.x - rKneeLM.x > 0.05) {
        issues.push('Joelhos passando dos pés');
        result.quality -= 0.2;
      }

      // Trunk angle
      if (angles.trunkAngle !== null && angles.trunkAngle > 40) {
        issues.push('Incline o tronco menos');
        result.quality -= 0.15;
      }

      result.quality = Math.max(0, Math.min(1, result.quality));
      result.feedback = issues.length === 0
        ? ['Ótimo agachamento! Continue assim.']
        : issues;
      issues.forEach(i => this.issues.add(i));

      // Reset
      this._states[key] = 'up';
      this._repMinAngles[key] = avgKnee;
    } else {
      // Real-time form quality during movement
      let rtQ = 1.0;
      const lKneeLM  = gl(window.LANDMARKS.LEFT_KNEE);
      const lAnkleLM = gl(window.LANDMARKS.LEFT_ANKLE);
      const rKneeLM  = gl(window.LANDMARKS.RIGHT_KNEE);
      const rAnkleLM = gl(window.LANDMARKS.RIGHT_ANKLE);
      if (vis(lKneeLM) && vis(lAnkleLM) && lKneeLM.x - lAnkleLM.x > 0.05) rtQ -= 0.25;
      if (vis(rKneeLM) && vis(rAnkleLM) && rAnkleLM.x - rKneeLM.x > 0.05) rtQ -= 0.25;
      if (angles.trunkAngle !== null && angles.trunkAngle > 40) rtQ -= 0.2;
      result.quality = Math.max(0, Math.min(1, rtQ));

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

  // ── _processJumpingJack ───────────────────────────────────────────────────
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

    const armsUp   = wristAvgY < shoulderAvgY - 0.1;
    const armsDown = wristAvgY > hipAvgY - 0.05;
    const feetOpen = footSpread > 0.25;
    const feetClosed = footSpread < 0.15;

    const isOpen   = armsUp && feetOpen;
    const isClosed = armsDown && feetClosed;

    // State: closed → open → closed = 1 rep
    if (this._jjState === 'closed' && isOpen) {
      this._jjState  = 'open';
      this._jjOpened = true;
    } else if (this._jjState === 'open' && isClosed && this._jjOpened) {
      result.repCompleted = true;
      this._jjState  = 'closed';
      this._jjOpened = false;

      // Quality
      const wristLeftY    = lWrist.y;
      const wristRightY   = rWrist.y;
      const armsSymmetry  = 1 - Math.min(Math.abs(wristLeftY - wristRightY) * 5, 0.5);
      const legSymmetry   = vis(lAnkle) && vis(rAnkle)
        ? 1 - Math.min(Math.abs((lAnkle.x - lShoulder.x) - (rShoulder.x - rAnkle.x)) * 3, 0.4)
        : 0.7;

      result.quality = (armsSymmetry + legSymmetry) / 2;
      result.feedback = result.quality > 0.8
        ? ['Excelente polichinelo!']
        : ['Tente abrir mais os braços e as pernas simetricamente.'];
    } else {
      // Real-time symmetry quality
      let rtQ = 1.0;
      if (vis(lWrist) && vis(rWrist)) {
        rtQ -= Math.min(Math.abs(lWrist.y - rWrist.y) * 5, 0.4);
      }
      if (vis(lAnkle) && vis(rAnkle) && vis(lShoulder) && vis(rShoulder)) {
        const legAsym = Math.abs((lAnkle.x - lShoulder.x) - (rShoulder.x - rAnkle.x));
        rtQ -= Math.min(legAsym * 3, 0.3);
      }
      result.quality = Math.max(0, Math.min(1, rtQ));

      if (this._jjState === 'closed') {
        result.feedback = ['Abra os braços e pernas ao mesmo tempo.'];
      } else {
        result.feedback = ['Feche os braços e pernas para completar.'];
      }
    }

    return result;
  }

  // ── _processPushUp ────────────────────────────────────────────────────────
  _processPushUp(angles, landmarks, gl, vis) {
    const result = { repCompleted: false, quality: 1.0, feedback: [] };

    const lElbow = angles.leftElbow  || 170;
    const rElbow = angles.rightElbow || 170;
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
      this._states[key] = 'up';

      const issues = [];

      // Body alignment – hip should be in line
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

      result.quality = Math.max(0, Math.min(1, result.quality));
      result.feedback = issues.length === 0 ? ['Ótima flexão!'] : issues;
      issues.forEach(i => this.issues.add(i));
      this._repMinAngles[key] = avgElbow;
    } else {
      // Real-time body alignment quality
      let rtQ = 1.0;
      if (vis(lHip, 0.4) && vis(lShoulder, 0.4) && vis(lAnkle, 0.4)) {
        const midHipY      = (lHip.y + rHip.y) / 2;
        const midShoulderY = (lShoulder.y + rShoulder.y) / 2;
        const midAnkleY    = (lAnkle.y + rAnkle.y) / 2;
        const sag = midHipY - (midShoulderY + midAnkleY) / 2;
        if (Math.abs(sag) > 0.04) rtQ -= Math.min(Math.abs(sag) * 5, 0.4);
      }
      result.quality = Math.max(0, Math.min(1, rtQ));
      result.feedback = this._states[key] === 'up'
        ? ['Flexione os cotovelos para descer.']
        : ['Empurre para cima para completar a repetição.'];
    }

    return result;
  }

  // ── _processLunge ─────────────────────────────────────────────────────────
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

        // Quality
        const activeKnee = this._states[key] === 'left' ? lKnee : rKnee;
        const issues = [];
        if (activeKnee > 115) {
          issues.push('Desça mais no avanço – tente 90°');
          result.quality -= 0.25;
        }
        result.quality = Math.max(0, result.quality);
        result.feedback = issues.length === 0 ? ['Ótimo avanço!'] : issues;
        issues.forEach(i => this.issues.add(i));
        this._lungeLastSide = this._states[key];
      }
      this._states[key] = 'standing';
    } else if (leftDown && this._states[key] === 'standing') {
      this._states[key] = 'left';
      result.feedback = ['Avanço esquerdo – volte para a posição inicial.'];
    } else if (rightDown && this._states[key] === 'standing') {
      this._states[key] = 'right';
      result.feedback = ['Avanço direito – volte para a posição inicial.'];
    } else if (leftDown || rightDown) {
      // Real-time lunge quality while holding the position
      let rtQ = 1.0;
      const activeKnee = leftDown ? lKnee : rKnee;
      if (activeKnee > 115) rtQ -= 0.3;
      if (angles.trunkAngle !== null && angles.trunkAngle > 20) rtQ -= 0.2;
      result.quality = Math.max(0, Math.min(1, rtQ));
      result.feedback = ['Volte para a posição inicial.'];
    } else {
      result.quality = 1.0;
      result.feedback = ['Dê um passo à frente para iniciar o avanço.'];
    }

    return result;
  }

  // ── _processHighKnees ─────────────────────────────────────────────────────
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
          result.quality = Math.min(1, hipHeight / 0.12);
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
          result.quality = Math.min(1, hipHeight / 0.12);
          result.feedback = result.quality > 0.8
            ? ['Joelho alto – ótima alternância!']
            : ['Eleve mais o joelho.'];
        }
        this._states[key] = 'right';
      }
    } else if (!lRaised && !rRaised) {
      this._states[key] = 'none';
      result.quality = 0.3;
      result.feedback = ['Eleve o joelho acima do quadril.'];
    }

    return result;
  }

  // ── _processCustomExercise ────────────────────────────────────────────────
  _processCustomExercise(name, angles) {
    const result = { repCompleted: false, quality: 0.7, feedback: [] };

    const template = this.customExercises.find(e => e.name === name);
    if (!template || !template.angleTemplate) {
      result.feedback = [`Executando: ${name}`];
      return result;
    }

    const key = 'custom_' + name;
    if (!this._states[key]) this._states[key] = 'searching';

    const dist = this._angleDistance(angles, template.angleTemplate);
    const isAtPeak = dist < 0.2;

    if (this._states[key] === 'searching' && isAtPeak) {
      this._states[key] = 'peak';
      result.feedback = [`${name}: posição encontrada! Volte ao início.`];
    } else if (this._states[key] === 'peak' && !isAtPeak) {
      this._states[key] = 'returning';
    } else if (this._states[key] === 'returning' && isAtPeak) {
      result.repCompleted = true;
      result.quality = Math.max(0, 1 - dist * 2);
      result.feedback = [`${name}: repetição concluída!`];
      this._states[key] = 'searching';
    } else {
      result.feedback = [`${name}: ${isAtPeak ? 'na posição!' : 'encontre a posição do exercício'}`];
    }

    return result;
  }

  // ── _matchCustomExercise ──────────────────────────────────────────────────
  _matchCustomExercise(angles) {
    let bestMatch = null;
    let bestDist  = 0.25; // threshold

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

  // ── _angleDistance ────────────────────────────────────────────────────────
  /**
   * Euclidean distance on a normalised [0‑1] angle vector.
   * Uses the 6 most stable angles.
   */
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

  // ── _getMostFrequent ──────────────────────────────────────────────────────
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

  // ── getStats ──────────────────────────────────────────────────────────────
  getStats() {
    return {
      repCount:    this.repCount,
      totalScore:  this.totalScore,
      avgQuality:  this.qualityScores.length > 0
        ? this.qualityScores.reduce((a, b) => a + b, 0) / this.qualityScores.length
        : 0,
      issues: Array.from(this.issues)
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ExerciseRecorder
// Records an exercise template for custom exercise saving.
// ════════════════════════════════════════════════════════════════════════════
class ExerciseRecorder {
  constructor() {
    this.name      = '';
    this.frames    = [];
    this.recording = false;
  }

  startRecording(name) {
    this.name      = name;
    this.frames    = [];
    this.recording = true;
  }

  addFrame(angles) {
    if (!this.recording || !angles) return;
    // Store only the 6 key angles we use for matching
    const keys = ['leftKnee', 'rightKnee', 'leftHip', 'rightHip', 'leftElbow', 'rightElbow'];
    const frame = {};
    for (const k of keys) {
      frame[k] = angles[k] !== null && angles[k] !== undefined ? angles[k] : null;
    }
    this.frames.push(frame);
  }

  /**
   * stopRecording – Computes the average angle template from captured frames.
   * Returns an exercise template object ready to save.
   */
  stopRecording() {
    this.recording = false;
    if (this.frames.length === 0) return null;

    const keys = ['leftKnee', 'rightKnee', 'leftHip', 'rightHip', 'leftElbow', 'rightElbow'];
    const angleTemplate = {};

    for (const k of keys) {
      const vals = this.frames
        .map(f => f[k])
        .filter(v => v !== null && v !== undefined);
      angleTemplate[k] = vals.length > 0
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : null;
    }

    const template = {
      name:          this.name,
      angleTemplate,
      signature:     this._computeSignature(angleTemplate),
      frameCount:    this.frames.length,
      createdAt:     new Date().toISOString()
    };

    this.frames = [];
    return template;
  }

  _computeSignature(template) {
    // Simple hash-like string for identification
    const keys = ['leftKnee', 'rightKnee', 'leftHip', 'rightHip', 'leftElbow', 'rightElbow'];
    return keys.map(k => template[k] !== null ? Math.round(template[k]) : 'X').join('-');
  }

  get frameCount() {
    return this.frames.length;
  }
}

window.ExerciseClassifier = ExerciseClassifier;
window.ExerciseRecorder   = ExerciseRecorder;
