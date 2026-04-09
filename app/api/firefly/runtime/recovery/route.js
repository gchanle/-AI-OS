import { NextResponse } from 'next/server';
import { getFireflyRuntimeRecovery } from '@/lib/fireflyRuntimeStore';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const threadKey = String(searchParams.get('threadKey') || '').trim();

    if (!threadKey) {
        return NextResponse.json({
            ok: false,
            error: 'threadKey is required.',
        }, { status: 400 });
    }

    try {
        const recovery = await getFireflyRuntimeRecovery(threadKey);
        return NextResponse.json({
            ok: true,
            ...recovery,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to load Firefly runtime recovery.',
        }, { status: 500 });
    }
}
