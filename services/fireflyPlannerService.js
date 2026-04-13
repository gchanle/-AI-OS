import { MORNING_DIGEST_TASK_ID } from '@/lib/scheduledTaskCatalog';
import { loadAdminAgentRuntimeConfig } from '@/lib/adminAgentRuntimeStore';
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
    if (!contextSnapshot?.resumeMode) {
        return tools;
    }

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

function buildIntent(question = '', selectedTools = []) {
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

function applyPlannerSelfReview(question = '', steps = [], selectedTools = [], metadata = {}) {
    const revisions = [];
    let reviewedSteps = Array.isArray(steps) ? [...steps] : [];
    const seenToolIds = new Set();
    const candidateTools = Array.isArray(metadata.candidateTools) ? metadata.candidateTools : selectedTools;

    reviewedSteps = reviewedSteps.filter((step) => {
        const toolId = String(step.toolId || step.skillId || '').trim();
        if (!toolId) {
            return true;
        }

        if (seenToolIds.has(toolId) && toolId !== 'web.fetch') {
            revisions.push(`移除了重复的工具步骤：${toolId}`);
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
            revisions.push('为通用事实问题自动补入联网回答步骤，避免只停在搜索结果。');
        }
    }

    const toolSelection = selectedTools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        capabilityId: tool.capabilityId,
    }));
    const excludedTools = buildExcludedToolDecisions(candidateTools, selectedTools, metadata);

    const review = {
        verdict: revisions.length > 0 ? 'revised' : 'accepted',
        revisions,
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
    const excludedTools = buildExcludedToolDecisions(candidateTools, tools, metadata);

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
        replayMode: String(metadata?.replayMode || '').trim(),
        requiresApprovalToolIds: tools.filter((tool) => tool.id === 'web.fetch').map((tool) => tool.id),
        selectionStrategy: Array.isArray(metadata?.candidateTools) && metadata.candidateTools.length > tools.length
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

function extractResumeContext(contextSnapshot = {}) {
    const resumeMode = Boolean(contextSnapshot?.resumeMode);
    const parentTaskId = String(contextSnapshot?.parentTaskId || '').trim();
    const taskTitle = String(contextSnapshot?.taskTitle || '').trim();
    const taskGoal = String(contextSnapshot?.taskGoal || '').trim();
    const taskResultSummary = String(contextSnapshot?.taskResultSummary || '').trim();
    const taskMemorySummary = String(contextSnapshot?.taskMemorySummary || '').trim();
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
        taskSelectedSkills,
        isResume: resumeMode && Boolean(parentTaskId || taskTitle || taskGoal || taskResultSummary || taskMemorySummary),
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

    return lines;
}

function buildPlannerQuestion(question = '', resumeContext = {}) {
    const parts = [String(question || '').trim()];

    if (resumeContext?.isResume) {
        parts.push(resumeContext.taskTitle, resumeContext.taskGoal, resumeContext.taskMemorySummary);
    }

    return parts.filter(Boolean).join('\n');
}

function buildPlanPayload(question, tools, reasoning, patch = {}) {
    const seedSteps = patch.steps || tools.map((tool, index) => buildStep(tool, index + 1));
    const resolvedIntent = patch.intent || buildIntent(question, tools);
    const candidateTools = Array.isArray(patch.candidateTools) ? patch.candidateTools : tools;
    const reviewed = applyPlannerSelfReview(question, seedSteps, tools, {
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
            toolSelectionControl: buildToolSelectionControl(tools, candidateTools, patch.contextSnapshot || {}, patch.metadata || {}),
            memoryStrategy,
            workerTree,
            subtasks: Array.isArray(patch.metadata?.subtasks)
                ? patch.metadata.subtasks
                : buildSubtasksFromSteps(steps, planKind),
        },
    };
}

export function planFireflyTask({
    question,
    contextSnapshot = {},
    capabilityIds = [],
}) {
    const agentConfig = loadAdminAgentRuntimeConfig();
    const memoryContext = extractMemoryContext(contextSnapshot);
    const resumeContext = extractResumeContext(contextSnapshot);
    const plannerQuestion = buildPlannerQuestion(question, resumeContext);
    const matchedTools = prioritizePreferredTools(dedupeTools(matchFireflyTools({
        question: plannerQuestion,
        contextSnapshot,
        capabilityIds,
    })), contextSnapshot);
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
    const matchedInOrder = planningTools.filter(Boolean);
    const composeReportTool = resolveFireflyTool('compose.report', contextSnapshot);
    const wantsStructuredDelivery = requiresStructuredDelivery(question) && Boolean(composeReportTool);

    if (hasDigestTool && /晨报|晨间|日报|早报/.test(question)) {
        const digestTool = toolMap['digest.morning_briefing'];
        return buildPlanPayload(question, [digestTool], [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
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

        const tools = [...orderedTools, composeReportTool];

        return buildPlanPayload(question, tools, [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
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
                ],
            },
        });
    }

    if (wantsStructuredDelivery && hasApprovalTool) {
        const tools = [toolMap['approvals.center_overview'], composeReportTool];

        return buildPlanPayload(question, tools, [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
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
                ],
            },
        });
    }

    if (wantsStructuredDelivery && hasMessageTool) {
        const tools = [toolMap['messages.unread_summary'], composeReportTool];

        return buildPlanPayload(question, tools, [
            ...buildResumeReasoning(resumeContext),
            ...buildMemoryReasoning(memoryContext),
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
            ...buildMemoryReasoning(memoryContext),
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
        const researchSearchTool = resolveFireflyTool('research.search', contextSnapshot);
        const researchReadTool = resolveFireflyTool('research.read', contextSnapshot);
        const researchReportTool = resolveFireflyTool('research.report', contextSnapshot);
        const researchTools = [researchSearchTool, researchReadTool, researchReportTool].filter(Boolean);

        return buildPlanPayload(question, researchTools, [
            ...buildMemoryReasoning(memoryContext),
            '规划判断：当前问题已开启深度研究模式，需要拆成检索、阅读、综合三个研究阶段。',
            '路由结果：进入 deep research runtime，而不是普通联网搜索链。',
            '会先扩展多个研究子查询，再抓取关键正文，最后输出结构化研究简报。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            title: buildTaskTitle(question, researchTools),
            intent: { id: 'deep_research', label: '深度研究' },
            steps: researchTools.map((tool, index) => buildStep(tool, index + 1, {
                subtaskId: index === 0 ? 'research-search' : index === 1 ? 'research-read' : 'research-report',
                subtaskLabel: index === 0 ? '扩展研究检索' : index === 1 ? '抓取关键正文' : '生成研究简报',
                continueOnError: index > 0,
                workerId: index === 0 ? 'worker-research-search' : index === 1 ? 'worker-research-read' : 'worker-research-report',
                workerLabel: index === 0 ? '研究检索 Worker' : index === 1 ? '研究阅读 Worker' : '研究报告 Worker',
                workerRole: index === 2 ? 'synthesis_worker' : 'research_worker',
            })),
            planKind: 'deep_research',
            metadata: {
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                executionMode: 'sequential',
                decompositionMode: 'deep_research_pipeline',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'research-search',
                        order: 1,
                        label: '扩展研究检索',
                        summary: '围绕主问题拆出多个研究子查询，尽量覆盖官方、背景和最新进展。',
                        linkedToolIds: ['research.search'],
                        outputKeys: ['research.search'],
                    },
                    {
                        id: 'research-read',
                        order: 2,
                        label: '抓取关键正文',
                        summary: '从候选来源中提取正文摘录，为交叉比对提供材料。',
                        linkedToolIds: ['research.read'],
                        outputKeys: ['research.read'],
                    },
                    {
                        id: 'research-report',
                        order: 3,
                        label: '生成研究简报',
                        summary: '输出研究结论、已确认信息、待核实点和下一步建议。',
                        linkedToolIds: ['research.report'],
                        outputKeys: ['research.report'],
                    },
                ],
            },
        });
    }

    if (hasWebSearchTool) {
        const webSearchTool = resolveFireflyTool('web.search', contextSnapshot);
        const webFetchTool = resolveFireflyTool('web.fetch', contextSnapshot);
        const webAnswerTool = resolveFireflyTool('web.answer', contextSnapshot);
        const webSteps = [webSearchTool, webFetchTool, webAnswerTool].filter(Boolean);

        return buildPlanPayload(question, webSteps, [
            ...buildMemoryReasoning(memoryContext),
            '规划判断：这是通用事实/联网查询问题。',
            '路由结果：进入 web runtime，而不是校园业务工具链。',
            '识别到当前是通用事实/联网查询问题，不适合误走校园消息或审批工具。',
            '会先搜索来源，再读取网页摘录，最后基于来源生成结构化回答。',
        ], {
            candidateTools: matchedTools,
            contextSnapshot,
            title: buildTaskTitle(question, webSteps),
            intent: { id: 'web_research', label: '联网查询' },
            steps: webSteps.map((tool, index) => buildStep(tool, index + 1, {
                subtaskId: index === 0 ? 'web-search' : index === 1 ? 'web-fetch' : 'web-answer',
                subtaskLabel: index === 0 ? '搜索候选来源' : index === 1 ? '读取网页正文' : '生成结构化回答',
                continueOnError: index > 0,
                requiresApproval: tool.id === 'web.fetch',
                approvalLabel: tool.id === 'web.fetch' ? '批准抓取网页正文' : '',
                approvalReason: tool.id === 'web.fetch' ? '该步骤将访问外部网页正文，进入更深一层的联网执行。' : '',
                workerId: index === 0 ? 'worker-web-search' : index === 1 ? 'worker-web-fetch' : 'worker-web-answer',
                workerLabel: index === 0 ? '搜索 Worker' : index === 1 ? '抓取 Worker' : '回答 Worker',
                workerRole: index === 2 ? 'synthesis_worker' : 'research_worker',
            })),
            planKind: 'web_research',
            metadata: {
                memoryIds: memoryContext.memoryIds,
                memorySummary: memoryContext.summary,
                memoryTitles: memoryContext.memoryTitles,
                executionMode: 'sequential',
                decompositionMode: 'web_pipeline',
                maxPlannerSteps: agentConfig.runtime.maxPlannerSteps,
                subtasks: [
                    {
                        id: 'web-search',
                        order: 1,
                        label: '搜索候选来源',
                        summary: '先找出可供引用的网页来源。',
                        linkedToolIds: ['web.search'],
                        outputKeys: ['web.search'],
                    },
                    {
                        id: 'web-fetch',
                        order: 2,
                        label: '读取网页正文',
                        summary: '抓取前几个来源的正文摘要，避免只看搜索标题。',
                        linkedToolIds: ['web.fetch'],
                        outputKeys: ['web.fetch'],
                    },
                    {
                        id: 'web-answer',
                        order: 3,
                        label: '生成结构化回答',
                        summary: '基于搜索结果和网页摘录生成最终回答。',
                        linkedToolIds: ['web.answer'],
                        outputKeys: ['web.answer'],
                    },
                ],
            },
        });
    }

    const reasoning = [
        ...buildResumeReasoning(resumeContext),
        ...buildMemoryReasoning(memoryContext),
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
