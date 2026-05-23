import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getAuth,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAhxLX6fffl9477tNoqlmQomr51oL-6PDM",
  authDomain: "slideplayer-d024f.firebaseapp.com",
  projectId: "slideplayer-d024f",
  storageBucket: "slideplayer-d024f.appspot.com",
  messagingSenderId: "59789322114",
  appId: "1:59789322114:web:99b1546f1a9040ca9ad19b",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

document.getElementById("resetForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("reset").value.trim();

  sendPasswordResetEmail(auth, email)
    .then(() => {
      alert("Password reset email sent! Check your inbox.");
    })
    .catch((error) => {
      console.error("Error:", error.code, error.message);
      alert("Failed to send email.Please try again.");
    });
});
