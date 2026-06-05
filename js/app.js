/**
 * app.js – Main application controller for FitAI
 * Loaded as a regular script (no ES modules).
 * Depends on config.js, pose.js, classifier.js, report.js being loaded first.
 */

// Convenience aliases – use || {} so a missing global never crashes the whole script
const { saveWorkout, getWorkouts, saveCustomExercise, getCustomExercises } =
  window.FitAIConfig || {};
const PoseDetector       = window.PoseDetector       || null;
const ExerciseClassifier = window.ExerciseClassifier || null;
const ExerciseRecorder   = window.ExerciseRecorder   || null;
const generateReport     = window.generateReport     || function() { return {}; };

// ════════════════════════════════════════════════════════════════════════════
// APPLICATION STATE
// ════════════════════════════════════════════════════════════════════════════
const state = {
  screen: 'home',

  workout: {
    active:          false,
    startTime:       null,
    exercises:       {},      // { [name]: { name, type, reps, qualityScores, issues, score } }
    currentExercise: null,
    totalScore:      0,
    lastRepCount:    0
  },

  recording: {
    active:        false,
    exerciseName:  '',
    countdown:     0,
    recorder:      null,
    countdownTimer: null,
    captureTimer:  null
  },

  poseDetector: null,  // active PoseDetector instance
  classifier:   null,  // ExerciseClassifier instance
  customExercises: [],

  timerInterval: null,
  toastTimeout:  null
};

// ════════════════════════════════════════════════════════════════════════════
// DOM HELPERS
// ════════════════════════════════════════════════════════════════════════════
const $ = (id) => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => {
    el.classList.remove('active');
  });
  const target = $(`screen-${name}`);
  if (target) {
    target.classList.add('active');
    state.screen = name;
  }
}

function showToast(message, type = 'info', duration = 3000) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className   = `toast show ${type}`;
  clearTimeout(state.toastTimeout);
  state.toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ════════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE STATS
// ════════════════════════════════════════════════════════════════════════════
function getLocalStats() {
  try {
    return JSON.parse(localStorage.getItem('fitai_stats') || 'null') || {
      totalWorkouts: 0,
      totalReps:     0,
      totalScore:    0
    };
  } catch { return { totalWorkouts: 0, totalReps: 0, totalScore: 0 }; }
}

function saveLocalStats(stats) {
  try { localStorage.setItem('fitai_stats', JSON.stringify(stats)); } catch { /* quota */ }
}

function updateHomeStats() {
  const stats = getLocalStats();
  const level = calcDisplayLevel(stats.totalReps, stats.totalWorkouts);
  $('stat-total-workouts').textContent = stats.totalWorkouts;
  $('stat-total-reps').textContent     = stats.totalReps;
  $('stat-total-score').textContent    = stats.totalScore;
  $('stat-level').textContent          = level;
}

function calcDisplayLevel(totalReps, totalWorkouts) {
  if (totalReps < 50 || totalWorkouts < 3) return 'Iniciante';
  if (totalReps <= 150) return 'Intermediário';
  return 'Avançado';
}

// ════════════════════════════════════════════════════════════════════════════
// POSE INITIALISATION
// ════════════════════════════════════════════════════════════════════════════
async function initPose(videoId, canvasId, onResults) {
  const video  = $(videoId);
  const canvas = $(canvasId);
  if (!video || !canvas) return null;

  const detector = new PoseDetector(video, canvas, onResults);

  try {
    await detector.init();
    await detector.start();
    return detector;
  } catch (err) {
    console.error('[FitAI] Erro ao iniciar câmera/pose:', err);
    showToast('Erro ao acessar a câmera: ' + err.message, 'error', 5000);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// WORKOUT
// ════════════════════════════════════════════════════════════════════════════
async function startWorkout() {
  if (!ExerciseClassifier) {
    showToast('Erro: módulo de classificação não carregou. Verifique a internet e recarregue.', 'error', 6000);
    console.error('[FitAI] ExerciseClassifier is null – classifier.js may have failed to load');
    return;
  }
  if (!PoseDetector) {
    showToast('Erro: módulo de pose não carregou. Verifique a internet e recarregue.', 'error', 6000);
    console.error('[FitAI] PoseDetector is null – pose.js may have failed to load');
    return;
  }

  console.log('[FitAI] startWorkout()');

  // Reset workout state
  state.workout = {
    active:          false,
    startTime:       null,
    exercises:       {},
    currentExercise: null,
    totalScore:      0,
    lastRepCount:    0
  };

  // Create classifier
  state.classifier = new ExerciseClassifier();
  state.classifier.setCustomExercises(state.customExercises);

  showScreen('workout');

  // Reset UI
  $('exercise-name').textContent  = '—';
  $('rep-count').textContent      = '0';
  $('workout-score').textContent  = '0';
  $('timer').textContent          = '00:00';
  $('quality-bar').style.width    = '0%';
  $('quality-value').textContent  = '—';
  setFeedback(['Inicializando câmera…']);
  $('camera-status').textContent  = 'Inicializando câmera…';

  // Stop any previous detector
  if (state.poseDetector) {
    state.poseDetector.stop();
    state.poseDetector = null;
  }

  state.poseDetector = await initPose('workout-video', 'workout-canvas', onWorkoutPoseResults);
  if (!state.poseDetector) return;

  // All good – mark workout active
  state.workout.active    = true;
  state.workout.startTime = Date.now();
  $('camera-status').textContent = 'Câmera ativa – posicione-se em frente';

  // Start timer
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    if (!state.workout.active) return;
    const elapsed = Math.floor((Date.now() - state.workout.startTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    $('timer').textContent = `${m}:${s}`;
  }, 1000);
}

function onWorkoutPoseResults(results) {
  if (!state.workout.active || !state.classifier) return;

  const landmarks = results.poseLandmarks;

  // Update landmark info
  const info = $('landmark-info');
  if (info) {
    const visible = landmarks
      ? landmarks.filter(l => l.visibility > 0.5).length
      : 0;
    info.textContent = landmarks ? `${visible}/33 pontos` : '';
  }

  if (!landmarks) {
    setFeedback(['Posicione-se em frente à câmera e garanta boa iluminação.']);
    return;
  }

  const classification = state.classifier.update(landmarks);
  updateWorkoutUI(classification);
}

function updateWorkoutUI(classification) {
  if (!classification) return;

  const { exercise, repCompleted, quality, feedback, pointsEarned } = classification;

  // Exercise name
  const exNameEl = $('exercise-name');
  if (exercise) {
    exNameEl.textContent = exercise.name;
    // Ensure entry in exercises map
    if (!state.workout.exercises[exercise.name]) {
      state.workout.exercises[exercise.name] = {
        name:          exercise.name,
        type:          exercise.type,
        reps:          0,
        qualityScores: [],
        issues:        new Set(),
        score:         0
      };
    }
    state.workout.currentExercise = exercise.name;
  } else {
    exNameEl.textContent = '—';
    state.workout.currentExercise = null;
  }

  // Rep completed
  if (repCompleted && state.workout.currentExercise) {
    const ex = state.workout.exercises[state.workout.currentExercise];
    ex.reps++;
    ex.qualityScores.push(quality);
    ex.score += pointsEarned || 0;
    state.workout.totalScore += pointsEarned || 0;

    // Collect issues from feedback
    if (feedback) {
      feedback.forEach(f => {
        const positiveWords = ['Ótim', 'Excelente', 'Boa', 'Bom', 'legal', '!'];
        if (!positiveWords.some(w => f.includes(w))) {
          ex.issues.add(f);
        }
      });
    }

    // Animate rep counter
    const totalReps = Object.values(state.workout.exercises)
      .reduce((sum, e) => sum + e.reps, 0);

    const repEl = $('rep-count');
    repEl.textContent = totalReps;
    repEl.classList.remove('bump');
    // Force reflow then add class
    void repEl.offsetWidth;
    repEl.classList.add('bump');
    setTimeout(() => repEl.classList.remove('bump'), 300);

    // Score
    $('workout-score').textContent = state.workout.totalScore;
  }

  // Quality bar
  if (quality !== undefined && quality !== null) {
    const pct = Math.round(quality * 100);
    $('quality-bar').style.width   = `${pct}%`;
    $('quality-value').textContent = `${pct}%`;

    // Shift background-position for gradient effect
    const pos = 100 - pct; // green at 100%, red at 0%
    $('quality-bar').style.backgroundPosition = `${pos}% center`;
  }

  // Feedback
  if (feedback && feedback.length > 0) {
    setFeedback(feedback);
  }
}

function setFeedback(messages) {
  const container = $('feedback-text');
  if (!container) return;
  container.innerHTML = '';
  messages.forEach(msg => {
    const p = document.createElement('p');
    p.className = 'feedback-item';
    // Simple classification of feedback tone
    const positive = ['Ótim', 'Excelente', 'Boa ', 'Bom ', '!', 'concluída'];
    const warning  = ['Desça', 'mais', 'Incline', 'Eleve', 'Feche', 'Abra', 'volte'];
    const error    = ['passando', 'Quadril', 'alinha', 'muito'];
    if (positive.some(w => msg.includes(w))) p.classList.add('good');
    else if (error.some(w => msg.includes(w))) p.classList.add('error');
    else if (warning.some(w => msg.includes(w))) p.classList.add('warning');
    p.textContent = msg;
    container.appendChild(p);
  });
}

async function endWorkout() {
  if (!state.workout.active) return;

  state.workout.active = false;
  clearInterval(state.timerInterval);

  // Stop pose
  if (state.poseDetector) {
    state.poseDetector.stop();
    state.poseDetector = null;
  }

  const duration = Math.floor((Date.now() - state.workout.startTime) / 1000);

  // Normalise exercises for report
  const exercisesForReport = {};
  for (const [name, ex] of Object.entries(state.workout.exercises)) {
    exercisesForReport[name] = {
      ...ex,
      issues: Array.from(ex.issues || new Set())
    };
  }

  const stats = getLocalStats();
  const totalReps = Object.values(exercisesForReport).reduce((s, e) => s + e.reps, 0);

  const workoutData = {
    duration,
    exercises:         exercisesForReport,
    totalScore:        state.workout.totalScore,
    totalWorkouts:     stats.totalWorkouts + 1,
    totalAllTimeReps:  stats.totalReps,
    createdAt:         new Date().toISOString()
  };

  // Generate report
  const report = generateReport(workoutData);

  // Update local stats
  const newStats = {
    totalWorkouts: stats.totalWorkouts + 1,
    totalReps:     stats.totalReps + totalReps,
    totalScore:    stats.totalScore + state.workout.totalScore
  };
  saveLocalStats(newStats);

  // Save to Firestore / localStorage
  try {
    await saveWorkout({
      ...workoutData,
      report: {
        summary:    report.summary,
        totalScore: report.totalScore,
        totalReps:  report.totalReps,
        level:      report.level
      }
    });
  } catch (err) {
    console.warn('[FitAI] Erro ao salvar treino:', err);
  }

  // Show report
  renderReport(report, duration);
  showScreen('report');
  updateHomeStats();

  // Trigger score animation on next frame
  setTimeout(() => animateScoreCircle(report.totalScore), 100);
}

// ════════════════════════════════════════════════════════════════════════════
// REPORT
// ════════════════════════════════════════════════════════════════════════════
function renderReport(report, duration) {
  // Date
  const now = new Date();
  $('report-date').textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Score
  $('report-score').textContent = report.totalScore;

  // Summary
  $('report-summary').textContent = report.summary;

  // Stats
  $('report-total-reps').textContent = report.totalReps;
  $('report-duration').textContent   = report.durationFormatted || formatDuration(duration);
  $('report-level').textContent      = report.level;

  // Achievement
  const achCard = $('achievement-card');
  if (report.achievement) {
    $('achievement-icon').textContent  = report.achievement.icon;
    $('achievement-title').textContent = report.achievement.title;
    $('achievement-desc').textContent  = report.achievement.description;
    achCard.style.display = 'flex';
  } else {
    achCard.style.display = 'none';
  }

  // Exercise breakdown
  const breakdownEl = $('exercise-breakdown');
  breakdownEl.innerHTML = '';
  if (report.exerciseBreakdown && report.exerciseBreakdown.length > 0) {
    report.exerciseBreakdown.forEach(ex => {
      const row = document.createElement('div');
      row.className = 'exercise-row';
      const statusClass = {
        'Excelente': 'status-excelente',
        'Bom':       'status-bom',
        'Melhorar':  'status-melhorar'
      }[ex.status] || 'status-bom';

      row.innerHTML = `
        <div class="exercise-row-name">${ex.name}</div>
        <div class="exercise-row-reps"><strong>${ex.reps}</strong>reps</div>
        <div class="exercise-row-quality"><strong>${ex.avgQuality}%</strong>qualidade</div>
        <div class="exercise-row-score">${ex.score} pts</div>
        <div class="exercise-row-status ${statusClass}">${ex.status}</div>
      `;
      breakdownEl.appendChild(row);
    });
  } else {
    breakdownEl.innerHTML = '<p style="color:var(--text-muted);font-size:14px;">Nenhum exercício registrado.</p>';
  }

  // Improvements
  const improvEl = $('improvements-list');
  improvEl.innerHTML = '';
  if (report.improvements && report.improvements.length > 0) {
    report.improvements.forEach(imp => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${imp.exercise}:</strong> ${imp.tip}`;
      improvEl.appendChild(li);
    });
    $('improvements-section').style.display = 'block';
  } else {
    $('improvements-section').style.display = 'none';
  }

  // Strengths
  const strengthsEl = $('strengths-list');
  strengthsEl.innerHTML = '';
  if (report.strengths && report.strengths.length > 0) {
    report.strengths.forEach(s => {
      const li = document.createElement('li');
      li.textContent = s;
      strengthsEl.appendChild(li);
    });
    $('strengths-section').style.display = 'block';
  } else {
    $('strengths-section').style.display = 'none';
  }

  // Next workout
  $('next-workout-suggestion').textContent = report.nextWorkoutSuggestion;
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}min ${s.toString().padStart(2, '0')}s`;
}

function animateScoreCircle(score) {
  const circle = $('score-circle-fill');
  if (!circle) return;

  const circumference = 327; // 2 * PI * 52
  const maxScore = 500;
  const pct = Math.min(score / maxScore, 1);
  const offset = circumference * (1 - pct);

  // Set color based on score
  let color;
  if (pct >= 0.7) color = '#00ff88';
  else if (pct >= 0.4) color = '#ffd600';
  else color = '#ff8c00';

  circle.style.stroke           = color;
  circle.style.strokeDashoffset = offset;
}

// ════════════════════════════════════════════════════════════════════════════
// RECORDING
// ════════════════════════════════════════════════════════════════════════════
async function openRecordScreen() {
  if (!PoseDetector) {
    showToast('Erro: módulo de câmera não carregou. Verifique a internet e recarregue.', 'error', 6000);
    console.error('[FitAI] PoseDetector is null – pose.js may have failed to load');
    return;
  }
  console.log('[FitAI] openRecordScreen()');

  // Stop workout detector if active
  if (state.workout.active) {
    state.workout.active = false;
    clearInterval(state.timerInterval);
  }
  if (state.poseDetector) {
    state.poseDetector.stop();
    state.poseDetector = null;
  }

  showScreen('record');
  resetRecordUI();

  // Init camera for record screen
  const detector = await initPose('record-video', 'record-canvas', onRecordPoseResults);
  if (detector) {
    state.poseDetector = detector;
    $('record-camera-status').textContent = 'Câmera ativa';
  }

  // Enable start button if name is filled
  checkRecordStartEnabled();
}

function resetRecordUI() {
  $('exercise-name-input').value   = '';
  $('btn-start-recording').disabled = true;
  $('btn-save-recording').disabled  = true;
  $('recording-status').style.display = 'none';
  $('countdown-display').style.display = 'none';
  $('record-camera-status').textContent = 'Inicializando câmera…';
  state.recording = {
    active:         false,
    exerciseName:   '',
    countdown:      0,
    recorder:       null,
    countdownTimer: null,
    captureTimer:   null
  };
}

function checkRecordStartEnabled() {
  const name = $('exercise-name-input').value.trim();
  $('btn-start-recording').disabled = name.length < 2;
}

function onRecordPoseResults(results) {
  if (!state.recording.active) return;
  if (!results.poseLandmarks) return;

  const angles = PoseDetector.getKeyAngles(results.poseLandmarks);
  if (angles && state.recording.recorder) {
    state.recording.recorder.addFrame(angles);
    $('recording-frames').textContent = `${state.recording.recorder.frameCount} frames`;
  }
}

function startCountdown(name) {
  return new Promise((resolve) => {
    let count = 3;
    const display = $('countdown-display');
    display.textContent = count;
    display.style.display = 'flex';

    const tick = () => {
      display.textContent = count;
      // Re-trigger animation
      display.classList.remove('countdown-animate');
      void display.offsetWidth;
      display.classList.add('countdown-animate');

      if (count <= 0) {
        display.style.display = 'none';
        resolve();
      } else {
        count--;
        setTimeout(tick, 1000);
      }
    };
    tick();
  });
}

async function startRecording() {
  const name = $('exercise-name-input').value.trim();
  if (!name || name.length < 2) {
    showToast('Digite o nome do exercício primeiro.', 'error');
    return;
  }

  $('btn-start-recording').disabled = true;
  $('btn-cancel-recording').disabled = true;

  await startCountdown(name);

  // Init recorder
  state.recording.recorder = new ExerciseRecorder();
  state.recording.recorder.startRecording(name);
  state.recording.active      = true;
  state.recording.exerciseName = name;

  // Show recording status
  $('recording-status').style.display = 'flex';
  $('recording-status-text').textContent = `Gravando "${name}"…`;
  $('recording-frames').textContent = '0 frames';

  // Auto-stop after 5 seconds
  state.recording.captureTimer = setTimeout(() => {
    if (state.recording.active) {
      finishCapture();
    }
  }, 5000);

  $('btn-cancel-recording').disabled = false;
}

function finishCapture() {
  state.recording.active = false;
  clearTimeout(state.recording.captureTimer);

  $('recording-status-text').textContent = 'Captura concluída!';

  const frames = state.recording.recorder ? state.recording.recorder.frameCount : 0;
  if (frames < 5) {
    showToast('Poucos frames capturados. Tente novamente em frente à câmera.', 'error');
    $('btn-start-recording').disabled = false;
    return;
  }

  $('btn-save-recording').disabled  = false;
  $('btn-start-recording').disabled = false;
  showToast(`${frames} frames capturados. Clique em Salvar para confirmar.`, 'success');
}

async function saveRecording() {
  if (!state.recording.recorder) {
    showToast('Nada para salvar. Grave primeiro.', 'error');
    return;
  }

  const template = state.recording.recorder.stopRecording();
  if (!template) {
    showToast('Gravação inválida. Tente novamente.', 'error');
    return;
  }

  $('btn-save-recording').disabled = true;

  try {
    const id = await saveCustomExercise(template);
    template.id = id;
    state.customExercises.push(template);
    showToast(`"${template.name}" salvo com sucesso!`, 'success');

    // Re-init classifier custom exercises if workout is running
    if (state.classifier) {
      state.classifier.setCustomExercises(state.customExercises);
    }

    // Go back to home or workout
    cancelRecording();
  } catch (err) {
    showToast('Erro ao salvar exercício: ' + err.message, 'error');
    $('btn-save-recording').disabled = false;
  }
}

function cancelRecording() {
  clearTimeout(state.recording.captureTimer);
  clearTimeout(state.recording.countdownTimer);
  state.recording.active = false;

  if (state.poseDetector) {
    state.poseDetector.stop();
    state.poseDetector = null;
  }

  showScreen('home');
}

// ════════════════════════════════════════════════════════════════════════════
// HISTORY
// ════════════════════════════════════════════════════════════════════════════
async function loadHistory() {
  showScreen('history');
  $('history-loading').style.display = 'flex';
  $('history-empty').style.display   = 'none';
  $('history-list').innerHTML        = '';

  try {
    const workouts = await getWorkouts();
    $('history-loading').style.display = 'none';

    if (!workouts || workouts.length === 0) {
      $('history-empty').style.display = 'block';
      return;
    }

    renderHistoryList(workouts);
  } catch (err) {
    $('history-loading').style.display = 'none';
    showToast('Erro ao carregar histórico: ' + err.message, 'error');
    $('history-empty').style.display = 'block';
  }
}

function renderHistoryList(workouts) {
  const list = $('history-list');
  list.innerHTML = '';

  workouts.forEach(w => {
    const date = w.createdAt
      ? new Date(w.createdAt).toLocaleDateString('pt-BR', {
          weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      : 'Data desconhecida';

    // Exercise names from either exercises object or report
    let exerciseNames = 'Treino registrado';
    if (w.exercises && typeof w.exercises === 'object') {
      const names = Object.keys(w.exercises);
      if (names.length > 0) {
        exerciseNames = names.join(', ');
      }
    }

    // Total reps
    let totalReps = w.report?.totalReps || 0;
    if (!totalReps && w.exercises) {
      totalReps = Object.values(w.exercises).reduce((s, e) => s + (e.reps || 0), 0);
    }

    // Duration
    const dur = w.duration ? formatDuration(w.duration) : '—';
    const score = w.totalScore || w.report?.totalScore || 0;
    const level = w.report?.level || '—';

    const card = document.createElement('div');
    card.className = 'history-card';
    card.innerHTML = `
      <div class="history-card-date">${date}</div>
      <div class="history-card-exercises">${exerciseNames}</div>
      <div class="history-card-meta">${totalReps} reps · ${dur} · ${level}</div>
      <div class="history-card-score">${score}<small>pts</small></div>
    `;
    list.appendChild(card);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// INIT  (synchronous – no await, so errors never silently swallow listeners)
// ════════════════════════════════════════════════════════════════════════════
function _on(id, event, handler) {
  const el = $(id);
  if (el) {
    el.addEventListener(event, handler);
  } else {
    console.warn('[FitAI] Element not found for listener:', id);
  }
}

function init() {
  console.log('[FitAI] init() starting…');

  try { updateHomeStats(); } catch (e) { console.error('[FitAI] updateHomeStats error:', e); }

  showScreen('home');

  // Home
  _on('btn-start-workout',    'click', startWorkout);
  _on('btn-record-new-home',  'click', openRecordScreen);
  _on('btn-history',          'click', loadHistory);

  // Workout
  _on('btn-end-workout', 'click', () => {
    if (state.workout.active) {
      endWorkout();
    } else {
      if (state.poseDetector) { state.poseDetector.stop(); state.poseDetector = null; }
      showScreen('home');
    }
  });
  _on('btn-record-new-workout', 'click', openRecordScreen);

  // Record
  _on('exercise-name-input',   'input',   checkRecordStartEnabled);
  _on('exercise-name-input',   'keydown', (e) => { if (e.key === 'Enter') startRecording(); });
  _on('btn-start-recording',   'click',   startRecording);
  _on('btn-save-recording',    'click',   saveRecording);
  _on('btn-cancel-recording',  'click',   cancelRecording);

  // Report
  _on('btn-new-workout',   'click', startWorkout);
  _on('btn-view-history',  'click', loadHistory);

  // History
  _on('btn-back-history',   'click', () => showScreen('home'));
  _on('btn-first-workout',  'click', startWorkout);

  console.info('[FitAI] Todos os listeners registrados com sucesso.');

  // Load custom exercises in background – never blocks UI
  _loadCustomExercises();
}

async function _loadCustomExercises() {
  try {
    if (typeof getCustomExercises !== 'function') return;
    state.customExercises = await getCustomExercises();
    const chip = $('custom-exercises-chip');
    if (state.customExercises.length > 0 && chip) {
      chip.textContent =
        `+ ${state.customExercises.length} Personalizado${state.customExercises.length !== 1 ? 's' : ''}`;
    }
  } catch (err) {
    console.warn('[FitAI] Não foi possível carregar exercícios personalizados:', err.message);
  }
}

// Global error handler – show a visible toast for any unhandled error
window.addEventListener('error', (e) => {
  console.error('[FitAI] Erro global:', e.message, e.filename, e.lineno);
  showToast('Erro: ' + e.message, 'error', 6000);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[FitAI] Promise rejeitada:', e.reason);
});

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
