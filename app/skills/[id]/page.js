import { redirect } from 'next/navigation';

export default async function SkillDetailPage({ params }) {
    const resolvedParams = await params;
    redirect(`/connectors/skills/${resolvedParams?.id || ''}`);
}
