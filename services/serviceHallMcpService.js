import crypto from 'crypto';

const DEFAULT_SERVICE_HALL_MCP_ENDPOINT = 'https://servicehall.chaoxing.com/homepage/mcp/stream';
const DEFAULT_SERVICE_HALL_TOKEN_ENDPOINT = 'https://demo.hall.chaoxing.com/pedestal/auth/createToken';
const DEFAULT_SERVICE_HALL_TOKEN_TTL_MS = 25 * 60 * 1000;

let cachedServiceHallBearerToken = '';
let cachedServiceHallBearerTokenExpiresAt = 0;
let inflightServiceHallBearerTokenPromise = null;

function normalizeConfigValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    let normalized = String(value)
        .replace(/^\uFEFF/, '')
        .trim();

    if (
        (normalized.startsWith('"') && normalized.endsWith('"'))
        || (normalized.startsWith('\'') && normalized.endsWith('\''))
    ) {
        normalized = normalized.slice(1, -1).trim();
    }

    return normalized;
}

function getServiceHallMcpEndpoint() {
    return normalizeConfigValue(process.env.SERVICE_HALL_MCP_ENDPOINT || DEFAULT_SERVICE_HALL_MCP_ENDPOINT);
}

function getConfiguredSessionCookie() {
    return normalizeConfigValue(process.env.SERVICE_HALL_MCP_SESSION_COOKIE || '');
}

function getConfiguredBearerToken() {
    return normalizeConfigValue(process.env.SERVICE_HALL_MCP_BEARER_TOKEN || '');
}

function getConfiguredTokenEndpoint() {
    return normalizeConfigValue(process.env.SERVICE_HALL_MCP_TOKEN_ENDPOINT || DEFAULT_SERVICE_HALL_TOKEN_ENDPOINT);
}

function getConfiguredFid() {
    return normalizeConfigValue(process.env.SERVICE_HALL_MCP_FID || '');
}

function getConfiguredUid() {
    return normalizeConfigValue(process.env.SERVICE_HALL_MCP_UID || '');
}

function getConfiguredAesKey() {
    return normalizeConfigValue(process.env.SERVICE_HALL_MCP_AES_KEY || '');
}

function buildMcpHeaders({ sessionCookie = '', bearerToken = '' } = {}) {
    const headers = {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
    };

    if (bearerToken) {
        headers.Authorization = `Bearer ${bearerToken}`;
    }

    if (sessionCookie) {
        headers.Cookie = sessionCookie;
    }

    return headers;
}

function parseMaybeJson(raw = '') {
    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function parseSsePayload(raw = '') {
    const chunks = String(raw || '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .filter((line) => line && line !== '[DONE]');

    for (let index = chunks.length - 1; index >= 0; index -= 1) {
        const parsed = parseMaybeJson(chunks[index]);
        if (parsed) {
            return parsed;
        }
    }

    return null;
}

function extractToolResult(payload) {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }

    if (Array.isArray(payload.content)) {
        const textItem = payload.content.find((item) => item?.type === 'text' && typeof item?.text === 'string');
        if (textItem?.text) {
            return parseMaybeJson(textItem.text) || textItem.text;
        }
        return payload.content;
    }

    if (payload.result !== undefined) {
        return payload.result;
    }
    if (payload.data !== undefined) {
        return payload.data;
    }
    if (payload.content !== undefined) {
        return payload.content;
    }

    return payload;
}

function resolveServiceHallMcpAuth(options = {}) {
    const sessionCookie = normalizeConfigValue(
        options.sessionCookie !== undefined ? options.sessionCookie : getConfiguredSessionCookie()
    );
    const bearerToken = normalizeConfigValue(
        options.bearerToken !== undefined ? options.bearerToken : getConfiguredBearerToken()
    );
    const tokenEndpoint = normalizeConfigValue(
        options.tokenEndpoint !== undefined ? options.tokenEndpoint : getConfiguredTokenEndpoint()
    );
    const fid = normalizeConfigValue(
        options.fid !== undefined ? options.fid : getConfiguredFid()
    );
    const uid = normalizeConfigValue(
        options.uid !== undefined ? options.uid : getConfiguredUid()
    );
    const aesKey = normalizeConfigValue(
        options.aesKey !== undefined ? options.aesKey : getConfiguredAesKey()
    );

    return {
        sessionCookie,
        bearerToken,
        tokenEndpoint,
        fid,
        uid,
        aesKey,
    };
}

export function hasServiceHallMcpAuth(options = {}) {
    const { sessionCookie, bearerToken, fid, uid, aesKey } = resolveServiceHallMcpAuth(options);
    return Boolean(sessionCookie || bearerToken || (fid && uid && aesKey));
}

function getServiceHallAuthDiagnostics(auth = {}) {
    const resolved = resolveServiceHallMcpAuth(auth);
    const aesKeyBufferLength = resolved.aesKey ? Buffer.from(resolved.aesKey, 'utf8').length : 0;

    return {
        hasSessionCookie: Boolean(resolved.sessionCookie),
        hasBearerToken: Boolean(resolved.bearerToken),
        hasFid: Boolean(resolved.fid),
        hasUid: Boolean(resolved.uid),
        aesKeyLength: resolved.aesKey.length,
        aesKeyBytes: aesKeyBufferLength,
        tokenEndpointHost: (() => {
            try {
                return resolved.tokenEndpoint ? new URL(resolved.tokenEndpoint).host : '';
            } catch {
                return '';
            }
        })(),
    };
}

function buildServiceHallEnc({ fid, uid, aesKey }) {
    const normalizedAesKey = normalizeConfigValue(aesKey);
    const aesKeyBytes = normalizedAesKey ? Buffer.from(normalizedAesKey, 'utf8').length : 0;

    if (normalizedAesKey.length !== 16 || aesKeyBytes !== 16) {
        console.warn('[servicehall-mcp] invalid aes key for token refresh', {
            fidPresent: Boolean(fid),
            uidPresent: Boolean(uid),
            aesKeyLength: normalizedAesKey.length,
            aesKeyBytes,
            envDiagnostics: getServiceHallAuthDiagnostics({ fid, uid, aesKey: normalizedAesKey }),
        });
        throw new Error('Service Hall MCP AES key 必须是 16 位字符。');
    }

    const now = String(Date.now());
    const payload = JSON.stringify({
        fid,
        uid,
        time: now,
        nonce: now,
    });

    const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(normalizedAesKey, 'utf8'), null);
    cipher.setAutoPadding(true);

    return Buffer.concat([
        cipher.update(payload, 'utf8'),
        cipher.final(),
    ]).toString('hex').toUpperCase();
}

async function fetchServiceHallBearerToken(auth = {}) {
    const resolvedAuth = resolveServiceHallMcpAuth(auth);

    if (!auth.forceRefresh && resolvedAuth.bearerToken) {
        return resolvedAuth.bearerToken;
    }

    if (cachedServiceHallBearerToken && cachedServiceHallBearerTokenExpiresAt > Date.now()) {
        return cachedServiceHallBearerToken;
    }

    if (inflightServiceHallBearerTokenPromise) {
        return inflightServiceHallBearerTokenPromise;
    }

    if (!resolvedAuth.fid || !resolvedAuth.uid || !resolvedAuth.aesKey) {
        throw new Error('Service Hall MCP 缺少 fid / uid / aes key，无法自动换取 token。');
    }

    inflightServiceHallBearerTokenPromise = (async () => {
        const url = new URL(resolvedAuth.tokenEndpoint || DEFAULT_SERVICE_HALL_TOKEN_ENDPOINT);
        url.searchParams.set('fid', resolvedAuth.fid);
        url.searchParams.set('uid', resolvedAuth.uid);
        url.searchParams.set('enc', buildServiceHallEnc({
            fid: resolvedAuth.fid,
            uid: resolvedAuth.uid,
            aesKey: resolvedAuth.aesKey,
        }));

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            cache: 'no-store',
        });
        const raw = await response.text();
        const payload = parseMaybeJson(raw);

        if (!response.ok || !payload?.success) {
            throw new Error(payload?.msg || payload?.error || `Service Hall token 获取失败（${response.status}）。`);
        }

        const token = typeof payload?.data === 'string'
            ? payload.data
            : payload?.data?.token || payload?.data?.accessToken || payload?.token || '';

        if (!token) {
            throw new Error('Service Hall token 响应中未包含可用 token。');
        }

        cachedServiceHallBearerToken = String(token).trim();
        cachedServiceHallBearerTokenExpiresAt = Date.now() + DEFAULT_SERVICE_HALL_TOKEN_TTL_MS;
        return cachedServiceHallBearerToken;
    })();

    try {
        return await inflightServiceHallBearerTokenPromise;
    } finally {
        inflightServiceHallBearerTokenPromise = null;
    }
}

function isServiceHallAuthExpired(response, raw = '', payload = null) {
    return response.status === 401
        || payload?.code === 401
        || /登录已超时|重新登录/.test(String(raw || ''));
}

export async function callServiceHallMcpTool({
    toolName,
    args = {},
    endpoint = getServiceHallMcpEndpoint(),
    sessionCookie = '',
    bearerToken = '',
    signal,
} = {}) {
    const normalizedToolName = String(toolName || '').trim();
    if (!normalizedToolName) {
        throw new Error('缺少 Service Hall MCP 工具名。');
    }

    const auth = resolveServiceHallMcpAuth({ sessionCookie, bearerToken });
    if (!auth.sessionCookie && !auth.bearerToken && !(auth.fid && auth.uid && auth.aesKey)) {
        throw new Error('Service Hall MCP 需要 Bearer Token、登录态 Cookie，或 fid/uid/aes key 才能调用。');
    }
    const requestBody = JSON.stringify({
        jsonrpc: '2.0',
        id: `servicehall-${normalizedToolName}-${Date.now()}`,
        method: 'tools/call',
        params: {
            name: normalizedToolName,
            arguments: args,
        },
    });
    const canRefreshToken = !auth.sessionCookie && Boolean(auth.fid && auth.uid && auth.aesKey);

    const executeRequest = async (requestAuth) => {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: buildMcpHeaders(requestAuth),
            body: requestBody,
            cache: 'no-store',
            signal,
        });
        const raw = await response.text();
        const payload = parseMaybeJson(raw) || parseSsePayload(raw);
        return { response, raw, payload };
    };

    const initialBearerToken = auth.sessionCookie
        ? auth.bearerToken
        : await fetchServiceHallBearerToken(auth).catch(() => auth.bearerToken);
    let requestAuth = {
        ...auth,
        bearerToken: initialBearerToken || auth.bearerToken,
    };

    let { response, raw, payload } = await executeRequest(requestAuth);

    if (isServiceHallAuthExpired(response, raw, payload) && canRefreshToken) {
        const refreshedBearerToken = await fetchServiceHallBearerToken({
            ...auth,
            bearerToken: '',
            forceRefresh: true,
        });
        requestAuth = {
            ...auth,
            bearerToken: refreshedBearerToken,
        };
        ({ response, raw, payload } = await executeRequest(requestAuth));
    }

    if (isServiceHallAuthExpired(response, raw, payload)) {
        throw new Error('Service Hall MCP 登录态已失效，请先在浏览器重新登录。');
    }

    if (!response.ok) {
        throw new Error(payload?.msg || payload?.error || `Service Hall MCP 请求失败（${response.status}）。`);
    }

    if (payload?.success === false || payload?.error) {
        throw new Error(payload?.msg || payload?.error || 'Service Hall MCP 返回失败。');
    }

    return {
        endpoint,
        toolName: normalizedToolName,
        payload,
        result: extractToolResult(payload),
        raw,
    };
}

export async function searchServiceHallApprovals(options = {}) {
    return callServiceHallMcpTool({
        toolName: 'search_approvals',
        args: options.args || options,
        sessionCookie: options.sessionCookie,
        bearerToken: options.bearerToken,
        signal: options.signal,
    });
}

export async function searchServiceHallNotices(options = {}) {
    return callServiceHallMcpTool({
        toolName: 'search_notices',
        args: options.args || options,
        sessionCookie: options.sessionCookie,
        bearerToken: options.bearerToken,
        signal: options.signal,
    });
}

export async function searchServiceHallApps(options = {}) {
    return callServiceHallMcpTool({
        toolName: 'search_apps',
        args: options.args || options,
        sessionCookie: options.sessionCookie,
        bearerToken: options.bearerToken,
        signal: options.signal,
    });
}

function normalizeNoticeItem(item = {}) {
    return {
        id: String(item.idCode || item.id || '').trim(),
        title: item.title || '未命名消息',
        body: item.content || '',
        detail: item.content || '',
        createdAt: item.sendTime ? new Date(String(item.sendTime).replace(' ', 'T') + '+08:00').toISOString() : new Date().toISOString(),
        read: Boolean(item.read),
        href: item.url || item.sourceUrl || '',
        sender: item.createrName || '',
        sourceLabel: '办事大厅消息',
        raw: item,
    };
}

export async function fetchServiceHallNoticeItems(options = {}) {
    const response = await searchServiceHallNotices(options);
    const list = Array.isArray(response.result) ? response.result : [];

    return {
        ...response,
        items: list.map(normalizeNoticeItem),
        unreadCount: list.filter((item) => item && item.read === false).length || list.length,
    };
}

function normalizeApprovalItem(item = {}, group = '') {
    return {
        id: String(item.formUserId || item.id || item.formId || '').trim(),
        title: item.title || item.formName || '审批事项',
        sponsor: item.sponsor || '',
        approverLabel: item.uname || '',
        statusLabel: item.aprvStatus || '状态未知',
        href: item.pageLinkUrl || '',
        createdAt: item.insertTime ? new Date(String(item.insertTime).replace(' ', 'T') + '+08:00').toISOString() : new Date().toISOString(),
        updatedAt: item.updateTime ? new Date(String(item.updateTime).replace(' ', 'T') + '+08:00').toISOString() : new Date().toISOString(),
        group,
        raw: item,
    };
}

export async function fetchServiceHallApprovalSummary(options = {}) {
    const [pendingResponse, approvedResponse, copiedResponse, initiatedResponse] = await Promise.all([
        searchServiceHallApprovals({ ...options, args: { aprvType: 1, ...(options.args || {}) } }),
        searchServiceHallApprovals({ ...options, args: { aprvType: 2 } }),
        searchServiceHallApprovals({ ...options, args: { aprvType: 3 } }),
        searchServiceHallApprovals({ ...options, args: { aprvType: 4 } }),
    ]);

    const pendingData = pendingResponse.result?.data || {};
    const approvedData = approvedResponse.result?.data || {};
    const copiedData = copiedResponse.result?.data || {};
    const initiatedData = initiatedResponse.result?.data || {};

    return {
        pending: Array.isArray(pendingData.list) ? pendingData.list.map((item) => normalizeApprovalItem(item, 'pending')) : [],
        pendingCount: Number(pendingData.total || 0),
        initiated: Array.isArray(initiatedData.list) ? initiatedData.list.map((item) => normalizeApprovalItem(item, 'initiated')) : [],
        initiatedCount: Number(initiatedData.total || 0),
        records: [
            ...(Array.isArray(approvedData.list) ? approvedData.list.map((item) => normalizeApprovalItem(item, 'approved')) : []),
            ...(Array.isArray(copiedData.list) ? copiedData.list.map((item) => normalizeApprovalItem(item, 'copied')) : []),
        ],
        recordsByStatus: {
            approved: Array.isArray(approvedData.list) ? approvedData.list.map((item) => normalizeApprovalItem(item, 'approved')) : [],
            copied: Array.isArray(copiedData.list) ? copiedData.list.map((item) => normalizeApprovalItem(item, 'copied')) : [],
            othersProcessed: [],
        },
        recordCountsByStatus: {
            approved: Number(approvedData.total || 0),
            copied: Number(copiedData.total || 0),
            othersProcessed: 0,
        },
        rawResponses: {
            pending: pendingResponse.result,
            approved: approvedResponse.result,
            copied: copiedResponse.result,
            initiated: initiatedResponse.result,
        },
    };
}

export async function fetchServiceHallAppItems(options = {}) {
    const response = await searchServiceHallApps(options);
    const records = Array.isArray(response.result?.records) ? response.result.records : [];

    return {
        ...response,
        items: records.map((item) => ({
            id: String(item.appId || '').trim(),
            name: item.name || '未命名应用',
            pcUrl: item.pcUrl || '',
            mobileUrl: item.mobileUrl || '',
            deptName: item.deptName || '',
            raw: item,
        })),
        total: Number(response.result?.total || records.length || 0),
    };
}
