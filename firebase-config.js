// Configuração do Firebase deste projeto.
//
// Importante: estes valores NÃO são segredos — eles apenas identificam o
// projeto pro Google, como o endereço de uma casa. Quem entra e mexe nos
// dados é controlado pelas REGRAS do Firestore (arquivo firestore.rules) e
// pelo login de administrador (Firebase Authentication), não por esconder
// este arquivo.
//
// Troque os valores abaixo pelos do SEU projeto:
// Firebase Console > ⚙️ Configurações do projeto > Seus apps > Config
export const firebaseConfig = {
  apiKey: "COLE_AQUI_SUA_API_KEY",
  authDomain: "SEU-PROJETO.firebaseapp.com",
  projectId: "SEU-PROJETO",
  storageBucket: "SEU-PROJETO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx"
};

// URL do seu Worker do Cloudflare (usado só pra enviar/servir as fotos dos
// produtos — veja cloudflare-worker.js e o passo 9 do SETUP-FIREBASE.md).
// Depois de publicar o Worker, troque pelo endereço real, algo como:
// "https://deumatch-images.SEU-SUBDOMINIO.workers.dev"
export const imageWorkerUrl = "https://COLOQUE-AQUI-SUA-URL.workers.dev";
