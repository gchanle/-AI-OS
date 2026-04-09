import AdminAccessWorkspace from '@/components/admin/AdminAccessWorkspace';
import { listCliPackages } from '@/lib/cliPackages';
import { listMcpPackages } from '@/lib/mcpPackages';
import { listSkillPackages } from '@/lib/skillPackages';
import { listFireflyRuntimeState } from '@/lib/fireflyRuntimeStore';

export const dynamic = 'force-dynamic';

export default async function AdminAccessPage({ searchParams }) {
    const resolvedSearchParams = await searchParams;
    const initialSkillPackages = listSkillPackages();
    const initialMcpPackages = listMcpPackages();
    const initialCliPackages = listCliPackages();
    const initialRuntime = await listFireflyRuntimeState();
    const requestedTab = String(resolvedSearchParams?.tab || 'policy').trim();
    const initialTab = ['policy', 'catalog', 'agent', 'runtime'].includes(requestedTab) ? requestedTab : 'policy';

    return (
        <AdminAccessWorkspace
            initialSkillPackages={initialSkillPackages}
            initialMcpPackages={initialMcpPackages}
            initialCliPackages={initialCliPackages}
            initialRuntime={initialRuntime}
            initialTab={initialTab}
        />
    );
}
