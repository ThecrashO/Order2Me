// ============================================================
// student.js  --  Order2Me Student Page
// ============================================================
// Handles:
//   1. Loading menu from Supabase
//   2. Cart management (add / remove / quantity)
//   3. Checkout form (name + delivery note)
//   4. Creating order + order_items in Supabase
//   5. Success feedback
// ============================================================

// TODO: Replace with real student_id from auth when login is added.
const TEMP_STUDENT_ID = 1;

let cart = [];

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

async function loadStudentOrders() {
    const container = document.getElementById('orders-container');
    if (!container) return;

    container.innerHTML = '<p class="text-muted">Loading your orders...</p>';

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
            )
        `)
        .eq('student_id', TEMP_STUDENT_ID)
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
            pending: 'warning',
            preparing: 'info',
            ready: 'success',
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

        const noteHtml = order.delivery_note
            ? `<p class="mb-1 small text-muted"><strong>Note:</strong> ${escapeHtml(order.delivery_note)}</p>`
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

    // Reset form fields
    document.getElementById('checkout-name').value = '';
    document.getElementById('checkout-note').value = '';
    document.getElementById('checkout-name-error').classList.add('d-none');
    document.getElementById('checkout-error').classList.add('d-none');

    // Close cart modal, open checkout modal
    const cartModal = bootstrap.Modal.getInstance(document.getElementById('cartModal'));
    if (cartModal) cartModal.hide();

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('checkoutModal')).show();
    }, 300);
}

async function submitCheckout() {
    const nameInput   = document.getElementById('checkout-name');
    const noteInput   = document.getElementById('checkout-note');
    const nameError   = document.getElementById('checkout-name-error');
    const errorBanner = document.getElementById('checkout-error');
    const btn         = document.getElementById('place-order-btn');
    const spinner     = document.getElementById('place-order-spinner');

    // Validate
    const studentName  = nameInput.value.trim();
    const deliveryNote = noteInput.value.trim();

    if (!studentName) {
        nameError.classList.remove('d-none');
        nameInput.focus();
        return;
    }
    nameError.classList.add('d-none');
    errorBanner.classList.add('d-none');

    // Show loading state
    btn.disabled = true;
    spinner.classList.remove('d-none');

    try {
        await createOrder(studentName, deliveryNote);
    } finally {
        btn.disabled = false;
        spinner.classList.add('d-none');
    }
}

// -- 4. CREATE ORDER IN SUPABASE ------------------------------

async function createOrder(studentName, deliveryNote) {
    const errorBanner = document.getElementById('checkout-error');

    // Calculate total
    const totalAmount = cart.reduce((s, i) => s + i.price * i.quantity, 0);

    // Step 1: Insert into orders
    const { data: orderData, error: orderError } = await supabaseClient
        .from('orders')
        .insert({
            student_id:    TEMP_STUDENT_ID,
            student_name:  studentName,
            total_amount:  totalAmount,
            delivery_note: deliveryNote || null,
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
        errorBanner.textContent = 'Order created but items failed to save. Contact the canteen. Order ID: ' + orderId;
        errorBanner.classList.remove('d-none');
        return;
    }

    // Step 3: Success
    cart = [];
    updateCartCount();

    // Close checkout modal
    const checkoutModal = bootstrap.Modal.getInstance(document.getElementById('checkoutModal'));
    if (checkoutModal) checkoutModal.hide();

    // Populate and show success modal
    document.getElementById('success-order-id').textContent = orderId;
    document.getElementById('success-total').textContent = totalAmount;

    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('successModal')).show();
    }, 300);

    console.log('Order placed successfully. Order ID:', orderId);
}

// -- Init -----------------------------------------------------
loadMenu();
loadStudentOrders();