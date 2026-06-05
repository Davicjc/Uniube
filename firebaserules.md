# Regras de Segurança do Firestore – FitAI

Este documento explica as regras de segurança do Firestore para o projeto FitAI, como aplicá-las e como evoluir para regras mais seguras.

---

## 1. Regras Atuais (Modo Protótipo)

Para desenvolvimento e testes iniciais, usamos regras permissivas que permitem leitura e escrita sem autenticação. **Essas regras são aceitáveis apenas durante o desenvolvimento.**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /exercises/{document} {
      allow read: if true;
      allow write: if true; // prototype only
    }
    match /workouts/{document} {
      allow read, write: if true; // prototype only
    }
  }
}
```

### O que essas regras fazem:
- **`/exercises/{document}`**: Qualquer pessoa pode ler e gravar exercícios personalizados.
- **`/workouts/{document}`**: Qualquer pessoa pode ler e gravar sessões de treino.

### Risco:
Qualquer pessoa com acesso ao ID do seu projeto Firebase pode ler ou modificar os dados. Aceitável para protótipos pessoais, mas **não recomendado para produção**.

---

## 2. Como Aplicar as Regras via Firebase Console

1. Acesse [console.firebase.google.com](https://console.firebase.google.com/)
2. Selecione seu projeto
3. No menu lateral, clique em **Build → Firestore Database**
4. Clique na aba **"Regras"** (Rules)
5. Substitua o conteúdo pelas regras desejadas
6. Clique em **"Publicar"**

---

## 3. Regras Recomendadas (Protótipo com Restrições)

Estas regras são mais seguras que o modo de teste padrão, mantendo abertura para um app sem autenticação:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Exercícios personalizados: biblioteca compartilhada
    // Qualquer um pode ler (para ver os exercícios disponíveis)
    // Qualquer um pode criar novos (para adicionar à biblioteca)
    // NINGUÉM pode modificar ou deletar exercícios existentes
    match /exercises/{exerciseId} {
      allow read:   if true;
      allow create: if request.resource.data.name is string
                    && request.resource.data.name.size() > 0
                    && request.resource.data.name.size() <= 100;
      allow update, delete: if false;
    }

    // Treinos: qualquer um pode criar e ler
    // (sem autenticação, não conseguimos restringir por usuário)
    match /workouts/{workoutId} {
      allow read, write: if true;
    }
  }
}
```

### O que essas regras fazem:
- **Exercícios**: Permitem criação apenas se o campo `name` existir, for string e tiver entre 1 e 100 caracteres. Bloqueia modificações e deleções.
- **Treinos**: Leitura e escrita livres (necessário enquanto não há autenticação).

---

## 4. Regras de Produção (com Firebase Authentication Anônimo)

Quando você adicionar autenticação ao app (recomendado antes de colocar em produção com usuários reais), use estas regras:

### 4.1 Ativar Autenticação Anônima no Firebase

1. No console Firebase: **Build → Authentication → Sign-in method**
2. Clique em **"Anônimo"**
3. Ative a opção e salve

### 4.2 Regras com Autenticação

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Exercícios personalizados (biblioteca compartilhada)
    match /exercises/{exerciseId} {
      // Qualquer usuário autenticado pode ler
      allow read: if request.auth != null;

      // Apenas usuários autenticados podem criar
      // Valida campos obrigatórios
      allow create: if request.auth != null
                    && request.resource.data.name is string
                    && request.resource.data.name.size() > 0
                    && request.resource.data.name.size() <= 100
                    && request.resource.data.keys().hasAll(['name', 'angleTemplate', 'createdAt']);

      // Apenas o criador pode atualizar/deletar
      allow update, delete: if request.auth != null
                             && resource.data.createdBy == request.auth.uid;
    }

    // Treinos (privados por usuário)
    match /workouts/{workoutId} {
      // Usuário só acessa seus próprios treinos
      allow read, write: if request.auth != null
                         && request.auth.uid == resource.data.userId;

      // Ao criar, verifica se o userId corresponde ao usuário logado
      allow create: if request.auth != null
                    && request.resource.data.userId == request.auth.uid;
    }
  }
}
```

### 4.3 Atualizar o app para usar autenticação anônima

Adicione em `js/config.js`:

```javascript
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const auth = getAuth(firebaseApp);

// Faz login anônimo automaticamente
export async function ensureAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        resolve(user);
      } else {
        const credential = await signInAnonymously(auth);
        resolve(credential.user);
      }
    });
  });
}
```

E em `js/app.js`, chame `ensureAuth()` antes de qualquer operação do Firestore.

---

## 5. Regras de Produção Completa (Máxima Segurança)

Para um app maduro com usuários reais:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Funções auxiliares
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    function isValidExercise() {
      let data = request.resource.data;
      return data.name is string
          && data.name.size() > 0
          && data.name.size() <= 100
          && data.angleTemplate is map
          && data.createdAt is string;
    }

    function isValidWorkout() {
      let data = request.resource.data;
      return data.userId is string
          && data.duration is number
          && data.duration >= 0
          && data.totalScore is number
          && data.createdAt is string;
    }

    // Exercícios personalizados
    match /exercises/{exerciseId} {
      allow read:   if isAuthenticated();
      allow create: if isAuthenticated() && isValidExercise();
      allow update: if isAuthenticated() && isOwner(resource.data.createdBy);
      allow delete: if isAuthenticated() && isOwner(resource.data.createdBy);
    }

    // Treinos (isolados por usuário)
    match /workouts/{workoutId} {
      allow read:   if isOwner(resource.data.userId);
      allow create: if isAuthenticated()
                    && isValidWorkout()
                    && request.resource.data.userId == request.auth.uid;
      allow update: if isOwner(resource.data.userId);
      allow delete: if isOwner(resource.data.userId);
    }
  }
}
```

---

## 6. Testando as Regras

O Firebase Console tem um simulador de regras embutido:

1. Na aba **"Regras"** do Firestore, clique em **"Editar e testar"**
2. Use o painel **Rules Playground** para simular operações de leitura/escrita
3. Você pode simular um usuário autenticado ou não autenticado

---

## 7. Monitoramento e Alertas

Para detectar uso suspeito:

1. No console Firebase: **Build → Firestore Database → Uso**
2. Configure alertas de uso no **Google Cloud Console** (é o mesmo projeto)
3. Ative o **Firebase App Check** para bloquear requests de apps não autorizados:
   - **Build → App Check → Get started**
   - Use o provedor **reCAPTCHA v3** para apps web

---

## 8. Resumo das Fases

| Fase | Regra | Quando usar |
|------|-------|-------------|
| Desenvolvimento | `allow read, write: if true` | Apenas local/privado |
| Protótipo público | Validação de campos, sem auth | Testes com poucos usuários |
| Produção inicial | Auth anônima + isolamento por UID | Lançamento beta |
| Produção madura | Auth completa + App Check | App com muitos usuários |

---

## 9. Próximos Passos Recomendados

Antes de compartilhar o link do app publicamente:

1. Ative o **Firebase Authentication Anônimo**
2. Atualize `js/config.js` e `js/app.js` para usar `ensureAuth()`
3. Aplique as regras da seção 4.2
4. Configure o **Firebase App Check** com reCAPTCHA v3
5. Revise os limites do plano gratuito Firebase Spark (50.000 leituras/dia, 20.000 escritas/dia)
