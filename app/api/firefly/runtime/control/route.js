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
                detail: approvedStep.label,
                taskId: task.id,
                threadKey: task.threadKey,
                stepId,
                metadata: {
                    controlState: 'approved',
                },
            });

            result = await replayFireflyTask({
                task,
                mode: 'from_step',
                stepId,
                approvedStepIds: [stepId],
                uid,
                fid,
            });

            return NextResponse.json({
                ok: true,
                action,
                result,
            });
        }

        if (action === 'retry_full') {
            result = await replayFireflyTask({
                task,
                mode: 'full',
                uid,
                fid,
            });
        } else if (action === 'retry_failed') {
            result = await replayFireflyTask({
                task,
                mode: 'failed_only',
                uid,
                fid,
            });
        } else if (action === 'retry_step') {
            if (!stepId) {
                return NextResponse.json({
                    ok: false,
                    error: 'Missing stepId for retry_step.',
                }, { status: 400 });
            }

            result = await replayFireflyTask({
                task,
                mode: 'single_step',
                stepId,
                uid,
                fid,
            });
        } else if (action === 'resume_plan') {
            result = await resumeFireflyTask({
                task,
                uid,
                fid,
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
