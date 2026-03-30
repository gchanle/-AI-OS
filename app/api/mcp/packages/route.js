import { NextResponse } from 'next/server';
import { listMcpPackages, upsertMcpPackage } from '@/lib/mcpPackages';

export async function GET() {
    return NextResponse.json({
        packages: listMcpPackages(),
    });
}

export async function POST(request) {
    try {
        const payload = await request.json();
        const nextPackage = upsertMcpPackage(payload || {});

        return NextResponse.json({
            ok: true,
            package: nextPackage,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to upsert MCP package',
        }, { status: 500 });
    }
}
