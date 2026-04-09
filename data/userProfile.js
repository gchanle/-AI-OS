export const CAMPUS_USER_PROFILE_KEY = 'campus_user_profile_v1';

const DEFAULT_PROFILE = {
    uid: 'demo-user-0001',
    fid: 'demo-fid-0001',
    name: 'Demo Admin',
    chaoxingName: '演示账号',
    avatar: '/user-avatar.png',
    role: 'school_admin',
    permissions: ['admin:school_console'],
};

function canUseStorage() {
    return typeof window !== 'undefined';
}

function normalizeProfile(profile = {}) {
    return {
        uid: String(profile.uid || DEFAULT_PROFILE.uid).trim(),
        fid: String(profile.fid || DEFAULT_PROFILE.fid).trim(),
        name: String(profile.name || DEFAULT_PROFILE.name).trim(),
        chaoxingName: String(profile.chaoxingName || profile.name || DEFAULT_PROFILE.chaoxingName).trim(),
        avatar: String(profile.avatar || DEFAULT_PROFILE.avatar).trim(),
        role: String(profile.role || DEFAULT_PROFILE.role).trim(),
        permissions: Array.isArray(profile.permissions) && profile.permissions.length > 0
            ? profile.permissions.filter(Boolean).map((item) => String(item).trim())
            : [...DEFAULT_PROFILE.permissions],
    };
}

export function getDefaultCampusUserProfile() {
    return { ...DEFAULT_PROFILE };
}

export function loadCampusUserProfile() {
    if (!canUseStorage()) {
        return getDefaultCampusUserProfile();
    }

    try {
        const raw = JSON.parse(localStorage.getItem(CAMPUS_USER_PROFILE_KEY) || 'null');
        return normalizeProfile(raw || DEFAULT_PROFILE);
    } catch (error) {
        console.error('Failed to restore campus user profile:', error);
        return getDefaultCampusUserProfile();
    }
}

export function saveCampusUserProfile(profile = {}) {
    if (!canUseStorage()) {
        return getDefaultCampusUserProfile();
    }

    const nextProfile = normalizeProfile(profile);

    try {
        localStorage.setItem(CAMPUS_USER_PROFILE_KEY, JSON.stringify(nextProfile));
        window.dispatchEvent(new CustomEvent(CAMPUS_USER_PROFILE_KEY, {
            detail: { profile: nextProfile },
        }));
    } catch (error) {
        console.error('Failed to persist campus user profile:', error);
    }

    return nextProfile;
}

export function ensureCampusUserProfile() {
    const profile = loadCampusUserProfile();

    if (!canUseStorage()) {
        return profile;
    }

    try {
        const raw = localStorage.getItem(CAMPUS_USER_PROFILE_KEY);
        if (!raw) {
            localStorage.setItem(CAMPUS_USER_PROFILE_KEY, JSON.stringify(profile));
        }
    } catch (error) {
        console.error('Failed to initialize campus user profile:', error);
    }

    return profile;
}

export function hasCampusAdminAccess(profile = {}) {
    const normalized = normalizeProfile(profile);
    return normalized.role === 'school_admin'
        || normalized.role === 'platform_admin'
        || normalized.permissions.includes('admin:school_console');
}

export function subscribeCampusUserProfile(callback) {
    if (!canUseStorage()) {
        return () => {};
    }

    const handleSync = (event) => {
        if (event.detail?.profile) {
            callback(normalizeProfile(event.detail.profile));
            return;
        }

        callback(loadCampusUserProfile());
    };

    const handleStorage = (event) => {
        if (event.key === CAMPUS_USER_PROFILE_KEY) {
            callback(loadCampusUserProfile());
        }
    };

    window.addEventListener(CAMPUS_USER_PROFILE_KEY, handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener(CAMPUS_USER_PROFILE_KEY, handleSync);
        window.removeEventListener('storage', handleStorage);
    };
}
