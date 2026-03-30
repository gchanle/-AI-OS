import ConnectorVaultCenter from '@/components/ConnectorVaultCenter';

export const metadata = {
    title: '凭证保险库 - 超星 AI 校园 OS',
    description: '统一管理连接器授权路径、会话、令牌与密码兜底。',
};

export default function ConnectorVaultPage() {
    return <ConnectorVaultCenter />;
}
