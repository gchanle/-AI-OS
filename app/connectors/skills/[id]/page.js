import SkillCenter from '@/components/SkillCenter';

export default async function ConnectorSkillDetailPage({ params }) {
    const resolvedParams = await params;
    return <SkillCenter initialSkillId={resolvedParams?.id || null} />;
}
