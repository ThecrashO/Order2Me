// ============================================================
// Order2Me authentication + role/shop guards
// ============================================================

async function getCurrentUser() {
    const { data } = await supabaseClient.auth.getSession();
    return data?.session?.user ?? null;
}

function parseShopTimeMinutes(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return (hours * 60) + minutes;
}

function getYangonMinutesNow(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Yangon',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
    const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
    return (hour * 60) + minute;
}

function getYangonDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Yangon',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const value = type => parts.find(part => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
}

function isShopAcceptingOrdersToday(shop, date = new Date()) {
    if (shop?.accepting_orders !== false) return true;
    const settingDate = String(shop?.accepting_orders_date || '').slice(0, 10);
    return Boolean(settingDate) && settingDate !== getYangonDateKey(date);
}

function formatShopTime(value) {
    const minutes = parseShopTimeMinutes(value);
    if (minutes === null) return null;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function getShopOrderAvailability(shop, date = new Date()) {
    const preparationMinutes = Math.max(1, Number(shop?.preparation_minutes || 15));
    const openingMinutes = parseShopTimeMinutes(shop?.opening_time);
    const closingMinutes = parseShopTimeMinutes(shop?.closing_time);
    const hasSchedule = openingMinutes !== null && closingMinutes !== null;
    const hoursText = hasSchedule
        ? openingMinutes === closingMinutes
            ? 'Open 24 hours'
            : `${formatShopTime(shop.opening_time)} – ${formatShopTime(shop.closing_time)}`
        : 'Hours not set';

    const result = (canOrder, state, label, message) => ({
        canOrder,
        state,
        label,
        message,
        hoursText,
        preparationMinutes
    });

    if (!shop) return result(false, 'closed', 'Unavailable', 'Choose a shop to start ordering.');
    if (shop.status && shop.status !== 'approved') {
        return result(false, 'closed', 'Unavailable', 'This shop is not available for orders.');
    }
    if (shop.is_open === false) {
        return result(false, 'closed', 'Closed', 'The owner has temporarily closed this shop.');
    }
    if (!isShopAcceptingOrdersToday(shop, date)) {
        return result(false, 'paused', 'Orders paused', 'This shop is not accepting orders today.');
    }

    if (hasSchedule && openingMinutes !== closingMinutes) {
        const nowMinutes = getYangonMinutesNow(date);
        const insideHours = openingMinutes < closingMinutes
            ? nowMinutes >= openingMinutes && nowMinutes < closingMinutes
            : nowMinutes >= openingMinutes || nowMinutes < closingMinutes;
        if (!insideHours) {
            return result(false, 'scheduled-closed', 'Outside opening hours', `Opens during ${hoursText}.`);
        }
    }

    if (shop.is_accepting_orders_now === false) {
        return result(false, 'paused', 'Orders paused', 'Ordering is temporarily unavailable.');
    }

    return result(true, 'open', 'Open', `Accepting orders · Estimated preparation ${preparationMinutes} min.`);
}

function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input || !button) return;
    const showPassword = input.type === 'password';
    input.type = showPassword ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(showPassword));
    button.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
    button.setAttribute('title', showPassword ? 'Hide password' : 'Show password');
    button.querySelector('[data-eye-open]')?.classList.toggle('d-none', showPassword);
    button.querySelector('[data-eye-closed]')?.classList.toggle('d-none', !showPassword);
    input.focus({ preventScroll: true });
}

function makeShopSlug(name, userId) {
    const base = String(name || 'shop')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 42) || 'shop';
    return `${base}-${String(userId).replace(/-/g, '').slice(0, 8)}`;
}

async function getOwnerShop(ownerProfileId) {
    if (!ownerProfileId) return null;
    const { data, error } = await supabaseClient
        .from('shops')
        .select('*')
        .eq('owner_id', ownerProfileId)
        .maybeSingle();

    if (error) {
        console.error('Error loading owner shop:', error);
        return null;
    }
    return data || null;
}

async function createOwnerShop(profile, user, metadata = {}) {
    const shopPayload = {
        owner_id: profile.id,
        name: metadata.shopName || `${profile.name}'s Shop`,
        slug: makeShopSlug(metadata.shopName || profile.name, user.id),
        description: metadata.shopDescription || null,
        address: metadata.shopAddress || null,
        phone_number: metadata.shopPhone || metadata.phone || profile.phone_number || null,
        status: 'pending'
    };
    const { data, error } = await supabaseClient
        .from('shops')
        .insert(shopPayload)
        .select('*')
        .single();
    if (error) throw error;
    return data;
}

async function createProfileAndShop(user, metadata = {}) {
    const role = metadata.role === 'owner' ? 'owner' : 'customer';
    const profilePayload = {
        auth_user_id: user.id,
        name: metadata.name || user.email?.split('@')[0] || 'User',
        email: user.email,
        phone_number: metadata.phone || null,
        role
    };

    const { data: profile, error: profileError } = await supabaseClient
        .from('users')
        .insert(profilePayload)
        .select('id, name, email, phone_number, role, avatar_path')
        .single();

    if (profileError) throw profileError;

    if (role === 'owner') {
        await createOwnerShop(profile, user, metadata);
    }

    return profile;
}

async function getCurrentProfile() {
    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabaseClient
        .from('users')
        .select('id, name, email, phone_number, role, avatar_path')
        .eq('auth_user_id', user.id)
        .maybeSingle();

    let profile = data || null;

    // First login after email verification: recover signup fields from Auth
    // metadata. The local fallback preserves compatibility with older accounts.
    if (!profile) {
        let pending = user.user_metadata || {};
        const pendingKey = 'pendingProfile_' + user.email;
        const pendingRaw = localStorage.getItem(pendingKey);
        if (pendingRaw) {
            try { pending = { ...pending, ...JSON.parse(pendingRaw) }; }
            catch (parseError) { console.error('Error parsing pending profile:', parseError); }
        }

        if (pending.name || pending.role) {
            try {
                profile = await createProfileAndShop(user, pending);
                localStorage.removeItem(pendingKey);
            } catch (insertError) {
                console.error('Auto profile/shop creation failed:', insertError);
                return null;
            }
        }
    }

    if (!profile) {
        if (error) console.error('Error loading user profile:', error);
        return null;
    }

    if (profile.role === 'owner') {
        profile.shop = await getOwnerShop(profile.id);
        if (!profile.shop && user.user_metadata?.shopName) {
            try {
                profile.shop = await createOwnerShop(profile, user, user.user_metadata);
            } catch (shopError) {
                console.error('Owner shop recovery failed:', shopError);
            }
        }
    }

    return profile;
}

function dashboardForProfile(profile) {
    if (!profile) return 'login.html';
    if (profile.role === 'admin') return 'admin.html';
    if (profile.role === 'owner') {
        return profile.shop?.status === 'approved' ? 'owner.html' : 'pending.html';
    }
    return 'customer.html';
}

async function requireRole(requiredRole) {
    const profile = await getCurrentProfile();
    if (!profile) {
        window.location.href = 'login.html';
        return null;
    }
    if (profile.role !== requiredRole) {
        console.error('Unauthorized role', profile.role, 'required', requiredRole);
        window.location.href = dashboardForProfile(profile);
        return null;
    }
    return profile;
}

async function requireCustomer() {
    return await requireRole('customer');
}

async function requireOwner() {
    const profile = await requireRole('owner');
    if (!profile) return null;
    if (!profile.shop || profile.shop.status !== 'approved') {
        window.location.href = 'pending.html';
        return null;
    }
    return profile;
}

async function requireAdmin() {
    return await requireRole('admin');
}

async function signIn(email, password) {
    return await supabaseClient.auth.signInWithPassword({ email, password });
}

async function signOut() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

async function signUpAccount(account) {
    const role = account.role === 'owner' ? 'owner' : 'customer';
    const metadata = {
        name: account.name,
        phone: account.phone || null,
        role,
        shopName: role === 'owner' ? account.shopName : null,
        shopAddress: role === 'owner' ? account.shopAddress : null,
        shopDescription: role === 'owner' ? account.shopDescription : null,
        shopPhone: role === 'owner' ? (account.shopPhone || account.phone || null) : null
    };

    const { data, error } = await supabaseClient.auth.signUp({
        email: account.email,
        password: account.password,
        options: { data: metadata }
    });
    if (error) return { error };

    // A session exists only when email confirmation is disabled.
    if (data.session && data.user) {
        try {
            await createProfileAndShop(data.user, metadata);
        } catch (profileError) {
            console.error('Profile/shop insert error:', profileError);
            return { error: profileError };
        }
        return { data, role };
    }

    localStorage.setItem(
        'pendingProfile_' + account.email,
        JSON.stringify(metadata)
    );
    return { emailConfirmationRequired: true, role };
}

// Backwards-compatible wrapper used by older code.
async function signUpCustomer(name, email, phone, password) {
    return await signUpAccount({ name, email, phone, password, role: 'customer' });
}
