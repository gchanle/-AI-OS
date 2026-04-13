export const CAMPUS_USER_PROFILE_KEY = 'campus_user_profile_v1';
export const CAMPUS_USER_PROFILE_QUERY_PREFIX = 'campus_';
export const CAMPUS_USER_PROFILE_QUERY_KEYS = {
    clear: 'campus_clear_profile',
    uid: 'campus_uid',
    fid: 'campus_fid',
    name: 'campus_user_name',
    chaoxingName: 'campus_chaoxing_name',
    avatar: 'campus_avatar',
    role: 'campus_role',
    permissions: 'campus_permissions',
};

const DEFAULT_PROFILE = {
    uid: 'anonymous-demo-user',
    fid: 'anonymous-demo-fid',
    name: 'Campus Demo Admin',
    chaoxingName: '校园演示账号',
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

function normalizePermissions(value) {
    if (Array.isArray(value)) {
        return value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
    }

    return String(value || '')
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function isTruthyValue(value = '') {
    return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

export function parseCampusUserProfileHandoff(searchParams) {
    if (!searchParams) {
        return {
            shouldApply: false,
            shouldClear: false,
            profile: null,
            consumedKeys: [],
        };
    }

    const consumedKeys = Object.values(CAMPUS_USER_PROFILE_QUERY_KEYS)
        .filter((key) => typeof searchParams.has === 'function' && searchParams.has(key));
    const shouldClear = isTruthyValue(searchParams.get(CAMPUS_USER_PROFILE_QUERY_KEYS.clear));

    if (consumedKeys.length === 0) {
        return {
            shouldApply: false,
            shouldClear: false,
            profile: null,
            consumedKeys: [],
        };
    }

    if (shouldClear) {
        return {
            shouldApply: true,
            shouldClear: true,
            profile: getDefaultCampusUserProfile(),
            consumedKeys,
        };
    }

    const nextProfile = normalizeProfile({
        uid: searchParams.get(CAMPUS_USER_PROFILE_QUERY_KEYS.uid) || '',
        fid: searchParams.get(CAMPUS_USER_PROFILE_QUERY_KEYS.fid) || '',
        name: searchParams.get(CAMPUS_USER_PROFILE_QUERY_KEYS.name) || '',
        chaoxingName: searchParams.get(CAMPUS_USER_PROFILE_QUERY_KEYS.chaoxingName) || '',
        avatar: searchParams.get(CAMPUS_USER_PROFILE_QUERY_KEYS.avatar) || '',
        role: searchParams.get(CAMPUS_USER_PROFILE_QUERY_KEYS.role) || '',
        permissions: normalizePermissions(searchParams.get(CAMPUS_USER_PROFILE_QUERY_KEYS.permissions)),
    });

    return {
        shouldApply: true,
        shouldClear: false,
        profile: nextProfile,
        consumedKeys,
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
