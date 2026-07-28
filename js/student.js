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

// ── Owner Payment Numbers (set these to real numbers) ────────
const OWNER_KBZPAY_NUMBER  = '09 7654 3210';
const OWNER_WAVEPAY_NUMBER = '09 8765 4321';

// ── State ────────────────────────────────────────────────────
let currentStudentProfile = null;
let cart                  = [];
let selectedPaymentMethod = null; // 'KBZPay' | 'WavePay' | 'Cash'

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

    displayMenuItems(data);
}

function displayMenuItems(items) {
    const container = document.getElementById('menu-container');
    container.innerHTML = '';

    items.forEach(food => {
        const card = document.createElement('div');
        card.className = 'col-md-4 mb-4';
        card.innerHTML = `
            <div class="card shadow-sm h-100">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title">${food.name}</h5>
                    <p class="card-text text-muted flex-grow-1">
                        ${food.description || 'Delicious item'}
                    </p>
                    <h6 class="text-primary mb-3">${food.price} MMK</h6>
                    <button
                        class="btn btn-primary w-100"
                        onclick="addToCart(${food.id}, '${escapeHtml(food.name)}', ${food.price})"
                    >
                        Add to Cart
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// -- Student Orders -------------------------------------------

async function loadStudentOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    container.innerHTML = '<p class="text-muted">Loading your orders...</p>';

    if (!currentStudentProfile) return;

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
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading student orders:', error);
        container.innerHTML = `<p class="text-danger">Error loading your orders: ${escapeHtml(error.message)}</p>`;
        return;
    }

    displayStudentOrders(data || []);
}

function displayStudentOrders(orders) {
    const container = document.getElementById('orders-container');
    if (!container) return;

    if (!orders || orders.length === 0) {
        container.innerHTML = '<p class="text-muted">You have no orders yet.</p>';
        return;
    }

    container.innerHTML = orders.map(order => {
        const statusColors = {
            pending:   'warning',
            preparing: 'info',
            ready:     'success',
            delivered: 'secondary'
        };
        const badgeColor = statusColors[order.status] || 'secondary';

        const itemsHtml = (order.order_items || []).map(item => {
            const name = item.menu_items ? item.menu_items.name : 'Item';
            return `
                <div class="d-flex justify-content-between small mb-1">
                    <span>${escapeHtml(name)} x ${item.quantity}</span>
                    <span>${item.price * item.quantity} MMK</span>
                </div>
            `;
        }).join('');

        const payment = order.payments && order.payments[0];
        const paymentHtml = payment ? `
            <div class="mt-2 pt-2 border-top small">
                <span class="badge bg-secondary">${escapeHtml(payment.payment_method)}</span>
                ${payment.screenshot_url ? `<a href="${payment.screenshot_url}" target="_blank" class="ms-2 small">View Receipt</a>` : ''}
            </div>
        ` : '';

        const noteHtml = order.delivery_note
            ? `<p class="mb-1 small text-muted"><strong>📍 Note:</strong> ${escapeHtml(order.delivery_note)}</p>`
            : '';

        const time = new Date(order.created_at).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        return `
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <div>
                        <strong>Order #${order.id}</strong>
                        <div class="small text-muted">Placed ${time}</div>
                    </div>
                    <span class="badge bg-${badgeColor} text-dark text-capitalize">${order.status}</span>
                </div>
                <div class="card-body py-2">
                    ${itemsHtml}
                    ${noteHtml}
                    ${paymentHtml}
                    <div class="text-end mt-2">
                        <strong>Total: ${order.total_amount} MMK</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('');
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
    const el = document.getElementById('cart-count');
    if (el) el.textContent = count;
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

// -- 3. CHECKOUT ----------------------------------------------

function openCheckout() {
    if (cart.length === 0) {
        alert('Your cart is empty.');
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

    // Set owner numbers
    document.getElementById('kbz-display-number').textContent  = OWNER_KBZPAY_NUMBER;
    document.getElementById('wave-display-number').textContent = OWNER_WAVEPAY_NUMBER;

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

function openPaymentApp(method) {
    const amountEl = document.getElementById(method === 'KBZPay' ? 'kbz-amount' : 'wave-amount');
    const number = method === 'KBZPay' ? OWNER_KBZPAY_NUMBER : OWNER_WAVEPAY_NUMBER;
    const amount = amountEl ? amountEl.textContent.trim() : '';

    let url = '';
    if (method === 'KBZPay') {
        url = `kbzpay://transfer?recipient=${encodeURIComponent(number)}&amount=${encodeURIComponent(amount)}`;
    } else if (method === 'WavePay') {
        url = `wavepay://transfer?recipient=${encodeURIComponent(number)}&amount=${encodeURIComponent(amount)}`;
    }

    if (url) {
        window.location.href = url;
    }
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

// -- Init -----------------------------------------------------
async function initStudentPage() {
    currentStudentProfile = await requireStudent();
    if (!currentStudentProfile) return; // requireStudent redirects to login

    // Show greeting in navbar
    const greetingEl = document.getElementById('student-greeting');
    if (greetingEl && currentStudentProfile.name) {
        greetingEl.textContent = 'Hi, ' + currentStudentProfile.name;
    }

    loadMenu();
    loadStudentOrders();
}

document.addEventListener('DOMContentLoaded', initStudentPage);