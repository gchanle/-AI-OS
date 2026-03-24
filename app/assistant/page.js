'use client';
import { useState } from 'react';
import './assistant.css';

const assistantNavItems = [
    { id: 'learned', label: '我学的课', url: 'https://mooc1-1.chaoxing.com/visit/interaction', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> },
    { id: 'taught', label: '我教的课', url: 'https://mooc1-1.chaoxing.com/visit/interaction', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
];

export default function AssistantPage() {
    const [activeTab, setActiveTab] = useState(assistantNavItems[0]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const handleTabSwitch = (tab) => {
        if (tab.id === activeTab.id) return;
        setIsLoading(true);
        setActiveTab(tab);
    };

    return (
        <div className="assistant-layout">
            
            {/* 左侧原生次级导航边栏 */}
            <div className={`assistant-sidebar glass-strong ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                <div className="as-header">
                    {!isSidebarCollapsed && <h2><span className="ai-accent">AI</span> 助教中心</h2>}
                    <button 
                        className="as-toggle-btn" 
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
                        title={isSidebarCollapsed ? "展开边栏" : "收起边栏"}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                    </button>
                </div>
                <div className="as-nav-list">
                    {assistantNavItems.map(item => (
                        <button 
                            key={item.id}
                            className={`as-nav-item ${activeTab.id === item.id ? 'active' : ''}`}
                            onClick={() => handleTabSwitch(item)}
                            title={isSidebarCollapsed ? item.label : undefined}
                        >
                            <span className="as-icon">{item.icon}</span>
                            {!isSidebarCollapsed && <span>{item.label}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* 右侧主内容区 */}
            <div className="assistant-content">
                {isLoading && (
                    <div className="assistant-loading-overlay">
                        <div className="spinner"></div>
                        <p>正在安全接入 {activeTab.label}...</p>
                    </div>
                )}
                
                <div className="iframe-wrapper">
                    <iframe 
                        key={activeTab.id}
                        src={activeTab.url} 
                        className="assistant-iframe"
                        title={activeTab.label}
                        onLoad={() => setIsLoading(false)}
                    />
                </div>
            </div>
        </div>
    );
}
