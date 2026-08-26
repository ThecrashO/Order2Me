// Order2Me Admin Control Center additions. Sensitive writes use audited RPCs.
const ADMIN_PANELS = ['overview','shops','users','orders','moderation','announcements','analytics','audit','system'];
let adminOrders = [], adminMenuItems = [], adminFeedback = [], adminAuditLogs = [];
let adminModerationMode = 'menu';

function adminMoney(value) {
    return `${Number(value || 0).toLocaleString()} MMK`;
}

function adminDate(value) {
    return value ? new Date(value).toLocaleString() : '—';
}

function adminEmpty(message) {
    return `<div class="admin-empty"><span>⌕</span><strong>${adminEscape(message)}</strong></div>`;
}

function adminLoading(target) {
    const element = document.getElementById(target);
    if (element) element.innerHTML = '<div class="hist-loading"><div class="hist-spinner"></div><span>Loading…</span></div>';
}

function adminFailure(target, error) {
    const element = document.getElementById(target);
    if (element) element.innerHTML = `<div class="alert alert-danger">${adminEscape(error?.message || 'Unable to load data. Run the admin control migration.')}</div>`;
}

function adminAction({ title, copy, required = true, confirmText = 'Confirm', onConfirm }) {
    const modalElement = document.getElementById('adminActionModal');
    document.getElementById('admin-action-title').textContent = title;
    document.getElementById('admin-action-copy').textContent = copy || '';
    document.getElementById('admin-action-reason').value = '';
    document.getElementById('admin-action-error').classList.add('d-none');
    const button = document.getElementById('admin-action-confirm');
    button.textContent = confirmText;
    button.onclick = async () => {
        const reason = document.getElementById('admin-action-reason').value.trim();
        if (required && !reason) {
            const error = document.getElementById('admin-action-error');
            error.textContent = 'A reason is required for this action.';
            error.classList.remove('d-none');
            return;
        }
        button.disabled = true;
        try {
            await onConfirm(reason);
            bootstrap.Modal.getInstance(modalElement)?.hide();
            adminToast('Action completed and added to the audit log.');
        } catch (error) {
            const errorEl = document.getElementById('admin-action-error');
            errorEl.textContent = error?.message || 'Action failed.';
            errorEl.classList.remove('d-none');
        } finally { button.disabled = false; }
    };
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

// Overrides the original two-panel navigator while preserving its public API.
function showAdminPanel(name) {
    if (!ADMIN_PANELS.includes(name)) name = 'overview';
    document.querySelectorAll('.admin-view').forEach(panel => panel.classList.remove('active-admin-view'));
    document.getElementById(`admin-panel-${name}`)?.classList.add('active-admin-view');
    document.querySelectorAll('#admin-sidebar .sidebar-nav-item').forEach(item => {
        item.classList.remove('active'); item.removeAttribute('aria-current');
    });
    const nav = document.getElementById(`admin-nav-${name}`);
    nav?.classList.add('active'); nav?.setAttribute('aria-current', 'page');
    history.replaceState(null, '', `${location.pathname}#${name}`);
    closeAdminSidebar();
    const loaders = { overview:loadAdminOverview, shops:loadAdminShops, users:loadAdminUsers,
        orders:loadAdminOrders, moderation:loadAdminModeration,
        announcements:loadAdminAnnouncements, analytics:loadAdminAnalytics, audit:loadAdminAudit,
        system:loadAdminSystemSettings };
    loaders[name]?.();
}

async function loadAdminOverview() {
    adminLoading('admin-overview-stats');
    const { data, error } = await supabaseClient.rpc('get_admin_overview');
    if (error) return adminFailure('admin-overview-stats', error);
    const cards = [
        ['Users', data.users, 'All registered profiles'], ['Suspended', data.suspended_users, 'Restricted accounts'],
        ['Shops', data.shops, 'All shop applications'], ['Pending shops', data.pending_shops, 'Awaiting review'],
        ['Orders today', data.orders_today, 'Yangon calendar day'], ['Revenue today', adminMoney(data.revenue_today), 'Delivered orders'],
        ['Active orders', data.active_orders, 'Currently in progress'],
        ['Average rating', `${data.average_rating || 0} / 5`, 'Visible feedback']
    ];
    document.getElementById('admin-overview-stats').innerHTML = cards.map(([label,value,copy]) =>
        `<article><span>${label}</span><strong>${value}</strong><small>${copy}</small></article>`).join('');
    document.getElementById('admin-attention-list').innerHTML = [
        ['shops', data.pending_shops, 'Pending shop applications'],
        ['orders', data.active_orders, 'Orders currently active'], ['users', data.suspended_users, 'Suspended user accounts']
    ].map(([panel,count,label]) => `<button onclick="showAdminPanel('${panel}')"><strong>${count}</strong><span>${label}</span><b>Open →</b></button>`).join('');
}

async function setAdminUserSuspension(userId, suspended) {
    adminAction({ title: suspended ? 'Suspend user' : 'Restore user', required: suspended,
        copy: suspended ? 'The user will lose operational access. Their historical records stay intact.' : 'The user will regain platform access.',
        confirmText: suspended ? 'Suspend user' : 'Restore access',
        onConfirm: async reason => {
            const { data, error } = await supabaseClient.rpc('admin_set_user_suspension', { p_user_id:userId, p_suspended:suspended, p_reason:reason || null, p_until:null });
            if (error) throw error;
            const updatedUser = Array.isArray(data) ? data[0] : data;
            const index = adminUsers.findIndex(user => user.id === userId);
            if (index >= 0) {
                adminUsers[index] = {
                    ...adminUsers[index],
                    ...(updatedUser || {}),
                    account_status: suspended ? 'suspended' : 'active',
                    suspension_reason: suspended ? reason : null,
                    suspended_until: null
                };
                updateAdminUserStats();
                renderAdminUsers();
            }
            loadAdminUsers().catch(syncError => console.error('User list resync failed:', syncError));
        }});
}

function renderAdminUsers() {
    const query = (document.getElementById('admin-user-search')?.value || '').trim().toLowerCase();
    const rows = adminUsers.filter(user => (adminActiveUserRole === 'all' || user.role === adminActiveUserRole) &&
        [user.name,user.email,user.phone_number,user.shops?.[0]?.name].some(value => String(value || '').toLowerCase().includes(query)));
    const container = document.getElementById('admin-user-list');
    if (!rows.length) { container.innerHTML = adminEmpty('No matching users'); return; }
    container.innerHTML = rows.map(user => {
        const suspended = user.account_status === 'suspended';
        return `<article class="admin-user-card role-${adminEscape(user.role)} ${suspended ? 'admin-row-restricted' : ''}">
            <div class="admin-user-avatar">${adminEscape((user.name || '?')[0].toUpperCase())}</div><div class="admin-user-copy">
            <div class="admin-user-title"><strong>${adminEscape(user.name)}</strong><span>${adminEscape(user.role)}</span></div>
            <div>${adminEscape(user.email)}</div><div>${adminEscape(user.phone_number || 'No phone')}</div>
            <small>Joined ${adminDate(user.created_at)}</small>${suspended ? `<small class="text-danger">Suspended: ${adminEscape(user.suspension_reason || 'No reason')}</small>` : ''}
            <div class="admin-card-actions"><button class="btn btn-sm btn-outline-primary" onclick="openAdminUserProfile(${user.id})">View profile</button>${user.role !== 'admin' ? `<button class="btn btn-sm ${suspended ? 'btn-outline-success' : 'btn-outline-danger'}" onclick="setAdminUserSuspension(${user.id}, ${!suspended})">${suspended ? 'Restore access' : 'Suspend user'}</button>` : ''}</div></div></article>`;
    }).join('');
}

async function loadAdminUsers() {
    adminLoading('admin-user-list');
    const { data, error } = await supabaseClient.from('users').select('id,name,email,phone_number,role,avatar_path,created_at,account_status,suspension_reason,suspended_until,shops!shops_owner_id_fkey(id,name,status)').order('created_at',{ascending:false});
    if (error) return adminFailure('admin-user-list', error);
    adminUsers = data || []; updateAdminUserStats(); renderAdminUsers();
}

async function adminShopControl(shopId, status = null, forceClosed = null) {
    const needsReason = ['rejected','suspended'].includes(status) || forceClosed === true;
    adminAction({ title: forceClosed === true ? 'Force close shop' : forceClosed === false ? 'Remove forced closure' : `Set shop to ${status}`,
        copy:'This change overrides shop availability and will be audited.', required:needsReason,
        onConfirm:async reason => { const { data,error } = await supabaseClient.rpc('admin_control_shop',{p_shop_id:shopId,p_status:status,p_force_closed:forceClosed,p_reason:reason||null}); if(error) throw error;const updated=Array.isArray(data)?data[0]:data;const index=adminShops.findIndex(shop=>shop.id===shopId);if(index>=0){adminShops[index]={...adminShops[index],...(updated||{}),status:status||adminShops[index].status,admin_force_closed:forceClosed===null?adminShops[index].admin_force_closed:forceClosed,admin_close_reason:forceClosed===true?reason:forceClosed===false?null:adminShops[index].admin_close_reason};updateAdminStats();renderAdminShops();}loadAdminShops().catch(syncError=>console.error('Shop list resync failed:',syncError)); }});
}

function adminShopActions(shop){const primary=shop.status==='suspended'?`<button class="btn btn-success btn-sm" onclick="adminShopControl(${shop.id},'approved',null)">Restore</button>`:['pending','rejected'].includes(shop.status)?`<button class="btn btn-success btn-sm" onclick="adminShopControl(${shop.id},'approved',null)">Approve</button>`:'';const menu=[];if(shop.status==='pending')menu.push(`<button class="dropdown-item text-danger" onclick="adminShopControl(${shop.id},'rejected',null)">Reject application</button>`);if(shop.status==='approved')menu.push(`<button class="dropdown-item text-danger" onclick="adminShopControl(${shop.id},'suspended',null)">Suspend shop</button>`);if(shop.status==='approved'||shop.admin_force_closed)menu.push(`<button class="dropdown-item ${shop.admin_force_closed?'text-success':'text-danger'}" onclick="adminShopControl(${shop.id},null,${!shop.admin_force_closed})">${shop.admin_force_closed?'Remove force closure':'Force close ordering'}</button>`);return`<button class="btn btn-outline-primary btn-sm" onclick="openAdminShopProfile(${shop.id})">View profile</button>${primary}${menu.length?`<div class="dropdown admin-shop-more"><button class="btn btn-light btn-sm dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">More</button><div class="dropdown-menu dropdown-menu-end">${menu.join('')}</div></div>`:''}`;}

function renderAdminShops() {
    const search = (document.getElementById('admin-shop-search')?.value || '').trim().toLowerCase();
    const rows = adminShops.filter(shop => (adminActiveFilter==='all'||shop.status===adminActiveFilter) && [shop.name,shop.users?.name,shop.address].some(v=>String(v||'').toLowerCase().includes(search)));
    const container = document.getElementById('admin-shop-list');
    if (!rows.length) { container.innerHTML=adminEmpty('No matching shops'); return; }
    container.innerHTML=rows.map(shop=>`<article class="admin-shop-card status-${adminEscape(shop.status)}"><div class="admin-shop-card-head"><div class="admin-shop-avatar">${adminEscape((shop.name||'?')[0])}</div><div><h2>${adminEscape(shop.name)}</h2><p>${adminEscape(shop.address||'No address')}</p></div><span class="admin-status-badge">${adminEscape(shop.status)}</span></div><p class="admin-shop-description">${adminEscape(shop.description||'No description')}</p><div class="admin-owner-grid"><div><span>Owner</span><strong>${adminEscape(shop.users?.name||'—')}</strong></div><div><span>Orders</span><strong>${shop.orders?.[0]?.count || 0}</strong></div></div>${shop.admin_force_closed?`<div class="admin-reason-note">Admin closed: ${adminEscape(shop.admin_close_reason||'—')}</div>`:''}<div class="admin-card-actions admin-shop-card-actions">${adminShopActions(shop)}</div></article>`).join('');
}

async function loadAdminShops() {
    adminLoading('admin-shop-list');
    const { data,error }=await supabaseClient.from('shops').select('*,users!shops_owner_id_fkey(id,name,email,phone_number),orders(count)').order('created_at',{ascending:false});
    if(error) return adminFailure('admin-shop-list',error); adminShops=data||[]; updateAdminStats(); renderAdminShops();
}

function openAdminEntityModal(type,title){document.getElementById('admin-entity-profile-type').textContent=type;document.getElementById('admin-entity-profile-title').textContent=title;document.getElementById('admin-entity-profile-body').innerHTML='<div class="hist-loading"><div class="hist-spinner"></div><span>Loading profile…</span></div>';bootstrap.Modal.getOrCreateInstance(document.getElementById('adminEntityProfileModal')).show();}
function adminProfileField(label,value){return`<div class="admin-profile-field"><span>${adminEscape(label)}</span><strong>${adminEscape(value??'—')}</strong></div>`;}
function adminRecentOrders(orders){return(orders||[]).length?`<div class="admin-profile-mini-list">${orders.map(order=>`<article><div><strong>Order #${order.id}</strong><span>${adminEscape(order.customer_name||'Customer')} · ${adminDate(order.created_at)}</span></div><div><strong>${adminMoney(order.total_amount)}</strong><span>${adminEscape(order.status)}</span></div></article>`).join('')}</div>`:'<div class="admin-empty"><strong>No orders yet</strong></div>';}

async function openAdminUserProfile(userId){openAdminEntityModal('App user','Loading…');const [{data:user,error},{data:shops},{data:orders}]=await Promise.all([supabaseClient.from('users').select('id,name,email,phone_number,role,avatar_path,account_status,suspension_reason,suspended_until,created_at').eq('id',userId).single(),supabaseClient.from('shops').select('id,name,status,address,admin_force_closed').eq('owner_id',userId),supabaseClient.from('orders').select('id,customer_name,total_amount,status,created_at,shops(name)').eq('customer_id',userId).order('created_at',{ascending:false}).limit(8)]);if(error)return adminFailure('admin-entity-profile-body',error);document.getElementById('admin-entity-profile-title').textContent=user.name||'User profile';const userShops=shops||[],userOrders=orders||[],totalSpent=userOrders.filter(order=>order.status==='delivered').reduce((sum,order)=>sum+Number(order.total_amount||0),0);document.getElementById('admin-entity-profile-body').innerHTML=`<div class="admin-entity-profile"><div class="admin-entity-hero"><div class="admin-entity-avatar">${adminEscape((user.name||'?')[0].toUpperCase())}</div><div><h3>${adminEscape(user.name||'Unnamed user')}</h3><p>${adminEscape(user.email||'—')}</p><div class="admin-entity-badges"><span>${adminEscape(user.role)}</span><span>${adminEscape(user.account_status||'active')}</span></div></div></div><div class="admin-profile-grid">${adminProfileField('Phone',user.phone_number||'Not provided')}${adminProfileField('Joined',adminDate(user.created_at))}${adminProfileField('Profile ID',user.id)}${adminProfileField('Delivered spend',adminMoney(totalSpent))}${user.account_status==='suspended'?adminProfileField('Suspension reason',user.suspension_reason||'—'):''}</div>${userShops.length?`<section class="admin-profile-section"><h4>Owned shop</h4><div class="admin-profile-mini-list">${userShops.map(shop=>`<article><div><strong>${adminEscape(shop.name)}</strong><span>${adminEscape(shop.address||'No address')}</span></div><div><strong>${adminEscape(shop.status)}</strong><span>${shop.admin_force_closed?'Admin closed':'Normal control'}</span></div></article>`).join('')}</div></section>`:''}<section class="admin-profile-section"><h4>Recent customer orders</h4>${adminRecentOrders(userOrders)}</section></div>`;}

async function openAdminShopProfile(shopId){openAdminEntityModal('Shop profile','Loading…');const [{data:shop,error},{data:menu},{data:orders}]=await Promise.all([supabaseClient.from('shops').select('id,owner_id,name,slug,description,address,phone_number,status,rejection_reason,is_open,accepting_orders,opening_time,closing_time,preparation_minutes,admin_force_closed,admin_close_reason,created_at,updated_at').eq('id',shopId).single(),supabaseClient.from('menu_items').select('id,name,price,is_available,is_hidden_by_admin').eq('shop_id',shopId).order('created_at',{ascending:false}),supabaseClient.from('orders').select('id,customer_name,total_amount,status,created_at').eq('shop_id',shopId).order('created_at',{ascending:false}).limit(10)]);if(error)return adminFailure('admin-entity-profile-body',error);const{data:owner}=shop.owner_id?await supabaseClient.from('users').select('id,name,email,phone_number,account_status').eq('id',shop.owner_id).maybeSingle():{data:null};document.getElementById('admin-entity-profile-title').textContent=shop.name||'Shop profile';const items=menu||[],recentOrders=orders||[],revenue=recentOrders.filter(order=>order.status==='delivered').reduce((sum,order)=>sum+Number(order.total_amount||0),0);document.getElementById('admin-entity-profile-body').innerHTML=`<div class="admin-entity-profile"><div class="admin-entity-hero"><div class="admin-entity-avatar">${adminEscape((shop.name||'?')[0].toUpperCase())}</div><div><h3>${adminEscape(shop.name)}</h3><p>${adminEscape(shop.description||'No description')}</p><div class="admin-entity-badges"><span>${adminEscape(shop.status)}</span><span>${shop.admin_force_closed?'Admin force-closed':shop.is_open?'Open':'Owner closed'}</span></div></div></div><div class="admin-profile-grid">${adminProfileField('Owner',owner?.name||'Unassigned')}${adminProfileField('Owner account',owner?.account_status||'—')}${adminProfileField('Email',owner?.email||'—')}${adminProfileField('Phone',shop.phone_number||owner?.phone_number||'—')}${adminProfileField('Address',shop.address||'—')}${adminProfileField('Opening hours',`${shop.opening_time||'—'} – ${shop.closing_time||'—'}`)}${adminProfileField('Preparation',`${shop.preparation_minutes||15} minutes`)}${adminProfileField('Menu items',`${items.length} total · ${items.filter(item=>item.is_available&&!item.is_hidden_by_admin).length} available`)}${adminProfileField('Recent delivered revenue',adminMoney(revenue))}${adminProfileField('Created',adminDate(shop.created_at))}${shop.rejection_reason?adminProfileField('Restriction reason',shop.rejection_reason):''}${shop.admin_close_reason?adminProfileField('Admin close reason',shop.admin_close_reason):''}</div><section class="admin-profile-section"><h4>Menu snapshot</h4><div class="admin-profile-mini-list">${items.slice(0,8).map(item=>`<article><div><strong>${adminEscape(item.name)}</strong><span>${item.is_hidden_by_admin?'Hidden by admin':item.is_available?'Available':'Unavailable'}</span></div><strong>${adminMoney(item.price)}</strong></article>`).join('')||'<span>No menu items</span>'}</div></section><section class="admin-profile-section"><h4>Recent orders</h4>${adminRecentOrders(recentOrders)}</section></div>`;}

async function loadAdminOrders() {
    adminLoading('admin-order-list');
    const {data,error}=await supabaseClient.from('orders').select('id,customer_id,customer_name,delivery_note,total_amount,status,created_at,cancellation_reason,shops(name),order_items(quantity,price,menu_items(name)),payments(id,payment_method,review_status)').order('created_at',{ascending:false}).limit(300);
    if(error) return adminFailure('admin-order-list',error);
    adminOrders=data||[];
    const customerIds=[...new Set(adminOrders.map(order=>order.customer_id).filter(Boolean))];
    if(customerIds.length){
        const {data:customers,error:customerError}=await supabaseClient.from('users').select('id,name,email,phone_number').in('id',customerIds);
        if(customerError) return adminFailure('admin-order-list',customerError);
        const customerMap=new Map((customers||[]).map(customer=>[customer.id,customer]));
        adminOrders.forEach(order=>{order.customer_profile=customerMap.get(order.customer_id)||null;});
    }
    renderAdminOrders();
}

function renderAdminOrders(){const q=(document.getElementById('admin-order-search')?.value||'').toLowerCase(), status=document.getElementById('admin-order-status')?.value||'all';const rows=adminOrders.filter(o=>(status==='all'||o.status===status)&&[o.id,o.customer_name,o.shops?.name,o.customer_profile?.name,o.customer_profile?.email].some(v=>String(v||'').toLowerCase().includes(q)));const el=document.getElementById('admin-order-list');if(!rows.length){el.innerHTML=adminEmpty('No matching orders');return;}el.innerHTML=rows.map(o=>`<details class="admin-data-card"><summary><div><strong>Order #${o.id}</strong><span>${adminEscape(o.shops?.name||'Unknown shop')} · ${adminEscape(o.customer_name||o.customer_profile?.name||'Customer')}</span></div><div><b>${adminMoney(o.total_amount)}</b><span class="admin-status-badge">${adminEscape(o.status)}</span></div></summary><div class="admin-detail-body"><p>${(o.order_items||[]).map(i=>`${adminEscape(i.menu_items?.name||'Item')} ×${i.quantity}`).join(', ')||'No line items'}</p><p><strong>Customer:</strong> ${adminEscape(o.customer_profile?.email||'—')} · ${adminEscape(o.customer_profile?.phone_number||'—')}</p><p><strong>Note:</strong> ${adminEscape(o.delivery_note||'—')}</p><p><strong>Created:</strong> ${adminDate(o.created_at)}</p>${o.cancellation_reason?`<p class="text-danger"><strong>Cancelled:</strong> ${adminEscape(o.cancellation_reason)}</p>`:''}${!['delivered','cancelled'].includes(o.status)?`<button class="btn btn-danger btn-sm" onclick="cancelAdminOrder(${o.id})">Cancel order</button>`:''}</div></details>`).join('');}

function cancelAdminOrder(orderId){adminAction({title:`Cancel order #${orderId}`,copy:'Completed orders cannot be cancelled. The customer and shop history will retain this order.',required:true,confirmText:'Cancel order',onConfirm:async reason=>{const{error}=await supabaseClient.rpc('admin_cancel_order',{p_order_id:orderId,p_reason:reason});if(error)throw error;await loadAdminOrders();}});}

function setAdminSelectOptions(id,items,placeholder){const select=document.getElementById(id);if(!select)return;const previous=select.value;select.innerHTML=`<option value="all">${adminEscape(placeholder)}</option>`+items.map(item=>`<option value="${adminEscape(item.value)}">${adminEscape(item.label)}</option>`).join('');select.value=[...select.options].some(option=>option.value===previous)?previous:'all';}
function syncModerationFilters(){const menu=adminModerationMode==='menu',rows=menu?adminMenuItems:adminFeedback;const shops=[...new Map(rows.filter(row=>row.shop_id).map(row=>[String(row.shop_id),{value:String(row.shop_id),label:row.shops?.name||`Shop #${row.shop_id}`}])).values()].sort((a,b)=>a.label.localeCompare(b.label));setAdminSelectOptions('admin-moderation-shop',shops,'All shops');const customers=menu?[]:[...new Map(rows.filter(row=>row.customer_id).map(row=>[String(row.customer_id),{value:String(row.customer_id),label:row.users?.name||`Customer #${row.customer_id}`}])).values()].sort((a,b)=>a.label.localeCompare(b.label));setAdminSelectOptions('admin-moderation-customer',customers,'All customers');document.getElementById('admin-moderation-customer').classList.toggle('d-none',menu);}
async function loadAdminModeration(){adminLoading('admin-moderation-list');if(adminModerationMode==='menu'){const{data,error}=await supabaseClient.from('menu_items').select('id,shop_id,name,description,price,is_available,is_hidden_by_admin,moderation_reason,shops(name)').order('created_at',{ascending:false});if(error)return adminFailure('admin-moderation-list',error);adminMenuItems=data||[];}else{const{data,error}=await supabaseClient.from('order_feedback').select('id,shop_id,customer_id,rating,comment,created_at,moderation_status,moderation_reason,shops(name),users(name)').order('created_at',{ascending:false});if(error)return adminFailure('admin-moderation-list',error);adminFeedback=data||[];}syncModerationFilters();renderAdminModeration();}
function renderAdminModeration(){const q=(document.getElementById('admin-moderation-search')?.value||'').toLowerCase(),shop=document.getElementById('admin-moderation-shop')?.value||'all',customer=document.getElementById('admin-moderation-customer')?.value||'all',state=document.getElementById('admin-moderation-state')?.value||'all',menu=adminModerationMode==='menu';const rows=(menu?adminMenuItems:adminFeedback).filter(x=>{const hidden=menu?x.is_hidden_by_admin:x.moderation_status==='hidden';return(shop==='all'||String(x.shop_id)===shop)&&(menu||customer==='all'||String(x.customer_id)===customer)&&(state==='all'||(state==='hidden')===hidden)&&[x.name,x.description,x.comment,x.shops?.name,x.users?.name].some(v=>String(v||'').toLowerCase().includes(q));});const el=document.getElementById('admin-moderation-list');if(!rows.length){el.innerHTML=adminEmpty('No matching content');return;}const groups=new Map();rows.forEach(row=>{const key=String(row.shop_id||'unknown');if(!groups.has(key))groups.set(key,{name:row.shops?.name||'Unknown shop',rows:[]});groups.get(key).rows.push(row);});el.innerHTML=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(group=>`<div class="admin-group-heading"><strong>🏪 ${adminEscape(group.name)}</strong><span>${group.rows.length} ${menu?'menu items':'feedback entries'}</span></div>${group.rows.map(x=>{const hidden=menu?x.is_hidden_by_admin:x.moderation_status==='hidden';return`<article class="admin-data-card ${hidden?'admin-row-restricted':''}"><div><strong>${menu?adminEscape(x.name):`${'★'.repeat(x.rating)} ${adminEscape(x.users?.name||'Customer')}`}</strong><span>${menu?adminMoney(x.price):`Customer #${x.customer_id}`}</span><p>${adminEscape(menu?(x.description||'No description'):(x.comment||'No comment'))}</p></div><button class="btn btn-sm ${hidden?'btn-outline-success':'btn-outline-danger'}" onclick="moderateAdminContent('${menu?'menu_item':'feedback'}',${x.id},${!hidden})">${hidden?'Restore':'Hide'}</button>${x.moderation_reason?`<small class="text-danger">${adminEscape(x.moderation_reason)}</small>`:''}</article>`}).join('')}`).join('');}
function moderateAdminContent(type,id,hidden){adminAction({title:hidden?'Hide content':'Restore content',copy:'Hidden content remains in historical records.',required:hidden,onConfirm:async reason=>{const{error}=await supabaseClient.rpc('admin_moderate_content',{p_entity_type:type,p_entity_id:id,p_hidden:hidden,p_reason:reason||null});if(error)throw error;await loadAdminModeration();}});}

async function loadAdminAnnouncements(){adminLoading('admin-announcement-list');const{data,error}=await supabaseClient.from('announcements').select('id,title,message,audience,is_active,starts_at,ends_at,created_at,created_by').order('created_at',{ascending:false});if(error)return adminFailure('admin-announcement-list',error);document.getElementById('admin-announcement-list').innerHTML=(data||[]).map(a=>`<article class="admin-data-card"><div><strong>${adminEscape(a.title)}</strong><span>${adminEscape(a.audience)} · ${adminDate(a.created_at)}</span><p>${adminEscape(a.message)}</p></div><div class="admin-announcement-actions"><span class="admin-status-badge">${a.is_active?'Active':'Inactive'}</span><button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteAdminAnnouncement(${a.id})">Delete</button></div></article>`).join('')||adminEmpty('No announcements yet');}
async function submitAdminAnnouncement(event){event.preventDefault();const title=document.getElementById('announcement-title').value.trim(),message=document.getElementById('announcement-message').value.trim(),ends=document.getElementById('announcement-ends').value,endsAt=ends?new Date(ends):null;if(!title||!message){adminToast('Title and message are required.','danger');return;}if(endsAt&&(Number.isNaN(endsAt.getTime())||endsAt.getTime()<=Date.now()+60000)){adminToast('End time must be at least one minute in the future.','danger');return;}const args={p_title:title,p_message:message,p_audience:document.getElementById('announcement-audience').value,p_target_user_id:null,p_target_shop_id:null,p_ends_at:endsAt?endsAt.toISOString():null};const{error}=await supabaseClient.rpc('admin_create_announcement',args);if(error)return adminToast(error.message,'danger');event.target.reset();setAnnouncementMinimumEndTime();adminToast('Announcement published.');await loadAdminAnnouncements();}
function deleteAdminAnnouncement(id){adminAction({title:'Delete announcement',copy:'Delete this announcement permanently? Its read receipts will also be removed.',required:true,confirmText:'Delete announcement',onConfirm:async reason=>{const{error}=await supabaseClient.rpc('admin_delete_announcement',{p_announcement_id:id,p_reason:reason});if(error)throw error;await loadAdminAnnouncements();}});}
function setAnnouncementMinimumEndTime(){const input=document.getElementById('announcement-ends');if(!input)return;const minimum=new Date(Date.now()+60000);minimum.setMinutes(minimum.getMinutes()-minimum.getTimezoneOffset());input.min=minimum.toISOString().slice(0,16);}

async function loadAdminSystemSettings(){adminLoading('admin-system-settings');const{data,error}=await supabaseClient.from('system_settings').select('*').order('key');if(error)return adminFailure('admin-system-settings',error);document.getElementById('admin-system-settings').innerHTML=(data||[]).map(setting=>{const boolean=typeof setting.value==='boolean';return`<article class="admin-setting-card"><div><strong>${adminEscape(setting.key.replaceAll('_',' '))}</strong><span>${adminEscape(setting.description||'')}</span></div>${boolean?`<button class="form-check form-switch admin-switch"><input class="form-check-input" type="checkbox" ${setting.value?'checked':''} onchange="updateAdminSetting('${adminEscape(setting.key)}',this.checked)"></button>`:`<div class="input-group"><input class="form-control" id="setting-${adminEscape(setting.key)}" type="number" value="${Number(setting.value)}"><button class="btn btn-primary" onclick="updateAdminSetting('${adminEscape(setting.key)}',Number(document.getElementById('setting-${adminEscape(setting.key)}').value))">Save</button></div>`}</article>`}).join('');}
async function updateAdminSetting(key,value){const{error}=await supabaseClient.rpc('admin_update_setting',{p_key:key,p_value:value});if(error){adminToast(error.message,'danger');await loadAdminSystemSettings();return;}adminToast('System setting updated.');await loadAdminSystemSettings();}

async function loadAdminAudit(){adminLoading('admin-audit-list');const{data,error}=await supabaseClient.from('admin_audit_logs').select('id,admin_profile_id,action,entity_type,entity_id,old_values,new_values,reason,created_at').order('created_at',{ascending:false}).limit(500);if(error)return adminFailure('admin-audit-list',error);adminAuditLogs=data||[];const adminIds=[...new Set(adminAuditLogs.map(row=>row.admin_profile_id).filter(Boolean))];if(adminIds.length){const{data:admins}=await supabaseClient.from('users').select('id,name,email').in('id',adminIds);const adminMap=new Map((admins||[]).map(admin=>[admin.id,admin]));adminAuditLogs.forEach(row=>{row.admin_profile=adminMap.get(row.admin_profile_id)||null;});}setAdminSelectOptions('admin-audit-action',[...new Set(adminAuditLogs.map(row=>row.action))].sort().map(value=>({value,label:value.replaceAll('_',' ')})),'All actions');setAdminSelectOptions('admin-audit-entity',[...new Set(adminAuditLogs.map(row=>row.entity_type))].sort().map(value=>({value,label:value.replaceAll('_',' ')})),'All entity types');setAdminSelectOptions('admin-audit-admin',[...new Map(adminAuditLogs.map(row=>[String(row.admin_profile_id),{value:String(row.admin_profile_id),label:row.admin_profile?.name||`Admin #${row.admin_profile_id}`}])).values()],'All admins');renderAdminAudit();}
function adminAuditChanges(entry){const oldValue=entry.old_values||{},newValue=entry.new_values||{};const ignored=new Set(['updated_at','approved_at','reviewed_at']);return Object.keys(newValue).filter(key=>!ignored.has(key)&&JSON.stringify(oldValue[key])!==JSON.stringify(newValue[key])).slice(0,8).map(key=>`<span><b>${adminEscape(key.replaceAll('_',' '))}</b>: ${adminEscape(oldValue[key]??'—')} → ${adminEscape(newValue[key]??'—')}</span>`).join('');}
function renderAdminAudit(){const q=(document.getElementById('admin-audit-search')?.value||'').toLowerCase(),action=document.getElementById('admin-audit-action')?.value||'all',entity=document.getElementById('admin-audit-entity')?.value||'all',admin=document.getElementById('admin-audit-admin')?.value||'all',rows=adminAuditLogs.filter(x=>(action==='all'||x.action===action)&&(entity==='all'||x.entity_type===entity)&&(admin==='all'||String(x.admin_profile_id)===admin)&&[x.action,x.entity_type,x.entity_id,x.reason,x.admin_profile?.name,x.admin_profile?.email].some(v=>String(v||'').toLowerCase().includes(q)));const target=document.getElementById('admin-audit-list');if(!rows.length){target.innerHTML=adminEmpty('No matching audit events');return;}const groups=new Map();rows.forEach(row=>{if(!groups.has(row.entity_type))groups.set(row.entity_type,[]);groups.get(row.entity_type).push(row);});target.innerHTML=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([type,entries])=>`<div class="admin-group-heading"><strong>${adminEscape(type.replaceAll('_',' '))}</strong><span>${entries.length} events</span></div>${entries.map(x=>`<details class="admin-data-card admin-audit-card"><summary><div><strong>${adminEscape(x.action.replaceAll('_',' '))}</strong><span>#${adminEscape(x.entity_id||'—')} · ${adminDate(x.created_at)}</span></div><small>${adminEscape(x.admin_profile?.name||'Admin')}</small></summary><div class="admin-detail-body"><p><strong>Reason:</strong> ${adminEscape(x.reason||'No reason supplied')}</p><div class="admin-audit-changes">${adminAuditChanges(x)||'<span>No field-level change data</span>'}</div></div></details>`).join('')}`).join('');}

async function loadAdminAnalytics(){adminLoading('admin-analytics-stats');const [{data:orders,error},{data:shops}]=await Promise.all([supabaseClient.from('orders').select('id,shop_id,total_amount,status,created_at,shops(name)').order('created_at',{ascending:false}).limit(2000),supabaseClient.from('shops').select('id,name,status')]);if(error)return adminFailure('admin-analytics-stats',error);const delivered=(orders||[]).filter(o=>o.status==='delivered'),revenue=delivered.reduce((s,o)=>s+Number(o.total_amount||0),0),cancelled=(orders||[]).filter(o=>o.status==='cancelled').length;document.getElementById('admin-analytics-stats').innerHTML=[['Orders',orders?.length||0],['Delivered revenue',adminMoney(revenue)],['Average order',adminMoney(delivered.length?revenue/delivered.length:0)],['Cancellation rate',`${orders?.length?((cancelled/orders.length)*100).toFixed(1):0}%`],['Active shops',(shops||[]).filter(s=>s.status==='approved').length]].map(([l,v])=>`<article><span>${l}</span><strong>${v}</strong></article>`).join('');const totals={};(orders||[]).forEach(o=>{const n=o.shops?.name||'Unknown';totals[n]=(totals[n]||0)+(o.status==='delivered'?Number(o.total_amount):0)});const max=Math.max(1,...Object.values(totals));document.getElementById('admin-analytics-content').innerHTML=`<div class="admin-section-head"><div><h2>Revenue by shop</h2><p>Delivered orders in the latest ${orders?.length||0} records.</p></div></div><div class="admin-bars">${Object.entries(totals).sort((a,b)=>b[1]-a[1]).map(([name,value])=>`<div><span>${adminEscape(name)}</span><div><i style="width:${value/max*100}%"></i></div><strong>${adminMoney(value)}</strong></div>`).join('')}</div>`;}

document.addEventListener('DOMContentLoaded',()=>{
    setAnnouncementMinimumEndTime();
    document.getElementById('admin-announcement-form')?.addEventListener('submit',submitAdminAnnouncement);
    document.getElementById('admin-order-search')?.addEventListener('input',renderAdminOrders);
    document.getElementById('admin-order-status')?.addEventListener('change',renderAdminOrders);
    document.getElementById('admin-moderation-search')?.addEventListener('input',renderAdminModeration);
    document.getElementById('admin-moderation-shop')?.addEventListener('change',renderAdminModeration);
    document.getElementById('admin-moderation-customer')?.addEventListener('change',renderAdminModeration);
    document.getElementById('admin-moderation-state')?.addEventListener('change',renderAdminModeration);
    document.getElementById('admin-audit-search')?.addEventListener('input',renderAdminAudit);
    document.getElementById('admin-audit-action')?.addEventListener('change',renderAdminAudit);
    document.getElementById('admin-audit-entity')?.addEventListener('change',renderAdminAudit);
    document.getElementById('admin-audit-admin')?.addEventListener('change',renderAdminAudit);
    document.querySelectorAll('[data-moderation]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-moderation]').forEach(b=>b.classList.remove('active'));button.classList.add('active');adminModerationMode=button.dataset.moderation;loadAdminModeration();}));
    setTimeout(()=>showAdminPanel(ADMIN_PANELS.includes(location.hash.slice(1))?location.hash.slice(1):'overview'),0);
});
