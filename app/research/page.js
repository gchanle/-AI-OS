'use client';
import { useState } from 'react';
import './research.css';

// 科研导航映射表
const researchNavItems = [
    { id: 'home', label: '科学探索', url: 'https://kexuedaohang.libsp.net/#/home', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg> },
    { id: 'researcher', label: 'AI研究员', url: 'https://kexuedaohang.libsp.net/#/aiResearcher', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    { id: 'scientific', label: '学术追踪', url: 'https://kexuedaohang.libsp.net/#/scientific', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
    { id: 'kb', label: 'AI知识库', url: 'https://kexuedaohang.libsp.net/#/aiKnowledgeBase', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> },
    { id: 'course', label: '课程', url: 'https://kexuedaohang.libsp.net/#/outAgent', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
    { id: 'apps', label: 'AI应用', url: 'https://kexuedaohang.libsp.net/#/aiApplications', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
    { id: 'starlink', label: '知识星链', url: 'https://kexuedaohang.libsp.net/#/knowledgeBase', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> },
];

export default function ResearchPage() {
    const [activeTab, setActiveTab] = useState(researchNavItems[0]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const handleTabSwitch = (tab) => {
        if (tab.id === activeTab.id) return;
        setIsLoading(true);
        setActiveTab(tab);
    };

    return (
        <div className="research-layout">
            
            {/* 左侧原生次级导航边栏 */}
            <div className={`research-sidebar glass-strong ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                <div className="research-sidebar-header">
                    {!isSidebarCollapsed && <h2><span className="research-ai-accent">AI</span> 科研大厅</h2>}
                    <button 
                        className="research-toggle-btn" 
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
                        title={isSidebarCollapsed ? "展开边栏" : "收起边栏"}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                    </button>
                </div>
                <div className="research-nav-list">
                    {researchNavItems.map(item => (
                        <button 
                            key={item.id}
                            className={`research-nav-item ${activeTab.id === item.id ? 'active' : ''}`}
                            onClick={() => handleTabSwitch(item)}
                            title={isSidebarCollapsed ? item.label : undefined}
                        >
                            <span className="research-nav-icon">{item.icon}</span>
                            {!isSidebarCollapsed && <span>{item.label}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* 右侧主内容区 (套壳被视觉裁切的 iframe) */}
            <div className="research-content">
                {isLoading && (
                    <div className="research-loading-overlay">
                        <div className="spinner"></div>
                        <p>正在安全接入 {activeTab.label} 数据...</p>
                    </div>
                )}
                
                <div className="iframe-wrapper">
                    <iframe 
                        key={activeTab.id} // 修改key强制重新加载从而触发onLoad
                        src={activeTab.url} 
                        className="research-iframe"
                        title={activeTab.label}
                        onLoad={() => setIsLoading(false)}
                    />
                </div>
            </div>
        </div>
    );
}
