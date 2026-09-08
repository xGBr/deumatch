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
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB8dGOcM9TZkr5qQAIV6KVEKlNnn4mxdfw",
  authDomain: "deu-match-aqui.firebaseapp.com",
  projectId: "deu-match-aqui",
  storageBucket: "deu-match-aqui.firebasestorage.app",
  messagingSenderId: "815414937961",
  appId: "1:815414937961:web:02c7c14151921f4d7d55f8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
