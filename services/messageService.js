import { fetchChaoxingUnreadMessages } from '@/lib/chaoxingMessages';

const DEFAULT_MESSAGE_LIMIT = 10;
const MESSAGE_CENTER_LINK = '/messages';

function normalizeLimit(limit, fallback = DEFAULT_MESSAGE_LIMIT) {
    const parsed = Number(limit);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function limitItems(items = [], limit = DEFAULT_MESSAGE_LIMIT) {
    return Array.isArray(items) ? items.slice(0, limit) : [];
}

export async function getCampusUnreadMessages(options = {}) {
    return fetchChaoxingUnreadMessages(options);
}

export async function getUnreadMessageSummary(options = {}) {
    const result = await getCampusUnreadMessages(options);
    const limit = normalizeLimit(options.limit, DEFAULT_MESSAGE_LIMIT);
    const items = limitItems(result.items, limit);
    const unreadCount = Number(result.unreadCount || items.length || 0);

    return {
        ...result,
        items,
        unreadCount,
        summary: {
            sourceId: 'study',
            sourceLabel: '学习通通知',
            limit,
            hasMore: unreadCount > items.length,
            moreLink: MESSAGE_CENTER_LINK,
        },
    };
}
