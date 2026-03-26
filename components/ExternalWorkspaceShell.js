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
    headerControl = null,
    storageKey = null,
    navItems,
    frameOffset = 64,
    loadingNoun = '页面',
}) {
    const initialTab = useMemo(() => navItems[0], [navItems]);
    const loadedTabsStorageKey = useMemo(() => `external_loaded_tabs:${storageKey || title}`, [storageKey, title]);
    const [activeTab, setActiveTab] = useState(initialTab);
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [openMode, setOpenMode] = useState('embed');
    const [showOpenHint, setShowOpenHint] = useState(false);
    const [loadedTabIds, setLoadedTabIds] = useState([]);
    const [dismissedLoadingIds, setDismissedLoadingIds] = useState([]);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        const storedMode = localStorage.getItem('external_open_mode');
        const tipSeen = localStorage.getItem('external_open_mode_tip_seen');
        const storedLoadedTabs = sessionStorage.getItem(loadedTabsStorageKey);

        if (storedMode) {
            setOpenMode(storedMode);
        }

        if (!tipSeen) {
            setShowOpenHint(true);
        }

        if (storedLoadedTabs) {
            try {
                const parsed = JSON.parse(storedLoadedTabs);
                if (Array.isArray(parsed)) {
                    setLoadedTabIds(parsed);
                }
            } catch {
                sessionStorage.removeItem(loadedTabsStorageKey);
            }
        }
    }, [loadedTabsStorageKey]);

    useEffect(() => {
        if (!activeTab) {
            return;
        }

        setIsLoading(!loadedTabIds.includes(activeTab.id));
    }, [activeTab, loadedTabIds]);

    const markTabLoaded = (tabId) => {
        setLoadedTabIds((prev) => {
            if (prev.includes(tabId)) {
                return prev;
            }

            const next = [...prev, tabId];
            sessionStorage.setItem(loadedTabsStorageKey, JSON.stringify(next));
            return next;
        });
    };

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

        setDismissedLoadingIds((prev) => prev.filter((id) => id !== tab.id));
        setIsLoading(!loadedTabIds.includes(tab.id));
        setActiveTab(tab);
    };

    const dismissLoadingBanner = () => {
        if (!activeTab) {
            return;
        }

        setDismissedLoadingIds((prev) => (
            prev.includes(activeTab.id) ? prev : [...prev, activeTab.id]
        ));
    };

    const showLoadingBanner = isLoading && activeTab && !dismissedLoadingIds.includes(activeTab.id);

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
                    {!isSidebarCollapsed && headerControl && (
                        <div className="external-header-inline-control">
                            {headerControl}
                        </div>
                    )}
                    <div className="external-sidebar-actions">
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
                {!showOpenHint && (
                    <div className="external-floating-controls">
                        <ExternalOpenModeControl
                            value={openMode}
                            onChange={persistMode}
                        />
                    </div>
                )}

                {showOpenHint && (
                    <div className="external-open-hint glass-strong">
                        <span>
                            外部系统打开方式已收进右上角齿轮，当前为“{OPEN_MODE_LABELS[openMode]}”。
                        </span>
                        <button type="button" onClick={dismissOpenHint}>知道了</button>
                    </div>
                )}

                {showLoadingBanner && (
                    <div className="external-loading-banner glass-strong">
                        <div className="external-loading-copy">
                            <span className="external-loading-kicker">系统接入中</span>
                            <strong className="external-loading-inline-title">{activeTab.label}</strong>
                            <p className="external-loading-desc">
                                正在为当前工作区准备 {loadingNoun}，页面会在后台继续加载。
                            </p>
                        </div>
                        <div className="external-loading-bars external-loading-bars-inline" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </div>
                        <button type="button" className="external-loading-close" onClick={dismissLoadingBanner}>
                            关闭
                        </button>
                    </div>
                )}

                <div
                    className="external-iframe-wrapper"
                    style={{ '--external-frame-offset': `${frameOffset}px` }}
                >
                    <iframe
                        key={activeTab.id}
                        src={activeTab.url}
                        className="external-iframe"
                        title={activeTab.label}
                        onLoad={() => {
                            setIsLoading(false);
                            markTabLoaded(activeTab.id);
                            setDismissedLoadingIds((prev) => prev.filter((id) => id !== activeTab.id));
                        }}
                    />
                </div>
            </section>
        </div>
    );
}
