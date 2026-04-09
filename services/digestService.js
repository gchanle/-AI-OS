import crypto from 'crypto';
import { getApprovalSummary, APPROVAL_CENTER_LINK } from '@/services/approvalService';
import { getUnreadMessageSummary } from '@/services/messageService';

const MORNING_DIGEST_LIMIT = 5;

function limitItems(items = [], limit = MORNING_DIGEST_LIMIT) {
    return Array.isArray(items) ? items.slice(0, limit) : [];
}

function buildDigestHash(payload = {}) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
}

function formatZhTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value || '');
    }

    return date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function buildSuggestionLines({ unreadMessages, pendingApprovals, records }) {
    const suggestions = [];

    if (pendingApprovals.length > 0) {
        suggestions.push(`优先处理 ${pendingApprovals[0].title}`);
    }

    if (unreadMessages.length > 0) {
        suggestions.push(`查看最新未读消息：${unreadMessages[0].title}`);
    }

    if (records.length > 0) {
        suggestions.push(`补看最近审批记录：${records[0].title}`);
    }

    if (suggestions.length === 0) {
        suggestions.push('今天没有新的未读消息或审批待办。');
    }

    return suggestions;
}

function buildPushText({
    includeUnreadMessages,
    includeApprovalTodos,
    includeApprovalRecords,
    unreadCount,
    pendingCount,
    initiatedCount,
    recordCountsByStatus,
    unreadMessages,
    pendingApprovals,
    suggestions,
    warnings = [],
}) {
    const lines = ['早上好，今天的校园待办摘要如下：'];

    if (includeUnreadMessages) {
        lines.push(`- 未读消息：${unreadCount} 条`);
    }

    if (includeApprovalTodos) {
        lines.push(`- 待我审批：${pendingCount} 条`);
        lines.push(`- 我发起的：${initiatedCount} 条`);
    }

    if (includeApprovalRecords) {
        lines.push(`- 已审批：${recordCountsByStatus.approved || 0} 条`);
        lines.push(`- 抄送我：${recordCountsByStatus.copied || 0} 条`);
        lines.push(`- 他人已处理：${recordCountsByStatus.othersProcessed || 0} 条`);
    }

    if (includeApprovalTodos && pendingApprovals.length > 0) {
        lines.push('', '优先审批：');
        pendingApprovals.forEach((item) => {
            lines.push(`- ${item.title}（${item.statusLabel}，${formatZhTime(item.updatedAt)}）`);
        });
    }

    if (includeUnreadMessages && unreadMessages.length > 0) {
        lines.push('', '最新未读消息：');
        unreadMessages.forEach((item) => {
            lines.push(`- ${item.title}（${formatZhTime(item.createdAt)}）`);
        });
    }

    if (suggestions.length > 0) {
        lines.push('', '建议动作：');
        suggestions.forEach((item, index) => {
            lines.push(`${index + 1}. ${item}`);
        });
    }

    if (warnings.length > 0) {
        lines.push('', '数据提示：');
        warnings.forEach((item) => {
            lines.push(`- ${item}`);
        });
    }

    lines.push('', `查看全部审批：${APPROVAL_CENTER_LINK}`);

    return lines.join('\n');
}

export async function buildCampusMorningDigest(overrides = {}) {
    const preferences = {
        includeUnreadMessages: overrides.includeUnreadMessages !== false,
        includeApprovalTodos: overrides.includeApprovalTodos !== false,
        includeApprovalRecords: overrides.includeApprovalRecords !== false,
    };

    const [messageState, approvalState] = await Promise.allSettled([
        getUnreadMessageSummary({
            ...overrides,
            limit: overrides.messageLimit || MORNING_DIGEST_LIMIT,
        }),
        getApprovalSummary({
            ...overrides,
            limit: overrides.approvalLimit || MORNING_DIGEST_LIMIT,
        }),
    ]);
    const warnings = [];
    const messageResult = messageState.status === 'fulfilled'
        ? messageState.value
        : {
            fid: overrides.fid,
            uid: overrides.uid,
            unreadCount: 0,
            items: [],
            summary: {
                moreLink: '/messages',
            },
        };
    const approvalResult = approvalState.status === 'fulfilled'
        ? approvalState.value
        : {
            fid: overrides.fid,
            uid: overrides.uid,
            pending: [],
            initiated: [],
            records: [],
            recordsByStatus: {
                approved: [],
                copied: [],
                othersProcessed: [],
            },
            pendingCount: 0,
            initiatedCount: 0,
            recordCountsByStatus: {
                approved: 0,
                copied: 0,
                othersProcessed: 0,
            },
            summary: {
                moreLink: APPROVAL_CENTER_LINK,
            },
        };

    if (messageState.status === 'rejected') {
        warnings.push(`消息源暂不可用：${messageState.reason instanceof Error ? messageState.reason.message : '未知错误'}`);
    }

    if (approvalState.status === 'rejected') {
        warnings.push(`审批源暂不可用：${approvalState.reason instanceof Error ? approvalState.reason.message : '未知错误'}`);
    }

    const unreadMessages = preferences.includeUnreadMessages
        ? limitItems(messageResult.items, MORNING_DIGEST_LIMIT)
        : [];
    const pendingApprovals = preferences.includeApprovalTodos
        ? limitItems(approvalResult.pending, MORNING_DIGEST_LIMIT)
        : [];
    const initiatedApprovals = preferences.includeApprovalTodos
        ? limitItems(approvalResult.initiated, MORNING_DIGEST_LIMIT)
        : [];
    const approvalRecords = preferences.includeApprovalRecords
        ? {
            approved: limitItems(approvalResult.recordsByStatus?.approved, MORNING_DIGEST_LIMIT),
            copied: limitItems(approvalResult.recordsByStatus?.copied, MORNING_DIGEST_LIMIT),
            othersProcessed: limitItems(approvalResult.recordsByStatus?.othersProcessed, MORNING_DIGEST_LIMIT),
        }
        : {
            approved: [],
            copied: [],
            othersProcessed: [],
        };

    const suggestions = buildSuggestionLines({
        unreadMessages,
        pendingApprovals,
        records: approvalResult.records,
    });

    const digest = {
        generatedAt: new Date().toISOString(),
        uid: approvalResult.uid || messageResult.uid,
        fid: approvalResult.fid || messageResult.fid,
        counts: {
            unreadMessages: preferences.includeUnreadMessages ? (messageResult.unreadCount || 0) : 0,
            pendingApprovals: preferences.includeApprovalTodos ? (approvalResult.pendingCount || 0) : 0,
            initiatedApprovals: preferences.includeApprovalTodos ? (approvalResult.initiatedCount || 0) : 0,
            approvedRecords: preferences.includeApprovalRecords ? (approvalResult.recordCountsByStatus?.approved || 0) : 0,
            copiedRecords: preferences.includeApprovalRecords ? (approvalResult.recordCountsByStatus?.copied || 0) : 0,
            othersProcessedRecords: preferences.includeApprovalRecords ? (approvalResult.recordCountsByStatus?.othersProcessed || 0) : 0,
        },
        links: {
            messages: messageResult.summary?.moreLink || '/messages',
            approvals: approvalResult.summary?.moreLink || APPROVAL_CENTER_LINK,
        },
        sections: {
            unreadMessages,
            pendingApprovals,
            initiatedApprovals,
            approvalRecords,
        },
        preferences,
        suggestions,
        warnings,
    };

    return {
        ...digest,
        snapshotHash: buildDigestHash({
            counts: digest.counts,
            unreadMessages: digest.sections.unreadMessages.map((item) => item.id),
            pendingApprovals: digest.sections.pendingApprovals.map((item) => item.id),
            initiatedApprovals: digest.sections.initiatedApprovals.map((item) => item.id),
            approvedRecords: digest.sections.approvalRecords.approved.map((item) => item.id),
            copiedRecords: digest.sections.approvalRecords.copied.map((item) => item.id),
            othersProcessedRecords: digest.sections.approvalRecords.othersProcessed.map((item) => item.id),
            warnings,
        }),
        pushText: buildPushText({
            ...preferences,
            unreadCount: digest.counts.unreadMessages,
            pendingCount: digest.counts.pendingApprovals,
            initiatedCount: digest.counts.initiatedApprovals,
            recordCountsByStatus: {
                approved: digest.counts.approvedRecords,
                copied: digest.counts.copiedRecords,
                othersProcessed: digest.counts.othersProcessedRecords,
            },
            unreadMessages,
            pendingApprovals,
            suggestions,
            warnings,
        }),
    };
}
