'use client';

export const FIREFLY_MEMORY_STORAGE_KEY = 'campus_firefly_memory_v1';
export const FIREFLY_MEMORY_EVENT = 'campus-firefly-memory-sync';
export const fireflyMemoryTypeMap = {
    task_result: { id: 'task_result', label: '任务结果记忆' },
    user_preference: { id: 'user_preference', label: '用户偏好记忆' },
    reading_context: { id: 'reading_context', label: '阅读上下文记忆' },
    workflow_hint: { id: 'workflow_hint', label: '流程线索记忆' },
    manual_note: { id: 'manual_note', label: '人工补充记忆' },
};

function canUseStorage() {
    return typeof window !== 'undefined';
}

function normalizeArray(value) {
    return Array.isArray(value) ? value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean) : [];
}

function normalizeEntry(entry = {}) {
    const createdAt = entry.createdAt || new Date().toISOString();
    return {
        id: String(entry.id || `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).trim(),
        uid: String(entry.uid || '').trim(),
        fid: String(entry.fid || '').trim(),
        taskId: String(entry.taskId || '').trim(),
        sessionId: String(entry.sessionId || '').trim(),
        threadKey: String(entry.threadKey || '').trim(),
        title: String(entry.title || '未命名记忆').trim(),
        summary: String(entry.summary || '').trim(),
        detail: String(entry.detail || '').trim(),
        capabilityIds: normalizeArray(entry.capabilityIds),
        tags: normalizeArray(entry.tags),
        source: String(entry.source || 'firefly_task').trim(),
        memoryType: String(entry.memoryType || 'task_result').trim(),
        memoryLayer: String(entry.memoryLayer || 'raw').trim(),
        anchorType: String(entry.anchorType || (entry.taskId ? 'task' : entry.sessionId ? 'session' : 'profile')).trim(),
        visibility: String(entry.visibility || 'runtime').trim(),
        retentionPolicy: String(entry.retentionPolicy || 'rolling').trim(),
        priorityBand: String(entry.priorityBand || 'standard').trim(),
        sourceTaskIds: normalizeArray(entry.sourceTaskIds),
        importance: Math.max(1, Math.min(5, Number(entry.importance || 3))),
        createdAt,
        updatedAt: entry.updatedAt || createdAt,
        lastUsedAt: entry.lastUsedAt || null,
    };
}

export function loadFireflyMemories() {
    if (!canUseStorage()) {
        return [];
    }

    try {
        const raw = JSON.parse(localStorage.getItem(FIREFLY_MEMORY_STORAGE_KEY) || '[]');
        return Array.isArray(raw)
            ? raw.map(normalizeEntry).sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
            : [];
    } catch (error) {
        console.error('Failed to restore Firefly memories:', error);
        return [];
    }
}

export function saveFireflyMemories(entries = []) {
    if (!canUseStorage()) {
        return [];
    }

    const normalized = entries
        .map(normalizeEntry)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .slice(0, 120);

    try {
        localStorage.setItem(FIREFLY_MEMORY_STORAGE_KEY, JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(FIREFLY_MEMORY_EVENT, {
            detail: normalized,
        }));
    } catch (error) {
        console.error('Failed to persist Firefly memories:', error);
    }

    return normalized;
}

export function upsertFireflyMemory(entry = {}) {
    const current = loadFireflyMemories();
    const nextEntry = normalizeEntry(entry);
    const next = [nextEntry, ...current.filter((item) => item.id !== nextEntry.id)];
    return saveFireflyMemories(next);
}

function truncate(text = '', limit = 220) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= limit) {
        return clean;
    }

    return `${clean.slice(0, limit)}...`;
}

export function rememberFireflyTask(task = {}, options = {}) {
    if (!task?.id) {
        return null;
    }

    const artifactSummary = Array.isArray(task.artifacts)
        ? task.artifacts
            .map((item) => truncate(item.content || item.href || ''))
            .filter(Boolean)
            .slice(0, 3)
            .join(' | ')
        : '';
    const detail = [
        task.resultSummary ? `结果摘要：${task.resultSummary}` : '',
        task.reasoning?.length ? `调度判断：${task.reasoning.join('；')}` : '',
        artifactSummary ? `关键产出：${artifactSummary}` : '',
    ].filter(Boolean).join('\n');

    const entry = {
        id: `task-memory:${task.id}`,
        uid: options.uid || '',
        fid: options.fid || '',
        taskId: task.id,
        sessionId: options.sessionId || task.sessionId || '',
        threadKey: task.threadKey || '',
        title: task.title || '萤火虫任务记忆',
        summary: truncate(task.resultSummary || artifactSummary || task.goal || task.title || ''),
        detail,
        capabilityIds: normalizeArray(task.capabilityIds),
        tags: [
            ...(task.intent?.label ? [task.intent.label] : []),
            ...normalizeArray(task.selectedSkillLabels),
        ],
        source: 'firefly_task',
        memoryLayer: 'raw',
        memoryType: task.planMetadata?.isResume ? 'workflow_hint' : 'task_result',
        anchorType: 'task',
        visibility: 'runtime',
        retentionPolicy: 'rolling',
        priorityBand: task.status === 'failed' ? 'high' : 'standard',
        sourceTaskIds: [task.id],
        importance: task.status === 'completed' ? 4 : task.status === 'failed' ? 2 : 3,
        updatedAt: new Date().toISOString(),
        createdAt: task.createdAt || new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
    };

    upsertFireflyMemory(entry);
    return entry;
}

export function upsertCampusPreferenceMemory({
    uid = '',
    fid = '',
    preferredModelId = '',
    capabilityIds = [],
    workspaceMode = '',
    webSearchEnabled = false,
    deepResearchEnabled = false,
} = {}) {
    if (!uid) {
        return null;
    }

    const summary = [
        preferredModelId ? `常用模型：${preferredModelId}` : '',
        capabilityIds.length ? `常接入能力：${capabilityIds.join('、')}` : '',
        workspaceMode ? `界面模式：${workspaceMode}` : '',
        webSearchEnabled ? '默认开启联网搜索' : '',
        deepResearchEnabled ? '默认开启深度研究' : '',
    ].filter(Boolean).join('；');

    const entry = {
        id: `preference:${uid}`,
        uid,
        fid,
        title: '用户偏好记忆',
        summary: summary || '已记录当前用户的工作偏好。',
        detail: summary || '已记录当前用户的工作偏好。',
        capabilityIds,
        tags: ['用户偏好', '工作台设置'],
        source: 'user_preference',
        memoryType: 'user_preference',
        anchorType: 'profile',
        importance: 5,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
    };

    upsertFireflyMemory(entry);
    return entry;
}

function computeMemoryScore(entry, { uid = '', capabilityIds = [], question = '' } = {}) {
    let score = 0;
    if (uid && entry.uid === uid) {
        score += 4;
    }
    if (capabilityIds.some((id) => entry.capabilityIds.includes(id))) {
        score += 3;
    }

    const haystack = `${entry.title} ${entry.summary} ${entry.detail} ${entry.tags.join(' ')}`.toLowerCase();
    const keywords = String(question || '').toLowerCase().split(/[\s,，。；、]+/).filter((item) => item.length > 1);
    keywords.forEach((keyword) => {
        if (haystack.includes(keyword)) {
            score += 2;
        }
    });

    score += Math.min(3, Number(entry.importance || 0));
    return score;
}

export function buildFireflyMemorySnapshot({
    uid = '',
    capabilityIds = [],
    question = '',
    limit = 4,
} = {}) {
    const matched = loadFireflyMemories()
        .map((entry) => ({
            entry,
            score: computeMemoryScore(entry, { uid, capabilityIds, question }),
        }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }

            return new Date(right.entry.updatedAt).getTime() - new Date(left.entry.updatedAt).getTime();
        })
        .slice(0, limit)
        .map(({ entry }) => entry);

    if (!matched.length) {
        return {
            items: [],
            markdown: '',
        };
    }

    const markdown = [
        '## 长期记忆',
        ...matched.map((entry, index) => (
            [
                `${index + 1}. ${entry.title}`,
                `- 摘要：${entry.summary || '暂无摘要'}`,
                entry.detail ? `- 线索：${truncate(entry.detail, 160)}` : '',
            ].filter(Boolean).join('\n')
        )),
    ].join('\n\n');

    return {
        items: matched,
        markdown,
    };
}

export function touchFireflyMemory(memoryIds = []) {
    if (!memoryIds.length) {
        return [];
    }

    const current = loadFireflyMemories();
    const now = new Date().toISOString();
    const next = current.map((entry) => (
        memoryIds.includes(entry.id)
            ? {
                ...entry,
                lastUsedAt: now,
                updatedAt: now,
            }
            : entry
    ));

    return saveFireflyMemories(next);
}

export function buildFireflyMemoryMetrics(entries = []) {
    const list = Array.isArray(entries) ? entries : [];
    const typeCounts = list.reduce((acc, item) => {
        const key = item.memoryType || 'task_result';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const anchorCounts = list.reduce((acc, item) => {
        const key = item.anchorType || 'task';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    return {
        total: list.length,
        typed: Object.entries(typeCounts).map(([id, count]) => ({
            id,
            count,
            label: fireflyMemoryTypeMap[id]?.label || id,
        })).sort((left, right) => right.count - left.count),
        anchors: Object.entries(anchorCounts).map(([id, count]) => ({
            id,
            count,
        })).sort((left, right) => right.count - left.count),
        recoverableTasks: list.filter((item) => item.anchorType === 'task').length,
        preferenceMemories: typeCounts.user_preference || 0,
    };
}

export function subscribeFireflyMemories(callback) {
    if (!canUseStorage()) {
        return () => {};
    }

    const handleSync = (event) => {
        if (Array.isArray(event.detail)) {
            callback(event.detail);
            return;
        }

        callback(loadFireflyMemories());
    };

    const handleStorage = (event) => {
        if (event.key === FIREFLY_MEMORY_STORAGE_KEY) {
            callback(loadFireflyMemories());
        }
    };

    window.addEventListener(FIREFLY_MEMORY_EVENT, handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener(FIREFLY_MEMORY_EVENT, handleSync);
        window.removeEventListener('storage', handleStorage);
    };
}
