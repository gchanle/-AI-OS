import { NextResponse } from 'next/server';
import { readFireflyThreadArtifact } from '@/lib/fireflyThreadStateStore';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const threadKey = String(searchParams.get('threadKey') || '').trim();
        const fileName = String(searchParams.get('file') || '').trim();

        if (!threadKey || !fileName) {
            return NextResponse.json({
                ok: false,
                error: 'Missing threadKey or file.',
            }, { status: 400 });
        }

        const artifact = await readFireflyThreadArtifact({
            threadKey,
            fileName,
        });

        return new NextResponse(artifact.content, {
            status: 200,
            headers: {
                'Content-Type': artifact.mimeType,
                'Content-Disposition': `inline; filename="${encodeURIComponent(artifact.fileName)}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to read artifact.',
        }, { status: 404 });
    }
}
