'use client';

import {
    getMorningDigestTaskPreference,
    saveScheduledTaskPreference,
} from '@/data/scheduledTasks';
import { MORNING_DIGEST_TASK_ID } from '@/lib/scheduledTaskCatalog';

export const CAMPUS_DIGEST_PREFERENCES_KEY = 'campus_digest_preferences_v1';

export function getDefaultDigestPreferences() {
    const preference = getMorningDigestTaskPreference();

    return {
        enabled: preference.enabled,
        channel: preference.channel,
        scheduleTime: preference.schedule?.time || '09:00',
        onlyWhenChanged: preference.onlyWhenChanged,
        includeUnreadMessages: preference.includeUnreadMessages,
        includeApprovalTodos: preference.includeApprovalTodos,
        includeApprovalRecords: preference.includeApprovalRecords,
        lastPreviewedAt: preference.lastPreviewedAt || null,
        lastEvaluatedAt: preference.lastEvaluatedAt || null,
        lastDeliveredAt: preference.lastDeliveredAt || null,
        lastSnapshotHash: preference.lastSnapshotHash || '',
    };
}

export function loadDigestPreferences() {
    return getDefaultDigestPreferences();
}

export function saveDigestPreferences(nextPreferences = {}) {
    const saved = saveScheduledTaskPreference(MORNING_DIGEST_TASK_ID, {
        ...nextPreferences,
        schedule: nextPreferences.scheduleTime
            ? { time: nextPreferences.scheduleTime }
            : undefined,
    });

    return {
        enabled: saved.enabled,
        channel: saved.channel,
        scheduleTime: saved.schedule?.time || '09:00',
        onlyWhenChanged: saved.onlyWhenChanged,
        includeUnreadMessages: saved.includeUnreadMessages,
        includeApprovalTodos: saved.includeApprovalTodos,
        includeApprovalRecords: saved.includeApprovalRecords,
        lastPreviewedAt: saved.lastPreviewedAt || null,
        lastEvaluatedAt: saved.lastEvaluatedAt || null,
        lastDeliveredAt: saved.lastDeliveredAt || null,
        lastSnapshotHash: saved.lastSnapshotHash || '',
    };
}
