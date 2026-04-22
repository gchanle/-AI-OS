function isControlEvent(event = {}) {
    return String(event?.type || '').startsWith('control_')
        || Boolean(String(event?.metadata?.action || '').trim());
}

export function formatFireflyControlAction(action = '') {
    if (action === 'approve_step' || action === 'control_approve_step') return '批准继续';
    if (action === 'resume_plan' || action === 'control_resume_plan') return '恢复续跑';
    if (action === 'retry_step' || action === 'control_retry_step') return '单步重跑';
    if (action === 'retry_failed' || action === 'control_retry_failed') return '失败重试';
    if (action === 'retry_full' || action === 'control_retry_full') return '整轮重试';
    if (action === 'control_approved' || action === 'approve_continue') return '允许继续';
    if (action === 'control_paused' || action === 'pause_task') return '已暂停';
    if (action === 'control_rejected' || action === 'reject_continue') return '已拒绝';
    return '前台接管';
}

export function extractFireflyTaskDirective(task = null, events = []) {
    const resumeNote = String(task?.resumeContext?.takeoverNote || task?.contextSnapshot?.takeoverNote || '').trim();
    if (resumeNote) {
        return {
            note: resumeNote,
            action: String(task?.resumeContext?.takeoverAction || task?.contextSnapshot?.takeoverAction || '').trim(),
            stepId: String(task?.resumeContext?.takeoverStepId || task?.contextSnapshot?.takeoverStepId || '').trim(),
            stepLabel: String(task?.resumeContext?.takeoverStepLabel || task?.contextSnapshot?.takeoverStepLabel || '').trim(),
        };
    }

    const taskControlNote = String(task?.controlNote || '').trim();
    const matchedEvent = (Array.isArray(events) ? events : []).find((event) => (
        event?.taskId === task?.id
        && isControlEvent(event)
        && (String(event?.metadata?.controlNote || '').trim() || String(event?.detail || '').trim())
    ));

    if (!taskControlNote && !matchedEvent) {
        return null;
    }

    return {
        note: taskControlNote || String(matchedEvent?.metadata?.controlNote || matchedEvent?.detail || '').trim(),
        action: String(matchedEvent?.metadata?.action || matchedEvent?.type || '').trim(),
        stepId: String(matchedEvent?.stepId || '').trim(),
        stepLabel: String(matchedEvent?.metadata?.stepLabel || '').trim(),
    };
}

export function buildFireflyStepDirectiveMap(task = null, events = []) {
    const map = new Map();
    const eventList = Array.isArray(events) ? events : [];

    eventList.forEach((event) => {
        const stepId = String(event?.stepId || '').trim();
        const note = String(event?.metadata?.controlNote || event?.detail || '').trim();
        if (!stepId || !note || map.has(stepId) || !isControlEvent(event)) {
            return;
        }

        map.set(stepId, {
            note,
            action: String(event?.metadata?.action || event?.type || '').trim(),
            stepLabel: String(event?.metadata?.stepLabel || '').trim(),
        });
    });

    const resumeStepId = String(task?.resumeContext?.takeoverStepId || task?.contextSnapshot?.takeoverStepId || '').trim();
    const resumeNote = String(task?.resumeContext?.takeoverNote || task?.contextSnapshot?.takeoverNote || '').trim();
    if (resumeStepId && resumeNote && !map.has(resumeStepId)) {
        map.set(resumeStepId, {
            note: resumeNote,
            action: String(task?.resumeContext?.takeoverAction || task?.contextSnapshot?.takeoverAction || '').trim(),
            stepLabel: String(task?.resumeContext?.takeoverStepLabel || task?.contextSnapshot?.takeoverStepLabel || '').trim(),
        });
    }

    return map;
}

export function buildFireflyDirectiveDisplay(task = null, events = []) {
    const directive = extractFireflyTaskDirective(task, events);
    if (!directive?.note) {
        return null;
    }

    return {
        ...directive,
        actionLabel: formatFireflyControlAction(directive.action),
    };
}
