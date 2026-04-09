import McpCenter from '@/components/McpCenter';
import { listMcpPackages } from '@/lib/mcpPackages';

export default async function McpDetailPage({ params }) {
    const resolvedParams = await params;
    const initialMcpPackages = listMcpPackages();

    return (
        <McpCenter
            initialMcpId={resolvedParams?.id || null}
            initialMcpPackages={initialMcpPackages}
        />
    );
}
