'use client';
import { useEffect, useMemo, useState } from 'react';
import ExternalOpenModeControl from '@/components/ExternalOpenModeControl';
import './ExternalWorkspaceShell.css';

const OPEN_MODE_LABELS = {
    embed: '嵌入查看',
    current: '当前窗口',
    'new-tab': '新标签',
};

export default function ExternalWorkspaceShell({
    accent = 'AI',
    title,
    navItems,
    frameOffset = 64,
    loadingNoun = '页面',
}) {
    const initialTab = useMemo(() => navItems[0], [navItems]);
    const [activeTab, setActiveTab] = useState(initialTab);
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [openMode, setOpenMode] = useState('embed');
    const [showOpenHint, setShowOpenHint] = useState(false);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        const storedMode = localStorage.getItem('external_open_mode');
        const tipSeen = localStorage.getItem('external_open_mode_tip_seen');

        if (storedMode) {
            setOpenMode(storedMode);
        }

        if (!tipSeen) {
            setShowOpenHint(true);
        }
    }, []);

    const persistMode = (mode) => {
        setOpenMode(mode);
        localStorage.setItem('external_open_mode', mode);
    };

    const dismissOpenHint = () => {
        setShowOpenHint(false);
        localStorage.setItem('external_open_mode_tip_seen', '1');
    };

    const handleTabSwitch = (tab) => {
        if (openMode === 'current') {
            window.location.href = tab.url;
            return;
        }

        if (openMode === 'new-tab') {
            window.open(tab.url, '_blank', 'noopener,noreferrer');
            return;
        }

        if (tab.id === activeTab.id) {
            return;
        }

        setIsLoading(true);
        setActiveTab(tab);
    };

    return (
        <div className="external-workspace">
            <aside className={`external-sidebar glass-strong ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                <div className="external-sidebar-header">
                    {!isSidebarCollapsed && (
                        <h2>
                            <span className="external-sidebar-accent">{accent}</span>
                            <span>{title}</span>
                        </h2>
                    )}
                    <div className="external-sidebar-actions">
                        {!isSidebarCollapsed && (
                            <ExternalOpenModeControl
                                value={openMode}
                                onChange={persistMode}
                            />
                        )}
                        <button
                            className="external-toggle-btn"
                            type="button"
                            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                            title={isSidebarCollapsed ? '展开边栏' : '收起边栏'}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <line x1="9" y1="3" x2="9" y2="21" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="external-nav-list">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            className={`external-nav-item ${activeTab.id === item.id ? 'active' : ''}`}
                            type="button"
                            onClick={() => handleTabSwitch(item)}
                            title={isSidebarCollapsed ? item.label : undefined}
                        >
                            <span className="external-nav-icon">{item.icon}</span>
                            {!isSidebarCollapsed && <span>{item.label}</span>}
                        </button>
                    ))}
                </div>
            </aside>

            <section className="external-content">
                {showOpenHint && (
                    <div className="external-open-hint glass-strong">
                        <span>
                            外部系统打开方式已收进左侧顶部设置，当前为“{OPEN_MODE_LABELS[openMode]}”。
                        </span>
                        <button type="button" onClick={dismissOpenHint}>知道了</button>
                    </div>
                )}

                <div className={`external-loading-overlay ${isLoading ? 'visible' : ''}`}>
                    <div className="external-loading-card glass-strong">
                        <span className="external-loading-kicker">系统接入中</span>
                        <strong className="external-loading-title">{activeTab.label}</strong>
                        <p className="external-loading-desc">
                            正在为当前工作区准备 {loadingNoun}，完成后会自动进入。
                        </p>
                        <div className="external-loading-bars" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </div>
                    </div>
                </div>

                <div
                    className="external-iframe-wrapper"
                    style={{ '--external-frame-offset': `${frameOffset}px` }}
                >
                    <iframe
                        key={activeTab.id}
                        src={activeTab.url}
                        className="external-iframe"
                        title={activeTab.label}
                        onLoad={() => setIsLoading(false)}
                    />
                </div>
            </section>
        </div>
    );
}
