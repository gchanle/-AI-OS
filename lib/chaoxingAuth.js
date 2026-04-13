import crypto from 'crypto';

const DEFAULT_BASE_URL = 'https://demo.hall.chaoxing.com';
const DEFAULT_FID = 'anonymous-demo-fid';
const DEFAULT_UID = 'anonymous-demo-user';
const DEFAULT_AES_KEY = 'DEMO_AES_KEY_000';

function trimValue(value) {
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

function resolveServiceHallBaseUrl() {
    const explicitBaseUrl = trimValue(process.env.SERVICE_HALL_MCP_BASE_URL || '');
    if (explicitBaseUrl) {
        return explicitBaseUrl;
    }

    const endpoint = trimValue(process.env.SERVICE_HALL_MCP_TOKEN_ENDPOINT || '');
    if (!endpoint) {
        return '';
    }

    try {
        return new URL(endpoint).origin;
    } catch {
        return '';
    }
}

export function resolveChaoxingConfig(overrides = {}) {
    const baseUrl = trimValue(
        overrides.baseUrl
        || process.env.CHAOXING_BASE_URL
        || process.env.CHAOXING_MESSAGE_BASE_URL
        || resolveServiceHallBaseUrl()
        || DEFAULT_BASE_URL
    );
    const fid = trimValue(
        overrides.fid
        || process.env.CHAOXING_FID
        || process.env.CHAOXING_MESSAGE_FID
        || process.env.SERVICE_HALL_MCP_FID
        || DEFAULT_FID
    );
    const uid = trimValue(
        overrides.uid
        || process.env.CHAOXING_DEFAULT_UID
        || process.env.CHAOXING_MESSAGE_DEFAULT_UID
        || process.env.SERVICE_HALL_MCP_UID
        || DEFAULT_UID
    );
    const aesKey = trimValue(
        overrides.aesKey
        || process.env.CHAOXING_AES_KEY
        || process.env.CHAOXING_MESSAGE_AES_KEY
        || process.env.SERVICE_HALL_MCP_AES_KEY
        || DEFAULT_AES_KEY
    );

    if (!fid) {
        throw new Error('Missing Chaoxing fid.');
    }

    if (!uid) {
        throw new Error('Missing Chaoxing uid.');
    }

    if (aesKey.length !== 16) {
        throw new Error('Chaoxing AES key must be 16 characters.');
    }

    return {
        baseUrl,
        fid,
        uid,
        aesKey,
    };
}

export function buildChaoxingEncryptedPayload({ fid, uid, aesKey }) {
    const now = String(Date.now());
    const payload = JSON.stringify({
        fid,
        uid,
        time: now,
        nonce: now,
    });

    const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(aesKey, 'utf8'), null);
    cipher.setAutoPadding(true);

    return {
        payload,
        enc: Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]).toString('hex').toUpperCase(),
    };
}

export async function fetchChaoxingJson(url, init = {}) {
    const response = await fetch(url, {
        ...init,
        cache: 'no-store',
    });

    const text = await response.text();
    let data = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch (error) {
        throw new Error(`Unexpected response from Chaoxing service: ${text || response.statusText}`);
    }

    return {
        ok: response.ok,
        status: response.status,
        data,
    };
}

export async function createChaoxingToken(overrides = {}) {
    const { baseUrl, fid, uid, aesKey } = resolveChaoxingConfig(overrides);
    const { enc } = buildChaoxingEncryptedPayload({ fid, uid, aesKey });
    const authUrl = new URL('/pedestal/auth/createToken', baseUrl);

    authUrl.searchParams.set('fid', fid);
    authUrl.searchParams.set('uid', uid);
    authUrl.searchParams.set('enc', enc);

    const tokenResponse = await fetchChaoxingJson(authUrl.toString());
    if (!tokenResponse.ok || !tokenResponse.data?.success) {
        const message = tokenResponse.data?.msg || tokenResponse.data?.error || 'Failed to create Chaoxing token.';
        throw new Error(message);
    }

    const token = typeof tokenResponse.data?.data === 'string'
        ? tokenResponse.data.data
        : tokenResponse.data?.data?.token || tokenResponse.data?.data?.accessToken || tokenResponse.data?.token || '';

    if (!token) {
        throw new Error('Chaoxing token response did not include a token.');
    }

    return {
        baseUrl,
        fid,
        uid,
        token,
    };
}
