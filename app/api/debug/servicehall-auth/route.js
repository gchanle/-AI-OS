import { NextResponse } from 'next/server';
import { hasServiceHallMcpAuth } from '@/services/serviceHallMcpService';
import { resolveChaoxingConfig } from '@/lib/chaoxingAuth';

function normalize(value) {
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

function describeAes(value) {
    const normalized = normalize(value);
    return {
        present: Boolean(normalized),
        length: normalized.length,
        bytes: normalized ? Buffer.from(normalized, 'utf8').length : 0,
    };
}

export async function GET() {
    const chaoxing = (() => {
        try {
            const config = resolveChaoxingConfig();
            return {
                ok: true,
                baseUrl: config.baseUrl,
                fidPresent: Boolean(config.fid),
                uidPresent: Boolean(config.uid),
                aes: describeAes(config.aesKey),
            };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : 'resolveChaoxingConfig failed',
            };
        }
    })();

    return NextResponse.json({
        ok: true,
        serviceHall: {
            hasAuth: hasServiceHallMcpAuth(),
            fidPresent: Boolean(normalize(process.env.SERVICE_HALL_MCP_FID)),
            uidPresent: Boolean(normalize(process.env.SERVICE_HALL_MCP_UID)),
            bearerPresent: Boolean(normalize(process.env.SERVICE_HALL_MCP_BEARER_TOKEN)),
            sessionCookiePresent: Boolean(normalize(process.env.SERVICE_HALL_MCP_SESSION_COOKIE)),
            aes: describeAes(process.env.SERVICE_HALL_MCP_AES_KEY),
            tokenEndpoint: normalize(process.env.SERVICE_HALL_MCP_TOKEN_ENDPOINT || ''),
        },
        chaoxing,
    });
}
