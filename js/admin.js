let adminProfile = null;
let adminShops = [];
let adminActiveFilter = 'all';
let adminReasonModal = null;
let adminShopChannel = null;

function adminEscape(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}

function adminToast(message, type = 'success') {
    const container = document.getElementById('app-toast-container');
    const toast = document.createElement('div');
    toast.className = `toast align-items-center border-0 text-bg-${type}`;
    toast.innerHTML = `<div class="d-flex"><div class="toast-body">${adminEscape(message)}</div><button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    container.appendChild(toast);
    const instance = new bootstrap.Toast(toast, { delay: 3500 });
    instance.show();
    toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

function updateAdminStats() {
    document.getElementById('admin-stat-all').textContent = adminShops.length;
    document.getElementById('admin-stat-pending').textContent = adminShops.filter(s => s.status === 'pending').length;
    document.getElementById('admin-stat-approved').textContent = adminShops.filter(s => s.status === 'approved').length;
    document.getElementById('admin-stat-restricted').textContent = adminShops.filter(s => ['rejected', 'suspended'].includes(s.status)).length;
}

function renderAdminShops() {
    const query = document.getElementById('admin-shop-search').value.trim().toLowerCase();
    const filtered = adminShops.filter(shop => {
        const matchesStatus = adminActiveFilter === 'all' || shop.status === adminActiveFilter;
        const owner = shop.users || {};
        const haystack = `${shop.name} ${shop.address || ''} ${owner.name || ''} ${owner.email || ''}`.toLowerCase();
        return matchesStatus && (!query || haystack.includes(query));
    });

    const container = document.getElementById('admin-shop-list');
    if (!filtered.length) {
        container.innerHTML = '<div class="admin-empty">🏪<strong>No shops found</strong><span>Try another filter or wait for a new application.</span></div>';
        return;
    }

    container.innerHTML = filtered.map(shop => {
        const owner = shop.users || {};
        const created = new Date(shop.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        let actions = '';
        if (shop.status === 'pending' || shop.status === 'rejected') {
            actions += `<button class="btn btn-success" onclick="approveShop(${shop.id})">✓ Approve</button>`;
        }
        if (shop.status === 'pending') {
            actions += `<button class="btn btn-outline-danger" onclick="openAdminReason(${shop.id}, 'rejected')">Reject</button>`;
        }
        if (shop.status === 'approved') {
            actions += `<button class="btn btn-outline-danger" onclick="openAdminReason(${shop.id}, 'suspended')">Suspend</button>`;
        }
        if (shop.status === 'suspended') {
            actions += `<button class="btn btn-success" onclick="approveShop(${shop.id})">Restore</button>`;
        }

        return `<article class="admin-shop-card status-${shop.status}">
            <div class="admin-shop-card-head">
                <div class="admin-shop-avatar">${adminEscape(shop.name.charAt(0).toUpperCase())}</div>
                <div class="min-w-0"><h2>${adminEscape(shop.name)}</h2><p>${adminEscape(shop.address || 'No location provided')}</p></div>
                <span class="admin-status-badge">${adminEscape(shop.status)}</span>
            </div>
            <p class="admin-shop-description">${adminEscape(shop.description || 'No description provided.')}</p>
            <div class="admin-owner-grid">
                <div><span>Owner</span><strong>${adminEscape(owner.name || 'Unknown')}</strong></div>
                <div><span>Email</span><strong>${adminEscape(owner.email || '—')}</strong></div>
                <div><span>Phone</span><strong>${adminEscape(shop.phone_number || owner.phone_number || '—')}</strong></div>
                <div><span>Applied</span><strong>${created}</strong></div>
            </div>
            ${shop.rejection_reason ? `<div class="admin-reason-note">Reason: ${adminEscape(shop.rejection_reason)}</div>` : ''}
            <div class="admin-card-actions">${actions}</div>
        </article>`;
    }).join('');
}

async function loadAdminShops() {
    const container = document.getElementById('admin-shop-list');
    container.innerHTML = '<div class="hist-loading"><div class="hist-spinner"></div><span>Loading shops…</span></div>';
    const { data, error } = await supabaseClient
        .from('shops')
        .select(`id, owner_id, name, slug, description, address, phone_number, status, rejection_reason, approved_at, created_at,
            users!shops_owner_id_fkey (id, name, email, phone_number)`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Admin shop load failed:', error);
        container.innerHTML = `<div class="hist-error">${adminEscape(error.message)}</div>`;
        return;
    }
    adminShops = data || [];
    updateAdminStats();
    renderAdminShops();
}

async function approveShop(shopId) {
    const { error } = await supabaseClient.from('shops').update({
        status: 'approved',
        approved_by: adminProfile.id,
        approved_at: new Date().toISOString(),
        rejection_reason: null
    }).eq('id', shopId);
    if (error) { adminToast(error.message, 'danger'); return; }
    adminToast('Shop approved successfully.');
    await loadAdminShops();
}

function openAdminReason(shopId, status) {
    document.getElementById('admin-reason-shop-id').value = shopId;
    document.getElementById('admin-reason-status').value = status;
    document.getElementById('admin-reason-text').value = '';
    document.getElementById('admin-reason-error').classList.add('d-none');
    document.getElementById('admin-reason-title').textContent = status === 'suspended' ? 'Suspend shop' : 'Reject application';
    adminReasonModal.show();
}

async function submitAdminDecision() {
    const id = Number(document.getElementById('admin-reason-shop-id').value);
    const status = document.getElementById('admin-reason-status').value;
    const reason = document.getElementById('admin-reason-text').value.trim();
    if (!reason) { document.getElementById('admin-reason-error').classList.remove('d-none'); return; }

    const { error } = await supabaseClient.from('shops').update({
        status,
        rejection_reason: reason,
        approved_by: null,
        approved_at: null
    }).eq('id', id);
    if (error) { adminToast(error.message, 'danger'); return; }
    adminReasonModal.hide();
    adminToast(status === 'suspended' ? 'Shop suspended.' : 'Application rejected.', 'warning');
    await loadAdminShops();
}

async function initAdminPage() {
    adminProfile = await requireAdmin();
    if (!adminProfile) return;
    adminReasonModal = new bootstrap.Modal(document.getElementById('adminReasonModal'));

    document.querySelectorAll('.admin-filter').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.admin-filter').forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            adminActiveFilter = button.dataset.status;
            renderAdminShops();
        });
    });
    document.getElementById('admin-shop-search').addEventListener('input', renderAdminShops);

    await loadAdminShops();
    adminShopChannel = supabaseClient
        .channel('admin-shops-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shops' }, loadAdminShops)
        .subscribe();
}

window.addEventListener('beforeunload', () => {
    if (adminShopChannel) supabaseClient.removeChannel(adminShopChannel);
});

document.addEventListener('DOMContentLoaded', initAdminPage);
