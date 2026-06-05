/**
 * config.js – Firebase configuration and Firestore helpers.
 *
 * Uses Firebase Compat SDK (loaded as a regular <script> tag).
 * IMPORTANT: Replace the placeholder values with your Firebase project config.
 * Get them from: https://console.firebase.google.com → Project Settings → Your apps
 */

// ── Firebase project config ──────────────────────────────────────────────────
// IMPORTANT: Replace these values with your Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyDee2kBiZejJfkH6j5o73zgP3VtTclZXD8",
  authDomain: "faculdade-368a4.firebaseapp.com",
  projectId: "faculdade-368a4",
  storageBucket: "faculdade-368a4.firebasestorage.app",
  messagingSenderId: "557880487167",
  appId: "1:557880487167:web:1209cb3d662186e85ff0ca"
};

// ── Detect placeholder config ─────────────────────────────────────────────────
const IS_PLACEHOLDER = firebaseConfig.apiKey === 'YOUR_API_KEY';

let _db = null;

if (!IS_PLACEHOLDER) {
  try {
    firebase.initializeApp(firebaseConfig);
    _db = firebase.firestore();
    console.info('[FitAI] Firebase conectado com sucesso.');
  } catch (err) {
    console.warn('[FitAI] Erro ao conectar ao Firebase:', err.message);
  }
} else {
  console.warn(
    '[FitAI] Firebase não configurado. ' +
    'Edite js/config.js com suas credenciais para sincronizar na nuvem. ' +
    'O app funcionará com localStorage por enquanto.'
  );
}

// ── localStorage fallback helpers ─────────────────────────────────────────────
function _lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function _lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ── saveWorkout ───────────────────────────────────────────────────────────────
async function saveWorkout(workoutData) {
  const payload = { ...workoutData, createdAt: workoutData.createdAt || new Date().toISOString() };

  if (_db) {
    try {
      const ref = await _db.collection('workouts').add({
        ...payload,
        serverTimestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.info('[FitAI] Treino salvo no Firestore:', ref.id);
      return ref.id;
    } catch (err) {
      console.warn('[FitAI] Erro Firestore, usando localStorage:', err.message);
    }
  }

  const list = _lsGet('fitai_workouts') || [];
  const id = 'local_' + Date.now();
  list.unshift({ id, ...payload });
  _lsSet('fitai_workouts', list.slice(0, 100));
  return id;
}

// ── getWorkouts ───────────────────────────────────────────────────────────────
async function getWorkouts() {
  if (_db) {
    try {
      const snap = await _db.collection('workouts')
        .orderBy('serverTimestamp', 'desc')
        .limit(50)
        .get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('[FitAI] Erro ao buscar treinos:', err.message);
    }
  }
  return _lsGet('fitai_workouts') || [];
}

// ── saveCustomExercise ────────────────────────────────────────────────────────
async function saveCustomExercise(exercise) {
  const payload = { ...exercise, createdAt: exercise.createdAt || new Date().toISOString() };

  if (_db) {
    try {
      const ref = await _db.collection('exercises').add({
        ...payload,
        serverTimestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.info('[FitAI] Exercício salvo:', ref.id);
      return ref.id;
    } catch (err) {
      console.warn('[FitAI] Erro ao salvar exercício:', err.message);
    }
  }

  const list = _lsGet('fitai_exercises') || [];
  const id = 'local_' + Date.now();
  list.push({ id, ...payload });
  _lsSet('fitai_exercises', list);
  return id;
}

// ── getCustomExercises ────────────────────────────────────────────────────────
async function getCustomExercises() {
  if (_db) {
    try {
      const snap = await _db.collection('exercises')
        .orderBy('serverTimestamp', 'desc')
        .get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('[FitAI] Erro ao buscar exercícios:', err.message);
    }
  }
  return _lsGet('fitai_exercises') || [];
}

// ── deleteCustomExercise ──────────────────────────────────────────────────────
async function deleteCustomExercise(id) {
  if (_db && !id.startsWith('local_')) {
    try {
      await _db.collection('exercises').doc(id).delete();
      return;
    } catch (err) {
      console.warn('[FitAI] Erro ao deletar exercício:', err.message);
    }
  }
  const list = (_lsGet('fitai_exercises') || []).filter(e => e.id !== id);
  _lsSet('fitai_exercises', list);
}

// ── Expose globally ───────────────────────────────────────────────────────────
window.FitAIConfig = {
  IS_PLACEHOLDER,
  saveWorkout,
  getWorkouts,
  saveCustomExercise,
  getCustomExercises,
  deleteCustomExercise
};
