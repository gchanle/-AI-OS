export const WORKSPACE_PREFS_KEY = 'campus_workspace_prefs';
export const FIREFLY_HANDOFF_PROMPT_KEY = 'firefly_handoff_prompt';
export const FIREFLY_HANDOFF_CAPS_KEY = 'firefly_handoff_caps';
export const CAMPUS_NOTIFY_EVENT = 'campus-notify';
export const CAMPUS_MESSAGE_SYNC_EVENT = 'campus-message-sync';
export const CAMPUS_OPEN_FIREFLY_EVENT = 'campus-open-firefly';
export const CAMPUS_PENDING_ACTION_KEY = 'campus_pending_message_action_v1';

export const campusModules = [
    {
        id: 'firefly',
        label: '萤火虫',
        href: '/',
        capabilityId: null,
        source: '萤火虫',
        summary: '统一工作台、任务推进、跨模块协同与对话入口',
        kind: 'native',
    },
    {
        id: 'services',
        label: 'AI 办事',
        href: '/services',
        capabilityId: 'services',
        source: '服务大厅',
        summary: '办理校园事务、审批流程、日程服务与一网通办入口',
        kind: 'workspace',
    },
    {
        id: 'research',
        label: 'AI 科研',
        href: '/research',
        capabilityId: 'research',
        source: '闻道',
        summary: '科研探索、学术追踪、AI 研究员与知识服务',
        kind: 'workspace',
    },
    {
        id: 'assistant',
        label: 'AI 助教',
        href: '/assistant',
        capabilityId: 'assistant',
        source: '超星泛雅',
        summary: '课程教学、作业协同、课堂互动与教学支持',
        kind: 'workspace',
    },
    {
        id: 'library',
        label: 'AI 图书馆',
        href: '/library',
        capabilityId: 'library',
        source: '超星图书馆',
        summary: '馆藏检索、借阅服务、阅读支持与学习资源入口',
        kind: 'workspace',
    },
    {
        id: 'agents',
        label: 'AI 智能体',
        href: '/agent-builder',
        capabilityId: 'agents',
        source: 'AI 能力中心',
        summary: '智能体创建、校园能力编排与院系定制 AI 入口',
        kind: 'workspace',
    },
    {
        id: 'connectors',
        label: '连接器中心',
        href: '/connectors',
        capabilityId: null,
        source: '连接器中心',
        summary: '统一管理系统接入、授权方式、凭证引用与调试回执',
        kind: 'center',
    },
    {
        id: 'system',
        label: '系统通知',
        href: '/',
        capabilityId: null,
        source: '系统通知',
        summary: '平台级公告、提醒与消息聚合来源',
        kind: 'system',
    },
];

export const campusModuleMap = Object.fromEntries(
    campusModules.map((item) => [item.id, item])
);

export const campusCapabilityModules = campusModules.filter((item) => item.capabilityId);

export const messageSourceOrder = ['all', 'firefly', 'services', 'research', 'assistant', 'library', 'agents', 'connectors', 'system'];
export const messageSourceMap = Object.fromEntries(
    campusModules.map((item) => [
        item.id,
        {
            id: item.id,
            label: item.label,
            href: item.href,
            summary: item.summary,
            source: item.source,
            kind: item.kind,
        },
    ])
);

export function canUseBrowserStorage() {
    return typeof window !== 'undefined';
}

export function getCampusModule(moduleId) {
    return campusModuleMap[moduleId] || null;
}

export function getCampusMessageSource(sourceId) {
    return messageSourceMap[sourceId] || messageSourceMap.system;
}

export function buildMessageSourceTabs() {
    return messageSourceOrder
        .filter((id) => id === 'all' || messageSourceMap[id])
        .map((id) => ({
            id,
            label: id === 'all' ? '全部来源' : messageSourceMap[id].label,
        }));
}

export function buildCampusCapabilities() {
    return campusCapabilityModules.map((item) => ({
        id: item.capabilityId,
        name: item.label,
        source: item.source,
        href: item.href,
        summary: item.summary,
    }));
}

export function loadWorkspacePrefs() {
    if (!canUseBrowserStorage()) {
        return {};
    }

    try {
        const rawPrefs = localStorage.getItem(WORKSPACE_PREFS_KEY);
        return rawPrefs ? (JSON.parse(rawPrefs) || {}) : {};
    } catch (error) {
        console.error('Failed to restore workspace preferences:', error);
        return {};
    }
}

export function saveWorkspacePrefs(nextPrefs = {}) {
    if (!canUseBrowserStorage()) {
        return;
    }

    try {
        localStorage.setItem(WORKSPACE_PREFS_KEY, JSON.stringify(nextPrefs));
    } catch (error) {
        console.error('Failed to persist workspace preferences:', error);
    }
}

export function mergeWorkspacePrefs(patch = {}) {
    const current = loadWorkspacePrefs();
    const next = {
        ...current,
        ...patch,
    };
    saveWorkspacePrefs(next);
    return next;
}

export function normalizeCapabilityIds(capabilityIds = []) {
    return capabilityIds
        .flat()
        .filter(Boolean)
        .map((item) => String(item).trim())
        .filter(Boolean);
}

export function buildFireflyHandoffHref(prompt, capabilityIds = []) {
    const params = new URLSearchParams({
        firefly_prompt: prompt,
    });

    const normalizedCapabilityIds = normalizeCapabilityIds(capabilityIds);
    if (normalizedCapabilityIds.length > 0) {
        params.set('firefly_caps', normalizedCapabilityIds.join(','));
    }

    return `/?${params.toString()}`;
}

export function consumeFireflyHandoffRequest() {
    if (!canUseBrowserStorage()) {
        return null;
    }

    const url = new URL(window.location.href);
    const prompt = url.searchParams.get('firefly_prompt') || localStorage.getItem(FIREFLY_HANDOFF_PROMPT_KEY);
    const rawCapabilities = url.searchParams.get('firefly_caps') || localStorage.getItem(FIREFLY_HANDOFF_CAPS_KEY);

    if (!prompt) {
        return null;
    }

    const capabilityIds = normalizeCapabilityIds((rawCapabilities || '').split(','));

    localStorage.removeItem(FIREFLY_HANDOFF_PROMPT_KEY);
    localStorage.removeItem(FIREFLY_HANDOFF_CAPS_KEY);
    url.searchParams.delete('firefly_prompt');
    url.searchParams.delete('firefly_caps');
    window.history.replaceState({}, '', url.toString());

    return {
        prompt,
        capabilityIds,
    };
}

export function publishCampusNotification(detail = {}) {
    if (!canUseBrowserStorage()) {
        return;
    }

    window.dispatchEvent(new CustomEvent(CAMPUS_NOTIFY_EVENT, {
        detail,
    }));
}

export function requestOpenFireflyTarget(target) {
    if (!canUseBrowserStorage() || !target) {
        return;
    }

    window.dispatchEvent(new CustomEvent(CAMPUS_OPEN_FIREFLY_EVENT, {
        detail: { target },
    }));
}
