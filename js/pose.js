/**
 * pose.js – MediaPipe Pose integration wrapper.
 * Loaded as a regular script (no ES modules).
 */

// MediaPipe landmark indices
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

// MediaPipe POSE_CONNECTIONS (subset – the full set is provided by the library)
const CONNECTIONS = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso sides
  [23, 24],           // hips
  [23, 25], [25, 27], [27, 31], // left leg
  [24, 26], [26, 28], [28, 32], // right leg
  [15, 17], [15, 19], [17, 19], // left hand
  [16, 18], [16, 20], [18, 20]  // right hand
];

class PoseDetector {
  /**
   * @param {HTMLVideoElement} videoEl
   * @param {HTMLCanvasElement} canvasEl
   * @param {Function} onResultsCallback  – called with MediaPipe results each frame
   */
  constructor(videoEl, canvasEl, onResultsCallback) {
    this.videoEl   = videoEl;
    this.canvasEl  = canvasEl;
    this.onResults = onResultsCallback;
    this.pose      = null;
    this.camera    = null;
    this._active   = false;
  }

  // ── init ──────────────────────────────────────────────────────────────────
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

      this.pose.setOptions({
        modelComplexity:        1,
        smoothLandmarks:        true,
        enableSegmentation:     false,
        smoothSegmentation:     false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence:  0.5
      });

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

  // ── start ─────────────────────────────────────────────────────────────────
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
              // Ignore frames lost during stop
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

  // ── stop ──────────────────────────────────────────────────────────────────
  stop() {
    this._active = false;
    if (this.camera) {
      try { this.camera.stop(); } catch (_) { /* ignore */ }
      this.camera = null;
    }
    // Clear canvas
    if (this.canvasEl) {
      const ctx = this.canvasEl.getContext('2d');
      ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
    }
  }

  // ── _drawFrame ────────────────────────────────────────────────────────────
  _drawFrame(results) {
    const canvas = this.canvasEl;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const H   = canvas.height;

    // Match canvas to video dimensions
    if (results.image) {
      if (canvas.width  !== results.image.width)  canvas.width  = results.image.width;
      if (canvas.height !== results.image.height) canvas.height = results.image.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save and flip horizontally (mirror effect)
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    // Draw video frame
    if (results.image) {
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }

    // Draw skeleton
    if (results.poseLandmarks) {
      this.drawSkeleton(results, ctx);
    }

    ctx.restore();
  }

  // ── drawSkeleton ──────────────────────────────────────────────────────────
  /**
   * Draws skeleton landmarks and connections on canvas context.
   * NOTE: assumes canvas context is already in mirrored transform state.
   */
  drawSkeleton(results, canvasCtx) {
    if (!results.poseLandmarks) return;

    const lm     = results.poseLandmarks;
    const W      = this.canvasEl.width;
    const H      = this.canvasEl.height;

    // Draw connections
    canvasCtx.lineWidth   = 3;
    canvasCtx.lineCap     = 'round';
    canvasCtx.lineJoin    = 'round';

    for (const [i, j] of CONNECTIONS) {
      const a = lm[i];
      const b = lm[j];
      if (!a || !b) continue;
      if (a.visibility < 0.3 || b.visibility < 0.3) continue;

      // Gradient color based on visibility
      const alpha = Math.min(a.visibility, b.visibility);
      canvasCtx.strokeStyle = `rgba(0, 255, 136, ${alpha * 0.85})`;

      canvasCtx.beginPath();
      canvasCtx.moveTo(a.x * W, a.y * H);
      canvasCtx.lineTo(b.x * W, b.y * H);
      canvasCtx.stroke();
    }

    // Draw landmark dots
    for (let idx = 0; idx < lm.length; idx++) {
      const pt = lm[idx];
      if (!pt || pt.visibility < 0.3) continue;

      const x = pt.x * W;
      const y = pt.y * H;

      // Outer glow ring
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, 6, 0, Math.PI * 2);
      canvasCtx.fillStyle = `rgba(0, 255, 136, ${pt.visibility * 0.25})`;
      canvasCtx.fill();

      // Main dot
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, 3.5, 0, Math.PI * 2);
      const isJoint = [11,12,13,14,15,16,23,24,25,26,27,28].includes(idx);
      canvasCtx.fillStyle = isJoint
        ? `rgba(255, 255, 255, ${pt.visibility})`
        : `rgba(0, 255, 136, ${pt.visibility * 0.8})`;
      canvasCtx.fill();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATIC UTILITY METHODS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * calculateAngle – Returns the angle (degrees) at vertex b,
   * given three {x, y} points: a → b → c
   */
  static calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) -
                    Math.atan2(a.y - b.y, a.x - b.x);
    let deg = Math.abs(radians * (180 / Math.PI));
    if (deg > 180) deg = 360 - deg;
    return deg;
  }

  /**
   * getLandmark – Returns normalised landmark {x, y, z, visibility}.
   * Returns null if index is out of range.
   */
  static getLandmark(landmarks, index) {
    if (!landmarks || index < 0 || index >= landmarks.length) return null;
    return landmarks[index];
  }

  /**
   * isVisible – Returns true if landmark exists and visibility > threshold.
   */
  static isVisible(landmark, threshold = 0.5) {
    return !!landmark && (landmark.visibility ?? 0) >= threshold;
  }

  /**
   * getKeyAngles – Computes all important joint angles from a landmarks array.
   * Returns an object with named angles in degrees (0‑180), or null per angle if
   * the required landmarks are not visible enough.
   */
  static getKeyAngles(landmarks) {
    if (!landmarks) return null;

    const L  = window.LANDMARKS;
    const gl = (i) => PoseDetector.getLandmark(landmarks, i);
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

    // Points
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

    // Left knee: hip → knee → ankle
    if (vis(lHip) && vis(lKnee) && vis(lAnkle)) {
      angles.leftKnee = PoseDetector.calculateAngle(lHip, lKnee, lAnkle);
    }

    // Right knee: hip → knee → ankle
    if (vis(rHip) && vis(rKnee) && vis(rAnkle)) {
      angles.rightKnee = PoseDetector.calculateAngle(rHip, rKnee, rAnkle);
    }

    // Left hip: shoulder → hip → knee
    if (vis(lShoulder) && vis(lHip) && vis(lKnee)) {
      angles.leftHip = PoseDetector.calculateAngle(lShoulder, lHip, lKnee);
    }

    // Right hip: shoulder → hip → knee
    if (vis(rShoulder) && vis(rHip) && vis(rKnee)) {
      angles.rightHip = PoseDetector.calculateAngle(rShoulder, rHip, rKnee);
    }

    // Left elbow: shoulder → elbow → wrist
    if (vis(lShoulder) && vis(lElbow) && vis(lWrist)) {
      angles.leftElbow = PoseDetector.calculateAngle(lShoulder, lElbow, lWrist);
    }

    // Right elbow: shoulder → elbow → wrist
    if (vis(rShoulder) && vis(rElbow) && vis(rWrist)) {
      angles.rightElbow = PoseDetector.calculateAngle(rShoulder, rElbow, rWrist);
    }

    // Left shoulder: elbow → shoulder → hip
    if (vis(lElbow) && vis(lShoulder) && vis(lHip)) {
      angles.leftShoulder = PoseDetector.calculateAngle(lElbow, lShoulder, lHip);
    }

    // Right shoulder: elbow → shoulder → hip
    if (vis(rElbow) && vis(rShoulder) && vis(rHip)) {
      angles.rightShoulder = PoseDetector.calculateAngle(rElbow, rShoulder, rHip);
    }

    // Trunk angle: uses mid-shoulder → mid-hip vector vs vertical
    if (vis(lShoulder) && vis(rShoulder) && vis(lHip) && vis(rHip)) {
      const midShoulder = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 };
      const midHip      = { x: (lHip.x + rHip.x) / 2,           y: (lHip.y + rHip.y) / 2 };
      // angle relative to vertical (up)
      const dx = midShoulder.x - midHip.x;
      const dy = midHip.y - midShoulder.y; // screen y inverted
      angles.trunkAngle = Math.abs(Math.atan2(dx, dy) * (180 / Math.PI));
    }

    // Left ankle: knee → ankle → foot_index (approximate using toe as foot)
    // We'll compute the angle between the lower leg and horizontal
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

// Expose globally so other scripts can access without ES modules
window.LANDMARKS    = LANDMARKS;
window.PoseDetector = PoseDetector;
