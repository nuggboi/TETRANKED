// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAlCzruuhwfB-jFOn6e5VOZE73Cz79BtrA",
  authDomain: "tetranked-49405.firebaseapp.com",
  databaseURL:
    "https://tetranked-49405-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "tetranked-49405",
  storageBucket: "tetranked-49405.firebasestorage.app",
  messagingSenderId: "989295311353",
  appId: "1:989295311353:web:79037436e941589845a528",
  measurementId: "G-ZWF931HXWH",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
