import { connectorCatalog } from '@/data/connectors';

export const SKILL_DEFINITION_STORAGE_KEY = 'campus_skill_definition_v1';

export const skillStatusMap = {
    enabled: { id: 'enabled', label: '已启用', tone: 'healthy' },
    review: { id: 'review', label: '待审核', tone: 'warning' },
    draft: { id: 'draft', label: '草稿中', tone: 'draft' },
    paused: { id: 'paused', label: '已停用', tone: 'draft' },
};

export const skillOriginMap = {
    chaoxing: '超星官方',
    school: '学校官方',
    personal: '个人自建',
};

export const skillMarketStatusMap = {
    listed: '学校市场上架',
    review: '申请审核中',
    private: '仅自己可见',
    limited: '校内定向开放',
};

export const skillTriggerModeMap = {
    chat: '对话调用',
    workflow: '流程编排',
    sidebar: '侧边工具',
    event: '事件触发',
};

export const skillPackageValidationMap = {
    valid: { id: 'valid', label: '规范通过', tone: 'healthy' },
    warning: { id: 'warning', label: '可用但需复核', tone: 'warning' },
    invalid: { id: 'invalid', label: '未通过校验', tone: 'draft' },
    missing: { id: 'missing', label: '缺少制品', tone: 'draft' },
};

export const capabilityLabelMap = {
    services: 'AI 办事',
    research: 'AI 科研',
    assistant: 'AI 助教',
    library: 'AI 图书馆',
    agents: 'AI 智能体',
};

const SKILL_REFERENCE_TIME = Date.parse('2026-03-30T10:20:00+08:00');

function hoursAgo(hours) {
    return new Date(SKILL_REFERENCE_TIME - hours * 60 * 60 * 1000).toISOString();
}

function normalizeList(values = []) {
    return values
        .flat()
        .filter(Boolean)
        .map((item) => String(item).trim())
        .filter(Boolean);
}

export function uid(prefix = 'skill') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function canUseStorage() {
    return typeof window !== 'undefined';
}

const baseSkillCatalog = [
    {
        id: 'service-timetable-brief',
        name: '课表摘要助手',
        summary: '把教务课表、考试安排和通知提醒整合成一个适合萤火虫继续解释的办事技能。',
        owner: '超星 AI Campus',
        provider: '超星',
        origin: 'chaoxing',
        status: 'enabled',
        marketStatus: 'listed',
        targetCapabilityId: 'services',
        fireflyEnabled: true,
        connectorIds: ['academic-affairs', 'notice-center'],
        invocationModes: ['chat', 'workflow'],
        audience: '学生 / 辅导员 / 教务秘书',
        description: '适用于用户直接提问“查明天课表”“这周有没有考试”这类高频诉求。技能本身不负责直连系统，而是调度教务与通知相关连接器完成读取、整理和回执。',
        publishNote: '作为 AI 办事 的默认技能之一，由平台预置给学校启用。',
        reviewNote: '已通过平台审核，可被萤火虫直接调用。',
        suggestedPrompts: [
            '帮我查明天课表，并提醒我上午有没有空档。',
            '把这周的考试安排和相关通知一起整理一下。',
            '如果我今天有课程变更，请先告诉我最重要的一条。',
        ],
        successRate: '97%',
        monthlyCalls: 2480,
        lastUpdatedAt: hoursAgo(8),
        lastInvokedAt: hoursAgo(2),
    },
    {
        id: 'service-notice-digest',
        name: '通知分拣员',
        summary: '把通知中心的未读消息自动归并成待办、提醒和参考信息三类，减少用户逐条打开的成本。',
        owner: '学校数字校园中心',
        provider: '学校官方',
        origin: 'school',
        status: 'enabled',
        marketStatus: 'limited',
        targetCapabilityId: 'services',
        fireflyEnabled: true,
        connectorIds: ['notice-center'],
        invocationModes: ['chat', 'event'],
        audience: '全校用户',
        description: '适合作为统一消息中心和萤火虫之间的桥接技能，对通知进行分类、摘要和优先级标记。',
        publishNote: '单位默认启用，可按学校消息策略做定制化分级。',
        reviewNote: '由学校信息化部门维护，允许校内二次配置。',
        suggestedPrompts: [
            '把今天新增通知里最重要的两条挑出来。',
            '哪些消息必须今天处理，哪些只是看看就行？',
        ],
        successRate: '99%',
        monthlyCalls: 1810,
        lastUpdatedAt: hoursAgo(12),
        lastInvokedAt: hoursAgo(1),
    },
    {
        id: 'research-paper-radar',
        name: '科研线索雷达',
        summary: '围绕科研主题生成检索线索、候选论文方向和平台接力建议，适合作为 AI 科研 的默认技能。',
        owner: '超星 AI Research',
        provider: '超星',
        origin: 'chaoxing',
        status: 'review',
        marketStatus: 'review',
        targetCapabilityId: 'research',
        fireflyEnabled: false,
        connectorIds: ['bohrium-research'],
        invocationModes: ['chat', 'workflow'],
        audience: '教师 / 研究生 / 科研秘书',
        description: '技能先在萤火虫中理解用户研究主题，再决定是否把用户接力到闻道或波尔科研平台进一步探索。',
        publishNote: '计划作为学校科研空间的推荐技能，需要校方确认默认跳转平台策略。',
        reviewNote: '等待科研条线确认默认平台和数据边界。',
        suggestedPrompts: [
            '围绕“多模态教育智能体”给我列一个检索框架。',
            '先帮我归纳研究主题，再决定要不要去科研平台继续找文献。',
        ],
        successRate: '91%',
        monthlyCalls: 640,
        lastUpdatedAt: hoursAgo(18),
        lastInvokedAt: hoursAgo(9),
    },
    {
        id: 'library-reading-companion',
        name: 'AI 阅读伴读',
        summary: '在阅读页面结合当前书籍、笔记和馆藏信息，给出伴读、解释和笔记抽取能力。',
        owner: '学校图书馆',
        provider: '学校官方',
        origin: 'school',
        status: 'enabled',
        marketStatus: 'listed',
        targetCapabilityId: 'library',
        fireflyEnabled: true,
        connectorIds: ['library-opac'],
        invocationModes: ['chat', 'sidebar'],
        audience: '学生 / 教师 / 读者',
        description: '技能可跟随 AI 图书馆 的阅读上下文，支持提问当前书、整理章节摘要、记录引用笔记，并在必要时回看学校馆藏状态。',
        publishNote: '作为 AI 图书馆 默认能力开放，可与学校馆藏系统深度联动。',
        reviewNote: '已通过审核，上架学校技能市场。',
        suggestedPrompts: [
            '解释一下我当前读到这一段想表达什么。',
            '把这一章值得记笔记的三点提出来。',
            '我这本书如果读完，下一本应该接着看什么？',
        ],
        successRate: '96%',
        monthlyCalls: 1320,
        lastUpdatedAt: hoursAgo(5),
        lastInvokedAt: hoursAgo(3),
    },
    {
        id: 'assistant-course-followup',
        name: '课程跟进助手',
        summary: '把课程互动、作业追踪和课堂反馈整理成教师可继续操作的教学工作流技能。',
        owner: '教师发展中心',
        provider: '学校官方',
        origin: 'school',
        status: 'draft',
        marketStatus: 'private',
        targetCapabilityId: 'assistant',
        fireflyEnabled: false,
        connectorIds: [],
        invocationModes: ['chat', 'workflow'],
        audience: '教师 / 助教',
        description: '当前仍处于草稿中，等待与泛雅相关的真实连接方式明确后再启用。',
        publishNote: '先在教师个人空间试用，通过后再申请校内上架。',
        reviewNote: '尚未绑定教学系统连接器，暂不建议默认开放。',
        suggestedPrompts: [
            '帮我生成本周课程跟进清单。',
            '把学生这周最值得关注的互动问题列出来。',
        ],
        successRate: '待接入',
        monthlyCalls: 0,
        lastUpdatedAt: hoursAgo(20),
        lastInvokedAt: null,
    },
    {
        id: 'agent-market-publisher',
        name: '智能体上架顾问',
        summary: '帮助老师或部门把自建智能体整理成可审核、可上架的校园技能。',
        owner: '个人空间',
        provider: '当前用户',
        origin: 'personal',
        status: 'review',
        marketStatus: 'review',
        targetCapabilityId: 'agents',
        fireflyEnabled: true,
        connectorIds: [],
        invocationModes: ['chat', 'workflow'],
        audience: '老师 / 部门管理员 / 学校运营',
        description: '这类技能不一定绑定具体系统，但会把提示词、能力边界、审核说明和上架材料统一整理出来，便于进入学校技能市场。',
        publishNote: '个人自建技能可先自用，再提交学校审核。',
        reviewNote: '等待单位管理员审核是否允许进入学校市场。',
        suggestedPrompts: [
            '帮我把这个智能体整理成可以提交学校审核的技能说明。',
            '这个个人技能要上架学校市场，还缺哪些材料？',
        ],
        successRate: '94%',
        monthlyCalls: 96,
        lastUpdatedAt: hoursAgo(11),
        lastInvokedAt: hoursAgo(6),
    },
];

export const skillCatalog = baseSkillCatalog;

export function buildSkillDefinitionDefaults(raw = {}) {
    return {
        id: raw.id || uid('skill'),
        name: raw.name || '未命名技能',
        summary: raw.summary || '用于把校园场景中的某类能力封装成可复用技能。',
        owner: raw.owner || '未分配',
        provider: raw.provider || '当前租户',
        origin: raw.origin || 'personal',
        status: raw.status || 'draft',
        marketStatus: raw.marketStatus || 'private',
        targetCapabilityId: raw.targetCapabilityId || 'services',
        fireflyEnabled: typeof raw.fireflyEnabled === 'boolean' ? raw.fireflyEnabled : raw.status === 'enabled',
        connectorIds: normalizeList(raw.connectorIds),
        invocationModes: normalizeList(raw.invocationModes).length > 0 ? normalizeList(raw.invocationModes) : ['chat'],
        audience: raw.audience || '校园用户',
        description: raw.description || '',
        publishNote: raw.publishNote || '',
        reviewNote: raw.reviewNote || '',
        suggestedPrompts: normalizeList(raw.suggestedPrompts),
        successRate: raw.successRate || '待评估',
        monthlyCalls: Number(raw.monthlyCalls || 0),
        lastUpdatedAt: raw.lastUpdatedAt || new Date().toISOString(),
        lastInvokedAt: raw.lastInvokedAt || null,
        packagePath: raw.packagePath || null,
        packageVersion: raw.packageVersion || raw.version || '1.0.0',
        isCustom: Boolean(raw.isCustom),
    };
}

export function buildDefaultSkillDefinitionState() {
    return {
        patches: {},
        custom: [],
    };
}

export function buildSkillDraft() {
    return buildSkillDefinitionDefaults({
        id: uid('skill'),
        name: '',
        owner: '当前用户',
        provider: '个人空间',
        origin: 'personal',
        status: 'draft',
        marketStatus: 'private',
        fireflyEnabled: false,
        isCustom: true,
    });
}

export function buildSkillDefinitions(state = buildDefaultSkillDefinitionState()) {
    const patches = state?.patches || {};
    const custom = Array.isArray(state?.custom) ? state.custom : [];

    const mergedBase = baseSkillCatalog.map((skill) => buildSkillDefinitionDefaults({
        ...skill,
        ...(patches[skill.id] || {}),
    }));

    const customSkills = custom.map((skill) => buildSkillDefinitionDefaults({
        ...skill,
        isCustom: true,
    }));

    return [...mergedBase, ...customSkills];
}

export function loadSkillDefinitionState() {
    if (!canUseStorage()) {
        return buildDefaultSkillDefinitionState();
    }

    try {
        const raw = JSON.parse(localStorage.getItem(SKILL_DEFINITION_STORAGE_KEY) || 'null');
        if (!raw) {
            return buildDefaultSkillDefinitionState();
        }

        return {
            patches: raw.patches || {},
            custom: Array.isArray(raw.custom) ? raw.custom : [],
        };
    } catch (error) {
        console.error('Failed to restore skill definition state:', error);
        return buildDefaultSkillDefinitionState();
    }
}

export function saveSkillDefinitionState(nextState = buildDefaultSkillDefinitionState()) {
    if (!canUseStorage()) {
        return;
    }

    try {
        localStorage.setItem(SKILL_DEFINITION_STORAGE_KEY, JSON.stringify({
            patches: nextState.patches || {},
            custom: Array.isArray(nextState.custom) ? nextState.custom : [],
        }));
    } catch (error) {
        console.error('Failed to persist skill definition state:', error);
    }
}

export function buildMissingSkillPackageState(skill) {
    return {
        id: skill.id,
        title: skill.name,
        description: skill.summary,
        capability: skill.targetCapabilityId,
        owner: skill.owner,
        origin: skill.origin,
        provider: skill.provider,
        version: skill.packageVersion || '1.0.0',
        entry: 'SKILL.md',
        status: skill.status,
        marketStatus: skill.marketStatus,
        fireflyEnabled: Boolean(skill.fireflyEnabled),
        audience: skill.audience,
        connectors: skill.connectorIds || [],
        invocationModes: skill.invocationModes || [],
        relativePath: skill.packagePath || null,
        packageDir: null,
        sections: [],
        missingSections: ['Purpose', 'Inputs', 'Workflow', 'Outputs', 'Safety'],
        validation: {
            state: 'missing',
            label: '缺少制品',
            errors: ['尚未生成 SKILL.md 制品文件。'],
            warnings: [],
        },
    };
}

export function buildSkillPackageMap(packageRegistry = []) {
    return new Map(
        (packageRegistry || []).map((item) => [item.id, item])
    );
}

export function buildSkillView(skill, connectorDefinitions = connectorCatalog, packageRegistry = []) {
    const connectorMap = new Map(
        (connectorDefinitions || []).map((connector) => [connector.id, connector])
    );
    const packageMap = buildSkillPackageMap(packageRegistry);
    const packageInfo = packageMap.get(skill.id) || buildMissingSkillPackageState(skill);

    const linkedConnectors = skill.connectorIds
        .map((connectorId) => connectorMap.get(connectorId))
        .filter(Boolean);
    const validationMeta = skillPackageValidationMap[packageInfo.validation?.state] || skillPackageValidationMap.missing;
    const validationPassed = packageInfo.validation?.state === 'valid' || packageInfo.validation?.state === 'warning';

    return {
        ...skill,
        linkedConnectors,
        connectorCount: linkedConnectors.length,
        targetCapabilityLabel: capabilityLabelMap[skill.targetCapabilityId] || skill.targetCapabilityId,
        originLabel: skillOriginMap[skill.origin] || skill.origin,
        statusMeta: skillStatusMap[skill.status] || skillStatusMap.draft,
        marketLabel: skillMarketStatusMap[skill.marketStatus] || skill.marketStatus,
        packagePath: packageInfo.relativePath || skill.packagePath || null,
        packageVersion: packageInfo.version || skill.packageVersion || '1.0.0',
        packageTitle: packageInfo.title || skill.name,
        packageDescription: packageInfo.description || skill.summary,
        packageSections: packageInfo.sections || [],
        packageMissingSections: packageInfo.missingSections || [],
        packageValidation: packageInfo.validation,
        packageValidationMeta: validationMeta,
        validationPassed,
        canEnableFirefly: validationPassed,
        canPublishMarket: packageInfo.validation?.state === 'valid',
    };
}

export function buildSkillViews(definitions = skillCatalog, connectorDefinitions = connectorCatalog, packageRegistry = []) {
    return definitions.map((skill) => buildSkillView(skill, connectorDefinitions, packageRegistry));
}

export function buildSkillSummary(skills = []) {
    return {
        total: skills.length,
        enabled: skills.filter((item) => item.status === 'enabled').length,
        review: skills.filter((item) => item.status === 'review').length,
        fireflyEnabled: skills.filter((item) => item.fireflyEnabled).length,
        listed: skills.filter((item) => item.marketStatus === 'listed').length,
        personal: skills.filter((item) => item.origin === 'personal').length,
        validated: skills.filter((item) => item.validationPassed).length,
    };
}

export function getSkillById(skillId, definitions = skillCatalog, connectorDefinitions = connectorCatalog, packageRegistry = []) {
    const target = definitions.find((item) => item.id === skillId);
    return target ? buildSkillView(target, connectorDefinitions, packageRegistry) : null;
}

export function getSkillsForConnector(connectorId, definitions = skillCatalog, connectorDefinitions = connectorCatalog, packageRegistry = []) {
    return buildSkillViews(definitions, connectorDefinitions, packageRegistry)
        .filter((skill) => skill.connectorIds.includes(connectorId));
}
