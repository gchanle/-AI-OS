import { NextResponse } from 'next/server';
import { runFireflyAgentTask } from '@/services/fireflyAgentService';
import { decideFireflyResponseMode } from '@/lib/fireflyResponseMode';

export async function POST(request) {
    const body = await request.json().catch(() => ({}));
    const question = String(body.question || '').trim();
    const threadKey = String(body.threadKey || 'default').trim();
    const contextSnapshot = body.contextSnapshot || {};
    const responseMode = decideFireflyResponseMode({
        question,
        webSearchEnabled: Boolean(contextSnapshot?.webSearchEnabled),
        deepResearchEnabled: Boolean(contextSnapshot?.deepResearchEnabled),
        runtimeContext: contextSnapshot,
        hasRuntimeRecovery: Boolean(contextSnapshot?.resumeMode),
    });

    try {
        if (!['agent', 'workspace'].includes(responseMode.id)) {
            return NextResponse.json({
                ok: true,
                handled: false,
                responseMode,
                reason: 'response_mode_not_agent',
            });
        }

        const result = await runFireflyAgentTask({
            question,
            threadKey,
            capabilityIds: Array.isArray(body.capabilityIds) ? body.capabilityIds : [],
            contextSnapshot,
            uid: String(body.uid || request.headers.get('x-campus-user-uid') || '').trim(),
            fid: String(body.fid || request.headers.get('x-campus-fid') || '').trim(),
        });

        return NextResponse.json({
            ok: true,
            responseMode,
            ...result,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to run Firefly agent task.',
        }, { status: 500 });
    }
}
