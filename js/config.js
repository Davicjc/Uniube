// config.js
// conecta o app com o Firebase e cuida de salvar/buscar os dados
// OBS: esse arquivo precisa ser carregado ANTES de app.js no HTML

const firebaseConfig = {
  apiKey:            "AIzaSyDee2kBiZejJfkH6j5o73zgP3VtTclZXD8",
  authDomain:        "faculdade-368a4.firebaseapp.com",
  projectId:         "faculdade-368a4",
  storageBucket:     "faculdade-368a4.firebasestorage.app",
  messagingSenderId: "557880487167",
  appId:             "1:557880487167:web:1209cb3d662186e85ff0ca"
};

// se a chave for YOUR_API_KEY significa que não configurou ainda
const IS_PLACEHOLDER = firebaseConfig.apiKey === 'YOUR_API_KEY';

// variáveis do Firebase – começo como null e inicializo abaixo
let _db        = null;
let _auth      = null;
let _authReady = null; // Promise que resolve quando o login anônimo terminar

// === INICIALIZAÇÃO DO FIREBASE ===
// só conecta se tiver chave real, senão usa localStorage como fallback
if (!IS_PLACEHOLDER) {
  try {
    firebase.initializeApp(firebaseConfig);
    _db   = firebase.firestore();
    _auth = firebase.auth();

    // faço login anônimo pra passar nas regras de segurança do Firestore
    // as rules exigem request.auth != null, então preciso disso
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

// === FUNÇÕES AUXILIARES DO LOCALSTORAGE ===
// uso quando o Firebase não tá disponível (offline ou sem configuração)
function _lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function _lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// espera o login terminar e retorna o uid do usuário
async function _uid() {
  if (!_auth) return null;
  if (_authReady) await _authReady;
  return _auth.currentUser ? _auth.currentUser.uid : null;
}

// === TREINOS ===
// salva um treino no Firestore; se der erro, cai no localStorage

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

  // fallback local – limito a 100 treinos pra não encher o storage
  const list = _lsGet('fitai_workouts') || [];
  const id   = 'local_' + Date.now();
  list.unshift({ id, ...payload });
  _lsSet('fitai_workouts', list.slice(0, 100));
  return id;
}

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

// === EXERCÍCIOS PERSONALIZADOS ===
// exercícios que o usuário grava com a câmera – ficam no Firestore pra sincronizar entre dispositivos

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

async function getCustomExercises() {
  if (_db) {
    try {
      // aguarda auth se disponível, mas não bloqueia se falhar
      if (_authReady) await _authReady.catch(() => {});
      const snap = await _db.collection('exercises')
        .orderBy('serverTimestamp', 'desc')
        .get();
      const result = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      console.info('[FitAI] Exercícios carregados do Firestore:', result.length);
      return result;
    } catch (err) {
      console.warn('[FitAI] Erro ao buscar exercícios:', err.message);
    }
  }
  return _lsGet('fitai_exercises') || [];
}

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

// === EXPORTAÇÃO GLOBAL ===
// coloco tudo em window.FitAIConfig pra app.js conseguir acessar
// não posso usar import/export porque o projeto roda no file:// sem bundler
window.FitAIConfig = {
  IS_PLACEHOLDER,
  saveWorkout,
  getWorkouts,
  saveCustomExercise,
  getCustomExercises,
  deleteCustomExercise,
  getUid: _uid
};
