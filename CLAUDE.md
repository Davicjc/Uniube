# FitAI – Regras do Projeto

## Regra principal
**Nenhum dado forjado ou de exemplo.** Todo código deve ser funcional.

- Não criar dados mock, valores hardcoded fictícios, ou placeholders que simulem comportamento real.
- Não usar dados de exemplo para preencher UI — se não há dado real, mostrar estado vazio (`—`, `0`, loading).
- Detecção de exercícios, qualidade de forma e contagem de reps devem vir exclusivamente do MediaPipe em tempo real.
- O app deve funcionar sem nenhuma fonte de dados simulada.

## Stack
- HTML/CSS/JS puros, sem bundler (compatível com `file://`)
- MediaPipe Pose via CDN para detecção de esqueleto
- Firebase Firestore (compat SDK) para persistência; fallback localStorage
- Sem frameworks de UI

## Comportamento esperado na tela de treino
- **Exercício detectado**: nome atualizado a cada frame via MediaPipe
- **Precisão**: avaliação contínua da forma em cada frame (não só ao completar rep)
- **Feedback**: mensagens em português baseadas nos ângulos reais do corpo
