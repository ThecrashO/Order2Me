let cart = [];

async function loadMenu() {
    const { data, error } = await supabaseClient
        .from("menu_items")
        .select("*")
        .eq("is_available", true)
        .order("name", { ascending: true });

    if (error) {
        console.error("Error fetching menu:", error);
        const container = document.getElementById("menu-container");
        container.innerHTML = "<p class='text-danger'>Error loading menu. Please refresh.</p>";
        return;
    }

    if (data.length === 0) {
        const container = document.getElementById("menu-container");
        container.innerHTML = "<p class='text-muted'>No items available today.</p>";
        return;
    }

    displayMenuItems(data);
}

function displayMenuItems(items) {
    const container = document.getElementById("menu-container");
    container.innerHTML = "";

    items.forEach(food => {
        const card = document.createElement("div");
        card.className = "col-md-4 mb-4";
        card.innerHTML = `
            <div class="card shadow-sm h-100">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title">${food.name}</h5>
                    <p class="card-text text-muted flex-grow-1">
                        ${food.description || "Delicious item"}
                    </p>
                    <h6 class="text-primary mb-3">${food.price} MMK</h6>
                    <button class="btn btn-primary w-100" onclick="addToCart(${food.id}, '${escapeHtml(food.name)}', ${food.price})">
                        Add to Cart
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function addToCart(itemId, itemName, price) {
    const existingItem = cart.find(item => item.id === itemId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: itemId,
            name: itemName,
            price: price,
            quantity: 1
        });
    }
    updateCartCount();
    console.log("Cart:", cart);
}

function updateCartCount() {
    const count = cart.reduce((s, i) => s + i.quantity, 0);
    const el = document.getElementById('cart-count');
    if (el) el.textContent = count;
}

function showCart() {
    renderCart();
    const modalEl = document.getElementById('cartModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

function renderCart() {
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
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

async function checkout() {
    if (cart.length === 0) {
        alert('Cart is empty');
        return;
    }

    const studentName = prompt('Enter your name for the order:');
    if (!studentName) return;

    // Create order in Supabase
    await createOrder(studentName);
}

async function createOrder(studentName) {
    const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

    const { data: orderData, error: orderError } = await supabaseClient
        .from('orders')
        .insert({ student_name: studentName, status: 'pending', total })
        .select();

    if (orderError) {
        console.error('Error creating order:', orderError);
        alert('Failed to create order. Please try again.');
        return;
    }

    const orderId = orderData && orderData[0] && orderData[0].id;
    if (!orderId) {
        alert('Could not retrieve order ID from server.');
        return;
    }

    const itemsToInsert = cart.map(i => ({
        order_id: orderId,
        menu_item_id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity
    }));

    const { error: itemsError } = await supabaseClient
        .from('order_items')
        .insert(itemsToInsert);

    if (itemsError) {
        console.error('Error saving order items:', itemsError);
        alert('Order was created but saving items failed. Contact admin.');
        return;
    }

    // Success
    cart = [];
    updateCartCount();
    renderCart();
    const modalEl = document.getElementById('cartModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }
    alert('Order placed successfully!');
}

loadMenu();