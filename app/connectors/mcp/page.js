import McpCenter from '@/components/McpCenter';
import { listMcpPackages } from '@/lib/mcpPackages';

export const metadata = {
    title: 'MCP 管理 - 超星 AI 校园 OS',
    description: '统一管理 MCP 接入对象的配置、认证、健康检查与治理边界。',
};

export default function McpPage() {
    const initialMcpPackages = listMcpPackages();
    return <McpCenter initialMcpPackages={initialMcpPackages} />;
}
