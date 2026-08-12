// ============================================================
// Shared profile photo and profile update helpers
// ============================================================

const PROFILE_IMAGE_BUCKET = 'profile-images';
const PROFILE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function getProfileInitials(name, email = '') {
    const source = String(name || email || '?').trim();
    const words = source.split(/\s+/).filter(Boolean);
    return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : source.slice(0, 2)).toUpperCase();
}

function validateProfileImage(file) {
    if (!file) return null;
    if (!PROFILE_IMAGE_TYPES.includes(file.type)) {
        return 'Choose a JPG, PNG, or WebP image.';
    }
    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
        return 'Profile image must be 3 MB or smaller.';
    }
    return null;
}

function profileImageExtension(file) {
    return ({
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    })[file.type] || 'jpg';
}

async function getProfileAvatarUrl(avatarPath, expiresIn = 3600) {
    if (!avatarPath) return null;
    const { data, error } = await supabaseClient.storage
        .from(PROFILE_IMAGE_BUCKET)
        .createSignedUrl(avatarPath, expiresIn);
    if (error) {
        console.warn('Unable to sign profile image URL:', error.message);
        return null;
    }
    return data?.signedUrl || null;
}

async function hydrateProfileAvatars(profiles) {
    const list = Array.isArray(profiles) ? profiles : [];
    await Promise.all(list.map(async profile => {
        profile.avatar_url = await getProfileAvatarUrl(profile.avatar_path);
    }));
    return list;
}

function renderProfileAvatarElement(element, profile, avatarUrl = profile?.avatar_url) {
    if (!element) return;
    element.replaceChildren();
    element.classList.toggle('has-profile-photo', Boolean(avatarUrl));

    if (avatarUrl) {
        const image = document.createElement('img');
        image.src = avatarUrl;
        image.alt = `${profile?.name || 'User'} profile photo`;
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        element.appendChild(image);
        return;
    }

    const initials = document.createElement('span');
    initials.textContent = getProfileInitials(profile?.name, profile?.email);
    initials.setAttribute('aria-hidden', 'true');
    element.appendChild(initials);
}

async function refreshCurrentProfileAvatars(profile) {
    if (!profile) return null;
    const avatarUrl = await getProfileAvatarUrl(profile.avatar_path);
    profile.avatar_url = avatarUrl;
    document.querySelectorAll('[data-current-profile-avatar]').forEach(element => {
        renderProfileAvatarElement(element, profile, avatarUrl);
    });
    return avatarUrl;
}

function previewSelectedProfileImage(input, previewElementId, profile) {
    const preview = document.getElementById(previewElementId);
    if (!input?.files?.[0] || !preview) return;
    const file = input.files[0];
    const validationError = validateProfileImage(file);
    if (validationError) {
        input.value = '';
        throw new Error(validationError);
    }

    const objectUrl = URL.createObjectURL(file);
    renderProfileAvatarElement(preview, profile, objectUrl);
    preview.querySelector('img')?.addEventListener('load', () => URL.revokeObjectURL(objectUrl), { once: true });
}

async function updateProfileWithAvatar(profile, changes, imageFile = null) {
    if (!profile?.id) throw new Error('Profile is unavailable. Please sign in again.');

    const validationError = validateProfileImage(imageFile);
    if (validationError) throw new Error(validationError);

    const payload = { ...changes };
    let newAvatarPath = null;

    if (imageFile) {
        const authUser = await getCurrentUser();
        if (!authUser) throw new Error('Your session expired. Please sign in again.');

        newAvatarPath = `${authUser.id}/avatar_${Date.now()}.${profileImageExtension(imageFile)}`;
        const { error: uploadError } = await supabaseClient.storage
            .from(PROFILE_IMAGE_BUCKET)
            .upload(newAvatarPath, imageFile, {
                cacheControl: '3600',
                contentType: imageFile.type,
                upsert: false
            });
        if (uploadError) throw uploadError;
        payload.avatar_path = newAvatarPath;
    }

    const { data, error } = await supabaseClient
        .from('users')
        .update(payload)
        .eq('id', profile.id)
        .select('id, name, email, phone_number, role, avatar_path')
        .single();

    if (error) {
        if (newAvatarPath) {
            await supabaseClient.storage.from(PROFILE_IMAGE_BUCKET).remove([newAvatarPath]);
        }
        throw error;
    }

    if (newAvatarPath && profile.avatar_path && profile.avatar_path !== newAvatarPath) {
        const { error: removeError } = await supabaseClient.storage
            .from(PROFILE_IMAGE_BUCKET)
            .remove([profile.avatar_path]);
        if (removeError) console.warn('Old profile image could not be removed:', removeError.message);
    }

    data.avatar_url = await getProfileAvatarUrl(data.avatar_path);
    return data;
}
