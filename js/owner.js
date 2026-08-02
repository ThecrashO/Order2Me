// ============================================================
// owner.js  --  Order2Me Owner Dashboard
// ============================================================
// Sections:
//   1. Init
//   2. Orders -- load, render, filter, status update, reject
//   3. Menu   -- load, display, add, edit, delete, toggle
//   4. Students -- load, render, filter
// ============================================================

// ── Globals ──────────────────────────────────────────────────
let addFoodModal;
let editFoodModal;
let rejectModal;

let allOrders      = [];   // cache for client-side filtering
let activeFilter   = 'all';
let activeSearch   = '';   // search query for orders
let ownerProfile   = null; // current logged-in owner
let menuItemsData  = new Map(); // id -> full item object (used for edit/image lookups)
let allMenuItemsArr = [];  // flat array cache for menu search
let allStudentsArr  = [];  // flat array cache for student search

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
}

// ── 2. ORDERS ─────────────────────────────────────────────────

async function loadOrders() {
    const { data, error } = await supabaseClient
        .from('orders')
        .select(`
            id,
            student_name,
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
    let filtered  = activeFilter === 'all'
        ? allOrders
        : allOrders.filter(o => o.status === activeFilter);

    // Apply text search
    const q = activeSearch.trim().toLowerCase();
    if (q) {
        filtered = filtered.filter(o =>
            String(o.id).includes(q) ||
            (o.student_name || '').toLowerCase().includes(q)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = q
            ? `<p class="text-muted">No orders match "${escapeHtml(activeSearch)}".</p>`
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
        delivered: { color: 'secondary', label: 'Delivered' }
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
                    <span class="text-muted small ms-2">— ${escapeHtml(order.student_name || 'Unknown')}</span>
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
        alert('Failed to update status: ' + error.message);
        return;
    }

    // Update local cache and re-render without full reload
    const order = allOrders.find(o => o.id === orderId);
    if (order) order.status = newStatus;
    updatePendingBadge();
    renderOrders();
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

    // NOTE: orders table has no reject_reason column yet.
    // We store the rejection by removing from pending state.
    // To add reject_reason: ALTER TABLE orders ADD COLUMN reject_reason text;
    const { error } = await supabaseClient
        .from('orders')
        .update({ status: 'delivered' })   // repurposed as "closed/rejected"
        .eq('id', orderId);

    // Ideally: .update({ status: 'rejected', reject_reason: finalReason })

    btn.disabled = false;
    spinner.classList.add('d-none');

    if (error) {
        console.error('Error rejecting order:', error);
        alert('Failed to reject order: ' + error.message);
        return;
    }

    console.log(`Order ${orderId} rejected. Reason: ${finalReason}`);
    rejectModal.hide();

    const order = allOrders.find(o => o.id === Number(orderId));
    if (order) order.status = 'delivered';
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

    menuList.innerHTML = `
        <div class="table-responsive">
            <table class="table table-hover align-middle">
                <thead class="table-light">
                    <tr>
                        <th>Image</th>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Price (MMK)</th>
                        <th>Available</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => {
                        const catBadge = categoryBadge(item.category);
                        return `
                        <tr data-item-id="${item.id}">
                            <td style="width:72px">
                                ${item.image_url
                                    ? `<img src="${item.image_url}" alt="${escapeHtml(item.name)}"
                                           class="rounded menu-thumb"
                                           data-item-id="${item.id}"
                                           style="width:60px;height:60px;object-fit:cover;cursor:pointer;"
                                           onerror="this.style.display='none'">`
                                    : `<span class="text-muted small">—</span>`
                                }
                            </td>
                            <td>${escapeHtml(item.name)}</td>
                            <td>${catBadge}</td>
                            <td>${escapeHtml(item.description || '-')}</td>
                            <td>${item.price}</td>
                            <td>
                                <div class="form-check form-switch">
                                    <input class="form-check-input toggle-availability" type="checkbox"
                                           id="toggle-${item.id}" ${item.is_available ? 'checked' : ''}
                                           data-id="${item.id}">
                                </div>
                            </td>
                            <td>
                                <button class="btn btn-sm btn-warning me-2 btn-edit-item"
                                        data-item-id="${item.id}">
                                    Edit
                                </button>
                                <button class="btn btn-sm btn-danger btn-delete-item"
                                        data-item-id="${item.id}">
                                    Delete
                                </button>
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>
    `;

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

// ── 4. STUDENTS ───────────────────────────────────────────────

async function loadStudents() {
    const container = document.getElementById('students-list');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center py-4 text-muted">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            Loading students...
        </div>`;

    // Fetch students + their order count in one query via Supabase embedded select
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
        .eq('role', 'student')
        .order('created_at', { ascending: false });

    if (error) {
        container.innerHTML = `<p class="text-danger p-3"><strong>Error:</strong> ${escapeHtml(error.message)}</p>`;
        return;
    }

    allStudentsArr = (data || []).map(s => ({
        ...s,
        order_count: Array.isArray(s.orders) ? s.orders.length : 0
    }));

    // Update sidebar count badge
    const badge = document.getElementById('students-count-badge');
    if (badge) {
        badge.textContent = allStudentsArr.length;
        if (allStudentsArr.length > 0) badge.classList.remove('d-none');
        else badge.classList.add('d-none');
    }

    renderStudents(allStudentsArr);
}

function filterStudents(query) {
    const q = query.trim().toLowerCase();
    if (!q) { renderStudents(allStudentsArr); return; }
    const filtered = allStudentsArr.filter(s =>
        (s.name  || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.phone_number || '').toLowerCase().includes(q)
    );
    renderStudents(filtered, q);
}

function renderStudents(students, query = '') {
    const container = document.getElementById('students-list');
    if (!container) return;

    if (!students || students.length === 0) {
        container.innerHTML = query
            ? `<div class="p-4 text-center text-muted">
                   <div style="font-size:2rem;">🔍</div>
                   <p class="mb-0 mt-2">No students match "${escapeHtml(query)}".</p>
               </div>`
            : `<div class="p-4 text-center text-muted">
                   <div style="font-size:2.5rem;">👤</div>
                   <p class="mb-0 mt-2">No registered students yet.</p>
               </div>`;
        return;
    }

    const palettes = [
        '#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316'
    ];

    const rows = students.map((s, idx) => {
        const initials = (s.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const joinDate = new Date(s.created_at).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
        const phone  = s.phone_number
            ? escapeHtml(s.phone_number)
            : '<span class="text-muted small">—</span>';
        const orders = s.order_count > 0
            ? `<span class="badge bg-primary bg-opacity-75">${s.order_count}</span>`
            : '<span class="text-muted small">0</span>';
        const bg = palettes[idx % palettes.length];

        return `
        <tr>
            <td class="ps-3">
                <div style="
                    width:36px;height:36px;border-radius:50%;
                    background:${bg};color:#fff;
                    display:flex;align-items:center;justify-content:center;
                    font-size:0.75rem;font-weight:700;flex-shrink:0;
                ">${initials}</div>
            </td>
            <td class="fw-semibold">${escapeHtml(s.name || '—')}</td>
            <td class="text-muted small">${escapeHtml(s.email || '—')}</td>
            <td class="text-muted small">${phone}</td>
            <td class="text-center">${orders}</td>
            <td class="text-muted small">${joinDate}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th class="ps-3" style="width:52px"></th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th class="text-center">Orders</th>
                        <th>Joined</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <div class="px-3 py-2 text-muted small border-top">
            ${students.length} student${students.length !== 1 ? 's' : ''} registered
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
        alert(`Image upload failed: ${uploadError.message}\n\nMake sure the "menu-images" storage bucket exists in Supabase Dashboard > Storage and is set to Public.`);
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

    if (error) { console.error('Error adding food:', error); return; }

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

    if (error) { console.error('Error editing food:', error); return; }

    editFoodModal.hide();
    loadMenuItems();
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

    if (error) { console.error('Error deleting food:', error); return; }

    loadMenuItems();
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