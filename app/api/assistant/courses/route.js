import { NextResponse } from 'next/server';
import { fetchCourseCollections } from '@/lib/chaoxingCourses';

export async function GET() {
    try {
        const result = await fetchCourseCollections();
        return NextResponse.json({
            ok: true,
            ...result,
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            error: error instanceof Error ? error.message : '课程接口请求失败。',
            learned: [],
            taught: [],
        }, { status: 502 });
    }
}
