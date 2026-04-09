import { NextResponse } from 'next/server';
import { runFireflyAgentTask } from '@/services/fireflyAgentService';

export async function POST(request) {
    const body = await request.json().catch(() => ({}));

    try {
        const result = await runFireflyAgentTask({
            question: String(body.question || '').trim(),
            threadKey: String(body.threadKey || 'default').trim(),
            capabilityIds: Array.isArray(body.capabilityIds) ? body.capabilityIds : [],
            contextSnapshot: body.contextSnapshot || {},
            uid: String(body.uid || request.headers.get('x-campus-user-uid') || '').trim(),
            fid: String(body.fid || request.headers.get('x-campus-fid') || '').trim(),
        });

        return NextResponse.json({
            ok: true,
            ...result,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to run Firefly agent task.',
        }, { status: 500 });
    }
}
