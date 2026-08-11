async function initLoginPage() {
    const form = document.getElementById('login-form');
    const status = document.getElementById('login-status');

    const profile = await getCurrentProfile();
    if (profile) {
        window.location.href = profile.role === 'owner' ? 'owner.html' : 'customer.html';
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.textContent = '';
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();

        if (!email || !password) {
            status.textContent = 'Please enter both email and password.';
            if (submitButton) submitButton.disabled = false;
            return;
        }

        const { data, error } = await signIn(email, password);
        if (error) {
            status.textContent = error.message;
            if (submitButton) submitButton.disabled = false;
            return;
        }

        const userProfile = await getCurrentProfile();
        if (!userProfile) {
            status.textContent = 'No profile found for this account.';
            await signOut();
            if (submitButton) submitButton.disabled = false;
            return;
        }

        if (userProfile.role === 'owner') {
            window.location.href = 'owner.html';
        } else {
            window.location.href = 'customer.html';
        }
    });
}

document.addEventListener('DOMContentLoaded', initLoginPage);
