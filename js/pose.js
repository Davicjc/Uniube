// pose.js
// integração com o MediaPipe Pose – detecta o esqueleto humano em tempo real pela câmera
// aprendi a usar o MediaPipe na documentação oficial, é bastante poderoso
// OBS: o window.Pose e window.Camera vêm das CDNs carregadas no HTML, não esquecer

// === ÍNDICES DOS PONTOS DO CORPO ===
// o MediaPipe retorna 33 pontos numerados – esses são os que eu uso
// copiei os números da documentação oficial do MediaPipe
const LANDMARKS = {
  NOSE:            0,
  LEFT_EYE:        1,  RIGHT_EYE:        2,
  LEFT_EAR:        3,  RIGHT_EAR:        4,
  LEFT_SHOULDER:  11,  RIGHT_SHOULDER:  12,
  LEFT_ELBOW:     13,  RIGHT_ELBOW:     14,
  LEFT_WRIST:     15,  RIGHT_WRIST:     16,
  LEFT_HIP:       23,  RIGHT_HIP:       24,
  LEFT_KNEE:      25,  RIGHT_KNEE:      26,
  LEFT_ANKLE:     27,  RIGHT_ANKLE:     28,
  LEFT_FOOT:      31,  RIGHT_FOOT:      32
};

// pares de pontos que forman os "ossos" pra desenhar o esqueleto na tela
const CONNECTIONS = [
  [11, 12], // ombros
  [11, 13], [13, 15], // braço esquerdo
  [12, 14], [14, 16], // braço direito
  [11, 23], [12, 24], // lateral do tronco
  [23, 24],           // quadril
  [23, 25], [25, 27], [27, 31], // perna esquerda
  [24, 26], [26, 28], [28, 32], // perna direita
  [15, 17], [15, 19], [17, 19], // mão esquerda
  [16, 18], [16, 20], [18, 20]  // mão direita
];

class PoseDetector {
  // recebe os elementos HTML e um callback que é chamado com os resultados a cada frame
  constructor(videoEl, canvasEl, onResultsCallback) {
    this.videoEl   = videoEl;
    this.canvasEl  = canvasEl;
    this.onResults = onResultsCallback;
    this.pose      = null;
    this.camera    = null;
    this._active   = false;
  }

  // === CONFIGURAÇÃO DO MODELO ===
  // cria o modelo MediaPipe e define as opções de qualidade/velocidade
  init() {
    return new Promise((resolve, reject) => {
      if (!window.Pose) {
        reject(new Error('MediaPipe Pose não carregado. Verifique a conexão com a internet.'));
        return;
      }

      this.pose = new window.Pose({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
      });

      // complexidade 1 = equilíbrio entre velocidade e precisão
      // smoothLandmarks = true deixa os movimentos menos tremidos
      this.pose.setOptions({
        modelComplexity:        1,
        smoothLandmarks:        true,
        enableSegmentation:     false,
        smoothSegmentation:     false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence:  0.5
      });

      // esse callback é chamado pelo MediaPipe a cada frame processado com os pontos detectados
      this.pose.onResults((results) => {
        if (!this._active) return;
        this._drawFrame(results);
        if (this.onResults) this.onResults(results);
      });

      this.pose.initialize()
        .then(() => resolve())
        .catch(reject);
    });
  }

  // === INICIA A CÂMERA ===
  // usa a Camera utility do MediaPipe pra capturar frames e mandar pro modelo
  start() {
    return new Promise((resolve, reject) => {
      if (!window.Camera) {
        reject(new Error('MediaPipe Camera utils não carregado.'));
        return;
      }

      this._active = true;

      this.camera = new window.Camera(this.videoEl, {
        onFrame: async () => {
          if (this._active && this.pose) {
            try {
              await this.pose.send({ image: this.videoEl });
            } catch (e) {
              // ignoro erros de frame durante o stop – é normal acontecer
            }
          }
        },
        width:      640,
        height:     480,
        facingMode: { ideal: 'user' }
      });

      this.camera.start()
        .then(resolve)
        .catch(reject);
    });
  }

  // para a câmera e limpa o canvas
  stop() {
    this._active = false;
    if (this.camera) {
      try { this.camera.stop(); } catch (_) { /* ignore */ }
      this.camera = null;
    }
    if (this.canvasEl) {
      const ctx = this.canvasEl.getContext('2d');
      ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
    }
  }

  // === RENDERIZAÇÃO DO FRAME ===
  // chamado a cada frame – desenha o vídeo espelhado e o esqueleto verde por cima
  _drawFrame(results) {
    const canvas = this.canvasEl;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // ajusta o tamanho do canvas pro vídeo se mudou
    if (results.image) {
      if (canvas.width  !== results.image.width)  canvas.width  = results.image.width;
      if (canvas.height !== results.image.height) canvas.height = results.image.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // espelha horizontalmente pra parecer um espelho – muito mais intuitivo pro usuário
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    if (results.image) {
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }

    if (results.poseLandmarks) {
      this.drawSkeleton(results, ctx);
    }

    ctx.restore();
  }

  // desenha os pontos e linhas do esqueleto no canvas
  // atenção: o ctx já está com o transform espelhado quando essa função é chamada
  drawSkeleton(results, canvasCtx) {
    if (!results.poseLandmarks) return;

    const lm = results.poseLandmarks;
    const W  = this.canvasEl.width;
    const H  = this.canvasEl.height;

    // desenha as linhas entre os pontos (os ossos do esqueleto)
    canvasCtx.lineWidth   = 3;
    canvasCtx.lineCap     = 'round';
    canvasCtx.lineJoin    = 'round';

    for (const [i, j] of CONNECTIONS) {
      const a = lm[i];
      const b = lm[j];
      if (!a || !b) continue;
      if (a.visibility < 0.3 || b.visibility < 0.3) continue;

      const alpha = Math.min(a.visibility, b.visibility);
      canvasCtx.strokeStyle = `rgba(0, 255, 136, ${alpha * 0.85})`;

      canvasCtx.beginPath();
      canvasCtx.moveTo(a.x * W, a.y * H);
      canvasCtx.lineTo(b.x * W, b.y * H);
      canvasCtx.stroke();
    }

    // desenha os círculos nas articulações
    for (let idx = 0; idx < lm.length; idx++) {
      const pt = lm[idx];
      if (!pt || pt.visibility < 0.3) continue;

      const x = pt.x * W;
      const y = pt.y * H;

      // brilho externo
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, 6, 0, Math.PI * 2);
      canvasCtx.fillStyle = `rgba(0, 255, 136, ${pt.visibility * 0.25})`;
      canvasCtx.fill();

      // ponto central – articulações principais ficam brancas
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, 3.5, 0, Math.PI * 2);
      const isJoint = [11,12,13,14,15,16,23,24,25,26,27,28].includes(idx);
      canvasCtx.fillStyle = isJoint
        ? `rgba(255, 255, 255, ${pt.visibility})`
        : `rgba(0, 255, 136, ${pt.visibility * 0.8})`;
      canvasCtx.fill();
    }
  }

  // === FUNÇÕES ESTÁTICAS UTILITÁRIAS ===
  // coloquei como static pra poder chamar sem criar uma instância da classe
  // ex: PoseDetector.calculateAngle(a, b, c)

  // calcula o ângulo em graus no vértice b, dados os pontos a-b-c
  static calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) -
                    Math.atan2(a.y - b.y, a.x - b.x);
    let deg = Math.abs(radians * (180 / Math.PI));
    if (deg > 180) deg = 360 - deg;
    return deg;
  }

  // retorna o landmark pelo índice ou null se não existir
  static getLandmark(landmarks, index) {
    if (!landmarks || index < 0 || index >= landmarks.length) return null;
    return landmarks[index];
  }

  // true se o ponto estiver visível com confiança acima do threshold
  static isVisible(landmark, threshold = 0.5) {
    return !!landmark && (landmark.visibility ?? 0) >= threshold;
  }

  // === CÁLCULO DOS ÂNGULOS CHAVE ===
  // essa é a função mais usada – calcula todos os ângulos importantes do corpo
  // retorna null pra cada ângulo quando os pontos necessários não estão visíveis
  static getKeyAngles(landmarks) {
    if (!landmarks) return null;

    const L   = window.LANDMARKS;
    const gl  = (i) => PoseDetector.getLandmark(landmarks, i);
    const vis = (lm) => PoseDetector.isVisible(lm, 0.4);

    const angles = {
      leftKnee:      null,
      rightKnee:     null,
      leftHip:       null,
      rightHip:      null,
      leftElbow:     null,
      rightElbow:    null,
      leftShoulder:  null,
      rightShoulder: null,
      trunkAngle:    null,
      leftAnkle:     null,
      rightAnkle:    null
    };

    // pego todos os pontos que vou precisar
    const lShoulder = gl(L.LEFT_SHOULDER);
    const rShoulder = gl(L.RIGHT_SHOULDER);
    const lElbow    = gl(L.LEFT_ELBOW);
    const rElbow    = gl(L.RIGHT_ELBOW);
    const lWrist    = gl(L.LEFT_WRIST);
    const rWrist    = gl(L.RIGHT_WRIST);
    const lHip      = gl(L.LEFT_HIP);
    const rHip      = gl(L.RIGHT_HIP);
    const lKnee     = gl(L.LEFT_KNEE);
    const rKnee     = gl(L.RIGHT_KNEE);
    const lAnkle    = gl(L.LEFT_ANKLE);
    const rAnkle    = gl(L.RIGHT_ANKLE);

    // calculo cada ângulo só se os três pontos necessários estiverem visíveis
    if (vis(lHip) && vis(lKnee) && vis(lAnkle))
      angles.leftKnee = PoseDetector.calculateAngle(lHip, lKnee, lAnkle);

    if (vis(rHip) && vis(rKnee) && vis(rAnkle))
      angles.rightKnee = PoseDetector.calculateAngle(rHip, rKnee, rAnkle);

    if (vis(lShoulder) && vis(lHip) && vis(lKnee))
      angles.leftHip = PoseDetector.calculateAngle(lShoulder, lHip, lKnee);

    if (vis(rShoulder) && vis(rHip) && vis(rKnee))
      angles.rightHip = PoseDetector.calculateAngle(rShoulder, rHip, rKnee);

    if (vis(lShoulder) && vis(lElbow) && vis(lWrist))
      angles.leftElbow = PoseDetector.calculateAngle(lShoulder, lElbow, lWrist);

    if (vis(rShoulder) && vis(rElbow) && vis(rWrist))
      angles.rightElbow = PoseDetector.calculateAngle(rShoulder, rElbow, rWrist);

    if (vis(lElbow) && vis(lShoulder) && vis(lHip))
      angles.leftShoulder = PoseDetector.calculateAngle(lElbow, lShoulder, lHip);

    if (vis(rElbow) && vis(rShoulder) && vis(rHip))
      angles.rightShoulder = PoseDetector.calculateAngle(rElbow, rShoulder, rHip);

    // ângulo do tronco em relação à vertical – útil pra detectar se tá se inclinando demais
    if (vis(lShoulder) && vis(rShoulder) && vis(lHip) && vis(rHip)) {
      const midShoulder = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 };
      const midHip      = { x: (lHip.x + rHip.x) / 2,           y: (lHip.y + rHip.y) / 2 };
      const dx = midShoulder.x - midHip.x;
      const dy = midHip.y - midShoulder.y; // atenção: y do canvas é de cima pra baixo
      angles.trunkAngle = Math.abs(Math.atan2(dx, dy) * (180 / Math.PI));
    }

    // ângulo da canela em relação ao vertical (aproximado)
    if (vis(lKnee) && vis(lAnkle)) {
      const dy = lAnkle.y - lKnee.y;
      const dx = lAnkle.x - lKnee.x;
      angles.leftAnkle = Math.abs(Math.atan2(dx, dy) * (180 / Math.PI));
    }

    if (vis(rKnee) && vis(rAnkle)) {
      const dy = rAnkle.y - rKnee.y;
      const dx = rAnkle.x - rKnee.x;
      angles.rightAnkle = Math.abs(Math.atan2(dx, dy) * (180 / Math.PI));
    }

    return angles;
  }
}

// expõe globalmente porque não tem módulos ES6 nesse projeto
window.LANDMARKS    = LANDMARKS;
window.PoseDetector = PoseDetector;
