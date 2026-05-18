 // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries
  import { getAuth,GoogleAuthProvider,signInWithPopup } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyAhxLX6fffl9477tNoqlmQomr51oL-6PDM",
    authDomain: "slideplayer-d024f.firebaseapp.com",
    projectId: "slideplayer-d024f",
    storageBucket: "slideplayer-d024f.appspot.com",
    messagingSenderId: "59789322114",
    appId: "1:59789322114:web:99b1546f1a9040ca9ad19b"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  auth.languageCode = 'en'

  const provider = new GoogleAuthProvider();

  // if user clicks to the Google button
  const googleBtn = document.getElementById("googleBtn");
  googleBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    try{
      const result = await signInWithPopup(auth, provider)
      const credential = GoogleAuthProvider.credentialFromResult(result)
       const user = result.user;

       await fetch("https://slideplayer-d024f-default-rtdb.firebaseio.com/users.json", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email:user.email})

      });

      await fetch("/send-welcome-email", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email:user.email})
    });

      window.location.href = "dashboard.html";
  }catch(error){
        console.error("Google sign-in error:", error,error.message);
      };
      
      
  });