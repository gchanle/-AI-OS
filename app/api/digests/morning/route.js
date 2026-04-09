import { NextResponse } from 'next/server';
import { buildCampusMorningDigest } from '@/services/digestService';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid') || request.headers.get('x-campus-user-uid') || '';
    const fid = searchParams.get('fid') || request.headers.get('x-campus-fid') || '';

    try {
        const digest = await buildCampusMorningDigest({
            uid,
            fid,
        });

        return NextResponse.json({
            ok: true,
            digest,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to build morning digest.',
        }, { status: 502 });
    }
}
