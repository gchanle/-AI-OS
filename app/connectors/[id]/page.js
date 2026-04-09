import ConnectorCenter from '@/components/ConnectorCenter';

export default async function ConnectorDetailPage({ params }) {
    const resolvedParams = await params;
    return <ConnectorCenter initialConnectorId={resolvedParams?.id || null} />;
}
