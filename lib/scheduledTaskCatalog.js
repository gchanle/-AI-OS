export const SCHEDULED_TASK_CHANNELS = {
    IN_APP: 'in_app',
    WEB_PUSH: 'web_push',
    EMAIL: 'email',
    ENTERPRISE_BOT: 'enterprise_bot',
};

export const MORNING_DIGEST_TASK_ID = 'campus.morning_digest';

const TASK_CATALOG = {
    [MORNING_DIGEST_TASK_ID]: {
        id: MORNING_DIGEST_TASK_ID,
        label: '校园晨间摘要',
        category: 'digest',
        summary: '每天聚合未读消息、审批待办和审批记录，生成一条可推送的校园摘要。',
        defaultChannel: SCHEDULED_TASK_CHANNELS.IN_APP,
        supportedChannels: [
            SCHEDULED_TASK_CHANNELS.IN_APP,
            SCHEDULED_TASK_CHANNELS.WEB_PUSH,
            SCHEDULED_TASK_CHANNELS.EMAIL,
            SCHEDULED_TASK_CHANNELS.ENTERPRISE_BOT,
        ],
        defaultSchedule: {
            frequency: 'daily',
            time: '09:00',
            timezone: 'Asia/Shanghai',
        },
        defaultPreferences: {
            enabled: true,
            channel: SCHEDULED_TASK_CHANNELS.IN_APP,
            onlyWhenChanged: true,
            includeUnreadMessages: true,
            includeApprovalTodos: true,
            includeApprovalRecords: true,
            retryLimit: 2,
            retryDelayMinutes: 10,
        },
    },
};

export function getScheduledTaskDefinition(taskId) {
    return TASK_CATALOG[taskId] || null;
}

export function listScheduledTaskDefinitions() {
    return Object.values(TASK_CATALOG).map((item) => ({
        ...item,
        supportedChannels: [...item.supportedChannels],
        defaultSchedule: { ...item.defaultSchedule },
        defaultPreferences: { ...item.defaultPreferences },
    }));
}
