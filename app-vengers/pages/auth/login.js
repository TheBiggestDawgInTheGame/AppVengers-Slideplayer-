// Seed demo accounts if they don''t exist yet
(function seedDemoAccounts() {
  const users = JSON.parse(localStorage.getItem("sp_users") || "[]");
  const demoTeacher = { id: "usr_demo_teacher", username: "Dr. M. Stark", email: "teacher@slideplay.com", password: "teach123", role: "teacher", age: 34, createdAt: 0 };
  const demoStudent = { id: "usr_demo_student", username: "Test Student",  email: "test@gmail.com",          password: "123456",   role: "student", age: 16, createdAt: 0 };
  let changed = false;
  const teacher = users.find(u => u.email === demoTeacher.email);
  const student = users.find(u => u.email === demoStudent.email);

  if (!teacher) {
    users.push(demoTeacher);
    changed = true;
  } else if (!Number.isFinite(Number(teacher.age))) {
    teacher.age = demoTeacher.age;
    changed = true;
  }

  if (!student) {
    users.push(demoStudent);
    changed = true;
  } else if (!Number.isFinite(Number(student.age))) {
    student.age = demoStudent.age;
    changed = true;
  }

  if (changed) localStorage.setItem("sp_users", JSON.stringify(users));
})();

const AUTH_STORAGE_KEY = "sp_auth_token";

const form = document.getElementById("loginForm");

form.addEventListener("submit", async function (e) {
  e.preventDefault();

  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) { showError("Please fill in all fields."); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError("Please enter a valid email address."); return; }
  if (password.length < 6) { showError("Password must be at least 6 characters."); return; }

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (response.ok) {
      const payload = await response.json();
      const user = payload?.user;
      if (!user) {
        showError("Server returned an invalid response.");
        return;
      }

      localStorage.setItem(AUTH_STORAGE_KEY, String(payload.token || ""));
      localStorage.setItem("sp_session", JSON.stringify({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        age: user.age
      }));

      clearError();
      window.location.href = user.role === "teacher" ? "../admin/Dashboard.html" : "../student/StudentDashboard.html";
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 400) {
      showError(data.error || "Invalid email or password.");
      return;
    }
  } catch (_error) {
    // Fall back to frontend-only auth when backend is unavailable.
  }

  const users = JSON.parse(localStorage.getItem("sp_users") || "[]");
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) { showError("Invalid email or password."); return; }

  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.setItem("sp_session", JSON.stringify({
    id: user.id, username: user.username, email: user.email, role: user.role
  }));

  clearError();
  window.location.href = user.role === "teacher" ? "../admin/Dashboard.html" : "../student/StudentDashboard.html";
});

function showError(msg) {
  let el = document.getElementById("loginError");
  if (!el) {
    el = document.createElement("p");
    el.id = "loginError";
    el.className = "login-error";
    document.querySelector(".input-submit").before(el);
  }
  el.textContent = msg;
}

function clearError() {
  const el = document.getElementById("loginError");
  if (el) el.remove();
}
