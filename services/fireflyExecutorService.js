import {
    appendFireflyTaskLog,
    FIREFLY_TASK_STATUS,
    FIREFLY_TASK_STEP_STATUS,
    FIREFLY_TASK_SUBTASK_STATUS,
    pushFireflyTaskArtifact,
    pushFireflyTaskCheckpoint,
    setFireflyTaskStepResult,
    updateFireflyTaskStatus,
    updateFireflyTaskStep,
    updateFireflyTaskSubtask,
    updateFireflyTaskWorker,
} from '@/services/fireflyTaskService';
import { loadAdminAgentRuntimeConfig } from '@/lib/adminAgentRuntimeStore';
import { resolveFireflyTool } from '@/services/fireflyToolRegistry';

function emitEvent(onEvent, type, payload = {}) {
    onEvent?.({
        type,
        timestamp: new Date().toISOString(),
        ...payload,
    });
}

function buildStepFailureResult(tool, error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';

    return {
        summary: `${tool.name} 暂时不可用：${errorMessage}`,
        markdown: [
            `### ${tool.name}`,
            `暂时无法完成该步骤：${errorMessage}`,
            '我已经保留其他已完成步骤的结果，你可以稍后重试这一项。',
        ].join('\n'),
        links: [],
        warning: true,
        errorMessage,
        data: null,
    };
}

function buildExecutionBatches(plannedSteps = [], agentConfig = {}) {
    const runtimeConfig = agentConfig.runtime || {};
    const maxParallelTools = Math.max(1, Number(runtimeConfig.maxParallelTools || 1));
    const allowParallel = Boolean(runtimeConfig.allowParallelToolCalls) && maxParallelTools > 1;

    if (!allowParallel) {
        return plannedSteps.map((step) => [step]);
    }

    const batches = [];
    let buffer = [];
    let activeGroup = '';

    const flushBuffer = () => {
        if (!buffer.length) {
            return;
        }

        for (let index = 0; index < buffer.length; index += maxParallelTools) {
            batches.push(buffer.slice(index, index + maxParallelTools));
        }

        buffer = [];
        activeGroup = '';
    };

    plannedSteps.forEach((step) => {
        const parallelGroup = String(step?.parallelGroup || '').trim();

        if (!parallelGroup) {
            flushBuffer();
            batches.push([step]);
            return;
        }

        if (activeGroup && activeGroup !== parallelGroup) {
            flushBuffer();
        }

        activeGroup = parallelGroup;
        buffer.push(step);
    });

    flushBuffer();
    return batches;
}

function getTaskStep(task, plannedStep) {
    return task.steps.find((item) => item.toolId === plannedStep.toolId && item.order === plannedStep.order)
        || task.steps.find((item) => item.toolId === plannedStep.toolId)
        || null;
}

function buildSkillMeta(tool, plannedStep) {
    return {
        id: tool?.id || plannedStep?.toolId || '',
        name: tool?.name || plannedStep?.label || plannedStep?.toolId || '未知工具',
    };
}

function summarizeBatch(batchResults = []) {
    const succeeded = batchResults.filter((item) => !item.error && item.result).length;
    const failed = batchResults.filter((item) => item.error).length;
    const labels = batchResults
        .map((item) => item.tool?.name || item.plannedStep?.label || item.plannedStep?.toolId)
        .filter(Boolean);

    if (!labels.length) {
        return '本批次已完成。';
    }

    if (failed > 0) {
        return `${labels.join('、')} 已执行，成功 ${succeeded} 项，失败 ${failed} 项。`;
    }

    return `${labels.join('、')} 已全部执行完成。`;
}

function buildResultDiagnostic(toolId = '', result = {}) {
    const data = result?.data || {};

    if (toolId === 'web.search') {
        const count = Array.isArray(data.results) ? data.results.length : 0;
        return count > 0 ? `已命中 ${count} 条候选来源，可继续抓取正文。` : '未命中可用来源，后续回答将受限。';
    }

    if (toolId === 'url.inspect') {
        const hostname = String(data.target?.hostname || '').trim();
        const siteKind = String(data.target?.siteKind || '').trim();
        return hostname
            ? `已识别链接域名 ${hostname}，类型为 ${siteKind || 'unknown'}。`
            : '已完成链接识别。';
    }

    if (toolId === 'research.search') {
        const count = Array.isArray(data.results) ? data.results.length : 0;
        const queryCount = Array.isArray(data.queries) ? data.queries.length : 0;
        return `已扩展 ${queryCount} 个研究查询，汇总 ${count} 条候选来源。`;
    }

    if (toolId === 'research.read') {
        const pages = Array.isArray(data.pages) ? data.pages.length : 0;
        const failedPages = Array.isArray(data.failedPages) ? data.failedPages.length : 0;
        return `已抓取 ${pages} 个研究正文${failedPages > 0 ? `，${failedPages} 个来源仍受限` : ''}。`;
    }

    if (toolId === 'research.report') {
        const answer = String(data.answer || '').trim();
        return answer ? '已输出结构化研究简报。' : '研究报告已生成，但内容仍较少。';
    }

    if (toolId === 'compose.report') {
        const answer = String(data.answer || '').trim();
        return answer ? '已输出结构化汇总文档。' : '通用成文步骤已完成，但内容仍较少。';
    }

    if (toolId === 'page.read') {
        const title = String(data.page?.title || '').trim();
        const quality = String(data.decision?.quality || '').trim();
        if (data.page?.excerpt) {
            return `已读取页面内容：${title || '当前页面'}，质量 ${quality || 'medium'}。`;
        }
        return `页面已访问，但正文读取受限${title ? `：${title}` : ''}。`;
    }

    if (toolId === 'page.answer') {
        const answer = String(data.answer || '').trim();
        if (answer) {
            return '已基于页面内容生成结构化回答。';
        }
        return '当前没有稳定正文，已返回页面理解受限说明。';
    }

    if (toolId === 'web.fetch') {
        const pages = Array.isArray(data.pages) ? data.pages.length : 0;
        const failedPages = Array.isArray(data.failedPages) ? data.failedPages.length : 0;
        return `已抓取 ${pages} 页正文${failedPages > 0 ? `，${failedPages} 页读取失败` : ''}。`;
    }

    if (toolId === 'web.answer') {
        const groundedBy = data.groundedBy === 'page_excerpt' ? '正文摘录' : '搜索摘要';
        const sourceCount = Array.isArray(data.searchResults) ? data.searchResults.length : 0;
        return `回答已生成，基于 ${groundedBy}，参考 ${sourceCount} 条来源。`;
    }

    if (toolId === 'messages.unread_summary') {
        const count = Number(data.unreadCount || 0);
        return count > 0 ? `整理出 ${count} 条未读消息。` : '当前没有未读消息。';
    }

    if (toolId === 'approvals.center_overview') {
        const pending = Number(data.pendingCount || 0);
        const initiated = Number(data.initiatedCount || 0);
        return `审批概览已返回，待我审批 ${pending} 条，我发起 ${initiated} 条。`;
    }

    if (toolId === 'digest.morning_briefing') {
        const counts = data.counts || {};
        return `晨间摘要已聚合，消息 ${counts.unreadMessages || 0} 条，待审批 ${counts.pendingApprovals || 0} 条。`;
    }

    if (toolId === 'library.reading_context') {
        return `已结合当前阅读上下文生成伴读建议。`;
    }

    return String(result?.summary || '').trim();
}

function getApprovedStepIds(runtimeInput = {}) {
    return Array.isArray(runtimeInput?.approvedStepIds)
        ? runtimeInput.approvedStepIds.filter(Boolean)
        : [];
}

export async function executeFireflyTask(task, {
    plannedSteps = [],
    question,
    contextSnapshot,
    uid,
    fid,
    onEvent,
    runtimeInput = {},
}) {
    const agentConfig = loadAdminAgentRuntimeConfig();
    let nextTask = updateFireflyTaskStatus(task, FIREFLY_TASK_STATUS.RUNNING);
    const results = [];
    const runtimeState = {
        stepResults: {},
    };
    const executionBatches = buildExecutionBatches(plannedSteps, agentConfig);
    const checkpointingEnabled = Boolean(agentConfig.runtime?.checkpointingEnabled);
    const approvedStepIds = new Set(getApprovedStepIds(runtimeInput));
    nextTask = updateFireflyTaskWorker(nextTask, 'supervisor-root', {
        status: 'running',
        startedAt: new Date().toISOString(),
    });

    emitEvent(onEvent, 'task_started', {
        task: nextTask,
    });

    for (let batchIndex = 0; batchIndex < executionBatches.length; batchIndex += 1) {
        const batch = executionBatches[batchIndex];
        const resolvedBatch = batch
            .map((plannedStep) => {
                const step = getTaskStep(nextTask, plannedStep);
                if (!step) {
                    return null;
                }

                const tool = resolveFireflyTool(plannedStep.toolId, contextSnapshot);
                return {
                    plannedStep,
                    step,
                    tool,
                };
            })
            .filter(Boolean);

        if (!resolvedBatch.length) {
            continue;
        }

        const gatedStep = resolvedBatch.find(({ step }) => (
            step.requiresApproval && !approvedStepIds.has(step.id)
        ));

        if (gatedStep) {
            nextTask = updateFireflyTaskStep(nextTask, gatedStep.step.id, {
                status: FIREFLY_TASK_STEP_STATUS.AWAITING_APPROVAL,
                summary: gatedStep.step.approvalReason || '当前步骤等待管理员批准后继续执行。',
            });
            if (gatedStep.step.workerId) {
                nextTask = updateFireflyTaskWorker(nextTask, gatedStep.step.workerId, {
                    status: 'awaiting_approval',
                    resultSummary: gatedStep.step.approvalReason || `${gatedStep.step.label} 等待审批`,
                });
                emitEvent(onEvent, 'worker_waiting_approval', {
                    task: nextTask,
                    worker: nextTask.workerTree?.find((item) => item.id === gatedStep.step.workerId) || null,
                    step: nextTask.steps.find((item) => item.id === gatedStep.step.id) || gatedStep.step,
                    detail: gatedStep.step.approvalReason || '当前步骤等待管理员批准后继续执行。',
                });
            }
            nextTask = updateFireflyTaskStatus(nextTask, FIREFLY_TASK_STATUS.AWAITING_APPROVAL, {
                resultSummary: `${gatedStep.step.label} 等待审批`,
            });
            nextTask = updateFireflyTaskWorker(nextTask, 'supervisor-root', {
                status: 'awaiting_approval',
                resultSummary: `${gatedStep.step.label} 等待审批`,
            });
            nextTask = appendFireflyTaskLog(nextTask, {
                level: 'warning',
                stepId: gatedStep.step.id,
                message: `${gatedStep.step.label} 已暂停，等待管理员审批`,
            });
            emitEvent(onEvent, 'approval_required', {
                task: nextTask,
                step: nextTask.steps.find((item) => item.id === gatedStep.step.id) || gatedStep.step,
                detail: gatedStep.step.approvalReason || '当前步骤等待管理员批准后继续执行。',
            });

            return {
                task: nextTask,
                results,
                runtimeState,
                waitingForApproval: true,
                waitingStepId: gatedStep.step.id,
            };
        }

        const batchSubtaskIds = [
            ...new Set(
                resolvedBatch
                    .map(({ step }) => String(step.subtaskId || '').trim())
                    .filter(Boolean)
            ),
        ];

        batchSubtaskIds.forEach((subtaskId) => {
            nextTask = updateFireflyTaskSubtask(nextTask, subtaskId, {
                status: FIREFLY_TASK_SUBTASK_STATUS.RUNNING,
                startedAt: new Date().toISOString(),
            });
            const subtask = nextTask.subtasks?.find((item) => item.id === subtaskId);
            if (subtask) {
                emitEvent(onEvent, 'subtask_started', {
                    task: nextTask,
                    subtask,
                });
            }
        });

        if (resolvedBatch.length > 1) {
            nextTask = appendFireflyTaskLog(nextTask, {
                message: `并行执行 ${resolvedBatch.map((item) => item.tool?.name || item.plannedStep.label || item.plannedStep.toolId).join('、')}`,
            });
            emitEvent(onEvent, 'parallel_batch_started', {
                task: nextTask,
                batch: resolvedBatch.map((item) => ({
                    toolId: item.plannedStep.toolId,
                    label: item.tool?.name || item.plannedStep.label || item.plannedStep.toolId,
                })),
            });
        }

        resolvedBatch.forEach(({ plannedStep, step, tool }) => {
            const skill = buildSkillMeta(tool, plannedStep);
            if (step.workerId) {
                nextTask = updateFireflyTaskWorker(nextTask, step.workerId, {
                    status: 'running',
                    startedAt: new Date().toISOString(),
                });
                emitEvent(onEvent, 'worker_started', {
                    task: nextTask,
                    worker: nextTask.workerTree?.find((item) => item.id === step.workerId) || null,
                    step,
                    skill,
                });
            }

            nextTask = appendFireflyTaskLog(nextTask, {
                stepId: step.id,
                message: tool ? `开始执行 ${tool.name}` : `开始执行 ${skill.name}`,
            });
            nextTask = updateFireflyTaskStep(nextTask, step.id, {
                status: FIREFLY_TASK_STEP_STATUS.RUNNING,
                startedAt: new Date().toISOString(),
            });
            emitEvent(onEvent, 'step_started', {
                task: nextTask,
                step: nextTask.steps.find((item) => item.id === step.id) || step,
                skill,
            });
        });

        const batchResults = await Promise.all(resolvedBatch.map(async ({ plannedStep, step, tool }) => {
            if (!tool) {
                return {
                    plannedStep,
                    step,
                    tool: null,
                    error: new Error(`Tool not found: ${plannedStep.toolId}`),
                };
            }

            try {
                const result = await tool.execute({
                    question,
                    contextSnapshot,
                    uid,
                    fid,
                    step,
                    runtimeInput: {
                        ...runtimeInput,
                        ...(step.input || {}),
                    },
                    runtimeState,
                });

                return {
                    plannedStep,
                    step,
                    tool,
                    result,
                };
            } catch (error) {
                return {
                    plannedStep,
                    step,
                    tool,
                    error,
                };
            }
        }));

        let fatalPayload = null;
        const subtaskOutcomeMap = new Map();

        batchResults.forEach(({ plannedStep, step, tool, result, error }) => {
            const skill = buildSkillMeta(tool, plannedStep);
            const subtaskId = String(step.subtaskId || '').trim();

            if (!error && result) {
                const diagnosticSummary = buildResultDiagnostic(step.outputKey || step.toolId, result) || result.summary;
                runtimeState.stepResults[step.outputKey || step.toolId] = result;
                results.push({
                    skillId: skill.id,
                    label: skill.name,
                    stepKey: step.outputKey || step.toolId,
                    diagnosticSummary,
                    ...result,
                });

                nextTask = updateFireflyTaskStep(nextTask, step.id, {
                    status: FIREFLY_TASK_STEP_STATUS.COMPLETED,
                    summary: diagnosticSummary,
                    completedAt: new Date().toISOString(),
                });
                nextTask = setFireflyTaskStepResult(nextTask, step.outputKey || step.toolId, result);
                nextTask = appendFireflyTaskLog(nextTask, {
                    stepId: step.id,
                    message: `${skill.name} 执行完成：${diagnosticSummary}`,
                });
                nextTask = pushFireflyTaskArtifact(nextTask, {
                    type: 'markdown',
                    label: skill.name,
                    content: result.markdown,
                    href: result.links?.[0]?.href || '',
                });
                if (step.workerId) {
                    nextTask = updateFireflyTaskWorker(nextTask, step.workerId, {
                        status: 'completed',
                        completedAt: new Date().toISOString(),
                        resultSummary: diagnosticSummary,
                    });
                    emitEvent(onEvent, 'worker_completed', {
                        task: nextTask,
                        worker: nextTask.workerTree?.find((item) => item.id === step.workerId) || null,
                        step: nextTask.steps.find((item) => item.id === step.id) || step,
                        skill,
                    });
                }
                emitEvent(onEvent, 'step_completed', {
                    task: nextTask,
                    step: nextTask.steps.find((item) => item.id === step.id) || step,
                    skill,
                    result: {
                        skillId: skill.id,
                        label: skill.name,
                        diagnosticSummary,
                        ...result,
                    },
                });
                if (subtaskId) {
                    subtaskOutcomeMap.set(subtaskId, {
                        status: FIREFLY_TASK_SUBTASK_STATUS.COMPLETED,
                        resultSummary: diagnosticSummary || `${skill.name} 已完成`,
                    });
                }
                return;
            }

            const errorMessage = error instanceof Error ? error.message : '未知错误';
            nextTask = updateFireflyTaskStep(nextTask, step.id, {
                status: FIREFLY_TASK_STEP_STATUS.FAILED,
                summary: errorMessage,
                completedAt: new Date().toISOString(),
            });
            nextTask = appendFireflyTaskLog(nextTask, {
                level: 'error',
                stepId: step.id,
                message: `${skill.name} 执行失败：${errorMessage}`,
            });
            if (step.workerId) {
                nextTask = updateFireflyTaskWorker(nextTask, step.workerId, {
                    status: 'failed',
                    completedAt: new Date().toISOString(),
                    resultSummary: errorMessage,
                });
                emitEvent(onEvent, 'worker_failed', {
                    task: nextTask,
                    worker: nextTask.workerTree?.find((item) => item.id === step.workerId) || null,
                    step: nextTask.steps.find((item) => item.id === step.id) || step,
                    skill,
                    error: errorMessage,
                });
            }
            nextTask = updateFireflyTaskStatus(nextTask, FIREFLY_TASK_STATUS.FAILED, {
                resultSummary: `${skill.name} 执行失败`,
            });
            emitEvent(onEvent, 'step_failed', {
                task: nextTask,
                step: nextTask.steps.find((item) => item.id === step.id) || step,
                skill,
                error: errorMessage,
            });
            if (subtaskId) {
                subtaskOutcomeMap.set(subtaskId, {
                    status: FIREFLY_TASK_SUBTASK_STATUS.FAILED,
                    resultSummary: errorMessage,
                });
            }

            if (step.continueOnError && agentConfig.runtime.allowPartialSuccess) {
                const fallbackResult = buildStepFailureResult(tool || skill, error);
                runtimeState.stepResults[step.outputKey || step.toolId] = fallbackResult;
                results.push({
                    skillId: skill.id,
                    label: skill.name,
                    stepKey: step.outputKey || step.toolId,
                    ...fallbackResult,
                });
                nextTask = setFireflyTaskStepResult(nextTask, step.outputKey || step.toolId, fallbackResult);
                nextTask = appendFireflyTaskLog(nextTask, {
                    level: 'warning',
                    stepId: step.id,
                    message: `${skill.name} 失败后继续后续步骤`,
                });
                if (subtaskId) {
                    subtaskOutcomeMap.set(subtaskId, {
                        status: FIREFLY_TASK_SUBTASK_STATUS.COMPLETED,
                        resultSummary: fallbackResult.summary,
                    });
                }
                return;
            }

            const fatalTask = updateFireflyTaskWorker(nextTask, 'supervisor-root', {
                status: 'failed',
                completedAt: new Date().toISOString(),
                resultSummary: `${skill.name} 执行失败`,
            });
            nextTask = fatalTask;
            fatalPayload = {
                task: fatalTask,
                error: error instanceof Error ? error : new Error(errorMessage),
            };
        });

        batchSubtaskIds.forEach((subtaskId) => {
            const outcome = subtaskOutcomeMap.get(subtaskId);
            nextTask = updateFireflyTaskSubtask(nextTask, subtaskId, {
                status: outcome?.status || FIREFLY_TASK_SUBTASK_STATUS.COMPLETED,
                completedAt: new Date().toISOString(),
                resultSummary: outcome?.resultSummary || '',
            });
            const subtask = nextTask.subtasks?.find((item) => item.id === subtaskId);
            if (subtask) {
                emitEvent(onEvent, outcome?.status === FIREFLY_TASK_SUBTASK_STATUS.FAILED ? 'subtask_failed' : 'subtask_completed', {
                    task: nextTask,
                    subtask,
                });
            }
        });

        if (checkpointingEnabled) {
            nextTask = pushFireflyTaskCheckpoint(nextTask, {
                label: `阶段 ${batchIndex + 1}/${executionBatches.length}`,
                summary: summarizeBatch(batchResults),
                status: fatalPayload ? 'failed' : 'completed',
                batchIndex: batchIndex + 1,
                stepIds: resolvedBatch.map(({ step }) => step.id),
                subtaskIds: batchSubtaskIds,
            });
            emitEvent(onEvent, 'checkpoint_saved', {
                task: nextTask,
                checkpoint: nextTask.checkpoints?.[nextTask.checkpoints.length - 1] || null,
            });
        }

        if (resolvedBatch.length > 1) {
            emitEvent(onEvent, 'parallel_batch_completed', {
                task: nextTask,
                batch: resolvedBatch.map((item) => ({
                    toolId: item.plannedStep.toolId,
                    label: item.tool?.name || item.plannedStep.label || item.plannedStep.toolId,
                })),
            });
        }

        if (fatalPayload) {
            throw fatalPayload;
        }
    }

    const failedSteps = nextTask.steps.filter((step) => step.status === FIREFLY_TASK_STEP_STATUS.FAILED).length;
    const successfulResults = results.filter((item) => !item.warning);
    const finalStatus = failedSteps > 0 && successfulResults.length === 0
        ? FIREFLY_TASK_STATUS.FAILED
        : FIREFLY_TASK_STATUS.COMPLETED;
    const resultSummary = failedSteps > 0
        ? `${successfulResults.length} 个步骤成功，${failedSteps} 个步骤失败`
        : results.map((item) => item.summary).join('；');

    nextTask = updateFireflyTaskStatus(nextTask, finalStatus, {
        resultSummary,
    });
    nextTask = updateFireflyTaskWorker(nextTask, 'supervisor-root', {
        status: finalStatus === FIREFLY_TASK_STATUS.COMPLETED ? 'completed' : 'failed',
        completedAt: new Date().toISOString(),
        resultSummary,
    });
    nextTask = appendFireflyTaskLog(nextTask, {
        message: failedSteps > 0
            ? `任务已完成，但存在 ${failedSteps} 个失败步骤`
            : `任务已完成，共执行 ${results.length} 个 skill`,
    });

    return {
        task: nextTask,
        results,
        runtimeState,
    };
}
