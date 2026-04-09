import { NextResponse } from 'next/server';
import {
    buildAgentMaturitySnapshot,
    getAdminAgentRuntimeStorageMeta,
    loadAdminAgentRuntimeConfig,
    saveAdminAgentRuntimeConfig,
} from '@/lib/adminAgentRuntimeStore';
import {
    buildFireflyMemoryMetrics,
    getFireflyMemoryStorageMeta,
} from '@/lib/fireflyMemoryStore';

export async function GET() {
    try {
        const config = loadAdminAgentRuntimeConfig();
        const memory = await buildFireflyMemoryMetrics();
        return NextResponse.json({
            ok: true,
            config,
            maturity: buildAgentMaturitySnapshot(config),
            storage: getAdminAgentRuntimeStorageMeta(),
            memory,
            memoryStorage: getFireflyMemoryStorageMeta(),
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to load agent runtime config.',
        }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json().catch(() => ({}));
        const config = saveAdminAgentRuntimeConfig(body?.config || {});
        const memory = await buildFireflyMemoryMetrics();
        return NextResponse.json({
            ok: true,
            config,
            maturity: buildAgentMaturitySnapshot(config),
            storage: getAdminAgentRuntimeStorageMeta(),
            memory,
            memoryStorage: getFireflyMemoryStorageMeta(),
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to save agent runtime config.',
        }, { status: 500 });
    }
}
