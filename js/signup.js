async function initSignupPage() {
    const form = document.getElementById('signup-form');
    const status = document.getElementById('signup-status');

    const profile = await getCurrentProfile();
    if (profile) {
        window.location.href = dashboardForProfile(profile);
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
        const role = document.getElementById('signup-role').value;
        const shopName = document.getElementById('signup-shop-name').value.trim();
        const shopAddress = document.getElementById('signup-shop-address').value.trim();
        const shopDescription = document.getElementById('signup-shop-description').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value.trim();
        const confirmPassword = document.getElementById('signup-confirm-password').value.trim();

        if (!name || !phone || !email || !password || !confirmPassword) {
            status.textContent = 'Please fill in all required fields.';
            if (submitButton) submitButton.disabled = false;
            return;
        }

        if (!/^\+?[0-9()\-\s]{7,20}$/.test(phone)) {
            status.textContent = 'Please enter a valid phone number.';
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

        if (role === 'owner' && (!shopName || !shopAddress)) {
            status.textContent = 'Shop name and address are required for owner registration.';
            if (submitButton) submitButton.disabled = false;
            return;
        }

        const result = await signUpAccount({
            name, phone, email, password, role,
            shopName, shopAddress, shopDescription,
            shopPhone: phone
        });

        if (result.error) {
            status.textContent = result.error.message;
            if (submitButton) submitButton.disabled = false;
            return;
        }

        // Email confirmation required — Supabase will send a verification email
        if (result.emailConfirmationRequired) {
            sessionStorage.setItem('order2meOtpEmail', email);
            window.location.href = `confirm-email.html?email=${encodeURIComponent(email)}`;
            return;
        }

        // No email confirmation required — profile created, go to login
        if (role === 'owner') {
            window.location.href = 'pending.html';
        } else {
            alert('Registration successful! Please sign in to continue.');
            window.location.href = 'login.html';
        }
    });
}

function toggleOwnerFields() {
    const isOwner = document.getElementById('signup-role')?.value === 'owner';
    const fields = document.getElementById('owner-signup-fields');
    if (!fields) return;
    fields.classList.toggle('d-none', !isOwner);
    fields.querySelectorAll('[data-owner-required]').forEach(input => {
        input.required = isOwner;
    });
    const title = document.getElementById('signup-page-title');
    if (title) title.textContent = isOwner ? 'Owner & Shop Sign Up' : 'Customer Sign Up';
}

document.addEventListener('DOMContentLoaded', () => {
    toggleOwnerFields();
    initSignupPage();
});
