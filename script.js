const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{5,}$/;

// SIGNUP FUNCTION
const signupForm = document.getElementById('signupForm');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        if (!passwordRegex.test(password)) {
            alert("Security Alert: Password must be at least 5 characters and include an Uppercase letter, a Lowercase letter, a Number, and a Special Character (@$!%*?&#).");
            return; // Stops the form from submitting
        }

        const response = await fetch('http://localhost:3000/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const result = await response.json();
        if (response.ok) {
            window.location.href = 'index.html'; // Redirect to makeshift landing page
        } else {
            alert(result.message);
        }
    });
}