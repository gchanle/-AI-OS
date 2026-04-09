export const MCP_DEFINITION_STORAGE_KEY = 'campus_mcp_definition_v1';
export const MCP_RUNTIME_STORAGE_KEY = 'campus_mcp_runtime_v1';

export const mcpStatusMap = {
    ready: { id: 'ready', label: '可接入', tone: 'healthy' },
    pilot: { id: 'pilot', label: '试点中', tone: 'warning' },
    design: { id: 'design', label: '待设计', tone: 'draft' },
    paused: { id: 'paused', label: '已暂停', tone: 'draft' },
};

export const mcpTransportMap = {
    sse: 'Server-Sent Events',
    streamable_http: 'Streamable HTTP',
    websocket: 'WebSocket',
};

export const mcpAuthModeMap = {
    sso_session: 'SSO 会话复用',
    bearer_token: 'Bearer Token',
    oauth_client: 'OAuth Client',
    customer_proxy: '客户侧代理',
};

export const mcpValidationMap = {
    valid: { id: 'valid', label: '规范通过', tone: 'healthy' },
    warning: { id: 'warning', label: '可试点但需复核', tone: 'warning' },
    invalid: { id: 'invalid', label: '未通过校验', tone: 'draft' },
};

export const mcpArtifactValidationMap = {
    valid: { id: 'valid', label: '制品通过', tone: 'healthy' },
    warning: { id: 'warning', label: '制品需复核', tone: 'warning' },
    invalid: { id: 'invalid', label: '制品未通过', tone: 'draft' },
    missing: { id: 'missing', label: '缺少制品', tone: 'draft' },
};

const MCP_REFERENCE_TIME = Date.parse('2026-03-30T15:20:00+08:00');

function hoursAgo(hours) {
    return new Date(MCP_REFERENCE_TIME - hours * 60 * 60 * 1000).toISOString();
}

function normalizeList(values = []) {
    return values
        .flat()
        .filter(Boolean)
        .map((item) => String(item).trim())
        .filter(Boolean);
}

export function uid(prefix = 'mcp') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function canUseStorage() {
    return typeof window !== 'undefined';
}

const baseMcpCatalog = [
    {
        id: 'mcp-academic-browser',
        name: '教务浏览器代理 MCP',
        summary: '适合没有开放 API，但已接统一认证的教务系统，以浏览器代理方式提供结构化读取。',
        provider: '学校信息化中心',
        owner: '教务处 / 信息化中心',
        status: 'pilot',
        capabilityId: 'services',
        transport: 'websocket',
        protocolVersion: '2026-03-01',
        endpoint: 'wss://campus.example.edu.cn/mcp/academic-browser',
        manifestPath: '/.well-known/mcp.json',
        authModes: ['sso_session', 'customer_proxy'],
        scope: '课表 / 考试 / 成绩只读',
        expectedTools: ['get_timetable', 'get_exam_schedule', 'get_grade_summary'],
        expectedResources: ['academic_calendar', 'term_context'],
        risks: [
            '依赖浏览器代理与已登录会话，学校终端部署方式需要明确。',
            '成绩等敏感数据必须保持只读并接审计。',
        ],
        governanceNote: '适合先在学校自有终端范围试点，稳定后再进入更广范围。',
    },
    {
        id: 'mcp-library-search',
        name: '图书馆检索 MCP',
        summary: '将馆藏检索、借阅状态和电子资源入口以标准工具形式暴露给校园 OS。',
        provider: '学校图书馆',
        owner: '图书馆',
        status: 'ready',
        capabilityId: 'library',
        transport: 'streamable_http',
        protocolVersion: '2026-03-01',
        endpoint: 'https://library.example.edu.cn/mcp',
        manifestPath: '/.well-known/mcp.json',
        authModes: ['sso_session', 'bearer_token'],
        scope: '馆藏检索 / 借阅状态 / 电子资源',
        expectedTools: ['search_catalog', 'get_borrow_records', 'open_eresource'],
        expectedResources: ['library_profile', 'campus_holdings'],
        risks: [
            '电子资源通常受版权与校园网策略约束，需要明确跳转边界。',
        ],
        governanceNote: '属于最适合优先做成标准协议的校园资源型能力。',
    },
    {
        id: 'mcp-notice-sync',
        name: '通知同步 MCP',
        summary: '适合把消息中心、待办和通知系统做成统一的消息接入协议。',
        provider: '超星',
        owner: '平台消息中心',
        status: 'design',
        capabilityId: 'messages',
        transport: 'sse',
        protocolVersion: '2026-03-01',
        endpoint: '',
        manifestPath: '/.well-known/mcp.json',
        authModes: ['sso_session'],
        scope: '消息同步 / 通知详情 / 未读状态',
        expectedTools: ['list_notices', 'get_notice_detail', 'sync_unread_state'],
        expectedResources: ['notice_profile'],
        risks: [
            '若第三方通知系统不提供标准协议，需要回退到连接器或页面解析方案。',
        ],
        governanceNote: '当前仍处方案设计阶段，不能对外宣称已接入。',
    },
];

export function buildDefaultMcpDefinitionState() {
    return {
        patches: {},
        custom: [],
    };
}

export function buildMcpDraft() {
    return buildMcpDefinitionDefaults({
        id: uid('mcp'),
        name: '',
        provider: '当前租户',
        owner: '待分配',
        status: 'design',
        capabilityId: 'services',
        transport: 'streamable_http',
        protocolVersion: '2026-03-01',
        manifestPath: '/.well-known/mcp.json',
        authModes: ['sso_session'],
        isCustom: true,
    });
}

export function buildMcpDefinitionDefaults(raw = {}) {
    return {
        id: raw.id || uid('mcp'),
        name: raw.name || '未命名 MCP',
        summary: raw.summary || '以标准协议把外部服务接入校园 OS。',
        provider: raw.provider || '当前租户',
        owner: raw.owner || '待分配',
        status: raw.status || 'design',
        capabilityId: raw.capabilityId || 'services',
        transport: raw.transport || 'streamable_http',
        protocolVersion: raw.protocolVersion || '2026-03-01',
        endpoint: raw.endpoint || '',
        manifestPath: raw.manifestPath || '/.well-known/mcp.json',
        authModes: normalizeList(raw.authModes).length > 0 ? normalizeList(raw.authModes) : ['sso_session'],
        scope: raw.scope || '',
        expectedTools: normalizeList(raw.expectedTools),
        expectedResources: normalizeList(raw.expectedResources),
        risks: normalizeList(raw.risks),
        governanceNote: raw.governanceNote || '',
        isCustom: Boolean(raw.isCustom),
    };
}

export function buildMcpDefinitions(state = buildDefaultMcpDefinitionState()) {
    const patches = state?.patches || {};
    const custom = Array.isArray(state?.custom) ? state.custom : [];

    const mergedBase = baseMcpCatalog.map((item) => buildMcpDefinitionDefaults({
        ...item,
        ...(patches[item.id] || {}),
    }));

    const customItems = custom.map((item) => buildMcpDefinitionDefaults({
        ...item,
        isCustom: true,
    }));

    return [...mergedBase, ...customItems];
}

export function loadMcpDefinitionState() {
    if (!canUseStorage()) {
        return buildDefaultMcpDefinitionState();
    }

    try {
        const raw = JSON.parse(localStorage.getItem(MCP_DEFINITION_STORAGE_KEY) || 'null');
        if (!raw) {
            return buildDefaultMcpDefinitionState();
        }

        return {
            patches: raw.patches || {},
            custom: Array.isArray(raw.custom) ? raw.custom : [],
        };
    } catch (error) {
        console.error('Failed to restore MCP definition state:', error);
        return buildDefaultMcpDefinitionState();
    }
}

export function saveMcpDefinitionState(nextState = buildDefaultMcpDefinitionState()) {
    if (!canUseStorage()) {
        return;
    }

    try {
        localStorage.setItem(MCP_DEFINITION_STORAGE_KEY, JSON.stringify({
            patches: nextState.patches || {},
            custom: Array.isArray(nextState.custom) ? nextState.custom : [],
        }));
    } catch (error) {
        console.error('Failed to persist MCP definition state:', error);
    }
}

function buildRuntimeDefaultsFromDefinitions(definitions = baseMcpCatalog) {
    return Object.fromEntries(
        definitions.map((raw) => {
            const item = buildMcpDefinitionDefaults(raw);
            return [
                item.id,
                {
                    enabled: item.status !== 'design',
                    authorized: item.status === 'ready' || item.status === 'pilot',
                    authMode: item.authModes[0] || null,
                    lastCheckedAt: item.status === 'design' ? null : hoursAgo(6),
                    latencyMs: item.status === 'ready' ? 420 : item.status === 'pilot' ? 860 : null,
                    handshakeState: item.status === 'ready' ? 'ok' : item.status === 'pilot' ? 'warning' : 'idle',
                    manifestState: item.endpoint ? 'ok' : 'missing',
                    lastError: item.status === 'design' ? '尚未提供可用 endpoint。' : null,
                    exposedTools: item.expectedTools,
                    exposedResources: item.expectedResources,
                },
            ];
        })
    );
}

export function buildDefaultMcpRuntime(definitions = baseMcpCatalog) {
    return buildRuntimeDefaultsFromDefinitions(definitions);
}

export function loadMcpRuntime(definitions = baseMcpCatalog) {
    const defaults = buildDefaultMcpRuntime(definitions);
    if (!canUseStorage()) {
        return defaults;
    }

    try {
        const raw = JSON.parse(localStorage.getItem(MCP_RUNTIME_STORAGE_KEY) || 'null');
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
        console.error('Failed to restore MCP runtime:', error);
        return defaults;
    }
}

export function saveMcpRuntime(runtime = {}) {
    if (!canUseStorage()) {
        return;
    }

    try {
        localStorage.setItem(MCP_RUNTIME_STORAGE_KEY, JSON.stringify(runtime));
    } catch (error) {
        console.error('Failed to persist MCP runtime:', error);
    }
}

export function validateMcpDefinition(mcp) {
    const errors = [];
    const warnings = [];

    if (!mcp.name) {
        errors.push('缺少 MCP 名称。');
    }
    if (!mcp.provider) {
        errors.push('缺少提供方。');
    }
    if (!mcp.protocolVersion) {
        errors.push('缺少协议版本。');
    }
    if (!mcp.transport || !mcpTransportMap[mcp.transport]) {
        errors.push('传输方式无效。');
    }
    if (!Array.isArray(mcp.authModes) || mcp.authModes.length === 0) {
        errors.push('至少需要一种认证方式。');
    }
    if (!mcp.manifestPath) {
        errors.push('缺少 manifestPath。');
    }
    if ((mcp.status === 'ready' || mcp.status === 'pilot') && !mcp.endpoint) {
        errors.push('可接入或试点中的 MCP 必须填写 endpoint。');
    }

    if (mcp.endpoint) {
        try {
            const url = new URL(mcp.endpoint);
            const allowedProtocols = ['https:', 'wss:', 'http:', 'ws:'];
            if (!allowedProtocols.includes(url.protocol)) {
                errors.push('endpoint 协议不受支持。');
            }
            if ((mcp.status === 'ready' || mcp.status === 'pilot') && (url.protocol === 'http:' || url.protocol === 'ws:')) {
                warnings.push('生产或试点环境建议使用 https/wss。');
            }
        } catch {
            errors.push('endpoint 不是有效 URL。');
        }
    }

    if (!Array.isArray(mcp.expectedTools) || mcp.expectedTools.length === 0) {
        warnings.push('当前没有声明 expectedTools。');
    }
    if (!Array.isArray(mcp.expectedResources) || mcp.expectedResources.length === 0) {
        warnings.push('当前没有声明 expectedResources。');
    }

    const state = errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'warning' : 'valid';
    return {
        state,
        label: mcpValidationMap[state].label,
        errors,
        warnings,
    };
}

export function buildMissingMcpPackageState(mcp) {
    return {
        id: mcp.id,
        title: mcp.name,
        description: mcp.summary,
        capability: mcp.capabilityId,
        owner: mcp.owner,
        provider: mcp.provider,
        version: '1.0.0',
        entry: 'MCP.md',
        status: mcp.status,
        transport: mcp.transport,
        protocolVersion: mcp.protocolVersion,
        manifestPath: mcp.manifestPath,
        endpoint: mcp.endpoint,
        authModes: mcp.authModes || [],
        expectedTools: mcp.expectedTools || [],
        expectedResources: mcp.expectedResources || [],
        scope: mcp.scope || '',
        relativePath: null,
        packageDir: null,
        sections: [],
        validation: {
            state: 'missing',
            label: '缺少制品',
            errors: ['尚未生成 MCP.md 制品文件。'],
            warnings: [],
        },
    };
}

export function buildMcpPackageMap(packageRegistry = []) {
    return new Map(
        (packageRegistry || []).map((item) => [item.id, item])
    );
}

export function buildMcpView(mcp, runtime = {}, packageRegistry = []) {
    const state = runtime[mcp.id] || {};
    const validation = validateMcpDefinition(mcp);
    const packageMap = buildMcpPackageMap(packageRegistry);
    const packageInfo = packageMap.get(mcp.id) || buildMissingMcpPackageState(mcp);
    const statusMeta = mcpStatusMap[mcp.status] || mcpStatusMap.design;
    const validationMeta = mcpValidationMap[validation.state] || mcpValidationMap.invalid;
    const artifactValidationMeta = mcpArtifactValidationMap[packageInfo.validation?.state] || mcpArtifactValidationMap.missing;
    const effectiveEnabled = typeof state.enabled === 'boolean' ? state.enabled : mcp.status !== 'design';
    const artifactValidationPassed = packageInfo.validation?.state === 'valid' || packageInfo.validation?.state === 'warning';

    return {
        ...mcp,
        enabled: effectiveEnabled,
        authorized: typeof state.authorized === 'boolean' ? state.authorized : mcp.status !== 'design',
        authMode: state.authMode || mcp.authModes[0] || null,
        lastCheckedAt: state.lastCheckedAt || null,
        latencyMs: state.latencyMs ?? null,
        handshakeState: state.handshakeState || 'idle',
        manifestState: state.manifestState || (mcp.endpoint ? 'ok' : 'missing'),
        lastError: state.lastError || null,
        exposedTools: Array.isArray(state.exposedTools) ? state.exposedTools : mcp.expectedTools,
        exposedResources: Array.isArray(state.exposedResources) ? state.exposedResources : mcp.expectedResources,
        validation,
        validationMeta,
        artifactPath: packageInfo.relativePath || null,
        artifactVersion: packageInfo.version || '1.0.0',
        artifactSections: packageInfo.sections || [],
        artifactValidation: packageInfo.validation,
        artifactValidationMeta,
        artifactValidationPassed,
        statusMeta,
        canPilot: validation.state !== 'invalid' && artifactValidationPassed && Boolean(mcp.endpoint),
        canReady: validation.state === 'valid' && packageInfo.validation?.state === 'valid' && Boolean(mcp.endpoint),
    };
}

export function buildMcpViews(definitions = baseMcpCatalog, runtime = {}, packageRegistry = []) {
    return definitions.map((mcp) => buildMcpView(mcp, runtime, packageRegistry));
}

export function buildMcpSummary(items = []) {
    return {
        total: items.length,
        ready: items.filter((item) => item.status === 'ready' && item.canReady).length,
        pilot: items.filter((item) => item.status === 'pilot' && item.canPilot).length,
        validated: items.filter((item) => item.validation.state === 'valid' && item.artifactValidation?.state === 'valid').length,
        packaged: items.filter((item) => item.artifactValidation?.state !== 'missing').length,
        attention: items.filter((item) => item.validation.state === 'warning' || item.artifactValidation?.state === 'warning' || item.handshakeState === 'warning').length,
    };
}

export function getMcpById(mcpId, definitions = baseMcpCatalog, runtime = {}, packageRegistry = []) {
    const target = definitions.find((item) => item.id === mcpId);
    return target ? buildMcpView(target, runtime, packageRegistry) : null;
}
