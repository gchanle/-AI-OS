import crypto from 'crypto';
import {
    createChaoxingToken,
    fetchChaoxingJson,
} from '@/lib/chaoxingAuth';

function normalizeBody(value = '') {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildMessageItem(item = {}) {
    const body = normalizeBody(item.content);
    return {
        id: `study-${item.idCode || crypto.createHash('md5').update(`${item.title || ''}-${item.sendTime || ''}`).digest('hex').slice(0, 16)}`,
        sourceId: 'study',
        sourceLabel: '学习通通知',
        title: item.title || '学习通新通知',
        body: body || '收到一条新的学习通未读通知。',
        detail: body || '收到一条新的学习通未读通知。',
        createdAt: item.sendTime ? new Date(item.sendTime.replace(' ', 'T') + '+08:00').toISOString() : new Date().toISOString(),
        read: Boolean(item.read),
        href: item.sourceUrl || item.url || '/messages',
        actionLabel: item.sourceUrl || item.url ? '打开原通知' : '查看详情',
        meta: {
            channel: 'study-notice',
            rawSourceType: item.sourceType || null,
            creatorName: item.createrName || '',
            logo: item.logo || '',
            noticeId: item.idCode || '',
            sourceUrl: item.sourceUrl || null,
            url: item.url || null,
        },
    };
}

export async function fetchChaoxingUnreadMessages(overrides = {}) {
    const { baseUrl, fid, uid, token } = await createChaoxingToken(overrides);

    const unreadUrl = new URL('/homepage/person/getPersonMessage', baseUrl);
    unreadUrl.searchParams.set('read', '0');

    const unreadResponse = await fetchChaoxingJson(unreadUrl.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!unreadResponse.ok || !unreadResponse.data?.success) {
        const message = unreadResponse.data?.msg || unreadResponse.data?.error || 'Failed to fetch Chaoxing unread messages.';
        throw new Error(message);
    }

    const list = Array.isArray(unreadResponse.data?.data?.messageList)
        ? unreadResponse.data.data.messageList
        : [];

    return {
        fid,
        uid,
        unreadCount: Number(unreadResponse.data?.data?.unReadCount || list.length || 0),
        items: list.map(buildMessageItem),
    };
}
