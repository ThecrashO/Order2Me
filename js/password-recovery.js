document.addEventListener('DOMContentLoaded', () => {
    const forgotForm = document.getElementById('forgot-password-form');
    if (forgotForm) forgotForm.addEventListener('submit', handleForgotPassword);
    const resetForm = document.getElementById('reset-password-form');
    if (resetForm) {
        resetForm.addEventListener('submit', handleResetPassword);
        const email = new URLSearchParams(window.location.search).get('email')
            || sessionStorage.getItem('order2meRecoveryEmail') || '';
        document.getElementById('reset-email').value = email;
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
        sessionStorage.setItem('order2meRecoveryEmail', email);
        window.location.href = `reset-password.html?email=${encodeURIComponent(email)}`;
    } catch (error) {
        status.className = 'text-danger mb-3';
        status.textContent = error?.message || 'Unable to send the reset link. Please try again.';
    } finally { button.disabled = false; }
}

async function handleResetPassword(event) {
    event.preventDefault();
    const email = document.getElementById('reset-email').value.trim();
    const token = document.getElementById('reset-otp').value.trim();
    const password = document.getElementById('reset-password').value;
    const confirmation = document.getElementById('reset-password-confirm').value;
    const status = document.getElementById('reset-status');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (!/^\d{6}$/.test(token)) {
        status.className = 'text-danger mb-3'; status.textContent = 'Enter the 6-digit code from your email.'; return;
    }
    if (password.length < 8) {
        status.className = 'text-danger mb-3'; status.textContent = 'Password must be at least 8 characters.'; return;
    }
    if (password !== confirmation) {
        status.className = 'text-danger mb-3'; status.textContent = 'Passwords do not match.'; return;
    }
    button.disabled = true;
    try {
        const { error: verifyError } = await verifyRecoveryOtp(email, token);
        if (verifyError) throw verifyError;
        const { error } = await updateRecoveredPassword(password);
        if (error) throw error;
        sessionStorage.removeItem('order2meRecoveryEmail');
        await supabaseClient.auth.signOut();
        window.location.replace('login.html?password=changed');
    } catch (error) {
        status.className = 'text-danger mb-3';
        status.textContent = error?.message || 'Unable to change password. Request a new reset link.';
        button.disabled = false;
    }
}
