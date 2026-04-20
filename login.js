const form = document.getElementById("loginForm");

form.addEventListener("submit", function (e) {
  e.preventDefault(); // stop page reload

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  // BASIC VALIDATION
  if (email === "" || password === "") {
    alert("Please fill in all fields!");
    return;
  }

  // Check email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert("Please enter a valid email address!");
    return;
  }

  // Check password length
  if (password.length < 6) {
    alert("Password must be at least 6 characters long!");
    return;
  }

  // Get stored user data
  const storedEmail = localStorage.getItem("userEmail");
  const storedPassword = localStorage.getItem("userPassword");

  // Check against stored data or default
  if ((storedEmail && email === storedEmail && password === storedPassword) ||
      (email === "test@gmail.com" && password === "123456")) {
    alert("Login successful 🚀");

    // redirect to dashboard
    window.location.href = "Dashboard.html";
  } else {
    alert("Invalid email or password ❌");
  }
});
