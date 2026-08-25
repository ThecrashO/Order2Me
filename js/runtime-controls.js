// Public operational settings and targeted announcements for signed-in dashboards.
function runtimeEscape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
    })[character]);
}
async function initRuntimeControls() {
    const profile = await getCurrentProfile();
    if (!profile) return;
    const [{ data: settings }, { data: announcements }] = await Promise.all([
        supabaseClient.from('system_settings').select('key,value').in('key', ['maintenance_mode','ordering_enabled']),
        supabaseClient.from('announcements').select('id,title,message,audience,starts_at,ends_at').eq('is_active', true).order('created_at', { ascending:false }).limit(5)
    ]);
    const values = Object.fromEntries((settings || []).map(item => [item.key, item.value]));
    const notices = [];
    if (values.maintenance_mode === true) notices.push({ title:'Maintenance mode', message:'The platform is undergoing maintenance. Some actions may be temporarily unavailable.', tone:'danger' });
    else if (values.ordering_enabled === false && profile.role === 'customer') notices.push({ title:'Ordering paused', message:'New orders are temporarily disabled by the administrator.', tone:'warning' });
    (announcements || []).forEach(item => notices.push({ ...item, tone:'info' }));
    if (!notices.length) return;
    const host = document.createElement('section');
    host.className = 'runtime-notice-stack';
    host.setAttribute('aria-label', 'Platform announcements');
    host.innerHTML = notices.map(item => `<article class="runtime-notice runtime-notice-${item.tone}"><div><strong>${runtimeEscape(item.title)}</strong><p>${runtimeEscape(item.message)}</p></div><button type="button" aria-label="Dismiss announcement" onclick="this.closest('article').remove()">×</button></article>`).join('');
    const nav = document.querySelector('nav.navbar');
    if (nav) nav.insertAdjacentElement('afterend', host); else document.body.prepend(host);
}

document.addEventListener('DOMContentLoaded', initRuntimeControls);
