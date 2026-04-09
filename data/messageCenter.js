import { notifications } from './mock';
import {
    CAMPUS_MESSAGE_SYNC_EVENT,
    CAMPUS_PENDING_ACTION_KEY,
    canUseBrowserStorage,
    getCampusMessageSource,
    requestOpenFireflyTarget,
} from '@/data/campusPlatform';

export const MESSAGE_CENTER_STORAGE_KEY = 'campus_message_center_v2';

function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveSource(sourceId) {
    return getCampusMessageSource(sourceId || 'system') || { id: sourceId || 'system', label: sourceId || '系统通知', href: '/' };
}

export function normalizeMessage(item = {}) {
    const source = resolveSource(item.sourceId || item.source);
    return {
        id: item.id || uid('message'),
        sourceId: source.id,
        sourceLabel: item.sourceLabel || source.label,
        title: item.title || '新消息',
        body: item.body || '',
        detail: item.detail || item.body || '',
        createdAt: item.createdAt || new Date().toISOString(),
        read: Boolean(item.read),
        href: item.href || source.href || '/',
        pathname: item.pathname || item.href || source.href || '/',
        target: item.target || null,
        actionLabel: item.actionLabel || '查看详情',
        meta: item.meta || {},
    };
}

export function buildSeedMessages() {
    const now = new Date();
    const iso = (offsetHours) => new Date(now.getTime() - offsetHours * 60 * 60 * 1000).toISOString();

    return [
        normalizeMessage({
            id: 'seed-firefly-research',
            sourceId: 'firefly',
            title: '萤火虫已整理科研问题框架',
            body: '已根据你最近的科研问题，生成检索方向、比较维度与后续动作。',
            detail: '萤火虫刚刚完成了一次科研辅助整理，适合继续回到 AI 科研 页面查看并追问。',
            createdAt: iso(1),
            read: false,
            href: '/research',
            pathname: '/research',
            target: 'external_drawer:research:wendao',
            actionLabel: '继续查看',
        }),
        normalizeMessage({
            id: 'seed-service-progress',
            sourceId: 'services',
            title: '学生出校报备审批有新进展',
            body: '当前状态已更新为“待提交补充材料”，建议尽快处理。',
            detail: 'AI 办事 工作面检测到一条与审批流程相关的新进展，当前更适合回到办事大厅继续处理。',
            createdAt: iso(2),
            read: false,
            href: '/services',
            pathname: '/services',
            actionLabel: '前往处理',
        }),
        normalizeMessage({
            id: 'seed-library-note',
            sourceId: 'library',
            title: '阅读笔记草稿已同步',
            body: '你在 AI 图书馆 中的阅读笔记已生成草稿，可以继续编辑或追问。',
            detail: 'AI 图书馆 已根据最近的阅读过程生成一条笔记草稿，适合回到阅读工作台继续完善。',
            createdAt: iso(4),
            read: true,
            href: '/library',
            pathname: '/library',
            target: 'library_firefly_drawer_v1',
            actionLabel: '打开阅读工作台',
        }),
        normalizeMessage({
            id: 'seed-assistant-class',
            sourceId: 'assistant',
            title: 'AI 助教 检测到课程互动提醒',
            body: '有一门课程的互动区出现新的问答动态，建议及时查看。',
            detail: 'AI 助教 工作面收到课程侧的新提醒，可以进入对应页面继续处理课程协同与学生问答。',
            createdAt: iso(6),
            read: true,
            href: '/assistant',
            pathname: '/assistant',
            actionLabel: '查看课程页',
        }),
        normalizeMessage({
            id: 'seed-agent-market',
            sourceId: 'agents',
            title: '单位智能体市场有新配置建议',
            body: '能力中心为你整理了新的智能体配置建议，适合继续查看。',
            detail: 'AI 智能体 工作面生成了一条新的配置建议，可以继续打开能力中心查看详情。',
            createdAt: iso(10),
            read: true,
            href: '/agent-builder',
            pathname: '/agent-builder',
            actionLabel: '查看能力中心',
        }),
        normalizeMessage({
            id: 'seed-connectors-academic',
            sourceId: 'connectors',
            title: '教务系统连接器已通过最近一次健康检查',
            body: '当前可以用于课表查询、考试安排与成绩摘要等只读场景。',
            detail: '连接器中心已完成一次教务系统巡检，当前更适合继续配置授权范围或模拟一次萤火虫调用。',
            createdAt: iso(11),
            read: true,
            href: '/connectors/academic-affairs',
            pathname: '/connectors/academic-affairs',
            actionLabel: '查看连接器',
        }),
        ...notifications.slice(0, 2).map((item, index) => normalizeMessage({
            id: `seed-system-${item.id}`,
            sourceId: 'system',
            title: item.title,
            body: '来自校园通知中心，建议及时查看。',
            detail: '这是一条来自系统侧的校园通知，适合进入工作台后继续关注对应安排。',
            createdAt: iso(12 + index * 2),
            read: Boolean(item.read),
            href: '/',
            pathname: '/',
            actionLabel: '返回工作台',
        })),
    ];
}

function canUseStorage() {
    return canUseBrowserStorage();
}

export function loadMessageCenterItems(options = {}) {
    const { preferStorage = true } = options;

    if (!canUseStorage() || !preferStorage) {
        return buildSeedMessages();
    }

    try {
        const storedItems = JSON.parse(localStorage.getItem(MESSAGE_CENTER_STORAGE_KEY) || 'null');
        if (Array.isArray(storedItems) && storedItems.length > 0) {
            return storedItems.map(normalizeMessage).sort(
                (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
            );
        }
    } catch (error) {
        console.error('Failed to restore message center items:', error);
    }

    const seeded = buildSeedMessages();
    saveMessageCenterItems(seeded);
    return seeded;
}

export function saveMessageCenterItems(items = []) {
    if (!canUseStorage()) {
        return;
    }

    try {
        const normalized = items
            .map(normalizeMessage)
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
            .slice(0, 120);

        localStorage.setItem(MESSAGE_CENTER_STORAGE_KEY, JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(CAMPUS_MESSAGE_SYNC_EVENT, {
            detail: { items: normalized },
        }));
    } catch (error) {
        console.error('Failed to persist message center items:', error);
    }
}

export function addMessageCenterItem(item) {
    const current = loadMessageCenterItems();
    const nextItem = normalizeMessage(item);
    const deduped = current.filter((entry) => entry.id !== nextItem.id);
    const next = [nextItem, ...deduped];
    saveMessageCenterItems(next);
    return nextItem;
}

export function mergeMessageCenterItems(items = []) {
    const current = loadMessageCenterItems();
    const currentMap = new Map(current.map((item) => [item.id, item]));
    const nextIncoming = items.map((item) => {
        const normalized = normalizeMessage(item);
        const existing = currentMap.get(normalized.id);

        return existing
            ? {
                ...normalized,
                read: existing.read,
            }
            : normalized;
    });
    const preserved = current.filter((item) => !nextIncoming.some((entry) => entry.id === item.id));
    const next = [...nextIncoming, ...preserved];

    saveMessageCenterItems(next);
    return next;
}

export async function syncStudyNoticeMessages(options = {}) {
    if (!canUseStorage()) {
        return [];
    }

    const params = new URLSearchParams();
    if (options.uid) {
        params.set('uid', options.uid);
    }
    if (options.fid) {
        params.set('fid', options.fid);
    }

    const requestUrl = `/api/messages/study-unread${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(requestUrl, {
        method: 'GET',
        cache: 'no-store',
        headers: options.uid ? { 'x-campus-user-uid': options.uid } : undefined,
    });

    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Failed to sync study notice messages.');
    }

    return mergeMessageCenterItems(Array.isArray(payload.items) ? payload.items : []);
}

export function markMessageRead(id, read = true) {
    const next = loadMessageCenterItems().map((item) => (
        item.id === id ? { ...item, read } : item
    ));
    saveMessageCenterItems(next);
    return next.find((item) => item.id === id) || null;
}

export function markAllMessagesRead() {
    const next = loadMessageCenterItems().map((item) => ({ ...item, read: true }));
    saveMessageCenterItems(next);
    return next;
}

export function getMessageById(id) {
    return loadMessageCenterItems().find((item) => item.id === id) || null;
}

export function subscribeMessageCenter(callback) {
    if (!canUseStorage()) {
        return () => {};
    }

    const handleSync = (event) => {
        if (Array.isArray(event.detail?.items)) {
            callback(event.detail.items.map(normalizeMessage));
            return;
        }

        callback(loadMessageCenterItems());
    };

    const handleStorage = (event) => {
        if (event.key === MESSAGE_CENTER_STORAGE_KEY) {
            callback(loadMessageCenterItems());
        }
    };

    window.addEventListener(CAMPUS_MESSAGE_SYNC_EVENT, handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener(CAMPUS_MESSAGE_SYNC_EVENT, handleSync);
        window.removeEventListener('storage', handleStorage);
    };
}

export function formatMessageTime(value, withDate = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString('zh-CN', withDate
        ? {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }
        : {
            hour: '2-digit',
            minute: '2-digit',
        });
}

export function requestOpenFireflyAction(item) {
    if (!canUseStorage()) {
        return;
    }

    const href = item?.href || '';
    const pathname = item?.pathname || '';
    const isExternal = /^https?:\/\//.test(href) || /^https?:\/\//.test(pathname);

    if (isExternal && !item?.target) {
        window.open(href || pathname, '_blank', 'noopener,noreferrer');
        return;
    }

    if (item.pathname && window.location.pathname === item.pathname && item.target) {
        requestOpenFireflyTarget(item.target);
        return;
    }

    if (item.target) {
        sessionStorage.setItem(CAMPUS_PENDING_ACTION_KEY, JSON.stringify({
            target: item.target,
            pathname: item.pathname || item.href || '/',
            at: Date.now(),
        }));
    }

    window.location.href = item.pathname || item.href || '/';
}

export function consumePendingFireflyAction(validTargets = []) {
    if (!canUseStorage()) {
        return null;
    }

    try {
        const raw = sessionStorage.getItem(CAMPUS_PENDING_ACTION_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        if (!parsed?.target || !validTargets.includes(parsed.target)) {
            return null;
        }

        sessionStorage.removeItem(CAMPUS_PENDING_ACTION_KEY);
        return parsed;
    } catch (error) {
        console.error('Failed to consume pending firefly action:', error);
        sessionStorage.removeItem(CAMPUS_PENDING_ACTION_KEY);
        return null;
    }
}
