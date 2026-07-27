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

    if (error) {
        console.error('Error loading user profile:', error);
        return null;
    }

    return data;
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

    const profile = {
        auth_user_id: data.user?.id,
        name,
        email,
        phone_number: phone || null,
        role: 'student'
    };

    const { error: profileError } = await supabaseClient
        .from('users')
        .insert(profile);

    if (profileError) {
        return { error: profileError };
    }

    return { data };
}
