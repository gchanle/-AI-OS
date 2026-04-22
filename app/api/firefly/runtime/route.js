import { NextResponse } from 'next/server';
import {
    getFireflyRuntimeThread,
    listFireflyRuntimeState,
} from '@/lib/fireflyRuntimeStore';
import { getFireflyThreadState } from '@/lib/fireflyThreadStateStore';
import { listFireflySubagentRuns } from '@/lib/fireflySubagentStore';
import { listFireflyThreadWorkspace } from '@/lib/fireflyWorkspaceService';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const threadKey = String(searchParams.get('threadKey') || '').trim();

        if (threadKey) {
            const thread = await getFireflyRuntimeThread(threadKey);
            const threadState = await getFireflyThreadState(threadKey);
            const subagents = await listFireflySubagentRuns(threadKey);
            const workspace = await listFireflyThreadWorkspace(threadKey);
            return NextResponse.json({
                ok: true,
                thread,
                threadState,
                subagents,
                workspace,
            });
        }

        const state = await listFireflyRuntimeState();
        const subagents = await listFireflySubagentRuns();
        return NextResponse.json({
            ok: true,
            ...state,
            subagents: subagents.slice(0, 120),
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to load Firefly runtime state.',
        }, { status: 500 });
    }
}
