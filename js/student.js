// ============================================================
// student.js  --  Order2Me Student Page
// ============================================================
// Handles:
//   1. Loading menu from Supabase
//   2. Cart management (add / remove / quantity)
//   3. Checkout: delivery note (required) + payment
//   4. Payment: KBZPay / WavePay / Already Paid + screenshot upload
//   5. Creating order + order_items + payment record in Supabase
//   6. Success feedback
// ============================================================

// ── Owner payment number — fetched from DB at runtime ────────
let ownerPhoneNumber = null; // loaded in initStudentPage()
const NOTIFICATION_PREF_KEY = 'order2me-notifications-enabled';

function isNotificationPreferenceEnabled() {
    return localStorage.getItem(NOTIFICATION_PREF_KEY) === 'true';
}

function syncNotificationSettingUI() {
    const checkbox = document.getElementById('notification-toggle');
    const statusEl = document.getElementById('notification-setting-status');
    if (!checkbox || !statusEl) return;

    const supported = 'Notification' in window && location.protocol !== 'file:';
    checkbox.disabled = !supported;
    checkbox.checked = supported && isNotificationPreferenceEnabled();
    statusEl.textContent = supported
        ? (checkbox.checked ? 'Notifications are enabled.' : 'Notifications are currently disabled.')
        : 'Notifications are not available on this origin yet.';
}

async function toggleNotificationPreference() {
    const checkbox = document.getElementById('notification-toggle');
    const statusEl = document.getElementById('notification-setting-status');
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
            syncNotificationSettingUI();
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

function maybeBrowserNotification(title, message) {
    if (!('Notification' in window) || location.protocol === 'file:') return;
    if (!isNotificationPreferenceEnabled()) return;

    const shouldUseBrowserNotify = document.visibilityState === 'hidden' || !document.hasFocus();
    if (!shouldUseBrowserNotify) return;

    if (Notification.permission === 'granted') {
        new Notification(title, {
            body: message,
            icon: 'images/logo.png'
        });
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('app-toast-container');
    if (!container) return;

    if (isNotificationPreferenceEnabled()) {
        playNotificationSound(type);
        maybeBrowserNotification('Order2Me', message);
    }

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
let currentStudentProfile = null;
let cart                  = [];
let selectedPaymentMethod = null; // 'KBZPay' | 'WavePay' | 'Cash'
let allMenuItems          = [];   // full list for client-side category filter
let activeCategory        = 'all';

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

// -- 1. MENU --------------------------------------------------

async function loadMenu() {
    const { data, error } = await supabaseClient
        .from('menu_items')
        .select('*')
        .eq('is_available', true)
        .order('name', { ascending: true });

    const container = document.getElementById('menu-container');

    if (error) {
        console.error('Error fetching menu:', error);
        container.innerHTML = "<p class='text-danger'>Error loading menu. Please refresh.</p>";
        return;
    }

    if (data.length === 0) {
        container.innerHTML = "<p class='text-muted'>No items available today.</p>";
        return;
    }

    allMenuItems = data;
    setupCategoryFilters();
    displayMenuItems(data);
}

function filterMenu(query) {
    const q = query.trim().toLowerCase();

    // Start from category-filtered list
    let base = activeCategory === 'all'
        ? allMenuItems
        : allMenuItems.filter(item => (item.category || 'food') === activeCategory);

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

    items.forEach(food => {
        const card = document.createElement('div');
        card.className = 'col-6 col-md-4 mb-3 mb-md-4';

        const catMeta = CATEGORY_META[food.category] || CATEGORY_META.other;

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
                    >
                        + Add
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
    document.querySelectorAll('.category-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state visually
            document.querySelectorAll('.category-filter-btn').forEach(b => {
                const cat = b.dataset.category;
                b.classList.remove('active', ...CAT_ACTIVE_CLASSES[cat] || []);
                b.classList.add(...(CAT_OUTLINE_CLASSES[cat] || ['btn-outline-secondary']));
            });
            const cat = btn.dataset.category;
            btn.classList.remove(...(CAT_OUTLINE_CLASSES[cat] || []));
            btn.classList.add('active', ...(CAT_ACTIVE_CLASSES[cat] || []));

            // Filter and render
            activeCategory = cat;
            const filtered = cat === 'all'
                ? allMenuItems
                : allMenuItems.filter(item => (item.category || 'food') === cat);
            displayMenuItems(filtered);
        });
    });
}

// -- Student Orders -------------------------------------------

async function loadStudentOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    container.innerHTML = '<p class="text-muted">Loading today\'s orders...</p>';

    if (!currentStudentProfile) return;

    // Only fetch orders placed TODAY (local time)
    const { start, end } = getTodayBounds();
    const startISO = start.toISOString();
    const endISO   = end.toISOString();

    const { data, error } = await supabaseClient
        .from('orders')
        .select(`
            id,
            status,
            total_amount,
            delivery_note,
            created_at,
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
        .eq('student_id', currentStudentProfile.id)
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading student orders:', error);
        container.innerHTML = `<p class="text-danger">Error loading your orders: ${escapeHtml(error.message)}</p>`;
        return;
    }

    displayTodayOrders(data || []);
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
        { key: 'pending',   icon: '⏳', label: 'Pending'  },
        { key: 'preparing', icon: '🍳', label: 'Preparing'},
        { key: 'ready',     icon: '✅', label: 'Ready'   },
        { key: 'delivered', icon: '📦', label: 'Delivered'}
    ];
    const STATUS_ORDER = { pending: 0, preparing: 1, ready: 2, delivered: 3, cancelled: -1 };

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

        const statusLabel = isCancelled
            ? '<span class="badge bg-danger">Cancelled</span>'
            : `<span class="badge" style="background:var(--brand);">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span>`;

        return `
        <div class="order-tracker-card">
            <div class="order-tracker-header">
                <div>
                    <div class="order-tracker-id">📋 Order #${order.id}</div>
                    <div class="order-tracker-time">⏰ Placed at ${time}</div>
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
            </div>
        </div>`;
    }).join('');
}

// Legacy alias kept for compatibility (called on order success refresh)
function displayStudentOrders(orders) {
    displayTodayOrders(orders);
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// -- 2. CART --------------------------------------------------

function addToCart(itemId, itemName, price) {
    const existing = cart.find(i => i.id === itemId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ id: itemId, name: itemName, price: price, quantity: 1 });
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
    if (chkBtn) chkBtn.disabled = count === 0;

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

function openCheckout() {
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

    // Set owner numbers (fetched from DB in initStudentPage)
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
    document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active', 'btn-primary', 'btn-success', 'btn-warning'));
    document.querySelectorAll('.payment-method-btn').forEach(b => {
        if (b.dataset.method === 'KBZPay')  { b.className = 'btn btn-outline-primary payment-method-btn'; }
        if (b.dataset.method === 'WavePay') { b.className = 'btn btn-outline-success payment-method-btn'; }
        if (b.dataset.method === 'Cash')    { b.className = 'btn btn-outline-warning payment-method-btn'; }
    });

    // Close cart, open checkout
    const cartModal = bootstrap.Modal.getInstance(document.getElementById('cartModal'));
    if (cartModal) cartModal.hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('checkoutModal')).show();
    }, 300);
}

function selectPaymentMethod(method) {
    selectedPaymentMethod = method;

    // Update button styles
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
        const m = btn.dataset.method;
        btn.classList.remove('active');
        if (m === 'KBZPay')  btn.className = 'btn btn-outline-primary payment-method-btn';
        if (m === 'WavePay') btn.className = 'btn btn-outline-success payment-method-btn';
        if (m === 'Cash')    btn.className = 'btn btn-outline-warning payment-method-btn';
    });

    const activeBtn = document.querySelector(`.payment-method-btn[data-method="${method}"]`);
    if (activeBtn) {
        if (method === 'KBZPay')  activeBtn.className = 'btn btn-primary payment-method-btn active';
        if (method === 'WavePay') activeBtn.className = 'btn btn-success payment-method-btn active';
        if (method === 'Cash')    activeBtn.className = 'btn btn-warning payment-method-btn active';
    }

    // Show/hide payment panels
    document.getElementById('kbzpay-panel').classList.add('d-none');
    document.getElementById('wavepay-panel').classList.add('d-none');
    document.getElementById('cash-panel').classList.add('d-none');

    if (method === 'KBZPay')  document.getElementById('kbzpay-panel').classList.remove('d-none');
    if (method === 'WavePay') document.getElementById('wavepay-panel').classList.remove('d-none');
    if (method === 'Cash')    document.getElementById('cash-panel').classList.remove('d-none');

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
    if (!selectedPaymentMethod) {
        paymentError.classList.remove('d-none');
        valid = false;
    } else {
        paymentError.classList.add('d-none');
    }

    // Validate screenshot
    const screenshotFile = screenshotInput.files[0];
    if (!screenshotFile) {
        if (selectedPaymentMethod === 'KBZPay' || selectedPaymentMethod === 'WavePay') {
            // Open the payment app first so the student can complete payment and return with a screenshot.
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

async function uploadPaymentScreenshot(file, orderId) {
    const ext      = file.name.split('.').pop();
    const fileName = `order_${orderId}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
        .from('payment-screenshots')
        .upload(fileName, file, { upsert: true });

    if (uploadError) {
        console.error('Screenshot upload error:', uploadError);
        return null;
    }

    const { data } = supabaseClient.storage
        .from('payment-screenshots')
        .getPublicUrl(fileName);

    return data.publicUrl || null;
}

async function createOrder(deliveryNote, paymentMethod, screenshotFile) {
    const errorBanner = document.getElementById('checkout-error');

    // Calculate total
    const totalAmount = cart.reduce((s, i) => s + i.price * i.quantity, 0);

    // Step 1: Insert order
    const { data: orderData, error: orderError } = await supabaseClient
        .from('orders')
        .insert({
            student_id:    currentStudentProfile.id,
            student_name:  currentStudentProfile.name,
            total_amount:  totalAmount,
            delivery_note: deliveryNote,
            status:        'pending'
        })
        .select()
        .single();

    if (orderError) {
        console.error('Error creating order:', orderError);
        errorBanner.textContent = 'Failed to place order: ' + orderError.message;
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

    // Step 3: Upload screenshot
    let screenshotUrl = null;
    if (screenshotFile) {
        screenshotUrl = await uploadPaymentScreenshot(screenshotFile, orderId);
        if (!screenshotUrl) {
            console.warn('Screenshot upload failed. Saving payment without URL.');
        }
    }

    // Step 4: Save payment record
    const { error: paymentError } = await supabaseClient
        .from('payments')
        .insert({
            order_id:       orderId,
            payment_method: paymentMethod,
            screenshot_url: screenshotUrl
        });

    if (paymentError) {
        console.error('Error saving payment:', paymentError);
        // Non-fatal: order is already placed, just warn
        errorBanner.textContent = 'Order placed but payment record failed. Please contact the canteen. Order ID: ' + orderId;
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

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('successModal')).show();
        loadStudentOrders(); // refresh orders list
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
    const { data, error } = await supabaseClient
        .from('users')
        .select('phone_number')
        .eq('role', 'owner')
        .order('id', { ascending: true })
        .limit(1)
        .single();

    if (error) {
        console.warn('Could not fetch owner phone number:', error.message);
        return;
    }
    ownerPhoneNumber = data?.phone_number || null;

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

async function loadStudentProfileView() {
    const loadingEl = document.getElementById('profile-view-loading');
    const contentEl = document.getElementById('profile-view-content');
    const statusEl = document.getElementById('profile-view-status');

    if (!currentStudentProfile) return;

    setProfileLoadingState(true);
    clearProfileAlert(statusEl);
    if (contentEl) contentEl.classList.add('d-none');

    try {
        const { data, error } = await supabaseClient
            .from('users')
            .select('id, name, email, phone_number, role')
            .eq('id', currentStudentProfile.id)
            .single();

        if (error) throw error;

        currentStudentProfile = data;
        const nameEl = document.getElementById('profile-view-name');
        const phoneEl = document.getElementById('profile-view-phone');
        const emailEl = document.getElementById('profile-view-email');
        if (nameEl) nameEl.textContent = data.name || '—';
        if (phoneEl) phoneEl.textContent = data.phone_number || '—';
        if (emailEl) emailEl.textContent = data.email || '—';

        const profileNameEl = document.getElementById('profile-name');
        if (profileNameEl) profileNameEl.textContent = data.name || '—';

        setProfileLoadingState(false);
        if (contentEl) contentEl.classList.remove('d-none');
    } catch (error) {
        console.error('Error loading student profile view:', error);
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

    if (nameInput) nameInput.value = currentStudentProfile?.name || '';
    if (phoneInput) phoneInput.value = currentStudentProfile?.phone_number || '';
    if (emailInput) emailInput.value = currentStudentProfile?.email || '';
    clearProfileAlert(statusEl);

    const viewModalInstance = bootstrap.Modal.getInstance(document.getElementById('profileViewModal'));
    if (viewModalInstance) viewModalInstance.hide();

    const editModalInstance = bootstrap.Modal.getOrCreateInstance(editModalEl);
    editModalInstance.show();
}

function validateStudentProfileInputs(name, phone) {
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

async function saveStudentProfile() {
    if (!currentStudentProfile) return;

    const nameInput = document.getElementById('profile-name-input');
    const phoneInput = document.getElementById('profile-phone-input');
    const statusEl = document.getElementById('profile-edit-status');
    const saveBtn = document.getElementById('profile-save-btn');

    const name = nameInput?.value.trim() || '';
    const phone = phoneInput?.value.trim() || '';

    const validationError = validateStudentProfileInputs(name, phone);
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
        const { data, error } = await supabaseClient
            .from('users')
            .update({
                name,
                phone_number: phone
            })
            .eq('id', currentStudentProfile.id)
            .select('id, name, email, phone_number, role')
            .single();

        if (error) throw error;

        currentStudentProfile = data;
        const profileNameEl = document.getElementById('profile-name');
        if (profileNameEl) profileNameEl.textContent = data.name || '—';

        const editModalInstance = bootstrap.Modal.getInstance(document.getElementById('profileEditModal'));
        if (editModalInstance) editModalInstance.hide();

        await loadStudentProfileView();

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
        console.error('Error updating student profile:', error);
        setProfileAlert(statusEl, 'danger', error?.message || 'Unable to update your profile. Please try again.');
        showToast(error?.message || 'Unable to update your profile. Please try again.', 'danger');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }
}

// -- Init -----------------------------------------------------
async function initStudentPage() {
    currentStudentProfile = await requireStudent();
    if (!currentStudentProfile) return; // requireStudent redirects to login

    // Populate profile dropdown name
    const profileNameEl = document.getElementById('profile-name');
    if (profileNameEl && currentStudentProfile.name) {
        profileNameEl.textContent = currentStudentProfile.name;
    }

    // Load owner phone number from DB (used for KBZPay / WavePay deep links)
    await fetchOwnerPhone();

    loadMenu();
    loadStudentOrders();

    // Subscribe to Realtime order status changes
    subscribeStudentRealtime();
}

// ── Realtime: listen for status changes on own orders ───────
const STATUS_MESSAGES = {
    preparing: { msg: '🍳 Your order is being prepared!', type: 'info'    },
    ready:     { msg: '✅ Your order is ready for pickup!', type: 'success' },
    delivered: { msg: '📦 Order delivered. Enjoy your meal!', type: 'success' },
    cancelled: { msg: '❌ Your order has been cancelled.',   type: 'danger'  },
};

function subscribeStudentRealtime() {
    if (!currentStudentProfile) return;

    if (studentRealtimeChannel) {
        supabaseClient.removeChannel(studentRealtimeChannel);
    }

    studentRealtimeChannel = supabaseClient
        .channel('student-orders-realtime')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'orders',
                filter: `student_id=eq.${currentStudentProfile.id}`
            },
            (payload) => {
                const updated = payload.new;
                const old     = payload.old;
                if (!updated) return;

                // Only react to status changes
                if (old && old.status === updated.status) return;

                // Refresh today's orders UI
                loadStudentOrders();

                // Show notification for the new status
                const info = STATUS_MESSAGES[updated.status];
                if (info) {
                    showToast(info.msg, info.type);
                    maybeBrowserNotification('Order2Me', info.msg);
                }
            }
        )
        .subscribe();
}

// Cleanup Realtime on page unload
window.addEventListener('beforeunload', () => {
    if (studentRealtimeChannel) {
        supabaseClient.removeChannel(studentRealtimeChannel);
    }
});

document.addEventListener('DOMContentLoaded', initStudentPage);