import { NextResponse } from 'next/server';
import { getCampusUnreadMessages } from '@/services/messageService';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid') || request.headers.get('x-campus-user-uid') || '';
    const fid = searchParams.get('fid') || request.headers.get('x-campus-fid') || '';

    try {
        const result = await getCampusUnreadMessages({
            uid,
            fid,
        });

        return NextResponse.json({
            ok: true,
            sourceId: 'study',
            ...result,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            sourceId: 'study',
            error: error instanceof Error ? error.message : 'Failed to sync study unread messages.',
        }, { status: 502 });
    }
}
