document.addEventListener("DOMContentLoaded", function () {
  const AUTH_STORAGE_KEY = "sp_auth_token";
  const form = document.getElementById("signupForm");
  const googleSignupBtn = document.getElementById("googleSignupBtn");
  const signupBox = document.querySelector(".signup-box");

  // Role toggle
  const roleBtns = document.querySelectorAll(".role-btn");
  const selectedRoleInput = document.getElementById("selectedRole");

  roleBtns.forEach(btn => {
    btn.addEventListener("click", function () {
      roleBtns.forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      selectedRoleInput.value = this.getAttribute("data-role");
    });
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const email    = document.getElementById("email").value.trim();
    const ageValue = Number(document.getElementById("age").value);
    const password = document.getElementById("password").value.trim();
    const confirmPassword = document.getElementById("confirmPassword").value.trim();
    const role = selectedRoleInput ? selectedRoleInput.value : "student";

    if (!username || !email || !password || !confirmPassword || !Number.isFinite(ageValue)) {
      showSignupError("Please fill in all fields."); return;
    }
    if (ageValue < 5 || ageValue > 120) {
      showSignupError("Please enter a valid age between 5 and 120."); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showSignupError("Please enter a valid email address."); return;
    }
    if (password !== confirmPassword) {
      showSignupError("Passwords do not match."); return;
    }
    if (password.length < 6) {
      showSignupError("Password must be at least 6 characters."); return;
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          age: Math.round(ageValue),
          password,
          role
        })
      });

      if (response.ok) {
        const payload = await response.json();
        const user = payload?.user;
        if (!user) {
          showSignupError("Server returned an invalid response.");
          return;
        }

        localStorage.setItem(AUTH_STORAGE_KEY, String(payload.token || ""));
        localStorage.setItem("sp_session", JSON.stringify({
          id: user.id,
          username: user.username,
          email: user.email,
          age: user.age,
          role: user.role
        }));

        alert("Account created successfully!");
        window.location.href = role === "teacher" ? "../admin/Dashboard.html" : "../student/StudentDashboard.html";
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (response.status === 409 || response.status === 400) {
        showSignupError(data.error || "Could not create account.");
        return;
      }
    } catch (_error) {
      // Fall back to frontend-only signup when backend is unavailable.
    }

    const users = JSON.parse(localStorage.getItem("sp_users") || "[]");

    if (users.find(u => u.email === email)) {
      showSignupError("An account with this email already exists."); return;
    }

    const newUser = {
      id: "usr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      username,
      email,
      age: Math.round(ageValue),
      password,
      role,
      createdAt: Date.now()
    };

    users.push(newUser);
    localStorage.setItem("sp_users", JSON.stringify(users));
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.setItem("sp_session", JSON.stringify({
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      age: newUser.age,
      role: newUser.role
    }));

    alert("Account created successfully!");
    window.location.href = role === "teacher" ? "../admin/Dashboard.html" : "../student/StudentDashboard.html";
  });

  if (googleSignupBtn) {
    googleSignupBtn.addEventListener("click", function () {
      const role = selectedRoleInput ? selectedRoleInput.value : "student";
      const ageValue = Number(document.getElementById("age").value);
      const users = JSON.parse(localStorage.getItem("sp_users") || "[]");
      const email = "google-user@slideplay.com";
      const existing = users.find(u => u.email === email);

      if (!Number.isFinite(ageValue) || ageValue < 5 || ageValue > 120) {
        showSignupError("Enter a valid age before using Google signup."); return;
      }

      if (!existing) {
        const newUser = {
          id: "usr_" + Date.now() + "_google",
          username: "Google User",
          email,
          age: Math.round(ageValue),
          password: "",
          role,
          createdAt: Date.now()
        };
        users.push(newUser);
        localStorage.setItem("sp_users", JSON.stringify(users));
      } else if (!Number.isFinite(Number(existing.age))) {
        existing.age = Math.round(ageValue);
        localStorage.setItem("sp_users", JSON.stringify(users));
      }

      const user = existing || users.find(u => u.email === email);
      localStorage.setItem("sp_session", JSON.stringify({
        id: user.id, username: user.username, email: user.email, age: user.age, role: user.role
      }));

      alert("Google signup selected. OAuth setup can be connected next.");
      window.location.href = role === "teacher" ? "../admin/Dashboard.html" : "../student/StudentDashboard.html";
    });
  }

  if (signupBox) {
    signupBox.addEventListener("mousemove", function (e) {
      const rect = signupBox.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      signupBox.style.transform = "perspective(900px) rotateX(" + (-y * 4) + "deg) rotateY(" + (x * 5) + "deg)";
    });
    signupBox.addEventListener("mouseleave", function () {
      signupBox.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
    });
  }
});

function showSignupError(msg) {
  let el = document.getElementById("signupError");
  if (!el) {
    el = document.createElement("p");
    el.id = "signupError";
    el.className = "login-error";
    document.querySelector(".signup-btn").before(el);
  }
  el.textContent = msg;
}
