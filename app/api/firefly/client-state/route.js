import { NextResponse } from 'next/server';
import {
    getFireflyClientState,
    patchFireflyClientState,
} from '@/lib/fireflyClientStateStore';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const uid = String(searchParams.get('uid') || '').trim();
        const fid = String(searchParams.get('fid') || '').trim();
        const state = await getFireflyClientState({ uid, fid });

        return NextResponse.json({
            ok: true,
            state,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to load client state.',
        }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const {
            uid = '',
            fid = '',
            workspacePrefs,
            controlPlanePrefs,
            chatSessions,
        } = await request.json();

        const state = await patchFireflyClientState({
            uid,
            fid,
            workspacePrefs,
            controlPlanePrefs,
            chatSessions,
        });

        return NextResponse.json({
            ok: true,
            state,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to persist client state.',
        }, { status: 500 });
    }
}
