# Configuração do Firebase para FitAI

Este guia explica como configurar o Firebase para que o FitAI possa salvar seus treinos na nuvem.

---

## 1. Criar um Projeto no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com/)
2. Clique em **"Adicionar projeto"**
3. Digite um nome (ex: `fitai-meu-app`) e clique em **Continuar**
4. Desative o Google Analytics (opcional para este projeto) e clique em **Criar projeto**
5. Aguarde a criação e clique em **Continuar**

---

## 2. Ativar o Firestore Database

1. No menu lateral, clique em **Build → Firestore Database**
2. Clique em **"Criar banco de dados"**
3. Escolha **"Iniciar no modo de teste"** (você ajustará as regras de segurança depois)
4. Selecione a região mais próxima de você (ex: `southamerica-east1` para São Paulo)
5. Clique em **Ativar**

---

## 3. Obter as Credenciais do Projeto

1. Ainda no console Firebase, clique no ícone de engrenagem ⚙️ → **Configurações do projeto**
2. Role até a seção **"Seus aplicativos"**
3. Clique em **"Adicionar app"** → selecione o ícone **Web (`</>`)**
4. Digite um apelido (ex: `FitAI Web`) e clique em **Registrar app**
5. Você verá um objeto `firebaseConfig` parecido com este:

```javascript
const firebaseConfig = {

};
```

6. Copie esses valores

---

## 4. Adicionar as Credenciais ao js/config.js

Abra o arquivo `js/config.js` e substitua os valores PLACEHOLDER pelos seus:

```javascript
// Antes (placeholder):
const firebaseConfig = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT_ID.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID'
};

// Depois (substitua com seus valores reais):
const firebaseConfig = {
  apiKey:            'AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  authDomain:        'fitai-meu-app.firebaseapp.com',
  projectId:         'fitai-meu-app',
  storageBucket:     'fitai-meu-app.appspot.com',
  messagingSenderId: '123456789012',
  appId:             '1:123456789012:web:abcdef1234567890abcdef'
};
```

> **Importante:** Nunca comite suas credenciais reais em repositórios públicos. Para projetos públicos no GitHub, considere usar variáveis de ambiente ou Firebase App Check.

---

## 5. Estrutura das Coleções no Firestore

O FitAI usa as seguintes coleções:

### `workouts/`
Armazena sessões de treino completas.

**Campos de cada documento:**
```json
{
  "createdAt": "2026-06-05T14:30:00.000Z",
  "duration": 900,
  "totalScore": 150,
  "exercises": {
    "Agachamento": {
      "name": "Agachamento",
      "type": "builtin",
      "reps": 15,
      "qualityScores": [0.9, 0.85, 0.95],
      "issues": ["Desça mais"],
      "score": 180
    }
  },
  "report": {
    "summary": "Ótimo treino! ...",
    "totalScore": 150,
    "totalReps": 30,
    "level": "Intermediário"
  },
  "serverTimestamp": "Timestamp Firestore"
}
```

### `exercises/`
Armazena templates de exercícios personalizados gravados pelo usuário.

**Campos de cada documento:**
```json
{
  "name": "Meu Exercício",
  "angleTemplate": {
    "leftKnee": 90.5,
    "rightKnee": 91.2,
    "leftHip": 85.0,
    "rightHip": 84.8,
    "leftElbow": 170.0,
    "rightElbow": 168.5
  },
  "signature": "91-91-85-85-170-169",
  "frameCount": 87,
  "createdAt": "2026-06-05T14:30:00.000Z",
  "serverTimestamp": "Timestamp Firestore"
}
```

---

## 6. Deploy no GitHub Pages

### Opção A: Branch `gh-pages`

1. Crie a branch e faça push dos arquivos:
```bash
git checkout -b gh-pages
git add .
git commit -m "Deploy FitAI"
git push origin gh-pages
```

2. No GitHub, vá em **Settings → Pages → Source** e selecione a branch `gh-pages`.

### Opção B: Pasta `docs/`

1. Crie uma pasta `docs/` na raiz e copie todos os arquivos do projeto para ela.
2. No GitHub, vá em **Settings → Pages → Source → /docs**.

### Após o deploy:
- Sua URL será: `https://SEU_USUARIO.github.io/fitai/`
- O app funciona 100% no navegador, sem servidor necessário.

---

## 7. Configurar Domínios Autorizados no Firebase

Para que o GitHub Pages possa acessar seu Firestore:

1. No console Firebase, vá em **Authentication → Settings → Authorized domains**
2. Adicione: `SEU_USUARIO.github.io`

> **Nota:** O Firestore (não o Authentication) não requer essa configuração, mas é uma boa prática caso você adicione autenticação futuramente.

---

## 8. Notas sobre CORS

O GitHub Pages funciona com Firebase Firestore sem configurações especiais de CORS porque:

- O SDK Firebase Web usa chamadas REST para o Firestore, não WebSockets tradicionais.
- O domínio `firebaseio.com` (e `firestore.googleapis.com`) já aceita requests de qualquer origem quando as regras de segurança do Firestore permitem.
- Todo o processamento de IA (MediaPipe) é feito localmente no navegador — nenhum dado de vídeo é enviado para servidores.

---

## 9. Funcionamento sem Firebase (modo offline)

Se você não configurar o Firebase (deixar as credenciais como `YOUR_API_KEY`), o app ainda funciona normalmente:

- Os treinos são salvos no **localStorage** do navegador
- Os exercícios personalizados também ficam no localStorage
- O histórico é exibido a partir do localStorage
- **Limitação:** os dados não sincronizam entre dispositivos

---

## 10. Suporte ao Firebase Hosting (opcional)

Se preferir hospedar via Firebase Hosting em vez do GitHub Pages:

1. Instale o Firebase CLI: `npm install -g firebase-tools`
2. Faça login: `firebase login`
3. Inicialize: `firebase init hosting` (aponte para a pasta raiz do projeto)
4. Deploy: `firebase deploy`

Sua URL será: `https://SEU_PROJETO.web.app`
