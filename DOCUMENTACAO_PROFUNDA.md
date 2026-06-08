# FitAI – Documentação Profunda

Documentação técnica completa do projeto FitAI. Explica a arquitetura, os algoritmos e como cada parte se conecta.

---

## Arquitetura Geral

O FitAI é um SPA (Single Page Application) puro — sem framework, sem bundler, sem servidor. Roda direto no navegador via `file://` ou HTTP simples. A comunicação entre os módulos JS é feita através de objetos no `window` global, já que não há sistema de módulos ES6.

```
index.html
├── CDNs (MediaPipe, Three.js, Firebase)
└── scripts (em ordem de dependência):
    ├── js/config.js      → window.FitAIConfig
    ├── js/pose.js        → window.PoseDetector, window.LANDMARKS
    ├── js/classifier.js  → window.ExerciseClassifier, window.ExerciseRecorder
    ├── js/character3d.js → window.FitAIChar
    ├── js/report.js      → window.generateReport
    └── js/app.js         → lê todos os anteriores e inicia o app
```

Cada arquivo exporta suas classes/funções via `window.X = X`. O `app.js` lê tudo do `window` logo no início com fallbacks seguros para o caso de algum script falhar ao carregar.

---

## `firestore.rules` — Segurança do Banco de Dados

```
match /exercises/{docId}  → qualquer autenticado pode ler, criar, atualizar, deletar
match /workouts/{docId}   → só o dono (userId == request.auth.uid) pode acessar
```

O motivo da diferença: exercícios personalizados podem ser compartilhados entre usuários no futuro; treinos são dados pessoais de saúde.

---

## `js/config.js` — Firebase e Persistência

### Inicialização

Usa o Firebase Compat SDK (v8) que expõe `firebase.initializeApp()` globalmente. O SDK compat foi escolhido porque o projeto não tem bundler — a versão modular (v9) exige `import/export`.

```js
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
firebase.auth().signInAnonymously();
```

O login anônimo é necessário porque as Firestore Security Rules exigem `request.auth != null`. Sem ele, todas as operações seriam rejeitadas com `PERMISSION_DENIED`.

### Fallback localStorage

Cada função verifica se o Firestore está disponível antes de usá-lo. Se não estiver (offline, erro de configuração), usa o `localStorage`:

```js
function saveWorkout(data) {
  if (!db) return saveToLocalStorage(data);
  return db.collection('workouts').add(data);
}
```

A chave de localStorage `fitai_workouts` guarda um array JSON de treinos. O limite do localStorage é ~5MB, suficiente pra dezenas de treinos.

---

## `js/pose.js` — Detecção de Esqueleto

### Pipeline MediaPipe

```
Câmera (640x480) → Camera utility → pose.send(frame) → MediaPipe WASM → 33 landmarks → callback onResults()
```

O modelo de pose do MediaPipe roda em WebAssembly no browser. Cada landmark tem `{ x, y, z, visibility }` onde x e y são normalizados (0-1), z é profundidade relativa e `visibility` é a confiança de detecção (0-1).

### Opções do modelo

```js
modelComplexity: 1       // 0=rápido/menos preciso, 1=equilíbrio, 2=lento/mais preciso
smoothLandmarks: true    // MediaPipe suaviza a trajetória dos pontos entre frames
minDetectionConfidence: 0.5
minTrackingConfidence: 0.5
```

Complexidade 1 foi escolhida como equilíbrio entre performance e precisão. Em dispositivos lentos, pode-se reduzir pra 0.

### Cálculo de Ângulos

O método `PoseDetector.calculateAngle(a, b, c)` usa `Math.atan2` pra calcular o ângulo no vértice `b`:

```js
const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
let deg = Math.abs(radians * (180 / Math.PI));
if (deg > 180) deg = 360 - deg;
```

O `getKeyAngles()` calcula 11 ângulos por frame: joelhos (L/R), quadril (L/R), cotovelos (L/R), ombros (L/R), tronco e tornozelosJá (L/R). Cada ângulo só é calculado se os 3 pontos necessários têm `visibility > 0.4`.

### Renderização do Esqueleto

O canvas é configurado com `ctx.scale(-1, 1)` + `ctx.translate(width, 0)` antes de desenhar, espelhando horizontalmente. Isso cria o efeito de espelho — o usuário vê exatamente o movimento que está fazendo, como num espelho físico.

---

## `js/classifier.js` — Classificação de Exercícios

Este é o módulo mais complexo do projeto. Recebe ângulos frame a frame e mantém uma máquina de estados por exercício.

### Detecção Automática vs. Guiada

**Auto-detect** (treino livre): O classificador testa todos os exercícios conhecidos contra os ângulos atuais e escolhe o de maior "match score".

**Guided** (treino com plano): `setExpectedExercise(name)` força o classificador a só avaliar aquele exercício específico. Mais estável e preciso.

### Calibração Inicial

Nos primeiros 15 frames de cada exercício, o classificador captura a posição "neutra" do usuário. Isso resolve variações de câmera, distância e proporções corporais. Os thresholds de ângulo são ajustados dinamicamente baseados nos valores iniciais capturados.

### Máquina de Estados (Estado Up/Down)

Cada processador de exercício tem um estado binário: `phase = 'up' | 'down'`. Uma repetição é completada quando o usuário vai de `up → down → up` (ou o oposto, dependendo do exercício).

```
Agachamento:
  STANDING (joelho > 150°) → DOWN (joelho < 100°) → STANDING = 1 rep
```

Para evitar detecção de reps falsas por tremor, há um buffer de estabilidade de 5 frames: o estado só muda quando 5 frames consecutivos confirmam a nova posição.

### Cálculo de Qualidade

A qualidade (0–1) é calculada como média ponderada de múltiplos critérios por exercício. Exemplo para Agachamento:

```
profundidade:   ângulo do joelho chegou até < 110°?  → peso 0.4
joelhos:        diferença entre joelho L e R < 15°?  → peso 0.3
tronco:         trunkAngle < 30°?                    → peso 0.3
```

Cada critério retorna 0 ou 1 (ou um valor intermediário com `Math.min`). A qualidade final é convertida em pontos: `Math.round(quality * 10) + 5`, no mínimo 5 pontos por rep.

### ExerciseRecorder

Grava frames durante 5 segundos, armazenando os ângulos chave e os landmarks brutos de cada frame. Ao parar, calcula o `motionRange` (variação máxima de cada ângulo durante a gravação) que é usado pela animação 3D pra reproduzir o movimento com amplitude realista.

```js
class ExerciseRecorder {
  addFrame(angles, landmarks) { this.frames.push({ angles, landmarks, timestamp }); }
  stopRecording()             { return { name, animFrames: this.frames, motionRange }; }
}
```

---

## `js/character3d.js` — Personagem 3D

### Estrutura Three.js

```
Scene
├── AmbientLight
├── DirectionalLight  
├── Group (personagem)
│   ├── Mesh (esfera) × 14  ← articulações
│   └── Mesh (cilindro) × 13 ← ossos
└── PerspectiveCamera
```

A câmera usa `OrbitControls` pra permitir rotação livre do personagem na tela de biblioteca.

### Sistema de Poses

Cada exercício tem um array de "poses-chave" — configurações de ângulos que representam os momentos principais do movimento. A animação interpola linearmente entre essas poses usando ping-pong (vai e volta):

```js
this._recIdx += this._recDir * 0.08;   // velocidade: 0.08 frames por tick
if (this._recIdx >= frames.length - 1) this._recDir = -1;  // inverte
if (this._recIdx <= 0)                 this._recDir = +1;
```

O valor `0.08` foi escolhido pra dar uma velocidade visualmente confortável (era `0.3` antes, o que ficava rápido demais).

### Mapeamento de Landmarks

Os 33 landmarks do MediaPipe são mapeados pra apenas 14 articulações do boneco 3D:

```js
const JOINT_MAP = {
  'head':         [0],       // nariz
  'leftShoulder': [11],
  'rightShoulder':[12],
  // ... etc
};
```

As coordenadas MediaPipe (x, y: 0-1, y crescendo pra baixo) são convertidas pro espaço Three.js (y crescendo pra cima, escala ampliada):

```js
x: (lm.x - 0.5) * 2,   // centraliza e escala
y: -(lm.y - 0.5) * 2,  // inverte Y
z: lm.z * 2
```

### Cilindros (ossos)

Cilindros no Three.js são criados uma vez e reposicionados/reorientados a cada frame. O método `_updateBone(mesh, from, to)` calcula:
1. Posição do meio entre dois joints
2. Direção do vetor
3. Quaternion pra alinhar o cilindro com esse vetor
4. Escala Y pra igualar ao comprimento do osso

---

## `js/report.js` — Geração do Relatório

### Cálculo de Nível

```js
function calcLevel(totalAllTimeReps, totalWorkouts) {
  if (totalAllTimeReps < 50 || totalWorkouts < 3) return 'Iniciante';
  if (totalAllTimeReps <= 150)                    return 'Intermediário';
  return 'Avançado';
}
```

O nível é cumulativo — considera TODOS os treinos feitos, não só o atual.

### Sistema de Conquistas

Array de objetos `{ condition: (data) => boolean }` avaliados em ordem. A primeira conquista cuja condição for `true` é exibida. Isso garante que conquistas mais raras (como pontuação de elite) têm precedência sobre as básicas.

### Dicas de Melhoria

O mapa `TIPS` associa cada exercício a seus problemas típicos. Durante o treino, o classificador armazena as mensagens de feedback num `Set` por exercício (Set evita duplicatas). No relatório, essas strings são cruzadas com o mapa de dicas para gerar sugestões específicas.

---

## `js/app.js` — Controlador Principal

### Estado Global

O objeto `state` centraliza todo o estado mutável do app:

```js
const state = {
  screen:  'home',
  workout: { active, startTime, exercises, currentExercise, totalScore },
  recording: { active, recorder, ... },
  profile:  null,      // dados do usuário
  plan:     [],        // plano de treino gerado
  planIndex: -1,       // índice atual no plano
  // ...
};
```

### Gerador de Plano de Treino

`generateWorkoutPlan(profile, customExercises)` usa o IMC e a idade pra determinar nível/séries/reps/descanso, depois constrói um plano em 5 categorias:

1. Cardio (aquecimento)
2. Pernas (1-2 exercícios, mais pra mulheres)
3. Core
4. Superior (mais pra homens)
5. Glúteo (prioridade pra mulheres) + Cardio (finalização)

Exercícios de academia (`_GYM_NAMES`) são filtrados quando o usuário escolhe "Casa".

### Ciclo do Treino Guiado

```
showExerciseDemo()
    ↓ (clique em Começar)
startGuidedExercise()  — countdown de 3s
    ↓
initGuidedWorkout() ou switchGuidedExercise()
    ↓ (cada frame)
onGuidedPoseResults() → classifier.update() → onGuidedRep()
    ↓ (reps >= repsPerSet)
completeSet()
    ↓ (sets esgotados)
advanceToNextExercise()
    ↓ (planIndex >= plan.length)
endGuidedWorkout()
    ↓
renderReport() → showScreen('report')
```

### Persistência de Estatísticas Locais

As estatísticas da home (total de treinos, reps, pontuação) são salvas separadamente no localStorage sob a chave `fitai_stats`. Isso é independente do Firestore — funciona mesmo offline e não depende do login anônimo.

### Animação da Barra de Qualidade

```css
background: linear-gradient(90deg, red 0%, yellow 50%, green 100%);
background-position: X% center;  /* controlado via JS */
```

Ao invés de mudar a cor via JS, a barra tem um gradiente fixo e o `background-position` é ajustado. Com 100% de qualidade, o verde aparece; com 0%, o vermelho.

---

## Fluxo de Dados

```
MediaPipe → PoseDetector._drawFrame()  ← renderiza na tela
         └→ PoseDetector.getKeyAngles()
               └→ ExerciseClassifier.update()
                    ├→ detectPhase()  ← up/down state machine
                    ├→ calcQuality()  ← nota 0-1
                    ├→ buildFeedback() ← mensagens em PT-BR
                    └→ repCompleted? → app.js onGuidedRep() / onWorkoutPoseResults()
                                         └→ Firestore (ao finalizar)
                                         └→ localStorage stats (imediato)
```

---

## Decisões de Design

**Por que sem bundler?** O projeto precisa rodar via `file://` em qualquer máquina sem configuração. Um bundler exigiria Node.js instalado e um processo de build.

**Por que Firebase Compat SDK?** A versão modular (v9) usa `import { getFirestore }` que não funciona sem bundler/módulos ES. O compat é um script único que expõe tudo via `firebase.*` globalmente.

**Por que login anônimo?** As Security Rules do Firestore exigem `request.auth != null`. Usar login anônimo é o mínimo de autenticação necessário sem precisar de cadastro do usuário. O UID anônimo persiste entre sessões no mesmo dispositivo.

**Por que `window` em vez de módulos?** Compatibilidade com `file://`. Módulos ES6 só funcionam em servidores HTTP por causa do CORS — o protocolo `file://` bloqueia imports entre arquivos.
