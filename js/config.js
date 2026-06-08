/**
 * config.js – Firebase configuration and Firestore helpers.
 * Uses Firebase Compat SDK (loaded as a regular <script> tag).
 */

const firebaseConfig = {
  apiKey:            "AIzaSyDee2kBiZejJfkH6j5o73zgP3VtTclZXD8",
  authDomain:        "faculdade-368a4.firebaseapp.com",
  projectId:         "faculdade-368a4",
  storageBucket:     "faculdade-368a4.firebasestorage.app",
  messagingSenderId: "557880487167",
  appId:             "1:557880487167:web:1209cb3d662186e85ff0ca"
};

const IS_PLACEHOLDER = firebaseConfig.apiKey === 'YOUR_API_KEY';

let _db        = null;
let _auth      = null;
let _authReady = null; // Promise that resolves when anonymous sign-in is done

if (!IS_PLACEHOLDER) {
  try {
    firebase.initializeApp(firebaseConfig);
    _db   = firebase.firestore();
    _auth = firebase.auth();

    // Sign in anonymously so security rules (request.auth != null) pass
    _authReady = _auth.signInAnonymously()
      .then(() => console.info('[FitAI] Auth anônimo OK, uid:', _auth.currentUser.uid))
      .catch(err => console.warn('[FitAI] Auth anônimo falhou:', err.message));

    console.info('[FitAI] Firebase conectado.');
  } catch (err) {
    console.warn('[FitAI] Erro ao conectar ao Firebase:', err.message);
  }
} else {
  console.warn('[FitAI] Firebase não configurado – usando localStorage.');
}

// ── localStorage fallback helpers ─────────────────────────────────────────────
function _lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function _lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ── Aguarda auth estar pronta e retorna o uid atual ───────────────────────────
async function _uid() {
  if (!_auth) return null;
  if (_authReady) await _authReady;
  return _auth.currentUser ? _auth.currentUser.uid : null;
}

// ── saveWorkout ───────────────────────────────────────────────────────────────
async function saveWorkout(workoutData) {
  const userId  = await _uid();
  const payload = {
    ...workoutData,
    userId,
    createdAt: workoutData.createdAt || new Date().toISOString()
  };

  if (_db && userId) {
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
  const id   = 'local_' + Date.now();
  list.unshift({ id, ...payload });
  _lsSet('fitai_workouts', list.slice(0, 100));
  return id;
}

// ── getWorkouts ───────────────────────────────────────────────────────────────
async function getWorkouts() {
  const userId = await _uid();

  if (_db && userId) {
    try {
      const snap = await _db.collection('workouts')
        .where('userId', '==', userId)
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
  const userId  = await _uid();
  const payload = {
    ...exercise,
    createdBy: userId,
    createdAt: exercise.createdAt || new Date().toISOString()
  };

  if (_db && userId) {
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
  const id   = 'local_' + Date.now();
  list.push({ id, ...payload });
  _lsSet('fitai_exercises', list);
  return id;
}

// ── getCustomExercises ────────────────────────────────────────────────────────
async function getCustomExercises() {
  const userId = await _uid();

  if (_db && userId) {
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
  const userId = await _uid();

  if (_db && userId && !id.startsWith('local_')) {
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
  deleteCustomExercise,
  getUid: _uid
};
