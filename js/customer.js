// ============================================================
// customer.js  --  Order2Me Customer Page
// ============================================================
// Handles:
//   1. Loading menu from Supabase
//   2. Cart management (add / remove / quantity)
//   3. Checkout: delivery note (required) + payment
//   4. Payment: KBZPay / WavePay + screenshot upload
//   5. Creating order + order_items + payment record in Supabase
//   6. Success feedback
// ============================================================

// ── Owner payment number — fetched from DB at runtime ────────
let ownerPhoneNumber = null; // loaded in initCustomerPage()
const NOTIFICATION_PREF_KEY = 'order2me-notifications-enabled';
let customerRealtimeChannel = null;
let customerShopRefreshTimer = null;
let customerOrderPollTimer = null;
let customerOrderPollBusy = false;
let customerOrderSnapshot = new Map();
const CUSTOMER_ORDER_POLL_INTERVAL_MS = 8000;

function isNotificationPreferenceEnabled() {
    return localStorage.getItem(NOTIFICATION_PREF_KEY) === 'true';
}

function syncNotificationSettingUI() {
    const checkbox = document.getElementById('notification-toggle');
    const statusEl = document.getElementById('notification-setting-status');
    const enableButton = document.getElementById('customer-enable-notifications-btn');
    if (!checkbox || !statusEl) return;

    const environment = getNotificationEnvironment();
    const permission = environment.permission || 'unsupported';
    checkbox.disabled = !environment.supported || permission === 'denied';
    checkbox.checked = environment.supported && permission === 'granted' && isNotificationPreferenceEnabled();
    statusEl.textContent = getNotificationStatusMessage()
        || (checkbox.checked ? 'Notifications are enabled.' : 'Turn this on to receive order status alerts.');

    if (enableButton) {
        enableButton.textContent = !environment.supported
            ? 'View setup instructions'
            : permission === 'denied'
                ? 'How to unblock notifications'
                : checkbox.checked
                    ? 'Send test notification'
                    : 'Enable notifications';
    }

    if (environment.supported && permission !== 'denied') {
        hideNotificationPermissionHelp('customer-notification-help');
    }
}

async function toggleNotificationPreference() {
    const checkbox = document.getElementById('notification-toggle');
    await setCustomerNotificationPreference(Boolean(checkbox?.checked));
}

async function enableCustomerNotifications() {
    const environment = getNotificationEnvironment();
    if (!environment.supported || environment.permission === 'denied') {
        showNotificationPermissionHelp('customer-notification-help');
        syncNotificationSettingUI();
        return;
    }

    if (environment.permission === 'granted' && isNotificationPreferenceEnabled()) {
        playNotificationSound('success');
        const shown = await maybeBrowserNotification(
            'Order2Me customer test',
            'Customer notifications are working correctly.',
            { tag: `order2me-customer-test-${Date.now()}`, url: 'customer.html#orders' }
        );
        document.getElementById('notification-setting-status').textContent = shown
            ? 'Test notification sent successfully.'
            : 'The test could not be displayed. Check your device notification settings.';
        return;
    }

    await setCustomerNotificationPreference(true);
}

async function setCustomerNotificationPreference(enable) {
    const checkbox = document.getElementById('notification-toggle');
    const statusEl = document.getElementById('notification-setting-status');
    if (!checkbox || !statusEl) return;

    const environment = getNotificationEnvironment();
    if (!environment.supported) {
        checkbox.checked = false;
        localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
        syncNotificationSettingUI();
        showNotificationPermissionHelp('customer-notification-help');
        showToast(getNotificationStatusMessage(), 'warning');
        return;
    }

    if (enable && environment.permission === 'denied') {
        checkbox.checked = false;
        localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
        syncNotificationSettingUI();
        showNotificationPermissionHelp('customer-notification-help');
        showToast('Notifications must be allowed in the device settings first.', 'warning');
        return;
    }

    if (enable) {
        statusEl.textContent = 'Requesting browser permission…';
        let permission;
        try {
            // This function is reached directly from a click/change event.
            permission = await Notification.requestPermission();
        } catch (error) {
            console.error('Notification permission request failed:', error);
            permission = 'default';
        }

        if (permission === 'granted') {
            localStorage.setItem(NOTIFICATION_PREF_KEY, 'true');
            checkbox.checked = true;
            syncNotificationSettingUI();
            showToast('Notifications enabled.', 'success');
            playNotificationSound('success');
            await maybeBrowserNotification(
                'Order2Me notifications enabled',
                'You will now receive live order status updates.',
                { tag: 'order2me-notification-test', url: 'customer.html#orders' }
            );
        } else {
            checkbox.checked = false;
            localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
            syncNotificationSettingUI();
            if (permission === 'denied') showNotificationPermissionHelp('customer-notification-help');
            statusEl.textContent = permission === 'denied'
                ? 'Notifications were blocked. Follow the instructions below to allow them.'
                : 'Permission was not granted. Tap Enable notifications to try again.';
            showToast('Notification permission was not enabled.', 'warning');
        }
        return;
    }

    localStorage.setItem(NOTIFICATION_PREF_KEY, 'false');
    checkbox.checked = false;
    syncNotificationSettingUI();
    showToast('Notifications disabled.', 'info');
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
        tag: options.tag || 'order2me-order-update',
        renotify: true,
        data: {
            url: options.url || 'customer.html',
            orderId: options.orderId || null
        }
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
            <div class="toast-body text-white">${escapeHtml(message)}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    container.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay: 3200 });
    bsToast.show();
    toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

// ── State ────────────────────────────────────────────────────
let currentCustomerProfile = null;
let cart                  = [];
let selectedPaymentMethod = null; // 'KBZPay' | 'WavePay'
let allMenuItems          = [];   // full list for client-side category filter
let activeCategory        = 'all';
let approvedShops         = [];
let activeShop            = null;
let activeShopId          = null;
const ACTIVE_SHOP_KEY     = 'order2me-active-shop-id';

function syncSelectedShopAvailabilityUI() {
    const availability = getShopOrderAvailability(activeShop);
    const card = document.getElementById('selected-shop-availability');
    const icon = document.getElementById('selected-shop-availability-icon');
    const badge = document.getElementById('selected-shop-availability-badge');
    const title = document.getElementById('selected-shop-availability-title');
    const message = document.getElementById('selected-shop-availability-message');
    const meta = document.getElementById('selected-shop-availability-meta');

    if (card) {
        card.classList.remove(
            'shop-availability-card--loading',
            'shop-availability-card--open',
            'shop-availability-card--closed',
            'shop-availability-card--paused'
        );
        card.classList.add(availability.canOrder
            ? 'shop-availability-card--open'
            : availability.state === 'paused'
                ? 'shop-availability-card--paused'
                : 'shop-availability-card--closed');
    }
    if (icon) icon.textContent = availability.canOrder ? '✓' : availability.state === 'paused' ? 'Ⅱ' : '×';
    if (badge) badge.textContent = availability.label;
    if (title) title.textContent = activeShop?.name || 'Shop availability';
    if (message) message.textContent = availability.message;
    if (meta) meta.textContent = `${availability.hoursText} · Est. ${availability.preparationMinutes} min`;

    document.querySelectorAll('.menu-add-btn').forEach(button => {
        button.disabled = !availability.canOrder;
        button.textContent = availability.canOrder ? '+ Add' : 'Shop closed';
    });
    updateCartCount();
}

async function refreshSelectedShopAvailability() {
    if (!activeShopId) {
        syncSelectedShopAvailabilityUI();
        return { verified: true, availability: getShopOrderAvailability(null) };
    }

    const { data, error } = await supabaseClient.rpc('get_approved_shops_with_owner');
    if (error) {
        console.error('Unable to verify shop availability:', error);
        return { verified: false, availability: getShopOrderAvailability(activeShop) };
    }

    const freshShop = (data || []).find(shop => Number(shop.id) === Number(activeShopId));
    if (!freshShop) {
        activeShop = { ...activeShop, status: 'unavailable', is_accepting_orders_now: false };
        syncSelectedShopAvailabilityUI();
        return { verified: true, availability: getShopOrderAvailability(activeShop) };
    }

    const existingOwner = activeShop?.users || {};
    activeShop = {
        ...activeShop,
        ...freshShop,
        users: {
            ...existingOwner,
            id: freshShop.owner_id,
            name: freshShop.owner_name,
            avatar_path: freshShop.owner_avatar_path
        }
    };
    approvedShops = approvedShops.map(shop => Number(shop.id) === Number(activeShopId) ? activeShop : shop);
    syncSelectedOwnerProfileUI();
    syncSelectedShopAvailabilityUI();
    renderShopPicker();
    return { verified: true, availability: getShopOrderAvailability(activeShop) };
}

// ── Date helpers ─────────────────────────────────────────────
function getTodayBounds() {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
}

function goToHistory() {
    window.location.href = 'history.html';
}

function syncSelectedOwnerProfileUI() {
    const owner = activeShop?.users || null;
    const hasShop = Boolean(activeShop);
    const ownerName = owner?.name || (hasShop ? 'Shop owner' : 'Choose a shop');
    const shopName = activeShop?.name || 'No shop selected';
    const phone = String(activeShop?.phone_number || '').trim();
    const availability = getShopOrderAvailability(activeShop);

    const sidebarButton = document.getElementById('selected-owner-profile-button');
    if (sidebarButton) sidebarButton.disabled = !hasShop;

    const sidebarName = document.getElementById('selected-owner-sidebar-name');
    const sidebarShop = document.getElementById('selected-owner-sidebar-shop');
    if (sidebarName) sidebarName.textContent = ownerName;
    if (sidebarShop) sidebarShop.textContent = shopName;

    const sidebarAvatar = document.getElementById('selected-owner-sidebar-avatar');
    const modalAvatar = document.getElementById('selected-owner-profile-avatar');
    if (sidebarAvatar) renderProfileAvatarElement(sidebarAvatar, owner || { name: ownerName }, owner?.avatar_url);
    if (modalAvatar) renderProfileAvatarElement(modalAvatar, owner || { name: ownerName }, owner?.avatar_url);

    const fields = {
        'selected-owner-profile-name': ownerName,
        'selected-owner-profile-shop': hasShop ? `${shopName} · Shop owner` : 'Choose a shop to view its owner',
        'selected-owner-shop-name': shopName,
        'selected-owner-contact': phone || 'Not provided',
        'selected-owner-opening-hours': availability.hoursText,
        'selected-owner-preparation-time': `${availability.preparationMinutes} minutes`,
        'selected-owner-address': activeShop?.address || 'Not provided',
        'selected-owner-description': activeShop?.description || 'No description provided.'
    };
    Object.entries(fields).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });

    const callButton = document.getElementById('selected-owner-call-button');
    if (callButton) {
        const callablePhone = phone.replace(/[^\d+]/g, '');
        callButton.classList.toggle('d-none', !callablePhone);
        callButton.href = callablePhone ? `tel:${callablePhone}` : '#';
        callButton.textContent = callablePhone ? `Call ${phone}` : 'Call shop owner';
    }
}

function openSelectedOwnerProfile() {
    if (!activeShop) {
        showToast('Choose a shop first to view its owner profile.', 'info');
        return;
    }

    syncSelectedOwnerProfileUI();
    if (typeof closeSidebar === 'function') closeSidebar();
    const modalElement = document.getElementById('shopOwnerProfileModal');
    if (modalElement) bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

// -- 1. MENU --------------------------------------------------

async function loadApprovedShops() {
    const list = document.getElementById('shop-picker-list');
    const { data, error } = await supabaseClient.rpc('get_approved_shops_with_owner');

    if (error) {
        console.error('Error loading shops:', error);
        if (list) list.innerHTML = '<div class="shop-picker-empty">Unable to load shops. Please refresh.</div>';
        return;
    }

    approvedShops = (data || []).map(shop => ({
        ...shop,
        users: {
            id: shop.owner_id,
            name: shop.owner_name,
            avatar_path: shop.owner_avatar_path
        }
    }));
    await hydrateProfileAvatars(approvedShops.map(shop => shop.users).filter(Boolean));
    renderShopPicker();

    if (!approvedShops.length) {
        activeShop = null;
        activeShopId = null;
        syncSelectedOwnerProfileUI();
        syncSelectedShopAvailabilityUI();
        document.getElementById('menu-container').innerHTML = '<div class="shop-picker-empty">No approved shops are available yet.</div>';
        return;
    }

    const savedId = Number(localStorage.getItem(ACTIVE_SHOP_KEY));
    const initial = approvedShops.find(shop => shop.id === savedId) || approvedShops[0];
    selectShop(initial.id, true);
}

function renderShopPicker() {
    const list = document.getElementById('shop-picker-list');
    if (!list) return;
    if (!approvedShops.length) {
        list.innerHTML = '<div class="shop-picker-empty">No approved shops yet.</div>';
        return;
    }
    list.innerHTML = approvedShops.map(shop => `
        <button type="button" class="shop-choice ${shop.id === activeShopId ? 'active' : ''}"
            role="option" aria-selected="${shop.id === activeShopId}"
            onclick="selectShop(${shop.id})">
            <span class="shop-choice-icon">${shop.users?.avatar_url
                ? `<img src="${escapeHtml(shop.users.avatar_url)}" alt="${escapeHtml(shop.users.name || 'Shop owner')} profile photo">`
                : shop.logo_url
                ? `<img src="${escapeHtml(shop.logo_url)}" alt="${escapeHtml(shop.name)} logo">`
                : '🏪'}</span>
            <span class="shop-choice-copy">
                <strong>${escapeHtml(shop.name)}</strong>
                <small>${escapeHtml(shop.address || shop.description || 'Open for orders')}</small>
            </span>
            <span class="shop-choice-check">✓</span>
        </button>`).join('');
}

function selectShop(shopId, initial = false) {
    const nextShop = approvedShops.find(shop => shop.id === Number(shopId));
    if (!nextShop) return;
    if (nextShop.id === activeShopId) {
        activeShop = nextShop;
        document.getElementById('active-shop-label').textContent = nextShop.name;
        renderShopPicker();
        fetchOwnerPhone();
        syncSelectedOwnerProfileUI();
        syncSelectedShopAvailabilityUI();
        if (!initial && typeof closeSidebar === 'function') closeSidebar();
        return;
    }

    if (!initial && cart.length > 0) {
        const confirmed = window.confirm('Changing shops will clear your current cart. Continue?');
        if (!confirmed) return;
        cart = [];
        updateCartCount();
    }

    activeShop = nextShop;
    activeShopId = nextShop.id;
    activeCategory = 'all';
    localStorage.setItem(ACTIVE_SHOP_KEY, String(activeShopId));
    document.getElementById('active-shop-label').textContent = nextShop.name;
    document.getElementById('menu-search').value = '';
    renderShopPicker();
    fetchOwnerPhone();
    syncSelectedOwnerProfileUI();
    syncSelectedShopAvailabilityUI();
    loadMenu();
    if (!initial && typeof closeSidebar === 'function') closeSidebar();
}

async function loadMenu() {
    const container = document.getElementById('menu-container');
    allMenuItems = [];
    activeCategory = 'all';
    setupCategoryFilters();

    if (!activeShopId) {
        container.innerHTML = "<p class='text-muted'>Choose a shop to view its menu.</p>";
        return;
    }

    container.innerHTML = "<p class='text-muted'>Loading menu...</p>";
    const { data, error } = await supabaseClient
        .from('menu_items')
        .select('*')
        .eq('shop_id', activeShopId)
        .eq('is_available', true)
        .order('name', { ascending: true });

    if (error) {
        console.error('Error fetching menu:', error);
        container.innerHTML = "<p class='text-danger'>Error loading menu. Please refresh.</p>";
        return;
    }

    allMenuItems = Array.isArray(data) ? data : [];
    setupCategoryFilters();

    if (allMenuItems.length === 0) {
        container.innerHTML = "<p class='text-muted'>No items available today.</p>";
        return;
    }

    displayMenuItems(allMenuItems);
}

function normalizeCustomerMenuCategory(category) {
    const normalized = String(category || 'food').trim().toLowerCase();
    return ['food', 'drink', 'salad', 'snack', 'dessert', 'other'].includes(normalized)
        ? normalized
        : 'other';
}

function filterMenu(query) {
    const q = query.trim().toLowerCase();

    // Start from category-filtered list
    let base = activeCategory === 'all'
        ? allMenuItems
        : allMenuItems.filter(item => normalizeCustomerMenuCategory(item.category) === activeCategory);

    if (!q) {
        displayMenuItems(base);
        return;
    }

    const filtered = base.filter(item =>
        item.name.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q)
    );

    const container = document.getElementById('menu-container');
    if (filtered.length === 0) {
        container.innerHTML = `<p class='text-muted'>No items match "${escapeHtml(query)}".</p>`;
        return;
    }
    displayMenuItems(filtered);
}

function displayMenuItems(items) {
    const container = document.getElementById('menu-container');
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = "<p class='text-muted'>No items in this category.</p>";
        return;
    }

    const CATEGORY_META = {
        food:    { icon: '🍽️', label: 'Food',    css: 'cat-food'    },
        drink:   { icon: '🥤',       label: 'Drink',   css: 'cat-drink'   },
        salad:   { icon: '🥗',       label: 'Salad',   css: 'cat-salad'   },
        snack:   { icon: '🍿',       label: 'Snack',   css: 'cat-snack'   },
        dessert: { icon: '🍰',       label: 'Dessert', css: 'cat-dessert' },
        other:   { icon: '📦',       label: 'Other',   css: 'cat-other'   }
    };

    const availability = getShopOrderAvailability(activeShop);

    items.forEach(food => {
        const card = document.createElement('div');
        card.className = 'col-6 col-md-4 mb-3 mb-md-4';

        const catMeta = CATEGORY_META[normalizeCustomerMenuCategory(food.category)];

        // Small floating pill overlaid on the image corner
        const catPill = `<span class="menu-cat-pill ${catMeta.css}"><span class="menu-cat-pill-icon">${catMeta.icon}</span><span class="menu-cat-pill-label">${catMeta.label}</span></span>`;

        const imgWrap = food.image_url
            ? `<div class="menu-img-wrap"><img src="${food.image_url}" alt="${escapeHtml(food.name)}" class="menu-card-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="menu-card-img menu-img-placeholder" style="display:none;">🍽️</div>${catPill}</div>`
            : `<div class="menu-img-wrap"><div class="menu-card-img menu-img-placeholder">🍽️</div>${catPill}</div>`;

        card.innerHTML = `
            <div class="card shadow-sm h-100 menu-card">
                ${imgWrap}
                <div class="card-body d-flex flex-column menu-card-body">
                    <h6 class="card-title menu-card-title">${escapeHtml(food.name)}</h6>
                    <p class="card-text text-muted small flex-grow-1 menu-card-desc">
                        ${escapeHtml(food.description || 'Delicious item')}
                    </p>
                    <div class="fw-bold text-primary menu-card-price mb-2">${food.price.toLocaleString()} MMK</div>
                    <button
                        class="btn btn-primary btn-sm w-100 menu-add-btn"
                        onclick="addToCart(${food.id}, '${escapeHtml(food.name)}', ${food.price})"
                        ${availability.canOrder ? '' : 'disabled'}
                    >
                        ${availability.canOrder ? '+ Add' : 'Shop closed'}
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// ── Category filter wiring ─────────────────────────────────

const CAT_ACTIVE_CLASSES = {
    all:     ['btn-primary'],
    food:    ['btn-primary'],
    drink:   ['btn-info'],
    salad:   ['btn-success'],
    snack:   ['btn-warning'],
    dessert: ['btn-danger'],
    other:   ['btn-secondary']
};
const CAT_OUTLINE_CLASSES = {
    all:     ['btn-outline-primary'],
    food:    ['btn-outline-primary'],
    drink:   ['btn-outline-info'],
    salad:   ['btn-outline-success'],
    snack:   ['btn-outline-warning'],
    dessert: ['btn-outline-danger'],
    other:   ['btn-outline-secondary']
};

function setupCategoryFilters() {
    const counts = { food: 0, drink: 0, salad: 0, snack: 0, dessert: 0, other: 0 };
    allMenuItems.forEach(item => {
        counts[normalizeCustomerMenuCategory(item.category)] += 1;
    });

    if (activeCategory !== 'all' && !counts[activeCategory]) {
        activeCategory = 'all';
    }

    const filterBar = document.getElementById('category-filter-bar');
    if (filterBar) filterBar.hidden = allMenuItems.length === 0;

    document.querySelectorAll('.category-filter-btn').forEach(btn => {
        const category = btn.dataset.category || 'all';
        const count = category === 'all' ? allMenuItems.length : (counts[category] || 0);
        btn.hidden = count === 0;

        const activeClasses = CAT_ACTIVE_CLASSES[category] || [];
        const outlineClasses = CAT_OUTLINE_CLASSES[category] || ['btn-outline-secondary'];
        const isActive = category === activeCategory;
        btn.classList.remove('active', ...activeClasses, ...outlineClasses);
        btn.classList.add(...(isActive ? activeClasses : outlineClasses));
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', String(isActive));

        btn.onclick = () => {
            const cat = btn.dataset.category;
            activeCategory = cat;
            setupCategoryFilters();
            const filtered = cat === 'all'
                ? allMenuItems
                : allMenuItems.filter(item => normalizeCustomerMenuCategory(item.category) === cat);
            displayMenuItems(filtered);
        };
    });
}

// -- Customer Orders -------------------------------------------

async function loadCustomerOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    container.innerHTML = '<p class="text-muted">Loading today\'s orders...</p>';

    if (!currentCustomerProfile) return;

    // Only fetch orders placed TODAY (local time)
    const { start, end } = getTodayBounds();
    const startISO = start.toISOString();
    const endISO   = end.toISOString();

    const { data, error } = await supabaseClient
        .from('orders')
        .select(`
            id,
            shop_id,
            status,
            total_amount,
            delivery_note,
            created_at,
            shops (name),
            order_items (
                quantity,
                price,
                menu_items (name)
            ),
            payments (
                payment_method,
                screenshot_url
            )
        `)
        .eq('customer_id', currentCustomerProfile.id)
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading customer orders:', error);
        container.innerHTML = `<p class="text-danger">Error loading your orders: ${escapeHtml(error.message)}</p>`;
        return;
    }

    const orders = data || [];
    if (customerOrderSnapshot.size === 0) {
        customerOrderSnapshot = new Map(orders.map(order => [Number(order.id), order.status]));
    }
    displayTodayOrders(orders);
}

// Render today's orders as animated progress trackers
function displayTodayOrders(orders) {
    const container = document.getElementById('orders-container');
    if (!container) return;

    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div class="today-empty-state">
                <div class="empty-emoji">🍽️</div>
                <h5>No active orders today</h5>
                <p>Place an order from the menu and it will appear here with a live progress tracker.</p>
                <button class="btn btn-history btn-sm mt-2" onclick="goToHistory()">
                    📜 View Past Orders
                </button>
            </div>`;
        return;
    }

    // Status order for progress steps
    const STEPS = [
        { key: 'pending',          icon: '⏳', label: 'Pending'  },
        { key: 'preparing',        icon: '🍳', label: 'Preparing'},
        { key: 'ready',            icon: '✅', label: 'Ready'   },
        { key: 'out_for_delivery', icon: '🛵', label: 'Sent'    },
        { key: 'delivered',        icon: '📦', label: 'Received'}
    ];
    const STATUS_ORDER = { pending: 0, preparing: 1, ready: 2, out_for_delivery: 3, delivered: 4, cancelled: -1 };
    const STATUS_LABELS = {
        pending: 'Pending',
        preparing: 'Preparing',
        ready: 'Ready',
        out_for_delivery: 'Sent',
        delivered: 'Received',
        cancelled: 'Cancelled'
    };
    const STATUS_CLASSES = {
        pending: 'order-status--pending',
        preparing: 'order-status--preparing',
        ready: 'order-status--ready',
        out_for_delivery: 'order-status--sent',
        delivered: 'order-status--received',
        cancelled: 'order-status--cancelled'
    };

    container.innerHTML = orders.map(order => {
        const isCancelled = order.status === 'cancelled';
        const currentStep = STATUS_ORDER[order.status] ?? 0;

        // Build step dots + connecting lines
        let stepsHtml = '';
        STEPS.forEach((step, idx) => {
            const stepIdx = idx;
            let dotClass = '';
            let labelClass = '';

            if (isCancelled) {
                dotClass   = stepIdx === 0 ? 'cancelled' : '';
                labelClass = stepIdx === 0 ? 'cancelled-label' : '';
            } else if (stepIdx < currentStep) {
                dotClass   = 'done';
                labelClass = 'done-label';
            } else if (stepIdx === currentStep) {
                dotClass   = 'active';
                labelClass = 'active-label';
            }

            const lineClass = (!isCancelled && stepIdx < currentStep) ? 'line-done' : '';

            stepsHtml += `<div class="order-step">
                <div class="order-step-dot ${dotClass}">${dotClass === 'done' ? '✓' : step.icon}</div>
                <div class="order-step-label ${labelClass}">${isCancelled && stepIdx === 0 ? 'Cancelled' : step.label}</div>
            </div>`;

            if (idx < STEPS.length - 1) {
                stepsHtml += `<div class="order-step-line ${lineClass}"></div>`;
            }
        });

        // Items summary
        const itemsText = (order.order_items || []).map(oi => {
            const name = oi.menu_items ? oi.menu_items.name : 'Item';
            return `${escapeHtml(name)} ×${oi.quantity}`;
        }).join(', ');

        // Payment method
        const payment = order.payments
            ? (Array.isArray(order.payments) ? order.payments[0] : order.payments)
            : null;
        const payBadge = payment
            ? `<span class="badge bg-secondary ms-1">${escapeHtml(payment.payment_method)}</span>`
            : '';

        const noteHtml = order.delivery_note
            ? `<div class="order-tracker-note">📍 ${escapeHtml(order.delivery_note)}</div>`
            : '';

        const time = new Date(order.created_at).toLocaleString('en-GB', {
            hour: '2-digit', minute: '2-digit'
        });

        const statusLabel = `<span class="order-status ${STATUS_CLASSES[order.status] || 'order-status--unknown'}">${STATUS_LABELS[order.status] || escapeHtml(order.status)}</span>`;

        const receiptActionHtml = order.status === 'out_for_delivery'
            ? `<div class="receipt-confirm-panel" role="status">
                   <div>
                       <strong>🛵 Your order has been sent</strong>
                       <span>Confirm only after the order reaches you.</span>
                   </div>
                   <button type="button" class="btn btn-success btn-sm"
                       id="confirm-received-${order.id}" onclick="confirmOrderReceived(${order.id})">
                       ✓ Confirm received
                   </button>
               </div>`
            : order.status === 'delivered'
                ? `<div class="receipt-confirmed-note">✓ You confirmed that this order was received.</div>`
                : '';

        return `
        <div class="order-tracker-card">
            <div class="order-tracker-header">
                <div>
                    <div class="order-tracker-id">📋 Order #${order.id}</div>
                    <div class="order-tracker-time">🏪 <button type="button" class="order-contact-link"
                        onclick="openOrderShopOwnerProfile(${Number(order.shop_id)})">${escapeHtml(order.shops?.name || 'Shop')}</button> · ⏰ ${time}</div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    ${statusLabel}
                    ${payBadge}
                </div>
            </div>
            <div class="order-tracker-body">
                <!-- Progress tracker -->
                <div class="order-steps">${stepsHtml}</div>
                <!-- Items -->
                <div class="order-tracker-items">${itemsText || '—'}</div>
                <div class="order-tracker-total">💰 ${Number(order.total_amount).toLocaleString()} MMK</div>
                ${noteHtml}
                ${receiptActionHtml}
            </div>
        </div>`;
    }).join('');
}

// Legacy alias kept for compatibility (called on order success refresh)
function displayCustomerOrders(orders) {
    displayTodayOrders(orders);
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// -- 2. CART --------------------------------------------------

function addToCart(itemId, itemName, price) {
    if (!activeShopId) {
        showToast('Please choose a shop first.', 'warning');
        return;
    }
    const availability = getShopOrderAvailability(activeShop);
    if (!availability.canOrder) {
        showToast(availability.message, 'warning');
        syncSelectedShopAvailabilityUI();
        return;
    }
    const existing = cart.find(i => i.id === itemId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ id: itemId, name: itemName, price: price, quantity: 1, shopId: activeShopId });
    }
    updateCartCount();
}

function updateCartCount() {
    const count = cart.reduce((s, i) => s + i.quantity, 0);

    // Navbar counter (legacy)
    const navEl = document.getElementById('cart-count');
    if (navEl) navEl.textContent = count;

    // FAB badge
    const fab   = document.getElementById('cart-fab');
    const badge = document.getElementById('cart-fab-badge');
    if (badge) {
        badge.textContent = count;
        if (count > 0) {
            badge.classList.remove('d-none');
            fab && fab.classList.add('has-items');
        } else {
            badge.classList.add('d-none');
            fab && fab.classList.remove('has-items');
        }
    }

    // Drawer header count badge
    const dcBadge = document.getElementById('drawer-count-badge');
    if (dcBadge) dcBadge.textContent = count === 1 ? '1 item' : `${count} items`;

    // Drawer checkout button
    const chkBtn = document.getElementById('drawer-checkout-btn');
    const cartCheckoutBtn = document.getElementById('cart-checkout-btn');
    const availability = getShopOrderAvailability(activeShop);
    [chkBtn, cartCheckoutBtn].forEach(button => {
        if (!button) return;
        button.disabled = count === 0 || !availability.canOrder;
        button.title = availability.canOrder ? '' : availability.message;
    });

    // If drawer is open, refresh its contents live
    if (document.getElementById('cart-drawer')?.classList.contains('open')) {
        renderDrawer();
    }
}

function showCart() {
    renderCart();
    new bootstrap.Modal(document.getElementById('cartModal')).show();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    const totalEl   = document.getElementById('cart-total');
    if (!container || !totalEl) return;

    container.innerHTML = '';

    if (cart.length === 0) {
        container.innerHTML = '<p class="text-muted">Your cart is empty.</p>';
        totalEl.textContent = '0';
        return;
    }

    let total = 0;
    cart.forEach(item => {
        total += item.price * item.quantity;
        const row = document.createElement('div');
        row.className = 'd-flex align-items-center mb-3';
        row.innerHTML = `
            <div class="me-auto">
                <strong>${item.name}</strong>
                <div class="text-muted small">${item.price} MMK each</div>
            </div>
            <div class="mx-2">
                <button class="btn btn-sm btn-outline-secondary" onclick="changeQuantity(${item.id}, -1)">-</button>
                <span class="mx-2">${item.quantity}</span>
                <button class="btn btn-sm btn-outline-secondary" onclick="changeQuantity(${item.id}, 1)">+</button>
            </div>
            <div class="ms-3">
                <button class="btn btn-sm btn-danger" onclick="removeFromCart(${item.id})">Remove</button>
            </div>
        `;
        container.appendChild(row);
    });

    totalEl.textContent = total;
}

function removeFromCart(itemId) {
    cart = cart.filter(i => i.id !== itemId);
    updateCartCount();
    renderCart();
}

function changeQuantity(itemId, delta) {
    const item = cart.find(i => i.id === itemId);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
        removeFromCart(itemId);
        return;
    }
    updateCartCount();
    renderCart();
}

// -- Side-Cart Drawer -----------------------------------------

let _drawerOpen = false;

function toggleCartDrawer() {
    _drawerOpen ? closeCartDrawer() : openCartDrawer();
}

function openCartDrawer() {
    _drawerOpen = true;
    renderDrawer();
    document.getElementById('cart-drawer').classList.add('open');
    document.getElementById('cart-drawer-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden'; // prevent background scroll
}

function closeCartDrawer() {
    _drawerOpen = false;
    document.getElementById('cart-drawer').classList.remove('open');
    document.getElementById('cart-drawer-backdrop').classList.remove('open');
    document.body.style.overflow = '';
}

function renderDrawer() {
    const body   = document.getElementById('cart-drawer-body');
    const totalEl = document.getElementById('drawer-total');
    if (!body) return;

    if (cart.length === 0) {
        body.innerHTML = `
            <div id="drawer-empty">
                <div class="empty-icon">🛍️</div>
                <div style="font-weight:600;font-size:.95rem;color:#475569">Your cart is empty</div>
                <div style="font-size:.82rem">Add items from the menu to get started</div>
            </div>`;
        if (totalEl) totalEl.textContent = '0';
        return;
    }

    let total = 0;
    const rows = cart.map((item, idx) => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        return `
            <div class="drawer-item" style="animation-delay:${idx * 0.04}s">
                <div class="drawer-item-info">
                    <div class="drawer-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                    <div class="drawer-item-price">${item.price.toLocaleString()} MMK each</div>
                </div>
                <div class="drawer-qty-ctrl">
                    <button class="drawer-qty-btn" onclick="drawerChangeQty(${item.id}, -1)" aria-label="Decrease">−</button>
                    <span class="drawer-qty-num">${item.quantity}</span>
                    <button class="drawer-qty-btn" onclick="drawerChangeQty(${item.id}, 1)" aria-label="Increase">+</button>
                </div>
                <div class="drawer-item-subtotal">${subtotal.toLocaleString()} MMK</div>
                <button class="drawer-remove-btn" onclick="drawerRemove(${item.id})" aria-label="Remove item" title="Remove">
                    ✕
                </button>
            </div>`;
    }).join('');

    body.innerHTML = rows;
    if (totalEl) totalEl.textContent = total.toLocaleString();
}

function drawerChangeQty(itemId, delta) {
    changeQuantity(itemId, delta); // reuses existing logic, updateCartCount rerenders drawer
}

function drawerRemove(itemId) {
    removeFromCart(itemId); // reuses existing logic
}

function drawerCheckout() {
    if (cart.length === 0) return;
    closeCartDrawer();
    // Small delay so drawer closes before checkout modal opens
    setTimeout(() => openCheckout(), 320);
}

// Close drawer on ESC key
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _drawerOpen) closeCartDrawer();
});

// -- 3. CHECKOUT ----------------------------------------------

async function openCheckout() {
    if (cart.length === 0) {
        showToast('Your cart is empty.', 'warning');
        return;
    }

    // Populate checkout summary
    const summaryEl = document.getElementById('checkout-summary');
    const totalEl   = document.getElementById('checkout-total');
    let total = 0;
    let summaryHtml = '';

    cart.forEach(item => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        summaryHtml += `
            <div class="d-flex justify-content-between small">
                <span>${item.name} x ${item.quantity}</span>
                <span>${subtotal} MMK</span>
            </div>
        `;
    });

    summaryEl.innerHTML = summaryHtml;
    totalEl.textContent = total;

    // Set amounts in payment panels
    document.getElementById('kbz-amount').textContent  = total;
    document.getElementById('wave-amount').textContent = total;

    // Set owner numbers (fetched from DB in initCustomerPage)
    const displayNum = ownerPhoneNumber || '—';
    document.getElementById('kbz-display-number').textContent  = displayNum;
    document.getElementById('wave-display-number').textContent = displayNum;

    // Reset form
    document.getElementById('checkout-note').value = '';
    document.getElementById('checkout-note-error').classList.add('d-none');
    document.getElementById('checkout-payment-error').classList.add('d-none');
    document.getElementById('checkout-screenshot-error').classList.add('d-none');
    document.getElementById('checkout-error').classList.add('d-none');
    document.getElementById('payment-info-panel').classList.add('d-none');
    document.getElementById('payment-screenshot').value = '';
    document.getElementById('screenshot-preview-wrap').classList.add('d-none');

    // Reset payment method buttons
    selectedPaymentMethod = null;
    document.querySelectorAll('.payment-method-btn').forEach(button => {
        button.className = 'btn btn-outline-secondary payment-method-btn';
    });

    // Close cart, open checkout
    const cartModal = bootstrap.Modal.getInstance(document.getElementById('cartModal'));
    if (cartModal) cartModal.hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('checkoutModal')).show();
    }, 300);
}

function selectPaymentMethod(method) {
    if (!['KBZPay', 'WavePay'].includes(method)) return;
    selectedPaymentMethod = method;

    // Update button styles
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
        btn.className = 'btn btn-outline-secondary payment-method-btn';
    });

    const activeBtn = document.querySelector(`.payment-method-btn[data-method="${method}"]`);
    if (activeBtn) {
        activeBtn.className = 'btn btn-outline-secondary payment-method-btn active';
    }

    // Show/hide payment panels
    document.getElementById('kbzpay-panel').classList.add('d-none');
    document.getElementById('wavepay-panel').classList.add('d-none');

    if (method === 'KBZPay')  document.getElementById('kbzpay-panel').classList.remove('d-none');
    if (method === 'WavePay') document.getElementById('wavepay-panel').classList.remove('d-none');

    document.getElementById('payment-info-panel').classList.remove('d-none');
    document.getElementById('checkout-payment-error').classList.add('d-none');
}

// Copy owner phone number to clipboard
function copyOwnerNumber(btnEl) {
    if (!ownerPhoneNumber) {
        showToast('Phone number not available yet. Please wait a moment and try again.', 'warning');
        return;
    }
    navigator.clipboard.writeText(ownerPhoneNumber).then(() => {
        const original = btnEl.innerHTML;
        btnEl.innerHTML = '✅ Copied!';
        btnEl.disabled = true;
        setTimeout(() => {
            btnEl.innerHTML = original;
            btnEl.disabled = false;
        }, 2000);
    }).catch(() => {
        // Clipboard API not available — select text manually
        prompt('Copy this number:', ownerPhoneNumber);
    });
}

function previewScreenshot(input) {
    const preview = document.getElementById('screenshot-preview-wrap');
    const img     = document.getElementById('screenshot-preview-img');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            img.src = e.target.result;
            preview.classList.remove('d-none');
        };
        reader.readAsDataURL(input.files[0]);
        document.getElementById('checkout-screenshot-error').classList.add('d-none');
    }
}

async function submitCheckout() {
    const noteInput        = document.getElementById('checkout-note');
    const noteError        = document.getElementById('checkout-note-error');
    const paymentError     = document.getElementById('checkout-payment-error');
    const screenshotError  = document.getElementById('checkout-screenshot-error');
    const errorBanner      = document.getElementById('checkout-error');
    const btn              = document.getElementById('place-order-btn');
    const spinner          = document.getElementById('place-order-spinner');
    const screenshotInput  = document.getElementById('payment-screenshot');

    let valid = true;

    // Validate delivery note
    const deliveryNote = noteInput.value.trim();
    if (!deliveryNote) {
        noteError.classList.remove('d-none');
        noteInput.focus();
        valid = false;
    } else {
        noteError.classList.add('d-none');
    }

    // Validate payment method
    if (!['KBZPay', 'WavePay'].includes(selectedPaymentMethod)) {
        paymentError.classList.remove('d-none');
        valid = false;
    } else {
        paymentError.classList.add('d-none');
    }

    // Validate screenshot
    const screenshotFile = screenshotInput.files[0];
    if (!screenshotFile) {
        // Open the selected payment app so the customer can complete payment
        // and return with the required screenshot.
        if (['KBZPay', 'WavePay'].includes(selectedPaymentMethod)) {
            openPaymentApp(selectedPaymentMethod);
            return;
        }
        screenshotError.classList.remove('d-none');
        valid = false;
    } else {
        screenshotError.classList.add('d-none');
    }

    if (!valid) return;

    errorBanner.classList.add('d-none');
    btn.disabled = true;
    spinner.classList.remove('d-none');

    try {
        await createOrder(deliveryNote, selectedPaymentMethod, screenshotFile);
    } finally {
        btn.disabled = false;
        spinner.classList.add('d-none');
    }
}

// -- 4. CREATE ORDER IN SUPABASE ------------------------------

async function uploadPaymentScreenshot(file) {
    const authUser = await getCurrentUser();
    if (!authUser) {
        console.error('Screenshot upload error: no authenticated user session.');
        return null;
    }
    const ext      = file.name.split('.').pop();
    const fileName = `${activeShopId}/${authUser.id}/payment_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
        .from('payment-screenshots')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
        console.error('Screenshot upload error:', {
            message: uploadError.message,
            statusCode: uploadError.statusCode,
            error: uploadError.error,
            path: fileName
        });
        return null;
    }

    const { data } = supabaseClient.storage
        .from('payment-screenshots')
        .getPublicUrl(fileName);

    return {
        path: fileName,
        publicUrl: data.publicUrl || null
    };
}

async function confirmOrderReceived(orderId) {
    if (!currentCustomerProfile) return;
    if (!window.confirm(`Confirm that Order #${orderId} has reached you?`)) return;

    const button = document.getElementById(`confirm-received-${orderId}`);
    if (button) {
        button.disabled = true;
        button.textContent = 'Confirming…';
    }

    const { data, error } = await supabaseClient
        .from('orders')
        .update({ status: 'delivered' })
        .eq('id', orderId)
        .eq('customer_id', currentCustomerProfile.id)
        .eq('status', 'out_for_delivery')
        .select('id, status')
        .maybeSingle();

    if (error || !data) {
        console.error('Could not confirm order receipt:', error || 'No matching sent order');
        showToast(error?.message || 'This order can no longer be confirmed. Refresh and try again.', 'danger');
        if (button) {
            button.disabled = false;
            button.textContent = '✓ Confirm received';
        }
        return;
    }

    const shopCheck = await refreshSelectedShopAvailability();
    if (!shopCheck.verified) {
        showToast('Unable to verify the shop right now. Check your connection and try again.', 'warning');
        return;
    }
    if (!shopCheck.availability.canOrder) {
        showToast(shopCheck.availability.message, 'warning');
        return;
    }

    showToast(`Order #${orderId} marked as received. The shop has been notified.`, 'success');
    playNotificationSound('success');
    await loadCustomerOrders();
}

async function createOrder(deliveryNote, paymentMethod, screenshotFile) {
    const errorBanner = document.getElementById('checkout-error');

    if (!activeShopId || !activeShop || cart.some(item => item.shopId !== activeShopId)) {
        errorBanner.textContent = 'Your cart does not match the selected shop. Please clear it and try again.';
        errorBanner.classList.remove('d-none');
        return;
    }

    const shopCheck = await refreshSelectedShopAvailability();
    if (!shopCheck.verified) {
        errorBanner.textContent = 'Unable to verify the shop. Check your connection and try again.';
        errorBanner.classList.remove('d-none');
        return;
    }
    if (!shopCheck.availability.canOrder) {
        errorBanner.textContent = shopCheck.availability.message;
        errorBanner.classList.remove('d-none');
        return;
    }

    // Calculate total
    const totalAmount = cart.reduce((s, i) => s + i.price * i.quantity, 0);

    // Upload first and retain the storage path. Owners use a signed URL from
    // this path, so screenshots also work when the bucket is private.
    let screenshot = null;
    if (screenshotFile) {
        screenshot = await uploadPaymentScreenshot(screenshotFile);
        if (!screenshot) {
            errorBanner.textContent = 'Payment screenshot upload failed. Please retry before placing the order.';
            errorBanner.classList.remove('d-none');
            return;
        }
    }

    // Step 1: Insert order
    const { data: orderData, error: orderError } = await supabaseClient
        .from('orders')
        .insert({
            customer_id:    currentCustomerProfile.id,
            customer_name:  currentCustomerProfile.name,
            shop_id:        activeShopId,
            total_amount:  totalAmount,
            delivery_note: deliveryNote,
            status:        'pending'
        })
        .select()
        .single();

    if (orderError) {
        console.error('Error creating order:', orderError);
        const latestShopCheck = await refreshSelectedShopAvailability();
        errorBanner.textContent = latestShopCheck.verified && !latestShopCheck.availability.canOrder
            ? latestShopCheck.availability.message
            : 'Failed to place order: ' + orderError.message;
        errorBanner.classList.remove('d-none');
        return;
    }

    const orderId = orderData.id;

    // Step 2: Insert order_items
    const itemsToInsert = cart.map(i => ({
        order_id:     orderId,
        menu_item_id: i.id,
        quantity:     i.quantity,
        price:        i.price
    }));

    const { error: itemsError } = await supabaseClient
        .from('order_items')
        .insert(itemsToInsert);

    if (itemsError) {
        console.error('Error saving order items:', itemsError);
        errorBanner.textContent = 'Order created but items failed to save. Order ID: ' + orderId;
        errorBanner.classList.remove('d-none');
        return;
    }

    // Step 3: Save payment record. Retry against the legacy schema so an
    // older Supabase project can still retain the screenshot URL.
    const paymentPayload = {
        order_id: orderId,
        payment_method: paymentMethod,
        screenshot_url: screenshot?.publicUrl || null,
        screenshot_path: screenshot?.path || null
    };
    let { error: paymentError } = await supabaseClient
        .from('payments')
        .insert(paymentPayload);

    const paymentErrorText = [paymentError?.message, paymentError?.details, paymentError?.hint]
        .filter(Boolean)
        .join(' ');
    if (paymentError && (paymentError.code === '42703' || /screenshot_path/i.test(paymentErrorText))) {
        console.warn('payments.screenshot_path is unavailable; retrying payment record with screenshot_url.');
        const legacyPayload = { ...paymentPayload };
        delete legacyPayload.screenshot_path;
        ({ error: paymentError } = await supabaseClient
            .from('payments')
            .insert(legacyPayload));
    }

    if (paymentError) {
        console.error('Error saving payment proof:', {
            code: paymentError.code,
            message: paymentError.message,
            details: paymentError.details,
            hint: paymentError.hint,
            orderId
        });
        // The order already exists. Do not retry the entire checkout because
        // that would create a duplicate order.
        errorBanner.textContent = 'Order placed, but the payment screenshot could not be attached. Please contact the shop. Order ID: ' + orderId;
        errorBanner.classList.remove('d-none');
    }

    // Step 5: Success
    cart = [];
    selectedPaymentMethod = null;
    updateCartCount();

    // Close checkout modal
    const checkoutModal = bootstrap.Modal.getInstance(document.getElementById('checkoutModal'));
    if (checkoutModal) checkoutModal.hide();

    // Show success modal
    document.getElementById('success-order-id').textContent = orderId;
    document.getElementById('success-total').textContent = totalAmount;
    const paymentStatusEl = document.getElementById('success-payment-status');
    paymentStatusEl.className = paymentError
        ? 'alert alert-warning small mt-3 mb-3'
        : 'alert alert-success small mt-3 mb-3';
    paymentStatusEl.textContent = paymentError
        ? 'Your order was placed, but the screenshot was not attached. Please show it to the shop and mention this order ID.'
        : 'Payment screenshot attached successfully.';

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('successModal')).show();
        loadCustomerOrders(); // refresh orders list
    }, 300);

    console.log('Order placed successfully. Order ID:', orderId, 'Payment:', paymentMethod);
}

// ── Image Lightbox (shared with owner page) ───────────────────────

function showImageLightbox(url) {
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
    overlay.addEventListener('click', e => { if (e.target === overlay) closeImageLightbox(); });
    document.body.appendChild(overlay);
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

// ── Fetch owner phone number from DB ───────────────────────────

async function fetchOwnerPhone() {
    ownerPhoneNumber = activeShop?.phone_number || null;

    // Update the displayed numbers in the payment panels
    const displayNum = ownerPhoneNumber || '—';
    const kbzEl  = document.getElementById('kbz-display-number');
    const waveEl = document.getElementById('wave-display-number');
    if (kbzEl)  kbzEl.textContent  = displayNum;
    if (waveEl) waveEl.textContent = displayNum;
}

function setProfileAlert(el, type, message) {
    if (!el) return;
    el.className = `alert alert-${type} small d-block`;
    el.textContent = message;
}

function clearProfileAlert(el) {
    if (!el) return;
    el.className = 'alert small d-none';
    el.textContent = '';
}

function setProfileLoadingState(show) {
    const loadingEl = document.getElementById('profile-view-loading');
    const contentEl = document.getElementById('profile-view-content');
    if (loadingEl) loadingEl.classList.toggle('d-none', !show);
    if (contentEl) contentEl.classList.toggle('d-none', show);
}

async function loadCustomerProfileView() {
    const loadingEl = document.getElementById('profile-view-loading');
    const contentEl = document.getElementById('profile-view-content');
    const statusEl = document.getElementById('profile-view-status');

    if (!currentCustomerProfile) return;

    setProfileLoadingState(true);
    clearProfileAlert(statusEl);
    if (contentEl) contentEl.classList.add('d-none');

    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('id, name, email, phone_number, role, avatar_path')
            .eq('id', currentCustomerProfile.id)
            .single();

        if (error) throw error;

        currentCustomerProfile = data;
        const nameEl = document.getElementById('profile-view-name');
        const phoneEl = document.getElementById('profile-view-phone');
        const emailEl = document.getElementById('profile-view-email');
        const heroNameEl = document.getElementById('profile-hero-name');
        if (nameEl) nameEl.textContent = data.name || '—';
        if (phoneEl) phoneEl.textContent = data.phone_number || '—';
        if (emailEl) emailEl.textContent = data.email || '—';
        if (heroNameEl) heroNameEl.textContent = data.name || '—';

        const profileNameEl = document.getElementById('profile-name');
        if (profileNameEl) profileNameEl.textContent = data.name || '—';
        await refreshCurrentProfileAvatars(currentCustomerProfile);

        setProfileLoadingState(false);
        if (contentEl) contentEl.classList.remove('d-none');
    } catch (error) {
        console.error('Error loading customer profile view:', error);
        setProfileLoadingState(false);
        if (contentEl) contentEl.classList.add('d-none');
        setProfileAlert(statusEl, 'danger', error?.message || 'Unable to load your profile right now.');
    }
}

function openEditProfileDialog() {
    const editModalEl = document.getElementById('profileEditModal');
    if (!editModalEl) return;

    const nameInput = document.getElementById('profile-name-input');
    const phoneInput = document.getElementById('profile-phone-input');
    const emailInput = document.getElementById('profile-email-readonly');
    const statusEl = document.getElementById('profile-edit-status');

    if (nameInput) nameInput.value = currentCustomerProfile?.name || '';
    if (phoneInput) phoneInput.value = currentCustomerProfile?.phone_number || '';
    if (emailInput) emailInput.value = currentCustomerProfile?.email || '';
    const avatarInput = document.getElementById('profile-avatar-input');
    if (avatarInput) avatarInput.value = '';
    renderProfileAvatarElement(
        document.getElementById('profile-edit-avatar'),
        currentCustomerProfile,
        currentCustomerProfile?.avatar_url
    );
    clearProfileAlert(statusEl);

    const viewModalInstance = bootstrap.Modal.getInstance(document.getElementById('profileViewModal'));
    if (viewModalInstance) viewModalInstance.hide();

    const editModalInstance = bootstrap.Modal.getOrCreateInstance(editModalEl);
    editModalInstance.show();
}

function openEditProfileFromSettings() {
    bootstrap.Modal.getInstance(document.getElementById('settingsModal'))?.hide();
    openEditProfileDialog();
}

function handleCustomerAvatarPreview(input) {
    const statusEl = document.getElementById('profile-edit-status');
    try {
        previewSelectedProfileImage(input, 'profile-edit-avatar', currentCustomerProfile);
        clearProfileAlert(statusEl);
    } catch (error) {
        setProfileAlert(statusEl, 'danger', error.message);
    }
}

function validateCustomerProfileInputs(name, phone) {
    if (!name || !name.trim()) {
        return 'Name cannot be empty.';
    }

    if (!phone || !phone.trim()) {
        return 'Phone Number cannot be empty.';
    }

    const phonePattern = /^\+?[0-9()\-\s]{7,20}$/;
    if (!phonePattern.test(phone.trim())) {
        return 'Phone Number must be a valid format.';
    }

    return null;
}

async function saveCustomerProfile() {
    if (!currentCustomerProfile) return;

    const nameInput = document.getElementById('profile-name-input');
    const phoneInput = document.getElementById('profile-phone-input');
    const statusEl = document.getElementById('profile-edit-status');
    const saveBtn = document.getElementById('profile-save-btn');
    const imageFile = document.getElementById('profile-avatar-input')?.files?.[0] || null;

    const name = nameInput?.value.trim() || '';
    const phone = phoneInput?.value.trim() || '';

    const validationError = validateCustomerProfileInputs(name, phone);
    if (validationError) {
        setProfileAlert(statusEl, 'danger', validationError);
        return;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    setProfileAlert(statusEl, 'info', 'Saving your profile changes...');

    try {
        currentCustomerProfile = await updateProfileWithAvatar(
            currentCustomerProfile,
            { name, phone_number: phone },
            imageFile
        );
        const data = currentCustomerProfile;
        const profileNameEl = document.getElementById('profile-name');
        if (profileNameEl) profileNameEl.textContent = data.name || '—';

        const editModalInstance = bootstrap.Modal.getInstance(document.getElementById('profileEditModal'));
        if (editModalInstance) editModalInstance.hide();

        await loadCustomerProfileView();

        const viewModalEl = document.getElementById('profileViewModal');
        const viewModalStatusEl = document.getElementById('profile-view-status');
        const viewModalInstance = bootstrap.Modal.getOrCreateInstance(viewModalEl);
        if (viewModalEl) viewModalInstance.show();

        setProfileAlert(viewModalStatusEl, 'success', 'Profile updated successfully.');
        showToast('Profile updated successfully.', 'success');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    } catch (error) {
        console.error('Error updating customer profile:', error);
        setProfileAlert(statusEl, 'danger', error?.message || 'Unable to update your profile. Please try again.');
        showToast(error?.message || 'Unable to update your profile. Please try again.', 'danger');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }
}

// -- Init -----------------------------------------------------
async function initCustomerPage() {
    currentCustomerProfile = await requireCustomer();
    if (!currentCustomerProfile) return; // requireCustomer redirects to login

    syncNotificationSettingUI();
    watchNotificationPermission(syncNotificationSettingUI);

    // Populate profile dropdown name
    const profileNameEl = document.getElementById('profile-name');
    if (profileNameEl && currentCustomerProfile.name) {
        profileNameEl.textContent = currentCustomerProfile.name;
    }
    await refreshCurrentProfileAvatars(currentCustomerProfile);

    await loadApprovedShops();
    await loadCustomerOrders();

    // Subscribe to Realtime order status changes
    subscribeCustomerRealtime();
    subscribeCustomerShopProfiles();
    startCustomerOrderPolling();
}

function subscribeCustomerShopProfiles() {
    if (customerShopRefreshTimer) window.clearInterval(customerShopRefreshTimer);
    customerShopRefreshTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') loadApprovedShops();
    }, 30000);

    const refreshWhenReturning = () => {
        if (document.visibilityState === 'visible') loadApprovedShops();
    };
    window.addEventListener('focus', refreshWhenReturning);
    document.addEventListener('visibilitychange', refreshWhenReturning);
}

// ── Realtime: listen for status changes on own orders ───────
const STATUS_MESSAGES = {
    preparing: {
        title: 'Order accepted',
        msg: '🍳 Your order has been accepted and is being prepared.',
        type: 'info'
    },
    ready: {
        title: 'Ready for pickup',
        msg: '✅ Your order is ready. Please come and pick it up!',
        type: 'success'
    },
    out_for_delivery: {
        title: 'Order sent',
        msg: '🛵 The shop marked your order as sent. Confirm when it reaches you.',
        type: 'success'
    },
    delivered: {
        title: 'Receipt confirmed',
        msg: '📦 Receipt confirmed. The shop has been notified.',
        type: 'success'
    },
    cancelled: {
        title: 'Order cancelled',
        msg: '❌ Your order has been cancelled.',
        type: 'danger'
    },
};

async function subscribeCustomerRealtime() {
    if (!currentCustomerProfile) return;

    const realtimeClient = await getOrder2MeRealtimeClient();

    if (customerRealtimeChannel) {
        realtimeClient.removeChannel(customerRealtimeChannel);
    }

    customerRealtimeChannel = realtimeClient
        .channel('customer-orders-realtime')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'orders',
                filter: `customer_id=eq.${currentCustomerProfile.id}`
            },
            (payload) => {
                const updated = payload.new;
                const old     = payload.old;
                if (!updated) return;
                const snapshotStatus = customerOrderSnapshot.get(Number(updated.id));
                customerOrderSnapshot.set(Number(updated.id), updated.status);

                // Only react to status changes
                if (old && old.status === updated.status) return;

                // Refresh today's orders UI
                loadCustomerOrders();

                // Show notification for the new status
                if (snapshotStatus !== updated.status) notifyCustomerOrderStatus(updated);
            }
        )
        .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('Customer realtime notification channel:', status);
            }
        });
}

function openOrderShopOwnerProfile(shopId) {
    const shop = approvedShops.find(item => Number(item.id) === Number(shopId));
    if (!shop) {
        showToast('Shop owner profile is not available.', 'info');
        return;
    }
    const previousShop = activeShop;
    activeShop = shop;
    syncSelectedOwnerProfileUI();
    activeShop = previousShop;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('shopOwnerProfileModal')).show();
}

function notifyCustomerOrderStatus(order) {
    const info = STATUS_MESSAGES[order.status];
    if (!info) return;
    showToast(info.msg, info.type);
    if (isNotificationPreferenceEnabled()) {
        playNotificationSound(info.type);
        maybeBrowserNotification(info.title, info.msg, {
            tag: `order2me-order-${order.id}`,
            orderId: order.id,
            url: 'customer.html#orders'
        });
    }
}

function startCustomerOrderPolling() {
    if (customerOrderPollTimer) window.clearInterval(customerOrderPollTimer);
    customerOrderPollTimer = window.setInterval(pollCustomerOrders, CUSTOMER_ORDER_POLL_INTERVAL_MS);
    window.addEventListener('focus', pollCustomerOrders);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') pollCustomerOrders();
    });
}

async function pollCustomerOrders() {
    if (!currentCustomerProfile || customerOrderPollBusy) return;
    customerOrderPollBusy = true;
    try {
        const { start, end } = getTodayBounds();
        const { data, error } = await supabaseClient
            .from('orders')
            .select('id, status, created_at')
            .eq('customer_id', currentCustomerProfile.id)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString());
        if (error) throw error;

        let changed = false;
        for (const order of data || []) {
            const id = Number(order.id);
            const previousStatus = customerOrderSnapshot.get(id);
            customerOrderSnapshot.set(id, order.status);
            if (previousStatus !== undefined && previousStatus !== order.status) {
                notifyCustomerOrderStatus(order);
                changed = true;
            } else if (previousStatus === undefined) {
                changed = true;
            }
        }
        if (changed) loadCustomerOrders();
    } catch (error) {
        console.error('Customer order polling failed:', error);
    } finally {
        customerOrderPollBusy = false;
    }
}

// Cleanup Realtime on page unload
window.addEventListener('beforeunload', () => {
    if (customerRealtimeChannel) {
        realtimeSupabaseClient.removeChannel(customerRealtimeChannel);
    }
    if (customerShopRefreshTimer) window.clearInterval(customerShopRefreshTimer);
    if (customerOrderPollTimer) window.clearInterval(customerOrderPollTimer);
});

document.addEventListener('DOMContentLoaded', initCustomerPage);
