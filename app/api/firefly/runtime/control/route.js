import { NextResponse } from 'next/server';
import {
    appendFireflyRuntimeEvent,
    listFireflyRuntimeState,
    patchFireflyRuntimeRun,
    patchFireflyRuntimeTask,
    syncFireflyRuntimeSession,
} from '@/lib/fireflyRuntimeStore';
import {
    replayFireflyTask,
    resumeFireflyTask,
} from '@/services/fireflyAgentService';

function buildControlActionLabel(action = '') {
    if (action === 'retry_full') return '管理员已触发整轮重试';
    if (action === 'retry_failed') return '管理员已触发失败步骤重试';
    if (action === 'retry_step') return '管理员已触发单步骤重跑';
    if (action === 'resume_plan') return '管理员已触发恢复续跑';
    return '管理员已触发运行控制';
}

function buildControlActionDetail(action = '', stepLabel = '', controlNote = '') {
    if (controlNote) {
        return controlNote;
    }

    if (action === 'retry_step' && stepLabel) {
        return `准备重跑步骤「${stepLabel}」`;
    }

    if (action === 'retry_failed') {
        return '准备仅重试上一轮失败步骤。';
    }

    if (action === 'retry_full') {
        return '准备对当前任务发起整轮重试。';
    }

    if (action === 'resume_plan') {
        return '准备从当前任务的上下文继续续跑。';
    }

    return '通过运行控制面触发';
}

export async function POST(request) {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const taskId = String(body.taskId || '').trim();
    const stepId = String(body.stepId || '').trim();

    if (!taskId || !action) {
        return NextResponse.json({
            ok: false,
            error: 'Missing taskId or action.',
        }, { status: 400 });
    }

    try {
        const runtime = await listFireflyRuntimeState();
        const task = (runtime.tasks || []).find((item) => item.id === taskId) || null;

        if (!task) {
            return NextResponse.json({
                ok: false,
                error: 'Task not found.',
            }, { status: 404 });
        }

        const relatedRun = (runtime.runs || []).find((item) => item.id === task.runId) || null;
        const uid = String(body.uid || relatedRun?.uid || request.headers.get('x-campus-user-uid') || '').trim();
        const fid = String(body.fid || relatedRun?.fid || request.headers.get('x-campus-fid') || '').trim();
        const controlNote = String(body.note || '').trim();

        const blockReason = task.controlState === 'rejected'
            ? '当前任务已被管理员拒绝继续，请先重新审批。'
            : task.controlState === 'paused'
                ? '当前任务已被管理员暂停，请先审批通过后再继续。'
                : '';

        let result = null;

        if (['retry_full', 'retry_failed', 'retry_step', 'resume_plan'].includes(action) && blockReason) {
            return NextResponse.json({
                ok: false,
                error: blockReason,
            }, { status: 409 });
        }

        if (action === 'approve_continue' || action === 'pause_task' || action === 'reject_continue') {
            const nextControlState = action === 'approve_continue'
                ? 'approved'
                : action === 'pause_task'
                    ? 'paused'
                    : 'rejected';
            const nextTask = await patchFireflyRuntimeTask(task.id, {
                controlState: nextControlState,
                controlUpdatedAt: new Date().toISOString(),
                controlNote,
            });

            if (task.runId) {
                await patchFireflyRuntimeRun(task.runId, {
                    phase: action === 'approve_continue'
                        ? 'approved'
                        : action === 'pause_task'
                            ? 'paused'
                            : 'rejected',
                });
            }

            await syncFireflyRuntimeSession({
                threadKey: task.threadKey,
                title: task.title,
                status: action === 'pause_task' ? 'paused' : task.status,
                capabilityIds: task.capabilityIds || [],
                lastTaskId: task.id,
                lastRunId: task.runId || '',
                workspaceId: task.workspaceSnapshot?.path || task.workspaceSnapshot?.moduleLabel || '',
            });

            await appendFireflyRuntimeEvent(task.runId || '', {
                type: `control_${nextControlState}`,
                label: action === 'approve_continue'
                    ? '管理员已批准继续'
                    : action === 'pause_task'
                        ? '管理员已暂停任务'
                        : '管理员已拒绝继续',
                detail: controlNote || '通过运行控制面触发',
                taskId: task.id,
                threadKey: task.threadKey,
                level: action === 'reject_continue' ? 'warning' : 'info',
                metadata: {
                    controlState: nextControlState,
                    controlNote,
                },
            });

            return NextResponse.json({
                ok: true,
                action,
                task: nextTask,
            });
        } else if (action === 'approve_step') {
            if (!stepId) {
                return NextResponse.json({
                    ok: false,
                    error: 'Missing stepId for approve_step.',
                }, { status: 400 });
            }

            const approvedStep = Array.isArray(task.steps) ? task.steps.find((item) => item.id === stepId) : null;
            if (!approvedStep) {
                return NextResponse.json({
                    ok: false,
                    error: 'Step not found.',
                }, { status: 404 });
            }

            await patchFireflyRuntimeTask(task.id, {
                controlState: 'approved',
                controlUpdatedAt: new Date().toISOString(),
                controlNote: controlNote || approvedStep.approvalReason || approvedStep.label,
            });
            await appendFireflyRuntimeEvent(task.runId || '', {
                type: 'control_approve_step',
                label: '管理员已批准步骤继续',
                detail: controlNote || approvedStep.approvalReason || approvedStep.label,
                taskId: task.id,
                threadKey: task.threadKey,
                stepId,
                metadata: {
                    controlState: 'approved',
                    controlNote: controlNote || approvedStep.approvalReason || '',
                    stepLabel: approvedStep.label,
                },
            });

            result = await replayFireflyTask({
                task,
                mode: 'from_step',
                stepId,
                approvedStepIds: [stepId],
                uid,
                fid,
                controlNote,
                controlAction: action,
            });

            return NextResponse.json({
                ok: true,
                action,
                result,
            });
        }

        const controlStep = stepId && Array.isArray(task.steps)
            ? task.steps.find((item) => item.id === stepId) || null
            : null;

        if (action === 'retry_step') {
            if (!stepId) {
                return NextResponse.json({
                    ok: false,
                    error: 'Missing stepId for retry_step.',
                }, { status: 400 });
            }

            if (!controlStep) {
                return NextResponse.json({
                    ok: false,
                    error: 'Step not found.',
                }, { status: 404 });
            }
        }

        if (controlNote) {
            await patchFireflyRuntimeTask(task.id, {
                controlUpdatedAt: new Date().toISOString(),
                controlNote,
            });
        }

        await appendFireflyRuntimeEvent(task.runId || '', {
            type: `control_${action}`,
            label: buildControlActionLabel(action),
            detail: buildControlActionDetail(action, controlStep?.label || '', controlNote),
            taskId: task.id,
            threadKey: task.threadKey,
            stepId,
            metadata: {
                action,
                controlNote,
                stepLabel: controlStep?.label || '',
            },
        });

        if (action === 'retry_full') {
            result = await replayFireflyTask({
                task,
                mode: 'full',
                uid,
                fid,
                controlNote,
                controlAction: action,
                stepId,
            });
        } else if (action === 'retry_failed') {
            result = await replayFireflyTask({
                task,
                mode: 'failed_only',
                uid,
                fid,
                controlNote,
                controlAction: action,
                stepId,
            });
        } else if (action === 'retry_step') {
            result = await replayFireflyTask({
                task,
                mode: 'single_step',
                stepId,
                uid,
                fid,
                controlNote,
                controlAction: action,
            });
        } else if (action === 'resume_plan') {
            result = await resumeFireflyTask({
                task,
                uid,
                fid,
                controlNote,
                controlAction: action,
                stepId,
            });
        } else {
            return NextResponse.json({
                ok: false,
                error: 'Unsupported action.',
            }, { status: 400 });
        }

        return NextResponse.json({
            ok: true,
            action,
            result,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to control Firefly runtime task.',
        }, { status: 500 });
    }
}
