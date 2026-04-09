import fs from 'fs';
import path from 'path';
import { chatModelCandidates, defaultChatModelId } from '@/data/workspace';

const RUNTIME_DIR = path.join(process.cwd(), '.runtime');
const AGENT_CONFIG_FILE = path.join(RUNTIME_DIR, 'admin-agent-runtime.json');

const DEFAULT_AGENT_RUNTIME_CONFIG = {
    version: 2,
    updatedAt: new Date('2026-04-05T09:30:00+08:00').toISOString(),
    models: {
        primaryModelId: defaultChatModelId,
        plannerModelId: 'qwen3.5-plus',
        enabledModelIds: chatModelCandidates.map((item) => item.id),
        allowUserModelSwitch: true,
        routingMode: 'single_primary',
    },
    runtime: {
        plannerMode: 'tool_first',
        allowMultiStep: true,
        maxPlannerSteps: 4,
        allowPartialSuccess: true,
        allowParallelToolCalls: true,
        maxParallelTools: 3,
        enableTaskDecomposition: true,
        maxSubtasksPerRun: 6,
        checkpointingEnabled: true,
        maxConcurrentRuns: 4,
    },
    memory: {
        enabled: true,
        maxEntries: 120,
        injectTopK: 4,
        retainTaskMemory: true,
        retainPreferenceMemory: true,
        retainReadingMemory: true,
    },
    recovery: {
        enabled: true,
        retainWorkspaceSnapshots: true,
        allowResumeSuggestions: true,
        allowCrossWorkspaceHandoff: true,
    },
    scheduler: {
        enabled: true,
        morningDigestEnabled: true,
        maxActiveSchedules: 8,
    },
    governance: {
        enableAuditTrail: true,
        enableRoleIsolation: true,
        requireConnectorBindingForPublish: true,
    },
    toolPolicies: {
        'messages.unread_summary': { enabled: true, exposure: 'default' },
        'approvals.center_overview': { enabled: true, exposure: 'default' },
        'library.reading_context': { enabled: true, exposure: 'contextual' },
        'digest.morning_briefing': { enabled: true, exposure: 'scheduled' },
        'research.search': { enabled: true, exposure: 'default' },
        'research.read': { enabled: true, exposure: 'default' },
        'research.report': { enabled: true, exposure: 'default' },
        'url.inspect': { enabled: true, exposure: 'default' },
        'page.read': { enabled: true, exposure: 'default' },
        'page.answer': { enabled: true, exposure: 'default' },
        'web.search': { enabled: true, exposure: 'default' },
        'web.fetch': { enabled: true, exposure: 'internal' },
        'web.answer': { enabled: true, exposure: 'default' },
    },
};

const MATURITY_BASELINE = [
    {
        id: 'server_runtime',
        label: '服务端 Runtime',
        current: 'ready',
        currentLabel: '已具备',
        gap: '已具备服务端会话、任务、运行记录与事件流。',
    },
    {
        id: 'tool_router',
        label: '工具路由与技能命中',
        current: 'ready',
        currentLabel: '已具备',
        gap: '已能基于问题命中工具并形成可执行计划。',
    },
    {
        id: 'memory_layer',
        label: '长期记忆层',
        current: 'partial',
        currentLabel: '部分具备',
        gap: '已有任务记忆、偏好记忆与阅读记忆，但还缺真正的跨周期压缩、检索策略和后台治理。',
    },
    {
        id: 'recovery_layer',
        label: '任务恢复与续办',
        current: 'partial',
        currentLabel: '部分具备',
        gap: '已有恢复上下文和工作面快照，但仍缺管理员可控的恢复规则和更细颗粒度的任务恢复策略。',
    },
    {
        id: 'parallel_subagents',
        label: '并行子代理',
        current: 'gap',
        currentLabel: '明显缺口',
        gap: '当前仍以单 agent / 单线程工具编排为主，还未达到 OpenClaw 式的并行子代理能力。',
    },
    {
        id: 'publish_governance',
        label: '发布与治理后台',
        current: 'partial',
        currentLabel: '正在补齐',
        gap: '已经有后台入口与治理框架，但距离 OpenClaw 级别的配置管理、审核流与运营报表仍有差距。',
    },
];

function ensureRuntimeDir() {
    if (!fs.existsSync(RUNTIME_DIR)) {
        fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    }
}

function normalizeArray(values = []) {
    return Array.isArray(values)
        ? values.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
        : [];
}

function normalizeToolPolicies(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.fromEntries(
        Object.entries(DEFAULT_AGENT_RUNTIME_CONFIG.toolPolicies).map(([toolId, defaults]) => {
            const item = source[toolId] || {};
            return [
                toolId,
                {
                    enabled: typeof item.enabled === 'boolean' ? item.enabled : defaults.enabled,
                    exposure: String(item.exposure || defaults.exposure).trim(),
                },
            ];
        })
    );
}

function normalizeAgentRuntimeConfig(raw = {}) {
    const config = raw && typeof raw === 'object' ? raw : {};

    return {
        version: 2,
        updatedAt: String(config.updatedAt || DEFAULT_AGENT_RUNTIME_CONFIG.updatedAt),
        models: {
            primaryModelId: String(config.models?.primaryModelId || DEFAULT_AGENT_RUNTIME_CONFIG.models.primaryModelId),
            plannerModelId: String(config.models?.plannerModelId || DEFAULT_AGENT_RUNTIME_CONFIG.models.plannerModelId),
            enabledModelIds: normalizeArray(config.models?.enabledModelIds).length > 0
                ? normalizeArray(config.models.enabledModelIds)
                : [...DEFAULT_AGENT_RUNTIME_CONFIG.models.enabledModelIds],
            allowUserModelSwitch: typeof config.models?.allowUserModelSwitch === 'boolean'
                ? config.models.allowUserModelSwitch
                : DEFAULT_AGENT_RUNTIME_CONFIG.models.allowUserModelSwitch,
            routingMode: String(config.models?.routingMode || DEFAULT_AGENT_RUNTIME_CONFIG.models.routingMode),
        },
        runtime: {
            plannerMode: String(config.runtime?.plannerMode || DEFAULT_AGENT_RUNTIME_CONFIG.runtime.plannerMode),
            allowMultiStep: typeof config.runtime?.allowMultiStep === 'boolean'
                ? config.runtime.allowMultiStep
                : DEFAULT_AGENT_RUNTIME_CONFIG.runtime.allowMultiStep,
            maxPlannerSteps: Math.max(1, Number(config.runtime?.maxPlannerSteps || DEFAULT_AGENT_RUNTIME_CONFIG.runtime.maxPlannerSteps)),
            allowPartialSuccess: typeof config.runtime?.allowPartialSuccess === 'boolean'
                ? config.runtime.allowPartialSuccess
                : DEFAULT_AGENT_RUNTIME_CONFIG.runtime.allowPartialSuccess,
            allowParallelToolCalls: typeof config.runtime?.allowParallelToolCalls === 'boolean'
                ? config.runtime.allowParallelToolCalls
                : DEFAULT_AGENT_RUNTIME_CONFIG.runtime.allowParallelToolCalls,
            maxParallelTools: Math.max(1, Number(config.runtime?.maxParallelTools || DEFAULT_AGENT_RUNTIME_CONFIG.runtime.maxParallelTools)),
            enableTaskDecomposition: typeof config.runtime?.enableTaskDecomposition === 'boolean'
                ? config.runtime.enableTaskDecomposition
                : DEFAULT_AGENT_RUNTIME_CONFIG.runtime.enableTaskDecomposition,
            maxSubtasksPerRun: Math.max(1, Number(config.runtime?.maxSubtasksPerRun || DEFAULT_AGENT_RUNTIME_CONFIG.runtime.maxSubtasksPerRun)),
            checkpointingEnabled: typeof config.runtime?.checkpointingEnabled === 'boolean'
                ? config.runtime.checkpointingEnabled
                : DEFAULT_AGENT_RUNTIME_CONFIG.runtime.checkpointingEnabled,
            maxConcurrentRuns: Math.max(1, Number(config.runtime?.maxConcurrentRuns || DEFAULT_AGENT_RUNTIME_CONFIG.runtime.maxConcurrentRuns)),
        },
        memory: {
            enabled: typeof config.memory?.enabled === 'boolean' ? config.memory.enabled : DEFAULT_AGENT_RUNTIME_CONFIG.memory.enabled,
            maxEntries: Math.max(20, Number(config.memory?.maxEntries || DEFAULT_AGENT_RUNTIME_CONFIG.memory.maxEntries)),
            injectTopK: Math.max(1, Number(config.memory?.injectTopK || DEFAULT_AGENT_RUNTIME_CONFIG.memory.injectTopK)),
            retainTaskMemory: typeof config.memory?.retainTaskMemory === 'boolean'
                ? config.memory.retainTaskMemory
                : DEFAULT_AGENT_RUNTIME_CONFIG.memory.retainTaskMemory,
            retainPreferenceMemory: typeof config.memory?.retainPreferenceMemory === 'boolean'
                ? config.memory.retainPreferenceMemory
                : DEFAULT_AGENT_RUNTIME_CONFIG.memory.retainPreferenceMemory,
            retainReadingMemory: typeof config.memory?.retainReadingMemory === 'boolean'
                ? config.memory.retainReadingMemory
                : DEFAULT_AGENT_RUNTIME_CONFIG.memory.retainReadingMemory,
        },
        recovery: {
            enabled: typeof config.recovery?.enabled === 'boolean' ? config.recovery.enabled : DEFAULT_AGENT_RUNTIME_CONFIG.recovery.enabled,
            retainWorkspaceSnapshots: typeof config.recovery?.retainWorkspaceSnapshots === 'boolean'
                ? config.recovery.retainWorkspaceSnapshots
                : DEFAULT_AGENT_RUNTIME_CONFIG.recovery.retainWorkspaceSnapshots,
            allowResumeSuggestions: typeof config.recovery?.allowResumeSuggestions === 'boolean'
                ? config.recovery.allowResumeSuggestions
                : DEFAULT_AGENT_RUNTIME_CONFIG.recovery.allowResumeSuggestions,
            allowCrossWorkspaceHandoff: typeof config.recovery?.allowCrossWorkspaceHandoff === 'boolean'
                ? config.recovery.allowCrossWorkspaceHandoff
                : DEFAULT_AGENT_RUNTIME_CONFIG.recovery.allowCrossWorkspaceHandoff,
        },
        scheduler: {
            enabled: typeof config.scheduler?.enabled === 'boolean' ? config.scheduler.enabled : DEFAULT_AGENT_RUNTIME_CONFIG.scheduler.enabled,
            morningDigestEnabled: typeof config.scheduler?.morningDigestEnabled === 'boolean'
                ? config.scheduler.morningDigestEnabled
                : DEFAULT_AGENT_RUNTIME_CONFIG.scheduler.morningDigestEnabled,
            maxActiveSchedules: Math.max(1, Number(config.scheduler?.maxActiveSchedules || DEFAULT_AGENT_RUNTIME_CONFIG.scheduler.maxActiveSchedules)),
        },
        governance: {
            enableAuditTrail: typeof config.governance?.enableAuditTrail === 'boolean'
                ? config.governance.enableAuditTrail
                : DEFAULT_AGENT_RUNTIME_CONFIG.governance.enableAuditTrail,
            enableRoleIsolation: typeof config.governance?.enableRoleIsolation === 'boolean'
                ? config.governance.enableRoleIsolation
                : DEFAULT_AGENT_RUNTIME_CONFIG.governance.enableRoleIsolation,
            requireConnectorBindingForPublish: typeof config.governance?.requireConnectorBindingForPublish === 'boolean'
                ? config.governance.requireConnectorBindingForPublish
                : DEFAULT_AGENT_RUNTIME_CONFIG.governance.requireConnectorBindingForPublish,
        },
        toolPolicies: normalizeToolPolicies(config.toolPolicies),
    };
}

export function loadAdminAgentRuntimeConfig() {
    try {
        ensureRuntimeDir();
        if (!fs.existsSync(AGENT_CONFIG_FILE)) {
            return normalizeAgentRuntimeConfig(DEFAULT_AGENT_RUNTIME_CONFIG);
        }

        const raw = JSON.parse(fs.readFileSync(AGENT_CONFIG_FILE, 'utf8') || '{}');
        return normalizeAgentRuntimeConfig(raw);
    } catch (error) {
        console.error('Failed to load admin agent runtime config:', error);
        return normalizeAgentRuntimeConfig(DEFAULT_AGENT_RUNTIME_CONFIG);
    }
}

export function saveAdminAgentRuntimeConfig(patch = {}) {
    const next = normalizeAgentRuntimeConfig({
        ...loadAdminAgentRuntimeConfig(),
        ...patch,
        updatedAt: new Date().toISOString(),
    });

    ensureRuntimeDir();
    const tempFile = `${AGENT_CONFIG_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tempFile, AGENT_CONFIG_FILE);
    return next;
}

export function isFireflyToolEnabled(toolId, config = loadAdminAgentRuntimeConfig()) {
    const policy = config.toolPolicies?.[toolId];
    return policy ? policy.enabled !== false : true;
}

export function filterEnabledFireflyTools(tools = [], config = loadAdminAgentRuntimeConfig()) {
    return tools.filter((tool) => isFireflyToolEnabled(tool.id, config));
}

export function filterEnabledChatModels(models = chatModelCandidates, config = loadAdminAgentRuntimeConfig()) {
    const enabledSet = new Set(config.models.enabledModelIds || []);
    const filtered = models.filter((item) => enabledSet.has(item.id));
    return filtered.length > 0 ? filtered : models;
}

export function buildAgentMaturitySnapshot(config = loadAdminAgentRuntimeConfig()) {
    return MATURITY_BASELINE.map((item) => {
        if (item.id === 'memory_layer' && !config.memory.enabled) {
            return {
                ...item,
                current: 'gap',
                currentLabel: '已关闭',
                gap: '长期记忆当前被后台关闭，萤火虫只能依赖当前会话上下文。',
            };
        }

        if (item.id === 'memory_layer') {
            return {
                ...item,
                current: 'partial',
                currentLabel: '已升级',
                gap: '已具备服务端长期记忆存储、Top-K 注入与后台治理；下一步仍建议补向量检索、压缩归档与更细的记忆淘汰策略。',
            };
        }

        if (item.id === 'recovery_layer' && !config.recovery.enabled) {
            return {
                ...item,
                current: 'gap',
                currentLabel: '已关闭',
                gap: '任务恢复当前被后台关闭，续办能力会明显弱于 OpenClaw。',
            };
        }

        if (item.id === 'recovery_layer') {
            return {
                ...item,
                current: 'partial',
                currentLabel: '可续办',
                gap: '已具备服务端任务恢复、工作面快照与续办上下文；距离更成熟的恢复编排还差任务级检查点与人工接管机制。',
            };
        }

        if (item.id === 'parallel_subagents') {
            if (
                config.runtime.allowParallelToolCalls
                && config.runtime.maxParallelTools > 1
                && config.runtime.enableTaskDecomposition
            ) {
                return {
                    ...item,
                    current: 'partial',
                    currentLabel: '已拆解',
                    gap: `当前已支持最多 ${config.runtime.maxParallelTools} 个工具并行批次执行，并带任务拆解与检查点；仍缺完整的子代理仲裁、跨轮委派与自治反馈。`,
                };
            }

            return {
                ...item,
                current: 'gap',
                currentLabel: '未开启',
                gap: '当前仍以单线程执行为主，建议开启并行工具批次执行，至少先补齐多工具概览型任务的并发能力。',
            };
        }

        return item;
    });
}

export function getAdminAgentRuntimeStorageMeta() {
    return {
        root: RUNTIME_DIR,
        configFile: AGENT_CONFIG_FILE,
    };
}
