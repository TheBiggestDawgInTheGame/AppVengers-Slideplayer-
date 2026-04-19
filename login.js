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

  // FAKE USER DATA (for now)
  const savedEmail = "test@gmail.com";
  const savedPassword = "123456";

  if (email === savedEmail && password === savedPassword) {
    alert("Login successful 🚀");

    // redirect to dashboard
    window.location.href = "dashboard.html";
  } else {
    alert("Invalid email or password ❌");
  }
});
