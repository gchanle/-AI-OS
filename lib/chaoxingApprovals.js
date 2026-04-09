import {
    createChaoxingToken,
    fetchChaoxingJson,
} from '@/lib/chaoxingAuth';
import crypto from 'crypto';

const APPROVAL_TYPE_PENDING = 1;
const APPROVAL_TYPE_INITIATED = 4;
const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_RECORD_PAGE_SIZE = 200;
const APPROVAL_RECORD_SIGN_BY_FID = {
    '217097': 'approveData_zhizhen',
};
const APPROVAL_RECORD_KEY_BY_FID = {
    '217097': 'DaJHNgE&HNF%EIRXbc',
};
const APPROVAL_RECORD_STATUS_MAP = {
    2: 'approved',
    3: 'copied',
    4: 'othersProcessed',
};

const APPROVAL_GROUP_MAP = {
    [APPROVAL_TYPE_PENDING]: 'pending',
    [APPROVAL_TYPE_INITIATED]: 'initiated',
};

const STATUS_THEME_MAP = [
    { test: /待处理|待审批|待审核|审批中|审核中|处理中/, key: 'pending', color: '#FF9500' },
    { test: /已通过|通过|完成|已办结|已完成/, key: 'approved', color: '#34C759' },
    { test: /驳回|拒绝|未通过|退回|已退回/, key: 'rejected', color: '#FF3B30' },
    { test: /撤回|取消|作废|终止/, key: 'cancelled', color: '#8E8E93' },
];

function toIsoTime(value) {
    if (!value) {
        return new Date().toISOString();
    }

    const normalized = String(value).replace(' ', 'T');
    const parsed = new Date(`${normalized}+08:00`);

    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function resolveApprovalStatusMeta(statusLabel = '') {
    const matched = STATUS_THEME_MAP.find((entry) => entry.test.test(statusLabel));

    if (matched) {
        return {
            key: matched.key,
            label: statusLabel,
            color: matched.color,
        };
    }

    return {
        key: 'default',
        label: statusLabel || '状态未知',
        color: '#5AC8FA',
    };
}

function buildApprovalId(item = {}, group = 'pending') {
    return [
        'approval',
        group,
        item.formId || 'form',
        item.formUserId || item.id || item.insertTime || 'item',
    ].join('-');
}

function buildApprovalItem(item = {}, requestType) {
    const group = APPROVAL_GROUP_MAP[requestType] || 'pending';
    const status = resolveApprovalStatusMeta(item.aprvStatus);

    return {
        id: buildApprovalId(item, group),
        group,
        title: item.title || item.formName || '审批事项',
        formName: item.formName || '审批流程',
        sponsor: item.sponsor || '',
        approverLabel: item.uname || '',
        source: item.source || '审批助手',
        href: item.pageLinkUrl || '',
        status,
        statusLabel: status.label,
        updatedAt: toIsoTime(item.updateTime || item.insertTime),
        createdAt: toIsoTime(item.insertTime || item.updateTime),
        raw: item,
    };
}

function buildApprovalRecordId(item = {}, status) {
    return [
        'approval',
        'record',
        status,
        item.aprvId || item.id || item.inserttime || 'item',
    ].join('-');
}

function buildApprovalRecordItem(item = {}, status) {
    const statusMeta = resolveApprovalStatusMeta(item.aprvStatusType);
    const recordGroup = APPROVAL_RECORD_STATUS_MAP[status] || 'record';

    return {
        id: buildApprovalRecordId(item, status),
        group: 'records',
        recordGroup,
        title: item.aprvTitle || item.aprvType || '审批记录',
        formName: item.aprvType || '审批流程',
        sponsor: item.applicantName || '',
        approverLabel: '',
        source: status === 3 ? '抄送我' : '审批记录',
        href: item.linkUrl || '',
        status: statusMeta,
        statusLabel: item.aprvStatusType || statusMeta.label,
        updatedAt: item.updatetime ? new Date(Number(item.updatetime)).toISOString() : new Date().toISOString(),
        createdAt: item.inserttime ? new Date(Number(item.inserttime)).toISOString() : new Date().toISOString(),
        raw: item,
    };
}

function buildApprovalRecordSignature(params, key) {
    const source = Object.keys(params)
        .sort((left, right) => left.localeCompare(right))
        .map((item) => `[${item}=${params[item]}]`)
        .join('');

    return crypto.createHash('md5').update(`${source}[${key}]`).digest('hex');
}

function resolveApprovalRecordCredentials(fid, overrides = {}) {
    const normalizedFid = String(fid || '').trim();
    const sign = String(
        overrides.recordSign
        || process.env.CHAOXING_APPROVAL_RECORD_SIGN
        || APPROVAL_RECORD_SIGN_BY_FID[normalizedFid]
        || ''
    ).trim();
    const key = String(
        overrides.recordKey
        || process.env.CHAOXING_APPROVAL_RECORD_KEY
        || APPROVAL_RECORD_KEY_BY_FID[normalizedFid]
        || ''
    ).trim();

    if (!sign || !key) {
        throw new Error(`Missing approval record credentials for fid ${normalizedFid || 'unknown'}.`);
    }

    return { sign, key };
}

async function fetchApprovalList({ baseUrl, token, requestType, pageSize, page }) {
    const approvalUrl = new URL('/homepage/approval/getApprovalData', baseUrl);
    const response = await fetchChaoxingJson(approvalUrl.toString(), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            aprvType: requestType,
            aprvStatusType: '',
            pageSize,
            page,
        }),
    });

    if (!response.ok || !response.data?.success) {
        const message = response.data?.msg || response.data?.error || 'Failed to fetch Chaoxing approvals.';
        throw new Error(message);
    }

    const rawList = Array.isArray(response.data?.data?.list) ? response.data.data.list : [];

    return {
        requestType,
        group: APPROVAL_GROUP_MAP[requestType] || 'pending',
        total: Number(response.data?.data?.total || rawList.length || 0),
        items: rawList.map((item) => buildApprovalItem(item, requestType)),
    };
}

async function fetchApprovalRecordList({ uid, fid, status, pageSize, page, sign, key }) {
    const datetime = (() => {
        const now = new Date();
        return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            String(now.getHours()).padStart(2, '0'),
        ].join('');
    })();

    const params = {
        cpage: String(page),
        datetime,
        pageSize: String(pageSize),
        sign,
        status: String(status),
        uid: String(uid),
    };

    const recordUrl = new URL('http://m.oa.chaoxing.com/api/approve/forms/user/approval/list');
    Object.entries({
        ...params,
        enc: buildApprovalRecordSignature(params, key),
    }).forEach(([paramKey, value]) => {
        recordUrl.searchParams.set(paramKey, value);
    });

    const response = await fetchChaoxingJson(recordUrl.toString());
    if (!response.ok || !response.data?.success) {
        const message = response.data?.msg || response.data?.error || 'Failed to fetch approval records.';
        throw new Error(message);
    }

    const rawList = Array.isArray(response.data?.data?.resultList) ? response.data.data.resultList : [];

    return {
        status,
        group: APPROVAL_RECORD_STATUS_MAP[status] || 'record',
        total: Number(response.data?.data?.totalRow || rawList.length || 0),
        items: rawList.map((item) => buildApprovalRecordItem(item, status)),
    };
}

export async function fetchChaoxingApprovals(overrides = {}) {
    const {
        baseUrl,
        fid,
        uid,
        token,
    } = await createChaoxingToken(overrides);

    const pageSize = Number(overrides.pageSize || DEFAULT_PAGE_SIZE);
    const page = Number(overrides.page || 1);
    const recordPageSize = Number(overrides.recordPageSize || DEFAULT_RECORD_PAGE_SIZE);
    const { sign, key } = resolveApprovalRecordCredentials(fid, overrides);

    const [pendingResult, initiatedResult, approvedRecordResult, copiedRecordResult, othersProcessedRecordResult] = await Promise.all([
        fetchApprovalList({ baseUrl, token, requestType: APPROVAL_TYPE_PENDING, pageSize, page }),
        fetchApprovalList({ baseUrl, token, requestType: APPROVAL_TYPE_INITIATED, pageSize, page }),
        fetchApprovalRecordList({ uid, fid, status: 2, pageSize: recordPageSize, page, sign, key }),
        fetchApprovalRecordList({ uid, fid, status: 3, pageSize: recordPageSize, page, sign, key }),
        fetchApprovalRecordList({ uid, fid, status: 4, pageSize: recordPageSize, page, sign, key }),
    ]);

    const records = [
        ...approvedRecordResult.items,
        ...copiedRecordResult.items,
        ...othersProcessedRecordResult.items,
    ].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

    return {
        fid,
        uid,
        pendingCount: pendingResult.total,
        initiatedCount: initiatedResult.total,
        recordCount: approvedRecordResult.total + copiedRecordResult.total + othersProcessedRecordResult.total,
        pending: pendingResult.items,
        initiated: initiatedResult.items,
        records,
        recordsByStatus: {
            approved: approvedRecordResult.items,
            copied: copiedRecordResult.items,
            othersProcessed: othersProcessedRecordResult.items,
        },
        recordCountsByStatus: {
            approved: approvedRecordResult.total,
            copied: copiedRecordResult.total,
            othersProcessed: othersProcessedRecordResult.total,
        },
        syncedAt: new Date().toISOString(),
    };
}
