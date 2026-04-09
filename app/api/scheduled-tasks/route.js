import { NextResponse } from 'next/server';
import {
    listCampusScheduledTasks,
    runCampusScheduledTask,
} from '@/services/scheduledTaskService';

export async function GET() {
    return NextResponse.json({
        ok: true,
        scheduler: {
            status: 'agent_runtime_ready',
            runtimeMode: 'in_app_when_browser_open',
            extensibility: 'shared_firefly_runtime',
        },
        tasks: listCampusScheduledTasks(),
    });
}

export async function POST(request) {
    const body = await request.json().catch(() => ({}));

    try {
        const execution = await runCampusScheduledTask(body.taskId, {
            uid: body.uid || request.headers.get('x-campus-user-uid') || '',
            fid: body.fid || request.headers.get('x-campus-fid') || '',
            lastSnapshotHash: body.lastSnapshotHash || '',
            preferences: body.preferences || {},
        });

        return NextResponse.json({
            ok: true,
            execution,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to execute scheduled task.',
        }, { status: 502 });
    }
}
