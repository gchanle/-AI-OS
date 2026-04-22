import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
    buildDefaultFireflyControlPlanePrefs,
    normalizeFireflyControlPlanePresetId,
} from '@/lib/fireflyControlPlanePresets';

const CLIENT_STATE_ROOT = path.join(process.cwd(), '.runtime', 'firefly');
const CLIENT_STATE_FILE = path.join(CLIENT_STATE_ROOT, 'client-state.json');
const MAX_CHAT_SESSIONS = 120;
const MAX_GOVERNANCE_EVENTS = 24;
const DEFAULT_CONTROL_PLANE_PREFS = buildDefaultFireflyControlPlanePrefs();

let clientStateMutationQueue = Promise.resolve();

function now() {
    return new Date().toISOString();
}

function defaultState() {
    return {
        users: {},
    };
}

function sanitizeKey(value = '') {
    const normalized = String(value || '').trim();
    return normalized.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'anonymous-demo-user';
}

function buildUserKey(uid = '', fid = '') {
    const safeUid = sanitizeKey(uid || 'anonymous-demo-user');
    const safeFid = sanitizeKey(fid || 'anonymous-demo-fid');
    return `${safeUid}::${safeFid}`;
}

function normalizeCapabilityIds(capabilityIds = []) {
    return Array.isArray(capabilityIds)
        ? capabilityIds.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
        : [];
}

function normalizeMessage(message = {}) {
    return {
        role: String(message.role || '').trim() || 'ai',
        content: String(message.content || '').trim(),
        time: message.time || now(),
        modelId: String(message.modelId || '').trim(),
        messageKind: String(message.messageKind || '').trim(),
        streaming: Boolean(message.streaming),
        runtimeTask: message.runtimeTask && typeof message.runtimeTask === 'object' ? message.runtimeTask : null,
        runtimePhase: String(message.runtimePhase || '').trim(),
        sourceRefs: Array.isArray(message.sourceRefs) ? message.sourceRefs : [],
        showGeneratedBy: Boolean(message.showGeneratedBy),
    };
}

function normalizeSessionMeta(meta = {}) {
    return {
        capabilityIds: normalizeCapabilityIds(meta.capabilityIds),
        modelId: String(meta.modelId || '').trim(),
        webSearchEnabled: Boolean(meta.webSearchEnabled),
        deepResearchEnabled: Boolean(meta.deepResearchEnabled),
        runtimeMode: String(meta.runtimeMode || '').trim(),
        responseMode: String(meta.responseMode || '').trim(),
    };
}

function normalizeChatSession(session = {}) {
    return {
        id: String(session.id || `session-${crypto.randomUUID()}`).trim(),
        title: String(session.title || '新对话').trim() || '新对话',
        date: String(session.date || '').trim(),
        updatedAt: session.updatedAt || now(),
        messages: Array.isArray(session.messages) ? session.messages.map(normalizeMessage) : [],
        meta: normalizeSessionMeta(session.meta || {}),
    };
}

function normalizeWorkspacePrefs(prefs = {}) {
    if (!prefs || typeof prefs !== 'object') {
        return {};
    }

    return {
        capabilityIds: normalizeCapabilityIds(prefs.capabilityIds),
        modelId: String(prefs.modelId || '').trim(),
        workspaceMode: String(prefs.workspaceMode || '').trim(),
        webSearchEnabled: Boolean(prefs.webSearchEnabled),
        deepResearchEnabled: Boolean(prefs.deepResearchEnabled),
        dashboardSections: Array.isArray(prefs.dashboardSections)
            ? prefs.dashboardSections.filter(Boolean).map((item) => String(item).trim())
            : [],
        dashboardLayoutVersion: String(prefs.dashboardLayoutVersion || '').trim(),
        updatedAt: prefs.updatedAt || now(),
    };
}

function normalizeBlockedToolIds(toolIds = []) {
    return Array.isArray(toolIds)
        ? toolIds.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
        : [];
}

function normalizeConfirmBeforeUseToolIds(toolIds = []) {
    return Array.isArray(toolIds)
        ? toolIds.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
        : [];
}

function normalizeControlPlanePrefs(prefs = {}) {
    const presetId = normalizeFireflyControlPlanePresetId(prefs?.presetId || DEFAULT_CONTROL_PLANE_PREFS.presetId);
    const injectTopK = Math.max(0, Math.min(8, Number(prefs?.memory?.injectTopK ?? DEFAULT_CONTROL_PLANE_PREFS.memory.injectTopK)));
    const defaultPriorityBand = ['working', 'standard', 'high', 'critical'].includes(String(prefs?.memory?.defaultPriorityBand || '').trim())
        ? String(prefs.memory.defaultPriorityBand).trim()
        : DEFAULT_CONTROL_PLANE_PREFS.memory.defaultPriorityBand;
    const selectionMode = ['auto', 'prefer_pinned', 'pinned_only'].includes(String(prefs?.tools?.selectionMode || '').trim())
        ? String(prefs.tools.selectionMode).trim()
        : DEFAULT_CONTROL_PLANE_PREFS.tools.selectionMode;
    const webSearchMode = ['auto', 'manual_only'].includes(String(prefs?.tools?.webSearchMode || '').trim())
        ? String(prefs.tools.webSearchMode).trim()
        : DEFAULT_CONTROL_PLANE_PREFS.tools.webSearchMode;

    return {
        presetId,
        memory: {
            injectTopK,
            autoRememberTasks: prefs?.memory?.autoRememberTasks !== false,
            defaultPriorityBand,
        },
        tools: {
            selectionMode,
            webSearchMode,
            blockedToolIds: normalizeBlockedToolIds(prefs?.tools?.blockedToolIds ?? DEFAULT_CONTROL_PLANE_PREFS.tools.blockedToolIds),
            confirmBeforeUseToolIds: normalizeConfirmBeforeUseToolIds(
                prefs?.tools?.confirmBeforeUseToolIds ?? DEFAULT_CONTROL_PLANE_PREFS.tools.confirmBeforeUseToolIds
            ),
        },
        updatedAt: prefs?.updatedAt || now(),
    };
}

function normalizeGovernanceEvent(event = {}) {
    return {
        id: String(event.id || `governance-${crypto.randomUUID()}`).trim(),
        kind: String(event.kind || '').trim(),
        label: String(event.label || '').trim(),
        detail: String(event.detail || '').trim(),
        scope: String(event.scope || 'user').trim(),
        action: String(event.action || '').trim(),
        threadKey: String(event.threadKey || '').trim(),
        taskId: String(event.taskId || '').trim(),
        metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
        createdAt: event.createdAt || now(),
    };
}

function mergeControlPlanePrefs(currentPrefs = {}, patchPrefs = {}) {
    const normalizedCurrent = normalizeControlPlanePrefs(currentPrefs);
    const hasPresetOverride = typeof patchPrefs?.presetId === 'string' && String(patchPrefs.presetId || '').trim();
    const shouldMarkCustom = !hasPresetOverride && (
        patchPrefs?.memory !== undefined
        || patchPrefs?.tools !== undefined
    );

    return normalizeControlPlanePrefs({
        ...normalizedCurrent,
        ...patchPrefs,
        memory: {
            ...normalizedCurrent.memory,
            ...(patchPrefs?.memory || {}),
        },
        tools: {
            ...normalizedCurrent.tools,
            ...(patchPrefs?.tools || {}),
        },
        presetId: hasPresetOverride
            ? String(patchPrefs.presetId || '').trim()
            : (shouldMarkCustom ? 'custom' : normalizedCurrent.presetId),
        updatedAt: now(),
    });
}

function normalizeUserState(state = {}) {
    return {
        workspacePrefs: normalizeWorkspacePrefs(state.workspacePrefs || {}),
        controlPlanePrefs: normalizeControlPlanePrefs(state.controlPlanePrefs || {}),
        governanceEvents: Array.isArray(state.governanceEvents)
            ? state.governanceEvents
                .map(normalizeGovernanceEvent)
                .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
                .slice(0, MAX_GOVERNANCE_EVENTS)
            : [],
        chatSessions: Array.isArray(state.chatSessions)
            ? state.chatSessions
                .map(normalizeChatSession)
                .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
                .slice(0, MAX_CHAT_SESSIONS)
            : [],
        updatedAt: state.updatedAt || now(),
    };
}

async function ensureClientStateRoot() {
    await fs.mkdir(CLIENT_STATE_ROOT, { recursive: true });
}

async function atomicWrite(filePath, content) {
    const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempFilePath, content, 'utf8');
    await fs.rename(tempFilePath, filePath);
}

async function readState() {
    await ensureClientStateRoot();

    try {
        const raw = await fs.readFile(CLIENT_STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            ...defaultState(),
            ...(parsed || {}),
            users: parsed?.users && typeof parsed.users === 'object'
                ? Object.fromEntries(
                    Object.entries(parsed.users).map(([key, value]) => [key, normalizeUserState(value)])
                )
                : {},
        };
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return defaultState();
        }

        if (error instanceof SyntaxError) {
            await atomicWrite(CLIENT_STATE_FILE, JSON.stringify(defaultState(), null, 2));
            return defaultState();
        }

        throw error;
    }
}

async function writeState(state) {
    await ensureClientStateRoot();
    await atomicWrite(CLIENT_STATE_FILE, JSON.stringify(state, null, 2));
}

function enqueueClientStateMutation(mutator) {
    const scheduled = clientStateMutationQueue.then(async () => {
        const state = await readState();
        const result = await mutator(state);
        const nextState = result?.state || state;
        await writeState(nextState);
        return result?.value ?? null;
    });

    clientStateMutationQueue = scheduled.catch(() => {});
    return scheduled;
}

export async function getFireflyClientState({ uid = '', fid = '' } = {}) {
    const state = await readState();
    const userKey = buildUserKey(uid, fid);
    return normalizeUserState(state.users[userKey] || {});
}

export async function patchFireflyClientState({
    uid = '',
    fid = '',
    workspacePrefs,
    controlPlanePrefs,
    governanceEvents,
    chatSessions,
} = {}) {
    const userKey = buildUserKey(uid, fid);

    return enqueueClientStateMutation(async (state) => {
        const current = normalizeUserState(state.users[userKey] || {});
        const nextState = {
            ...current,
            ...(workspacePrefs !== undefined ? { workspacePrefs: normalizeWorkspacePrefs(workspacePrefs) } : {}),
            ...(controlPlanePrefs !== undefined ? { controlPlanePrefs: mergeControlPlanePrefs(current.controlPlanePrefs, controlPlanePrefs) } : {}),
            ...(governanceEvents !== undefined ? { governanceEvents: normalizeUserState({ governanceEvents }).governanceEvents } : {}),
            ...(chatSessions !== undefined ? { chatSessions: normalizeUserState({ chatSessions }).chatSessions } : {}),
            updatedAt: now(),
        };

        return {
            state: {
                ...state,
                users: {
                    ...state.users,
                    [userKey]: nextState,
                },
            },
            value: nextState,
        };
    });
}

export async function appendFireflyGovernanceEvent({
    uid = '',
    fid = '',
    event = null,
} = {}) {
    if (!event || typeof event !== 'object') {
        return null;
    }

    const normalizedEvent = normalizeGovernanceEvent(event);
    const userKey = buildUserKey(uid, fid);

    return enqueueClientStateMutation(async (state) => {
        const current = normalizeUserState(state.users[userKey] || {});
        const nextEvents = [
            normalizedEvent,
            ...(Array.isArray(current.governanceEvents) ? current.governanceEvents : []),
        ]
            .map(normalizeGovernanceEvent)
            .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
            .slice(0, MAX_GOVERNANCE_EVENTS);

        const nextState = {
            ...current,
            governanceEvents: nextEvents,
            updatedAt: now(),
        };

        return {
            state: {
                ...state,
                users: {
                    ...state.users,
                    [userKey]: nextState,
                },
            },
            value: normalizedEvent,
        };
    });
}

export function getDefaultFireflyControlPlanePrefs() {
    return normalizeControlPlanePrefs(buildDefaultFireflyControlPlanePrefs());
}
