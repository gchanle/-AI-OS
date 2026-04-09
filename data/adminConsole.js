'use client';

import {
    campusModules,
    auxiliaryCapabilities,
} from '@/data/campusPlatform';

export const ADMIN_CONSOLE_SETTINGS_KEY = 'campus_admin_console_v1';
export const ADMIN_CONSOLE_EVENT = 'campus-admin-console-sync';

const DEFAULT_SETTINGS = {
    schoolProfile: {
        name: '超星 AI 校园 OS 示范校',
        code: 'CHAOXING-DEMO',
        owner: '学校信息中心',
        releaseChannel: '标准版',
    },
    moduleAccess: campusModules
        .filter((item) => item.id !== 'system')
        .map((item) => ({
            moduleId: item.id,
            label: item.label,
            enabled: true,
        })),
    knowledgeSources: [
        {
            id: 'knowledge-1',
            name: '学校办事手册',
            scope: '全校',
            status: 'enabled',
            summary: '用于支撑办事类问答、流程导航与政策解释。',
        },
        {
            id: 'knowledge-2',
            name: '教学运行规范库',
            scope: '教务 / 教师',
            status: 'enabled',
            summary: '用于课堂、考试、成绩与教学规范解释。',
        },
    ],
    processRules: [
        {
            id: 'rule-1',
            name: '审批流转规范',
            scope: 'AI 办事',
            status: 'enabled',
            summary: '统一审批待办、抄送、已办回写与提醒节奏。',
        },
        {
            id: 'rule-2',
            name: '图书馆阅读协同规范',
            scope: 'AI 图书馆',
            status: 'draft',
            summary: '用于管理 AI 阅读、笔记、引用和知识来源说明。',
        },
    ],
    defaultFirefly: {
        modelId: 'firefly-general-demo',
        capabilityIds: ['services', 'research', 'assistant'],
        webSearchEnabled: false,
        deepResearchEnabled: false,
        enabledToolTrace: true,
        allowExternalConnectors: true,
        allowFileUpload: true,
    },
    rolePolicies: [
        {
            id: 'student',
            label: '学生',
            visibleAdminEntry: false,
            defaultCapabilities: ['library', 'assistant'],
            canUseResearch: false,
        },
        {
            id: 'teacher',
            label: '教师',
            visibleAdminEntry: false,
            defaultCapabilities: ['services', 'assistant', 'library'],
            canUseResearch: true,
        },
        {
            id: 'school_admin',
            label: '学校管理员',
            visibleAdminEntry: true,
            defaultCapabilities: ['services', 'research', 'assistant', 'library', 'agents'],
            canUseResearch: true,
        },
    ],
};

function canUseStorage() {
    return typeof window !== 'undefined';
}

function normalizeList(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeRoleId(role = '') {
    return String(role || '').trim() || 'teacher';
}

function cloneDefaults(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeSettings(raw = {}) {
    const moduleMap = new Map(
        normalizeList(raw.moduleAccess).map((item) => [String(item.moduleId || '').trim(), item])
    );

    return {
        schoolProfile: {
            ...DEFAULT_SETTINGS.schoolProfile,
            ...(raw.schoolProfile || {}),
        },
        moduleAccess: DEFAULT_SETTINGS.moduleAccess.map((item) => ({
            ...item,
            ...(moduleMap.get(item.moduleId) || {}),
            moduleId: item.moduleId,
            label: item.label,
            enabled: moduleMap.has(item.moduleId)
                ? Boolean(moduleMap.get(item.moduleId)?.enabled)
                : item.enabled,
        })),
        knowledgeSources: normalizeList(raw.knowledgeSources).length > 0
            ? normalizeList(raw.knowledgeSources).map((item, index) => ({
                id: String(item.id || `knowledge-${index + 1}`).trim(),
                name: String(item.name || `知识源 ${index + 1}`).trim(),
                scope: String(item.scope || '全校').trim(),
                status: String(item.status || 'draft').trim(),
                summary: String(item.summary || '').trim(),
            }))
            : [...DEFAULT_SETTINGS.knowledgeSources],
        processRules: normalizeList(raw.processRules).length > 0
            ? normalizeList(raw.processRules).map((item, index) => ({
                id: String(item.id || `rule-${index + 1}`).trim(),
                name: String(item.name || `流程规范 ${index + 1}`).trim(),
                scope: String(item.scope || '全校').trim(),
                status: String(item.status || 'draft').trim(),
                summary: String(item.summary || '').trim(),
            }))
            : [...DEFAULT_SETTINGS.processRules],
        defaultFirefly: {
            ...DEFAULT_SETTINGS.defaultFirefly,
            ...(raw.defaultFirefly || {}),
            capabilityIds: normalizeList(raw.defaultFirefly?.capabilityIds).length > 0
                ? normalizeList(raw.defaultFirefly.capabilityIds)
                : [...DEFAULT_SETTINGS.defaultFirefly.capabilityIds],
        },
        rolePolicies: normalizeList(raw.rolePolicies).length > 0
            ? normalizeList(raw.rolePolicies).map((item, index) => ({
                id: normalizeRoleId(item.id || `role-${index + 1}`),
                label: String(item.label || `角色 ${index + 1}`).trim(),
                visibleAdminEntry: Boolean(item.visibleAdminEntry),
                defaultCapabilities: normalizeList(item.defaultCapabilities),
                canUseResearch: Boolean(item.canUseResearch),
            }))
            : cloneDefaults(DEFAULT_SETTINGS.rolePolicies),
    };
}

export function loadAdminConsoleSettings() {
    if (!canUseStorage()) {
        return normalizeSettings(DEFAULT_SETTINGS);
    }

    try {
        const raw = JSON.parse(localStorage.getItem(ADMIN_CONSOLE_SETTINGS_KEY) || 'null');
        return normalizeSettings(raw || DEFAULT_SETTINGS);
    } catch (error) {
        console.error('Failed to restore admin console settings:', error);
        return normalizeSettings(DEFAULT_SETTINGS);
    }
}

export function saveAdminConsoleSettings(settings = {}) {
    if (!canUseStorage()) {
        return normalizeSettings(settings);
    }

    const normalized = normalizeSettings(settings);
    try {
        localStorage.setItem(ADMIN_CONSOLE_SETTINGS_KEY, JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(ADMIN_CONSOLE_EVENT, {
            detail: normalized,
        }));
    } catch (error) {
        console.error('Failed to persist admin console settings:', error);
    }

    return normalized;
}

export function mergeAdminConsoleSettings(patch = {}) {
    const current = loadAdminConsoleSettings();
    return saveAdminConsoleSettings({
        ...current,
        ...patch,
    });
}

export function subscribeAdminConsoleSettings(callback) {
    if (!canUseStorage()) {
        return () => {};
    }

    const handleSync = (event) => {
        callback(normalizeSettings(event.detail || loadAdminConsoleSettings()));
    };

    const handleStorage = (event) => {
        if (event.key === ADMIN_CONSOLE_SETTINGS_KEY) {
            callback(loadAdminConsoleSettings());
        }
    };

    window.addEventListener(ADMIN_CONSOLE_EVENT, handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener(ADMIN_CONSOLE_EVENT, handleSync);
        window.removeEventListener('storage', handleStorage);
    };
}

export function getEnabledModuleIds(settings = loadAdminConsoleSettings()) {
    return settings.moduleAccess.filter((item) => item.enabled).map((item) => item.moduleId);
}

export function getEnabledCapabilityIds(settings = loadAdminConsoleSettings()) {
    const capabilityMap = new Map(
        campusModules
            .filter((item) => item.capabilityId)
            .map((item) => [item.id, item.capabilityId])
    );
    const enabledIds = settings.moduleAccess
        .filter((item) => item.enabled)
        .map((item) => capabilityMap.get(item.moduleId))
        .filter(Boolean);

    if (settings.moduleAccess.some((item) => item.moduleId === 'firefly' && item.enabled)) {
        auxiliaryCapabilities.forEach((item) => enabledIds.push(item.id));
    }

    return Array.from(new Set(enabledIds));
}

export function getRolePolicy(settings = loadAdminConsoleSettings(), role = 'teacher') {
    const normalizedRole = normalizeRoleId(typeof role === 'string' ? role : role?.role);
    const exactMatch = settings.rolePolicies.find((item) => item.id === normalizedRole);
    if (exactMatch) {
        return exactMatch;
    }

    return settings.rolePolicies.find((item) => item.id === 'teacher')
        || settings.rolePolicies[0]
        || null;
}

export function buildAdminWorkspaceBootstrap(settings = loadAdminConsoleSettings(), profile = null) {
    const rolePolicy = getRolePolicy(settings, profile);
    const rawEnabledCapabilityIds = getEnabledCapabilityIds(settings);
    const enabledCapabilityIds = rawEnabledCapabilityIds.filter((capabilityId) => (
        capabilityId !== 'research' || rolePolicy?.canUseResearch !== false
    ));
    const enabledModuleIds = getEnabledModuleIds(settings).filter((moduleId) => {
        const moduleMeta = campusModules.find((item) => item.id === moduleId);
        if (!moduleMeta?.capabilityId) {
            return moduleId;
        }

        return enabledCapabilityIds.includes(moduleMeta.capabilityId);
    });
    const preferredCapabilitySource = normalizeList(rolePolicy?.defaultCapabilities).length > 0
        ? rolePolicy.defaultCapabilities
        : settings.defaultFirefly.capabilityIds;
    const defaultCapabilities = preferredCapabilitySource.filter((item) => enabledCapabilityIds.includes(item));

    return {
        capabilityIds: defaultCapabilities,
        modelId: settings.defaultFirefly.modelId,
        webSearchEnabled: Boolean(settings.defaultFirefly.webSearchEnabled),
        deepResearchEnabled: Boolean(settings.defaultFirefly.deepResearchEnabled),
        enabledCapabilityIds,
        enabledModuleIds,
        rolePolicy,
    };
}
