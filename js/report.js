// report.js
// gera o relatório de desempenho ao final de cada treino
// calcula nível, conquistas, pontos fortes e dicas de melhoria

// === NÍVEL DO USUÁRIO ===
// calculado com base em todas as reps acumuladas e número de treinos
function calcLevel(totalAllTimeReps, totalWorkouts) {
  if (totalAllTimeReps < 50 || totalWorkouts < 3) return 'Iniciante';
  if (totalAllTimeReps <= 150) return 'Intermediário';
  return 'Avançado';
}

// formata segundos em "Xmin XXs" ou só "XXs" se for menos de 1 minuto
function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}min ${s.toString().padStart(2, '0')}s`;
}

// === CONQUISTAS ===
// lista de conquistas possíveis – a primeira que bater a condição é mostrada
const ACHIEVEMENTS = [
  {
    id:          'first_workout',
    icon:        '🏅',
    title:       'Primeira Série!',
    description: 'Você completou seu primeiro treino com o FitAI.',
    condition:   (data) => data.totalWorkouts === 1
  },
  {
    id:          'centurion',
    icon:        '💯',
    title:       'Centurião',
    description: 'Mais de 100 repetições acumuladas. Impressionante!',
    condition:   (data) => data.totalAllTimeReps >= 100
  },
  {
    id:          'five_stars',
    icon:        '⭐',
    title:       'Qualidade 5 Estrelas',
    description: 'Qualidade média acima de 90% neste treino.',
    condition:   (data) => data.avgQuality >= 0.9
  },
  {
    id:          'variety',
    icon:        '🎯',
    title:       'Treino Completo',
    description: 'Realizou 3 ou mais exercícios diferentes em um único treino.',
    condition:   (data) => data.exerciseCount >= 3
  },
  {
    id:          'high_score',
    icon:        '🚀',
    title:       'Pontuação de Elite',
    description: 'Mais de 200 pontos em um único treino!',
    condition:   (data) => data.totalScore >= 200
  },
  {
    id:          'consistency',
    icon:        '🔥',
    title:       'Em Chamas',
    description: 'Completou 20+ repetições em um treino.',
    condition:   (data) => data.totalReps >= 20
  }
];

// === DICAS DE MELHORIA ===
// mapeio os problemas detectados durante o treino para dicas úteis
// a chave 'default' é usada quando não tem problema específico mas a qualidade foi baixa
const TIPS = {
  'Agachamento': {
    'Desça mais': 'No agachamento, tente descer até que as coxas fiquem paralelas ao chão (ângulo de 90°). Pratique com o peso do corpo antes de adicionar carga.',
    'Joelhos passando dos pés': 'Mantenha os joelhos alinhados com os pés ao agachar. Imagine que está "sentando" em uma cadeira atrás de você.',
    'Incline o tronco menos': 'Mantenha o tórax ereto no agachamento. Tente olhar para frente e manter os braços paralelos ao chão.',
    'default': 'Continue praticando o agachamento com foco na técnica. Mantenha pés alinhados com os ombros e joelhos apontando na direção dos dedos dos pés.'
  },
  'Flexão': {
    'Desça mais – aproxime o peito do chão': 'Na flexão, desça até o peito quase tocar o chão. Cotovelos a ~45° do corpo.',
    'Quadril muito baixo – contraia o abdômen': 'Mantenha o corpo reto como uma prancha. Contraia o abdômen e glúteos durante toda a execução.',
    'Quadril muito alto – alinhe o corpo': 'Não deixe o quadril subir demais. Imagine uma linha reta do calcanhar à cabeça.',
    'default': 'Na flexão, o alinhamento do corpo é fundamental. Mantenha abdômen contraído e o corpo em linha reta.'
  },
  'Polichinelo': {
    'default': 'No polichinelo, sincronize o movimento dos braços com as pernas. Eleve os braços acima da cabeça e abra as pernas além da largura dos ombros.'
  },
  'Avanço': {
    'Desça mais no avanço – tente 90°': 'No avanço, desça até o joelho da frente atingir 90°. O joelho de trás deve quase tocar o chão.',
    'default': 'No avanço, mantenha o tronco ereto e o pé da frente com o calcanhar apoiado. Alterne as pernas para equilíbrio muscular.'
  },
  'Joelho Alto': {
    'default': 'No joelho alto, eleve o joelho acima da linha do quadril a cada passo. Mantenha o abdômen contraído e os braços em movimento natural.'
  }
};

// monta a lista de pontos fortes baseado na qualidade média de cada exercício
function buildStrengths(exerciseBreakdown) {
  const strengths = [];
  for (const ex of exerciseBreakdown) {
    if (ex.avgQuality >= 85) {
      strengths.push(`Excelente execução no ${ex.name} – qualidade média de ${ex.avgQuality}%!`);
    } else if (ex.avgQuality >= 70 && ex.reps >= 5) {
      strengths.push(`Bom volume de ${ex.name}: ${ex.reps} repetições com consistência.`);
    }
  }
  if (strengths.length === 0 && exerciseBreakdown.length > 0) {
    strengths.push('Você completou o treino e isso já é uma grande vitória!');
  }
  return strengths;
}

// monta o parágrafo de resumo do treino
function buildSummary(data, exerciseBreakdown, level, avgQuality) {
  const { totalReps, duration, exerciseCount } = data;
  const durationStr = formatDuration(duration);
  const qualityPct  = Math.round(avgQuality * 100);

  let opening = '';
  if (avgQuality >= 0.9) {
    opening = `Treino incrível! `;
  } else if (avgQuality >= 0.7) {
    opening = `Bom treino! `;
  } else {
    opening = `Treino concluído! `;
  }

  // verifica se algum exercício tinha meta e calcula atingimento
  const withGoals   = exerciseBreakdown.filter(e => e.targetReps > 0);
  const goalsHit    = withGoals.filter(e => e.reps >= e.targetReps).length;
  const goalSummary = withGoals.length > 0
    ? ` Metas atingidas: ${goalsHit}/${withGoals.length}.`
    : '';

  let body = `Você realizou ${totalReps} repetição${totalReps !== 1 ? 'ões' : ''} `;
  body += `em ${durationStr}, com qualidade média de ${qualityPct}%.${goalSummary} `;

  if (exerciseCount > 1) {
    const names = exerciseBreakdown.map(e => e.name).join(', ');
    body += `Os exercícios realizados foram: ${names}. `;
  }

  let closing = '';
  if (level === 'Avançado') {
    closing = 'Você está no nível Avançado — continue desafiando seus limites!';
  } else if (level === 'Intermediário') {
    closing = 'Você está progredindo bem e já é um atleta Intermediário!';
  } else {
    closing = 'Continue praticando regularmente para evoluir rapidamente!';
  }

  return opening + body + closing;
}

// sugestão pro próximo treino baseada nos pontos fracos e no nível
function buildNextSuggestion(exerciseBreakdown, level, totalReps) {
  const weakExercises   = exerciseBreakdown.filter(e => e.avgQuality < 70);
  const strongExercises = exerciseBreakdown.filter(e => e.avgQuality >= 80);

  if (weakExercises.length > 0) {
    const w = weakExercises[0];
    return `Foque em ${w.name} no próximo treino: execute com mais calma e atenção à técnica. Qualidade supera quantidade!`;
  }

  if (level === 'Iniciante') {
    return 'Tente aumentar 2-3 repetições em cada exercício no próximo treino. Consistência é a chave do progresso!';
  } else if (level === 'Intermediário') {
    return 'Experimente adicionar um exercício novo ou aumentar a velocidade de execução para desafiar seu condicionamento.';
  } else {
    return `Com ${totalReps} repetições hoje, tente superar esse número no próximo treino. Você está no nível Avançado — seu corpo está preparado para mais!`;
  }
}

// === FUNÇÃO PRINCIPAL ===
// recebe os dados do treino e retorna um objeto completo com o relatório
// chamada em app.js quando o treino termina
function generateReport(workoutData) {
  const {
    duration      = 0,
    exercises     = {},
    totalScore    = 0,
    totalWorkouts = 1,
    totalAllTimeReps = 0
  } = workoutData;

  // monta a lista de exercícios e calcula o total de reps
  const exerciseList  = Object.values(exercises);
  const totalReps     = exerciseList.reduce((sum, e) => sum + (e.reps || 0), 0);
  const exerciseCount = exerciseList.length;

  // calcula a qualidade média de cada exercício e o status (Excelente/Bom/Melhorar)
  const exerciseBreakdown = exerciseList.map(ex => {
    const scores = ex.qualityScores || [];
    const avgQ   = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
    const avgQPct = Math.round(avgQ * 100);

    let status;
    if (avgQPct >= 80) status = 'Excelente';
    else if (avgQPct >= 60) status = 'Bom';
    else status = 'Melhorar';

    return {
      name:         ex.name,
      reps:         ex.reps || 0,
      avgQuality:   avgQPct,
      score:        ex.score || 0,
      status,
      targetReps:   ex.targetReps   || null,
      targetSets:   ex.targetSets   || null,
      setsCompleted: ex.setsCompleted || 0,
      issues:       Array.isArray(ex.issues)
        ? ex.issues
        : (ex.issues instanceof Set ? Array.from(ex.issues) : [])
    };
  });

  const avgQuality = exerciseBreakdown.length > 0
    ? exerciseBreakdown.reduce((sum, e) => sum + e.avgQuality / 100, 0) / exerciseBreakdown.length
    : 0;

  // calcula o nível considerando reps de todos os treinos anteriores + esse
  const allTimeReps = totalAllTimeReps + totalReps;
  const level = calcLevel(allTimeReps, totalWorkouts);

  // verifica conquistas – pega só a primeira que bater
  const achievementData = {
    totalScore,
    totalReps,
    avgQuality,
    exerciseCount,
    totalWorkouts,
    totalAllTimeReps: allTimeReps
  };
  let achievement = null;
  for (const a of ACHIEVEMENTS) {
    if (a.condition(achievementData)) {
      achievement = { icon: a.icon, title: a.title, description: a.description };
      break;
    }
  }

  // monta as dicas de melhoria baseadas nos problemas detectados durante o treino
  const improvements = [];
  for (const ex of exerciseBreakdown) {
    const tipMap = TIPS[ex.name];
    if (!tipMap) continue;

    if (ex.issues && ex.issues.length > 0) {
      for (const issue of ex.issues) {
        if (tipMap[issue]) {
          improvements.push({ exercise: ex.name, tip: tipMap[issue] });
        }
      }
    }

    if (ex.avgQuality < 70 && tipMap['default']) {
      if (!ex.issues || ex.issues.length === 0) {
        improvements.push({ exercise: ex.name, tip: tipMap['default'] });
      }
    }
  }

  const strengths           = buildStrengths(exerciseBreakdown);
  const summary             = buildSummary({ totalReps, duration, exerciseCount }, exerciseBreakdown, level, avgQuality);
  const nextWorkoutSuggestion = buildNextSuggestion(exerciseBreakdown, level, totalReps);

  return {
    summary,
    totalScore,
    totalReps,
    duration,
    durationFormatted: formatDuration(duration),
    level,
    achievement,
    exerciseBreakdown,
    improvements,
    strengths,
    nextWorkoutSuggestion
  };
}

window.generateReport = generateReport;
