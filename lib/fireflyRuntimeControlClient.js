'use client';

function resolveTask(payload = {}) {
    if (payload?.task && typeof payload.task === 'object') {
        return payload.task;
    }

    if (payload?.result?.task && typeof payload.result.task === 'object') {
        return payload.result.task;
    }

    return null;
}

function resolveReply(payload = {}) {
    return String(payload?.result?.reply || '').trim();
}

function resolveActionLabel(action = '') {
    switch (action) {
    case 'approve_step':
        return '已批准当前步骤';
    case 'retry_failed':
        return '已触发失败步骤重试';
    case 'retry_full':
        return '已触发整轮重试';
    case 'resume_plan':
        return '已触发恢复续跑';
    case 'retry_step':
        return '已触发单步骤重跑';
    case 'approve_continue':
        return '已批准继续';
    case 'pause_task':
        return '已标记暂停';
    case 'reject_continue':
        return '已拒绝继续';
    default:
        return '已执行运行控制动作';
    }
}

export function resolveFireflyRuntimeTaskPhase(task = null) {
    const status = String(task?.status || '').trim();
    if (status === 'failed') {
        return 'failed';
    }

    if (status === 'running' || status === 'planning') {
        return 'running';
    }

    return 'completed';
}

export function isFireflyRuntimeTaskStreaming(task = null) {
    const status = String(task?.status || '').trim();
    return status === 'running' || status === 'planning';
}

export async function requestFireflyRuntimeControl({
    action,
    taskId,
    stepId = '',
    uid = '',
    fid = '',
    note = '',
} = {}) {
    const response = await fetch('/api/firefly/runtime/control', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action,
            taskId,
            stepId,
            uid,
            fid,
            note,
        }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || '运行控制动作执行失败。');
    }

    const task = resolveTask(payload);
    const reply = resolveReply(payload);
    const taskTitle = String(task?.title || payload?.result?.task?.title || '当前任务').trim();

    return {
        payload,
        task,
        reply,
        message: `${resolveActionLabel(action)}：${taskTitle}`,
    };
}
