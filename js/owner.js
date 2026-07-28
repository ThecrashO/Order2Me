// ============================================================
// owner.js  --  Order2Me Owner Dashboard
// ============================================================
// Sections:
//   1. Init
//   2. Orders -- load, render, filter, status update, reject
//   3. Menu   -- load, display, add, edit, delete, toggle
// ============================================================

// ── Globals ──────────────────────────────────────────────────
let addFoodModal;
let editFoodModal;
let rejectModal;

let allOrders      = [];   // cache for client-side filtering
let activeFilter   = 'all';
let ownerProfile   = null; // current logged-in owner

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
    const count  = allOrders.filter(o => o.status === 'pending').length;
    const badge  = document.getElementById('pending-badge');
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('d-none');
    } else {
        badge.classList.add('d-none');
    }
}

function renderOrders() {
    const container = document.getElementById('orders-list');
    const filtered  = activeFilter === 'all'
        ? allOrders
        : allOrders.filter(o => o.status === activeFilter);

    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-muted">No orders found.</p>';
        return;
    }

    container.innerHTML = filtered.map(order => buildOrderCard(order)).join('');
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

    const deliveryNote = order.delivery_note
        ? `<p class="mb-1 small text-muted"><strong>Note:</strong> ${escapeHtml(order.delivery_note)}</p>`
        : '';

    const time = new Date(order.created_at).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    return `
        <div class="card mb-3 border-${cfg.color}" id="order-card-${order.id}">
            <div class="card-header d-flex justify-content-between align-items-center bg-${cfg.color} bg-opacity-10">
                <span class="fw-semibold">Order #${order.id} &mdash; ${escapeHtml(order.student_name || 'Unknown')}</span>
                <span class="badge bg-${cfg.color} text-dark">${cfg.label}</span>
            </div>
            <div class="card-body py-2">
                <ul class="list-group list-group-flush mb-2">${itemsHtml}</ul>
                ${deliveryNote}
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

function displayMenuItems(items) {
    const menuList = document.getElementById('menu-list');

    if (!items || items.length === 0) {
        menuList.innerHTML = "<p class='text-muted'>No menu items yet. Click 'Add Food' to get started!</p>";
        return;
    }

    menuList.innerHTML = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead class="table-light">
                    <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Price (MMK)</th>
                        <th>Available</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => `
                        <tr>
                            <td>${escapeHtml(item.name)}</td>
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
                                <button class="btn btn-sm btn-warning me-2"
                                        onclick="openEditModal(${item.id}, '${escapeHtml(item.name)}', '${escapeHtml(item.description || '')}', ${item.price}, ${item.is_available})">
                                    Edit
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteItem(${item.id})">
                                    Delete
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.querySelectorAll('.toggle-availability').forEach(toggle => {
        toggle.addEventListener('change', toggleAvailability);
    });
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

async function handleAddFood() {
    const name        = document.getElementById('item-name').value.trim();
    const description = document.getElementById('item-description').value.trim();
    const price       = parseFloat(document.getElementById('item-price').value);
    const isAvailable = document.getElementById('item-available').checked;

    if (!name || isNaN(price) || price < 0) return;

    const { error } = await supabaseClient
        .from('menu_items')
        .insert([{ name, description, price, is_available: isAvailable }]);

    if (error) { console.error('Error adding food:', error); return; }

    document.getElementById('menu-form').reset();
    addFoodModal.hide();
    loadMenuItems();
}

function openEditModal(id, name, description, price, isAvailable) {
    document.getElementById('edit-item-id').value          = id;
    document.getElementById('edit-item-name').value        = name;
    document.getElementById('edit-item-description').value = description;
    document.getElementById('edit-item-price').value       = price;
    document.getElementById('edit-item-available').checked = isAvailable;
    editFoodModal.show();
}

async function handleEditFood() {
    const itemId      = document.getElementById('edit-item-id').value;
    const name        = document.getElementById('edit-item-name').value.trim();
    const description = document.getElementById('edit-item-description').value.trim();
    const price       = parseFloat(document.getElementById('edit-item-price').value);
    const isAvailable = document.getElementById('edit-item-available').checked;

    if (!itemId || !name || isNaN(price) || price < 0) return;

    const { error } = await supabaseClient
        .from('menu_items')
        .update({ name, description, price, is_available: isAvailable })
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

// ── Init ──────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}