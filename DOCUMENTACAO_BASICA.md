# FitAI – Documentação Básica

**O que é:** Um app de academia que usa a câmera do computador pra detectar exercícios e contar repetições automaticamente, usando inteligência artificial.

**Como funciona resumidamente:** A câmera capta o movimento do usuário → o MediaPipe identifica os pontos do corpo (ombros, joelhos, quadril...) → o app mede os ângulos das articulações → compara com os padrões de cada exercício → conta as reps e avalia a qualidade da forma.

---

## Arquivos do Projeto

### `index.html`
O único arquivo HTML do projeto. Define toda a estrutura visual: telas de home, perfil, treino, relatório, histórico e biblioteca de exercícios. Cada "tela" é uma `<div>` com a classe `screen` — só uma fica visível por vez (a que tem a classe `active`). Também carrega todos os scripts JavaScript no final.

### `firestore.rules`
Regras de segurança do banco de dados (Firebase Firestore). Define quem pode ler, criar e apagar dados. A regra principal é: qualquer usuário autenticado pode mexer nos exercícios, mas cada usuário só acessa seus próprios treinos.

### `seed.html`
Página auxiliar pra popular o banco de dados com exercícios iniciais. Só é usada uma vez na configuração — não faz parte do app principal.

---

## Scripts JavaScript

### `js/config.js`
Conecta o app ao Firebase e cuida de salvar e buscar os dados. Funções principais:
- Conecta ao Firestore usando as chaves do projeto Firebase
- Faz login anônimo (necessário pras regras de segurança do banco)
- `saveWorkout()` — salva um treino finalizado
- `getWorkouts()` — busca o histórico de treinos
- `saveCustomExercise()` — salva um exercício gravado pelo usuário
- `getCustomExercises()` — busca os exercícios personalizados
- Se o Firebase não estiver disponível, usa o `localStorage` do navegador como alternativa

### `js/pose.js`
Integra com o MediaPipe Pose pra detectar o esqueleto humano pela câmera. Funções principais:
- Abre a câmera do computador
- Envia cada frame pro modelo do MediaPipe
- Recebe de volta 33 pontos do corpo com coordenadas x, y e confiança de detecção
- Desenha o esqueleto verde em cima do vídeo (espelhado como um espelho)
- Calcula os ângulos das articulações (joelho, quadril, cotovelo, etc.)

### `js/classifier.js`
O "cérebro" da detecção de exercícios. Recebe os ângulos calculados pelo `pose.js` e decide:
- Qual exercício está sendo feito
- Se uma repetição foi completada (detecta a ida e a volta do movimento)
- A qualidade da forma (dá uma nota de 0 a 100%)
- O feedback em português com o que melhorar

Tem suporte a exercícios pré-programados (agachamento, flexão, etc.) e exercícios gravados pelo usuário.

### `js/character3d.js`
Cria o personagem 3D animado que aparece na tela de demonstração e na biblioteca de exercícios. Usa a biblioteca Three.js pra renderizar um boneco feito de esferas (articulações) e cilindros (ossos). O boneco pode:
- Fazer animações pré-definidas de cada exercício (poses-chave interpoladas)
- Reproduzir uma gravação real feita pelo usuário durante o exercício

### `js/report.js`
Gera o relatório de desempenho ao final do treino. Calcula:
- Pontuação total
- Nível do usuário (Iniciante / Intermediário / Avançado)
- Conquistas desbloqueadas
- Pontos fortes e pontos a melhorar
- Sugestão pro próximo treino

### `js/app.js`
O arquivo principal que controla tudo. Gerencia:
- Qual tela está sendo mostrada
- O estado do treino (ativo, pausado, etc.)
- O plano de treino gerado a partir do perfil do usuário
- A integração entre todos os outros módulos
- Os event listeners dos botões
- O histórico e a biblioteca de exercícios

---

## Fluxo Principal do App

```
Home
 └─> Perfil (idade, sexo, altura, peso, local)
      └─> Seleção de Exercícios (plano gerado automaticamente)
           └─> Demonstração do Exercício (personagem 3D + descrição)
                └─> Treino com Câmera (câmera + detecção em tempo real)
                     └─> Relatório Final
```

---

## Tecnologias Usadas

| Tecnologia | O que faz no projeto |
|---|---|
| HTML/CSS/JS puro | Interface e lógica do app |
| MediaPipe Pose | Detecta os 33 pontos do corpo pela câmera |
| Three.js | Renderiza o personagem 3D |
| Firebase Firestore | Banco de dados na nuvem |
| localStorage | Fallback local quando Firebase não está disponível |

---

## Como Rodar

1. Abrir o arquivo `index.html` no navegador (Chrome recomendado)
2. Permitir acesso à câmera quando o navegador pedir
3. Precisar de conexão com internet pra carregar o MediaPipe e o Firebase
