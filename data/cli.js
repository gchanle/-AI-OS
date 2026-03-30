export const CLI_DEFINITION_STORAGE_KEY = 'campus_cli_definition_v1';
export const CLI_RUNTIME_STORAGE_KEY = 'campus_cli_runtime_v1';

export const cliStatusMap = {
    ready: { id: 'ready', label: '可接入', tone: 'healthy' },
    pilot: { id: 'pilot', label: '试点中', tone: 'warning' },
    design: { id: 'design', label: '待设计', tone: 'draft' },
    paused: { id: 'paused', label: '已暂停', tone: 'draft' },
};

export const cliRunnerMap = {
    browser_bridge: '浏览器桥接',
    desktop_agent: '桌面代理',
    batch_worker: '批处理 Worker',
    managed_daemon: '受控守护进程',
};

export const cliExecutionModeMap = {
    user_session: '用户会话触发',
    scheduled: '计划任务',
    operator_managed: '运维托管',
};

export const cliAuthModeMap = {
    sso_session: 'SSO 会话复用',
    vault_secret: '凭证保险库引用',
    operator_token: '运维受控令牌',
    none: '无需额外认证',
};

export const cliValidationMap = {
    valid: { id: 'valid', label: '规范通过', tone: 'healthy' },
    warning: { id: 'warning', label: '可试点但需复核', tone: 'warning' },
    invalid: { id: 'invalid', label: '未通过校验', tone: 'draft' },
};

export const cliArtifactValidationMap = {
    valid: { id: 'valid', label: '制品通过', tone: 'healthy' },
    warning: { id: 'warning', label: '制品需复核', tone: 'warning' },
    invalid: { id: 'invalid', label: '制品未通过', tone: 'draft' },
    missing: { id: 'missing', label: '缺少制品', tone: 'draft' },
};

const CLI_REFERENCE_TIME = Date.parse('2026-03-30T16:05:00+08:00');

function hoursAgo(hours) {
    return new Date(CLI_REFERENCE_TIME - hours * 60 * 60 * 1000).toISOString();
}

function normalizeList(values = []) {
    return values
        .flat()
        .filter(Boolean)
        .map((item) => String(item).trim())
        .filter(Boolean);
}

export function uid(prefix = 'cli') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function canUseStorage() {
    return typeof window !== 'undefined';
}

const baseCliCatalog = [
    {
        id: 'cli-browser-bridge',
        name: '浏览器桥接 CLI',
        summary: '在客户终端复用已登录浏览器会话，适合没有 API 的教务、办事或历史系统做受控读取。',
        provider: '客户侧代理',
        owner: '学校信息化中心',
        status: 'ready',
        capabilityId: 'services',
        runnerType: 'browser_bridge',
        executionMode: 'user_session',
        command: 'campus-browser-bridge',
        workingDirectory: '/opt/chaoxing/campus-agent',
        packageRef: 'chaoxing/campus-browser-bridge@1.3.0',
        installGuide: '部署到校内终端后，由校园 OS 通过受控命令触发，复用当前用户已登录浏览器。',
        authModes: ['sso_session', 'vault_secret'],
        supportedOs: ['macOS', 'Windows'],
        expectedInputs: ['访问路径', '页面动作配置', '结构化提取规则'],
        expectedOutputs: ['HTML 快照', '结构化 JSON', '执行审计日志'],
        risks: [
            '必须限制可访问域名与页面动作，避免被滥用为通用浏览器自动化。',
            '涉及个人课表、成绩等敏感数据时，需要保留审计。',
        ],
        governanceNote: '适合作为无 API 系统接入的兜底方案，但只能在受控学校终端中运行。',
    },
    {
        id: 'cli-doc-cleaner',
        name: '文档清洗 CLI',
        summary: '负责附件清洗、OCR、文本抽取与分段，适合办事、图书馆和科研场景的本地预处理。',
        provider: '超星 AI Campus',
        owner: '平台能力中心',
        status: 'pilot',
        capabilityId: 'library',
        runnerType: 'batch_worker',
        executionMode: 'operator_managed',
        command: 'campus-doc-clean',
        workingDirectory: '/opt/chaoxing/doc-tools',
        packageRef: 'chaoxing/doc-cleaner@0.9.4',
        installGuide: '由学校运维统一部署，平台按文件任务调用，结果再回传上层流程。',
        authModes: ['operator_token', 'vault_secret'],
        supportedOs: ['Linux'],
        expectedInputs: ['文件路径', 'OCR 开关', '分段策略'],
        expectedOutputs: ['清洗文本', 'OCR 结果', '结构化段落'],
        risks: [
            '需要明确附件的落盘与留存策略，避免原文被长期保留。',
        ],
        governanceNote: '当前适合先做平台侧受控试点，不建议直接对个人终端开放。',
    },
    {
        id: 'cli-campus-agent',
        name: '客户侧任务代理 CLI',
        summary: '为学校机房内的计划任务、同步作业和受控命令执行提供统一代理入口。',
        provider: '学校运维',
        owner: '学校运维',
        status: 'design',
        capabilityId: 'agents',
        runnerType: 'managed_daemon',
        executionMode: 'scheduled',
        command: 'campus-agent-runner',
        workingDirectory: '/srv/campus-agent',
        packageRef: '',
        installGuide: '计划在客户机房内以守护进程形式部署，用于同步消息、巡检能力与受控执行任务。',
        authModes: ['vault_secret', 'operator_token'],
        supportedOs: ['Linux'],
        expectedInputs: ['任务计划', '任务 payload', '安全策略'],
        expectedOutputs: ['执行结果', '状态回执', '巡检事件'],
        risks: [
            '必须明确命令白名单和租户隔离，否则容易越界成通用执行器。',
        ],
        governanceNote: '仍处设计阶段，当前不能对外宣称已可调用。',
    },
];

export function buildDefaultCliDefinitionState() {
    return {
        patches: {},
        custom: [],
    };
}

export function buildCliDraft() {
    return buildCliDefinitionDefaults({
        id: uid('cli'),
        name: '',
        provider: '当前租户',
        owner: '待分配',
        status: 'design',
        capabilityId: 'services',
        runnerType: 'desktop_agent',
        executionMode: 'user_session',
        authModes: ['vault_secret'],
        supportedOs: ['Linux'],
        isCustom: true,
    });
}

export function buildCliDefinitionDefaults(raw = {}) {
    return {
        id: raw.id || uid('cli'),
        name: raw.name || '未命名 CLI',
        summary: raw.summary || '用于在客户侧或本地环境执行受控能力。',
        provider: raw.provider || '当前租户',
        owner: raw.owner || '待分配',
        status: raw.status || 'design',
        capabilityId: raw.capabilityId || 'services',
        runnerType: raw.runnerType || 'desktop_agent',
        executionMode: raw.executionMode || 'user_session',
        command: raw.command || '',
        workingDirectory: raw.workingDirectory || '',
        packageRef: raw.packageRef || '',
        installGuide: raw.installGuide || '',
        authModes: normalizeList(raw.authModes).length > 0 ? normalizeList(raw.authModes) : ['vault_secret'],
        supportedOs: normalizeList(raw.supportedOs).length > 0 ? normalizeList(raw.supportedOs) : ['Linux'],
        expectedInputs: normalizeList(raw.expectedInputs),
        expectedOutputs: normalizeList(raw.expectedOutputs),
        risks: normalizeList(raw.risks),
        governanceNote: raw.governanceNote || '',
        isCustom: Boolean(raw.isCustom),
    };
}

export function buildCliDefinitions(state = buildDefaultCliDefinitionState()) {
    const patches = state?.patches || {};
    const custom = Array.isArray(state?.custom) ? state.custom : [];

    const mergedBase = baseCliCatalog.map((item) => buildCliDefinitionDefaults({
        ...item,
        ...(patches[item.id] || {}),
    }));

    const customItems = custom.map((item) => buildCliDefinitionDefaults({
        ...item,
        isCustom: true,
    }));

    return [...mergedBase, ...customItems];
}

export function loadCliDefinitionState() {
    if (!canUseStorage()) {
        return buildDefaultCliDefinitionState();
    }

    try {
        const raw = JSON.parse(localStorage.getItem(CLI_DEFINITION_STORAGE_KEY) || 'null');
        if (!raw) {
            return buildDefaultCliDefinitionState();
        }

        return {
            patches: raw.patches || {},
            custom: Array.isArray(raw.custom) ? raw.custom : [],
        };
    } catch (error) {
        console.error('Failed to restore CLI definition state:', error);
        return buildDefaultCliDefinitionState();
    }
}

export function saveCliDefinitionState(nextState = buildDefaultCliDefinitionState()) {
    if (!canUseStorage()) {
        return;
    }

    try {
        localStorage.setItem(CLI_DEFINITION_STORAGE_KEY, JSON.stringify({
            patches: nextState.patches || {},
            custom: Array.isArray(nextState.custom) ? nextState.custom : [],
        }));
    } catch (error) {
        console.error('Failed to persist CLI definition state:', error);
    }
}

function buildRuntimeDefaultsFromDefinitions(definitions = baseCliCatalog) {
    return Object.fromEntries(
        definitions.map((raw) => {
            const item = buildCliDefinitionDefaults(raw);
            return [
                item.id,
                {
                    enabled: item.status !== 'design',
                    authorized: item.status === 'ready' || item.status === 'pilot',
                    installed: item.status === 'ready' || item.status === 'pilot',
                    authMode: item.authModes[0] || null,
                    lastCheckedAt: item.status === 'design' ? null : hoursAgo(5),
                    lastRunAt: item.status === 'ready' ? hoursAgo(2) : item.status === 'pilot' ? hoursAgo(8) : null,
                    versionDetected: item.packageRef ? item.packageRef.split('@')[1] || '未记录' : null,
                    lastExitCode: item.status === 'design' ? null : 0,
                    lastError: item.status === 'design' ? '当前仍处设计阶段，尚未形成可运行安装包。' : null,
                },
            ];
        })
    );
}

export function buildDefaultCliRuntime(definitions = baseCliCatalog) {
    return buildRuntimeDefaultsFromDefinitions(definitions);
}

export function loadCliRuntime(definitions = baseCliCatalog) {
    const defaults = buildDefaultCliRuntime(definitions);
    if (!canUseStorage()) {
        return defaults;
    }

    try {
        const raw = JSON.parse(localStorage.getItem(CLI_RUNTIME_STORAGE_KEY) || 'null');
        if (!raw) {
            return defaults;
        }

        return Object.fromEntries(
            Object.keys(defaults).map((id) => [
                id,
                {
                    ...defaults[id],
                    ...(raw[id] || {}),
                },
            ])
        );
    } catch (error) {
        console.error('Failed to restore CLI runtime:', error);
        return defaults;
    }
}

export function saveCliRuntime(runtime = {}) {
    if (!canUseStorage()) {
        return;
    }

    try {
        localStorage.setItem(CLI_RUNTIME_STORAGE_KEY, JSON.stringify(runtime));
    } catch (error) {
        console.error('Failed to persist CLI runtime:', error);
    }
}

export function validateCliDefinition(cli) {
    const errors = [];
    const warnings = [];

    if (!cli.name) {
        errors.push('缺少 CLI 名称。');
    }
    if (!cli.provider) {
        errors.push('缺少提供方。');
    }
    if (!cli.command) {
        errors.push('缺少可执行命令。');
    }
    if (!cliRunnerMap[cli.runnerType]) {
        errors.push('执行形态无效。');
    }
    if (!cliExecutionModeMap[cli.executionMode]) {
        errors.push('执行模式无效。');
    }
    if (!Array.isArray(cli.authModes) || cli.authModes.length === 0) {
        errors.push('至少需要一种授权路径。');
    }
    if (!Array.isArray(cli.supportedOs) || cli.supportedOs.length === 0) {
        errors.push('至少需要声明一种运行环境。');
    }
    if ((cli.status === 'ready' || cli.status === 'pilot') && !cli.packageRef) {
        warnings.push('建议补充 packageRef 或安装包版本，便于巡检和交付。');
    }
    if ((cli.status === 'ready' || cli.status === 'pilot') && !cli.workingDirectory) {
        warnings.push('建议补充 workingDirectory，避免运行上下文不明确。');
    }
    if (!Array.isArray(cli.expectedInputs) || cli.expectedInputs.length === 0) {
        warnings.push('当前没有声明 expectedInputs。');
    }
    if (!Array.isArray(cli.expectedOutputs) || cli.expectedOutputs.length === 0) {
        warnings.push('当前没有声明 expectedOutputs。');
    }

    const state = errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'warning' : 'valid';
    return {
        state,
        label: cliValidationMap[state].label,
        errors,
        warnings,
    };
}

export function buildMissingCliPackageState(cli) {
    return {
        id: cli.id,
        title: cli.name,
        description: cli.summary,
        capability: cli.capabilityId,
        owner: cli.owner,
        provider: cli.provider,
        version: '1.0.0',
        entry: 'CLI.md',
        status: cli.status,
        runnerType: cli.runnerType,
        executionMode: cli.executionMode,
        command: cli.command,
        packageRef: cli.packageRef || '',
        workingDirectory: cli.workingDirectory || '',
        authModes: cli.authModes || [],
        supportedOs: cli.supportedOs || [],
        relativePath: null,
        packageDir: null,
        sections: [],
        validation: {
            state: 'missing',
            label: '缺少制品',
            errors: ['尚未生成 CLI.md 制品文件。'],
            warnings: [],
        },
    };
}

export function buildCliPackageMap(packageRegistry = []) {
    return new Map(
        (packageRegistry || []).map((item) => [item.id, item])
    );
}

export function buildCliView(cli, runtime = {}, packageRegistry = []) {
    const state = runtime[cli.id] || {};
    const validation = validateCliDefinition(cli);
    const packageMap = buildCliPackageMap(packageRegistry);
    const packageInfo = packageMap.get(cli.id) || buildMissingCliPackageState(cli);
    const statusMeta = cliStatusMap[cli.status] || cliStatusMap.design;
    const validationMeta = cliValidationMap[validation.state] || cliValidationMap.invalid;
    const artifactValidationMeta = cliArtifactValidationMap[packageInfo.validation?.state] || cliArtifactValidationMap.missing;
    const artifactValidationPassed = packageInfo.validation?.state === 'valid' || packageInfo.validation?.state === 'warning';

    return {
        ...cli,
        enabled: typeof state.enabled === 'boolean' ? state.enabled : cli.status !== 'design',
        authorized: typeof state.authorized === 'boolean' ? state.authorized : cli.status !== 'design',
        installed: typeof state.installed === 'boolean' ? state.installed : cli.status !== 'design',
        authMode: state.authMode || cli.authModes[0] || null,
        lastCheckedAt: state.lastCheckedAt || null,
        lastRunAt: state.lastRunAt || null,
        versionDetected: state.versionDetected || null,
        lastExitCode: typeof state.lastExitCode === 'number' ? state.lastExitCode : null,
        lastError: state.lastError || null,
        validation,
        validationMeta,
        artifactPath: packageInfo.relativePath || null,
        artifactVersion: packageInfo.version || '1.0.0',
        artifactSections: packageInfo.sections || [],
        artifactValidation: packageInfo.validation,
        artifactValidationMeta,
        artifactValidationPassed,
        statusMeta,
        runnerMeta: cliRunnerMap[cli.runnerType] || cli.runnerType,
        executionModeMeta: cliExecutionModeMap[cli.executionMode] || cli.executionMode,
        canPilot: validation.state !== 'invalid' && artifactValidationPassed && Boolean(cli.command),
        canReady: validation.state === 'valid' && packageInfo.validation?.state === 'valid' && Boolean(cli.command),
    };
}

export function buildCliViews(definitions = baseCliCatalog, runtime = {}, packageRegistry = []) {
    return definitions.map((cli) => buildCliView(cli, runtime, packageRegistry));
}

export function buildCliSummary(items = []) {
    return {
        total: items.length,
        ready: items.filter((item) => item.status === 'ready' && item.canReady).length,
        pilot: items.filter((item) => item.status === 'pilot' && item.canPilot).length,
        validated: items.filter((item) => item.validation.state === 'valid' && item.artifactValidation?.state === 'valid').length,
        packaged: items.filter((item) => item.artifactValidation?.state !== 'missing').length,
        installed: items.filter((item) => item.installed).length,
        attention: items.filter((item) => item.validation.state === 'warning' || item.artifactValidation?.state === 'warning' || item.lastExitCode !== 0).length,
    };
}

export function getCliById(cliId, definitions = baseCliCatalog, runtime = {}, packageRegistry = []) {
    const target = definitions.find((item) => item.id === cliId);
    return target ? buildCliView(target, runtime, packageRegistry) : null;
}
