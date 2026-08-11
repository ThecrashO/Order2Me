// ============================================================
// owner.js  --  Order2Me Owner Dashboard
// ============================================================
// Sections:
//   1. Init
//   2. Orders -- load, render, filter, status update, reject
//   3. Menu   -- load, display, add, edit, delete, toggle
//   4. Customers -- load, render, filter
// ============================================================

// ── Globals ──────────────────────────────────────────────────
let addFoodModal;
let editFoodModal;
let rejectModal;
const NOTIFICATION_PREF_KEY = 'order2me-notifications-enabled';

function syncOwnerNotificationSettingUI() {
    const checkbox = document.getElementById('owner-notification-toggle');
    const statusEl = document.getElementById('owner-notification-setting-status');
    if (!checkbox || !statusEl) return;

    const supported = 'Notification' in window && location.protocol !== 'file:';
    checkbox.disabled = !supported;
    checkbox.checked = supported && isNotificationPreferenceEnabled();
    statusEl.textContent = supported
        ? (checkbox.checked ? 'Notifications are enabled.' : 'Notifications are currently disabled.')
        : 'Notifications are not available on this origin yet.';
}

async function toggleOwnerNotificationPreference() {
    const checkbox = document.getElementById('owner-notification-toggle');
    const statusEl = document.getElementById('owner-notification-setting-status');
    if (!checkbox || !statusEl) return;

    if (!('Notification' in window) || location.protocol === 'file:') {
        checkbox.checked = false;
        statusEl.textContent = 'Notifications are not available on this origin yet.';
        localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
        showToast('Notifications are not supported on this page origin yet.', 'warning');
        return;
    }

    const enable = checkbox.checked;
    if (enable) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            localStorage.setItem(NOTIFICATION_PREF_KEY, 'true');
            syncOwnerNotificationSettingUI();
            showToast('Notifications enabled.', 'success');
        } else {
            checkbox.checked = false;
            localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
            statusEl.textContent = 'Notification permission was denied.';
            showToast('Browser notification permission was denied.', 'warning');
        }
        return;
    }

    localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
    syncOwnerNotificationSettingUI();
    showToast('Notifications disabled.', 'info');
}

function isNotificationPreferenceEnabled() {
    return localStorage.getItem(NOTIFICATION_PREF_KEY) === 'true';
}

function playNotificationSound(type = 'info') {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        const audioCtx = new AudioCtx();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = type === 'danger' ? 'square' : 'sine';
        oscillator.frequency.value = type === 'success' ? 740 : type === 'warning' ? 620 : 660;
        gainNode.gain.value = 0.03;

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.12);
    } catch (error) {
        console.debug('Notification sound unavailable:', error);
    }
}

async function maybeBrowserNotification(title, message, options = {}) {
    if (!('Notification' in window) || location.protocol === 'file:') return;
    if (!isNotificationPreferenceEnabled()) return;

    const shouldUseBrowserNotify = document.visibilityState === 'hidden' || !document.hasFocus();
    if (!shouldUseBrowserNotify) return;

    if (Notification.permission !== 'granted') return;

    const notificationOptions = {
        body: message,
        icon: 'images/logo.png',
        badge: 'images/logo.png',
        tag: options.tag || 'order2me-owner-update',
        renotify: true,
        data: { url: options.url || 'owner.html' }
    };

    try {
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification(title, notificationOptions);
            return;
        }
        new Notification(title, notificationOptions);
    } catch (error) {
        console.debug('Browser notification unavailable:', error);
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('app-toast-container');
    if (!container) return;

    const typeMap = {
        success: 'text-bg-success',
        danger: 'text-bg-danger',
        warning: 'text-bg-warning text-dark',
        info: 'text-bg-primary'
    };

    const toast = document.createElement('div');
    toast.className = `toast align-items-center border-0 ${typeMap[type] || typeMap.info}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body text-white">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    container.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay: 3200 });
    bsToast.show();
    toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

let allOrders         = [];   // cache for client-side filtering (ALL orders)
let activeFilter      = 'today'; // default: show today's active orders
let activeSearch      = '';   // search query for orders
let ownerProfile      = null; // current logged-in owner
let menuItemsData     = new Map(); // id -> full item object (used for edit/image lookups)
let allMenuItemsArr   = [];  // flat array cache for menu search
let allCustomersArr    = [];  // flat array cache for customer search
let ownerRealtimeChannel = null; // Supabase Realtime channel reference

// ── Date helpers ──────────────────────────────────────────────
function getTodayBounds() {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
}

function isTodayOrder(order) {
    const { start, end } = getTodayBounds();
    const t = new Date(order.created_at);
    return t >= start && t <= end;
}

function goToHistory() {
    window.location.href = 'history.html';
}

// ── 1. INIT ──────────────────────────────────────────────────

async function initializeApp() {
    if (typeof supabaseClient === 'undefined') {
        console.error('Supabase client not loaded');
        return;
    }
    if (typeof bootstrap === 'undefined') {
        console.error('Bootstrap not loaded');
        return;
    }

    // Auth guard: must be an owner
    ownerProfile = await requireOwner();
    if (!ownerProfile) return; // requireOwner redirects to login

    // Populate owner name in sidebar profile dropdown
    const nameEl = document.getElementById('owner-profile-name');
    if (nameEl && ownerProfile.name) nameEl.textContent = ownerProfile.name;

    syncOwnerNotificationSettingUI();

    // Init modals
    addFoodModal = new bootstrap.Modal(document.getElementById('addFoodModal'));
    editFoodModal = new bootstrap.Modal(document.getElementById('editFoodModal'));
    rejectModal   = new bootstrap.Modal(document.getElementById('rejectModal'));

    // Menu form buttons
    document.getElementById('submit-btn').addEventListener('click', handleAddFood);
    document.getElementById('edit-submit-btn').addEventListener('click', handleEditFood);

    // Reset add form when modal closes
    document.getElementById('addFoodModal').addEventListener('hidden.bs.modal', () => {
        document.getElementById('menu-form').reset();
        document.getElementById('add-image-preview-wrap').classList.add('d-none');
        document.getElementById('add-image-preview').src = '';
    });

    // Filter buttons
    document.querySelectorAll('.order-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.order-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.status;
            renderOrders();
        });
    });

    // Load both sections
    loadOrders();
    loadMenuItems();

    // Subscribe to Realtime order events
    subscribeOwnerRealtime();
}

// ── Realtime: listen for new orders & status changes ─────────
function subscribeOwnerRealtime() {
    if (ownerRealtimeChannel) {
        supabaseClient.removeChannel(ownerRealtimeChannel);
    }

    ownerRealtimeChannel = supabaseClient
        .channel('owner-orders-realtime')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'orders' },
            (payload) => {
                const newOrder = payload.new;
                if (!newOrder) return;

                // Only notify for today's orders
                if (!isTodayOrder(newOrder)) return;

                // Reload full orders (with joins) to get complete data
                loadOrders();

                const name = newOrder.customer_name || 'Someone';
                const total = Number(newOrder.total_amount || 0).toLocaleString();
                showToast(`🔔 New order from ${name} — ${total} MMK`, 'success');
                if (isNotificationPreferenceEnabled()) playNotificationSound('success');
                maybeBrowserNotification(
                    '🔔 New Order!',
                    `${name} placed an order for ${total} MMK`,
                    { tag: `order2me-new-order-${newOrder.id}`, url: 'owner.html#orders' }
                );
            }
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'orders' },
            (payload) => {
                const updated = payload.new;
                if (!updated) return;

                // Refresh orders list to reflect status change
                loadOrders();
            }
        )
        .subscribe();
}

// Cleanup Realtime on page unload
window.addEventListener('beforeunload', () => {
    if (ownerRealtimeChannel) {
        supabaseClient.removeChannel(ownerRealtimeChannel);
    }
});

// ── 2. ORDERS ─────────────────────────────────────────────────

async function loadOrders() {
    const { data, error } = await supabaseClient
        .from('orders')
        .select(`
            id,
            customer_name,
            status,
            total_amount,
            delivery_note,
            created_at,
            order_items (
                quantity,
                price,
                menu_items ( name )
            ),
            payments (
                payment_method,
                screenshot_url
            )
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading orders:', error);
        document.getElementById('orders-list').innerHTML =
            `<p class="text-danger">Error loading orders: ${error.message}</p>`;
        return;
    }

    allOrders = data || [];
    updatePendingBadge();
    renderOrders();
}

async function loadOwnerProfileView() {
    const statusEl = document.getElementById('owner-profile-view-status');
    const nameEl = document.getElementById('owner-profile-view-name');
    const emailEl = document.getElementById('owner-profile-view-email');
    const phoneEl = document.getElementById('owner-profile-view-phone');

    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('id, name, email, phone_number, role')
            .eq('id', ownerProfile.id)
            .single();

        if (error) throw error;

        const profile = data || ownerProfile;
        if (nameEl) nameEl.textContent = profile.name || '—';
        if (emailEl) emailEl.textContent = profile.email || '—';
        if (phoneEl) phoneEl.textContent = profile.phone_number || '—';

        if (statusEl) {
            statusEl.className = 'alert small d-none';
            statusEl.textContent = '';
        }
    } catch (error) {
        console.error('Error loading owner profile view:', error);
        if (statusEl) {
            statusEl.className = 'alert alert-danger small';
            statusEl.textContent = error?.message || 'Unable to load profile information.';
        }
    }
}

function openOwnerProfileInfo() {
    closeOwnerProfileDropdown();
    const modalEl = document.getElementById('ownerProfileViewModal');
    if (!modalEl) return;

    loadOwnerProfileView();
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function openOwnerSettings() {
    closeOwnerProfileDropdown();
    syncOwnerNotificationSettingUI();
    const modalEl = document.getElementById('ownerSettingsModal');
    if (!modalEl) return;
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function refreshOrders() {
    document.getElementById('orders-list').innerHTML = '<p class="text-muted">Refreshing...</p>';
    loadOrders();
}

function updatePendingBadge() {
    const count = allOrders.filter(o => o.status === 'pending').length;
    const badge = document.getElementById('pending-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('d-none');
    } else {
        badge.classList.add('d-none');
    }
}

function renderOrders() {
    const container = document.getElementById('orders-list');

    // 'today' filter: only orders placed today
    let base = (activeFilter === 'today')
        ? allOrders.filter(o => isTodayOrder(o))
        : allOrders;

    // Status sub-filter (all/pending/preparing/ready/delivered/cancelled)
    let filtered = (activeFilter === 'all' || activeFilter === 'today')
        ? base
        : base.filter(o => o.status === activeFilter);

    // Apply text search
    const q = activeSearch.trim().toLowerCase();
    if (q) {
        filtered = filtered.filter(o =>
            String(o.id).includes(q) ||
            (o.customer_name || '').toLowerCase().includes(q)
        );
    }

    if (filtered.length === 0) {
        const isToday = activeFilter === 'today';
        container.innerHTML = q
            ? `<p class="text-muted">No orders match "${escapeHtml(activeSearch)}".</p>`
            : isToday
                ? `<div class="text-center py-5 text-muted">
                       <div style="font-size:2.5rem">🍽️</div>
                       <p class="mt-2 mb-0 fw-semibold">No orders yet today.</p>
                       <p class="small">New orders will appear here in real time.</p>
                   </div>`
                : '<p class="text-muted">No orders found.</p>';
        return;
    }

    container.innerHTML = filtered.map(order => buildOrderCard(order)).join('');

    // Wire up screenshot view buttons (can't embed URL in onclick safely)
    document.querySelectorAll('.btn-view-screenshot').forEach(btn => {
        btn.addEventListener('click', () => {
            const url = btn.dataset.screenshotUrl;
            if (url) showImageLightbox(url);
        });
    });
}

function filterOrdersBySearch(query) {
    activeSearch = query;
    renderOrders();
}

function buildOrderCard(order) {
    const statusConfig = {
        pending:   { color: 'warning',   label: 'Pending'   },
        preparing: { color: 'info',      label: 'Preparing' },
        ready:     { color: 'success',   label: 'Ready'     },
        delivered: { color: 'secondary', label: 'Delivered' },
        cancelled: { color: 'danger',    label: 'Cancelled' }
    };
    const cfg = statusConfig[order.status] || { color: 'secondary', label: order.status };

    // Build items list
    const itemsHtml = (order.order_items || []).map(oi => {
        const name = oi.menu_items ? oi.menu_items.name : 'Unknown item';
        return `<li class="list-group-item py-1 px-0 border-0">
                    ${name} &times; ${oi.quantity}
                    <span class="text-muted small">(${oi.price} MMK each)</span>
                </li>`;
    }).join('');

    // Action buttons based on current status
    let actionHtml = '';
    if (order.status === 'pending') {
        actionHtml = `
            <button class="btn btn-sm btn-success me-2"
                    onclick="updateStatus(${order.id}, 'preparing')">
                ✓ Accept
            </button>
            <button class="btn btn-sm btn-danger"
                    onclick="openRejectModal(${order.id})">
                ✗ Reject
            </button>`;
    } else if (order.status === 'preparing') {
        actionHtml = `
            <button class="btn btn-sm btn-primary"
                    onclick="updateStatus(${order.id}, 'ready')">
                Mark Ready
            </button>`;
    } else if (order.status === 'ready') {
        actionHtml = `
            <button class="btn btn-sm btn-secondary"
                    onclick="updateStatus(${order.id}, 'delivered')">
                Mark Delivered
            </button>`;
    } else if (order.status === 'cancelled') {
        actionHtml = `<span class="badge bg-danger">Cancelled / Rejected</span>`;
    }

    // Delivery note (now always required — display prominently)
    const deliveryNoteHtml = order.delivery_note
        ? `<div class="p-2 mb-2 rounded" style="background:#fff8e1;border-left:4px solid #ffc107">
               <strong>📍 Delivery Note:</strong><br>
               <span class="small">${escapeHtml(order.delivery_note)}</span>
           </div>`
        : '';

    // Payment info
    // NOTE: Supabase returns payments as a plain object (not array) because
    // payments.order_id has a UNIQUE constraint (1-to-1 relationship).
    const payment = order.payments
        ? (Array.isArray(order.payments) ? order.payments[0] : order.payments)
        : null;
    let paymentHtml = '';
    if (payment) {
        const methodIcons = { KBZPay: '📱', WavePay: '🌊', Cash: '✅' };
        const icon = methodIcons[payment.payment_method] || '💳';
        const screenshotLink = payment.screenshot_url
            ? `<button type="button" class="btn btn-sm btn-outline-secondary ms-2 btn-view-screenshot"
                   data-screenshot-url="${payment.screenshot_url}">
                   🖼 View Screenshot
               </button>`
            : '<span class="text-muted small ms-2">(no screenshot)</span>';
        paymentHtml = `
            <div class="d-flex align-items-center mb-2">
                <span class="badge bg-dark me-1">${icon} ${escapeHtml(payment.payment_method)}</span>
                ${screenshotLink}
            </div>`;
    } else {
        paymentHtml = '<p class="text-muted small mb-2">⚠ No payment record</p>';
    }

    const time = new Date(order.created_at).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    return `
        <div class="card mb-3 border-${cfg.color}" id="order-card-${order.id}">
            <div class="card-header d-flex justify-content-between align-items-center bg-${cfg.color} bg-opacity-10">
                <div>
                    <span class="fw-semibold">Order #${order.id}</span>
                    <span class="text-muted small ms-2">— ${escapeHtml(order.customer_name || 'Unknown')}</span>
                </div>
                <span class="badge bg-${cfg.color} text-dark">${cfg.label}</span>
            </div>
            <div class="card-body py-2">
                <ul class="list-group list-group-flush mb-2">${itemsHtml}</ul>
                ${deliveryNoteHtml}
                ${paymentHtml}
                <p class="mb-1 small"><strong>Total:</strong> ${order.total_amount} MMK</p>
                <p class="mb-2 text-muted small"><strong>Placed:</strong> ${time}</p>
                <div class="d-flex gap-2">${actionHtml}</div>
            </div>
        </div>
    `;
}

async function updateStatus(orderId, newStatus) {
    const { error } = await supabaseClient
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

    if (error) {
        console.error('Error updating status:', error);
        showToast('Failed to update status: ' + error.message, 'danger');
        return;
    }

    // Update local cache and re-render without full reload
    const order = allOrders.find(o => o.id === orderId);
    if (order) order.status = newStatus;
    updatePendingBadge();
    renderOrders();
    showToast(`Order #${orderId} updated to ${newStatus}.`, 'success');
    console.log(`Order ${orderId} updated to ${newStatus}`);
}

// ── Reject flow ───────────────────────────────────────────────

function openRejectModal(orderId) {
    document.getElementById('reject-order-id').value = orderId;
    document.getElementById('reject-reason').value   = '';
    document.getElementById('reject-reason-custom').value = '';
    document.getElementById('reject-error').classList.add('d-none');
    rejectModal.show();
}

async function confirmReject() {
    const orderId = document.getElementById('reject-order-id').value;
    const reason  = document.getElementById('reject-reason').value;
    const custom  = document.getElementById('reject-reason-custom').value.trim();
    const errEl   = document.getElementById('reject-error');
    const btn     = document.getElementById('confirm-reject-btn');
    const spinner = document.getElementById('reject-spinner');

    if (!reason) {
        errEl.classList.remove('d-none');
        return;
    }
    errEl.classList.add('d-none');

    const finalReason = custom ? `${reason} -- ${custom}` : reason;

    btn.disabled = true;
    spinner.classList.remove('d-none');

    const { error } = await supabaseClient
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);

    btn.disabled = false;
    spinner.classList.add('d-none');

    if (error) {
        console.error('Error rejecting order:', error);
        showToast('Failed to reject order: ' + error.message, 'danger');
        return;
    }

    console.log(`Order ${orderId} cancelled. Reason: ${finalReason}`);
    showToast(`Order #${orderId} cancelled successfully.`, 'success');
    rejectModal.hide();

    const order = allOrders.find(o => o.id === Number(orderId));
    if (order) order.status = 'cancelled';
    updatePendingBadge();
    renderOrders();
}

// ── 3. MENU ───────────────────────────────────────────────────

async function loadMenuItems() {
    const { data, error } = await supabaseClient
        .from('menu_items')
        .select('*')
        .order('created_at', { ascending: false });

    const menuList = document.getElementById('menu-list');

    if (error) {
        menuList.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
        return;
    }

    displayMenuItems(data);
}

function filterMenuItems(query) {
    const q = query.trim().toLowerCase();
    const menuList = document.getElementById('menu-list');
    if (!q) {
        displayMenuItems(allMenuItemsArr);
        return;
    }
    const filtered = allMenuItemsArr.filter(item =>
        item.name.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q)
    );
    if (filtered.length === 0) {
        menuList.innerHTML = `<p class="text-muted">No items match "${escapeHtml(query)}".</p>`;
        return;
    }
    displayMenuItems(filtered);
}

function displayMenuItems(items) {
    const menuList = document.getElementById('menu-list');

    if (!items || items.length === 0) {
        menuList.innerHTML = "<p class='text-muted'>No menu items yet. Click 'Add Food' to get started!</p>";
        return;
    }

    // Store full item objects for later use by event listeners
    menuItemsData.clear();
    items.forEach(item => menuItemsData.set(item.id, item));
    allMenuItemsArr = items; // cache for search

    menuList.innerHTML = `<div class="row g-3 owner-menu-grid">${items.map(item => {
        const catBadge = categoryBadge(item.category);
        const imgHtml = item.image_url
            ? `<img src="${item.image_url}" alt="${escapeHtml(item.name)}"
                    class="owner-menu-card-img" onerror="this.style.display='none'">`
            : `<div class="owner-menu-card-img owner-menu-img-placeholder">🍽️</div>`;
        return `
        <div class="col-12 col-sm-6 col-lg-4">
            <div class="card h-100 shadow-sm owner-menu-card ${item.is_available ? '' : 'opacity-60'}">
                <div class="owner-menu-img-wrap">${imgHtml}</div>
                <div class="card-body p-3">
                    <div class="d-flex align-items-start justify-content-between gap-2 mb-1">
                        <h6 class="card-title mb-0 owner-menu-card-name">${escapeHtml(item.name)}</h6>
                        ${catBadge}
                    </div>
                    <p class="text-muted small mb-2 owner-menu-card-desc">${escapeHtml(item.description || '—')}</p>
                    <div class="fw-bold text-primary mb-2">${Number(item.price).toLocaleString()} MMK</div>
                    <div class="d-flex align-items-center justify-content-between gap-2">
                        <div class="d-flex align-items-center gap-1">
                            <div class="form-check form-switch mb-0">
                                <input class="form-check-input toggle-availability" type="checkbox"
                                       id="toggle-${item.id}" ${item.is_available ? 'checked' : ''}
                                       data-id="${item.id}" role="switch">
                                <label class="form-check-label small text-muted" for="toggle-${item.id}">
                                    ${item.is_available ? 'Available' : 'Hidden'}
                                </label>
                            </div>
                        </div>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-warning btn-edit-item" data-item-id="${item.id}">✏️</button>
                            <button class="btn btn-sm btn-danger btn-delete-item" data-item-id="${item.id}">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('')}</div>`;

    // Wire up toggle switches
    document.querySelectorAll('.toggle-availability').forEach(toggle => {
        toggle.addEventListener('change', toggleAvailability);
    });

    // Wire up image thumbnail clicks (no inline onclick with URL)
    document.querySelectorAll('.menu-thumb').forEach(img => {
        img.addEventListener('click', () => {
            const item = menuItemsData.get(Number(img.dataset.itemId));
            if (item && item.image_url) showImageLightbox(item.image_url);
        });
    });

    // Wire up Edit buttons
    document.querySelectorAll('.btn-edit-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = menuItemsData.get(Number(btn.dataset.itemId));
            if (item) openEditModal(item.id, item.name, item.description || '', item.price, item.is_available, item.image_url || '', item.category || 'food');
        });
    });

    // Wire up Delete buttons
    document.querySelectorAll('.btn-delete-item').forEach(btn => {
        btn.addEventListener('click', () => deleteItem(Number(btn.dataset.itemId)));
    });
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// ── 4. CUSTOMERS ───────────────────────────────────────────────

async function loadCustomers() {
    const container = document.getElementById('customers-list');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center py-4 text-muted">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            Loading customers...
        </div>`;

    // Fetch customers + their order count in one query via Supabase embedded select
    const { data, error } = await supabaseClient
        .from('users')
        .select(`
            id,
            name,
            email,
            phone_number,
            created_at,
            orders ( id )
        `)
        .eq('role', 'customer')
        .order('created_at', { ascending: false });

    if (error) {
        container.innerHTML = `<p class="text-danger p-3"><strong>Error:</strong> ${escapeHtml(error.message)}</p>`;
        return;
    }

    allCustomersArr = (data || []).map(s => ({
        ...s,
        order_count: Array.isArray(s.orders) ? s.orders.length : 0
    }));

    // Update sidebar count badge
    const badge = document.getElementById('customers-count-badge');
    if (badge) {
        badge.textContent = allCustomersArr.length;
        if (allCustomersArr.length > 0) badge.classList.remove('d-none');
        else badge.classList.add('d-none');
    }

    renderCustomers(allCustomersArr);
}

function filterCustomers(query) {
    const q = query.trim().toLowerCase();
    if (!q) { renderCustomers(allCustomersArr); return; }
    const filtered = allCustomersArr.filter(s =>
        (s.name  || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.phone_number || '').toLowerCase().includes(q)
    );
    renderCustomers(filtered, q);
}

function renderCustomers(customers, query = '') {
    const container = document.getElementById('customers-list');
    if (!container) return;

    if (!customers || customers.length === 0) {
        container.innerHTML = query
            ? `<div class="p-5 text-center text-muted">
                   <div style="font-size:2.5rem;">🔍</div>
                   <p class="mb-0 mt-2">No customers match "<strong>${escapeHtml(query)}</strong>".</p>
               </div>`
            : `<div class="p-5 text-center text-muted">
                   <div style="font-size:2.5rem;">👤</div>
                   <p class="mb-0 mt-2">No registered customers yet.</p>
               </div>`;
        return;
    }

    const palettes = [
        { bg: '#3b82f6', light: '#eff6ff' },
        { bg: '#8b5cf6', light: '#f5f3ff' },
        { bg: '#10b981', light: '#ecfdf5' },
        { bg: '#f59e0b', light: '#fffbeb' },
        { bg: '#ef4444', light: '#fef2f2' },
        { bg: '#06b6d4', light: '#ecfeff' },
        { bg: '#f97316', light: '#fff7ed' },
    ];

    const cards = customers.map((s, idx) => {
        const initials = (s.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const joinDate = new Date(s.created_at).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
        const { bg, light } = palettes[idx % palettes.length];
        const hasOrders = s.order_count > 0;

        return `
        <div class="col-12 col-sm-6 col-lg-4">
            <div class="card customer-card h-100 shadow-sm">
                <div class="card-body p-3">

                    <!-- Avatar + Name row -->
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="customer-avatar" style="background:${bg};">
                            ${initials}
                        </div>
                        <div class="min-w-0">
                            <div class="fw-bold customer-card-name">${escapeHtml(s.name || '—')}</div>
                            <div class="customer-card-joined text-muted">Joined ${joinDate}</div>
                        </div>
                    </div>

                    <!-- Info rows -->
                    <div class="customer-card-info">
                        <div class="customer-info-row">
                            <span class="customer-info-icon">✉️</span>
                            <span class="text-muted small text-truncate">${escapeHtml(s.email || '—')}</span>
                        </div>
                        <div class="customer-info-row">
                            <span class="customer-info-icon">📞</span>
                            <span class="text-muted small">${s.phone_number ? escapeHtml(s.phone_number) : '<em class="text-muted">No phone</em>'}</span>
                        </div>
                    </div>

                    <!-- Orders badge -->
                    <div class="customer-orders-row mt-3 pt-2 border-top d-flex align-items-center justify-content-between">
                        <span class="text-muted small">Total Orders</span>
                        <span class="badge ${hasOrders ? 'bg-primary' : 'bg-secondary bg-opacity-50 text-secondary'} rounded-pill px-3">
                            ${s.order_count || 0} order${s.order_count !== 1 ? 's' : ''}
                        </span>
                    </div>

                </div>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="p-3">
            <div class="row g-3">${cards}</div>
            <p class="text-muted small mt-3 mb-0 text-end">
                ${customers.length} customer${customers.length !== 1 ? 's' : ''} registered
            </p>
        </div>
    `;
}

// ── Category badge helper ─────────────────────────────────────
const CATEGORY_META = {
    food:    { icon: '🍽️', label: 'Food',    color: 'primary'  },
    drink:   { icon: '🥤', label: 'Drink',   color: 'info'     },
    salad:   { icon: '🥗', label: 'Salad',   color: 'success'  },
    snack:   { icon: '🍿', label: 'Snack',   color: 'warning'  },
    dessert: { icon: '🍰', label: 'Dessert', color: 'danger'   },
    other:   { icon: '📦', label: 'Other',   color: 'secondary'}
};

function categoryBadge(cat) {
    const m = CATEGORY_META[cat] || CATEGORY_META.other;
    return `<span class="badge bg-${m.color} bg-opacity-75">${m.icon} ${m.label}</span>`;
}

// ── Image upload helpers ──────────────────────────────────────

function previewAddImage(input) {
    const wrap = document.getElementById('add-image-preview-wrap');
    const img  = document.getElementById('add-image-preview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; wrap.classList.remove('d-none'); };
        reader.readAsDataURL(input.files[0]);
    } else {
        wrap.classList.add('d-none');
        img.src = '';
    }
}

function previewEditImage(input) {
    const wrap = document.getElementById('edit-image-preview-wrap');
    const img  = document.getElementById('edit-image-preview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; wrap.classList.remove('d-none'); };
        reader.readAsDataURL(input.files[0]);
    } else {
        wrap.classList.add('d-none');
        img.src = '';
    }
}

async function uploadMenuItemImage(file, itemId) {
    const ext      = file.name.split('.').pop();
    const fileName = `menu_${itemId}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
        .from('menu-images')
        .upload(fileName, file, { upsert: true });

    if (uploadError) {
        console.error('Menu image upload error:', uploadError);
        showToast('Image upload failed: ' + uploadError.message, 'danger');
        return null;
    }

    const { data } = supabaseClient.storage
        .from('menu-images')
        .getPublicUrl(fileName);

    console.log('Image uploaded successfully. Public URL:', data.publicUrl);
    return data.publicUrl || null;
}

// ─────────────────────────────────────────────────────────────

async function handleAddFood() {
    const name        = document.getElementById('item-name').value.trim();
    const description = document.getElementById('item-description').value.trim();
    const price       = parseFloat(document.getElementById('item-price').value);
    const isAvailable = document.getElementById('item-available').checked;
    const category    = document.getElementById('item-category').value;
    const imageFile   = document.getElementById('item-image').files[0];

    if (!name || isNaN(price) || price < 0) return;

    // Insert first to get the new item id for the image filename
    const { data: insertedItem, error } = await supabaseClient
        .from('menu_items')
        .insert([{ name, description, price, is_available: isAvailable, category }])
        .select()
        .single();

    if (error) {
        console.error('Error adding food:', error);
        showToast('Failed to add food item.', 'danger');
        return;
    }

    // Upload image if provided
    if (imageFile) {
        const imageUrl = await uploadMenuItemImage(imageFile, insertedItem.id);
        if (imageUrl) {
            await supabaseClient
                .from('menu_items')
                .update({ image_url: imageUrl })
                .eq('id', insertedItem.id);
        }
    }

    document.getElementById('menu-form').reset();
    document.getElementById('add-image-preview-wrap').classList.add('d-none');
    addFoodModal.hide();
    loadMenuItems();
    showToast('Food item added successfully.', 'success');
}

function openEditModal(id, name, description, price, isAvailable, imageUrl, category) {
    document.getElementById('edit-item-id').value             = id;
    document.getElementById('edit-item-name').value           = name;
    document.getElementById('edit-item-description').value    = description;
    document.getElementById('edit-item-price').value          = price;
    document.getElementById('edit-item-available').checked    = isAvailable;
    document.getElementById('edit-item-existing-image').value = imageUrl || '';
    document.getElementById('edit-item-category').value       = category || 'food';

    // Show/hide current image
    const currentWrap = document.getElementById('edit-current-image-wrap');
    const currentImg  = document.getElementById('edit-current-image');
    if (imageUrl) {
        currentImg.src = imageUrl;
        currentWrap.classList.remove('d-none');
    } else {
        currentImg.src = '';
        currentWrap.classList.add('d-none');
    }

    // Reset new-image preview
    document.getElementById('edit-item-image').value = '';
    document.getElementById('edit-image-preview-wrap').classList.add('d-none');
    document.getElementById('edit-image-preview').src = '';

    editFoodModal.show();
}

async function handleEditFood() {
    const itemId        = document.getElementById('edit-item-id').value;
    const name          = document.getElementById('edit-item-name').value.trim();
    const description   = document.getElementById('edit-item-description').value.trim();
    const price         = parseFloat(document.getElementById('edit-item-price').value);
    const isAvailable   = document.getElementById('edit-item-available').checked;
    const category      = document.getElementById('edit-item-category').value;
    const newImageFile  = document.getElementById('edit-item-image').files[0];
    const existingImage = document.getElementById('edit-item-existing-image').value;

    if (!itemId || !name || isNaN(price) || price < 0) return;

    // Upload new image if provided, otherwise keep existing
    let imageUrl = existingImage || null;
    if (newImageFile) {
        const uploaded = await uploadMenuItemImage(newImageFile, itemId);
        if (uploaded) imageUrl = uploaded;
    }

    const { error } = await supabaseClient
        .from('menu_items')
        .update({ name, description, price, is_available: isAvailable, image_url: imageUrl, category })
        .eq('id', itemId);

    if (error) {
        console.error('Error editing food:', error);
        showToast('Failed to update food item.', 'danger');
        return;
    }

    editFoodModal.hide();
    loadMenuItems();
    showToast('Food item updated successfully.', 'success');
}

async function toggleAvailability(event) {
    const itemId      = event.target.dataset.id;
    const isAvailable = event.target.checked;

    const { error } = await supabaseClient
        .from('menu_items')
        .update({ is_available: isAvailable })
        .eq('id', itemId);

    if (error) {
        console.error('Error toggling availability:', error);
        event.target.checked = !isAvailable; // revert
    }
}

async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    const { error } = await supabaseClient
        .from('menu_items')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting food:', error);
        showToast('Failed to delete menu item: ' + error.message, 'danger');
        return;
    }

    loadMenuItems();
    showToast('Menu item deleted successfully.', 'success');
}

// ── Image Lightbox ───────────────────────────────────────────

function showImageLightbox(url) {
    // Remove any existing lightbox
    const existing = document.getElementById('img-lightbox');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'img-lightbox';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,0.75);
        backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        animation: fadeIn .2s ease;
    `;
    overlay.innerHTML = `
        <style>
            @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
            @keyframes popIn  { from { transform:scale(.85); opacity:0 } to { transform:scale(1); opacity:1 } }
        </style>
        <div style="position:relative; max-width:90vw; max-height:90vh; animation: popIn .25s ease;">
            <button onclick="closeImageLightbox()"
                style="
                    position:absolute; top:-14px; right:-14px;
                    width:32px; height:32px; border-radius:50%;
                    background:#fff; border:none; font-size:18px;
                    font-weight:bold; cursor:pointer; color:#333;
                    box-shadow:0 2px 8px rgba(0,0,0,.4);
                    display:flex; align-items:center; justify-content:center;
                    line-height:1; z-index:1;
                "
                title="Close">&times;</button>
            <img src="${url}" alt="Payment Screenshot"
                style="
                    max-width:90vw; max-height:88vh;
                    border-radius:12px;
                    box-shadow:0 8px 40px rgba(0,0,0,.6);
                    display:block;
                ">
        </div>
    `;
    // Click backdrop to close
    overlay.addEventListener('click', e => { if (e.target === overlay) closeImageLightbox(); });
    document.body.appendChild(overlay);

    // ESC key to close
    document.addEventListener('keydown', _lightboxEscHandler);
}

function _lightboxEscHandler(e) {
    if (e.key === 'Escape') closeImageLightbox();
}

function closeImageLightbox() {
    const lb = document.getElementById('img-lightbox');
    if (lb) lb.remove();
    document.removeEventListener('keydown', _lightboxEscHandler);
}

// ── Init ──────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
