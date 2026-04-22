function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

export const FIREFLY_CONTROL_PLANE_PRESETS = {
    balanced: {
        id: 'balanced',
        label: '稳定模式',
        description: '保持自动路由与默认记忆注入，适合大多数日常问答与任务续办。',
        controlPlanePrefs: {
            presetId: 'balanced',
            memory: {
                injectTopK: 4,
                autoRememberTasks: true,
                defaultPriorityBand: 'standard',
            },
            tools: {
                selectionMode: 'auto',
                webSearchMode: 'auto',
                blockedToolIds: [],
                confirmBeforeUseToolIds: ['workspace.publish'],
            },
        },
    },
    explore: {
        id: 'explore',
        label: '探索模式',
        description: '更积极复用长期记忆与已固定工具，适合研究、梳理、开放探索。',
        controlPlanePrefs: {
            presetId: 'explore',
            memory: {
                injectTopK: 6,
                autoRememberTasks: true,
                defaultPriorityBand: 'high',
            },
            tools: {
                selectionMode: 'prefer_pinned',
                webSearchMode: 'auto',
                blockedToolIds: [],
                confirmBeforeUseToolIds: [],
            },
        },
    },
    strict_manual: {
        id: 'strict_manual',
        label: '严格人工',
        description: '只走固定工具，联网需显式开启，外部读取和写入类工具默认先确认。',
        controlPlanePrefs: {
            presetId: 'strict_manual',
            memory: {
                injectTopK: 2,
                autoRememberTasks: true,
                defaultPriorityBand: 'standard',
            },
            tools: {
                selectionMode: 'pinned_only',
                webSearchMode: 'manual_only',
                blockedToolIds: [],
                confirmBeforeUseToolIds: [
                    'web.fetch',
                    'research.read',
                    'workspace.write',
                    'workspace.publish',
                ],
            },
        },
    },
};

export function listFireflyControlPlanePresets() {
    return Object.values(FIREFLY_CONTROL_PLANE_PRESETS).map((item) => clone(item));
}

export function resolveFireflyControlPlanePreset(presetId = 'balanced') {
    const normalizedId = String(presetId || '').trim();
    return clone(FIREFLY_CONTROL_PLANE_PRESETS[normalizedId] || FIREFLY_CONTROL_PLANE_PRESETS.balanced);
}

export function normalizeFireflyControlPlanePresetId(presetId = '') {
    const normalizedId = String(presetId || '').trim();
    if (normalizedId === 'custom') {
        return 'custom';
    }

    return FIREFLY_CONTROL_PLANE_PRESETS[normalizedId] ? normalizedId : 'balanced';
}

export function buildDefaultFireflyControlPlanePrefs() {
    return clone(resolveFireflyControlPlanePreset('balanced').controlPlanePrefs);
}

export function formatFireflyControlPlanePresetLabel(presetId = '') {
    const normalizedId = normalizeFireflyControlPlanePresetId(presetId);
    if (normalizedId === 'custom') {
        return '自定义';
    }

    return resolveFireflyControlPlanePreset(normalizedId).label;
}
