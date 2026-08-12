let adminProfile = null;
let adminShops = [];
let adminActiveFilter = 'all';
let adminReasonModal = null;
let adminShopChannel = null;
let adminUserChannel = null;
let adminUsers = [];
let adminActiveUserRole = 'all';

function toggleAdminProfileDropdown() {
    const menu = document.getElementById('admin-profile-dropdown-menu');
    const button = document.getElementById('admin-profile-avatar-btn');
    const isOpen = menu.classList.toggle('dropdown-open');
    button.setAttribute('aria-expanded', String(isOpen));
    menu.setAttribute('aria-hidden', String(!isOpen));
}

function closeAdminProfileDropdown() {
    const menu = document.getElementById('admin-profile-dropdown-menu');
    const button = document.getElementById('admin-profile-avatar-btn');
    menu?.classList.remove('dropdown-open');
    button?.setAttribute('aria-expanded', 'false');
    menu?.setAttribute('aria-hidden', 'true');
}

function syncAdminProfileUI() {
    if (!adminProfile) return;
    document.getElementById('admin-profile-name').textContent = adminProfile.name || '—';
    document.getElementById('admin-profile-view-name').textContent = adminProfile.name || '—';
    document.getElementById('admin-profile-view-email').textContent = adminProfile.email || '—';
    document.getElementById('admin-profile-view-phone').textContent = adminProfile.phone_number || '—';
    refreshCurrentProfileAvatars(adminProfile);
}

function openAdminProfile() {
    closeAdminProfileDropdown();
    syncAdminProfileUI();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('adminProfileModal')).show();
}

function openAdminSettings() {
    closeAdminProfileDropdown();
    bootstrap.Modal.getInstance(document.getElementById('adminProfileModal'))?.hide();
    document.getElementById('admin-profile-name-input').value = adminProfile?.name || '';
    document.getElementById('admin-profile-phone-input').value = adminProfile?.phone_number || '';
    document.getElementById('admin-profile-email-readonly').value = adminProfile?.email || '';
    document.getElementById('admin-profile-avatar-input').value = '';
    const statusEl = document.getElementById('admin-profile-edit-status');
    statusEl.className = 'alert small d-none';
    statusEl.textContent = '';
    renderProfileAvatarElement(document.getElementById('admin-profile-edit-avatar'), adminProfile, adminProfile?.avatar_url);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('adminSettingsModal')).show();
}

function handleAdminAvatarPreview(input) {
    const statusEl = document.getElementById('admin-profile-edit-status');
    try {
        previewSelectedProfileImage(input, 'admin-profile-edit-avatar', adminProfile);
        statusEl.className = 'alert small d-none';
        statusEl.textContent = '';
    } catch (error) {
        statusEl.className = 'alert alert-danger small';
        statusEl.textContent = error.message;
    }
}

async function saveAdminProfile() {
    const name = document.getElementById('admin-profile-name-input').value.trim();
    const phone = document.getElementById('admin-profile-phone-input').value.trim();
    const imageFile = document.getElementById('admin-profile-avatar-input').files?.[0] || null;
    const statusEl = document.getElementById('admin-profile-edit-status');
    const saveBtn = document.getElementById('admin-profile-save-btn');
    const phonePattern = /^\+?[0-9()\-\s]{7,20}$/;

    if (!name || (phone && !phonePattern.test(phone))) {
        statusEl.className = 'alert alert-danger small';
        statusEl.textContent = !name ? 'Name is required.' : 'Enter a valid phone number.';
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    statusEl.className = 'alert alert-info small';
    statusEl.textContent = 'Saving your profile…';
    try {
        adminProfile = await updateProfileWithAvatar(
            adminProfile,
            { name, phone_number: phone || null },
            imageFile
        );
        syncAdminProfileUI();
        bootstrap.Modal.getInstance(document.getElementById('adminSettingsModal'))?.hide();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('adminProfileModal')).show();
        adminToast('Profile updated successfully.');
        await loadAdminUsers();
    } catch (error) {
        console.error('Admin profile update failed:', error);
        statusEl.className = 'alert alert-danger small';
        statusEl.textContent = error?.message || 'Unable to update your profile.';
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save changes';
    }
}

function openAdminSidebar() {
    document.getElementById('admin-sidebar').classList.add('sidebar-open');
    document.getElementById('admin-sidebar-backdrop').classList.add('sidebar-backdrop-show');
    document.getElementById('admin-sidebar-toggle').setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
}

function closeAdminSidebar() {
    document.getElementById('admin-sidebar').classList.remove('sidebar-open');
    document.getElementById('admin-sidebar-backdrop').classList.remove('sidebar-backdrop-show');
    document.getElementById('admin-sidebar-toggle').setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
}

function showAdminPanel(name) {
    if (!['shops', 'users'].includes(name)) return;
    document.querySelectorAll('.admin-view').forEach(panel => panel.classList.remove('active-admin-view'));
    document.getElementById(`admin-panel-${name}`).classList.add('active-admin-view');
    document.querySelectorAll('#admin-sidebar .sidebar-nav-item').forEach(item => {
        item.classList.remove('active');
        item.removeAttribute('aria-current');
    });
    const nav = document.getElementById(`admin-nav-${name}`);
    nav.classList.add('active');
    nav.setAttribute('aria-current', 'page');
    history.replaceState(null, '', `${location.pathname}#${name}`);
    closeAdminSidebar();
    if (name === 'users') loadAdminUsers();
}

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
    const pendingCount = adminShops.filter(s => s.status === 'pending').length;
    const badge = document.getElementById('admin-pending-badge');
    badge.textContent = pendingCount;
    badge.classList.toggle('d-none', pendingCount === 0);
}

function updateAdminUserStats() {
    document.getElementById('admin-users-all').textContent = adminUsers.length;
    document.getElementById('admin-users-customers').textContent = adminUsers.filter(user => user.role === 'customer').length;
    document.getElementById('admin-users-owners').textContent = adminUsers.filter(user => user.role === 'owner').length;
    document.getElementById('admin-users-admins').textContent = adminUsers.filter(user => user.role === 'admin').length;
    document.getElementById('admin-users-badge').textContent = adminUsers.length;
}

function renderAdminUsers() {
    const search = document.getElementById('admin-user-search').value.trim().toLowerCase();
    const filtered = adminUsers.filter(user => {
        const matchesRole = adminActiveUserRole === 'all' || user.role === adminActiveUserRole;
        const haystack = `${user.name || ''} ${user.email || ''} ${user.phone_number || ''}`.toLowerCase();
        return matchesRole && (!search || haystack.includes(search));
    });
    const container = document.getElementById('admin-user-list');
    if (!filtered.length) {
        container.innerHTML = '<div class="admin-empty">👥<strong>No users found</strong><span>Try another role or search.</span></div>';
        return;
    }

    container.innerHTML = filtered.map(user => {
        const shop = Array.isArray(user.shops) ? user.shops[0] : user.shops;
        const joined = new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        return `<article class="admin-user-card role-${user.role}">
            <div class="admin-user-avatar">${user.avatar_url
                ? `<img src="${adminEscape(user.avatar_url)}" alt="${adminEscape(user.name || 'User')} profile photo" loading="lazy">`
                : adminEscape((user.name || user.email || '?').charAt(0).toUpperCase())}</div>
            <div class="admin-user-copy">
                <div class="admin-user-title"><strong>${adminEscape(user.name || 'Unnamed user')}</strong><span>${adminEscape(user.role)}</span></div>
                <div>${adminEscape(user.email || '—')}</div>
                <small>${adminEscape(user.phone_number || 'No phone')} · Joined ${joined}</small>
                ${shop ? `<small class="admin-user-shop">🏪 ${adminEscape(shop.name)} · ${adminEscape(shop.status)}</small>` : ''}
            </div>
        </article>`;
    }).join('');
}

async function loadAdminUsers() {
    const container = document.getElementById('admin-user-list');
    container.innerHTML = '<div class="hist-loading"><div class="hist-spinner"></div><span>Loading users…</span></div>';
    const { data, error } = await supabaseClient
        .from('users')
        .select(`id, name, email, phone_number, role, avatar_path, created_at,
            shops!shops_owner_id_fkey (name, status)`)
        .order('created_at', { ascending: false });
    if (error) {
        console.error('Admin user load failed:', error);
        container.innerHTML = `<div class="hist-error">${adminEscape(error.message)}</div>`;
        return;
    }
    adminUsers = data || [];
    await hydrateProfileAvatars(adminUsers);
    updateAdminUserStats();
    renderAdminUsers();
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
                <div class="admin-shop-avatar">${owner.avatar_url
                    ? `<img src="${adminEscape(owner.avatar_url)}" alt="${adminEscape(owner.name || 'Owner')} profile photo" loading="lazy">`
                    : adminEscape(shop.name.charAt(0).toUpperCase())}</div>
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
            users!shops_owner_id_fkey (id, name, email, phone_number, avatar_path)`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Admin shop load failed:', error);
        container.innerHTML = `<div class="hist-error">${adminEscape(error.message)}</div>`;
        return;
    }
    adminShops = data || [];
    await hydrateProfileAvatars(adminShops.map(shop => shop.users).filter(Boolean));
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
    syncAdminProfileUI();
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
    document.querySelectorAll('#admin-user-filter-row .admin-filter').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('#admin-user-filter-row .admin-filter').forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            adminActiveUserRole = button.dataset.role;
            renderAdminUsers();
        });
    });
    document.getElementById('admin-user-search').addEventListener('input', renderAdminUsers);
    document.addEventListener('click', event => {
        if (!document.getElementById('admin-profile-dropdown-wrap')?.contains(event.target)) {
            closeAdminProfileDropdown();
        }
    });

    await loadAdminShops();
    await loadAdminUsers();
    const requestedPanel = location.hash.replace('#', '');
    if (['shops', 'users'].includes(requestedPanel)) showAdminPanel(requestedPanel);
    adminShopChannel = supabaseClient
        .channel('admin-shops-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shops' }, loadAdminShops)
        .subscribe();
    adminUserChannel = supabaseClient
        .channel('admin-users-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, loadAdminUsers)
        .subscribe();
}

window.addEventListener('beforeunload', () => {
    if (adminShopChannel) supabaseClient.removeChannel(adminShopChannel);
    if (adminUserChannel) supabaseClient.removeChannel(adminUserChannel);
});

document.addEventListener('DOMContentLoaded', initAdminPage);
