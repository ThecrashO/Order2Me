let pendingOwnerProfile = null;
let pendingShopChannel = null;

function renderApprovalState(shop) {
    const icon = document.getElementById('approval-status-icon');
    const heading = document.getElementById('approval-heading');
    const message = document.getElementById('approval-message');
    const reason = document.getElementById('approval-reason');

    document.getElementById('approval-shop-name').textContent = shop?.name || 'No shop application found';
    document.getElementById('approval-shop-status').textContent = shop?.status || 'missing';
    document.getElementById('approval-shop-address').textContent = shop?.address || '—';
    reason.classList.add('d-none');

    if (!shop) {
        icon.textContent = '⚠️';
        heading.textContent = 'Shop application missing';
        message.textContent = 'Please contact the administrator to complete your shop registration.';
        return;
    }

    if (shop.status === 'approved') {
        icon.textContent = '✅';
        heading.textContent = 'Shop approved';
        message.textContent = 'Your owner dashboard is ready. Redirecting…';
        setTimeout(() => { window.location.href = 'owner.html'; }, 700);
        return;
    }

    if (shop.status === 'rejected') {
        icon.textContent = '❌';
        heading.textContent = 'Application needs attention';
        message.textContent = 'The administrator did not approve this application.';
        reason.textContent = shop.rejection_reason || 'No reason was provided. Please contact the administrator.';
        reason.classList.remove('d-none');
        return;
    }

    if (shop.status === 'suspended') {
        icon.textContent = '⛔';
        heading.textContent = 'Shop suspended';
        message.textContent = 'This shop is temporarily unavailable. Please contact the administrator.';
        reason.textContent = shop.rejection_reason || 'No additional details were provided.';
        reason.classList.remove('d-none');
        return;
    }

    icon.textContent = '⏳';
    heading.textContent = 'Waiting for approval';
    message.textContent = 'An administrator is reviewing your shop. This page will update automatically.';
}

async function refreshApprovalStatus() {
    if (!pendingOwnerProfile) return;
    const shop = await getOwnerShop(pendingOwnerProfile.id);
    renderApprovalState(shop);
}

async function initPendingPage() {
    pendingOwnerProfile = await requireRole('owner');
    if (!pendingOwnerProfile) return;
    renderApprovalState(pendingOwnerProfile.shop);

    pendingShopChannel = supabaseClient
        .channel(`owner-shop-approval-${pendingOwnerProfile.id}`)
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'shops',
            filter: `owner_id=eq.${pendingOwnerProfile.id}`
        }, payload => renderApprovalState(payload.new))
        .subscribe();
}

window.addEventListener('beforeunload', () => {
    if (pendingShopChannel) supabaseClient.removeChannel(pendingShopChannel);
});

document.addEventListener('DOMContentLoaded', initPendingPage);
