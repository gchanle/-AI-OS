'use client';
import ExternalWorkspaceShell from '@/components/ExternalWorkspaceShell';
import Link from 'next/link';

const agentNavItems = [
    { id: 'agents', label: '智能体管理', url: 'https://demo1.openai.chaoxing.com/personal/own/agent', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></svg> },
    { id: 'knowledge', label: '知识库管理', url: 'https://demo1.openai.chaoxing.com/personal/own/knowledge', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg> },
    { id: 'team', label: '团队管理', url: 'https://demo1.openai.chaoxing.com/personal/team/myTeam', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
    { id: 'market', label: '单位智能体市场', url: 'https://demo1.openai.chaoxing.com/personal/team/myTeam', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2l1.5 3H21l-2 7H8.5L7 19H4" /><circle cx="10" cy="21" r="1" /><circle cx="18" cy="21" r="1" /></svg> },
];

export default function AgentBuilderPage() {
    return (
        <ExternalWorkspaceShell
            accent="AI"
            title="能力中心"
            navItems={agentNavItems}
            loadingNoun="智能体页面"
            capabilityIds={['agents']}
            sidebarFooter={(
                <div className="external-sidebar-card">
                    <strong>能力治理台</strong>
                    <p>连接器、Skills、MCP、CLI 和凭证保险库都收进统一的能力接入中心，不再分散成多个并列入口。</p>
                    <div className="external-sidebar-link-group">
                        <Link href="/connectors" className="external-sidebar-link">
                            打开能力接入中心
                        </Link>
                    </div>
                </div>
            )}
        />
    );
}
