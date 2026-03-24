'use client';
import { useState } from 'react';
import './services.css';

// 办事大厅外置导航映射表
const serviceNavItems = [
    { id: 'home', label: '首页', url: 'https://demo.hall.chaoxing.com/home', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg> },
    { id: 'news', label: '资讯中心', url: 'https://demo.hall.chaoxing.com/news', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2H2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/></svg> },
    { id: 'service-hall', label: '服务大厅', url: 'https://demo.hall.chaoxing.com/service-hall', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> },
    { id: 'business', label: '业务系统', url: 'https://demo.hall.chaoxing.com/business-system', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
    { id: 'schedule', label: '日程中心', url: 'https://demo.hall.chaoxing.com/schedule-center', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { id: 'profile', label: '个人中心', url: 'https://demo.hall.chaoxing.com/schedule-center', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
];

export default function ServicesPage() {
    const [activeTab, setActiveTab] = useState(serviceNavItems[0]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const handleTabSwitch = (tab) => {
        if (tab.id === activeTab.id) return;
        setIsLoading(true);
        setActiveTab(tab);
    };

    return (
        <div className="services-layout">
            
            {/* 左侧原生次级导航边栏 */}
            <div className={`services-sidebar glass-strong ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                <div className="ss-header">
                    {!isSidebarCollapsed && <h2><span className="ai-accent">AI</span> 办事大厅</h2>}
                    <button 
                        className="ss-toggle-btn" 
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
                        title={isSidebarCollapsed ? "展开边栏" : "收起边栏"}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                    </button>
                </div>
                <div className="ss-nav-list">
                    {serviceNavItems.map(item => (
                        <button 
                            key={item.id}
                            className={`ss-nav-item ${activeTab.id === item.id ? 'active' : ''}`}
                            onClick={() => handleTabSwitch(item)}
                            title={isSidebarCollapsed ? item.label : undefined}
                        >
                            <span className="ss-icon">{item.icon}</span>
                            {!isSidebarCollapsed && <span>{item.label}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* 右侧主内容区 (套壳被视觉裁切的 iframe) */}
            <div className="services-content">
                {isLoading && (
                    <div className="services-loading-overlay">
                        <div className="spinner"></div>
                        <p>正在安全接入 {activeTab.label} 数据...</p>
                    </div>
                )}
                
                <div className="iframe-wrapper">
                    <iframe 
                        key={activeTab.id}
                        src={activeTab.url} 
                        className="services-iframe"
                        title={activeTab.label}
                        onLoad={() => setIsLoading(false)}
                    />
                </div>
            </div>
        </div>
    );
}
