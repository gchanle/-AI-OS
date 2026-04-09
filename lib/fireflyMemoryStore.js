import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { loadAdminAgentRuntimeConfig } from '@/lib/adminAgentRuntimeStore';

const MEMORY_ROOT = path.join(process.cwd(), '.runtime', 'firefly');
const MEMORY_FILE = path.join(MEMORY_ROOT, 'memory-state.json');
const MAX_TYPES = 8;

let memoryMutationQueue = Promise.resolve();

function now() {
    return new Date().toISOString();
}

function buildId(prefix = 'memory') {
    return `${prefix}-${crypto.randomUUID()}`;
}

function defaultState() {
    return {
        entries: [],
    };
}

function normalizeArray(value) {
    return Array.isArray(value)
        ? value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
        : [];
}

function truncate(text = '', limit = 220) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= limit) {
        return clean;
    }

    return `${clean.slice(0, limit)}...`;
}

function normalizeEntry(entry = {}) {
    const createdAt = entry.createdAt || now();
    const updatedAt = entry.updatedAt || createdAt;

    return {
        id: String(entry.id || buildId('memory')).trim(),
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
        anchorType: String(entry.anchorType || 'task').trim(),
        visibility: String(entry.visibility || 'runtime').trim(),
        retentionPolicy: String(entry.retentionPolicy || 'rolling').trim(),
        priorityBand: String(entry.priorityBand || 'standard').trim(),
        sourceTaskIds: normalizeArray(entry.sourceTaskIds),
        importance: Math.max(1, Math.min(5, Number(entry.importance || 3))),
        createdAt,
        updatedAt,
        lastUsedAt: entry.lastUsedAt || null,
    };
}

function sortEntries(entries = []) {
    return [...entries].sort((left, right) => {
        const leftTime = new Date(left.updatedAt || left.lastUsedAt || left.createdAt || 0).getTime();
        const rightTime = new Date(right.updatedAt || right.lastUsedAt || right.createdAt || 0).getTime();

        if (rightTime !== leftTime) {
            return rightTime - leftTime;
        }

        return Number(right.importance || 0) - Number(left.importance || 0);
    });
}

function limitEntries(entries = [], size = 120) {
    return sortEntries(entries).slice(0, size);
}

async function ensureMemoryRoot() {
    await fs.mkdir(MEMORY_ROOT, { recursive: true });
}

async function atomicWrite(filePath, content) {
    const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFilePath, content, 'utf8');
    await fs.rename(tempFilePath, filePath);
}

async function readState() {
    await ensureMemoryRoot();

    try {
        const raw = await fs.readFile(MEMORY_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            ...defaultState(),
            ...(parsed || {}),
            entries: Array.isArray(parsed?.entries)
                ? parsed.entries.map(normalizeEntry)
                : [],
        };
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return defaultState();
        }

        if (error instanceof SyntaxError) {
            await atomicWrite(MEMORY_FILE, JSON.stringify(defaultState(), null, 2));
            return defaultState();
        }

        throw error;
    }
}

async function writeState(state) {
    await ensureMemoryRoot();
    await atomicWrite(MEMORY_FILE, JSON.stringify(state, null, 2));
}

function enqueueMemoryMutation(mutator) {
    const scheduled = memoryMutationQueue.then(async () => {
        const state = await readState();
        const result = await mutator(state);
        const nextState = result?.state || state;
        await writeState(nextState);
        return result?.value ?? null;
    });

    memoryMutationQueue = scheduled.catch(() => {});
    return scheduled;
}

function computeMemoryScore(entry, {
    uid = '',
    fid = '',
    threadKey = '',
    capabilityIds = [],
    question = '',
} = {}) {
    let score = 0;

    if (uid && entry.uid === uid) {
        score += 6;
    }
    if (fid && entry.fid === fid) {
        score += 2;
    }
    if (threadKey && entry.threadKey === threadKey) {
        score += 3;
    }
    if (capabilityIds.some((id) => entry.capabilityIds.includes(id))) {
        score += 3;
    }

    const haystack = `${entry.title} ${entry.summary} ${entry.detail} ${entry.tags.join(' ')}`.toLowerCase();
    const keywords = String(question || '')
        .toLowerCase()
        .split(/[\s,，。；、:：/]+/)
        .filter((item) => item.length > 1);

    keywords.forEach((keyword) => {
        if (haystack.includes(keyword)) {
            score += 2;
        }
    });

    if (entry.lastUsedAt) {
        score += 1;
    }

    if (entry.memoryLayer === 'compressed') {
        score += 2;
    }

    if (entry.memoryType === 'user_preference') {
        score += 2;
    }

    if (entry.priorityBand === 'critical') {
        score += 3;
    } else if (entry.priorityBand === 'high') {
        score += 2;
    }

    score += Math.min(4, Number(entry.importance || 0));
    return score;
}

function buildSnapshotMarkdown(groups = {}) {
    const orderedGroups = [
        ['compressed', '跨周期摘要'],
        ['workflow_hint', '流程线索'],
        ['task_result', '直接相关任务'],
        ['user_preference', '用户偏好'],
        ['reading_context', '阅读上下文'],
    ];

    const groupItems = orderedGroups
        .map(([key, label]) => ({
            key,
            label,
            items: Array.isArray(groups[key]) ? groups[key] : [],
        }))
        .filter((group) => group.items.length > 0);

    if (!groupItems.length) {
        return '';
    }

    return [
        '## 服务端长期记忆',
        ...groupItems.map((group) => [
            `### ${group.label}`,
            ...group.items.map((entry, index) => (
                [
                    `${index + 1}. ${entry.title}`,
                    `- 摘要：${entry.summary || '暂无摘要'}`,
                    entry.detail ? `- 线索：${truncate(entry.detail, 160)}` : '',
                ].filter(Boolean).join('\n')
            )),
        ].join('\n\n')),
    ].join('\n\n');
}

function buildTaskMemoryEntry(task = {}, options = {}) {
    const artifactSummary = Array.isArray(task.artifacts)
        ? task.artifacts
            .map((item) => truncate(item.content || item.href || ''))
            .filter(Boolean)
            .slice(0, 3)
            .join(' | ')
        : '';

    const detail = [
        task.resultSummary ? `结果摘要：${task.resultSummary}` : '',
        Array.isArray(task.reasoning) && task.reasoning.length ? `调度判断：${task.reasoning.join('；')}` : '',
        artifactSummary ? `关键产出：${artifactSummary}` : '',
    ].filter(Boolean).join('\n');

    const failedSteps = Array.isArray(task.steps)
        ? task.steps.filter((step) => step.status === 'failed').length
        : 0;
    const status = String(task.status || '').trim();

    return {
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
            ...(failedSteps > 0 ? ['存在失败步骤'] : []),
        ],
        source: 'firefly_task',
        memoryLayer: 'raw',
        memoryType: status === 'failed' || task.planMetadata?.isResume ? 'workflow_hint' : 'task_result',
        anchorType: 'task',
        visibility: 'runtime',
        retentionPolicy: 'rolling',
        priorityBand: status === 'failed' ? 'high' : status === 'completed' ? 'standard' : 'working',
        sourceTaskIds: [task.id],
        importance: status === 'completed' ? 4 : status === 'failed' ? 2 : 3,
        updatedAt: now(),
        createdAt: task.createdAt || now(),
        lastUsedAt: now(),
    };
}

function buildCompressedThreadMemoryEntry(task = {}, rawEntries = []) {
    const entries = rawEntries
        .filter((entry) => entry.threadKey === task.threadKey)
        .slice(0, 6);

    if (!entries.length || !task.threadKey) {
        return null;
    }

    const titles = entries.map((entry) => entry.title).filter(Boolean).slice(0, 3);
    const summaries = entries.map((entry) => entry.summary).filter(Boolean).slice(0, 4);
    const dominantTags = [...new Set(entries.flatMap((entry) => entry.tags || []).filter(Boolean))].slice(0, 5);
    const capabilityIds = [...new Set(entries.flatMap((entry) => entry.capabilityIds || []).filter(Boolean))];

    return {
        id: `thread-summary:${task.threadKey}`,
        uid: entries[0]?.uid || '',
        fid: entries[0]?.fid || '',
        taskId: task.id,
        sessionId: task.sessionId || '',
        threadKey: task.threadKey,
        title: `跨周期任务摘要：${task.title || task.threadKey}`,
        summary: truncate([
            titles.length ? `最近任务：${titles.join('、')}` : '',
            summaries.length ? `核心结论：${summaries.join('；')}` : '',
        ].filter(Boolean).join('｜'), 220),
        detail: [
            summaries.length ? `聚合结果：${summaries.join('；')}` : '',
            dominantTags.length ? `高频线索：${dominantTags.join('、')}` : '',
        ].filter(Boolean).join('\n'),
        capabilityIds,
        tags: [...dominantTags, '跨周期摘要'],
        source: 'firefly_memory_compression',
        memoryLayer: 'compressed',
        memoryType: 'workflow_hint',
        anchorType: 'thread',
        visibility: 'runtime',
        retentionPolicy: 'compressed_rollup',
        priorityBand: 'high',
        sourceTaskIds: entries.map((entry) => entry.taskId).filter(Boolean),
        importance: 5,
        updatedAt: now(),
        createdAt: entries[entries.length - 1]?.createdAt || now(),
        lastUsedAt: now(),
    };
}

function pickMemoryGroups(scoredEntries = [], limit = 4) {
    const buckets = {
        compressed: [],
        workflow_hint: [],
        task_result: [],
        user_preference: [],
        reading_context: [],
        other: [],
    };

    scoredEntries.forEach(({ entry }) => {
        if (entry.memoryLayer === 'compressed') {
            buckets.compressed.push(entry);
            return;
        }

        if (buckets[entry.memoryType]) {
            buckets[entry.memoryType].push(entry);
            return;
        }

        buckets.other.push(entry);
    });

    const selected = [];
    const seen = new Set();
    const order = [
        ['compressed', 1],
        ['workflow_hint', 1],
        ['task_result', 2],
        ['user_preference', 1],
        ['reading_context', 1],
        ['other', 1],
    ];

    order.forEach(([key, quota]) => {
        buckets[key].slice(0, quota).forEach((entry) => {
            if (!seen.has(entry.id) && selected.length < limit) {
                seen.add(entry.id);
                selected.push(entry);
            }
        });
    });

    scoredEntries.forEach(({ entry }) => {
        if (!seen.has(entry.id) && selected.length < limit) {
            seen.add(entry.id);
            selected.push(entry);
        }
    });

    return {
        items: selected,
        groups: {
            compressed: selected.filter((entry) => entry.memoryLayer === 'compressed'),
            workflow_hint: selected.filter((entry) => entry.memoryLayer !== 'compressed' && entry.memoryType === 'workflow_hint'),
            task_result: selected.filter((entry) => entry.memoryType === 'task_result'),
            user_preference: selected.filter((entry) => entry.memoryType === 'user_preference'),
            reading_context: selected.filter((entry) => entry.memoryType === 'reading_context'),
        },
    };
}

export async function listFireflyMemoryEntries() {
    await memoryMutationQueue.catch(() => {});
    const state = await readState();
    return sortEntries(state.entries || []);
}

export async function upsertFireflyMemoryEntry(entry = {}, options = {}) {
    const config = loadAdminAgentRuntimeConfig();
    const maxEntries = Math.max(20, Number(options.maxEntries || config.memory?.maxEntries || 120));
    const normalized = normalizeEntry(entry);

    return enqueueMemoryMutation(async (state) => {
        state.entries = limitEntries(
            [normalized, ...(state.entries || []).filter((item) => item.id !== normalized.id)],
            maxEntries
        );

        return {
            state,
            value: normalized,
        };
    });
}

export async function touchFireflyMemoryEntries(memoryIds = []) {
    const ids = normalizeArray(memoryIds);
    if (!ids.length) {
        return [];
    }

    return enqueueMemoryMutation(async (state) => {
        const touchedAt = now();
        let touched = [];

        state.entries = (state.entries || []).map((entry) => {
            if (!ids.includes(entry.id)) {
                return entry;
            }

            const nextEntry = {
                ...entry,
                lastUsedAt: touchedAt,
                updatedAt: touchedAt,
            };
            touched.push(nextEntry);
            return nextEntry;
        });

        state.entries = sortEntries(state.entries || []);

        return {
            state,
            value: touched,
        };
    });
}

export async function rememberFireflyServerTask(task = {}, options = {}) {
    if (!task?.id) {
        return null;
    }

    const config = loadAdminAgentRuntimeConfig();
    if (!config.memory?.enabled || !config.memory?.retainTaskMemory) {
        return null;
    }

    const taskEntry = buildTaskMemoryEntry(task, options);
    const saved = await upsertFireflyMemoryEntry(taskEntry, {
        maxEntries: config.memory.maxEntries,
    });
    const entries = await listFireflyMemoryEntries();
    const compressedThreadEntry = buildCompressedThreadMemoryEntry(task, entries);

    if (compressedThreadEntry) {
        await upsertFireflyMemoryEntry(compressedThreadEntry, {
            maxEntries: config.memory.maxEntries,
        });
    }

    return saved;
}

export async function buildFireflyServerMemorySnapshot({
    uid = '',
    fid = '',
    threadKey = '',
    capabilityIds = [],
    question = '',
    limit,
} = {}) {
    const config = loadAdminAgentRuntimeConfig();
    if (!config.memory?.enabled) {
        return {
            items: [],
            markdown: '',
        };
    }

    const topK = Math.max(1, Number(limit || config.memory.injectTopK || 4));
    const scored = (await listFireflyMemoryEntries())
        .map((entry) => ({
            entry,
            score: computeMemoryScore(entry, {
                uid,
                fid,
                threadKey,
                capabilityIds,
                question,
            }),
        }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }

            return new Date(right.entry.updatedAt).getTime() - new Date(left.entry.updatedAt).getTime();
        });

    const matched = pickMemoryGroups(scored, topK);

    if (matched.items.length) {
        await touchFireflyMemoryEntries(matched.items.map((entry) => entry.id));
    }

    return {
        items: matched.items,
        groups: matched.groups,
        markdown: buildSnapshotMarkdown(matched.groups),
    };
}

export async function buildFireflyMemoryMetrics() {
    const entries = await listFireflyMemoryEntries();
    const typeCounts = entries.reduce((acc, item) => {
        const key = item.memoryType || 'task_result';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    return {
        total: entries.length,
        recentTitles: entries.slice(0, 3).map((item) => item.title),
        compressed: entries.filter((item) => item.memoryLayer === 'compressed').length,
        typed: Object.entries(typeCounts)
            .map(([id, count]) => ({ id, count }))
            .sort((left, right) => right.count - left.count)
            .slice(0, MAX_TYPES),
    };
}

export function getFireflyMemoryStorageMeta() {
    return {
        root: MEMORY_ROOT,
        memoryFile: MEMORY_FILE,
    };
}
