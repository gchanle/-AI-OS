import { NextResponse } from 'next/server';
import { listSkillPackages, upsertSkillPackage } from '@/lib/skillPackages';

export async function GET() {
    return NextResponse.json({
        packages: listSkillPackages(),
    });
}

export async function POST(request) {
    try {
        const payload = await request.json();
        const nextPackage = upsertSkillPackage(payload || {});

        return NextResponse.json({
            ok: true,
            package: nextPackage,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : 'Failed to upsert skill package',
        }, { status: 500 });
    }
}
