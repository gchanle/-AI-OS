import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const TOOLBELT_ROOT = path.join(process.cwd(), '.runtime', 'firefly');
const TOOLBELT_FILE = path.join(TOOLBELT_ROOT, 'toolbelt-state.json');

let toolbeltMutationQueue = Promise.resolve();

function now() {
    return new Date().toISOString();
}

function buildId(prefix = 'toolbelt') {
    return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeArray(value) {
    return Array.isArray(value)
        ? value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
        : [];
}

function normalizeToolRecord(record = {}) {
    const firstSeenAt = record.firstSeenAt || now();
    const updatedAt = record.updatedAt || firstSeenAt;

    return {
        id: String(record.id || buildId('tool-state')).trim(),
        uid: String(record.uid || '').trim(),
        fid: String(record.fid || '').trim(),
        threadKey: String(record.threadKey || '').trim(),
        toolId: String(record.toolId || '').trim(),
        label: String(record.label || record.toolId || '未命名工具').trim(),
        pinned: Boolean(record.pinned),
        leased: Boolean(record.leased),
        leaseReason: String(record.leaseReason || '').trim(),
        lastOutcome: String(record.lastOutcome || 'idle').trim(),
        lastSummary: String(record.lastSummary || '').trim(),
        successCount: Math.max(0, Number(record.successCount || 0)),
        failureCount: Math.max(0, Number(record.failureCount || 0)),
        lastUsedAt: record.lastUsedAt || null,
        firstSeenAt,
        updatedAt,
        tags: normalizeArray(record.tags),
    };
}

function normalizeState(state = {}) {
    return {
        tools: Array.isArray(state.tools)
            ? state.tools.map(normalizeToolRecord).filter((item) => item.toolId)
            : [],
    };
}

function sortTools(tools = []) {
    return [...tools].sort((left, right) => {
        const leftPin = left.pinned ? 1 : 0;
        const rightPin = right.pinned ? 1 : 0;
        if (rightPin !== leftPin) {
            return rightPin - leftPin;
        }

        const leftLease = left.leased ? 1 : 0;
        const rightLease = right.leased ? 1 : 0;
        if (rightLease !== leftLease) {
            return rightLease - leftLease;
        }

        const leftScore = Number(left.successCount || 0) - Number(left.failureCount || 0);
        const rightScore = Number(right.successCount || 0) - Number(right.failureCount || 0);
        if (rightScore !== leftScore) {
            return rightScore - leftScore;
        }

        const leftTime = new Date(left.updatedAt || left.lastUsedAt || left.firstSeenAt || 0).getTime();
        const rightTime = new Date(right.updatedAt || right.lastUsedAt || right.firstSeenAt || 0).getTime();
        return rightTime - leftTime;
    });
}

async function ensureToolbeltRoot() {
    await fs.mkdir(TOOLBELT_ROOT, { recursive: true });
}

async function atomicWrite(filePath, content) {
    const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFilePath, content, 'utf8');
    await fs.rename(tempFilePath, filePath);
}

async function readState() {
    await ensureToolbeltRoot();

    try {
        const raw = await fs.readFile(TOOLBELT_FILE, 'utf8');
        return normalizeState(JSON.parse(raw));
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return normalizeState();
        }

        if (error instanceof SyntaxError) {
            await atomicWrite(TOOLBELT_FILE, JSON.stringify(normalizeState(), null, 2));
            return normalizeState();
        }

        throw error;
    }
}

async function writeState(state) {
    await ensureToolbeltRoot();
    await atomicWrite(TOOLBELT_FILE, JSON.stringify(normalizeState(state), null, 2));
}

function enqueueToolbeltMutation(mutator) {
    const scheduled = toolbeltMutationQueue.then(async () => {
        const state = await readState();
        const result = await mutator(normalizeState(state));
        const nextState = result?.state || state;
        await writeState(nextState);
        return result?.value ?? null;
    });

    toolbeltMutationQueue = scheduled.catch(() => {});
    return scheduled;
}

function buildToolKey({ uid = '', fid = '', threadKey = '', toolId = '' } = {}) {
    return `${uid}::${fid}::${threadKey}::${toolId}`;
}

function filterToolbeltRecords(records = [], { uid = '', fid = '', threadKey = '' } = {}) {
    return records.filter((item) => {
        if (uid && item.uid && item.uid !== uid) {
            return false;
        }
        if (fid && item.fid && item.fid !== fid) {
            return false;
        }
        if (threadKey && item.threadKey && item.threadKey !== threadKey) {
            return false;
        }
        return true;
    });
}

export async function listFireflyToolbeltRecords(scope = {}) {
    await toolbeltMutationQueue.catch(() => {});
    const state = await readState();
    return sortTools(filterToolbeltRecords(state.tools || [], scope));
}

export async function upsertFireflyToolbeltRecord(record = {}) {
    const normalized = normalizeToolRecord(record);
    if (!normalized.toolId) {
        return null;
    }

    return enqueueToolbeltMutation(async (state) => {
        const nextKey = buildToolKey(normalized);
        const nextTools = [];
        let merged = normalized;

        (state.tools || []).forEach((item) => {
            const existingKey = buildToolKey(item);
            if (existingKey === nextKey) {
                merged = normalizeToolRecord({
                    ...item,
                    ...normalized,
                    id: item.id || normalized.id,
                    firstSeenAt: item.firstSeenAt || normalized.firstSeenAt,
                    updatedAt: now(),
                });
                nextTools.push(merged);
                return;
            }

            nextTools.push(item);
        });

        if (!nextTools.find((item) => buildToolKey(item) === nextKey)) {
            nextTools.push(merged);
        }

        state.tools = sortTools(nextTools);
        return {
            state,
            value: merged,
        };
    });
}

export async function markFireflyToolbeltOutcome({
    uid = '',
    fid = '',
    threadKey = '',
    toolId = '',
    label = '',
    outcome = 'idle',
    summary = '',
} = {}) {
    if (!toolId) {
        return null;
    }

    const existing = (await listFireflyToolbeltRecords({ uid, fid, threadKey }))
        .find((item) => item.toolId === toolId);

    return upsertFireflyToolbeltRecord({
        ...(existing || {}),
        uid,
        fid,
        threadKey,
        toolId,
        label: label || existing?.label || toolId,
        lastOutcome: outcome,
        lastSummary: summary,
        lastUsedAt: now(),
        successCount: Number(existing?.successCount || 0) + (outcome === 'success' ? 1 : 0),
        failureCount: Number(existing?.failureCount || 0) + (outcome === 'failed' ? 1 : 0),
        updatedAt: now(),
    });
}

export async function setFireflyToolPinned({
    uid = '',
    fid = '',
    threadKey = '',
    toolId = '',
    label = '',
    pinned = false,
} = {}) {
    if (!toolId) {
        return null;
    }

    const existing = (await listFireflyToolbeltRecords({ uid, fid, threadKey }))
        .find((item) => item.toolId === toolId);

    return upsertFireflyToolbeltRecord({
        ...(existing || {}),
        uid,
        fid,
        threadKey,
        toolId,
        label: label || existing?.label || toolId,
        pinned,
        updatedAt: now(),
    });
}

export async function setFireflyToolLeased({
    uid = '',
    fid = '',
    threadKey = '',
    toolId = '',
    label = '',
    leased = false,
    leaseReason = '',
} = {}) {
    if (!toolId) {
        return null;
    }

    const existing = (await listFireflyToolbeltRecords({ uid, fid, threadKey }))
        .find((item) => item.toolId === toolId);

    return upsertFireflyToolbeltRecord({
        ...(existing || {}),
        uid,
        fid,
        threadKey,
        toolId,
        label: label || existing?.label || toolId,
        leased,
        leaseReason: leased ? leaseReason : '',
        updatedAt: now(),
    });
}

export async function buildFireflyToolbeltSnapshot({
    uid = '',
    fid = '',
    threadKey = '',
} = {}) {
    const items = await listFireflyToolbeltRecords({ uid, fid, threadKey });
    const pinnedToolIds = items.filter((item) => item.pinned).map((item) => item.toolId);
    const leasedToolIds = items.filter((item) => item.leased).map((item) => item.toolId);
    const preferredToolIds = sortTools(items)
        .filter((item) => item.pinned || item.leased || item.successCount > 0 || item.lastOutcome === 'success')
        .map((item) => item.toolId)
        .slice(0, 6);

    return {
        items,
        pinnedToolIds,
        leasedToolIds,
        preferredToolIds,
        strategy: {
            pinnedCount: pinnedToolIds.length,
            leasedCount: leasedToolIds.length,
            learnedCount: items.filter((item) => item.successCount > 0 || item.failureCount > 0).length,
        },
    };
}

export function getFireflyToolbeltStorageMeta() {
    return {
        root: TOOLBELT_ROOT,
        toolbeltFile: TOOLBELT_FILE,
    };
}
