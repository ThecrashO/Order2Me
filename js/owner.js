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
    const enableButton = document.getElementById('owner-enable-notifications-btn');
    if (!checkbox || !statusEl) return;

    const environment = getNotificationEnvironment();
    const permission = environment.permission || 'unsupported';
    checkbox.disabled = !environment.supported || permission === 'denied';
    checkbox.checked = environment.supported && permission === 'granted' && isNotificationPreferenceEnabled();
    statusEl.textContent = getNotificationStatusMessage()
        || (checkbox.checked ? 'Notifications are enabled.' : 'Turn this on to receive new-order alerts.');
    if (enableButton) {
        enableButton.disabled = false;
        enableButton.textContent = !environment.supported
            ? 'View setup instructions'
            : permission === 'denied'
            ? 'How to unblock notifications'
            : checkbox.checked
                ? 'Send test notification'
                : 'Enable notifications';
    }
    if (environment.supported && permission !== 'denied') {
        hideNotificationPermissionHelp('owner-notification-help');
    }
}

async function toggleOwnerNotificationPreference() {
    const checkbox = document.getElementById('owner-notification-toggle');
    await setOwnerNotificationPreference(Boolean(checkbox?.checked));
}

async function enableOwnerNotifications() {
    const environment = getNotificationEnvironment();
    if (!environment.supported || environment.permission === 'denied') {
        showNotificationPermissionHelp('owner-notification-help');
        syncOwnerNotificationSettingUI();
        return;
    }

    const alreadyEnabled = environment.supported
        && isNotificationPreferenceEnabled()
        && environment.permission === 'granted';
    if (alreadyEnabled) {
        playNotificationSound('success');
        const shown = await maybeBrowserNotification(
            'Order2Me owner test',
            'Owner notifications are working correctly.',
            { tag: `order2me-owner-test-${Date.now()}`, url: 'owner.html#orders' }
        );
        const statusEl = document.getElementById('owner-notification-setting-status');
        statusEl.textContent = shown
            ? 'Test notification sent successfully.'
            : 'The test could not be displayed. Check browser notification settings.';
        return;
    }
    await setOwnerNotificationPreference(true);
}

async function setOwnerNotificationPreference(enable) {
    const checkbox = document.getElementById('owner-notification-toggle');
    const statusEl = document.getElementById('owner-notification-setting-status');
    if (!checkbox || !statusEl) return;

    const environment = getNotificationEnvironment();
    if (!environment.supported) {
        checkbox.checked = false;
        localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
        syncOwnerNotificationSettingUI();
        showNotificationPermissionHelp('owner-notification-help');
        showToast(getNotificationStatusMessage(), 'warning');
        return;
    }

    if (enable && environment.permission === 'denied') {
        checkbox.checked = false;
        localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
        syncOwnerNotificationSettingUI();
        showNotificationPermissionHelp('owner-notification-help');
        statusEl.textContent = 'Notifications were blocked. Follow the instructions below to allow them.';
        showToast('Notifications must be allowed in the device settings first.', 'warning');
        return;
    }

    if (enable) {
        statusEl.textContent = 'Requesting browser permission…';
        let permission;
        try {
            permission = await Notification.requestPermission();
        } catch (error) {
            console.error('Notification permission request failed:', error);
            checkbox.checked = false;
            localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
            showToast('Unable to enable browser notifications.', 'warning');
            syncOwnerNotificationSettingUI();
            statusEl.textContent = 'Unable to request permission. Open this app over HTTPS and check Site Settings.';
            return;
        }
        if (permission === 'granted') {
            checkbox.checked = true;
            localStorage.setItem(NOTIFICATION_PREF_KEY, 'true');
            syncOwnerNotificationSettingUI();
            showToast('Notifications enabled.', 'success');
            playNotificationSound('success');
            const shown = await maybeBrowserNotification(
                'Order2Me notifications enabled',
                'You will now receive alerts for new orders.',
                { tag: 'order2me-owner-notification-test', url: 'owner.html#orders' }
            );
            statusEl.textContent = shown
                ? 'Notifications are enabled. A test was sent.'
                : 'Permission is enabled, but the test could not be displayed.';
        } else {
            checkbox.checked = false;
            localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
            syncOwnerNotificationSettingUI();
            if (permission === 'denied') showNotificationPermissionHelp('owner-notification-help');
            statusEl.textContent = permission === 'denied'
                ? 'Notifications were blocked. Follow the instructions below to allow them.'
                : 'Permission was not granted. Tap Enable notifications to try again.';
            showToast('Notification permission was not enabled.', 'warning');
        }
        return;
    }

    localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
    checkbox.checked = false;
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
    if (!('Notification' in window) || !window.isSecureContext) return false;
    if (!isNotificationPreferenceEnabled() || Notification.permission !== 'granted') return false;

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
            let registration = await navigator.serviceWorker.getRegistration();
            if (!registration) registration = await navigator.serviceWorker.register('sw.js');
            await registration.showNotification(title, notificationOptions);
            return true;
        }
        new Notification(title, notificationOptions);
        return true;
    } catch (error) {
        console.error('Browser notification unavailable:', error);
        return false;
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('app-toast-container');
    if (!container) return;

    const typeMap = {
        success: 'text-bg-success',
        danger: 'text-bg-danger',
        warning: 'text-bg-warning text-dark',
        info: 'text-bg-info'
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
let activeOwnerMenuCategory = 'all';
let activeOwnerMenuSearch   = '';
let allCustomersArr    = [];  // flat array cache for customer search
let ownerRealtimeChannel = null; // Supabase Realtime channel reference
let ownerShop          = null;

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
    ownerShop = ownerProfile.shop;

    // Populate owner name in sidebar profile dropdown
    const nameEl = document.getElementById('owner-profile-name');
    if (nameEl && ownerProfile.name) nameEl.textContent = ownerProfile.name;
    const shopNameEl = document.getElementById('owner-shop-name');
    if (shopNameEl) shopNameEl.textContent = ownerShop.name;
    await refreshCurrentProfileAvatars(ownerProfile);

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

    setupOwnerMenuCategoryFilters();

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
            { event: 'INSERT', schema: 'public', table: 'orders', filter: `shop_id=eq.${ownerShop.id}` },
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
            { event: 'UPDATE', schema: 'public', table: 'orders', filter: `shop_id=eq.${ownerShop.id}` },
            (payload) => {
                const updated = payload.new;
                const previous = payload.old;
                if (!updated) return;

                // Refresh orders list to reflect status change
                loadOrders();

                if (updated.status === 'delivered' && previous?.status === 'out_for_delivery') {
                    const customerName = updated.customer_name || 'The customer';
                    showToast(`✅ ${customerName} confirmed Order #${updated.id} was received.`, 'success');
                    if (isNotificationPreferenceEnabled()) playNotificationSound('success');
                    maybeBrowserNotification(
                        'Order received',
                        `${customerName} confirmed receipt of Order #${updated.id}.`,
                        { tag: `order2me-received-${updated.id}`, url: 'owner.html#orders' }
                    );
                }
            }
        )
        .subscribe((status) => {
            setOwnerRealtimeStatus(status);
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('Owner realtime notification channel:', status);
            }
        });
}

function setOwnerRealtimeStatus(status) {
    const statusEl = document.getElementById('owner-realtime-status');
    if (!statusEl) return;

    statusEl.classList.remove('text-muted', 'text-success', 'text-danger');
    if (status === 'SUBSCRIBED') {
        statusEl.classList.add('text-success');
        statusEl.textContent = 'Live order connection: connected';
        return;
    }

    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        statusEl.classList.add('text-danger');
        statusEl.textContent = 'Live order connection: disconnected. Refresh this page.';
        return;
    }

    statusEl.classList.add('text-muted');
    statusEl.textContent = 'Live order connection: connecting…';
}

// Cleanup Realtime on page unload
window.addEventListener('beforeunload', () => {
    if (ownerRealtimeChannel) {
        supabaseClient.removeChannel(ownerRealtimeChannel);
    }
});

// ── 2. ORDERS ─────────────────────────────────────────────────

async function loadOrders() {
    const buildOrderSelect = includeScreenshotPath => `
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
                ${includeScreenshotPath ? ', screenshot_path' : ''}
            )
        `;
    const fetchOrders = includeScreenshotPath => supabaseClient
        .from('orders')
        .select(buildOrderSelect(includeScreenshotPath))
        .eq('shop_id', ownerShop.id)
        .order('created_at', { ascending: false });

    let { data, error } = await fetchOrders(true);
    const errorText = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
    if (error && (error.code === '42703' || /screenshot_path/i.test(errorText))) {
        console.warn('payments.screenshot_path is not available yet; loading orders with the legacy schema. Run the Supabase SQL patch.');
        ({ data, error } = await fetchOrders(false));
    }

    if (error) {
        console.error('Error loading orders:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
        });
        document.getElementById('orders-list').innerHTML =
            `<p class="text-danger">Error loading orders: ${error.message}</p>`;
        return;
    }

    allOrders = data || [];
    await hydratePaymentScreenshotUrls(allOrders);
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
            .select('id, name, email, phone_number, role, avatar_path')
            .eq('id', ownerProfile.id)
            .single();

        if (error) throw error;

        const profile = data || ownerProfile;
        ownerProfile = { ...ownerProfile, ...profile, shop: ownerShop };
        if (nameEl) nameEl.textContent = profile.name || '—';
        if (emailEl) emailEl.textContent = profile.email || '—';
        if (phoneEl) phoneEl.textContent = profile.phone_number || '—';
        const heroNameEl = document.getElementById('owner-profile-hero-name');
        if (heroNameEl) heroNameEl.textContent = profile.name || '—';
        const dropdownNameEl = document.getElementById('owner-profile-name');
        if (dropdownNameEl) dropdownNameEl.textContent = profile.name || '—';
        await refreshCurrentProfileAvatars(ownerProfile);

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
    watchNotificationPermission(syncOwnerNotificationSettingUI);
    document.getElementById('owner-shop-settings-name').value = ownerShop?.name || '';
    document.getElementById('owner-shop-settings-phone').value = ownerShop?.phone_number || '';
    document.getElementById('owner-shop-settings-address').value = ownerShop?.address || '';
    document.getElementById('owner-shop-settings-description').value = ownerShop?.description || '';
    const statusEl = document.getElementById('owner-shop-settings-status');
    statusEl.className = 'alert small d-none';
    statusEl.textContent = '';
    const modalEl = document.getElementById('ownerSettingsModal');
    if (!modalEl) return;
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function openOwnerProfileEdit() {
    bootstrap.Modal.getInstance(document.getElementById('ownerSettingsModal'))?.hide();
    bootstrap.Modal.getInstance(document.getElementById('ownerProfileViewModal'))?.hide();

    document.getElementById('owner-profile-name-input').value = ownerProfile?.name || '';
    document.getElementById('owner-profile-phone-input').value = ownerProfile?.phone_number || '';
    document.getElementById('owner-profile-email-readonly').value = ownerProfile?.email || '';
    document.getElementById('owner-profile-avatar-input').value = '';
    const statusEl = document.getElementById('owner-profile-edit-status');
    statusEl.className = 'alert small d-none';
    statusEl.textContent = '';
    renderProfileAvatarElement(
        document.getElementById('owner-profile-edit-avatar'),
        ownerProfile,
        ownerProfile?.avatar_url
    );
    bootstrap.Modal.getOrCreateInstance(document.getElementById('ownerProfileEditModal')).show();
}

function handleOwnerAvatarPreview(input) {
    const statusEl = document.getElementById('owner-profile-edit-status');
    try {
        previewSelectedProfileImage(input, 'owner-profile-edit-avatar', ownerProfile);
        statusEl.className = 'alert small d-none';
        statusEl.textContent = '';
    } catch (error) {
        statusEl.className = 'alert alert-danger small';
        statusEl.textContent = error.message;
    }
}

async function saveOwnerProfile() {
    const name = document.getElementById('owner-profile-name-input').value.trim();
    const phone = document.getElementById('owner-profile-phone-input').value.trim();
    const imageFile = document.getElementById('owner-profile-avatar-input').files?.[0] || null;
    const statusEl = document.getElementById('owner-profile-edit-status');
    const saveBtn = document.getElementById('owner-profile-save-btn');
    const phonePattern = /^\+?[0-9()\-\s]{7,20}$/;

    if (!name || !phone || !phonePattern.test(phone)) {
        statusEl.className = 'alert alert-danger small';
        statusEl.textContent = !name ? 'Name is required.' : 'Enter a valid phone number.';
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    statusEl.className = 'alert alert-info small';
    statusEl.textContent = 'Saving your profile…';

    try {
        const updatedProfile = await updateProfileWithAvatar(
            ownerProfile,
            { name, phone_number: phone },
            imageFile
        );
        ownerProfile = { ...ownerProfile, ...updatedProfile, shop: ownerShop };
        document.getElementById('owner-profile-name').textContent = ownerProfile.name;
        await refreshCurrentProfileAvatars(ownerProfile);
        bootstrap.Modal.getInstance(document.getElementById('ownerProfileEditModal'))?.hide();
        await loadOwnerProfileView();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('ownerProfileViewModal')).show();
        showToast('Profile updated successfully.', 'success');
    } catch (error) {
        console.error('Owner profile update failed:', error);
        statusEl.className = 'alert alert-danger small';
        statusEl.textContent = error?.message || 'Unable to update your profile.';
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save changes';
    }
}

async function saveOwnerShopSettings() {
    if (!ownerShop) return;
    const statusEl = document.getElementById('owner-shop-settings-status');
    const payload = {
        name: document.getElementById('owner-shop-settings-name').value.trim(),
        phone_number: document.getElementById('owner-shop-settings-phone').value.trim() || null,
        address: document.getElementById('owner-shop-settings-address').value.trim(),
        description: document.getElementById('owner-shop-settings-description').value.trim() || null
    };
    if (!payload.name || !payload.address) {
        statusEl.className = 'alert alert-danger small';
        statusEl.textContent = 'Shop name and location are required.';
        return;
    }

    const { data, error } = await supabaseClient
        .from('shops')
        .update(payload)
        .eq('id', ownerShop.id)
        .select('id, owner_id, name, slug, description, address, phone_number, logo_url, status, rejection_reason, approved_at, created_at')
        .single();

    if (error) {
        statusEl.className = 'alert alert-danger small';
        statusEl.textContent = error.message;
        return;
    }
    ownerShop = data;
    ownerProfile.shop = data;
    document.getElementById('owner-shop-name').textContent = data.name;
    statusEl.className = 'alert alert-success small';
    statusEl.textContent = 'Shop details updated.';
    showToast('Shop details updated.', 'success');
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

    // Status sub-filter (all/pending/preparing/ready/sent/received/cancelled)
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

function getStoredScreenshotPath(payment) {
    if (payment?.screenshot_path) return payment.screenshot_path;
    const marker = '/payment-screenshots/';
    const url = payment?.screenshot_url || '';
    const index = url.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
}

async function hydratePaymentScreenshotUrls(orders) {
    const payments = (orders || []).flatMap(order => {
        if (!order.payments) return [];
        return Array.isArray(order.payments) ? order.payments : [order.payments];
    });

    await Promise.all(payments.map(async payment => {
        payment.screenshot_display_url = payment.screenshot_url || null;
        const path = getStoredScreenshotPath(payment);
        if (!path) return;
        const { data, error } = await supabaseClient.storage
            .from('payment-screenshots')
            .createSignedUrl(path, 60 * 60);
        if (error) {
            payment.screenshot_sign_error = error.message;
            console.warn('Could not create screenshot preview URL:', {
                path,
                message: error.message
            });
            return;
        }
        payment.screenshot_display_url = data?.signedUrl || payment.screenshot_url || null;
    }));
}

function buildOrderCard(order) {
    const statusConfig = {
        pending:   { key: 'pending',   label: 'Pending'   },
        preparing: { key: 'preparing', label: 'Preparing' },
        ready:     { key: 'ready',     label: 'Ready'     },
        out_for_delivery: { key: 'sent', label: 'Sent · Awaiting confirmation' },
        delivered: { key: 'received', label: 'Received' },
        cancelled: { key: 'cancelled', label: 'Cancelled' }
    };
    const cfg = statusConfig[order.status] || { key: 'unknown', label: order.status };

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
            <button class="btn btn-sm btn-primary"
                    onclick="updateStatus(${order.id}, 'out_for_delivery')">
                🛵 Mark Sent
            </button>`;
    } else if (order.status === 'out_for_delivery') {
        actionHtml = '<span class="order-status order-status--sent">Waiting for customer confirmation</span>';
    } else if (order.status === 'delivered') {
        actionHtml = '<span class="order-status order-status--received">✓ Customer confirmed receipt</span>';
    } else if (order.status === 'cancelled') {
        actionHtml = `<span class="order-status order-status--cancelled">Cancelled / Rejected</span>`;
    }

    // Delivery note (now always required — display prominently)
    const deliveryNoteHtml = order.delivery_note
        ? `<div class="order-delivery-note mb-2">
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
        const screenshotUrl = payment.screenshot_display_url || payment.screenshot_url;
        const screenshotLink = screenshotUrl
            ? `<button type="button" class="payment-screenshot-preview btn-view-screenshot"
                   data-screenshot-url="${escapeHtml(screenshotUrl)}" aria-label="View payment screenshot">
                   <img src="${escapeHtml(screenshotUrl)}" alt="Payment screenshot"
                       onerror="this.parentElement.classList.add('preview-error'); this.parentElement.disabled=true">
                   <span>View screenshot</span>
               </button>`
            : '<span class="payment-screenshot-missing">Screenshot was not uploaded</span>';
        paymentHtml = `
            <div class="payment-proof-row mb-2">
                <span class="badge bg-dark me-1">${icon} ${escapeHtml(payment.payment_method)}</span>
                ${screenshotLink}
            </div>`;
    } else {
        paymentHtml = `
            <div class="payment-proof-row payment-proof-error mb-2">
                <span class="payment-screenshot-missing">Payment proof record is missing</span>
            </div>`;
    }

    const time = new Date(order.created_at).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    return `
        <div class="card mb-3 order-card--${cfg.key}" id="order-card-${order.id}">
            <div class="card-header d-flex justify-content-between align-items-center order-card-status-surface">
                <div>
                    <span class="fw-semibold">Order #${order.id}</span>
                    <span class="text-muted small ms-2">— ${escapeHtml(order.customer_name || 'Unknown')}</span>
                </div>
                <span class="order-status order-status--${cfg.key}">${cfg.label}</span>
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
        .eq('id', orderId)
        .eq('shop_id', ownerShop.id);

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
    const statusLabel = newStatus === 'out_for_delivery' ? 'sent' : newStatus;
    showToast(`Order #${orderId} updated to ${statusLabel}.`, 'success');
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
        .eq('id', orderId)
        .eq('shop_id', ownerShop.id);

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
        .eq('shop_id', ownerShop.id)
        .order('created_at', { ascending: false });

    const menuList = document.getElementById('menu-list');

    if (error) {
        menuList.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
        return;
    }

    allMenuItemsArr = Array.isArray(data) ? data : [];
    menuItemsData.clear();
    allMenuItemsArr.forEach(item => menuItemsData.set(item.id, item));
    updateOwnerMenuCategoryCounts();
    applyOwnerMenuFilters();
}

function filterMenuItems(query) {
    activeOwnerMenuSearch = query.trim().toLowerCase();
    applyOwnerMenuFilters();
}

function normalizeOwnerMenuCategory(category) {
    const normalized = String(category || 'food').trim().toLowerCase();
    return CATEGORY_META[normalized] ? normalized : 'other';
}

function setupOwnerMenuCategoryFilters() {
    document.querySelectorAll('.owner-menu-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activeOwnerMenuCategory = btn.dataset.category || 'all';
            document.querySelectorAll('.owner-menu-filter-btn').forEach(filterBtn => {
                const isActive = filterBtn === btn;
                filterBtn.classList.toggle('active', isActive);
                filterBtn.setAttribute('aria-pressed', String(isActive));
            });
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            applyOwnerMenuFilters();
        });
    });
}

function updateOwnerMenuCategoryCounts() {
    const counts = { all: allMenuItemsArr.length, food: 0, drink: 0, salad: 0, snack: 0, dessert: 0, other: 0 };
    allMenuItemsArr.forEach(item => {
        counts[normalizeOwnerMenuCategory(item.category)] += 1;
    });

    Object.entries(counts).forEach(([category, count]) => {
        const countEl = document.querySelector(`[data-menu-count="${category}"]`);
        if (countEl) countEl.textContent = count;
    });
}

function applyOwnerMenuFilters() {
    const filtered = allMenuItemsArr.filter(item => {
        const matchesCategory = activeOwnerMenuCategory === 'all'
            || normalizeOwnerMenuCategory(item.category) === activeOwnerMenuCategory;
        const matchesSearch = !activeOwnerMenuSearch
            || String(item.name || '').toLowerCase().includes(activeOwnerMenuSearch)
            || String(item.description || '').toLowerCase().includes(activeOwnerMenuSearch);
        return matchesCategory && matchesSearch;
    });

    const summary = document.getElementById('owner-menu-result-summary');
    if (summary) {
        summary.textContent = filtered.length === allMenuItemsArr.length
            ? `${filtered.length} item${filtered.length === 1 ? '' : 's'}`
            : `${filtered.length} of ${allMenuItemsArr.length} items`;
    }

    displayMenuItems(filtered);
}

function clearOwnerMenuFilters() {
    activeOwnerMenuCategory = 'all';
    activeOwnerMenuSearch = '';

    const searchInput = document.getElementById('menu-search-owner');
    if (searchInput) searchInput.value = '';

    document.querySelectorAll('.owner-menu-filter-btn').forEach(btn => {
        const isActive = btn.dataset.category === 'all';
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));
    });
    document.querySelector('.owner-menu-filter-bar')?.scrollTo({ left: 0, behavior: 'smooth' });
    applyOwnerMenuFilters();
}

function displayMenuItems(items) {
    const menuList = document.getElementById('menu-list');

    if (!items || items.length === 0) {
        const hasFilters = activeOwnerMenuCategory !== 'all' || Boolean(activeOwnerMenuSearch);
        menuList.innerHTML = allMenuItemsArr.length === 0
            ? `<div class="owner-menu-empty"><span class="owner-menu-empty-icon">🍽️</span><strong>No menu items yet</strong><span>Add your first item to start building the menu.</span></div>`
            : `<div class="owner-menu-empty"><span class="owner-menu-empty-icon">🔎</span><strong>No matching menu items</strong><span>Try another category or search term.</span>${hasFilters ? '<button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="clearOwnerMenuFilters()">Clear filters</button>' : ''}</div>`;
        return;
    }

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
            avatar_path,
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
    await hydrateProfileAvatars(allCustomersArr);

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
        { bg: '#163a63', light: '#f1f5f9' },
        { bg: '#1d4ed8', light: '#eff6ff' },
        { bg: '#047857', light: '#ecfdf5' },
        { bg: '#0e7490', light: '#ecfeff' },
        { bg: '#1e40af', light: '#dbeafe' }
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
                            ${s.avatar_url
                                ? `<img src="${escapeHtml(s.avatar_url)}" alt="${escapeHtml(s.name || 'Customer')} profile photo" loading="lazy">`
                                : escapeHtml(initials)}
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
    const fileName = `${ownerShop.id}/menu_${itemId}_${Date.now()}.${ext}`;

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
        .insert([{ shop_id: ownerShop.id, name, description, price, is_available: isAvailable, category }])
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
                .eq('id', insertedItem.id)
                .eq('shop_id', ownerShop.id);
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
        .eq('id', itemId)
        .eq('shop_id', ownerShop.id);

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
        .eq('id', itemId)
        .eq('shop_id', ownerShop.id);

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
        .eq('id', id)
        .eq('shop_id', ownerShop.id);

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
