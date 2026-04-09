import {
    getScheduledTaskDefinition,
    listScheduledTaskDefinitions,
    MORNING_DIGEST_TASK_ID,
} from '@/lib/scheduledTaskCatalog';
import { runFireflyPresetTask } from '@/services/fireflyAgentService';

function normalizeMorningDigestPreferences(raw = {}) {
    const definition = getScheduledTaskDefinition(MORNING_DIGEST_TASK_ID);
    const defaults = definition?.defaultPreferences || {};

    return {
        enabled: raw.enabled ?? defaults.enabled ?? true,
        channel: String(raw.channel || defaults.channel || 'in_app').trim(),
        onlyWhenChanged: raw.onlyWhenChanged ?? defaults.onlyWhenChanged ?? true,
        includeUnreadMessages: raw.includeUnreadMessages ?? defaults.includeUnreadMessages ?? true,
        includeApprovalTodos: raw.includeApprovalTodos ?? defaults.includeApprovalTodos ?? true,
        includeApprovalRecords: raw.includeApprovalRecords ?? defaults.includeApprovalRecords ?? true,
        retryLimit: Number(raw.retryLimit ?? defaults.retryLimit ?? 2),
        retryDelayMinutes: Number(raw.retryDelayMinutes ?? defaults.retryDelayMinutes ?? 10),
    };
}

function buildDigestNotification(digest, taskId) {
    const parts = [];

    if (digest.counts.pendingApprovals > 0) {
        parts.push(`待我审批 ${digest.counts.pendingApprovals} 条`);
    }
    if (digest.counts.unreadMessages > 0) {
        parts.push(`未读消息 ${digest.counts.unreadMessages} 条`);
    }
    if (digest.counts.approvedRecords > 0 || digest.counts.copiedRecords > 0 || digest.counts.othersProcessedRecords > 0) {
        parts.push(`审批记录 ${digest.counts.approvedRecords + digest.counts.copiedRecords + digest.counts.othersProcessedRecords} 条`);
    }

    return {
        sourceId: 'firefly',
        sourceLabel: '校园晨间摘要',
        title: '校园晨间摘要已生成',
        body: parts.length > 0 ? parts.join('，') : '今天暂时没有新的审批和消息变化。',
        detail: digest.pushText,
        href: digest.links.messages || '/',
        pathname: digest.links.messages || '/',
        actionLabel: '查看摘要',
        meta: {
            scheduledTaskId: taskId,
            digest,
            externalLinks: digest.links,
        },
    };
}

function buildDeliveryDecision({ preferences, snapshotHash, lastSnapshotHash }) {
    const snapshotChanged = Boolean(snapshotHash) && snapshotHash !== String(lastSnapshotHash || '').trim();
    const shouldDeliver = preferences.onlyWhenChanged ? snapshotChanged : true;

    return {
        channel: preferences.channel,
        onlyWhenChanged: preferences.onlyWhenChanged,
        snapshotChanged,
        shouldDeliver,
        reason: preferences.onlyWhenChanged
            ? (snapshotChanged ? 'snapshot_changed' : 'snapshot_unchanged')
            : 'always_deliver',
    };
}

export function listCampusScheduledTasks() {
    return listScheduledTaskDefinitions();
}

export async function runCampusScheduledTask(taskId, options = {}) {
    const definition = getScheduledTaskDefinition(taskId);

    if (!definition) {
        throw new Error(`Unknown scheduled task: ${taskId}`);
    }

    if (taskId === MORNING_DIGEST_TASK_ID) {
        const preferences = normalizeMorningDigestPreferences(options.preferences);
        const runtime = await runFireflyPresetTask({
            presetId: MORNING_DIGEST_TASK_ID,
            question: '生成校园晨间摘要',
            threadKey: `scheduled:${MORNING_DIGEST_TASK_ID}`,
            capabilityIds: ['messages', 'services'],
            contextSnapshot: {
                source: 'scheduled_runtime',
                taskId: MORNING_DIGEST_TASK_ID,
            },
            uid: options.uid,
            fid: options.fid,
            preferences,
            runtimeInput: {
                messageLimit: options.messageLimit,
                approvalLimit: options.approvalLimit,
            },
        });

        if (!runtime?.handled || runtime?.task?.status === 'failed') {
            throw new Error(runtime?.task?.resultSummary || runtime?.reply || 'Scheduled runtime failed.');
        }

        const digest = runtime.task?.stepResults?.campusDigest?.data;
        if (!digest) {
            throw new Error('Scheduled task completed without digest payload.');
        }

        const delivery = buildDeliveryDecision({
            preferences,
            snapshotHash: digest.snapshotHash,
            lastSnapshotHash: options.lastSnapshotHash,
        });

        return {
            taskId,
            label: definition.label,
            category: definition.category,
            executedAt: new Date().toISOString(),
            preferences,
            delivery,
            runtime,
            result: {
                type: 'campus_digest',
                digest,
            },
            notification: delivery.shouldDeliver
                ? buildDigestNotification(digest, taskId)
                : null,
        };
    }

    throw new Error(`Scheduled task is not implemented yet: ${taskId}`);
}
