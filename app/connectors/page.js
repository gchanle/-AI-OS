import CapabilityAccessCenter from '@/components/CapabilityAccessCenter';
import { listCliPackages } from '@/lib/cliPackages';
import { listMcpPackages } from '@/lib/mcpPackages';
import { listSkillPackages } from '@/lib/skillPackages';

export const metadata = {
    title: '能力接入中心 - 超星 AI 校园 OS',
    description: '统一管理连接器、Skills、MCP、CLI 与凭证治理。',
};

export default function ConnectorsPage() {
    const initialSkillPackages = listSkillPackages();
    const initialMcpPackages = listMcpPackages();
    const initialCliPackages = listCliPackages();

    return (
        <CapabilityAccessCenter
            initialSkillPackages={initialSkillPackages}
            initialMcpPackages={initialMcpPackages}
            initialCliPackages={initialCliPackages}
        />
    );
}
