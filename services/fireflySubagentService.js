import crypto from 'crypto';
import {
    createFireflySubagentRun,
    patchFireflySubagentRun,
} from '@/lib/fireflySubagentStore';

function now() {
    return new Date().toISOString();
}

function buildTraceId() {
    return `trace-${crypto.randomUUID().slice(0, 8)}`;
}

function emitEvent(onEvent, type, payload = {}) {
    onEvent?.({
        type,
        timestamp: now(),
        ...payload,
    });
}

function buildSubagentLabel({ plannedStep = {}, tool = null } = {}) {
    return String(
        plannedStep.workerLabel
        || plannedStep.subtaskLabel
        || tool?.name
        || plannedStep.label
        || plannedStep.toolId
        || 'Firefly Subagent'
    ).trim();
}

export async function executeFireflySubagentBatch(items = [], options = {}) {
    const {
        threadKey = 'default',
        parentTaskId = '',
        parentRunId = '',
        question = '',
        contextSnapshot = {},
        uid = '',
        fid = '',
        runtimeInput = {},
        runtimeState = {},
        onEvent,
    } = options;

    const preparedItems = await Promise.all(items.map(async ({ plannedStep, step, tool }) => {
        const traceId = buildTraceId();
        const run = await createFireflySubagentRun({
            traceId,
            threadKey,
            parentTaskId,
            parentRunId,
            stepId: step.id,
            subtaskId: step.subtaskId || '',
            workerId: step.workerId || '',
            toolId: plannedStep.toolId || tool?.id || '',
            label: buildSubagentLabel({ plannedStep, tool }),
            status: 'pending',
            summary: tool?.name ? `等待执行 ${tool.name}` : '等待执行',
        });

        return {
            plannedStep,
            step,
            tool,
            subagentRun: run,
        };
    }));

    return Promise.all(preparedItems.map(async ({ plannedStep, step, tool, subagentRun }) => {
        const run = await patchFireflySubagentRun(subagentRun.id, {
            status: 'running',
            summary: tool?.name ? `开始执行 ${tool.name}` : '开始执行',
        });

        emitEvent(onEvent, 'subagent_started', {
            subagent: run,
            plannedStep,
            step,
        });

        if (!tool) {
            const missingError = new Error(`Tool not found: ${plannedStep.toolId}`);
            const failedRun = await patchFireflySubagentRun(run.id, {
                status: 'failed',
                error: missingError.message,
                summary: missingError.message,
                completedAt: now(),
            });
            emitEvent(onEvent, 'subagent_failed', {
                subagent: failedRun,
                plannedStep,
                step,
                error: missingError.message,
            });

            return {
                plannedStep,
                step,
                tool: null,
                error: missingError,
                subagentRun: failedRun,
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

            const completedRun = await patchFireflySubagentRun(run.id, {
                status: 'completed',
                summary: String(result?.summary || `${tool.name} 已完成`).trim(),
                completedAt: now(),
            });

            emitEvent(onEvent, 'subagent_completed', {
                subagent: completedRun,
                plannedStep,
                step,
                result,
            });

            return {
                plannedStep,
                step,
                tool,
                result,
                subagentRun: completedRun,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            const failedRun = await patchFireflySubagentRun(run.id, {
                status: 'failed',
                error: errorMessage,
                summary: errorMessage,
                completedAt: now(),
            });

            emitEvent(onEvent, 'subagent_failed', {
                subagent: failedRun,
                plannedStep,
                step,
                error: errorMessage,
            });

            return {
                plannedStep,
                step,
                tool,
                error,
                subagentRun: failedRun,
            };
        }
    }));
}
