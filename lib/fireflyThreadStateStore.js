import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const THREAD_RUNTIME_ROOT = path.join(process.cwd(), '.runtime', 'firefly');
const THREAD_ROOT = path.join(THREAD_RUNTIME_ROOT, 'threads');
const THREAD_STATE_FILE = path.join(THREAD_RUNTIME_ROOT, 'thread-state.json');
const MAX_THREADS = 120;

let threadStateMutationQueue = Promise.resolve();

function now() {
    return new Date().toISOString();
}

function buildId(prefix = 'firefly-thread') {
    return `${prefix}-${crypto.randomUUID()}`;
}

function sanitizeThreadKey(value = 'default') {
    const normalized = String(value || 'default').trim();
    return normalized.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'default';
}

function defaultState() {
    return {
        threads: [],
    };
}

function normalizeArray(value = []) {
    return Array.isArray(value)
        ? value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
        : [];
}

function normalizeTodos(value = []) {
    return Array.isArray(value)
        ? value
            .filter(Boolean)
            .map((item, index) => ({
                id: String(item.id || `todo-${index + 1}`).trim(),
                label: String(item.label || `任务 ${index + 1}`).trim(),
                status: String(item.status || 'pending').trim(),
                summary: String(item.summary || '').trim(),
                linkedToolIds: normalizeArray(item.linkedToolIds),
                updatedAt: item.updatedAt || now(),
            }))
        : [];
}

function normalizeArtifacts(value = []) {
    return Array.isArray(value)
        ? value
            .filter(Boolean)
            .map((item, index) => ({
                id: String(item.id || `artifact-${index + 1}`).trim(),
                label: String(item.label || item.type || `产物 ${index + 1}`).trim(),
                href: String(item.href || '').trim(),
                type: String(item.type || 'summary').trim(),
                fileName: String(item.fileName || '').trim(),
                relativePath: String(item.relativePath || '').trim(),
                mimeType: String(item.mimeType || '').trim(),
                size: Number(item.size || 0),
                summary: String(item.summary || '').trim(),
                updatedAt: item.updatedAt || now(),
            }))
        : [];
}

function sanitizeFileSegment(value = '', fallback = 'artifact') {
    const normalized = String(value || '').trim().toLowerCase();
    const safe = normalized
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);

    return safe || fallback;
}

function inferArtifactExtension(type = '') {
    if (type === 'markdown' || type === 'report') {
        return 'md';
    }
    if (type === 'json') {
        return 'json';
    }
    if (type === 'html') {
        return 'html';
    }
    if (type === 'text' || type === 'summary') {
        return 'txt';
    }

    return 'md';
}

function inferMimeType(extension = 'txt') {
    if (extension === 'md') return 'text/markdown; charset=utf-8';
    if (extension === 'json') return 'application/json; charset=utf-8';
    if (extension === 'html') return 'text/html; charset=utf-8';
    return 'text/plain; charset=utf-8';
}

function buildArtifactFileName({
    label = '',
    type = '',
    extension = '',
} = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeLabel = sanitizeFileSegment(label, 'artifact');
    const safeExtension = sanitizeFileSegment(extension || inferArtifactExtension(type), 'txt');
    return `${timestamp}-${safeLabel}.${safeExtension}`;
}

export function buildFireflyThreadPaths(threadKey = 'default') {
    const safeThreadKey = sanitizeThreadKey(threadKey);
    const baseDir = path.join(THREAD_ROOT, safeThreadKey);

    return {
        safeThreadKey,
        baseDir,
        workspacePath: path.join(baseDir, 'workspace'),
        uploadsPath: path.join(baseDir, 'uploads'),
        outputsPath: path.join(baseDir, 'outputs'),
    };
}

function normalizeThreadRecord(record = {}) {
    return {
        id: String(record.id || buildId()).trim(),
        threadKey: String(record.threadKey || 'default').trim(),
        title: String(record.title || '').trim(),
        status: String(record.status || 'idle').trim(),
        uid: String(record.uid || '').trim(),
        fid: String(record.fid || '').trim(),
        workspacePath: String(record.workspacePath || '').trim(),
        uploadsPath: String(record.uploadsPath || '').trim(),
        outputsPath: String(record.outputsPath || '').trim(),
        capabilityIds: normalizeArray(record.capabilityIds),
        memoryIds: normalizeArray(record.memoryIds),
        artifacts: normalizeArtifacts(record.artifacts),
        todos: normalizeTodos(record.todos),
        checkpointSummary: String(record.checkpointSummary || '').trim(),
        latestCheckpoint: record.latestCheckpoint && typeof record.latestCheckpoint === 'object'
            ? {
                id: String(record.latestCheckpoint.id || '').trim(),
                label: String(record.latestCheckpoint.label || '').trim(),
                summary: String(record.latestCheckpoint.summary || '').trim(),
                status: String(record.latestCheckpoint.status || '').trim(),
                batchIndex: Number(record.latestCheckpoint.batchIndex || 0),
                stepIds: normalizeArray(record.latestCheckpoint.stepIds),
                subtaskIds: normalizeArray(record.latestCheckpoint.subtaskIds),
                workerIds: normalizeArray(record.latestCheckpoint.workerIds),
                subagentRunIds: normalizeArray(record.latestCheckpoint.subagentRunIds),
                createdAt: String(record.latestCheckpoint.createdAt || '').trim(),
            }
            : null,
        lastTaskId: String(record.lastTaskId || '').trim(),
        lastRunId: String(record.lastRunId || '').trim(),
        contextSnapshot: record.contextSnapshot && typeof record.contextSnapshot === 'object' ? record.contextSnapshot : {},
        createdAt: record.createdAt || now(),
        updatedAt: record.updatedAt || record.createdAt || now(),
    };
}

async function ensureRuntimeRoot() {
    await fs.mkdir(THREAD_RUNTIME_ROOT, { recursive: true });
}

async function ensureThreadDirs(paths = {}) {
    await Promise.all([
        fs.mkdir(paths.baseDir, { recursive: true }),
        fs.mkdir(paths.workspacePath, { recursive: true }),
        fs.mkdir(paths.uploadsPath, { recursive: true }),
        fs.mkdir(paths.outputsPath, { recursive: true }),
    ]);
}

async function atomicWrite(filePath, content) {
    const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFilePath, content, 'utf8');
    await fs.rename(tempFilePath, filePath);
}

async function readState() {
    await ensureRuntimeRoot();

    try {
        const raw = await fs.readFile(THREAD_STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            ...defaultState(),
            ...(parsed || {}),
            threads: Array.isArray(parsed?.threads)
                ? parsed.threads.map(normalizeThreadRecord)
                : [],
        };
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return defaultState();
        }

        if (error instanceof SyntaxError) {
            await atomicWrite(THREAD_STATE_FILE, JSON.stringify(defaultState(), null, 2));
            return defaultState();
        }

        throw error;
    }
}

async function writeState(state) {
    await ensureRuntimeRoot();
    await atomicWrite(THREAD_STATE_FILE, JSON.stringify(state, null, 2));
}

function enqueueThreadMutation(mutator) {
    const scheduled = threadStateMutationQueue.then(async () => {
        const state = await readState();
        const result = await mutator(state);
        const nextState = result?.state || state;
        await writeState(nextState);
        return result?.value ?? null;
    });

    threadStateMutationQueue = scheduled.catch(() => {});
    return scheduled;
}

function mergeThreadRecord(existing = {}, patch = {}) {
    return normalizeThreadRecord({
        ...existing,
        ...patch,
        capabilityIds: patch.capabilityIds !== undefined ? patch.capabilityIds : existing.capabilityIds,
        memoryIds: patch.memoryIds !== undefined ? patch.memoryIds : existing.memoryIds,
        artifacts: patch.artifacts !== undefined ? patch.artifacts : existing.artifacts,
        todos: patch.todos !== undefined ? patch.todos : existing.todos,
        contextSnapshot: patch.contextSnapshot !== undefined ? patch.contextSnapshot : existing.contextSnapshot,
        updatedAt: now(),
    });
}

export async function ensureFireflyThreadState({
    threadKey = 'default',
    title = '',
    status = 'idle',
    uid = '',
    fid = '',
    capabilityIds = [],
    contextSnapshot = {},
} = {}) {
    const paths = buildFireflyThreadPaths(threadKey);
    await ensureThreadDirs(paths);

    return enqueueThreadMutation(async (state) => {
        const existing = state.threads.find((item) => item.threadKey === threadKey);
        const nextRecord = mergeThreadRecord(existing || {
            id: buildId(),
            threadKey,
            createdAt: now(),
        }, {
            title,
            status,
            uid,
            fid,
            capabilityIds,
            workspacePath: paths.workspacePath,
            uploadsPath: paths.uploadsPath,
            outputsPath: paths.outputsPath,
            contextSnapshot,
        });

        return {
            state: {
                ...state,
                threads: [
                    nextRecord,
                    ...state.threads.filter((item) => item.threadKey !== threadKey),
                ].slice(0, MAX_THREADS),
            },
            value: nextRecord,
        };
    });
}

export async function patchFireflyThreadState(threadKey = 'default', patch = {}) {
    const paths = buildFireflyThreadPaths(threadKey);
    await ensureThreadDirs(paths);

    return enqueueThreadMutation(async (state) => {
        const existing = state.threads.find((item) => item.threadKey === threadKey);
        const nextRecord = mergeThreadRecord(existing || {
            id: buildId(),
            threadKey,
            createdAt: now(),
            workspacePath: paths.workspacePath,
            uploadsPath: paths.uploadsPath,
            outputsPath: paths.outputsPath,
        }, {
            ...patch,
            workspacePath: patch.workspacePath || existing?.workspacePath || paths.workspacePath,
            uploadsPath: patch.uploadsPath || existing?.uploadsPath || paths.uploadsPath,
            outputsPath: patch.outputsPath || existing?.outputsPath || paths.outputsPath,
        });

        return {
            state: {
                ...state,
                threads: [
                    nextRecord,
                    ...state.threads.filter((item) => item.threadKey !== threadKey),
                ].slice(0, MAX_THREADS),
            },
            value: nextRecord,
        };
    });
}

export async function getFireflyThreadState(threadKey = 'default') {
    const state = await readState();
    return state.threads.find((item) => item.threadKey === threadKey) || null;
}

export async function persistFireflyThreadArtifact({
    threadKey = 'default',
    label = '',
    type = 'markdown',
    content = '',
    extension = '',
} = {}) {
    const paths = buildFireflyThreadPaths(threadKey);
    await ensureThreadDirs(paths);

    const fileName = buildArtifactFileName({
        label,
        type,
        extension,
    });
    const filePath = path.join(paths.outputsPath, fileName);
    const serializedContent = String(content || '');

    await fs.writeFile(filePath, serializedContent, 'utf8');

    return {
        fileName,
        filePath,
        relativePath: path.join('outputs', fileName),
        href: `/api/firefly/runtime/artifacts?threadKey=${encodeURIComponent(threadKey)}&file=${encodeURIComponent(fileName)}`,
        mimeType: inferMimeType(fileName.split('.').pop() || inferArtifactExtension(type)),
        size: Buffer.byteLength(serializedContent, 'utf8'),
        outputsPath: paths.outputsPath,
    };
}

export async function readFireflyThreadArtifact({
    threadKey = 'default',
    fileName = '',
} = {}) {
    const paths = buildFireflyThreadPaths(threadKey);
    const safeFileName = path.basename(String(fileName || '').trim());

    if (!safeFileName) {
        throw new Error('缺少产物文件名。');
    }

    const targetPath = path.join(paths.outputsPath, safeFileName);
    const content = await fs.readFile(targetPath, 'utf8');
    const extension = safeFileName.split('.').pop() || 'txt';

    return {
        fileName: safeFileName,
        filePath: targetPath,
        mimeType: inferMimeType(extension),
        content,
    };
}
