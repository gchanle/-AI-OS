import { NextResponse } from 'next/server';
import { listCliPackages, upsertCliPackage } from '@/lib/cliPackages';

export async function GET() {
    return NextResponse.json({
        packages: listCliPackages(),
    });
}

export async function POST(request) {
    try {
        const payload = await request.json();
        const nextPackage = upsertCliPackage(payload || {});

        return NextResponse.json({
            ok: true,
            package: nextPackage,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to upsert CLI package',
        }, { status: 500 });
    }
}
