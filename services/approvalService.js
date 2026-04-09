import { fetchChaoxingApprovals } from '@/lib/chaoxingApprovals';

export const APPROVAL_CENTER_LINK = 'https://office.chaoxing.com/front/web/approve/apps/index?';

const DEFAULT_APPROVAL_LIMIT = 10;

function normalizeLimit(limit, fallback = DEFAULT_APPROVAL_LIMIT) {
    const parsed = Number(limit);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function limitItems(items = [], limit = DEFAULT_APPROVAL_LIMIT) {
    return Array.isArray(items) ? items.slice(0, limit) : [];
}

export async function getCampusApprovals(options = {}) {
    return fetchChaoxingApprovals(options);
}

export async function getApprovalSummary(options = {}) {
    const result = await getCampusApprovals(options);
    const limit = normalizeLimit(options.limit, DEFAULT_APPROVAL_LIMIT);
    const pending = limitItems(result.pending, limit);
    const initiated = limitItems(result.initiated, limit);
    const records = limitItems(result.records, limit);
    const recordsByStatus = {
        approved: limitItems(result.recordsByStatus?.approved, limit),
        copied: limitItems(result.recordsByStatus?.copied, limit),
        othersProcessed: limitItems(result.recordsByStatus?.othersProcessed, limit),
    };

    return {
        ...result,
        pending,
        initiated,
        records,
        recordsByStatus,
        summary: {
            limit,
            moreLink: APPROVAL_CENTER_LINK,
            groups: {
                pending: {
                    count: Number(result.pendingCount || pending.length || 0),
                    hasMore: Number(result.pendingCount || 0) > pending.length,
                },
                initiated: {
                    count: Number(result.initiatedCount || initiated.length || 0),
                    hasMore: Number(result.initiatedCount || 0) > initiated.length,
                },
                approved: {
                    count: Number(result.recordCountsByStatus?.approved || recordsByStatus.approved.length || 0),
                    hasMore: Number(result.recordCountsByStatus?.approved || 0) > recordsByStatus.approved.length,
                },
                copied: {
                    count: Number(result.recordCountsByStatus?.copied || recordsByStatus.copied.length || 0),
                    hasMore: Number(result.recordCountsByStatus?.copied || 0) > recordsByStatus.copied.length,
                },
                othersProcessed: {
                    count: Number(result.recordCountsByStatus?.othersProcessed || recordsByStatus.othersProcessed.length || 0),
                    hasMore: Number(result.recordCountsByStatus?.othersProcessed || 0) > recordsByStatus.othersProcessed.length,
                },
            },
        },
    };
}
