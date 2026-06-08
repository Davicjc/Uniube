/**
 * app.js – Main application controller for FitAI
 * Loaded as a regular script (no ES modules).
 * Depends on config.js, pose.js, classifier.js, report.js being loaded first.
 */

// Read external dependencies with underscore-prefixed names to avoid
// SyntaxError: multiple <script> tags share the global lexical scope, so
// re-declaring names already bound by config.js / pose.js / classifier.js
// (as functions or classes) throws "Identifier has already been declared".
const _cfg                  = window.FitAIConfig          || {};
const _saveWorkout          = _cfg.saveWorkout             || function() {};
const _getWorkouts          = _cfg.getWorkouts             || function() { return []; };
const _saveCustomExercise   = _cfg.saveCustomExercise      || function() {};
const _getCustomExercises   = _cfg.getCustomExercises      || function() { return []; };
const _deleteCustomExercise = _cfg.deleteCustomExercise    || function() {};
const _generateReport     = window.generateReport      || function() { return {}; };

// ════════════════════════════════════════════════════════════════════════════
// APPLICATION STATE
// ════════════════════════════════════════════════════════════════════════════
const state = {
  screen: 'home',

  workout: {
    active:          false,
    startTime:       null,
    exercises:       {},
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

  // Guided workout plan state
  profile:    null,   // { age, sex, height, weight }
  plan:       [],     // [{ name, category, sets, repsPerSet, restSeconds, level }]
  planIndex:  -1,     // current exercise index in plan
  setIndex:   0,      // current set (0-indexed)
  setReps:    0,      // reps done in current set
  restTimer:  null,   // rest countdown interval

  poseDetector: null,
  classifier:   null,
  customExercises: [],
  char3d:       null,
  charLib:      null,

  exlibFilter:   'all',
  exlibSearch:   '',
  exlibSelected: null,

  timerInterval: null,
  toastTimeout:  null
};

// ════════════════════════════════════════════════════════════════════════════
// EXERCISE INFO – descriptions, tips, icons for demo screen
// ════════════════════════════════════════════════════════════════════════════
const EXERCISE_INFO = {
  'Agachamento':            { icon:'🏋️', muscles:'Quadríceps, Glúteos, Isquiotibiais',   desc:'Pés na largura dos ombros levemente abertos. Desça como se fosse sentar em uma cadeira, mantendo o tronco ereto e os joelhos alinhados com os pés.',                                    tips:['Joelhos alinhados com os pés','Desça até 90°','Peso nos calcanhares'] },
  'Polichinelo':            { icon:'⭐', muscles:'Cardio, Corpo Todo',                    desc:'Em pé com pés juntos. Salte abrindo os pés além dos ombros enquanto eleva os braços acima da cabeça. Retorne e repita.',                                                                tips:['Sincronize braços e pernas','Aterrisse suavemente','Ritmo constante'] },
  'Flexão':                 { icon:'💪', muscles:'Peitoral, Tríceps, Ombros',             desc:'Mãos na largura dos ombros, corpo em linha reta. Desça o peito até quase tocar o chão e empurre de volta.',                                                                              tips:['Corpo reto como prancha','Cotovelos a 45° do corpo','Abdômen contraído'] },
  'Avanço':                 { icon:'🦵', muscles:'Quadríceps, Glúteos, Isquiotibiais',   desc:'Dê um passo à frente. Desça até o joelho da frente atingir 90°. Volte à posição inicial e alterne as pernas.',                                                                          tips:['Tronco ereto','Joelho não passa dos pés','Empurre pelo calcanhar'] },
  'Joelho Alto':            { icon:'🏃', muscles:'Cardio, Core, Quadríceps',              desc:'Em pé, eleve alternadamente os joelhos acima da linha do quadril em ritmo acelerado.',                                                                                                    tips:['Joelho acima do quadril','Mova os braços naturalmente','Abdômen contraído'] },
  'Agachamento Sumô':       { icon:'🏋️', muscles:'Glúteos, Adutores, Quadríceps',        desc:'Pés muito afastados com pontas voltadas para fora (~45°). Desça mantendo tronco ereto e joelhos na direção dos pés.',                                                                    tips:['Joelhos seguem a direção dos pés','Ative os glúteos na subida','Tronco ereto'] },
  'Agachamento Búlgaro':    { icon:'🏋️', muscles:'Quadríceps, Glúteos',                  desc:'Pé de trás elevado em banco. Desça o joelho traseiro em direção ao chão até 90° no joelho da frente.',                                                                                   tips:['Pé da frente bem à frente','Tronco ereto','Execute os dois lados'] },
  'Cadeira Contra Parede':  { icon:'🪑', muscles:'Quadríceps, Glúteos',                  desc:'Costas na parede, desça até joelhos a 90° e segure a posição isométrica.',                                                                                                               tips:['Costas planas na parede','Joelhos sobre os tornozelos','Respire normalmente'] },
  'Agachamento com Salto':  { icon:'🚀', muscles:'Quadríceps, Glúteos, Cardio',           desc:'Agachamento seguido de salto explosivo. Aterrisse suavemente e desça imediatamente.',                                                                                                    tips:['Aterrissagem com joelhos dobrados','Explosão na saída','Silêncio na aterrissagem'] },
  'Agachamento Isométrico': { icon:'⏱️', muscles:'Quadríceps, Glúteos',                  desc:'Desça até joelhos a ~100° e segure a posição estática por alguns segundos.',                                                                                                             tips:['Posição estável','Respire regularmente','Não deixe os joelhos cair para dentro'] },
  'Agachamento Plié':       { icon:'💃', muscles:'Glúteos, Adutores, Quadríceps',         desc:'Agachamento com pés bem abertos e pontas para fora. Ênfase nos adutores e glúteos.',                                                                                                    tips:['Joelhos para fora na descida','Tronco ereto','Contraia os glúteos na subida'] },
  'Passada Lateral':        { icon:'↔️', muscles:'Glúteos, Adutores, Quadríceps',         desc:'Passo lateral largo com uma perna, flexionando esse joelho enquanto o outro fica estendido.',                                                                                            tips:['Pé de suporte completamente no chão','Tronco ereto','Alterne os lados'] },
  'Afundo com Rotação':     { icon:'🔄', muscles:'Quadríceps, Oblíquos, Core',            desc:'Avanço com rotação do tronco para o lado da perna da frente no ponto mais baixo.',                                                                                                      tips:['Gire o tronco todo, não só os braços','Mantenha equilíbrio','Volte ao centro antes de subir'] },
  'Afundo com Salto':       { icon:'🚀', muscles:'Quadríceps, Glúteos, Cardio',           desc:'Avanço com troca explosiva de perna no ar.',                                                                                                                                             tips:['Aterrisse suavemente','Tronco ereto','Alternância explosiva'] },
  'Ponte de Glúteo':        { icon:'🌉', muscles:'Glúteos, Isquiotibiais, Core',          desc:'Deitado de costas, joelhos dobrados, pés no chão. Eleve o quadril contraindo os glúteos até linha reta com o tronco.',                                                                  tips:['Contraia os glúteos no topo','Segure 1–2 segundos','Pés paralelos e planos'] },
  'Hip Thrust':             { icon:'💺', muscles:'Glúteos, Isquiotibiais',                desc:'Costas apoiadas em banco, quadril ao chão. Empurre o quadril para cima ativando os glúteos.',                                                                                            tips:['Pé plano no chão','Glúteo bem contraído no topo','Queixo para o peito'] },
  'Donkey Kick':            { icon:'🦵', muscles:'Glúteos, Core',                         desc:'Em quatro apoios, chute uma perna para trás e para cima mantendo o joelho dobrado a 90°.',                                                                                              tips:['Quadril nivelado','Não torça o tronco','Contraia o glúteo no topo'] },
  'Fire Hydrant':           { icon:'🚒', muscles:'Glúteo Médio, Core',                    desc:'Em quatro apoios, eleve lateralmente uma perna a 90° do corpo.',                                                                                                                         tips:['Quadril nivelado','Movimento no quadril, não na coluna','Controle a descida'] },
  'Prancha':                { icon:'📐', muscles:'Core, Ombros, Glúteos',                 desc:'Apoiado nos antebraços e pontas dos pés. Corpo em linha reta paralelo ao chão. Segure a posição.',                                                                                      tips:['Não deixe o quadril cair','Abdômen fortemente contraído','Respire normalmente'] },
  'Escalador':              { icon:'🧗', muscles:'Core, Ombros, Cardio',                  desc:'Em prancha nas mãos, traga alternadamente os joelhos em direção ao peito rapidamente.',                                                                                                  tips:['Quadril nivelado','Ritmo constante','Costas retas'] },
  'Prancha Lateral':        { icon:'📐', muscles:'Oblíquos, Core',                        desc:'Apoiado em um antebraço, corpo em linha reta de lado. Segure a posição.',                                                                                                               tips:['Quadril elevado','Corpo em linha reta','Execute os dois lados'] },
  'Prancha com Toque':      { icon:'✋', muscles:'Core, Ombros',                          desc:'Em prancha, toque alternadamente o ombro oposto com a mão.',                                                                                                                             tips:['Minimize o balanço do quadril','Core ativado','Movimento controlado'] },
  'Prancha Dinâmica':       { icon:'🔄', muscles:'Core, Tríceps, Ombros',                 desc:'Alterne entre prancha nos antebraços e prancha nas mãos.',                                                                                                                              tips:['Quadril estável','Alterne o braço que inicia','Corpo alinhado'] },
  'Crunch Abdominal':       { icon:'🎯', muscles:'Reto Abdominal',                        desc:'Deitado com joelhos dobrados. Eleve os ombros do chão contraindo o abdômen.',                                                                                                           tips:['Não puxe o pescoço','Olhe para o teto','Expire ao subir'] },
  'Elevação de Pernas':     { icon:'🦵', muscles:'Abdômen Inferior, Hip Flexors',         desc:'Deitado de costas, pernas estendidas. Eleve-as até 90° e desça controlado.',                                                                                                            tips:['Lombar colada ao chão','Pernas retas','Desça lentamente'] },
  'Bicicleta Abdominal':    { icon:'🚲', muscles:'Oblíquos, Reto Abdominal',              desc:'Deitado, pernas em pedalada alternada enquanto torce o tronco para cada lado.',                                                                                                         tips:['Cotovelo toca o joelho oposto','Gire o tronco todo','Ritmo controlado'] },
  'Russian Twist':          { icon:'🔄', muscles:'Oblíquos, Core',                        desc:'Sentado com tronco inclinado e pés elevados. Gire o tronco de lado a lado.',                                                                                                            tips:['Pés elevados = mais difícil','Gire o tronco todo','Abdômen contraído'] },
  'Superman':               { icon:'🦸', muscles:'Lombar, Glúteos, Posteriores',          desc:'Deitado de barriga para baixo, eleve braços e pernas simultaneamente.',                                                                                                                  tips:['Contraia glúteos e lombar','Segure 2s no topo','Movimento controlado'] },
  'Sit-Up Completo':        { icon:'🎯', muscles:'Reto Abdominal, Flexores',              desc:'Deitado, suba o tronco completamente até ficar sentado.',                                                                                                                                tips:['Use o abdômen, não o impulso','Desça controlado','Joelhos dobrados'] },
  'Desenvolvimento':        { icon:'💪', muscles:'Deltóides, Tríceps',                    desc:'Em pé, empurre os braços acima da cabeça a partir da altura dos ombros.',                                                                                                               tips:['Não arqueie as costas','Cotovelos à frente','Movimento controlado'] },
  'Elevação Lateral':       { icon:'📐', muscles:'Deltóide Médio',                        desc:'Em pé, eleve os braços lateralmente até a altura dos ombros com cotovelos levemente dobrados.',                                                                                         tips:['Não use impulso','Controle a descida','Ombros longe das orelhas'] },
  'Remada Curvada':         { icon:'🚣', muscles:'Dorsais, Bíceps, Romboides',            desc:'Inclinado para frente, costas retas. Puxe os cotovelos para trás e para cima.',                                                                                                        tips:['Costas retas','Cotovelos junto ao corpo','Aperte escápulas no topo'] },
  'Stiff':                  { icon:'📏', muscles:'Isquiotibiais, Glúteos, Lombar',        desc:'Em pé, incline o tronco para frente mantendo pernas quase estendidas e costas retas.',                                                                                                  tips:['Empurre o quadril para trás','Costas retas sempre','Desça até sentir o alongamento'] },
  'Boa Manhã':              { icon:'🌅', muscles:'Lombar, Isquiotibiais, Glúteos',        desc:'Mãos atrás da cabeça, incline o tronco para frente mantendo costas retas.',                                                                                                             tips:['Empurre o quadril para trás','Não arredonde a lombar','Movimento lento'] },
  'Rosca Direta':           { icon:'💪', muscles:'Bíceps',                                desc:'Em pé, flexione os cotovelos elevando os antebraços até os ombros.',                                                                                                                    tips:['Cotovelos fixos junto ao corpo','Controle a descida','Punhos neutros'] },
  'Rosca Alternada':        { icon:'💪', muscles:'Bíceps',                                desc:'Rosca alternando um braço por vez.',                                                                                                                                                    tips:['Cotovelo fixo','Complete cada lado','Controle a descida'] },
  'Rosca Martelo':          { icon:'🔨', muscles:'Bíceps, Braquiorradial',                desc:'Rosca com punhos em posição neutra (como segurar um martelo).',                                                                                                                         tips:['Cotovelo fixo junto ao corpo','Punho neutro','Controle'] },
  'Tríceps Testa':          { icon:'💪', muscles:'Tríceps',                               desc:'Deitado, braços estendidos acima. Dobre os cotovelos trazendo o peso para perto da testa.',                                                                                             tips:['Cotovelos apontam para o teto','Somente o cotovelo move','Controle a descida'] },
  'Tríceps Banco':          { icon:'💺', muscles:'Tríceps',                               desc:'Apoiado em banco, desça o corpo dobrando os cotovelos.',                                                                                                                                tips:['Cotovelos apontam para trás','Não abra os cotovelos','Desça controlado'] },
  'Crucifixo':              { icon:'✝️', muscles:'Peitoral, Deltóides',                   desc:'Deitado, braços abertos. Feche-os acima do peito como um abraço.',                                                                                                                      tips:['Cotovelos levemente dobrados','Abra até sentir o alongamento','Controle'] },
  'Flexão de Joelho':       { icon:'💪', muscles:'Peitoral, Tríceps',                    desc:'Flexão com os joelhos apoiados no chão. Ideal para iniciantes.',                                                                                                                         tips:['Corpo reto do joelho à cabeça','Mãos na largura dos ombros','Peito quase no chão'] },
  'Flexão Diamante':        { icon:'💎', muscles:'Tríceps, Peitoral Interno',             desc:'Mãos juntas formando triângulo. Foco no tríceps.',                                                                                                                                      tips:['Cotovelos fechados','Desça controlado','Tronco reto'] },
  'Pike Push-Up':           { icon:'🔻', muscles:'Deltóides, Tríceps',                    desc:'Quadril bem elevado formando V invertido. Desça a cabeça entre os braços.',                                                                                                             tips:['Quadril bem alto','Cabeça vai entre os braços','Cotovelos levemente para fora'] },
  'Burpee – Prancha':       { icon:'⚡', muscles:'Corpo Todo, Cardio',                    desc:'Agache, coloque mãos no chão, salte os pés para prancha, execute flexão, volte e salte.',                                                                                               tips:['Movimento fluido','Core ativo','Aterrisse suavemente'] },
  'Pular Corda':            { icon:'🪢', muscles:'Panturrilha, Cardio',                   desc:'Pule com os pés juntos ou alternados, girando uma corda real ou imaginária.',                                                                                                            tips:['Aterrissagem na ponta dos pés','Joelhos levemente dobrados','Punhos fazem o giro'] },
  'Skipping':               { icon:'🏃', muscles:'Cardio, Panturrilha',                   desc:'Corrida estacionária com elevação exagerada dos joelhos na ponta dos pés.',                                                                                                              tips:['Joelhos acima do quadril','Ponta dos pés','Ritmo constante'] },
  'Star Jump':              { icon:'⭐', muscles:'Cardio, Corpo Todo',                    desc:'Salte com braços e pernas se abrindo em estrela.',                                                                                                                                       tips:['Aterrissagem suave','Explosão na saída','Controle na aterrissagem'] },
  'Elevação de Panturrilha':{ icon:'🦶', muscles:'Gastrocnêmio, Sóleo',                  desc:'Em pé, eleve os calcanhares ficando na ponta dos pés.',                                                                                                                                  tips:['Extensão total no topo','Desça lentamente','Apoio se necessário'] },
  'Step Up':                { icon:'⬆️', muscles:'Quadríceps, Glúteos',                   desc:'Suba em um degrau com uma perna por vez.',                                                                                                                                              tips:['Calcanhar totalmente no degrau','Suba devagar','Alterne as pernas'] },
  'Hiperextensão':          { icon:'📏', muscles:'Lombar, Glúteos',                       desc:'Deitado de barriga para baixo, eleve o tronco contraindo a lombar.',                                                                                                                    tips:['Movimento controlado','Não hiperestenda demais','Mãos atrás da cabeça'] },
  'Tesoura':                { icon:'✂️', muscles:'Abdômen Inferior',                      desc:'Deitado de costas, pernas levemente elevadas. Alterne-as verticalmente.',                                                                                                               tips:['Lombar colada ao chão','Pernas retas','Movimentos alternados'] },
};

// Exercises that require gym equipment (everything else is home/bodyweight)
const _GYM_NAMES = new Set([
  'Desenvolvimento','Elevação Lateral','Remada Curvada','Stiff','Boa Manhã',
  'Rosca Direta','Rosca Alternada','Rosca Martelo',
  'Tríceps Testa','Crucifixo','Hip Thrust'
]);

// Category labels derived from primary muscle group
const _CAT_MAP = {
  'Quadríceps':'Pernas','Glúteos':'Glúteo','Cardio':'Cardio',
  'Peitoral':'Peito','Core':'Core','Oblíquos':'Abdômen',
  'Reto Abdominal':'Abdômen','Abdômen Inferior':'Abdômen',
  'Bíceps':'Bíceps','Tríceps':'Tríceps','Deltóides':'Ombro',
  'Deltóide Médio':'Ombro','Dorsais':'Costas','Isquiotibiais':'Posterior',
  'Lombar':'Costas','Panturrilha':'Panturrilha','Gastrocnêmio':'Panturrilha',
  'Glúteo Médio':'Glúteo','Romboides':'Costas'
};

const BUILTIN_EXERCISES = Object.keys(EXERCISE_INFO).map(name => {
  const primary  = EXERCISE_INFO[name].muscles.split(',')[0].trim();
  const category = _CAT_MAP[primary] || primary;
  const location = _GYM_NAMES.has(name) ? 'gym' : 'home';
  return { name, category, location };
});

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
// PROFILE SCREEN
// ════════════════════════════════════════════════════════════════════════════
function showProfileScreen() {
  showScreen('profile');
  state.profile = { sex: '', location: '' };
  $('profile-age').value    = '';
  $('profile-height').value = '';
  $('profile-weight').value = '';
  document.querySelectorAll('.sex-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.loc-btn').forEach(b => b.classList.remove('active'));
  $('bmi-preview').style.display    = 'none';
  $('btn-generate-plan').disabled   = true;
}

function onLocSelect(loc) {
  state.profile.location = loc;
  document.querySelectorAll('.loc-btn').forEach(b => b.classList.remove('active'));
  $('loc-btn-' + loc).classList.add('active');
  updateProfileUI();
}

function onSexSelect(sex) {
  state.profile.sex = sex;
  document.querySelectorAll('.sex-btn').forEach(b => b.classList.remove('active'));
  $('sex-btn-' + sex).classList.add('active');
  updateProfileUI();
}

function updateProfileUI() {
  const age    = parseInt($('profile-age').value)      || 0;
  const height = parseInt($('profile-height').value)   || 0;
  const weight = parseFloat($('profile-weight').value) || 0;
  const sex      = state.profile ? state.profile.sex      : '';
  const location = state.profile ? state.profile.location : '';

  if (height > 0 && weight > 0) {
    const bmi = weight / ((height / 100) ** 2);
    let label;
    if      (bmi < 18.5) label = 'Abaixo do peso';
    else if (bmi < 25)   label = 'Peso normal';
    else if (bmi < 30)   label = 'Sobrepeso';
    else                 label = 'Obesidade';
    $('bmi-value').textContent         = bmi.toFixed(1);
    $('fitness-level-preview').textContent = label;
    $('bmi-preview').style.display     = 'flex';
  } else {
    $('bmi-preview').style.display = 'none';
  }

  const valid = age >= 14 && age <= 90 && height >= 120 && height <= 220
             && weight >= 30 && weight <= 200 && sex && location;
  $('btn-generate-plan').disabled = !valid;
}

async function submitProfile() {
  const age      = parseInt($('profile-age').value);
  const height   = parseInt($('profile-height').value);
  const weight   = parseFloat($('profile-weight').value);
  const sex      = state.profile ? state.profile.sex      : '';
  const location = state.profile ? state.profile.location : '';

  if (!age || !height || !weight || !sex || !location) {
    showToast('Preencha todos os campos e escolha o local.', 'error');
    return;
  }

  state.profile = { age, sex, height, weight, location };

  const customExercises = state.customExercises || [];
  state.plan      = generateWorkoutPlan(state.profile, customExercises);
  state.planIndex = -1;
  state.setIndex  = 0;
  state.setReps   = 0;

  if (!state.plan.length) {
    showToast('Não foi possível gerar o treino. Tente novamente.', 'error');
    return;
  }

  showExerciseSelection();
}

// ════════════════════════════════════════════════════════════════════════════
// WORKOUT PLAN GENERATOR
// ════════════════════════════════════════════════════════════════════════════
function generateWorkoutPlan(profile, customExercises) {
  const bmi = profile.weight / ((profile.height / 100) ** 2);

  let sets, repsPerSet, restSeconds, level;
  if (profile.age > 60 || bmi > 33) {
    level = 'Iniciante';    sets = 2; repsPerSet = 10; restSeconds = 90;
  } else if (profile.age > 45 || bmi > 27) {
    level = 'Intermediário'; sets = 3; repsPerSet = 12; restSeconds = 60;
  } else {
    level = 'Avançado';     sets = 3; repsPerSet = 15; restSeconds = 45;
  }

  // Built-in exercises with categories
  const BUILTIN = [
    { name: 'Agachamento', category: 'Pernas',  location: 'home' },
    { name: 'Polichinelo',  category: 'Cardio',  location: 'home' },
    { name: 'Flexão',       category: 'Peito',   location: 'home' },
    { name: 'Avanço',       category: 'Pernas',  location: 'home' },
    { name: 'Joelho Alto',  category: 'Cardio',  location: 'home' },
  ];

  const pool = [
    ...BUILTIN,
    ...customExercises.map(e => ({ name: e.name, category: e.category || 'Geral', location: e.location || 'home' }))
  ];

  const used = new Set();
  function pick(arr) {
    const avail = arr.filter(e => !used.has(e.name));
    if (!avail.length) return null;
    const ex = avail[Math.floor(Math.random() * avail.length)];
    used.add(ex.name);
    return ex;
  }

  // Filter by location preference
  // home: ONLY bodyweight exercises (location:'home')
  // gym:  ALL exercises (home + gym with equipment)
  const loc = profile.location || 'home';
  const locationFiltered = loc === 'gym'
    ? pool
    : pool.filter(e => e.location === 'home' || !e.location);

  const cardio = locationFiltered.filter(e => e.category === 'Cardio');
  const legs   = locationFiltered.filter(e => ['Pernas','Agachamento','Afundo'].includes(e.category));
  const upper  = locationFiltered.filter(e => ['Peito','Ombro','Bíceps','Tríceps','Costas','Flexão'].includes(e.category));
  const core   = locationFiltered.filter(e => ['Abdômen','Prancha','Core'].includes(e.category));
  const glutes = locationFiltered.filter(e => e.category === 'Glúteo');

  const selected = [];

  // Warm-up cardio
  const warmup = pick(cardio);
  if (warmup) selected.push(warmup);

  // Legs (more for women)
  const legCount = profile.sex === 'F' ? 2 : 1;
  for (let i = 0; i < legCount; i++) { const e = pick(legs); if (e) selected.push(e); }

  // Core
  const c = pick(core);
  if (c) selected.push(c);

  // Upper body (more for men)
  const upperCount = profile.sex === 'M' ? 2 : 1;
  for (let i = 0; i < upperCount; i++) { const e = pick(upper); if (e) selected.push(e); }

  // Glute focus for women
  if (profile.sex === 'F') { const g = pick(glutes) || pick(legs); if (g) selected.push(g); }

  // Finish cardio
  const finish = pick(cardio);
  if (finish) selected.push(finish);

  // Guarantee at least 4 exercises
  while (selected.length < 4) {
    const e = pick(locationFiltered);
    if (!e) break;
    selected.push(e);
  }

  return selected.map(ex => ({ name: ex.name, category: ex.category, sets, repsPerSet, restSeconds, level }));
}

// ════════════════════════════════════════════════════════════════════════════
// EXERCISE SELECTION SCREEN
// ════════════════════════════════════════════════════════════════════════════
function showExerciseSelection() {
  const item0    = state.plan[0];
  const locLabel = state.profile.location === 'home' ? '🏠 Casa' : '🏋️ Academia';
  $('select-subtitle').textContent =
    `${locLabel} · ${item0?.level || ''} · ${state.plan.length} exercícios`;

  renderSelectionList();
  showScreen('select');
}

function renderSelectionList() {
  const list = $('select-list');
  list.innerHTML = '';

  state.plan.forEach((item, idx) => {
    const info   = EXERCISE_INFO[item.name] || {};
    const isHome = item.location === 'home';
    const locTag = isHome
      ? '<span class="sel-card-loc loc-home-tag">🏠 Casa</span>'
      : '<span class="sel-card-loc loc-gym-tag">🏋️ Academia</span>';

    const card = document.createElement('div');
    card.className = 'sel-card active';
    card.dataset.idx = idx;
    card.innerHTML = `
      <div class="sel-check">✓</div>
      <span class="sel-card-icon">${info.icon || '🏋️'}</span>
      <div class="sel-card-info">
        <div class="sel-card-name">${item.name}</div>
        <div class="sel-card-meta">${item.category} · ${item.sets}×${item.repsPerSet} reps</div>
      </div>
      ${locTag}
      <button class="btn-swap" data-idx="${idx}">↺ Trocar</button>
    `;

    // Toggle include/exclude
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-swap')) return;
      card.classList.toggle('active');
      card.classList.toggle('inactive');
      const check = card.querySelector('.sel-check');
      check.textContent = card.classList.contains('active') ? '✓' : '';
    });

    // Swap exercise
    card.querySelector('.btn-swap').addEventListener('click', (e) => {
      e.stopPropagation();
      swapExercise(idx);
    });

    list.appendChild(card);
  });
}

function swapExercise(idx) {
  const current   = state.plan[idx];
  const currentNames = new Set(state.plan.map(e => e.name));
  const loc       = state.profile.location || 'home';
  const allEx     = state.customExercises || [];

  // Pool of same category and location not already in plan
  const BUILTIN_POOL = [
    { name:'Agachamento', category:'Pernas',  location:'home' },
    { name:'Polichinelo', category:'Cardio',  location:'home' },
    { name:'Flexão',      category:'Peito',   location:'home' },
    { name:'Avanço',      category:'Pernas',  location:'home' },
    { name:'Joelho Alto', category:'Cardio',  location:'home' },
  ];
  const fullPool = [...BUILTIN_POOL, ...allEx.map(e => ({ name:e.name, category:e.category, location:e.location||'home' }))];

  const candidates = fullPool.filter(e =>
    !currentNames.has(e.name) &&
    e.category === current.category &&
    (e.location === loc || e.location === 'both')
  );

  if (!candidates.length) {
    showToast('Sem alternativas disponíveis para essa categoria.', 'info');
    return;
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  state.plan[idx] = { ...state.plan[idx], name: pick.name, category: pick.category, location: pick.location };
  renderSelectionList();
}

function startPlanFromSelection() {
  const cards = document.querySelectorAll('#select-list .sel-card');
  const active = [];
  cards.forEach((card, i) => {
    if (card.classList.contains('active')) active.push(state.plan[i]);
  });

  if (!active.length) {
    showToast('Selecione ao menos um exercício.', 'error');
    return;
  }

  state.plan      = active;
  state.planIndex = -1;
  state.setIndex  = 0;
  state.setReps   = 0;
  advanceToNextExercise();
}

function regenPlan() {
  const customExercises = state.customExercises || [];
  state.plan = generateWorkoutPlan(state.profile, customExercises);
  showToast('Novo treino gerado!', 'success', 1500);
  renderSelectionList();
  const locLabel = state.profile.location === 'home' ? '🏠 Casa' : '🏋️ Academia';
  $('select-subtitle').textContent =
    `${locLabel} · ${state.plan[0]?.level || ''} · ${state.plan.length} exercícios`;
}

// ════════════════════════════════════════════════════════════════════════════
// DEMO SCREEN
// ════════════════════════════════════════════════════════════════════════════
function showExerciseDemo() {
  const item = state.plan[state.planIndex];
  const info = EXERCISE_INFO[item.name] || {
    icon: '🏋️',
    muscles: item.category || '—',
    desc: `Execute o exercício ${item.name} com postura correta e movimento controlado.`,
    tips: ['Foco na postura', 'Movimento controlado', 'Respire regularmente']
  };

  $('demo-ex-num').textContent    = state.planIndex + 1;
  $('demo-ex-total').textContent  = state.plan.length;
  $('demo-name').textContent      = item.name;
  $('demo-muscles').textContent   = info.muscles;
  $('demo-description').textContent = info.desc;
  $('demo-sets').textContent      = item.sets;
  $('demo-reps').textContent      = item.repsPerSet;
  $('demo-level').textContent     = item.level;

  const tipsList = $('demo-tips');
  tipsList.innerHTML = '';
  info.tips.forEach(tip => {
    const li = document.createElement('li');
    li.textContent = tip;
    tipsList.appendChild(li);
  });

  $('demo-countdown').style.display    = 'none';
  $('btn-demo-start').style.display    = 'inline-flex';
  $('btn-demo-skip').style.display     = state.planIndex < state.plan.length - 1 ? 'inline-flex' : 'none';

  showScreen('demo');

  if (state.char3d) {
    state.char3d.resize();
    const customEx = (state.customExercises || []).find(e => e.name === item.name);
    if (customEx?.animFrames) {
      state.char3d.playRecorded(customEx.animFrames, customEx.motionRange);
    } else if (customEx) {
      state.char3d.stop();
    } else {
      state.char3d.playExercise(item.name);
    }
  }
}

async function startGuidedExercise() {
  $('btn-demo-start').style.display = 'none';
  $('btn-demo-skip').style.display  = 'none';

  // Countdown 3 2 1
  const cd = $('demo-countdown');
  cd.style.display = 'block';
  for (let i = 3; i > 0; i--) {
    $('demo-count-num').textContent = i;
    await new Promise(r => setTimeout(r, 1000));
  }
  cd.style.display = 'none';

  if (state.char3d) state.char3d.stop();
  showScreen('workout');

  if (!state.workout.active) {
    await initGuidedWorkout();
  } else {
    switchGuidedExercise();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GUIDED WORKOUT ENGINE
// ════════════════════════════════════════════════════════════════════════════
async function initGuidedWorkout() {
  if (!window.ExerciseClassifier || !window.PoseDetector) {
    showToast('Módulos não carregados. Verifique a internet e recarregue.', 'error', 6000);
    return;
  }

  const item = state.plan[state.planIndex];

  state.workout = {
    active: false, startTime: null,
    exercises: {}, currentExercise: item.name,
    totalScore: 0, lastRepCount: 0
  };
  state.setReps = 0;

  state.classifier = new window.ExerciseClassifier();
  state.classifier.setCustomExercises(state.customExercises);
  state.classifier.setExpectedExercise(item.name);

  updateGuidedPanel();
  setFeedback(['Inicializando câmera…']);
  $('camera-status').textContent = 'Inicializando câmera…';

  if (state.poseDetector) { state.poseDetector.stop(); state.poseDetector = null; }

  state.poseDetector = await initPose('workout-video', 'workout-canvas', onGuidedPoseResults);
  if (!state.poseDetector) return;

  state.workout.active    = true;
  state.workout.startTime = Date.now();
  $('camera-status').textContent = 'Câmera ativa – posicione-se em frente';

  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    if (!state.workout.active) return;
    const elapsed = Math.floor((Date.now() - state.workout.startTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    $('timer').textContent = `${m}:${s}`;
  }, 1000);
}

function switchGuidedExercise() {
  const item = state.plan[state.planIndex];
  state.setReps = 0;
  if (state.classifier) state.classifier.setExpectedExercise(item.name);
  updateGuidedPanel();
  setFeedback([`Execute: ${item.name}`]);
}

function updateGuidedPanel() {
  const item = state.plan[state.planIndex];
  const info = EXERCISE_INFO[item.name] || {};

  $('exercise-name').textContent   = item.name;
  $('rep-count').textContent       = state.setReps;
  $('workout-score').textContent   = state.workout.totalScore || 0;
  $('quality-bar').style.width     = '0%';
  $('quality-value').textContent   = '—';

  $('plan-progress').style.display = 'flex';
  $('plan-ex-label').textContent   = `Exercício ${state.planIndex + 1} / ${state.plan.length}`;
  $('plan-set-label').textContent  = `Série ${state.setIndex + 1} / ${item.sets}`;
  $('plan-rep-goal').textContent   = `Meta: ${item.repsPerSet} reps`;
  $('plan-ex-icon').textContent    = info.icon || '🏋️';
}

function onGuidedPoseResults(results) {
  if (!state.workout.active || !state.classifier) return;

  const landmarks = results.poseLandmarks;
  const info = $('landmark-info');
  if (info) {
    info.textContent = landmarks
      ? `${landmarks.filter(l => l.visibility > 0.5).length}/33 pontos`
      : '';
  }

  if (!landmarks) {
    setFeedback(['Posicione-se em frente à câmera e garanta boa iluminação.']);
    return;
  }

  const cl = state.classifier.update(landmarks);
  const { repCompleted, quality, feedback, pointsEarned } = cl;

  // Quality bar (always updating)
  if (quality !== undefined && quality !== null) {
    const pct = Math.round(quality * 100);
    $('quality-bar').style.width             = `${pct}%`;
    $('quality-value').textContent           = `${pct}%`;
    $('quality-bar').style.backgroundPosition = `${100 - pct}% center`;
  }

  if (feedback && feedback.length) setFeedback(feedback);

  if (repCompleted) onGuidedRep(quality, pointsEarned);
}

function onGuidedRep(quality, pointsEarned) {
  const item = state.plan[state.planIndex];
  const exName = item.name;

  state.setReps++;
  state.workout.totalScore += pointsEarned || 0;
  $('workout-score').textContent = state.workout.totalScore;

  if (!state.workout.exercises[exName]) {
    state.workout.exercises[exName] = {
      name: exName, type: 'guided', reps: 0,
      qualityScores: [], issues: new Set(), score: 0
    };
  }
  state.workout.exercises[exName].reps++;
  state.workout.exercises[exName].qualityScores.push(quality);
  state.workout.exercises[exName].score += pointsEarned || 0;

  const repEl = $('rep-count');
  repEl.textContent = state.setReps;
  repEl.classList.remove('bump');
  void repEl.offsetWidth;
  repEl.classList.add('bump');
  setTimeout(() => repEl.classList.remove('bump'), 300);

  $('plan-rep-goal').textContent = `${state.setReps} / ${item.repsPerSet}`;

  if (state.setReps >= item.repsPerSet) completeSet();
}

function completeSet() {
  clearInterval(state.restTimer);
  const item = state.plan[state.planIndex];
  state.setIndex++;

  if (state.setIndex >= item.sets) {
    showToast(`${item.name} concluído! 💪`, 'success', 2000);
    setTimeout(() => advanceToNextExercise(), 1800);
  } else {
    const remaining = item.sets - state.setIndex;
    startRestCountdown(
      item.restSeconds,
      `${remaining} série${remaining !== 1 ? 's' : ''} de ${item.name} restante${remaining !== 1 ? 's' : ''}`
    );
  }
}

function startRestCountdown(seconds, label) {
  const overlay = $('rest-overlay');
  overlay.style.display    = 'flex';
  $('rest-next-label').textContent = label;
  $('rest-countdown').textContent  = seconds;

  let remaining = seconds;
  clearInterval(state.restTimer);
  state.restTimer = setInterval(() => {
    remaining--;
    $('rest-countdown').textContent = remaining;
    if (remaining <= 0) {
      clearInterval(state.restTimer);
      endRest();
    }
  }, 1000);
}

function endRest() {
  $('rest-overlay').style.display = 'none';
  state.setReps = 0;
  const item = state.plan[state.planIndex];
  $('plan-set-label').textContent = `Série ${state.setIndex + 1} / ${item.sets}`;
  $('plan-rep-goal').textContent  = `Meta: ${item.repsPerSet} reps`;
  $('rep-count').textContent      = 0;
  setFeedback([`Série ${state.setIndex + 1} — pode começar!`]);
}

function advanceToNextExercise() {
  state.planIndex++;
  state.setIndex = 0;
  state.setReps  = 0;

  if (state.planIndex >= state.plan.length) {
    endGuidedWorkout();
    return;
  }

  showExerciseDemo();
}

function skipExercise() {
  showToast('Exercício pulado.', 'info', 1500);
  advanceToNextExercise();
}

async function endGuidedWorkout() {
  state.workout.active = false;
  clearInterval(state.timerInterval);
  clearInterval(state.restTimer);
  $('rest-overlay').style.display = 'none';

  if (state.poseDetector) { state.poseDetector.stop(); state.poseDetector = null; }

  const duration = state.workout.startTime
    ? Math.floor((Date.now() - state.workout.startTime) / 1000)
    : 0;

  const exercisesForReport = {};
  for (const [name, ex] of Object.entries(state.workout.exercises)) {
    exercisesForReport[name] = { ...ex, issues: Array.from(ex.issues || new Set()) };
  }

  const stats     = getLocalStats();
  const totalReps = Object.values(exercisesForReport).reduce((s, e) => s + e.reps, 0);

  const workoutData = {
    duration,
    exercises:        exercisesForReport,
    totalScore:       state.workout.totalScore,
    totalWorkouts:    stats.totalWorkouts + 1,
    totalAllTimeReps: stats.totalReps,
    createdAt:        new Date().toISOString()
  };

  const report = _generateReport(workoutData);

  saveLocalStats({
    totalWorkouts: stats.totalWorkouts + 1,
    totalReps:     stats.totalReps + totalReps,
    totalScore:    stats.totalScore + state.workout.totalScore
  });

  try {
    await _saveWorkout({ ...workoutData, report: { summary: report.summary, totalScore: report.totalScore, totalReps: report.totalReps, level: report.level } });
  } catch (err) {
    console.warn('[FitAI] Erro ao salvar treino:', err);
  }

  renderReport(report, duration);
  showScreen('report');
  updateHomeStats();
  setTimeout(() => animateScoreCircle(report.totalScore), 100);
}

function abandonWorkout() {
  if (!confirm('Abandonar o treino? O progresso atual será perdido.')) return;
  clearInterval(state.timerInterval);
  clearInterval(state.restTimer);
  state.workout.active = false;
  if (state.poseDetector) { state.poseDetector.stop(); state.poseDetector = null; }
  $('rest-overlay').style.display  = 'none';
  $('plan-progress').style.display = 'none';
  showScreen('home');
}

// ════════════════════════════════════════════════════════════════════════════
// POSE INITIALISATION
// ════════════════════════════════════════════════════════════════════════════
async function initPose(videoId, canvasId, onResults) {
  const video  = $(videoId);
  const canvas = $(canvasId);
  if (!video || !canvas) return null;

  const detector = new window.PoseDetector(video, canvas, onResults);

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
  if (!window.ExerciseClassifier) {
    showToast('Erro: módulo de classificação não carregou. Verifique a internet e recarregue.', 'error', 6000);
    console.error('[FitAI] ExerciseClassifier is null – classifier.js may have failed to load');
    return;
  }
  if (!window.PoseDetector) {
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
  state.classifier = new window.ExerciseClassifier();
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

  // Quality bar – only when an exercise is actively detected
  if (exercise && quality !== undefined && quality !== null) {
    const pct = Math.round(quality * 100);
    $('quality-bar').style.width             = `${pct}%`;
    $('quality-value').textContent           = `${pct}%`;
    $('quality-bar').style.backgroundPosition = `${100 - pct}% center`;
  } else if (!exercise) {
    $('quality-bar').style.width   = '0%';
    $('quality-value').textContent = '—';
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
  const report = _generateReport(workoutData);

  // Update local stats
  const newStats = {
    totalWorkouts: stats.totalWorkouts + 1,
    totalReps:     stats.totalReps + totalReps,
    totalScore:    stats.totalScore + state.workout.totalScore
  };
  saveLocalStats(newStats);

  // Save to Firestore / localStorage
  try {
    await _saveWorkout({
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
  if (!window.PoseDetector) {
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

  const angles = window.PoseDetector.getKeyAngles(results.poseLandmarks);
  if (angles && state.recording.recorder) {
    state.recording.recorder.addFrame(angles, results.poseLandmarks);
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
  state.recording.recorder = new window.ExerciseRecorder();
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
    const id = await _saveCustomExercise(template);
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
    const workouts = await _getWorkouts();
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
// EXERCISE LIBRARY
// ════════════════════════════════════════════════════════════════════════════
function showExerciseLibrary() {
  showScreen('exercises');

  if (window.FitAIChar && !state.charLib) {
    state.charLib = new window.FitAIChar('char-canvas-lib');
  } else if (state.charLib) {
    state.charLib.resize();
  }

  state.exlibFilter = 'all';
  state.exlibSearch = '';

  const searchEl = $('exlib-search');
  if (searchEl) searchEl.value = '';

  // Reset tab active states
  document.querySelectorAll('.exlib-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.filter === 'all');
  });

  renderExLibList();
}

function renderExLibList() {
  const filter = state.exlibFilter || 'all';
  const search = (state.exlibSearch || '').trim().toLowerCase();

  // Merge builtin + custom, deduplicate by name
  const allEx = [...BUILTIN_EXERCISES.map(e => ({ ...e, isCustom: false }))];
  (state.customExercises || []).forEach(ce => {
    if (!allEx.find(e => e.name === ce.name)) {
      allEx.push({ name: ce.name, category: ce.category || 'Geral', location: ce.location || 'home', id: ce.id, isCustom: true });
    }
  });

  let items = allEx;
  if (filter !== 'all') items = items.filter(e => e.location === filter);
  if (search) items = items.filter(e => e.name.toLowerCase().includes(search) || (e.category || '').toLowerCase().includes(search));

  // Sort alphabetically
  items.sort((a, b) => a.name.localeCompare(b.name, 'pt'));

  const list = $('exlib-list');
  if (!list) return;
  list.innerHTML = '';

  if (items.length === 0) {
    list.innerHTML = '<p style="color:#666;font-size:14px;text-align:center;padding:24px 0;">Nenhum exercício encontrado.</p>';
    return;
  }

  items.forEach(ex => {
    const locIcon = ex.location === 'gym' ? '🏋️' : '🏠';
    const item = document.createElement('div');
    item.className = 'exlib-item';
    item.dataset.name = ex.name;
    item.innerHTML = `
      <div class="exlib-item-loc">${locIcon}</div>
      <div class="exlib-item-info">
        <div class="exlib-item-name">${ex.name}</div>
        <div class="exlib-item-cat">${ex.category || 'Geral'}</div>
      </div>
      ${ex.isCustom
        ? '<button class="btn-exlib-delete" title="Apagar exercício">🗑</button>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>'
      }
    `;
    item.addEventListener('click', () => selectLibEx(ex));
    if (ex.isCustom) {
      item.querySelector('.btn-exlib-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteLibEx(ex);
      });
    }
    list.appendChild(item);
  });

  // Re-highlight selected item if any
  if (state.exlibSelected) {
    const active = list.querySelector(`[data-name="${CSS.escape(state.exlibSelected)}"]`);
    if (active) active.classList.add('active');
  }
}

function selectLibEx(ex) {
  state.exlibSelected = ex.name;

  // Highlight item
  document.querySelectorAll('.exlib-item').forEach(el => {
    el.classList.toggle('active', el.dataset.name === ex.name);
  });

  // Update preview info
  const info = EXERCISE_INFO[ex.name] || {};
  $('exlib-preview-name').textContent = ex.name;
  $('exlib-preview-meta').textContent = info.muscles || ex.category || 'Geral';

  // Play 3D character — use real recorded frames for custom exercises
  if (state.charLib) {
    state.charLib.resize();
    const fullEx = (state.customExercises || []).find(e => e.name === ex.name);
    if (fullEx?.animFrames) {
      state.charLib.playRecorded(fullEx.animFrames, fullEx.motionRange);
    } else if (fullEx) {
      state.charLib.stop();
    } else {
      state.charLib.playExercise(ex.name);
    }
  }
}

async function deleteLibEx(ex) {
  if (!confirm(`Apagar "${ex.name}"? Esta ação não pode ser desfeita.`)) return;

  try {
    await _deleteCustomExercise(ex.id);
    state.customExercises = (state.customExercises || []).filter(e => e.id !== ex.id);

    if (state.exlibSelected === ex.name) {
      state.exlibSelected = null;
      $('exlib-preview-name').textContent = 'Selecione um exercício';
      $('exlib-preview-meta').textContent = '—';
      if (state.charLib) state.charLib.stop();
    }

    showToast(`"${ex.name}" apagado.`, 'success');
    renderExLibList();

    const chip = $('custom-exercises-chip');
    if (chip) {
      const n = state.customExercises.length;
      chip.textContent = n > 0
        ? `+ ${n} Personalizado${n !== 1 ? 's' : ''}`
        : '+ Personalizados';
    }
  } catch (err) {
    showToast('Erro ao apagar: ' + err.message, 'error');
  }
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
  _on('btn-start-workout',   'click', showProfileScreen);
  _on('btn-record-new-home', 'click', openRecordScreen);
  _on('btn-history',         'click', loadHistory);
  _on('btn-exercises',       'click', showExerciseLibrary);

  // Profile screen
  _on('btn-generate-plan', 'click', submitProfile);
  _on('btn-back-profile',  'click', () => showScreen('home'));
  _on('loc-btn-home', 'click', () => onLocSelect('home'));
  _on('loc-btn-gym',  'click', () => onLocSelect('gym'));
  _on('sex-btn-M', 'click', () => onSexSelect('M'));
  _on('sex-btn-F', 'click', () => onSexSelect('F'));
  _on('profile-age',    'input', updateProfileUI);
  _on('profile-height', 'input', updateProfileUI);
  _on('profile-weight', 'input', updateProfileUI);

  // Exercise selection screen
  _on('btn-start-plan', 'click', startPlanFromSelection);
  _on('btn-regen-plan', 'click', regenPlan);

  // Demo screen
  _on('btn-demo-start', 'click', startGuidedExercise);
  _on('btn-demo-skip',  'click', skipExercise);

  // Workout (guided)
  _on('btn-abandon-workout', 'click', abandonWorkout);
  _on('btn-skip-set',        'click', completeSet);
  _on('btn-skip-rest',       'click', () => { clearInterval(state.restTimer); endRest(); });
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

  // Exercise library
  _on('btn-back-exercises', 'click', () => {
    if (state.charLib) state.charLib.stop();
    showScreen('home');
  });
  document.querySelectorAll('.exlib-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.exlib-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.exlibFilter = tab.dataset.filter;
      renderExLibList();
    });
  });
  _on('exlib-search', 'input', (e) => {
    state.exlibSearch = e.target.value;
    renderExLibList();
  });

  console.info('[FitAI] Todos os listeners registrados com sucesso.');

  // 3-D character preview
  if (window.FitAIChar) {
    state.char3d = new window.FitAIChar('char-canvas');
  }

  // Load custom exercises in background – never blocks UI
  _loadCustomExercises();
}

async function _loadCustomExercises() {
  try {
    if (typeof _getCustomExercises !== 'function') return;
    state.customExercises = await _getCustomExercises();
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
