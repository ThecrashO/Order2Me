async function getCurrentUser() {
    const { data } = await supabaseClient.auth.getSession();
    return data?.session?.user ?? null;
}

async function getCurrentProfile() {
    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabaseClient
        .from('users')
        .select('id, name, email, phone_number, role')
        .eq('auth_user_id', user.id)
        .single();

    // Profile exists — return it
    if (data) return data;

    // Profile not found — could be first login after email confirmation
    // Try to recover from the pending profile saved during signup
    const pendingKey = 'pendingProfile_' + user.email;
    const pendingRaw = localStorage.getItem(pendingKey);
    if (pendingRaw) {
        try {
            const pending = JSON.parse(pendingRaw);
            const newProfile = {
                auth_user_id: user.id,
                name: pending.name,
                email: user.email,
                phone_number: pending.phone || null,
                role: pending.role || 'student'
            };

            const { data: inserted, error: insertError } = await supabaseClient
                .from('users')
                .insert(newProfile)
                .select('id, name, email, phone_number, role')
                .single();

            if (insertError) {
                console.error('Auto profile creation failed:', insertError);
                return null;
            }

            localStorage.removeItem(pendingKey); // Clean up
            return inserted;
        } catch (e) {
            console.error('Error parsing pending profile:', e);
        }
    }

    if (error) console.error('Error loading user profile:', error);
    return null;
}

async function requireRole(requiredRole) {
    const profile = await getCurrentProfile();
    if (!profile) {
        window.location.href = 'login.html';
        return null;
    }
    if (profile.role !== requiredRole) {
        console.error('Unauthorized role', profile.role, 'required', requiredRole);
        window.location.href = 'login.html';
        return null;
    }
    return profile;
}

async function requireStudent() {
    return await requireRole('student');
}

async function requireOwner() {
    return await requireRole('owner');
}

async function signIn(email, password) {
    return await supabaseClient.auth.signInWithPassword({ email, password });
}

async function signOut() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

async function signUpStudent(name, email, phone, password) {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return { error };

    // Case 1: Email confirmation is disabled — user is created immediately
    if (data.user && data.user.id) {
        const profile = {
            auth_user_id: data.user.id,
            name,
            email,
            phone_number: phone || null,
            role: 'student'
        };

        const { error: profileError } = await supabaseClient
            .from('users')
            .insert(profile);

        if (profileError) {
            console.error('Profile insert error:', profileError);
            return { error: profileError };
        }

        return { data };
    }

    // Case 2: Email confirmation is required — save pending profile info locally
    // so we can create the DB row after the user confirms and logs in.
    const pendingProfile = { name, email, phone: phone || null, role: 'student' };
    localStorage.setItem('pendingProfile_' + email, JSON.stringify(pendingProfile));

    return { emailConfirmationRequired: true };
}
