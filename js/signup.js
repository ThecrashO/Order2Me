async function initSignupPage() {
    const form = document.getElementById('signup-form');
    const status = document.getElementById('signup-status');

    const profile = await getCurrentProfile();
    if (profile) {
        window.location.href = profile.role === 'owner' ? 'owner.html' : 'student.html';
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.className = 'text-danger mb-3';
        status.textContent = '';
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        const name = document.getElementById('signup-name').value.trim();
        const phone = document.getElementById('signup-phone').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value.trim();
        const confirmPassword = document.getElementById('signup-confirm-password').value.trim();

        if (!name || !email || !password || !confirmPassword) {
            status.textContent = 'Please fill in all required fields.';
            if (submitButton) submitButton.disabled = false;
            return;
        }

        if (password.length < 6) {
            status.textContent = 'Password must be at least 6 characters.';
            if (submitButton) submitButton.disabled = false;
            return;
        }

        if (password !== confirmPassword) {
            status.textContent = 'Passwords do not match.';
            if (submitButton) submitButton.disabled = false;
            return;
        }

        const result = await signUpStudent(name, email, phone, password);

        if (result.error) {
            status.textContent = result.error.message;
            if (submitButton) submitButton.disabled = false;
            return;
        }

        // Email confirmation required — Supabase will send a verification email
        if (result.emailConfirmationRequired) {
            status.className = 'text-success mb-3';
            status.textContent = '✅ Account created! Please check your email and click the confirmation link, then sign in.';
            form.reset();
            if (submitButton) submitButton.disabled = false;
            return;
        }

        // No email confirmation required — profile created, go to login
        alert('Registration successful! Please sign in to continue.');
        window.location.href = 'login.html';
    });
}

document.addEventListener('DOMContentLoaded', initSignupPage);
