import { MORNING_DIGEST_TASK_ID } from '@/lib/scheduledTaskCatalog';
import { loadAdminAgentRuntimeConfig } from '@/lib/adminAgentRuntimeStore';
import { formatFireflyControlPlanePresetLabel } from '@/lib/fireflyControlPlanePresets';
import { matchFireflyTools, resolveFireflyTool } from '@/services/fireflyToolRegistry';
import { extractDirectUrls } from '@/services/fireflyUrlRuntimeService';

function dedupeTools(tools = []) {
    const map = new Map();
    tools.forEach((tool) => {
        if (!map.has(tool.id)) {
            map.set(tool.id, tool);
        }
    });
    return Array.from(map.values());
}

function prioritizePreferredTools(tools = [], contextSnapshot = {}) {
    const preferredToolIds = Array.isArray(contextSnapshot?.preferredToolIds)
        ? contextSnapshot.preferredToolIds.filter(Boolean)
        : [];

    if (!preferredToolIds.length) {
        return tools;
    }

    const preferredSet = new Set(preferredToolIds);
    return [...tools].sort((left, right) => {
        const leftScore = preferredSet.has(left.id) ? 1 : 0;
        const rightScore = preferredSet.has(right.id) ? 1 : 0;
        return rightScore - leftScore;
    });
}

function applyControlPlaneToolPolicies(tools = [], contextSnapshot = {}) {
    const blockedToolIds = Array.isArray(contextSnapshot?.blockedToolIds)
        ? contextSnapshot.blockedToolIds.filter(Boolean)
        : [];
    const pinnedToolIds = Array.isArray(contextSnapshot?.pinnedToolIds)
        ? contextSnapshot.pinnedToolIds.filter(Boolean)
        : [];
    const leasedToolIds = Array.isArray(contextSnapshot?.leasedToolIds)
        ? contextSnapshot.leasedToolIds.filter(Boolean)
        : [];
    const selectionMode = String(contextSnapshot?.toolSelectionMode || contextSnapshot?.controlPlanePrefs?.tools?.selectionMode || 'auto').trim();
    const webSearchMode = String(contextSnapshot?.webSearchMode || contextSnapshot?.controlPlanePrefs?.tools?.webSearchMode || 'auto').trim();
    const blockedSet = new Set(blockedToolIds);
    const pinnedSet = new Set([...pinnedToolIds, ...leasedToolIds]);
    const webToolSet = new Set([
        'web.search',
        'web.fetch',
        'web.answer',
        'research.search',
        'research.read',
        'research.report',
    ]);

    let filtered = tools.filter((tool) => !blockedSet.has(tool.id));

    if (
        webSearchMode === 'manual_only'
        && !contextSnapshot?.webSearchEnabled
        && !contextSnapshot?.deepResearchEnabled
    ) {
        filtered = filtered.filter((tool) => !webToolSet.has(tool.id));
    }

    if (selectionMode === 'pinned_only' && pinnedSet.size > 0) {
        const pinnedOnly = filtered.filter((tool) => pinnedSet.has(tool.id));
        if (pinnedOnly.length > 0) {
            return pinnedOnly;
        }
    }

    return filtered;
}

function extractControlPlanePolicyContext(contextSnapshot = {}) {
    const prefs = contextSnapshot?.controlPlanePrefs && typeof contextSnapshot.controlPlanePrefs === 'object'
        ? contextSnapshot.controlPlanePrefs
        : {};

    return {
        presetId: String(prefs?.presetId || 'balanced').trim() || 'balanced',
        presetLabel: formatFireflyControlPlanePresetLabel(prefs?.presetId || 'balanced'),
        selectionMode: String(contextSnapshot?.toolSelectionMode || prefs?.tools?.selectionMode || 'auto').trim(),
        webSearchMode: String(contextSnapshot?.webSearchMode || prefs?.tools?.webSearchMode || 'auto').trim(),
        blockedToolIds: Array.isArray(contextSnapshot?.blockedToolIds)
            ? contextSnapshot.blockedToolIds.filter(Boolean)
            : Array.isArray(prefs?.tools?.blockedToolIds)
                ? prefs.tools.blockedToolIds.filter(Boolean)
                : [],
        confirmBeforeUseToolIds: Array.isArray(prefs?.tools?.confirmBeforeUseToolIds)
            ? prefs.tools.confirmBeforeUseToolIds.filter(Boolean)
            : [],
    };
}

function applyStepApprovalPolicies(steps = [], contextSnapshot = {}) {
    const policy = extractControlPlanePolicyContext(contextSnapshot);
    const confirmSet = new Set(policy.confirmBeforeUseToolIds);

    if (!confirmSet.size) {
        return Array.isArray(steps) ? steps : [];
    }

    return (Array.isArray(steps) ? steps : []).map((step) => {
        const toolId = String(step?.toolId || step?.skillId || '').trim();
        if (!toolId || !confirmSet.has(toolId) || step.requiresApproval) {
            return step;
        }

        const label = String(step.label || toolId).trim();
        return {
            ...step,
            requiresApproval: true,
            approvalLabel: step.approvalLabel || `批准使用 ${label}`,
            approvalReason: step.approvalReason || `当前前台策略要求工具「${label}」在执行前先确认。`,
        };
    });
}

function extractResearchReplayContext(contextSnapshot = {}) {
    const replay = contextSnapshot?.researchReplay && typeof contextSnapshot.researchReplay === 'object'
        ? contextSnapshot.researchReplay
        : null;
    const bundle = replay?.bundle && typeof replay.bundle === 'object'
        ? replay.bundle
        : null;

    if (!bundle) {
        return null;
    }

    return {
        bundle,
        sourceLabel: String(replay.sourceLabel || '').trim(),
        sourceToolId: String(replay.sourceToolId || '').trim(),
        followupMode: String(replay.followupMode || 'reuse_bundle').trim(),
    };
}

function buildIntent(question = '', selectedTools = []) {
    if (selectedTools.some((tool) => tool.id === 'workspace.publish')) {
        return {
            id: 'workspace_publish',
            label: '产物发布',
        };
    }

    if (selectedTools.some((tool) => tool.id === 'workspace.manifest')) {
        return {
            id: 'workspace_manifest',
            label: '产物清单',
        };
    }

    if (selectedTools.some((tool) => tool.id === 'workspace.write')) {
        return {
            id: 'workspace_persistence',
            label: '工作区沉淀',
        };
    }

    if (selectedTools.some((tool) => tool.id === 'workspace.read') || selectedTools.some((tool) => tool.id === 'workspace.overview')) {
        return {
            id: 'workspace_operation',
            label: '工作区操作',
        };
    }

    if (selectedTools.some((tool) => tool.id === 'research.report')) {
        return {
            id: 'deep_research',
            label: '深度研究',
        };
    }

    if (selectedTools.some((tool) => tool.id === 'page.answer')) {
        return {
            id: 'url_reading',
            label: '链接理解',
        };
    }

    if (selectedTools.some((tool) => tool.id === 'compose.report') && selectedTools.some((tool) => tool.id === 'approvals.center_overview') && selectedTools.some((tool) => tool.id === 'messages.unread_summary')) {
        return {
            id: 'campus_structured_delivery',
            label: '校园成文',
        };
    }

    if (selectedTools.some((tool) => tool.id === 'compose.report') && selectedTools.some((tool) => tool.id === 'approvals.center_overview')) {
        return {
            id: 'approval_structured_delivery',
            label: '审批成文',
        };
    }

    if (selectedTools.some((tool) => tool.id === 'compose.report') && selectedTools.some((tool) => tool.id === 'messages.unread_summary')) {
        return {
            id: 'message_structured_delivery',
            label: '消息成文',
        };
    }

    if (selectedTools.length > 1) {
        return {
            id: 'multi_capability_coordination',
            label: '多能力联动',
        };
    }

    if (/审批|待办|流程/.test(question) && /未读|消息|通知/.test(question)) {
        return {
            id: 'campus_overview',
            label: '校园总览',
        };
    }

    if (/审批|待办|流程/.test(question)) {
        return {
            id: 'approval_coordination',
            label: '审批整理',
        };
    }

    if (/应用|应用门户|办事大厅|服务大厅/.test(question)) {
        return {
            id: 'app_portal_search',
            label: '应用查询',
        };
    }

    if (/未读|消息|通知/.test(question)) {
        return {
            id: 'message_digest',
            label: '消息整理',
        };
    }

    if (/书|阅读|笔记|章节|摘要|总结/.test(question)) {
        return {
            id: 'reading_companion',
            label: '阅读协同',
        };
    }

    if (/晨报|晨间|日报|早报|总览/.test(question)) {
        return {
            id: 'campus_digest',
            label: '摘要推送',
        };
    }

    return {
        id: 'general_assist',
        label: '通用协同',
    };
}

function buildTaskTitle(question = '', selectedTools = []) {
    if (selectedTools.some((tool) => tool.id === 'workspace.publish')) {
        return '线程产物发布';
    }

    if (selectedTools.some((tool) => tool.id === 'workspace.manifest')) {
        return '线程产物清单';
    }

    if (selectedTools.some((tool) => tool.id === 'workspace.write')) {
        return '线程工作区文件沉淀';
    }

    if (selectedTools.some((tool) => tool.id === 'workspace.read')) {
        return '线程文件读取';
    }

    if (selectedTools.some((tool) => tool.id === 'workspace.overview')) {
        return '线程工作区概览';
    }

    if (selectedTools.some((tool) => tool.id === 'research.report')) {
        return `深度研究：${question.slice(0, 18) || '研究问题'}`;
    }

    if (selectedTools.some((tool) => tool.id === 'compose.report') && selectedTools.some((tool) => tool.id === 'approvals.center_overview') && selectedTools.some((tool) => tool.id === 'messages.unread_summary')) {
        return '校园事项汇总文档';
    }

    if (selectedTools.some((tool) => tool.id === 'compose.report') && selectedTools.some((tool) => tool.id === 'approvals.center_overview')) {
        return '审批汇总文档';
    }

    if (selectedTools.some((tool) => tool.id === 'compose.report') && selectedTools.some((tool) => tool.id === 'messages.unread_summary')) {
        return '消息汇总文档';
    }

    if (selectedTools.some((tool) => tool.id === 'page.answer')) {
        return `链接解读：${question.slice(0, 18) || '页面内容'}`;
    }

    if (selectedTools.some((tool) => tool.id === 'web.answer')) {
        return `联网查询：${question.slice(0, 18) || '通用问题'}`;
    }

    if (selectedTools.some((tool) => tool.id === 'approvals.center_overview') && selectedTools.some((tool) => tool.id === 'messages.unread_summary')) {
        return '校园待办与消息总览';
    }

    if (selectedTools.some((tool) => tool.id === 'digest.morning_briefing')) {
        return '校园晨间摘要';
    }

    if (selectedTools.some((tool) => tool.id === 'approvals.center_overview')) {
        return '审批待办整理';
    }

    if (selectedTools.some((tool) => tool.id === 'apps.portal_search')) {
        return '应用门户查询';
    }

    if (selectedTools.some((tool) => tool.id === 'messages.unread_summary')) {
        return '未读消息整理';
    }

    if (selectedTools.some((tool) => tool.id === 'library.reading_context')) {
        return '阅读上下文协同';
    }

    return question.slice(0, 24) || '萤火虫任务';
}

function requiresStructuredDelivery(question = '') {
    return /简报|汇总|汇报|报告|文档|整理成文|整理成一个文档|形成一个文档|形成简报|形成一份|周报|月报/.test(question);
}

function requiresWorkspacePersistence(question = '') {
    return /保存到工作区|写入工作区|存到工作区|落到工作区|生成文件|保存成文件|存成文件|写到文件|导出到工作区/.test(question);
}

function requiresWorkspacePublish(question = '') {
    return /发布到输出区|发布到 outputs|正式产出|导出到 outputs|移到输出区|发布产物/.test(question);
}

function detectWebResearchProfile(question = '') {
    const normalizedQuestion = String(question || '').trim();
    const compactQuestion = normalizedQuestion.replace(/\s+/g, '');
    const isFactCheck = /真假|是真的吗|是否属实|是否真实|证实|核实|辟谣|谣言|可信|准确吗|是真的么|是真的吗/.test(compactQuestion);
    const isComparison = /对比|比较|区别|差异|哪个好|谁更|哪一个更|vs|PK|优缺点/.test(compactQuestion);
    const isTimeline = /时间线|来龙去脉|始末|全过程|发展历程|发生了什么|经过/.test(compactQuestion);
    const isLatest = /最新|最近|今日|今天|昨日|昨天|本周|本月|刚刚|现状|进展|情况|update|latest|news|recent/i.test(normalizedQuestion);
    const isListing = /列出|清单|盘点|汇总|有哪些|名单|排名|排行|top|梳理下|汇总下/.test(compactQuestion);
    const isQuickFact = !isFactCheck
        && !isComparison
        && !isTimeline
        && !isLatest
        && !isListing
        && normalizedQuestion.length <= 28
        && /谁是|什么是|哪个|哪里|首都|创始人|CEO|哪一年|什么时候|何时|多大|多少|人口|面积|位置/.test(compactQuestion);

    if (isFactCheck) {
        return {
            id: 'fact_check',
            label: '事实核验',
            summary: '先定位原始说法，再核对关键来源，最后给出核验结论。',
            requiresFetch: true,
            steps: [
                {
                    id: 'web-search',
                    toolId: 'web.search',
                    label: '定位原始说法',
                    summary: '先找到说法最初出现的位置和主要流传来源。',
                },
                {
                    id: 'web-fetch',
                    toolId: 'web.fetch',
                    label: '核对关键来源',
                    summary: '读取关键页面摘录，确认说法是否被原文支持。',
                    requiresApproval: true,
                    approvalLabel: '批准核对关键来源',
                    approvalReason: '该步骤会读取外部网页摘录，用来核验说法是否属实。',
                },
                {
                    id: 'web-answer',
                    toolId: 'web.answer',
                    label: '给出核验结论',
                    summary: '把已核对信息、冲突点和结论整理清楚。',
                    workerRole: 'synthesis_worker',
                },
            ],
        };
    }

    if (isComparison) {
        return {
            id: 'comparison',
            label: '对比分析',
            summary: '先确认比较对象和维度，再补齐依据，最后输出对比结论。',
            requiresFetch: true,
            steps: [
                {
                    id: 'web-search',
                    toolId: 'web.search',
                    label: '确定比较维度',
                    summary: '先收敛比较对象、常见维度和关键指标。',
                },
                {
                    id: 'web-fetch',
                    toolId: 'web.fetch',
                    label: '补齐关键依据',
                    summary: '读取关键页面摘录，避免只凭标题做横向对比。',
                    requiresApproval: true,
                    approvalLabel: '批准补齐关键依据',
                    approvalReason: '该步骤会读取外部网页摘录，用来支撑比较结论。',
                },
                {
                    id: 'web-answer',
                    toolId: 'web.answer',
                    label: '整理对比结论',
                    summary: '把差异点、优劣势和适用场景整理成回答。',
                    workerRole: 'synthesis_worker',
                },
            ],
        };
    }

    if (isTimeline) {
        return {
            id: 'timeline',
            label: '事件时间线',
            summary: '先搜集关键节点，再核对页面细节，最后整理成时间线。',
            requiresFetch: true,
            steps: [
                {
                    id: 'web-search',
                    toolId: 'web.search',
                    label: '搜集关键节点',
                    summary: '先找出事件的主要时间点和来源线索。',
                },
                {
                    id: 'web-fetch',
                    toolId: 'web.fetch',
                    label: '核对页面细节',
                    summary: '读取关键页面摘录，补足时间点对应的具体信息。',
                    requiresApproval: true,
                    approvalLabel: '批准核对页面细节',
                    approvalReason: '该步骤会读取外部网页摘录，用来确认事件时间线。',
                },
                {
                    id: 'web-answer',
                    toolId: 'web.answer',
                    label: '整理事件时间线',
                    summary: '按时间顺序梳理关键节点、变化和当前状态。',
                    workerRole: 'synthesis_worker',
                },
            ],
        };
    }

    if (isLatest) {
        return {
            id: 'latest_update',
            label: '最新进展',
            summary: '先锁定最新来源，再核对关键页面，最后整理最新状态。',
            requiresFetch: true,
            steps: [
                {
                    id: 'web-search',
                    toolId: 'web.search',
                    label: '锁定最新来源',
                    summary: '优先收敛近期且可信的来源，避免引用过旧信息。',
                },
                {
                    id: 'web-fetch',
                    toolId: 'web.fetch',
                    label: '核对关键页面',
                    summary: '读取关键页面摘录，确认最新进展而不是只看搜索标题。',
                    requiresApproval: true,
                    approvalLabel: '批准读取关键页面',
                    approvalReason: '该步骤会继续读取外部网页摘录，用来核对最新进展。',
                },
                {
                    id: 'web-answer',
                    toolId: 'web.answer',
                    label: '整理最新进展',
                    summary: '把最新动态、关键时间点和当前状态整理成回答。',
                    workerRole: 'synthesis_worker',
                },
            ],
        };
    }

    if (isListing) {
        return {
            id: 'listing',
            label: '清单汇总',
            summary: '先搜集候选条目，再核对重点内容，最后整理成清单结果。',
            requiresFetch: true,
            steps: [
                {
                    id: 'web-search',
                    toolId: 'web.search',
                    label: '搜集候选条目',
                    summary: '先收敛候选名单或条目范围，避免遗漏主要结果。',
                },
                {
                    id: 'web-fetch',
                    toolId: 'web.fetch',
                    label: '核对重点条目',
                    summary: '读取重点页面摘录，确认条目信息是否准确。',
                    requiresApproval: true,
                    approvalLabel: '批准核对重点条目',
                    approvalReason: '该步骤会读取外部网页摘录，用来确认重点条目内容。',
                },
                {
                    id: 'web-answer',
                    toolId: 'web.answer',
                    label: '整理清单结果',
                    summary: '把条目、筛选结果和补充说明整理清楚。',
                    workerRole: 'synthesis_worker',
                },
            ],
        };
    }

    if (isQuickFact) {
        return {
            id: 'quick_fact',
            label: '快速事实',
            summary: '问题较单点，先定位可信来源，再直接提炼结论。',
            requiresFetch: false,
            steps: [
                {
                    id: 'web-search',
                    toolId: 'web.search',
                    label: '定位可信来源',
                    summary: '先找出可信且直接相关的公开来源。',
                },
                {
                    id: 'web-answer',
                    toolId: 'web.answer',
                    label: '提炼直接答案',
                    summary: '基于搜索结果直接整理简洁回答，必要时注明不确定性。',
                    workerRole: 'synthesis_worker',
                },
            ],
        };
    }

    return {
        id: 'overview',
        label: '公开信息梳理',
        summary: '先搜集公开来源，再核对关键页面，最后整理结论回答。',
        requiresFetch: true,
        steps: [
            {
                id: 'web-search',
                toolId: 'web.search',
                label: '搜集公开来源',
                summary: '先收敛一批可供参考和引用的来源。',
            },
            {
                id: 'web-fetch',
                toolId: 'web.fetch',
                label: '核对关键页面',
                summary: '读取关键页面摘录，避免只基于搜索标题做判断。',
                requiresApproval: true,
                approvalLabel: '批准读取关键页面',
                approvalReason: '该步骤会继续读取外部网页摘录，用来核对搜索结果。',
            },
            {
                id: 'web-answer',
                toolId: 'web.answer',
                label: '整理结论回答',
                summary: '把来源和页面摘录压缩成可直接阅读的结论。',
                workerRole: 'synthesis_worker',
            },
        ],
    };
}

function buildStep(tool, order, patch = {}) {
    return {
        id: `plan-step-${tool.id}-${order}`,
        order,
        toolId: tool.id,
        label: tool.name,
        outputKey: patch.outputKey || tool.id,
        purpose: patch.purpose || tool.description || '',
        input: patch.input || {},
        continueOnError: Boolean(patch.continueOnError),
        workerId: String(patch.workerId || `worker-${order}`).trim(),
        workerLabel: String(patch.workerLabel || patch.subtaskLabel || tool.name).trim(),
        workerRole: String(patch.workerRole || 'tool_worker').trim(),
        parallelGroup: patch.parallelGroup || '',
        subtaskId: patch.subtaskId || `subtask-${order}`,
        subtaskLabel: patch.subtaskLabel || patch.label || tool.name,
    };
}

function buildWorkerTree(steps = [], title = '') {
    const workers = [];
    const seen = new Set();

    steps.forEach((step, index) => {
        const workerId = String(step.workerId || `worker-${index + 1}`).trim();
        if (!workerId || seen.has(workerId)) {
            return;
        }
        seen.add(workerId);
        workers.push({
            id: workerId,
            parentId: 'supervisor-root',
            label: String(step.workerLabel || step.subtaskLabel || step.label || `Worker ${index + 1}`).trim(),
            role: String(step.workerRole || 'tool_worker').trim(),
            status: 'pending',
            linkedToolIds: [step.toolId || step.skillId].filter(Boolean),
            stepIds: [step.id].filter(Boolean),
        });
    });

    return [
        {
            id: 'supervisor-root',
            parentId: '',
            label: title || 'Firefly Supervisor',
            role: 'supervisor',
            status: 'pending',
            linkedToolIds: [],
            stepIds: steps.map((step) => step.id).filter(Boolean),
        },
        ...workers,
    ];
}

function buildResearchPipelinePlan({
    question = '',
    contextSnapshot = {},
    matchedTools = [],
    memoryContext = {},
    toolbeltContext = {},
    governanceContext = {},
    resumeContext = {},
    agentConfig = {},
    intent = { id: 'research_pipeline', label: '研究任务' },
    title = '',
    planKind = 'research_pipeline',
    reasoning = [],
    decompositionMode = 'research_pipeline',
    routeProfile = {},
    stageBlueprints = [],
    extraMetadata = {},
} = {}) {
    const stages = Array.isArray(stageBlueprints) ? stageBlueprints.filter((item) => item?.toolId) : [];
    const stageToolIds = stages.map((item) => item.toolId);
    const resolvedTools = dedupeTools(stageToolIds.map((toolId) => resolveFireflyTool(toolId, contextSnapshot)).filter(Boolean));
    const toolMap = Object.fromEntries(resolvedTools.map((tool) => [tool.id, tool]));
    const activeStages = stages.filter((stage) => toolMap[stage.toolId]);

    return buildPlanPayload(question, activeStages.map((stage) => toolMap[stage.toolId]), reasoning, {
        candidateTools: matchedTools,
        contextSnapshot,
        title,
        intent,
        steps: activeStages.map((stage, index) => buildStep(toolMap[stage.toolId], index + 1, {
            subtaskId: stage.id,
            subtaskLabel: stage.label,
            purpose: stage.summary,
            continueOnError: index > 0,
            requiresApproval: Boolean(stage.requiresApproval),
            approvalLabel: stage.approvalLabel || '',
            approvalReason: stage.approvalReason || '',
            workerId: stage.workerId || `worker-${stage.id}`,
            workerLabel: stage.workerLabel || stage.label,
            workerRole: stage.workerRole || 'research_worker',
        })),
        planKind,
        metadata: {
            parentTaskId: resumeContext.parentTaskId,
            isResume: resumeContext.isResume,
            resumeTarget: resumeContext.taskTitle || resumeContext.taskGoal,
            resumeSummary: resumeContext.taskResultSummary,
            memoryIds: memoryContext.memoryIds,
            memorySummary: memoryContext.summary,
            memoryTitles: memoryContext.memoryTitles,
            governanceHistory: governanceContext.history,
            governanceLabels: governanceContext.recentLabels,
            executionMode: 'sequential',
            decompositionMode,
            maxPlannerSteps: agentConfig.runtime?.maxPlannerSteps,
            researchBundleExpected: true,
            traceMode: 'paragraph_citation_trace',
            routeProfile,
            ...extraMetadata,
            subtasks: activeStages.map((stage, index) => ({
                id: stage.id,
                order: index + 1,
                label: stage.label,
                summary: stage.summary,
                linkedToolIds: [stage.toolId],
                outputKeys: [stage.toolId],
                bundleMode: stage.bundleMode || stage.toolId.replace(/\./g, '_'),
                traceExpected: Boolean(stage.traceExpected),
            })),
        },
    });
}

function buildExcludedToolDecisions(candidateTools = [], selectedTools = [], metadata = {}) {
    const selectedSet = new Set(selectedTools.map((tool) => tool.id));
    const limitReached = Number(metadata?.maxPlannerSteps || 0) > 0
        && selectedTools.length >= Number(metadata.maxPlannerSteps);

    return candidateTools
        .filter((tool) => tool?.id && !selectedSet.has(tool.id))
        .map((tool) => ({
            id: tool.id,
            name: tool.name,
            reason: limitReached
                ? '命中候选能力，但超出本轮 planner 可执行步骤上限。'
                : '命中候选能力，但本轮没有进入最终执行计划。',
        }));
}

function uniquePlannerLines(items = []) {
    return (Array.isArray(items) ? items : [])
        .map((item) => String(item || '').trim())
        .filter((item, index, array) => item && array.indexOf(item) === index);
}

function isExternalResearchToolId(toolId = '') {
    return /^(web|research|page)\./.test(String(toolId || '').trim());
}

function buildGovernanceInfluenceReview(steps = [], selectedTools = [], metadata = {}) {
    const contextSnapshot = metadata?.contextSnapshot && typeof metadata.contextSnapshot === 'object'
        ? metadata.contextSnapshot
        : {};
    const policy = extractControlPlanePolicyContext(contextSnapshot);
    const governanceHistory = Array.isArray(contextSnapshot?.governanceHistory)
        ? contextSnapshot.governanceHistory.filter((item) => item && typeof item === 'object')
        : [];
    const recentLabels = governanceHistory
        .map((item) => String(item.label || '').trim())
        .filter(Boolean)
        .slice(0, 3);
    const candidateTools = Array.isArray(metadata?.candidateTools) ? metadata.candidateTools : selectedTools;
    const toolMap = new Map(
        [...candidateTools, ...selectedTools]
            .filter((tool) => tool?.id)
            .map((tool) => [tool.id, tool])
    );
    const selectedToolIds = selectedTools
        .map((tool) => String(tool?.id || '').trim())
        .filter(Boolean);
    const selectedSet = new Set(selectedToolIds);
    const stepToolIds = (Array.isArray(steps) ? steps : [])
        .map((step) => String(step?.toolId || step?.skillId || '').trim())
        .filter(Boolean);
    const pinnedLikeSet = new Set([
        ...(Array.isArray(contextSnapshot?.pinnedToolIds) ? contextSnapshot.pinnedToolIds : []),
        ...(Array.isArray(contextSnapshot?.leasedToolIds) ? contextSnapshot.leasedToolIds : []),
        ...(Array.isArray(contextSnapshot?.preferredToolIds) ? contextSnapshot.preferredToolIds : []),
    ].filter(Boolean));
    const selectedPinnedLike = selectedToolIds
        .filter((toolId) => pinnedLikeSet.has(toolId) && selectedSet.has(toolId))
        .map((toolId) => toolMap.get(toolId)?.name || toolId)
        .slice(0, 3);
    const blockedCandidates = candidateTools
        .filter((tool) => policy.blockedToolIds.includes(tool.id))
        .map((tool) => tool.name || tool.id)
        .slice(0, 3);
    const gatedSteps = (Array.isArray(steps) ? steps : [])
        .filter((step) => policy.confirmBeforeUseToolIds.includes(step.toolId || step.skillId))
        .map((step) => String(step.label || step.subtaskLabel || step.toolId || step.skillId || '').trim())
        .filter(Boolean)
        .slice(0, 3);
    const externalSelected = stepToolIds.filter((toolId) => isExternalResearchToolId(toolId));
    const lines = [];

    if (policy.selectionMode !== 'auto') {
        if (selectedPinnedLike.length > 0) {
            lines.push(`前台「${policy.presetLabel || '当前策略'}」已参与工具裁剪，本轮优先保留了：${selectedPinnedLike.join('、')}。`);
        } else if (selectedToolIds.length > 0) {
            lines.push(`前台当前采用「${policy.presetLabel || '当前策略'}」工具策略，本轮候选空间已经按该策略重新收敛。`);
        }
    }

    if (policy.blockedToolIds.length > 0) {
        if (blockedCandidates.length > 0) {
            lines.push(`前台屏蔽动作已经生效，这轮有 ${policy.blockedToolIds.length} 个工具被挡在候选外，例如：${blockedCandidates.join('、')}。`);
        } else {
            lines.push(`前台当前仍屏蔽着 ${policy.blockedToolIds.length} 个工具，这轮规划是在更窄的候选空间里完成的。`);
        }
    }

    if (gatedSteps.length > 0) {
        lines.push(`前台把这些步骤改成了先确认再继续：${gatedSteps.join('、')}。`);
    }

    if (policy.webSearchMode === 'manual_only') {
        if (externalSelected.length > 0) {
            lines.push(
                contextSnapshot?.webSearchEnabled || contextSnapshot?.deepResearchEnabled
                    ? '前台已把联网切到手动，本轮因为显式开启了联网/研究能力，所以仍保留了外部研究链。'
                    : '前台已把联网切到手动，本轮外部研究链只会在你显式开启后才保留。'
            );
        } else if (candidateTools.some((tool) => isExternalResearchToolId(tool.id))) {
            lines.push('前台已把联网切到手动，这轮规划会优先避免自动进入外部研究链。');
        }
    }

    if (recentLabels.length > 0) {
        lines.push(`这轮还显式继承了你最近在前台应用的治理动作：${recentLabels.join('、')}。`);
    }

    return uniquePlannerLines(lines).slice(0, 4);
}

function applyPlannerSelfReview(question = '', steps = [], selectedTools = [], metadata = {}) {
    const selfRevisions = [];
    let reviewedSteps = Array.isArray(steps) ? [...steps] : [];
    const seenToolIds = new Set();
    const candidateTools = Array.isArray(metadata.candidateTools) ? metadata.candidateTools : selectedTools;

    reviewedSteps = reviewedSteps.filter((step) => {
        const toolId = String(step.toolId || step.skillId || '').trim();
        if (!toolId) {
            return true;
        }

        if (seenToolIds.has(toolId) && toolId !== 'web.fetch') {
            selfRevisions.push(`移除了重复的工具步骤：${toolId}`);
            return false;
        }

        seenToolIds.add(toolId);
        return true;
    });

    if (/什么时候|何时|哪一年|完结|首播|最后一集|播出|上映|latest/i.test(question) && seenToolIds.has('web.search') && !seenToolIds.has('web.answer')) {
        const webAnswerTool = resolveFireflyTool('web.answer', metadata.contextSnapshot || {});
        if (webAnswerTool) {
            reviewedSteps.push(buildStep(webAnswerTool, reviewedSteps.length + 1, {
                subtaskId: 'web-answer',
                subtaskLabel: '生成结构化回答',
                workerId: 'worker-web-answer',
                workerLabel: '回答合成 Worker',
                workerRole: 'synthesis_worker',
            }));
            selfRevisions.push('为通用事实问题自动补入联网回答步骤，避免只停在搜索结果。');
        }
    }

    const governanceInfluences = buildGovernanceInfluenceReview(reviewedSteps, selectedTools, metadata);
    const toolSelection = selectedTools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        capabilityId: tool.capabilityId,
    }));
    const excludedTools = buildExcludedToolDecisions(candidateTools, selectedTools, metadata);
    const revisionSources = [
        ...selfRevisions.map((message, index) => ({
            id: `planner-self-${index + 1}`,
            type: 'planner_self',
            label: `Planner 自修正 ${index + 1}`,
            message,
        })),
        ...governanceInfluences.map((message, index) => ({
            id: `governance-${index + 1}`,
            type: 'governance',
            label: `前台治理影响 ${index + 1}`,
            message,
        })),
    ];

    const review = {
        verdict: selfRevisions.length > 0 ? 'revised' : 'accepted',
        revisions: selfRevisions,
        selfRevisions,
        governanceInfluences,
        allRevisions: [...selfRevisions, ...governanceInfluences],
        revisionSources,
        toolSelection,
        excludedTools,
        constraints: {
            resumeMode: Boolean(metadata.isResume),
            executionMode: String(metadata.executionMode || 'sequential'),
            memoryCount: Array.isArray(metadata.memoryIds) ? metadata.memoryIds.length : 0,
            maxPlannerSteps: Number(metadata.maxPlannerSteps || 0),
        },
    };

    return {
        steps: reviewedSteps.map((step, index) => ({
            ...step,
            order: index + 1,
        })),
        review,
    };
}

function buildToolSelectionControl(tools = [], candidateTools = [], contextSnapshot = {}, metadata = {}) {
    const controlPolicy = extractControlPlanePolicyContext(contextSnapshot);
    const excludedTools = buildExcludedToolDecisions(candidateTools, tools, metadata);
    const finalSteps = Array.isArray(metadata?.finalSteps) ? metadata.finalSteps : [];

    return {
        preferredToolIds: Array.isArray(contextSnapshot?.preferredToolIds)
            ? contextSnapshot.preferredToolIds.filter(Boolean)
            : Array.isArray(metadata?.preferredToolIds)
                ? metadata.preferredToolIds.filter(Boolean)
                : [],
        candidateToolIds: candidateTools.map((tool) => tool.id),
        selectedToolIds: tools.map((tool) => tool.id),
        selectedTools: tools.map((tool) => ({
            id: tool.id,
            name: tool.name,
            capabilityId: tool.capabilityId,
        })),
        excludedToolIds: excludedTools.map((tool) => tool.id),
        excludedTools,
        resumeMode: Boolean(contextSnapshot?.resumeMode),
        pinnedToolIds: Array.isArray(contextSnapshot?.pinnedToolIds)
            ? contextSnapshot.pinnedToolIds.filter(Boolean)
            : [],
        leasedToolIds: Array.isArray(contextSnapshot?.leasedToolIds)
            ? contextSnapshot.leasedToolIds.filter(Boolean)
            : [],
        replayMode: String(metadata?.replayMode || '').trim(),
        blockedToolIds: controlPolicy.blockedToolIds,
        confirmBeforeUseToolIds: controlPolicy.confirmBeforeUseToolIds,
        presetId: controlPolicy.presetId,
        presetLabel: controlPolicy.presetLabel,
        requiresApprovalToolIds: finalSteps
            .filter((step) => step.requiresApproval)
            .map((step) => step.toolId || step.skillId)
            .filter(Boolean),
        selectionStrategy: metadata?.sourceBundleReplay
            ? 'source_bundle_replay'
            : Array.isArray(metadata?.candidateTools) && metadata.candidateTools.length > tools.length
                ? 'planner_trimmed_candidates'
                : 'direct_match',
    };
}

function buildSubtasksFromSteps(steps = [], mode = 'single') {
    const subtasks = [];
    const seen = new Set();

    steps.forEach((step, index) => {
        const subtaskId = String(step.subtaskId || `subtask-${index + 1}`).trim();
        if (seen.has(subtaskId)) {
            return;
        }
        seen.add(subtaskId);
        subtasks.push({
            id: subtaskId,
            order: subtasks.length + 1,
            label: String(step.subtaskLabel || step.label || `子任务 ${index + 1}`).trim(),
            summary: String(step.purpose || '').trim(),
            linkedToolIds: [step.toolId || step.skillId].filter(Boolean),
            outputKeys: [step.outputKey].filter(Boolean),
            mode,
        });
    });

    return subtasks;
}

function extractMemoryContext(contextSnapshot = {}) {
    const summary = String(contextSnapshot?.memorySummary || '').trim();
    const memoryIds = Array.isArray(contextSnapshot?.memoryIds)
        ? contextSnapshot.memoryIds.filter(Boolean)
        : [];
    const strategy = contextSnapshot?.serviceMemoryStrategy && typeof contextSnapshot.serviceMemoryStrategy === 'object'
        ? contextSnapshot.serviceMemoryStrategy
        : {};
    const lines = summary
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
    const memoryTitles = lines
        .filter((line) => /^\d+\./.test(line))
        .map((line) => line.replace(/^\d+\.\s*/, '').trim())
        .slice(0, 3);

    return {
        summary,
        memoryIds,
        memoryTitles,
        strategy,
        hasMemory: Boolean(summary || memoryIds.length),
    };
}

function extractToolbeltContext(contextSnapshot = {}) {
    const pinnedToolIds = Array.isArray(contextSnapshot?.pinnedToolIds)
        ? contextSnapshot.pinnedToolIds.filter(Boolean)
        : [];
    const leasedToolIds = Array.isArray(contextSnapshot?.leasedToolIds)
        ? contextSnapshot.leasedToolIds.filter(Boolean)
        : [];
    const preferredToolIds = Array.isArray(contextSnapshot?.preferredToolIds)
        ? contextSnapshot.preferredToolIds.filter(Boolean)
        : [];
    const strategy = contextSnapshot?.toolbeltStrategy && typeof contextSnapshot.toolbeltStrategy === 'object'
        ? contextSnapshot.toolbeltStrategy
        : {};
    const blockedToolIds = Array.isArray(contextSnapshot?.blockedToolIds)
        ? contextSnapshot.blockedToolIds.filter(Boolean)
        : [];
    const selectionMode = String(contextSnapshot?.toolSelectionMode || contextSnapshot?.controlPlanePrefs?.tools?.selectionMode || 'auto').trim();
    const webSearchMode = String(contextSnapshot?.webSearchMode || contextSnapshot?.controlPlanePrefs?.tools?.webSearchMode || 'auto').trim();
    const confirmBeforeUseToolIds = Array.isArray(contextSnapshot?.controlPlanePrefs?.tools?.confirmBeforeUseToolIds)
        ? contextSnapshot.controlPlanePrefs.tools.confirmBeforeUseToolIds.filter(Boolean)
        : [];
    const presetId = String(contextSnapshot?.controlPlanePrefs?.presetId || 'balanced').trim() || 'balanced';

    return {
        pinnedToolIds,
        leasedToolIds,
        preferredToolIds,
        blockedToolIds,
        selectionMode,
        webSearchMode,
        confirmBeforeUseToolIds,
        presetId,
        presetLabel: formatFireflyControlPlanePresetLabel(presetId),
        strategy,
        hasToolbelt: pinnedToolIds.length > 0
            || leasedToolIds.length > 0
            || preferredToolIds.length > 0
            || blockedToolIds.length > 0
            || confirmBeforeUseToolIds.length > 0
            || selectionMode !== 'auto'
            || webSearchMode !== 'auto'
            || presetId !== 'balanced',
    };
}

function extractGovernanceContext(contextSnapshot = {}) {
    const history = Array.isArray(contextSnapshot?.governanceHistory)
        ? contextSnapshot.governanceHistory
            .filter((item) => item && typeof item === 'object')
            .slice(0, 8)
        : [];

    const recentLabels = history
        .map((item) => String(item.label || '').trim())
        .filter(Boolean)
        .slice(0, 3);

    return {
        history,
        recentLabels,
        hasGovernance: history.length > 0,
    };
}

function extractResumeContext(contextSnapshot = {}) {
    const resumeMode = Boolean(contextSnapshot?.resumeMode);
    const parentTaskId = String(contextSnapshot?.parentTaskId || '').trim();
    const taskTitle = String(contextSnapshot?.taskTitle || '').trim();
    const taskGoal = String(contextSnapshot?.taskGoal || '').trim();
    const taskResultSummary = String(contextSnapshot?.taskResultSummary || '').trim();
    const taskMemorySummary = String(contextSnapshot?.taskMemorySummary || '').trim();
    const takeoverNote = String(contextSnapshot?.takeoverNote || '').trim();
    const takeoverAction = String(contextSnapshot?.takeoverAction || '').trim();
    const takeoverStepId = String(contextSnapshot?.takeoverStepId || '').trim();
    const takeoverStepLabel = String(contextSnapshot?.takeoverStepLabel || '').trim();
    const taskSelectedSkills = Array.isArray(contextSnapshot?.taskSelectedSkills)
        ? contextSnapshot.taskSelectedSkills.filter(Boolean)
        : [];

    return {
        resumeMode,
        parentTaskId,
        taskTitle,
        taskGoal,
        taskResultSummary,
        taskMemorySummary,
        takeoverNote,
        takeoverAction,
        takeoverStepId,
        takeoverStepLabel,
        taskSelectedSkills,
        isResume: resumeMode && Boolean(parentTaskId || taskTitle || taskGoal || taskResultSummary || taskMemorySummary || takeoverNote),
    };
}

function buildMemoryReasoning(memoryContext) {
    if (!memoryContext?.hasMemory) {
        return [];
    }

    const titleText = memoryContext.memoryTitles.length
        ? `，重点参考：${memoryContext.memoryTitles.join('、')}`
        : '';

    return [
        `已命中 ${Math.max(memoryContext.memoryIds.length, memoryContext.memoryTitles.length || 1)} 条长期记忆${titleText}。`,
        memoryContext.strategy?.compressedCount
            ? `其中包含 ${memoryContext.strategy.compressedCount} 条跨周期压缩摘要，会优先作为高层上下文。`
            : '',
        '规划时会优先沿用这些历史任务结论、用户偏好和工作上下文，减少重复确认。',
    ].filter(Boolean);
}

function buildToolbeltReasoning(toolbeltContext) {
    if (!toolbeltContext?.hasToolbelt) {
        return [];
    }

    const lines = [];
    if (toolbeltContext.presetLabel) {
        lines.push(`当前前台策略为「${toolbeltContext.presetLabel}」。`);
    }
    if (toolbeltContext.pinnedToolIds.length > 0) {
        lines.push(`当前有 ${toolbeltContext.pinnedToolIds.length} 个固定工具，会优先纳入规划。`);
    }
    if (toolbeltContext.leasedToolIds.length > 0) {
        lines.push(`当前有 ${toolbeltContext.leasedToolIds.length} 个临时启用工具，会在本轮作为高优先候选。`);
    }
    if (toolbeltContext.strategy?.learnedCount) {
        lines.push(`工具箱已积累 ${toolbeltContext.strategy.learnedCount} 条使用结果，会优先参考近期成功工具。`);
    }
    if (toolbeltContext.blockedToolIds.length > 0) {
        lines.push(`当前有 ${toolbeltContext.blockedToolIds.length} 个工具被前台策略屏蔽，本轮不会调度这些工具。`);
    }
    if (toolbeltContext.confirmBeforeUseToolIds.length > 0) {
        lines.push(`当前有 ${toolbeltContext.confirmBeforeUseToolIds.length} 个工具被设置为“使用前确认”，命中后会先暂停等待批准。`);
    }
    if (toolbeltContext.selectionMode === 'pinned_only') {
        lines.push('当前开启“仅固定工具”模式，规划会优先收敛到已固定或临时启用的工具。');
    } else if (toolbeltContext.selectionMode === 'prefer_pinned') {
        lines.push('当前开启“优先固定工具”模式，规划会先尝试已固定工具，再回退到其他候选工具。');
    }
    if (toolbeltContext.webSearchMode === 'manual_only') {
        lines.push('当前联网研究被设置为“手动开启后才允许”，未显式打开时不会自动走搜索链路。');
    }
    return lines;
}

function buildResumeReasoning(resumeContext) {
    if (!resumeContext?.isResume) {
        return [];
    }

    const resumeTarget = resumeContext.taskTitle || resumeContext.taskGoal || '上一轮任务';
    const lines = [`识别到当前是续办任务，目标承接自「${resumeTarget}」。`];

    if (resumeContext.taskResultSummary) {
        lines.push(`会优先基于上一轮结果继续推进，而不是从头重新拆解：${resumeContext.taskResultSummary}`);
    } else {
        lines.push('会优先延续上一轮任务上下文、已选能力和历史线索来继续规划。');
    }

    if (resumeContext.takeoverNote) {
        lines.push(
            resumeContext.takeoverStepLabel
                ? `当前前台接管说明已生效，重点约束步骤「${resumeContext.takeoverStepLabel}」：${resumeContext.takeoverNote}`
                : `当前前台接管说明已生效：${resumeContext.takeoverNote}`
        );
    }

    return lines;
}

function buildGovernanceReasoning(governanceContext) {
    if (!governanceContext?.hasGovernance) {
        return [];
    }

    const recentText = governanceContext.recentLabels.length > 0
        ? `最近前台已调整：${governanceContext.recentLabels.join('、')}。`
        : '最近已有前台治理动作生效。';

    return [
        recentText,
        '规划会把这些前台治理动作视为当前有效约束，优先沿着刚刚确认过的策略继续生成下一轮执行路径。',
    ];
}

function buildPlannerQuestion(question = '', resumeContext = {}) {
    const parts = [String(question || '').trim()];

    if (resumeContext?.isResume) {
        parts.push(resumeContext.taskTitle, resumeContext.taskGoal, resumeContext.taskMemorySummary);
        if (resumeContext.takeoverNote) {
            parts.push(
                resumeContext.takeoverStepLabel
                    ? `前台接管说明（针对步骤：${resumeContext.takeoverStepLabel}）：${resumeContext.takeoverNote}`
                    : `前台接管说明：${resumeContext.takeoverNote}`
            );
        }
    }

    return parts.filter(Boolean).join('\n');
}

function buildPlannerControlPlanePolicy(contextSnapshot = {}, steps = []) {
    const policy = extractControlPlanePolicyContext(contextSnapshot);

    return {
        presetId: policy.presetId,
        presetLabel: policy.presetLabel,
        selectionMode: policy.selectionMode,
        webSearchMode: policy.webSearchMode,
        blockedToolIds: policy.blockedToolIds,
        confirmBeforeUseToolIds: policy.confirmBeforeUseToolIds,
        requiresApprovalToolIds: (Array.isArray(steps) ? steps : [])
            .filter((step) => step.requiresApproval)
            .map((step) => step.toolId || step.skillId)
            .filter(Boolean),
    };
}

function buildPlanPayload(question, tools, reasoning, patch = {}) {
    const seedSteps = patch.steps || tools.map((tool, index) => buildStep(tool, index + 1));
    const governedSeedSteps = applyStepApprovalPolicies(seedSteps, patch.contextSnapshot || {});
    const resolvedIntent = patch.intent || buildIntent(question, tools);
    const candidateTools = Array.isArray(patch.candidateTools) ? patch.candidateTools : tools;
    const reviewed = applyPlannerSelfReview(question, governedSeedSteps, tools, {
        ...(patch.metadata || {}),
        candidateTools,
        contextSnapshot: patch.contextSnapshot || {},
    });
    const steps = reviewed.steps;
    const planKind = patch.planKind || (steps.length > 1 ? 'workflow' : 'single_tool');
    const workerTree = buildWorkerTree(steps, patch.title || buildTaskTitle(question, tools));
    const memoryStrategy = patch.contextSnapshot?.serviceMemoryStrategy && typeof patch.contextSnapshot.serviceMemoryStrategy === 'object'
        ? patch.contextSnapshot.serviceMemoryStrategy
        : {};
    const controlPlanePolicy = buildPlannerControlPlanePolicy(patch.contextSnapshot || {}, steps);

    return {
        handled: true,
        intent: resolvedIntent,
        title: patch.title || buildTaskTitle(question, tools),
        selectedSkills: tools.map((tool) => ({
            id: tool.id,
            name: tool.name,
            capabilityId: tool.capabilityId,
            description: tool.description,
        })),
        steps,
        reasoning,
        planKind,
        metadata: {
            ...(patch.metadata || {}),
            routeLabel: resolvedIntent.label,
            routeId: resolvedIntent.id,
            planKind,
            plannerReview: reviewed.review,
            toolSelectionControl: buildToolSelectionControl(tools, candidateTools, patch.contextSnapshot || {}, {
                ...(patch.metadata || {}),
                finalSteps: steps,
                sourceBundleReplay: patch.metadata?.sourceBundleReplay || null,
            }),
            controlPlanePolicy,
            memoryStrategy,
            workerTree,
            subtasks: Array.isArray(patch.metadata?.subtasks)
                ? patch.metadata.subtasks
                : buildSubtasksFromSteps(steps, planKind),
        },
    };
}

function buildResearchReplayPlan({
    question = '',
    contextSnapshot = {},
    memoryContext = {},
    toolbeltContext = {},
    governanceContext = {},
    resumeContext = {},
    agentConfig = {},
} = {}) {
    const replayContext = extractResearchReplayContext(contextSnapshot);
    if (!replayContext?.bundle) {
        return null;
    }

    const composeTool = resolveFireflyTool('compose.report', contextSnapshot);
    if (!composeTool) {
        return {
            handled: false,
            reason: 'compose_tool_missing_for_bundle_replay',
            intent: { id: 'source_bundle_replay', label: '来源包续写' },
            title: question.slice(0, 24) || '来源包续写',
            selectedSkills: [],
            steps: [],
            reasoning: [
                ...buildResumeReasoning(resumeContext),
                ...buildMemoryReasoning(memoryContext),
                ...buildToolbeltReasoning(toolbeltContext),
                ...buildGovernanceReasoning(governanceContext),
                '当前已经命中来源包复用场景，但通用成文工具尚未注册。',
            ],
        };
    }

    const sourceCount = Array.isArray(replayContext.bundle.sources) ? replayContext.bundle.sources.length : 0;
    const fetchedCount = Array.isArray(replayContext.bundle.fetchedPages) ? replayContext.bundle.fetchedPages.length : 0;
    const citationCount = Array.isArray(replayContext.bundle.citations) ? replayContext.bundle.citations.length : 0;
    const followupMode = replayContext.followupMode || 'reuse_bundle';
    const instructions = followupMode === 'compare_sources'
        ? '请只基于已有 source bundle 做对比式阅读，优先比较各来源说法、时间点、差异和可信度，不要重新联网搜索。'
        : '请严格复用已有 source bundle、正文摘录和引用绑定继续生成回答，不要重新联网搜索。';
    const title = replayContext.sourceLabel
        ? `来源包续写：${replayContext.sourceLabel}`
        : `来源包续写：${question.slice(0, 18) || '当前问题'}`;

    return buildPlanPayload(question, [composeTool], [
        ...buildResumeReasoning(resumeContext),
        ...buildMemoryReasoning(memoryContext),
        ...buildToolbeltReasoning(toolbeltContext),
        ...buildGovernanceReasoning(governanceContext),
        `检测到当前问题携带已有来源包，可直接复用 ${sourceCount} 条来源与 ${fetchedCount} 条正文摘录。`,
        '路由结果：跳过重新搜索，直接在已有 source bundle 上继续整理答案与引用。',
    ], {
        candidateTools: [composeTool],
        contextSnapshot,
        title,
        intent: { id: 'source_bundle_replay', label: '来源包续写' },
        steps: [
            buildStep(composeTool, 1, {
                continueOnError: false,
                subtaskId: 'compose-from-source-bundle',
                subtaskLabel: '基于来源包继续整理',
                workerId: 'worker-source-bundle-compose',
                workerLabel: '来源包成文 Worker',
                workerRole: 'synthesis_worker',
                input: {
                    researchReplayBundle: replayContext.bundle,
                    reportInstructions: instructions,
                },
            }),
        ],
        planKind: 'source_bundle_replay',
        metadata: {
            parentTaskId: resumeContext.parentTaskId,
            isResume: true,
            resumeTarget: resumeContext.taskTitle || resumeContext.taskGoal,
            resumeSummary: resumeContext.taskResultSummary,
            memoryIds: memoryContext.memoryIds,
            memorySummary: memoryContext.summary,
            memoryTitles: memoryContext.memoryTitles,
            governanceHistory: governanceContext.history,
            governanceLabels: governanceContext.recentLabels,
            executionMode: 'sequential',
            decompositionMode: 'source_bundle_replay',
            replayMode: 'source_bundle',
            sourceBundleReplay: {
                sourceLabel: replayContext.sourceLabel,
                sourceToolId: replayContext.sourceToolId,
                followupMode,
                sourceCount,
                fetchedCount,
                citationCount,
            },
            maxPlannerSteps: agentConfig.runtime?.maxPlannerSteps,
            subtasks: [
                {
                    id: 'compose-from-source-bundle',
                    order: 1,
                    label: '基于来源包继续整理',
                    summary: '不重新检索，直接复用已有来源、摘录与引用绑定继续产出答案。',
                    linkedToolIds: [composeTool.id],
                    outputKeys: ['compose.report'],
                },
            ],
        },
    });
}

export function planFireflyTask({
    question,
    contextSnapshot = {},
    capabilityIds = [],
}) {
    const agentConfig = loadAdminAgentRuntimeConfig();
    const memoryContext = extractMemoryContext(contextSnapshot);
    const toolbeltContext = extractToolbeltContext(contextSnapshot);
    const governanceContext = extractGovernanceContext(contextSnapshot);
    const resumeContext = extractResumeContext(contextSnapshot);
    const plannerQuestion = buildPlannerQuestion(question, resumeContext);
    const replayPlan = buildResearchReplayPlan({
        question,
        contextSnapshot,
        memoryContext,
        toolbeltContext,
        governanceContext,
        resumeContext,
        agentConfig,
    });

    if (replayPlan) {
        return replayPlan;
    }

    const matchedTools = prioritizePreferredTools(applyControlPlaneToolPolicies(dedupeTools(matchFireflyTools({
        question: plannerQuestion,
        contextSnapshot,
        capabilityIds,
    })), contextSnapshot), contextSnapshot);
    const plannerCandidates = matchedTools.slice(0, Math.max(1, Number(agentConfig.runtime.maxPlannerSteps || 1)));

    const planningTools = agentConfig.runtime.allowMultiStep
        ? plannerCandidates
        : plannerCandidates.slice(0, 1);

    if (planningTools.length === 0) {
        return {
            handled: false,
                reason: 'no_tool_matched',
            intent: buildIntent(question, []),
            title: buildTaskTitle(question, []),
            selectedSkills: [],
            steps: [],
                reasoning: [
                    ...buildResumeReasoning(resumeContext),
                    ...buildMemoryReasoning(memoryContext),
                    ...buildToolbeltReasoning(toolbeltContext),
                    ...buildGovernanceReasoning(governanceContext),
                    '规划判断：当前问题没有命中校园业务工具或阅读上下文工具。',
                    '路由结果：本轮不进入 Agent Runtime 工具执行链。',
                    '当前问题更适合走通用对话回答，暂未命中特定可执行 skill。',
            ],
        };
    }

    const toolMap = Object.fromEntries(planningTools.map((tool) => [tool.id, tool]));
    const hasMessageTool = Boolean(toolMap['messages.unread_summary']);
    const hasApprovalTool = Boolean(toolMap['approvals.center_overview']);
    const hasDigestTool = Boolean(toolMap['digest.morning_briefing']);
    const hasDirectUrl = extractDirectUrls(question).length > 0;
    const hasDeepResearchTool = Boolean(toolMap['research.search']);
    const hasWebSearchTool = Boolean(toolMap['web.search']);
    const hasUrlInspectTool = Boolean(toolMap['url.inspect']);
    const hasWorkspaceOverviewTool = Boolean(toolMap['workspace.overview']);
    const hasWorkspaceReadTool = Boolean(toolMap['workspace.read']);
    const hasWorkspaceWriteTool = Boolean(toolMap['workspace.write']);
    const hasWorkspacePublishTool = Boolean(toolMap['workspace.publish']);
    const hasWorkspaceManifestTool = Boolean(toolMap['workspace.manifest']);
    const matchedInOrder = planningTools.filter(Boolean);
    const composeReportTool = resolveFireflyTool('compose.report', contextSnapshot);
    const wantsStructuredDelivery = requiresStructuredDelivery(question) && Boolean(composeReportTool);
    const wantsWorkspacePersistence = requiresWorkspacePersistence(question) && hasWorkspaceWriteTool;
    const wantsWorkspacePublish = requiresWorkspacePublish(question) && hasWorkspacePublishTool;

    if (hasWorkspaceManifestTool && !wantsStructuredDelivery) {
        const manifestTool = toolMap['workspace.manifest'];
        return buildPlanPayload(question, [manifestTool], [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：用户在查看当前线程的产物清单。',
            '路由结果：直接生成线程 manifest，不进入其他业务查询。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            title: buildTaskTitle(question, [manifestTool]),
            intent: buildIntent(question, [manifestTool]),
            steps: [
                buildStep(manifestTool, 1, {
                    continueOnError: false,
                    subtaskId: 'workspace-manifest',
                    subtaskLabel: '生成线程清单',
                    workerId: 'worker-workspace-manifest',
                    workerLabel: '清单 Worker',
                    workerRole: 'file_worker',
                }),
            ],
            planKind: 'workspace_manifest',
            metadata: {
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                governanceHistory: governanceContext.history,
                governanceLabels: governanceContext.recentLabels,
                executionMode: 'sequential',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'workspace-manifest',
                        order: 1,
                        label: '生成线程清单',
                        summary: '生成 workspace / outputs 文件清单 manifest。',
                        linkedToolIds: ['workspace.manifest'],
                        outputKeys: ['workspace.manifest'],
                    },
                ],
            },
        });
    }

    if (hasWorkspacePublishTool && !wantsStructuredDelivery) {
        const publishTool = toolMap['workspace.publish'];
        return buildPlanPayload(question, [publishTool], [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：用户希望把当前线程草稿正式发布到 outputs。',
            '路由结果：进入线程产物发布链路，区分草稿区与正式输出区。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            title: buildTaskTitle(question, [publishTool]),
            intent: buildIntent(question, [publishTool]),
            steps: [
                buildStep(publishTool, 1, {
                    continueOnError: false,
                    subtaskId: 'workspace-publish',
                    subtaskLabel: '发布线程产物',
                    workerId: 'worker-workspace-publish',
                    workerLabel: '发布 Worker',
                    workerRole: 'file_worker',
                }),
            ],
            planKind: 'workspace_publish',
            metadata: {
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                governanceHistory: governanceContext.history,
                governanceLabels: governanceContext.recentLabels,
                executionMode: 'sequential',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'workspace-publish',
                        order: 1,
                        label: '发布线程产物',
                        summary: '把 workspace 草稿文件发布到 outputs 形成正式产物。',
                        linkedToolIds: ['workspace.publish'],
                        outputKeys: ['workspace.publish'],
                    },
                ],
            },
        });
    }

    if (hasWorkspaceReadTool) {
        const readTool = toolMap['workspace.read'];
        return buildPlanPayload(question, [readTool], [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：用户在当前线程中查看已有文件内容。',
            '路由结果：直接读取线程 workspace / outputs 文件，不再误走校园业务或联网搜索。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            title: buildTaskTitle(question, [readTool]),
            intent: buildIntent(question, [readTool]),
            steps: [
                buildStep(readTool, 1, {
                    continueOnError: false,
                    subtaskId: 'workspace-read',
                    subtaskLabel: '读取线程文件',
                    workerId: 'worker-workspace-read',
                    workerLabel: '文件读取 Worker',
                    workerRole: 'file_worker',
                }),
            ],
            planKind: 'workspace_read',
            metadata: {
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                governanceHistory: governanceContext.history,
                governanceLabels: governanceContext.recentLabels,
                executionMode: 'sequential',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'workspace-read',
                        order: 1,
                        label: '读取线程文件',
                        summary: '读取当前线程工作区中的目标文件内容。',
                        linkedToolIds: ['workspace.read'],
                        outputKeys: ['workspace.read'],
                    },
                ],
            },
        });
    }

    if (hasWorkspaceOverviewTool) {
        const overviewTool = toolMap['workspace.overview'];
        return buildPlanPayload(question, [overviewTool], [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：用户在查看当前线程工作区概览。',
            '路由结果：直接读取线程 workspace / outputs 摘要，不再误走其他业务工具。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            title: buildTaskTitle(question, [overviewTool]),
            intent: buildIntent(question, [overviewTool]),
            steps: [
                buildStep(overviewTool, 1, {
                    continueOnError: false,
                    subtaskId: 'workspace-overview',
                    subtaskLabel: '查看线程工作区',
                    workerId: 'worker-workspace-overview',
                    workerLabel: '工作区概览 Worker',
                    workerRole: 'file_worker',
                }),
            ],
            planKind: 'workspace_overview',
            metadata: {
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                governanceHistory: governanceContext.history,
                governanceLabels: governanceContext.recentLabels,
                executionMode: 'sequential',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'workspace-overview',
                        order: 1,
                        label: '查看线程工作区',
                        summary: '汇总当前线程 workspace / outputs 目录和文件摘要。',
                        linkedToolIds: ['workspace.overview'],
                        outputKeys: ['workspace.overview'],
                    },
                ],
            },
        });
    }


    if (hasDigestTool && /晨报|晨间|日报|早报/.test(question)) {
        const digestTool = toolMap['digest.morning_briefing'];
        return buildPlanPayload(question, [digestTool], [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：这是校园摘要类问题。',
            '路由结果：优先命中聚合型校园摘要工具，而不是拆成多个独立查询。',
            '识别到当前问题更适合聚合消息与审批，直接生成一条摘要结果。',
            '该任务适合作为单工具聚合执行，而不是拆成多个分散回复。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            steps: [
                buildStep(digestTool, 1, {
                    outputKey: 'campusDigest',
                    subtaskId: 'digest-collect',
                    subtaskLabel: '聚合晨间摘要',
                }),
            ],
            planKind: 'scheduled_like_digest',
            metadata: {
                parentTaskId: resumeContext.parentTaskId,
                isResume: resumeContext.isResume,
                resumeTarget: resumeContext.taskTitle || resumeContext.taskGoal,
                resumeSummary: resumeContext.taskResultSummary,
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                governanceHistory: governanceContext.history,
                governanceLabels: governanceContext.recentLabels,
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'digest-collect',
                        order: 1,
                        label: '聚合晨间摘要',
                        summary: '汇总消息、审批与建议动作，生成一条摘要结论。',
                        linkedToolIds: [digestTool.id],
                        outputKeys: ['campusDigest'],
                    },
                ],
            },
        });
    }

    if (wantsStructuredDelivery && hasMessageTool && hasApprovalTool) {
        const orderedTools = [];

        if (question.indexOf('消息') !== -1 && question.indexOf('审批') !== -1) {
            orderedTools.push(
                question.indexOf('消息') <= question.indexOf('审批')
                    ? toolMap['messages.unread_summary']
                    : toolMap['approvals.center_overview']
            );
        }

        if (!orderedTools.includes(toolMap['messages.unread_summary'])) {
            orderedTools.push(toolMap['messages.unread_summary']);
        }
        if (!orderedTools.includes(toolMap['approvals.center_overview'])) {
            orderedTools.push(toolMap['approvals.center_overview']);
        }

        const tools = [
            ...orderedTools,
            composeReportTool,
            ...(wantsWorkspacePersistence || wantsWorkspacePublish ? [toolMap['workspace.write']] : []),
            ...(wantsWorkspacePublish ? [toolMap['workspace.publish']] : []),
            ...(wantsWorkspacePublish && hasWorkspaceManifestTool ? [toolMap['workspace.manifest']] : []),
        ];

        return buildPlanPayload(question, tools, [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：用户不仅要查校园业务数据，还明确要求整理成简报/文档。',
            '路由结果：先实时拉取消息与审批，再交给通用成文工具统一整理。',
            '如果任一实时查询失败，将直接报错，不再把旧摘要当作新结果继续合成。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            title: buildTaskTitle(question, tools),
            steps: [
                buildStep(toolMap['messages.unread_summary'], 1, {
                    continueOnError: false,
                    parallelGroup: agentConfig.runtime.allowParallelToolCalls ? 'campus-structured-delivery' : '',
                    subtaskId: 'collect-messages',
                    subtaskLabel: '提取未读消息',
                    workerId: 'worker-messages',
                    workerLabel: '消息 Worker',
                    workerRole: 'collector_worker',
                    input: {
                        limit: 20,
                    },
                }),
                buildStep(toolMap['approvals.center_overview'], 2, {
                    continueOnError: false,
                    parallelGroup: agentConfig.runtime.allowParallelToolCalls ? 'campus-structured-delivery' : '',
                    subtaskId: 'collect-approvals',
                    subtaskLabel: '提取审批事项',
                    workerId: 'worker-approvals',
                    workerLabel: '审批 Worker',
                    workerRole: 'collector_worker',
                    input: {
                        limit: 50,
                    },
                }),
                buildStep(composeReportTool, 3, {
                    continueOnError: false,
                    subtaskId: 'compose-report',
                    subtaskLabel: '生成汇总文档',
                    workerId: 'worker-compose-report',
                    workerLabel: '成文 Worker',
                    workerRole: 'synthesis_worker',
                    input: {
                        sourceStepKeys: ['messages.unread_summary', 'approvals.center_overview'],
                        reportInstructions: '请将消息和审批结果整理成一份可直接转发的简报，优先按时间、状态和事项分组，并提炼需要跟进的动作。',
                    },
                }),
                ...((wantsWorkspacePersistence || wantsWorkspacePublish) ? [buildStep(toolMap['workspace.write'], 4, {
                    continueOnError: false,
                    subtaskId: 'workspace-write',
                    subtaskLabel: '写入线程工作区',
                    workerId: 'worker-workspace-write',
                    workerLabel: '工作区写入 Worker',
                    workerRole: 'file_worker',
                    input: {
                        sourceStepKeys: ['compose.report'],
                        fileName: 'campus-brief.md',
                    },
                })] : []),
                ...(wantsWorkspacePublish ? [buildStep(toolMap['workspace.publish'], 5, {
                    continueOnError: false,
                    subtaskId: 'workspace-publish',
                    subtaskLabel: '发布正式产物',
                    workerId: 'worker-workspace-publish',
                    workerLabel: '发布 Worker',
                    workerRole: 'file_worker',
                    input: {
                        relativePath: 'campus-brief.md',
                        outputFileName: 'campus-brief.md',
                    },
                })] : []),
                ...(wantsWorkspacePublish && hasWorkspaceManifestTool ? [buildStep(toolMap['workspace.manifest'], 6, {
                    continueOnError: false,
                    subtaskId: 'workspace-manifest',
                    subtaskLabel: '生成产物清单',
                    workerId: 'worker-workspace-manifest',
                    workerLabel: '清单 Worker',
                    workerRole: 'file_worker',
                })] : []),
            ],
            planKind: 'structured_delivery',
            metadata: {
                parentTaskId: resumeContext.parentTaskId,
                isResume: resumeContext.isResume,
                resumeTarget: resumeContext.taskTitle || resumeContext.taskGoal,
                resumeSummary: resumeContext.taskResultSummary,
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                governanceHistory: governanceContext.history,
                governanceLabels: governanceContext.recentLabels,
                executionMode: agentConfig.runtime.allowParallelToolCalls ? 'parallel_then_synthesize' : 'sequential',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'collect-messages',
                        order: 1,
                        label: '提取未读消息',
                        summary: '实时读取消息列表，作为后续成文素材。',
                        linkedToolIds: ['messages.unread_summary'],
                        outputKeys: ['messages.unread_summary'],
                    },
                    {
                        id: 'collect-approvals',
                        order: 2,
                        label: '提取审批事项',
                        summary: '实时读取审批待办、我发起和审批记录，作为后续成文素材。',
                        linkedToolIds: ['approvals.center_overview'],
                        outputKeys: ['approvals.center_overview'],
                    },
                    {
                        id: 'compose-report',
                        order: 3,
                        label: '生成汇总文档',
                        summary: '基于前两步结果生成用户可直接使用的结构化文档。',
                        linkedToolIds: ['compose.report'],
                        outputKeys: ['compose.report'],
                    },
                    ...((wantsWorkspacePersistence || wantsWorkspacePublish) ? [{
                        id: 'workspace-write',
                        order: 4,
                        label: '写入线程工作区',
                        summary: '把已生成的汇总文档落到线程 workspace，供后续继续加工与恢复。',
                        linkedToolIds: ['workspace.write'],
                        outputKeys: ['workspace.write'],
                    }] : []),
                    ...(wantsWorkspacePublish ? [{
                        id: 'workspace-publish',
                        order: 5,
                        label: '发布正式产物',
                        summary: '把线程 workspace 草稿发布到 outputs，形成正式产物。',
                        linkedToolIds: ['workspace.publish'],
                        outputKeys: ['workspace.publish'],
                    }] : []),
                    ...(wantsWorkspacePublish && hasWorkspaceManifestTool ? [{
                        id: 'workspace-manifest',
                        order: 6,
                        label: '生成产物清单',
                        summary: '为本线程生成 workspace / outputs 清单 manifest。',
                        linkedToolIds: ['workspace.manifest'],
                        outputKeys: ['workspace.manifest'],
                    }] : []),
                ],
            },
        });
    }

    if (wantsStructuredDelivery && hasApprovalTool) {
        const tools = [
            toolMap['approvals.center_overview'],
            composeReportTool,
            ...(wantsWorkspacePersistence || wantsWorkspacePublish ? [toolMap['workspace.write']] : []),
            ...(wantsWorkspacePublish ? [toolMap['workspace.publish']] : []),
            ...(wantsWorkspacePublish && hasWorkspaceManifestTool ? [toolMap['workspace.manifest']] : []),
        ];

        return buildPlanPayload(question, tools, [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：这是审批查询问题，而且用户明确要求整理成简报/文档。',
            '路由结果：先执行实时审批查询，再交给通用成文工具整理，不再把原始审批表格直接返回给用户。',
            '如果审批实时查询失败，本轮将直接提示失败，不再默默回退到旧摘要。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            title: buildTaskTitle(question, tools),
            steps: [
                buildStep(toolMap['approvals.center_overview'], 1, {
                    continueOnError: false,
                    subtaskId: 'collect-approvals',
                    subtaskLabel: '提取审批事项',
                    workerId: 'worker-approvals',
                    workerLabel: '审批 Worker',
                    workerRole: 'collector_worker',
                    input: {
                        limit: 50,
                    },
                }),
                buildStep(composeReportTool, 2, {
                    continueOnError: false,
                    subtaskId: 'compose-report',
                    subtaskLabel: '生成审批文档',
                    workerId: 'worker-compose-report',
                    workerLabel: '成文 Worker',
                    workerRole: 'synthesis_worker',
                    input: {
                        sourceStepKeys: ['approvals.center_overview'],
                        reportInstructions: '请将审批结果整理成一份可直接转发的简报或汇总文档，优先按用户要求的时间范围和审批状态筛选，并提炼关键事项、负责人线索与建议动作。',
                    },
                }),
                ...((wantsWorkspacePersistence || wantsWorkspacePublish) ? [buildStep(toolMap['workspace.write'], 3, {
                    continueOnError: false,
                    subtaskId: 'workspace-write',
                    subtaskLabel: '写入线程工作区',
                    workerId: 'worker-workspace-write',
                    workerLabel: '工作区写入 Worker',
                    workerRole: 'file_worker',
                    input: {
                        sourceStepKeys: ['compose.report'],
                        fileName: 'approval-brief.md',
                    },
                })] : []),
                ...(wantsWorkspacePublish ? [buildStep(toolMap['workspace.publish'], 4, {
                    continueOnError: false,
                    subtaskId: 'workspace-publish',
                    subtaskLabel: '发布正式产物',
                    workerId: 'worker-workspace-publish',
                    workerLabel: '发布 Worker',
                    workerRole: 'file_worker',
                    input: {
                        relativePath: 'approval-brief.md',
                        outputFileName: 'approval-brief.md',
                    },
                })] : []),
                ...(wantsWorkspacePublish && hasWorkspaceManifestTool ? [buildStep(toolMap['workspace.manifest'], 5, {
                    continueOnError: false,
                    subtaskId: 'workspace-manifest',
                    subtaskLabel: '生成产物清单',
                    workerId: 'worker-workspace-manifest',
                    workerLabel: '清单 Worker',
                    workerRole: 'file_worker',
                })] : []),
            ],
            planKind: 'structured_delivery',
            metadata: {
                parentTaskId: resumeContext.parentTaskId,
                isResume: resumeContext.isResume,
                resumeTarget: resumeContext.taskTitle || resumeContext.taskGoal,
                resumeSummary: resumeContext.taskResultSummary,
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                governanceHistory: governanceContext.history,
                governanceLabels: governanceContext.recentLabels,
                executionMode: 'sequential',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'collect-approvals',
                        order: 1,
                        label: '提取审批事项',
                        summary: '实时读取审批待办、我发起与审批记录。',
                        linkedToolIds: ['approvals.center_overview'],
                        outputKeys: ['approvals.center_overview'],
                    },
                    {
                        id: 'compose-report',
                        order: 2,
                        label: '生成审批文档',
                        summary: '基于审批结果生成可直接使用的结构化文档。',
                        linkedToolIds: ['compose.report'],
                        outputKeys: ['compose.report'],
                    },
                    ...((wantsWorkspacePersistence || wantsWorkspacePublish) ? [{
                        id: 'workspace-write',
                        order: 3,
                        label: '写入线程工作区',
                        summary: '把审批文档落到线程 workspace，供后续继续编辑和恢复。',
                        linkedToolIds: ['workspace.write'],
                        outputKeys: ['workspace.write'],
                    }] : []),
                    ...(wantsWorkspacePublish ? [{
                        id: 'workspace-publish',
                        order: 4,
                        label: '发布正式产物',
                        summary: '把审批文档发布到 outputs，形成正式产物。',
                        linkedToolIds: ['workspace.publish'],
                        outputKeys: ['workspace.publish'],
                    }] : []),
                    ...(wantsWorkspacePublish && hasWorkspaceManifestTool ? [{
                        id: 'workspace-manifest',
                        order: 5,
                        label: '生成产物清单',
                        summary: '为本线程生成 workspace / outputs 清单 manifest。',
                        linkedToolIds: ['workspace.manifest'],
                        outputKeys: ['workspace.manifest'],
                    }] : []),
                ],
            },
        });
    }

    if (wantsStructuredDelivery && hasMessageTool) {
        const tools = [
            toolMap['messages.unread_summary'],
            composeReportTool,
            ...(wantsWorkspacePersistence || wantsWorkspacePublish ? [toolMap['workspace.write']] : []),
            ...(wantsWorkspacePublish ? [toolMap['workspace.publish']] : []),
            ...(wantsWorkspacePublish && hasWorkspaceManifestTool ? [toolMap['workspace.manifest']] : []),
        ];

        return buildPlanPayload(question, tools, [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：这是消息查询问题，而且用户明确要求整理成简报/文档。',
            '路由结果：先提取消息，再交给通用成文工具输出最终文档。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            title: buildTaskTitle(question, tools),
            steps: [
                buildStep(toolMap['messages.unread_summary'], 1, {
                    continueOnError: false,
                    subtaskId: 'collect-messages',
                    subtaskLabel: '提取未读消息',
                    workerId: 'worker-messages',
                    workerLabel: '消息 Worker',
                    workerRole: 'collector_worker',
                    input: {
                        limit: 20,
                    },
                }),
                buildStep(composeReportTool, 2, {
                    continueOnError: false,
                    subtaskId: 'compose-report',
                    subtaskLabel: '生成消息文档',
                    workerId: 'worker-compose-report',
                    workerLabel: '成文 Worker',
                    workerRole: 'synthesis_worker',
                    input: {
                        sourceStepKeys: ['messages.unread_summary'],
                        reportInstructions: '请将消息结果整理成一份可直接转发的简报或汇总文档，优先按时间和主题聚类，并提炼需要处理的事项。',
                    },
                }),
                ...((wantsWorkspacePersistence || wantsWorkspacePublish) ? [buildStep(toolMap['workspace.write'], 3, {
                    continueOnError: false,
                    subtaskId: 'workspace-write',
                    subtaskLabel: '写入线程工作区',
                    workerId: 'worker-workspace-write',
                    workerLabel: '工作区写入 Worker',
                    workerRole: 'file_worker',
                    input: {
                        sourceStepKeys: ['compose.report'],
                        fileName: 'message-brief.md',
                    },
                })] : []),
                ...(wantsWorkspacePublish ? [buildStep(toolMap['workspace.publish'], 4, {
                    continueOnError: false,
                    subtaskId: 'workspace-publish',
                    subtaskLabel: '发布正式产物',
                    workerId: 'worker-workspace-publish',
                    workerLabel: '发布 Worker',
                    workerRole: 'file_worker',
                    input: {
                        relativePath: 'message-brief.md',
                        outputFileName: 'message-brief.md',
                    },
                })] : []),
                ...(wantsWorkspacePublish && hasWorkspaceManifestTool ? [buildStep(toolMap['workspace.manifest'], 5, {
                    continueOnError: false,
                    subtaskId: 'workspace-manifest',
                    subtaskLabel: '生成产物清单',
                    workerId: 'worker-workspace-manifest',
                    workerLabel: '清单 Worker',
                    workerRole: 'file_worker',
                })] : []),
            ],
            planKind: 'structured_delivery',
            metadata: {
                parentTaskId: resumeContext.parentTaskId,
                isResume: resumeContext.isResume,
                resumeTarget: resumeContext.taskTitle || resumeContext.taskGoal,
                resumeSummary: resumeContext.taskResultSummary,
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                governanceHistory: governanceContext.history,
                governanceLabels: governanceContext.recentLabels,
                executionMode: 'sequential',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'collect-messages',
                        order: 1,
                        label: '提取未读消息',
                        summary: '实时读取消息结果。',
                        linkedToolIds: ['messages.unread_summary'],
                        outputKeys: ['messages.unread_summary'],
                    },
                    {
                        id: 'compose-report',
                        order: 2,
                        label: '生成消息文档',
                        summary: '基于消息结果生成可直接使用的结构化文档。',
                        linkedToolIds: ['compose.report'],
                        outputKeys: ['compose.report'],
                    },
                    ...((wantsWorkspacePersistence || wantsWorkspacePublish) ? [{
                        id: 'workspace-write',
                        order: 3,
                        label: '写入线程工作区',
                        summary: '把消息文档落到线程 workspace，供后续继续编辑和恢复。',
                        linkedToolIds: ['workspace.write'],
                        outputKeys: ['workspace.write'],
                    }] : []),
                    ...(wantsWorkspacePublish ? [{
                        id: 'workspace-publish',
                        order: 4,
                        label: '发布正式产物',
                        summary: '把消息文档发布到 outputs，形成正式产物。',
                        linkedToolIds: ['workspace.publish'],
                        outputKeys: ['workspace.publish'],
                    }] : []),
                    ...(wantsWorkspacePublish && hasWorkspaceManifestTool ? [{
                        id: 'workspace-manifest',
                        order: 5,
                        label: '生成产物清单',
                        summary: '为本线程生成 workspace / outputs 清单 manifest。',
                        linkedToolIds: ['workspace.manifest'],
                        outputKeys: ['workspace.manifest'],
                    }] : []),
                ],
            },
        });
    }

    if (hasMessageTool && hasApprovalTool) {
        const orderedTools = [];

        if (question.indexOf('消息') !== -1 && question.indexOf('审批') !== -1) {
            orderedTools.push(
                question.indexOf('消息') <= question.indexOf('审批')
                    ? toolMap['messages.unread_summary']
                    : toolMap['approvals.center_overview']
            );
        }

        if (!orderedTools.includes(toolMap['messages.unread_summary'])) {
            orderedTools.push(toolMap['messages.unread_summary']);
        }
        if (!orderedTools.includes(toolMap['approvals.center_overview'])) {
            orderedTools.push(toolMap['approvals.center_overview']);
        }

        return buildPlanPayload(question, orderedTools, [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：这是校园业务联动问题，同时涉及消息与审批。',
            '路由结果：进入校园工具链，而不是联网搜索链。',
            `识别到 ${orderedTools.length} 个可协同执行的工具：${orderedTools.map((tool) => tool.name).join('、')}`,
            agentConfig.runtime.allowParallelToolCalls
                ? '消息与审批互不依赖，会优先并行拉取，再在同一轮结果里统一整理。'
                : '先分别获取消息与审批结果，再在同一轮结果里统一整理，避免用户在多条回复之间来回切换。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            intent: buildIntent(question, orderedTools),
            title: buildTaskTitle(question, orderedTools),
            steps: orderedTools.map((tool, index) => buildStep(tool, index + 1, {
                continueOnError: true,
                parallelGroup: agentConfig.runtime.allowParallelToolCalls ? 'campus-overview' : '',
                subtaskId: tool.id === 'messages.unread_summary' ? 'collect-messages' : 'collect-approvals',
                subtaskLabel: tool.id === 'messages.unread_summary' ? '提取未读消息' : '提取审批待办',
                workerId: tool.id === 'messages.unread_summary' ? 'worker-messages' : 'worker-approvals',
                workerLabel: tool.id === 'messages.unread_summary' ? '消息 Worker' : '审批 Worker',
                workerRole: 'collector_worker',
            })),
            planKind: 'multi_step_overview',
            metadata: {
                parentTaskId: resumeContext.parentTaskId,
                isResume: resumeContext.isResume,
                resumeTarget: resumeContext.taskTitle || resumeContext.taskGoal,
                resumeSummary: resumeContext.taskResultSummary,
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                governanceHistory: governanceContext.history,
                governanceLabels: governanceContext.recentLabels,
                executionMode: agentConfig.runtime.allowParallelToolCalls ? 'parallel' : 'sequential',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'collect-messages',
                        order: 1,
                        label: '提取未读消息',
                        summary: '从校园通知源拉取未读消息列表与原文入口。',
                        linkedToolIds: ['messages.unread_summary'],
                        outputKeys: ['messages.unread_summary'],
                    },
                    {
                        id: 'collect-approvals',
                        order: 2,
                        label: '提取审批待办',
                        summary: '从审批源拉取待我审批、我发起与审批记录。',
                        linkedToolIds: ['approvals.center_overview'],
                        outputKeys: ['approvals.center_overview'],
                    },
                    {
                        id: 'compose-overview',
                        order: 3,
                        label: '合成校园总览',
                        summary: '将消息与审批结果整理成一轮统一回复，并允许保留部分成功结果。',
                        linkedToolIds: orderedTools.map((tool) => tool.id),
                        outputKeys: orderedTools.map((tool) => tool.id),
                    },
                ],
            },
        });
    }

    if (hasDirectUrl && hasUrlInspectTool) {
        const urlInspectTool = resolveFireflyTool('url.inspect', contextSnapshot);
        const pageReadTool = resolveFireflyTool('page.read', contextSnapshot);
        const pageAnswerTool = resolveFireflyTool('page.answer', contextSnapshot);
        const urlTools = [urlInspectTool, pageReadTool, pageAnswerTool].filter(Boolean);

        return buildPlanPayload(question, urlTools, [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：当前问题直接携带 URL，需要先识别链接能力，再决定如何读取页面。',
            '路由结果：进入 URL runtime，而不是普通联网搜索链。',
            '会先识别该链接是内容页还是交互页，再尝试读取正文，最后基于读取结果生成回答。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            title: buildTaskTitle(question, urlTools),
            intent: { id: 'url_reading', label: '链接理解' },
            steps: urlTools.map((tool, index) => buildStep(tool, index + 1, {
                subtaskId: index === 0 ? 'url-inspect' : index === 1 ? 'page-read' : 'page-answer',
                subtaskLabel: index === 0 ? '识别链接能力' : index === 1 ? '读取页面内容' : '生成页面解读',
                continueOnError: index > 0,
                workerId: index === 0 ? 'worker-url-inspect' : index === 1 ? 'worker-page-read' : 'worker-page-answer',
                workerLabel: index === 0 ? '链接识别 Worker' : index === 1 ? '页面读取 Worker' : '页面解读 Worker',
                workerRole: index === 2 ? 'synthesis_worker' : 'research_worker',
            })),
            planKind: 'url_reading',
            metadata: {
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                governanceHistory: governanceContext.history,
                governanceLabels: governanceContext.recentLabels,
                executionMode: 'sequential',
                decompositionMode: 'url_pipeline',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                directUrls: extractDirectUrls(question),
                subtasks: [
                    {
                        id: 'url-inspect',
                        order: 1,
                        label: '识别链接能力',
                        summary: '判断当前链接更像内容页还是交互页，并给出推荐执行通道。',
                        linkedToolIds: ['url.inspect'],
                        outputKeys: ['url.inspect'],
                    },
                    {
                        id: 'page-read',
                        order: 2,
                        label: '读取页面内容',
                        summary: '按链接类型分层读取正文，并返回质量与限制。',
                        linkedToolIds: ['page.read'],
                        outputKeys: ['page.read'],
                    },
                    {
                        id: 'page-answer',
                        order: 3,
                        label: '生成页面解读',
                        summary: '基于页面读取结果生成最终回答，并明确限制。',
                        linkedToolIds: ['page.answer'],
                        outputKeys: ['page.answer'],
                    },
                ],
            },
        });
    }

    if (hasDeepResearchTool) {
        return buildResearchPipelinePlan({
            question,
            contextSnapshot,
            matchedTools,
            memoryContext,
            toolbeltContext,
            governanceContext,
            resumeContext,
            agentConfig,
            intent: { id: 'deep_research', label: '深度研究' },
            title: buildTaskTitle(question, [toolMap['research.search'], resolveFireflyTool('research.read', contextSnapshot), resolveFireflyTool('research.report', contextSnapshot)].filter(Boolean)),
            planKind: 'deep_research',
            decompositionMode: 'deep_research_pipeline',
            routeProfile: {
                id: 'deep_research',
                label: '深度研究',
                summary: '围绕主问题完成检索、正文阅读、综合报告三段式研究编排。',
            },
            reasoning: [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：当前问题已开启深度研究模式，需要拆成检索、阅读、综合三个研究阶段。',
            '路由结果：进入 deep research runtime，而不是普通联网搜索链。',
            '会先扩展多个研究子查询，再抓取关键正文，最后输出结构化研究简报。',
            ],
            stageBlueprints: [
                {
                    id: 'research-search',
                    toolId: 'research.search',
                    label: '扩展研究检索',
                    summary: '围绕主问题拆出多个研究子查询，尽量覆盖官方、背景和最新进展。',
                    workerId: 'worker-research-search',
                    workerLabel: '研究检索 Worker',
                    workerRole: 'research_worker',
                    bundleMode: 'research_search',
                },
                {
                    id: 'research-read',
                    toolId: 'research.read',
                    label: '抓取关键正文',
                    summary: '从候选来源中提取正文摘录，为交叉比对提供材料。',
                    workerId: 'worker-research-read',
                    workerLabel: '研究阅读 Worker',
                    workerRole: 'research_worker',
                    bundleMode: 'research_read',
                },
                {
                    id: 'research-report',
                    toolId: 'research.report',
                    label: '生成研究简报',
                    summary: '输出研究结论、已确认信息、待核实点和下一步建议。',
                    workerId: 'worker-research-report',
                    workerLabel: '研究报告 Worker',
                    workerRole: 'synthesis_worker',
                    bundleMode: 'research_report',
                    traceExpected: true,
                },
            ],
        });
    }

    if (hasWebSearchTool) {
        const webProfile = detectWebResearchProfile(question);
        return buildResearchPipelinePlan({
            question,
            contextSnapshot,
            matchedTools,
            memoryContext,
            toolbeltContext,
            governanceContext,
            resumeContext,
            agentConfig,
            intent: { id: 'web_research', label: '联网查询' },
            title: buildTaskTitle(question, [toolMap['web.search'], resolveFireflyTool('web.fetch', contextSnapshot), resolveFireflyTool('web.answer', contextSnapshot)].filter(Boolean)),
            planKind: 'web_research',
            decompositionMode: `web_${webProfile.id}`,
            routeProfile: {
                id: webProfile.id,
                label: webProfile.label,
                summary: webProfile.summary,
            },
            extraMetadata: {
                webProfileId: webProfile.id,
                webProfileLabel: webProfile.label,
                webProfileSummary: webProfile.summary,
            },
            reasoning: [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：这是通用事实/联网查询问题。',
            '路由结果：进入 web runtime，而不是校园业务工具链。',
            `拆解策略：按「${webProfile.label}」模式处理，${webProfile.summary}`,
            ],
            stageBlueprints: webProfile.steps.map((stepProfile) => ({
                ...stepProfile,
                workerId: stepProfile.toolId === 'web.search'
                    ? 'worker-web-search'
                    : stepProfile.toolId === 'web.fetch'
                        ? 'worker-web-fetch'
                        : 'worker-web-answer',
                workerLabel: stepProfile.toolId === 'web.search'
                    ? '搜索 Worker'
                    : stepProfile.toolId === 'web.fetch'
                        ? '抓取 Worker'
                        : '回答 Worker',
                workerRole: stepProfile.workerRole || (stepProfile.toolId === 'web.answer' ? 'synthesis_worker' : 'research_worker'),
                bundleMode: stepProfile.toolId.replace(/\./g, '_'),
                traceExpected: stepProfile.toolId === 'web.answer',
            })),
        });
    }

    if (hasWorkspaceWriteTool) {
        const writeTool = toolMap['workspace.write'];
        return buildPlanPayload(question, [writeTool], [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
            ...buildToolbeltReasoning(toolbeltContext),
            ...buildGovernanceReasoning(governanceContext),
            '规划判断：用户希望把当前线程内容沉淀成工作区文件。',
            '路由结果：进入线程 workspace 写入链路，形成可恢复、可继续加工的文件。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            title: buildTaskTitle(question, [writeTool]),
            intent: buildIntent(question, [writeTool]),
            steps: [
                buildStep(writeTool, 1, {
                    continueOnError: false,
                    subtaskId: 'workspace-write',
                    subtaskLabel: '写入线程工作区',
                    workerId: 'worker-workspace-write',
                    workerLabel: '工作区写入 Worker',
                    workerRole: 'file_worker',
                    input: {
                        fileName: 'workspace-note.md',
                        content: question,
                    },
                }),
            ],
            planKind: 'workspace_write',
            metadata: {
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                governanceHistory: governanceContext.history,
                governanceLabels: governanceContext.recentLabels,
                executionMode: 'sequential',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'workspace-write',
                        order: 1,
                        label: '写入线程工作区',
                        summary: '把当前生成内容写成文件，沉淀到线程 workspace。',
                        linkedToolIds: ['workspace.write'],
                        outputKeys: ['workspace.write'],
                    },
                ],
            },
        });
    }

    const reasoning = [
        ...buildResumeReasoning(resumeContext),
        ...buildMemoryReasoning(memoryContext),
        ...buildToolbeltReasoning(toolbeltContext),
        ...buildGovernanceReasoning(governanceContext),
        '规划判断：当前问题命中了特定能力工具。',
        '路由结果：优先走 Firefly Agent Runtime 工具执行链。',
        `识别到 ${matchedInOrder.length} 个可直接执行的工具：${matchedInOrder.map((tool) => tool.name).join('、')}`,
        '优先走 Firefly Agent Runtime，而不是直接交给普通聊天回复。',
    ];

    return buildPlanPayload(question, matchedInOrder, reasoning, {
        candidateTools: matchedTools,
        contextSnapshot,
        steps: matchedInOrder.map((tool, index) => buildStep(tool, index + 1, {
            parallelGroup: agentConfig.runtime.allowParallelToolCalls && matchedInOrder.length > 1 ? 'parallel-tools' : '',
            subtaskId: `subtask-${index + 1}`,
            subtaskLabel: tool.name,
            workerId: `worker-${tool.id}-${index + 1}`,
            workerLabel: `${tool.name} Worker`,
            workerRole: 'tool_worker',
        })),
        metadata: {
            parentTaskId: resumeContext.parentTaskId,
            isResume: resumeContext.isResume,
            resumeTarget: resumeContext.taskTitle || resumeContext.taskGoal,
            resumeSummary: resumeContext.taskResultSummary,
            memoryIds: memoryContext.memoryIds,
            memorySummary: memoryContext.summary,
            memoryTitles: memoryContext.memoryTitles,
            executionMode: agentConfig.runtime.allowParallelToolCalls && matchedInOrder.length > 1 ? 'parallel' : 'sequential',
            decompositionMode: matchedInOrder.length > 1 ? 'tool_subtasks' : 'single_task',
            maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
        },
    });
}

export function planFireflyPresetTask({
    presetId,
    question = '',
    preferences = {},
}) {
    if (presetId === MORNING_DIGEST_TASK_ID) {
        const digestTool = resolveFireflyTool('digest.morning_briefing');

        if (!digestTool) {
            return {
                handled: false,
                reason: 'preset_tool_missing',
                intent: { id: 'campus_digest', label: '摘要推送' },
                title: '校园晨间摘要',
                selectedSkills: [],
                steps: [],
                reasoning: ['晨间摘要工具尚未注册。'],
            };
        }

        return buildPlanPayload(
            question || '生成校园晨间摘要',
            [digestTool],
            [
                '该后台任务使用统一 Agent Runtime 执行，不再走独立旁路逻辑。',
                '任务会生成结构化摘要结果，并交给调度层决定是否投递。',
            ],
            {
                title: '校园晨间摘要',
                intent: { id: 'campus_digest', label: '摘要推送' },
                steps: [
                    buildStep(digestTool, 1, {
                        outputKey: 'campusDigest',
                        input: {
                            preferences,
                        },
                    }),
                ],
                planKind: 'scheduled_task',
                metadata: {
                    presetId,
                },
            }
        );
    }

    return {
        handled: false,
        reason: 'preset_not_supported',
        intent: { id: 'general_assist', label: '通用协同' },
        title: question || '萤火虫任务',
        selectedSkills: [],
        steps: [],
        reasoning: ['当前预设任务尚未接入统一 Agent Runtime。'],
    };
}
