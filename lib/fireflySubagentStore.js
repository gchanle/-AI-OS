import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const SUBAGENT_ROOT = path.join(process.cwd(), '.runtime', 'firefly');
const SUBAGENT_STATE_FILE = path.join(SUBAGENT_ROOT, 'subagent-state.json');
const MAX_SUBAGENT_RUNS = 400;

let subagentMutationQueue = Promise.resolve();

function now() {
    return new Date().toISOString();
}

function buildId(prefix = 'subagent') {
    return `${prefix}-${crypto.randomUUID()}`;
}

function defaultState() {
    return {
        runs: [],
    };
}

function normalizeRun(record = {}) {
    return {
        id: String(record.id || buildId('subagent-run')).trim(),
        traceId: String(record.traceId || buildId('trace')).trim(),
        threadKey: String(record.threadKey || 'default').trim(),
        parentTaskId: String(record.parentTaskId || '').trim(),
        parentRunId: String(record.parentRunId || '').trim(),
        stepId: String(record.stepId || '').trim(),
        subtaskId: String(record.subtaskId || '').trim(),
        workerId: String(record.workerId || '').trim(),
        toolId: String(record.toolId || '').trim(),
        label: String(record.label || 'Firefly Subagent').trim(),
        status: String(record.status || 'pending').trim(),
        summary: String(record.summary || '').trim(),
        error: String(record.error || '').trim(),
        createdAt: record.createdAt || now(),
        updatedAt: record.updatedAt || record.createdAt || now(),
        completedAt: record.completedAt || '',
    };
}

async function ensureRoot() {
    await fs.mkdir(SUBAGENT_ROOT, { recursive: true });
}

async function atomicWrite(filePath, content) {
    const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFilePath, content, 'utf8');
    await fs.rename(tempFilePath, filePath);
}

async function readState() {
    await ensureRoot();

    try {
        const raw = await fs.readFile(SUBAGENT_STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            ...defaultState(),
            ...(parsed || {}),
            runs: Array.isArray(parsed?.runs) ? parsed.runs.map(normalizeRun) : [],
        };
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return defaultState();
        }

        if (error instanceof SyntaxError) {
            await atomicWrite(SUBAGENT_STATE_FILE, JSON.stringify(defaultState(), null, 2));
            return defaultState();
        }

        throw error;
    }
}

async function writeState(state) {
    await ensureRoot();
    await atomicWrite(SUBAGENT_STATE_FILE, JSON.stringify(state, null, 2));
}

function enqueueMutation(mutator) {
    const scheduled = subagentMutationQueue.then(async () => {
        const state = await readState();
        const result = await mutator(state);
        await writeState(result?.state || state);
        return result?.value ?? null;
    });

    subagentMutationQueue = scheduled.catch(() => {});
    return scheduled;
}

export async function createFireflySubagentRun(record = {}) {
    const nextRun = normalizeRun(record);

    return enqueueMutation(async (state) => ({
        state: {
            ...state,
            runs: [nextRun, ...state.runs.filter((item) => item.id !== nextRun.id)].slice(0, MAX_SUBAGENT_RUNS),
        },
        value: nextRun,
    }));
}

export async function patchFireflySubagentRun(runId = '', patch = {}) {
    return enqueueMutation(async (state) => {
        const existing = state.runs.find((item) => item.id === runId);
        const nextRun = normalizeRun({
            ...(existing || { id: runId || buildId('subagent-run'), createdAt: now() }),
            ...patch,
            id: runId || existing?.id || buildId('subagent-run'),
            updatedAt: now(),
        });

        return {
            state: {
                ...state,
                runs: [nextRun, ...state.runs.filter((item) => item.id !== nextRun.id)].slice(0, MAX_SUBAGENT_RUNS),
            },
            value: nextRun,
        };
    });
}

export async function listFireflySubagentRuns(threadKey = '') {
    const state = await readState();
    if (!threadKey) {
        return state.runs;
    }

    return state.runs.filter((item) => item.threadKey === threadKey);
}
