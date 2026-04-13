'use client';

import { useState } from 'react';
import CapabilityAccessCenter from '@/components/CapabilityAccessCenter';
import SchoolConsolePanel from '@/components/admin/SchoolConsolePanel';
import AdminRuntimePanel from '@/components/admin/AdminRuntimePanel';
import AdminAgentRuntimePanel from '@/components/admin/AdminAgentRuntimePanel';
import './AdminAccessWorkspace.css';

const accessTabs = [
    {
        id: 'policy',
        label: '学校策略',
        summary: '学校级默认能力、知识源与角色权限',
    },
    {
        id: 'catalog',
        label: '能力接入',
        summary: '连接器、Skill、MCP、CLI 与凭证目录',
    },
    {
        id: 'agent',
        label: 'Agent 配置',
        summary: '模型、工具、记忆、恢复与调度策略',
    },
    {
        id: 'runtime',
        label: '运行观测',
        summary: '面向管理者的运行状态和使用情况',
    },
];

export default function AdminAccessWorkspace({
    initialSkillPackages = [],
    initialMcpPackages = [],
    initialCliPackages = [],
    initialRuntime = null,
    initialTab = 'policy',
}) {
    const resolvedTab = accessTabs.some((item) => item.id === initialTab) ? initialTab : 'policy';
    const [activeTab, setActiveTab] = useState(resolvedTab);
    const currentTab = accessTabs.find((item) => item.id === activeTab) || accessTabs[0];

    return (
        <div className="admin-access-workspace">
            <section className="admin-access-tabs glass">
                <div className="admin-access-tab-row">
                    {accessTabs.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={`admin-access-tab ${activeTab === item.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(item.id)}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <p>{currentTab.summary}</p>
            </section>

            {activeTab === 'policy' ? (
                <div className="admin-access-pane">
                    <SchoolConsolePanel />
                </div>
            ) : null}
            {activeTab === 'catalog' ? (
                <div className="admin-access-pane catalog">
                    <CapabilityAccessCenter
                        initialSkillPackages={initialSkillPackages}
                        initialMcpPackages={initialMcpPackages}
                        initialCliPackages={initialCliPackages}
                    />
                </div>
            ) : null}
            {activeTab === 'agent' ? (
                <div className="admin-access-pane">
                    <AdminAgentRuntimePanel />
                </div>
            ) : null}
            {activeTab === 'runtime' ? (
                <div className="admin-access-pane">
                    <AdminRuntimePanel initialRuntime={initialRuntime} />
                </div>
            ) : null}
        </div>
    );
}
