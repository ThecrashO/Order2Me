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

        if (password !== confirmPassword) {
            status.textContent = 'Passwords do not match.';
            if (submitButton) submitButton.disabled = false;
            return;
        }

        const { error } = await signUpStudent(name, email, phone, password);
        if (error) {
            status.textContent = error.message;
            if (submitButton) submitButton.disabled = false;
            return;
        }

        alert('Registration successful. Please sign in to continue.');
        window.location.href = 'login.html';
    });
}

document.addEventListener('DOMContentLoaded', initSignupPage);
