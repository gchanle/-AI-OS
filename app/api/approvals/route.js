import { NextResponse } from 'next/server';
import { getCampusApprovals } from '@/services/approvalService';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid') || request.headers.get('x-campus-user-uid') || '';
    const fid = searchParams.get('fid') || request.headers.get('x-campus-fid') || '';

    try {
        const result = await getCampusApprovals({
            uid,
            fid,
        });

        return NextResponse.json({
            ok: true,
            sourceId: 'services',
            ...result,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            sourceId: 'services',
            error: error instanceof Error ? error.message : 'Failed to sync approval data.',
        });
    }
}
