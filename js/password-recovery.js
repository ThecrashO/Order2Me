document.addEventListener('DOMContentLoaded', () => {
    const forgotForm = document.getElementById('forgot-password-form');
    if (forgotForm) forgotForm.addEventListener('submit', handleForgotPassword);
    const resetForm = document.getElementById('reset-password-form');
    if (resetForm) {
        resetForm.addEventListener('submit', handleResetPassword);
        verifyRecoverySession();
    }
});

async function handleForgotPassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = document.getElementById('forgot-email').value.trim();
    const status = document.getElementById('forgot-status');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.className = 'text-muted mb-3';
    status.textContent = 'Sending reset link…';
    try {
        const { error } = await sendPasswordResetEmail(email);
        if (error) throw error;
        status.className = 'text-success mb-3';
        status.textContent = '✅ If this email is registered, a password-reset link has been sent. Check your inbox and spam folder.';
        form.reset();
    } catch (error) {
        status.className = 'text-danger mb-3';
        status.textContent = error?.message || 'Unable to send the reset link. Please try again.';
    } finally { button.disabled = false; }
}

async function verifyRecoverySession() {
    const status = document.getElementById('reset-status');
    const button = document.querySelector('#reset-password-form button[type="submit"]');
    await new Promise(resolve => setTimeout(resolve, 250));
    const { data } = await supabaseClient.auth.getSession();
    if (!data?.session) {
        status.className = 'text-danger mb-3';
        status.textContent = 'This reset link is invalid or has expired. Request a new link.';
        button.disabled = true;
    }
}

async function handleResetPassword(event) {
    event.preventDefault();
    const password = document.getElementById('reset-password').value;
    const confirmation = document.getElementById('reset-password-confirm').value;
    const status = document.getElementById('reset-status');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (password.length < 8) {
        status.className = 'text-danger mb-3'; status.textContent = 'Password must be at least 8 characters.'; return;
    }
    if (password !== confirmation) {
        status.className = 'text-danger mb-3'; status.textContent = 'Passwords do not match.'; return;
    }
    button.disabled = true;
    try {
        const { error } = await updateRecoveredPassword(password);
        if (error) throw error;
        await supabaseClient.auth.signOut();
        window.location.replace('login.html?password=changed');
    } catch (error) {
        status.className = 'text-danger mb-3';
        status.textContent = error?.message || 'Unable to change password. Request a new reset link.';
        button.disabled = false;
    }
}
