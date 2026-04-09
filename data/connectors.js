export const CONNECTOR_RUNTIME_STORAGE_KEY = 'campus_connector_runtime_v2';
export const CONNECTOR_DEFINITION_STORAGE_KEY = 'campus_connector_definition_v2';
export const CONNECTOR_VAULT_STORAGE_KEY = 'campus_connector_vault_v1';

export const connectorStatusMap = {
    healthy: { id: 'healthy', label: '稳定可用', tone: 'healthy' },
    warning: { id: 'warning', label: '人工关注', tone: 'warning' },
    limited: { id: 'limited', label: '半自动', tone: 'limited' },
    draft: { id: 'draft', label: '待接入', tone: 'draft' },
    paused: { id: 'paused', label: '已暂停', tone: 'draft' },
};

export const connectorCategoryMap = {
    academic: '教学教务',
    campus: '校园事务',
    resource: '资源检索',
    research: '科研平台',
    operations: '运营服务',
};

export const connectorTypeMap = {
    browser: '页面流程',
    http: '接口拉取',
    embed: '导航接力',
    client: '客户侧代理',
};

export const vaultKindMap = {
    session: '会话复用',
    token: '服务令牌',
    password: '账号密码',
    proxy: '客户侧代理',
};

export const capabilityLabelMap = {
    services: 'AI 办事',
    messages: '消息中心',
    research: 'AI 科研',
    assistant: 'AI 助教',
    library: 'AI 图书馆',
    agents: 'AI 智能体',
};

const CONNECTOR_REFERENCE_TIME = Date.parse('2026-03-29T17:31:00+08:00');

function hoursAgo(hours) {
    return new Date(CONNECTOR_REFERENCE_TIME - hours * 60 * 60 * 1000).toISOString();
}

export function uid(prefix = 'connector') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function canUseStorage() {
    return typeof window !== 'undefined';
}

const baseConnectorCatalog = [
    {
        id: 'academic-affairs',
        name: '教务系统',
        shortName: '教务',
        category: 'academic',
        sourceLabel: '第三方教务平台',
        summary: '用于课表、考试安排、成绩与教学日历等高频查询。',
        accessPath: 'CAS 登录后进入 教务系统 > 课表查询 / 考试安排 / 成绩查询。',
        owner: '教务处',
        status: 'healthy',
        primaryCapabilityId: 'services',
        preferredConnectorType: 'browser',
        openUrl: 'https://jw.example.edu.cn',
        connectionStrategy: '优先复用统一认证会话，无官方 API 时由 Browser Connector 进入模块后抽取结构化结果。',
        permissions: ['课表查询', '考试安排', '成绩查询', '教学日历'],
        authModes: [
            {
                id: 'sso-session',
                label: 'SSO 会话复用',
                detail: '直接复用 OS 与教务系统之间的统一认证会话，不存用户密码。',
                risk: '低风险，适合大部分已接 CAS 的学校。',
                preferred: true,
            },
            {
                id: 'browser-agent',
                label: '本机浏览器代理',
                detail: '在用户已登录浏览器里执行页面操作，适合校内终端部署。',
                risk: '中等风险，依赖浏览器环境与页面结构稳定。',
            },
            {
                id: 'credential-fallback',
                label: '账号密码兜底',
                detail: '仅在学校明确授权且无其他方式时启用，凭证需放入保险库。',
                risk: '高风险，只建议用于历史系统兜底。',
            },
        ],
        health: {
            successRate: '97%',
            avgLatency: '4.2 秒',
            freshness: '最近 30 分钟',
            lastValidatedAt: hoursAgo(2),
        },
        risks: [
            '没有公开 API 时，依赖课表页和考试页的 DOM 结构。',
            '若出现验证码或设备校验，需要切为半自动确认模式。',
            '涉及成绩类信息时，需要记录审计与最小权限范围。',
        ],
        executionPolicy: [
            '只读默认开启，写操作默认关闭。',
            '页面抽取结果必须做字段映射和空值校验。',
            '异常时返回“无法确认最新结果”，不能编造课表内容。',
        ],
        connectorCapabilities: [
            { id: 'timetable', label: '课表查询', desc: '按日期、周次或学期提取课程安排。' },
            { id: 'exam', label: '考试安排', desc: '汇总考试时间、地点与监考提醒。' },
            { id: 'grade', label: '成绩摘要', desc: '生成学期成绩摘要，适合对话解释。' },
        ],
        suggestedPrompts: [
            '帮我查明天课表。',
            '看看这周有没有考试安排。',
            '把本学期课程按周几整理一下。',
        ],
        auditTrail: [
            {
                id: 'audit-academic-1',
                actor: '萤火虫',
                action: '课表查询',
                outcome: '成功',
                detail: '通过 SSO 会话复用进入课表页并完成结构化提取。',
                at: hoursAgo(6),
            },
            {
                id: 'audit-academic-2',
                actor: '系统巡检',
                action: '连接健康检查',
                outcome: '成功',
                detail: '关键选择器命中率正常，页面打开耗时 4.0 秒。',
                at: hoursAgo(18),
            },
        ],
        walkthrough: {
            label: '查明天课表',
            userQuery: '帮我查明天课表，并按上课时间排好。',
            steps: [
                '复用统一认证会话，确认教务系统可访问。',
                '进入课表模块并选择“本周 / 明天”视图。',
                '提取课程名称、时间、地点与教师字段。',
                '将结果标准化后回写给萤火虫，并推送到消息中心。',
            ],
            resultTitle: '已返回明天课表',
            resultSummary: '明天共有 3 门课，最早 08:00 在教学楼 A201 开始。',
            fireflyPrompt: '请基于教务系统连接器刚刚拉取的结果，帮我把明天课表整理成按时间排序的清单，并提醒我中间是否有空档。',
        },
    },
    {
        id: 'notice-center',
        name: '通知中心',
        shortName: '通知',
        category: 'campus',
        sourceLabel: '超星通知中心',
        summary: '汇总待办通知、站内消息与校园公告，适合接入统一消息中心。',
        accessPath: '统一认证后进入 notice 列表，支持按未读和时间范围拉取。',
        owner: '学校门户',
        status: 'healthy',
        primaryCapabilityId: 'messages',
        preferredConnectorType: 'http',
        openUrl: 'https://notice.chaoxing.com/pc/notice/myNotice',
        connectionStrategy: '优先分析登录后真实接口；若接口受限，再退回已登录页面抓取。',
        permissions: ['消息列表', '未读状态', '通知详情'],
        authModes: [
            {
                id: 'sso-session',
                label: 'SSO 会话复用',
                detail: '沿用统一认证 Cookie 拉取消息列表与详情。',
                risk: '低风险，适合统一认证场景。',
                preferred: true,
            },
            {
                id: 'api-token',
                label: '服务令牌',
                detail: '如果未来拿到正式接口，可切为受控 token 调用。',
                risk: '低风险，稳定性更高。',
            },
            {
                id: 'html-scrape',
                label: '登录后页面解析',
                detail: '作为原型或接口缺失时的兜底方案。',
                risk: '中风险，需关注列表结构变化。',
            },
        ],
        health: {
            successRate: '99%',
            avgLatency: '1.6 秒',
            freshness: '最近 5 分钟',
            lastValidatedAt: hoursAgo(1),
        },
        risks: [
            '如果分页参数或反爬规则调整，接口适配需要同步更新。',
            '消息详情可能包含附件与富文本，需要做安全过滤。',
        ],
        executionPolicy: [
            '消息列表以增量同步为主，避免重复全量抓取。',
            '未读状态需与消息中心统一，支持反写或本地映射。',
            '来源、优先级和详情链接统一标准化后再展示。',
        ],
        connectorCapabilities: [
            { id: 'notice-list', label: '通知同步', desc: '拉取未读消息、公告与待处理提醒。' },
            { id: 'notice-detail', label: '详情查看', desc: '打开原通知详情并关联消息中心条目。' },
        ],
        suggestedPrompts: [
            '看看今天有什么新通知。',
            '把未读公告里和教学相关的挑出来。',
        ],
        auditTrail: [
            {
                id: 'audit-notice-1',
                actor: '系统巡检',
                action: '消息增量同步',
                outcome: '成功',
                detail: '同步了 12 条消息，新增 2 条未读提醒。',
                at: hoursAgo(4),
            },
        ],
        walkthrough: {
            label: '同步未读通知',
            userQuery: '把今天新增的未读通知同步进消息中心。',
            steps: [
                '复用通知中心登录态，增量拉取最近 24 小时列表。',
                '识别未读状态并拉取高优先级详情。',
                '标准化来源、时间与原始链接。',
                '写入消息中心，并给萤火虫一条摘要回执。',
            ],
            resultTitle: '已同步 2 条新通知',
            resultSummary: '其中 1 条来自教学事务，1 条来自图书馆公告。',
            fireflyPrompt: '请基于通知中心刚同步的未读消息，帮我提炼今天最需要处理的两条，并按优先级给出建议。',
        },
    },
    {
        id: 'library-opac',
        name: '馆藏检索',
        shortName: '馆藏',
        category: 'resource',
        sourceLabel: '学校图书馆 OPAC',
        summary: '连接学校图书馆的书目、馆藏和借阅记录，支撑 AI 图书馆的真实资源联动。',
        accessPath: '图书馆门户 > 书目查询 / 我的借阅 / 电子资源。',
        owner: '图书馆',
        status: 'limited',
        primaryCapabilityId: 'library',
        preferredConnectorType: 'browser',
        openUrl: 'https://library.example.edu.cn',
        connectionStrategy: '图书检索优先走公开查询，借阅记录走登录后页面连接器，必要时由图书馆侧提供专用代理。',
        permissions: ['书目查询', '馆藏状态', '我的借阅', '电子资源入口'],
        authModes: [
            {
                id: 'sso-session',
                label: 'SSO 会话复用',
                detail: '适合已接统一认证的馆藏系统。',
                risk: '低风险。',
                preferred: true,
            },
            {
                id: 'client-proxy',
                label: '客户侧代理',
                detail: '在学校内网部署采集代理，屏蔽外部网络访问差异。',
                risk: '中风险，但更适合长期交付。',
            },
            {
                id: 'credential-fallback',
                label: '账号密码兜底',
                detail: '只对个人借阅记录启用，须配合凭证保险库。',
                risk: '高风险。',
            },
        ],
        health: {
            successRate: '88%',
            avgLatency: '5.1 秒',
            freshness: '最近 2 小时',
            lastValidatedAt: hoursAgo(5),
        },
        risks: [
            '不同学校馆藏系统差异较大，字段映射需要模板化配置。',
            '电子资源常有外部跳转与内网限制，不适合一开始承诺全自动。',
        ],
        executionPolicy: [
            '书目与馆藏查询可直接开放给 AI 图书馆使用。',
            '借阅与续借动作必须先审计、再执行。',
            '遇到跨域或内网限制时，优先走客户侧代理。',
        ],
        connectorCapabilities: [
            { id: 'catalog', label: '书目检索', desc: '查询馆藏、出版社、索书号和可借状态。' },
            { id: 'borrow', label: '借阅记录', desc: '查看当前借阅、到期时间和续借建议。' },
            { id: 'eresource', label: '电子资源跳转', desc: '从 AI 图书馆跳到学校资源入口。' },
        ],
        suggestedPrompts: [
            '帮我查《傲慢与偏见》馆藏还有没有。',
            '看看我现在借的书哪些快到期了。',
        ],
        auditTrail: [
            {
                id: 'audit-library-1',
                actor: '萤火虫',
                action: '借阅记录读取',
                outcome: '需人工确认',
                detail: '页面出现设备校验，已退回半自动模式。',
                at: hoursAgo(9),
            },
        ],
        walkthrough: {
            label: '检查借阅状态',
            userQuery: '看看我借的书里哪些快到期了。',
            steps: [
                '校验图书馆连接器是否仍处于已授权状态。',
                '进入“我的借阅”列表并提取到期日期。',
                '按剩余天数排序，标记需要续借的项目。',
                '同步给 AI 图书馆和萤火虫，形成提醒。',
            ],
            resultTitle: '已整理借阅到期提醒',
            resultSummary: '当前有 2 本书将在 3 天内到期，建议优先续借。',
            fireflyPrompt: '请根据图书馆连接器刚整理的借阅状态，帮我生成一条到期提醒摘要，并告诉我哪些书需要优先续借。',
        },
    },
    {
        id: 'bohrium-research',
        name: '波尔科研空间',
        shortName: '波尔',
        category: 'research',
        sourceLabel: '科研外部平台',
        summary: '为 AI 科研提供外部科研平台接入示例，强调“已有平台也能作为连接器资产管理”。',
        accessPath: '波尔首页 > 发现 / 超算 / 论文 / 个人工作区。',
        owner: '科研平台运营方',
        status: 'warning',
        primaryCapabilityId: 'research',
        preferredConnectorType: 'embed',
        openUrl: 'https://www.bohrium.com/',
        connectionStrategy: '已能作为导航入口接入，但如果需要真实检索与任务执行，仍建议补 API、网页流程脚本或客户端代理。',
        permissions: ['平台导航', '论文发现', '工作区跳转'],
        authModes: [
            {
                id: 'current-window',
                label: '当前窗口接入',
                detail: '适合做导航入口和工作区承接。',
                risk: '低风险。',
                preferred: true,
            },
            {
                id: 'browser-agent',
                label: '页面流程脚本',
                detail: '如果未来需要抽取检索结果，可为特定模块配置流程脚本。',
                risk: '中风险。',
            },
            {
                id: 'partner-api',
                label: '合作接口',
                detail: '正式联动时应尽量推进对方开放检索或任务接口。',
                risk: '低风险，长期最稳。',
            },
        ],
        health: {
            successRate: '91%',
            avgLatency: '2.8 秒',
            freshness: '最近 1 小时',
            lastValidatedAt: hoursAgo(3),
        },
        risks: [
            '平台已经有自己的左侧导航时，OS 侧不能重复堆叠导航。',
            '如果只做外链接入，萤火虫无法自动理解站内结果，需要额外连接器脚本。',
        ],
        executionPolicy: [
            '导航接入与数据接入分开描述，避免误导用户“已打通全部能力”。',
            '对外部科研平台优先提供“进入、理解、接力”三层能力。',
        ],
        connectorCapabilities: [
            { id: 'handoff', label: '平台接力', desc: '把用户从萤火虫引导到合适的平台入口。' },
            { id: 'summary', label: '结果总结', desc: '对用户提供的平台内容做结构化总结。' },
        ],
        suggestedPrompts: [
            '波尔更适合我现在的科研任务吗？',
            '如果我要做材料方向检索，应该从哪个入口进？',
        ],
        auditTrail: [
            {
                id: 'audit-bohrium-1',
                actor: '系统巡检',
                action: '入口可访问性检查',
                outcome: '成功',
                detail: '当前窗口打开正常，新标签打开也正常。',
                at: hoursAgo(8),
            },
        ],
        walkthrough: {
            label: '判断是否切到波尔',
            userQuery: '我现在这个问题要不要切到波尔科研空间？',
            steps: [
                '识别当前任务属于导航、检索还是外部计算。',
                '判断现有闻道入口是否足够，若不足再建议切波尔。',
                '将理由、进入入口与下一步提示回给萤火虫。',
            ],
            resultTitle: '已给出平台切换建议',
            resultSummary: '当前任务更适合先在波尔的论文发现入口启动。',
            fireflyPrompt: '请根据波尔科研空间连接器给出的建议，告诉我为什么这个任务更适合切到波尔，以及我进入后第一步该做什么。',
        },
    },
];

export const connectorCatalog = baseConnectorCatalog;

const defaultAuthModes = [
    {
        id: 'sso-session',
        label: 'SSO 会话复用',
        detail: '优先复用统一认证会话，不直接保存用户密码。',
        risk: '低风险，适合统一认证场景。',
        preferred: true,
    },
    {
        id: 'browser-agent',
        label: '本机浏览器代理',
        detail: '通过本机浏览器登录态或客户端代理执行业务流程。',
        risk: '中风险，依赖页面结构与本地环境。',
    },
    {
        id: 'credential-fallback',
        label: '账号密码兜底',
        detail: '仅在学校明确授权且没有更优方式时启用。',
        risk: '高风险，需要进入凭证保险库。',
    },
];

const defaultExecutionPolicy = [
    '默认只读接入，写操作需单独授权。',
    '结果必须标准化后再返回上层能力，不能直接透传网页碎片。',
    '调用失败时应明确告知“无法确认最新结果”。',
];

const defaultRisks = [
    '页面结构变化会影响流程脚本和字段抽取命中率。',
    '如果出现验证码、多因子认证或设备校验，需要切为半自动模式。',
];

const defaultConnectorCapabilities = [
    { id: 'search', label: '信息查询', desc: '读取第三方系统中的结构化信息。' },
    { id: 'summary', label: '结果整理', desc: '将系统返回结果转换为萤火虫可解释的数据。' },
];

const defaultWalkthrough = {
    label: '读取系统结果',
    userQuery: '帮我读取这个系统里的最新信息。',
    steps: [
        '校验统一认证或默认授权方式是否可用。',
        '进入目标入口并定位到需要的功能模块。',
        '提取关键字段并标准化结果。',
        '将结果回传给萤火虫和消息中心。',
    ],
    resultTitle: '已完成系统读取',
    resultSummary: '连接器已成功返回一条结构化结果。',
    fireflyPrompt: '请根据连接器刚读取的结果，帮我整理成用户可直接理解的摘要。',
};

function buildDefinitionDefaults(raw = {}) {
    const baseName = raw.name || '未命名连接器';
    const shortName = raw.shortName || baseName.slice(0, 4);
    const preferredConnectorType = raw.preferredConnectorType || raw.connectorType || 'browser';

    return {
        id: raw.id || uid('connector'),
        name: baseName,
        shortName,
        category: raw.category || 'campus',
        sourceLabel: raw.sourceLabel || '外部系统',
        summary: raw.summary || `${baseName} 的接入入口与执行能力。`,
        accessPath: raw.accessPath || '请填写统一认证后的访问路径。',
        owner: raw.owner || '待分配',
        status: raw.status || 'draft',
        primaryCapabilityId: raw.primaryCapabilityId || 'services',
        preferredConnectorType,
        openUrl: raw.openUrl || '',
        connectionStrategy: raw.connectionStrategy || '优先复用统一认证；若无接口，则由页面连接器或客户侧代理兜底。',
        permissions: Array.isArray(raw.permissions) && raw.permissions.length > 0 ? raw.permissions : ['信息查询'],
        authModes: Array.isArray(raw.authModes) && raw.authModes.length > 0 ? raw.authModes : defaultAuthModes,
        health: {
            successRate: raw.health?.successRate || '待校验',
            avgLatency: raw.health?.avgLatency || '待校验',
            freshness: raw.health?.freshness || '待校验',
            lastValidatedAt: raw.health?.lastValidatedAt || hoursAgo(48),
        },
        risks: Array.isArray(raw.risks) && raw.risks.length > 0 ? raw.risks : defaultRisks,
        executionPolicy: Array.isArray(raw.executionPolicy) && raw.executionPolicy.length > 0 ? raw.executionPolicy : defaultExecutionPolicy,
        connectorCapabilities: Array.isArray(raw.connectorCapabilities) && raw.connectorCapabilities.length > 0 ? raw.connectorCapabilities : defaultConnectorCapabilities,
        suggestedPrompts: Array.isArray(raw.suggestedPrompts) && raw.suggestedPrompts.length > 0 ? raw.suggestedPrompts : ['帮我读取这个系统里的最新信息。'],
        auditTrail: Array.isArray(raw.auditTrail) ? raw.auditTrail : [],
        walkthrough: raw.walkthrough || defaultWalkthrough,
        isCustom: Boolean(raw.isCustom),
    };
}

export function buildDefaultConnectorDefinitionState() {
    return {
        custom: [],
        patches: {},
    };
}

export function loadConnectorDefinitionState() {
    const defaults = buildDefaultConnectorDefinitionState();

    if (!canUseStorage()) {
        return defaults;
    }

    try {
        const raw = JSON.parse(localStorage.getItem(CONNECTOR_DEFINITION_STORAGE_KEY) || 'null');
        if (!raw || typeof raw !== 'object') {
            return defaults;
        }

        return {
            custom: Array.isArray(raw.custom) ? raw.custom.map((item) => buildDefinitionDefaults({ ...item, isCustom: true })) : [],
            patches: raw.patches && typeof raw.patches === 'object' ? raw.patches : {},
        };
    } catch (error) {
        console.error('Failed to restore connector definition state:', error);
        return defaults;
    }
}

export function saveConnectorDefinitionState(state) {
    if (!canUseStorage()) {
        return;
    }

    try {
        localStorage.setItem(CONNECTOR_DEFINITION_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error('Failed to persist connector definition state:', error);
    }
}

export function buildConnectorDefinitions(state = buildDefaultConnectorDefinitionState()) {
    const baseDefinitions = baseConnectorCatalog.map((connector) => buildDefinitionDefaults({
        ...connector,
        ...(state.patches?.[connector.id] || {}),
        isCustom: false,
    }));

    const customDefinitions = (state.custom || []).map((item) => buildDefinitionDefaults({
        ...item,
        isCustom: true,
    }));

    return [...baseDefinitions, ...customDefinitions];
}

function buildRuntimeDefaultsFromDefinitions(definitions = connectorCatalog) {
    return Object.fromEntries(
        definitions.map((rawConnector) => {
            const connector = buildDefinitionDefaults(rawConnector);

            return [
            connector.id,
            {
                authorized: connector.status !== 'draft',
                preferredAuthId: connector.authModes.find((item) => item.preferred)?.id || connector.authModes[0]?.id || null,
                status: connector.status,
                lastValidatedAt: connector.health.lastValidatedAt,
                executionCount: connector.auditTrail.length,
                lastExecutedAt: connector.auditTrail[0]?.at || null,
                lastQuery: connector.walkthrough.userQuery,
                auditTrail: connector.auditTrail,
                config: {
                    openUrl: connector.openUrl,
                    accessPath: connector.accessPath,
                    owner: connector.owner,
                    connectorType: connector.preferredConnectorType,
                    primaryCapabilityId: connector.primaryCapabilityId,
                    scope: 'read',
                    requireConfirmation: connector.status !== 'healthy',
                    vaultRef: `${connector.id}-vault`,
                    syncWindow: '24h',
                    timeoutSec: connector.preferredConnectorType === 'browser' ? 45 : 20,
                    enabled: connector.status !== 'draft',
                },
            },
        ];
        })
    );
}

export function buildDefaultConnectorRuntime(definitions = connectorCatalog) {
    return buildRuntimeDefaultsFromDefinitions(definitions);
}

export function loadConnectorRuntime(definitions = connectorCatalog) {
    const defaults = buildRuntimeDefaultsFromDefinitions(definitions);

    if (!canUseStorage()) {
        return defaults;
    }

    try {
        const raw = JSON.parse(localStorage.getItem(CONNECTOR_RUNTIME_STORAGE_KEY) || 'null');
        if (!raw || typeof raw !== 'object') {
            return defaults;
        }

        return Object.fromEntries(
            Object.keys(defaults).map((connectorId) => [
                connectorId,
                {
                    ...defaults[connectorId],
                    ...(raw[connectorId] || {}),
                    config: {
                        ...defaults[connectorId].config,
                        ...((raw[connectorId] || {}).config || {}),
                    },
                },
            ])
        );
    } catch (error) {
        console.error('Failed to restore connector runtime:', error);
        return defaults;
    }
}

export function saveConnectorRuntime(runtime) {
    if (!canUseStorage()) {
        return;
    }

    try {
        localStorage.setItem(CONNECTOR_RUNTIME_STORAGE_KEY, JSON.stringify(runtime));
    } catch (error) {
        console.error('Failed to persist connector runtime:', error);
    }
}

export function buildDefaultVaultItems(definitions = connectorCatalog) {
    return definitions.map((rawConnector, index) => {
        const connector = buildDefinitionDefaults(rawConnector);

        return ({
        id: `${connector.id}-vault`,
        connectorId: connector.id,
        connectorName: connector.name,
        kind: connector.preferredConnectorType === 'http' ? 'token' : connector.preferredConnectorType === 'client' ? 'proxy' : 'session',
        title: `${connector.name} 默认凭证`,
        owner: connector.owner,
        status: connector.status === 'healthy' ? 'valid' : 'review',
        expiresAt: hoursAgo(-24 * (index + 7)),
        lastVerifiedAt: connector.health.lastValidatedAt,
        lastUsedAt: connector.auditTrail[0]?.at || connector.health.lastValidatedAt,
        linkedAuthModeId: connector.authModes.find((item) => item.preferred)?.id || connector.authModes[0]?.id || null,
        scope: connector.primaryCapabilityId,
        note: connector.preferredConnectorType === 'http'
            ? '建议后续切为正式服务令牌管理。'
            : '当前以统一认证会话或浏览器代理为主，不直接暴露明文密码。',
    });
    });
}

export function loadConnectorVault(definitions = connectorCatalog) {
    const defaults = buildDefaultVaultItems(definitions);

    if (!canUseStorage()) {
        return defaults;
    }

    try {
        const raw = JSON.parse(localStorage.getItem(CONNECTOR_VAULT_STORAGE_KEY) || 'null');
        if (!Array.isArray(raw) || raw.length === 0) {
            return defaults;
        }

        const map = Object.fromEntries(raw.map((item) => [item.id, item]));
        const merged = defaults.map((item) => ({
            ...item,
            ...(map[item.id] || {}),
        }));

        const customOnly = raw.filter((item) => !merged.some((entry) => entry.id === item.id));
        return [...merged, ...customOnly];
    } catch (error) {
        console.error('Failed to restore connector vault:', error);
        return defaults;
    }
}

export function saveConnectorVault(items) {
    if (!canUseStorage()) {
        return;
    }

    try {
        localStorage.setItem(CONNECTOR_VAULT_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
        console.error('Failed to persist connector vault:', error);
    }
}

export function getConnectorById(connectorId, definitions = connectorCatalog) {
    return definitions.find((item) => item.id === connectorId) || null;
}

export function buildConnectorView(connector, runtime, vaultItems = []) {
    const state = runtime?.[connector.id] || {};
    const config = {
        openUrl: connector.openUrl,
        accessPath: connector.accessPath,
        owner: connector.owner,
        connectorType: connector.preferredConnectorType,
        primaryCapabilityId: connector.primaryCapabilityId,
        scope: 'read',
        requireConfirmation: connector.status !== 'healthy',
        vaultRef: `${connector.id}-vault`,
        syncWindow: '24h',
        timeoutSec: connector.preferredConnectorType === 'browser' ? 45 : 20,
        enabled: connector.status !== 'draft',
        ...(state.config || {}),
    };
    const vaultItem = vaultItems.find((item) => item.id === config.vaultRef || item.connectorId === connector.id) || null;

    return {
        ...connector,
        authorized: typeof state.authorized === 'boolean' ? state.authorized : connector.status !== 'draft',
        preferredAuthId: state.preferredAuthId || connector.authModes.find((item) => item.preferred)?.id || connector.authModes[0]?.id || null,
        status: state.status || connector.status,
        lastValidatedAt: state.lastValidatedAt || connector.health.lastValidatedAt,
        executionCount: state.executionCount ?? connector.auditTrail.length,
        lastExecutedAt: state.lastExecutedAt || connector.auditTrail[0]?.at || null,
        lastQuery: state.lastQuery || connector.walkthrough.userQuery,
        auditTrail: Array.isArray(state.auditTrail) && state.auditTrail.length > 0 ? state.auditTrail : connector.auditTrail,
        runtimeConfig: config,
        openUrl: config.openUrl,
        accessPath: config.accessPath,
        owner: config.owner,
        preferredConnectorType: config.connectorType,
        primaryCapabilityId: config.primaryCapabilityId,
        vaultItem,
    };
}

export function buildConnectorViews(definitions, runtime, vaultItems = []) {
    return definitions.map((connector) => buildConnectorView(connector, runtime, vaultItems));
}

export function buildConnectorSummary(connectors) {
    const total = connectors.length;
    const authorized = connectors.filter((item) => item.authorized).length;
    const healthy = connectors.filter((item) => item.status === 'healthy').length;
    const needAttention = connectors.filter((item) => item.status === 'warning' || item.status === 'limited').length;
    const paused = connectors.filter((item) => item.runtimeConfig?.enabled === false || item.status === 'paused').length;

    return {
        total,
        authorized,
        healthy,
        needAttention,
        paused,
    };
}

export function buildConnectorDraft() {
    return buildDefinitionDefaults({
        id: uid('connector'),
        name: '',
        shortName: '',
        summary: '',
        sourceLabel: '新接入系统',
        accessPath: '',
        owner: '',
        openUrl: '',
        status: 'draft',
        permissions: ['信息查询'],
        suggestedPrompts: ['帮我读取这个系统里的最新信息。'],
        isCustom: true,
    });
}
