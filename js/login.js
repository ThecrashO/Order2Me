async function initLoginPage() {
    const form = document.getElementById('login-form');
    const status = document.getElementById('login-status');
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === '1') {
        status.className = 'text-success mb-3';
        status.textContent = '✅ Email verified. You can sign in now.';
    } else if (params.get('password') === 'changed') {
        status.className = 'text-success mb-3';
        status.textContent = '✅ Password changed successfully. Sign in with your new password.';
    }

    try {
        const profile = await getCurrentProfile();
        if (profile) {
            window.location.href = dashboardForProfile(profile);
            return;
        }
    } catch (error) {
        console.error('Unable to check the current session:', error);
        status.textContent = 'Unable to connect to Order2Me. Please refresh and try again.';
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.className = 'text-danger mb-3';
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

        try {
            const { error } = await signIn(email, password);
            if (error) {
                status.textContent = error.message;
                return;
            }

            const userProfile = await getCurrentProfile();
            if (!userProfile) {
                status.textContent = 'Your account signed in, but its profile could not be loaded. Ask the administrator to apply the latest Supabase migrations.';
                await supabaseClient.auth.signOut();
                return;
            }

            window.location.href = dashboardForProfile(userProfile);
        } catch (error) {
            console.error('Login failed:', error);
            status.textContent = 'Unable to connect to Order2Me. Please check your connection and try again.';
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

document.addEventListener('DOMContentLoaded', initLoginPage);
