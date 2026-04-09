import { NextResponse } from 'next/server';
import {
    getFireflyRuntimeThread,
    listFireflyRuntimeState,
} from '@/lib/fireflyRuntimeStore';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const threadKey = String(searchParams.get('threadKey') || '').trim();

        if (threadKey) {
            const thread = await getFireflyRuntimeThread(threadKey);
            return NextResponse.json({
                ok: true,
                thread,
            });
        }

        const state = await listFireflyRuntimeState();
        return NextResponse.json({
            ok: true,
            ...state,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to load Firefly runtime state.',
        }, { status: 500 });
    }
}
