import { NextResponse } from 'next/server';
import { readFireflyThreadWorkspaceFile } from '@/lib/fireflyWorkspaceService';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const threadKey = String(searchParams.get('threadKey') || '').trim();
        const zone = String(searchParams.get('zone') || 'workspace').trim();
        const relativePath = String(searchParams.get('path') || '').trim();

        if (!threadKey || !relativePath) {
            return NextResponse.json({
                ok: false,
                error: 'Missing threadKey or path.',
            }, { status: 400 });
        }

        const file = await readFireflyThreadWorkspaceFile({
            threadKey,
            zone,
            relativePath,
        });

        return new NextResponse(file.content, {
            status: 200,
            headers: {
                'Content-Type': file.mimeType,
                'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to read workspace file.',
        }, { status: 404 });
    }
}
