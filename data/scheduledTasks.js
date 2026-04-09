'use client';

import {
    getScheduledTaskDefinition,
    listScheduledTaskDefinitions,
    MORNING_DIGEST_TASK_ID,
} from '@/lib/scheduledTaskCatalog';

export const CAMPUS_SCHEDULED_TASKS_KEY = 'campus_scheduled_tasks_v1';
export const CAMPUS_SCHEDULED_TASKS_EVENT = 'campus-scheduled-tasks-sync';

function canUseStorage() {
    return typeof window !== 'undefined';
}

function normalizeSchedule(raw = {}, fallback = {}) {
    return {
        frequency: String(raw.frequency || fallback.frequency || 'daily').trim(),
        time: String(raw.time || fallback.time || '09:00').trim(),
        timezone: String(raw.timezone || fallback.timezone || 'Asia/Shanghai').trim(),
    };
}

function normalizeTaskPreference(taskId, raw = {}) {
    const definition = getScheduledTaskDefinition(taskId);
    const fallback = definition?.defaultPreferences || {};

    return {
        taskId,
        enabled: raw.enabled ?? fallback.enabled ?? true,
        channel: String(raw.channel || fallback.channel || definition?.defaultChannel || 'in_app').trim(),
        onlyWhenChanged: raw.onlyWhenChanged ?? fallback.onlyWhenChanged ?? true,
        includeUnreadMessages: raw.includeUnreadMessages ?? fallback.includeUnreadMessages ?? true,
        includeApprovalTodos: raw.includeApprovalTodos ?? fallback.includeApprovalTodos ?? true,
        includeApprovalRecords: raw.includeApprovalRecords ?? fallback.includeApprovalRecords ?? true,
        retryLimit: Number(raw.retryLimit ?? fallback.retryLimit ?? 2),
        retryDelayMinutes: Number(raw.retryDelayMinutes ?? fallback.retryDelayMinutes ?? 10),
        schedule: normalizeSchedule(raw.schedule, definition?.defaultSchedule),
        lastPreviewedAt: raw.lastPreviewedAt || null,
        lastEvaluatedAt: raw.lastEvaluatedAt || null,
        lastDeliveredAt: raw.lastDeliveredAt || null,
        lastSnapshotHash: String(raw.lastSnapshotHash || '').trim(),
        lastFailedAt: raw.lastFailedAt || null,
        lastError: String(raw.lastError || '').trim(),
        retryCount: Number(raw.retryCount || 0),
        nextRetryAt: raw.nextRetryAt || null,
    };
}

export function getDefaultScheduledTasksState() {
    return Object.fromEntries(
        listScheduledTaskDefinitions().map((definition) => [
            definition.id,
            normalizeTaskPreference(definition.id),
        ])
    );
}

export function loadScheduledTasksState() {
    if (!canUseStorage()) {
        return getDefaultScheduledTasksState();
    }

    try {
        const raw = JSON.parse(localStorage.getItem(CAMPUS_SCHEDULED_TASKS_KEY) || 'null');
        const defaults = getDefaultScheduledTasksState();

        if (!raw || typeof raw !== 'object') {
            return defaults;
        }

        return Object.fromEntries(
            Object.keys(defaults).map((taskId) => [
                taskId,
                normalizeTaskPreference(taskId, raw[taskId]),
            ])
        );
    } catch (error) {
        console.error('Failed to restore scheduled task preferences:', error);
        return getDefaultScheduledTasksState();
    }
}

export function saveScheduledTasksState(nextState = {}) {
    if (!canUseStorage()) {
        return getDefaultScheduledTasksState();
    }

    const defaults = getDefaultScheduledTasksState();
    const normalized = Object.fromEntries(
        Object.keys(defaults).map((taskId) => [
            taskId,
            normalizeTaskPreference(taskId, nextState[taskId]),
        ])
    );

    try {
        localStorage.setItem(CAMPUS_SCHEDULED_TASKS_KEY, JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(CAMPUS_SCHEDULED_TASKS_EVENT, {
            detail: normalized,
        }));
    } catch (error) {
        console.error('Failed to persist scheduled task preferences:', error);
    }

    return normalized;
}

export function loadScheduledTaskPreference(taskId) {
    return loadScheduledTasksState()[taskId] || normalizeTaskPreference(taskId);
}

export function saveScheduledTaskPreference(taskId, patch = {}) {
    const current = loadScheduledTasksState();

    return saveScheduledTasksState({
        ...current,
        [taskId]: {
            ...current[taskId],
            ...patch,
            schedule: {
                ...current[taskId]?.schedule,
                ...patch.schedule,
            },
        },
    })[taskId];
}

function sameLocalDay(left, right) {
    return new Date(left).toLocaleDateString('zh-CN') === new Date(right).toLocaleDateString('zh-CN');
}

function buildScheduledTimePoint(now, time = '09:00') {
    const [hourText = '09', minuteText = '00'] = String(time || '09:00').split(':');
    const dueAt = new Date(now);
    dueAt.setHours(Number(hourText) || 9, Number(minuteText) || 0, 0, 0);
    return dueAt;
}

export function shouldRunScheduledTask(taskPreference, now = new Date()) {
    if (!taskPreference?.enabled) {
        return false;
    }

    if (taskPreference.nextRetryAt) {
        return now.getTime() >= new Date(taskPreference.nextRetryAt).getTime();
    }

    const dueAt = buildScheduledTimePoint(now, taskPreference.schedule?.time);
    if (now.getTime() < dueAt.getTime()) {
        return false;
    }

    if (taskPreference.lastEvaluatedAt && sameLocalDay(taskPreference.lastEvaluatedAt, now)) {
        return false;
    }

    return true;
}

export function markScheduledTaskRun(taskId, patch = {}) {
    return saveScheduledTaskPreference(taskId, patch);
}

export function markScheduledTaskSuccess(taskId, patch = {}) {
    return saveScheduledTaskPreference(taskId, {
        ...patch,
        retryCount: 0,
        nextRetryAt: null,
        lastFailedAt: null,
        lastError: '',
    });
}

export function markScheduledTaskFailure(taskId, patch = {}) {
    const current = loadScheduledTaskPreference(taskId);
    const nextRetryCount = Number(current.retryCount || 0) + 1;
    const retryLimit = Number(current.retryLimit || 0);
    const retryDelayMinutes = Math.max(1, Number(current.retryDelayMinutes || 10));
    const shouldRetry = nextRetryCount <= retryLimit;
    const nextRetryAt = shouldRetry
        ? new Date(Date.now() + retryDelayMinutes * 60 * 1000).toISOString()
        : null;

    return saveScheduledTaskPreference(taskId, {
        ...patch,
        retryCount: nextRetryCount,
        lastFailedAt: patch.lastFailedAt || new Date().toISOString(),
        nextRetryAt,
        lastError: String(patch.lastError || '').trim(),
    });
}

export function getMorningDigestTaskPreference() {
    return loadScheduledTaskPreference(MORNING_DIGEST_TASK_ID);
}

export function subscribeScheduledTasks(callback) {
    if (!canUseStorage()) {
        return () => {};
    }

    const handleSync = (event) => {
        if (event.detail) {
            callback(event.detail);
            return;
        }

        callback(loadScheduledTasksState());
    };

    const handleStorage = (event) => {
        if (event.key === CAMPUS_SCHEDULED_TASKS_KEY) {
            callback(loadScheduledTasksState());
        }
    };

    window.addEventListener(CAMPUS_SCHEDULED_TASKS_EVENT, handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener(CAMPUS_SCHEDULED_TASKS_EVENT, handleSync);
        window.removeEventListener('storage', handleStorage);
    };
}
