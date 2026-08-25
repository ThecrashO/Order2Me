// Order2Me Admin Control Center additions. Sensitive writes use audited RPCs.
const ADMIN_PANELS = ['overview','shops','users','orders','payments','moderation','announcements','analytics','audit','system'];
let adminOrders = [], adminPayments = [], adminMenuItems = [], adminFeedback = [], adminAuditLogs = [];
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
        orders:loadAdminOrders, payments:loadAdminPayments, moderation:loadAdminModeration,
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
        ['Active orders', data.active_orders, 'Currently in progress'], ['Pending payments', data.pending_payments, 'Need review'],
        ['Average rating', `${data.average_rating || 0} / 5`, 'Visible feedback']
    ];
    document.getElementById('admin-overview-stats').innerHTML = cards.map(([label,value,copy]) =>
        `<article><span>${label}</span><strong>${value}</strong><small>${copy}</small></article>`).join('');
    document.getElementById('admin-attention-list').innerHTML = [
        ['shops', data.pending_shops, 'Pending shop applications'], ['payments', data.pending_payments, 'Payments awaiting review'],
        ['orders', data.active_orders, 'Orders currently active'], ['users', data.suspended_users, 'Suspended user accounts']
    ].map(([panel,count,label]) => `<button onclick="showAdminPanel('${panel}')"><strong>${count}</strong><span>${label}</span><b>Open →</b></button>`).join('');
}

async function setAdminUserSuspension(userId, suspended) {
    adminAction({ title: suspended ? 'Suspend user' : 'Restore user', required: suspended,
        copy: suspended ? 'The user will lose operational access. Their historical records stay intact.' : 'The user will regain platform access.',
        confirmText: suspended ? 'Suspend user' : 'Restore access',
        onConfirm: async reason => {
            const { error } = await supabaseClient.rpc('admin_set_user_suspension', { p_user_id:userId, p_suspended:suspended, p_reason:reason || null, p_until:null });
            if (error) throw error; await loadAdminUsers();
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
            ${user.role !== 'admin' ? `<button class="btn btn-sm ${suspended ? 'btn-outline-success' : 'btn-outline-danger'} mt-2" onclick="setAdminUserSuspension(${user.id}, ${!suspended})">${suspended ? 'Restore access' : 'Suspend user'}</button>` : ''}</div></article>`;
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
        onConfirm:async reason => { const { error } = await supabaseClient.rpc('admin_control_shop',{p_shop_id:shopId,p_status:status,p_force_closed:forceClosed,p_reason:reason||null}); if(error) throw error; await loadAdminShops(); }});
}

function renderAdminShops() {
    const search = (document.getElementById('admin-shop-search')?.value || '').trim().toLowerCase();
    const rows = adminShops.filter(shop => (adminActiveFilter==='all'||shop.status===adminActiveFilter) && [shop.name,shop.users?.name,shop.address].some(v=>String(v||'').toLowerCase().includes(search)));
    const container = document.getElementById('admin-shop-list');
    if (!rows.length) { container.innerHTML=adminEmpty('No matching shops'); return; }
    container.innerHTML=rows.map(shop=>`<article class="admin-shop-card status-${adminEscape(shop.status)}"><div class="admin-shop-card-head"><div class="admin-shop-avatar">${adminEscape((shop.name||'?')[0])}</div><div><h2>${adminEscape(shop.name)}</h2><p>${adminEscape(shop.address||'No address')}</p></div><span class="admin-status-badge">${adminEscape(shop.status)}</span></div><p class="admin-shop-description">${adminEscape(shop.description||'No description')}</p><div class="admin-owner-grid"><div><span>Owner</span><strong>${adminEscape(shop.users?.name||'—')}</strong></div><div><span>Orders</span><strong>${shop.orders?.[0]?.count || 0}</strong></div></div>${shop.admin_force_closed?`<div class="admin-reason-note">Admin closed: ${adminEscape(shop.admin_close_reason||'—')}</div>`:''}<div class="admin-card-actions">${shop.status!=='approved'?`<button class="btn btn-success btn-sm" onclick="adminShopControl(${shop.id},'approved',null)">Approve</button>`:''}<button class="btn btn-outline-danger btn-sm" onclick="adminShopControl(${shop.id},'suspended',null)">Suspend</button><button class="btn ${shop.admin_force_closed?'btn-outline-success':'btn-danger'} btn-sm" onclick="adminShopControl(${shop.id},null,${!shop.admin_force_closed})">${shop.admin_force_closed?'Reopen override':'Force close'}</button></div></article>`).join('');
}

async function loadAdminShops() {
    adminLoading('admin-shop-list');
    const { data,error }=await supabaseClient.from('shops').select('*,users!shops_owner_id_fkey(id,name,email,phone_number),orders(count)').order('created_at',{ascending:false});
    if(error) return adminFailure('admin-shop-list',error); adminShops=data||[]; updateAdminStats(); renderAdminShops();
}

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

async function loadAdminPayments(){adminLoading('admin-payment-list');const{data,error}=await supabaseClient.from('payments').select('id,order_id,payment_method,screenshot_url,screenshot_path,created_at,review_status,review_reason,orders(total_amount,customer_name,shops(name))').order('created_at',{ascending:false}).limit(300);if(error)return adminFailure('admin-payment-list',error);adminPayments=data||[];await Promise.all(adminPayments.map(async payment=>{payment.proof_url=payment.screenshot_url||null;if(payment.screenshot_path){const{data:signed}=await supabaseClient.storage.from('payment-screenshots').createSignedUrl(payment.screenshot_path,300);if(signed?.signedUrl)payment.proof_url=signed.signedUrl;}}));renderAdminPayments();}
function renderAdminPayments(){const q=(document.getElementById('admin-payment-search')?.value||'').toLowerCase(),status=document.getElementById('admin-payment-status')?.value||'all';const rows=adminPayments.filter(p=>(status==='all'||p.review_status===status)&&[p.order_id,p.payment_method,p.orders?.shops?.name,p.orders?.customer_name].some(v=>String(v||'').toLowerCase().includes(q)));const el=document.getElementById('admin-payment-list');if(!rows.length){el.innerHTML=adminEmpty('No matching payments');return;}el.innerHTML=rows.map(p=>`<article class="admin-data-card admin-payment-card"><div><strong>Order #${p.order_id} · ${adminEscape(p.payment_method)}</strong><span>${adminEscape(p.orders?.shops?.name||'—')} · ${adminMoney(p.orders?.total_amount)}</span></div><span class="admin-status-badge">${adminEscape(p.review_status)}</span><div class="admin-card-actions">${p.proof_url?`<a class="btn btn-outline-primary btn-sm" target="_blank" rel="noopener" href="${adminEscape(p.proof_url)}">View proof</a>`:''}<button class="btn btn-success btn-sm" onclick="reviewAdminPayment(${p.id},'verified')">Verify</button><button class="btn btn-danger btn-sm" onclick="reviewAdminPayment(${p.id},'rejected')">Reject</button></div>${p.review_reason?`<small class="text-danger">${adminEscape(p.review_reason)}</small>`:''}</article>`).join('');}
function reviewAdminPayment(id,status){adminAction({title:`${status==='verified'?'Verify':'Reject'} payment`,copy:'This is a manual evidence review, not confirmation from the payment provider.',required:status==='rejected',onConfirm:async reason=>{const{error}=await supabaseClient.rpc('admin_review_payment',{p_payment_id:id,p_status:status,p_reason:reason||null});if(error)throw error;await loadAdminPayments();}});}

async function loadAdminModeration(){adminLoading('admin-moderation-list');if(adminModerationMode==='menu'){const{data,error}=await supabaseClient.from('menu_items').select('id,name,description,price,is_available,is_hidden_by_admin,moderation_reason,shops(name)').order('created_at',{ascending:false});if(error)return adminFailure('admin-moderation-list',error);adminMenuItems=data||[];}else{const{data,error}=await supabaseClient.from('order_feedback').select('id,rating,comment,created_at,moderation_status,moderation_reason,shops(name),users(name)').order('created_at',{ascending:false});if(error)return adminFailure('admin-moderation-list',error);adminFeedback=data||[];}renderAdminModeration();}
function renderAdminModeration(){const q=(document.getElementById('admin-moderation-search')?.value||'').toLowerCase(),menu=adminModerationMode==='menu',rows=(menu?adminMenuItems:adminFeedback).filter(x=>[x.name,x.description,x.comment,x.shops?.name,x.users?.name].some(v=>String(v||'').toLowerCase().includes(q)));const el=document.getElementById('admin-moderation-list');if(!rows.length){el.innerHTML=adminEmpty('No matching content');return;}el.innerHTML=rows.map(x=>{const hidden=menu?x.is_hidden_by_admin:x.moderation_status==='hidden';return`<article class="admin-data-card ${hidden?'admin-row-restricted':''}"><div><strong>${menu?adminEscape(x.name):`${'★'.repeat(x.rating)} ${adminEscape(x.users?.name||'Customer')}`}</strong><span>${adminEscape(x.shops?.name||'—')}</span><p>${adminEscape(menu?(x.description||adminMoney(x.price)):(x.comment||'No comment'))}</p></div><button class="btn btn-sm ${hidden?'btn-outline-success':'btn-outline-danger'}" onclick="moderateAdminContent('${menu?'menu_item':'feedback'}',${x.id},${!hidden})">${hidden?'Restore':'Hide'}</button>${x.moderation_reason?`<small class="text-danger">${adminEscape(x.moderation_reason)}</small>`:''}</article>`}).join('');}
function moderateAdminContent(type,id,hidden){adminAction({title:hidden?'Hide content':'Restore content',copy:'Hidden content remains in historical records.',required:hidden,onConfirm:async reason=>{const{error}=await supabaseClient.rpc('admin_moderate_content',{p_entity_type:type,p_entity_id:id,p_hidden:hidden,p_reason:reason||null});if(error)throw error;await loadAdminModeration();}});}

async function loadAdminAnnouncements(){adminLoading('admin-announcement-list');const{data,error}=await supabaseClient.from('announcements').select('id,title,message,audience,is_active,starts_at,ends_at,created_at,users!announcements_created_by_fkey(name)').order('created_at',{ascending:false});if(error)return adminFailure('admin-announcement-list',error);document.getElementById('admin-announcement-list').innerHTML=(data||[]).map(a=>`<article class="admin-data-card"><div><strong>${adminEscape(a.title)}</strong><span>${adminEscape(a.audience)} · ${adminDate(a.created_at)}</span><p>${adminEscape(a.message)}</p></div><span class="admin-status-badge">${a.is_active?'Active':'Inactive'}</span></article>`).join('')||adminEmpty('No announcements yet');}
async function submitAdminAnnouncement(event){event.preventDefault();const ends=document.getElementById('announcement-ends').value;const args={p_title:document.getElementById('announcement-title').value.trim(),p_message:document.getElementById('announcement-message').value.trim(),p_audience:document.getElementById('announcement-audience').value,p_target_user_id:null,p_target_shop_id:null,p_ends_at:ends?new Date(ends).toISOString():null};const{error}=await supabaseClient.rpc('admin_create_announcement',args);if(error)return adminToast(error.message,'danger');event.target.reset();adminToast('Announcement published.');await loadAdminAnnouncements();}

async function loadAdminSystemSettings(){adminLoading('admin-system-settings');const{data,error}=await supabaseClient.from('system_settings').select('*').order('key');if(error)return adminFailure('admin-system-settings',error);document.getElementById('admin-system-settings').innerHTML=(data||[]).map(setting=>{const boolean=typeof setting.value==='boolean';return`<article class="admin-setting-card"><div><strong>${adminEscape(setting.key.replaceAll('_',' '))}</strong><span>${adminEscape(setting.description||'')}</span></div>${boolean?`<button class="form-check form-switch admin-switch"><input class="form-check-input" type="checkbox" ${setting.value?'checked':''} onchange="updateAdminSetting('${adminEscape(setting.key)}',this.checked)"></button>`:`<div class="input-group"><input class="form-control" id="setting-${adminEscape(setting.key)}" type="number" value="${Number(setting.value)}"><button class="btn btn-primary" onclick="updateAdminSetting('${adminEscape(setting.key)}',Number(document.getElementById('setting-${adminEscape(setting.key)}').value))">Save</button></div>`}</article>`}).join('');}
async function updateAdminSetting(key,value){const{error}=await supabaseClient.rpc('admin_update_setting',{p_key:key,p_value:value});if(error)return adminToast(error.message,'danger');adminToast('System setting updated.');}

async function loadAdminAudit(){adminLoading('admin-audit-list');const{data,error}=await supabaseClient.from('admin_audit_logs').select('id,action,entity_type,entity_id,reason,created_at,users!admin_audit_logs_admin_profile_id_fkey(name,email)').order('created_at',{ascending:false}).limit(500);if(error)return adminFailure('admin-audit-list',error);adminAuditLogs=data||[];renderAdminAudit();}
function renderAdminAudit(){const q=(document.getElementById('admin-audit-search')?.value||'').toLowerCase(),rows=adminAuditLogs.filter(x=>[x.action,x.entity_type,x.entity_id,x.reason,x.users?.name,x.users?.email].some(v=>String(v||'').toLowerCase().includes(q)));document.getElementById('admin-audit-list').innerHTML=rows.map(x=>`<article class="admin-data-card"><div><strong>${adminEscape(x.action.replaceAll('_',' '))}</strong><span>${adminEscape(x.entity_type)} #${adminEscape(x.entity_id||'—')} · ${adminDate(x.created_at)}</span><p>${adminEscape(x.reason||'No reason supplied')}</p></div><small>${adminEscape(x.users?.name||'Admin')}</small></article>`).join('')||adminEmpty('No matching audit events');}

async function loadAdminAnalytics(){adminLoading('admin-analytics-stats');const [{data:orders,error},{data:shops}]=await Promise.all([supabaseClient.from('orders').select('id,shop_id,total_amount,status,created_at,shops(name)').order('created_at',{ascending:false}).limit(2000),supabaseClient.from('shops').select('id,name,status')]);if(error)return adminFailure('admin-analytics-stats',error);const delivered=(orders||[]).filter(o=>o.status==='delivered'),revenue=delivered.reduce((s,o)=>s+Number(o.total_amount||0),0),cancelled=(orders||[]).filter(o=>o.status==='cancelled').length;document.getElementById('admin-analytics-stats').innerHTML=[['Orders',orders?.length||0],['Delivered revenue',adminMoney(revenue)],['Average order',adminMoney(delivered.length?revenue/delivered.length:0)],['Cancellation rate',`${orders?.length?((cancelled/orders.length)*100).toFixed(1):0}%`],['Active shops',(shops||[]).filter(s=>s.status==='approved').length]].map(([l,v])=>`<article><span>${l}</span><strong>${v}</strong></article>`).join('');const totals={};(orders||[]).forEach(o=>{const n=o.shops?.name||'Unknown';totals[n]=(totals[n]||0)+(o.status==='delivered'?Number(o.total_amount):0)});const max=Math.max(1,...Object.values(totals));document.getElementById('admin-analytics-content').innerHTML=`<div class="admin-section-head"><div><h2>Revenue by shop</h2><p>Delivered orders in the latest ${orders?.length||0} records.</p></div></div><div class="admin-bars">${Object.entries(totals).sort((a,b)=>b[1]-a[1]).map(([name,value])=>`<div><span>${adminEscape(name)}</span><div><i style="width:${value/max*100}%"></i></div><strong>${adminMoney(value)}</strong></div>`).join('')}</div>`;}

document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('admin-announcement-form')?.addEventListener('submit',submitAdminAnnouncement);
    document.getElementById('admin-order-search')?.addEventListener('input',renderAdminOrders);
    document.getElementById('admin-order-status')?.addEventListener('change',renderAdminOrders);
    document.getElementById('admin-payment-search')?.addEventListener('input',renderAdminPayments);
    document.getElementById('admin-payment-status')?.addEventListener('change',renderAdminPayments);
    document.getElementById('admin-moderation-search')?.addEventListener('input',renderAdminModeration);
    document.getElementById('admin-audit-search')?.addEventListener('input',renderAdminAudit);
    document.querySelectorAll('[data-moderation]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-moderation]').forEach(b=>b.classList.remove('active'));button.classList.add('active');adminModerationMode=button.dataset.moderation;loadAdminModeration();}));
    setTimeout(()=>showAdminPanel(ADMIN_PANELS.includes(location.hash.slice(1))?location.hash.slice(1):'overview'),0);
});
