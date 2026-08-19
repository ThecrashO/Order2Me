document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('confirm-email');
    const email = new URLSearchParams(window.location.search).get('email')
        || sessionStorage.getItem('order2meOtpEmail') || '';
    emailInput.value = email;
    document.getElementById('confirm-email-form').addEventListener('submit', confirmEmailOtp);
});

async function confirmEmailOtp(event) {
    event.preventDefault();
    const email = document.getElementById('confirm-email').value.trim();
    const token = document.getElementById('confirm-otp').value.trim();
    const status = document.getElementById('confirm-email-status');
    const button = event.currentTarget.querySelector('button[type="submit"]');

    if (!/^\d{6}$/.test(token)) {
        status.className = 'text-danger mb-3';
        status.textContent = 'Enter the 6-digit code from your email.';
        return;
    }

    button.disabled = true;
    button.textContent = 'Confirming…';
    status.className = 'text-muted mb-3';
    status.textContent = 'Confirming your email…';
    try {
        const { error } = await verifyEmailOtp(email, token);
        if (error) throw error;
        sessionStorage.removeItem('order2meOtpEmail');
        const profile = await getCurrentProfile();
        status.className = 'text-success mb-3';
        status.textContent = '✅ Email confirmed successfully. Redirecting…';
        window.setTimeout(() => {
            window.location.replace(profile ? dashboardForProfile(profile) : 'login.html?verified=1');
        }, 700);
    } catch (error) {
        status.className = 'text-danger mb-3';
        status.textContent = error?.message || 'The code is invalid or expired. Please sign up again for a new code.';
        button.disabled = false;
        button.textContent = 'Confirm email';
    }
}
