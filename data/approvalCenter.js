import { canUseBrowserStorage } from '@/data/campusPlatform';

export const APPROVAL_CENTER_STORAGE_KEY = 'campus_approval_center_v1';
export const CAMPUS_APPROVAL_SYNC_EVENT = 'campus-approval-sync';

function emptyApprovalState() {
    return {
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
        recordCount: 0,
        recordCountsByStatus: {
            approved: 0,
            copied: 0,
            othersProcessed: 0,
        },
        syncedAt: null,
    };
}

function sortApprovals(items = []) {
    return [...items].sort(
        (left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime()
            - new Date(left.updatedAt || left.createdAt || 0).getTime()
    );
}

export function normalizeApproval(item = {}) {
    return {
        id: item.id || `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        group: item.group || 'pending',
        title: item.title || '审批事项',
        formName: item.formName || '审批流程',
        sponsor: item.sponsor || '',
        approverLabel: item.approverLabel || '',
        source: item.source || '审批助手',
        href: item.href || '',
        status: item.status || {
            key: 'default',
            label: item.statusLabel || '状态未知',
            color: '#5AC8FA',
        },
        statusLabel: item.statusLabel || item.status?.label || '状态未知',
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        createdAt: item.createdAt || item.updatedAt || new Date().toISOString(),
        raw: item.raw || null,
    };
}

export function normalizeApprovalState(payload = {}) {
    const pending = sortApprovals((payload.pending || []).map(normalizeApproval));
    const initiated = sortApprovals((payload.initiated || []).map(normalizeApproval));
    const records = sortApprovals((payload.records || []).map(normalizeApproval));
    const recordsByStatus = {
        approved: sortApprovals((payload.recordsByStatus?.approved || []).map(normalizeApproval)),
        copied: sortApprovals((payload.recordsByStatus?.copied || []).map(normalizeApproval)),
        othersProcessed: sortApprovals((payload.recordsByStatus?.othersProcessed || []).map(normalizeApproval)),
    };

    return {
        pending,
        initiated,
        records,
        recordsByStatus,
        pendingCount: Number(payload.pendingCount || pending.length || 0),
        initiatedCount: Number(payload.initiatedCount || initiated.length || 0),
        recordCount: Number(payload.recordCount || records.length || 0),
        recordCountsByStatus: {
            approved: Number(payload.recordCountsByStatus?.approved || recordsByStatus.approved.length || 0),
            copied: Number(payload.recordCountsByStatus?.copied || recordsByStatus.copied.length || 0),
            othersProcessed: Number(payload.recordCountsByStatus?.othersProcessed || recordsByStatus.othersProcessed.length || 0),
        },
        syncedAt: payload.syncedAt || new Date().toISOString(),
    };
}

export function loadApprovalCenterState() {
    if (!canUseBrowserStorage()) {
        return emptyApprovalState();
    }

    try {
        const raw = JSON.parse(localStorage.getItem(APPROVAL_CENTER_STORAGE_KEY) || 'null');
        return raw ? normalizeApprovalState(raw) : emptyApprovalState();
    } catch (error) {
        console.error('Failed to restore approval center state:', error);
        return emptyApprovalState();
    }
}

export function saveApprovalCenterState(payload = {}) {
    if (!canUseBrowserStorage()) {
        return emptyApprovalState();
    }

    const normalized = normalizeApprovalState(payload);

    try {
        localStorage.setItem(APPROVAL_CENTER_STORAGE_KEY, JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(CAMPUS_APPROVAL_SYNC_EVENT, {
            detail: normalized,
        }));
    } catch (error) {
        console.error('Failed to persist approval center state:', error);
    }

    return normalized;
}

export function mergeApprovalCenterState(payload = {}) {
    return saveApprovalCenterState(payload);
}

export async function syncCampusApprovals(options = {}) {
    if (!canUseBrowserStorage()) {
        return emptyApprovalState();
    }

    const params = new URLSearchParams();
    if (options.uid) {
        params.set('uid', options.uid);
    }
    if (options.fid) {
        params.set('fid', options.fid);
    }

    const response = await fetch(`/api/approvals${params.toString() ? `?${params.toString()}` : ''}`, {
        method: 'GET',
        cache: 'no-store',
        headers: options.uid ? { 'x-campus-user-uid': options.uid } : undefined,
    });
    const payload = await response.json();

    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Failed to sync approvals.');
    }

    return mergeApprovalCenterState(payload);
}

export function subscribeApprovalCenter(callback) {
    if (!canUseBrowserStorage()) {
        return () => {};
    }

    const handleSync = (event) => {
        if (event.detail) {
            callback(normalizeApprovalState(event.detail));
            return;
        }

        callback(loadApprovalCenterState());
    };

    const handleStorage = (event) => {
        if (event.key === APPROVAL_CENTER_STORAGE_KEY) {
            callback(loadApprovalCenterState());
        }
    };

    window.addEventListener(CAMPUS_APPROVAL_SYNC_EVENT, handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener(CAMPUS_APPROVAL_SYNC_EVENT, handleSync);
        window.removeEventListener('storage', handleStorage);
    };
}
