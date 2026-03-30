'use client';
import { useEffect, useMemo, useState } from 'react';
import ExternalOpenModeControl from '@/components/ExternalOpenModeControl';
import FireflySideDrawer from '@/components/FireflySideDrawer';
import { buildFireflyHandoffHref } from '@/data/campusPlatform';
import './ExternalWorkspaceShell.css';

const OPEN_MODE_LABELS = {
    embed: '嵌入查看',
    current: '当前窗口',
    'new-tab': '新标签',
};

function buildExternalContextMessage(snapshot, question) {
    return [
        '你现在在 AI 校园 OS 的右侧萤火虫协同抽屉里工作，请只围绕当前外部工作区回答。',
        `当前模块：${snapshot.workspaceTitle}`,
        `当前页面：${snapshot.activeTabLabel}`,
        snapshot.pageUrl ? `页面链接：${snapshot.pageUrl}` : '',
        snapshot.openModeLabel ? `打开方式：${snapshot.openModeLabel}` : '',
        `用户问题：${question}`,
        '请优先给出适合当前入口的理解、操作路径、风险提醒或下一步建议，不要假装已经读取到 iframe 内的实时页面细节。',
    ].filter(Boolean).join('\n');
}

function buildExternalFallbackReply(snapshot, question) {
    if (question.includes('怎么') || question.includes('路径') || question.includes('步骤')) {
        return `如果先按更稳妥的方式推进，你可以把当前入口“${snapshot.activeTabLabel}”理解成一个功能入口，再按“先确认目标、再进入对应栏目、最后检查结果”的顺序操作。你也可以继续告诉我你想完成什么任务，我帮你把路径再压缩成更具体的步骤。`;
    }

    if (question.includes('总结') || question.includes('用途') || question.includes('干什么')) {
        return `当前这个工作区更适合做“${snapshot.workspaceTitle}”相关任务，而你现在停留的是“${snapshot.activeTabLabel}”。如果先做一句话总结，就是先明确这里主要解决什么事，再决定是否继续停留在当前页，还是切到更贴近目标的子入口。`;
    }

    if (question.includes('下一步') || question.includes('待办')) {
        return `基于当前入口，我建议的下一步是：先确认你要办的事情是否真的应该在“${snapshot.activeTabLabel}”里完成；如果是，就继续进入该入口的核心内容区；如果不是，就告诉我目标，我帮你反推应该切到哪个栏目。`;
    }

    return `我会先把问题收回到当前工作区来理解：你现在位于“${snapshot.workspaceTitle} / ${snapshot.activeTabLabel}”。更高效的问法通常是“这个入口适合干什么”“我现在要做某件事应该点哪里”或者“帮我把当前页面转成一个操作清单”。`;
}

export default function ExternalWorkspaceShell({
    accent = 'AI',
    title,
    headerControl = null,
    sidebarFooter = null,
    storageKey = null,
    navItems = [],
    showSidebar = true,
    showNav = true,
    frameOffset = 64,
    loadingNoun = '页面',
    extraControlSections = [],
    capabilityIds = [],
}) {
    const initialTab = useMemo(() => navItems[0] || null, [navItems]);
    const loadedTabsStorageKey = useMemo(() => `external_loaded_tabs:${storageKey || title}`, [storageKey, title]);
    const drawerStorageNamespace = useMemo(() => `external_drawer:${storageKey || title}`, [storageKey, title]);
    const historyOrigin = useMemo(() => `external-shell:${storageKey || title}`, [storageKey, title]);
    const [activeTab, setActiveTab] = useState(initialTab);
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [openMode, setOpenMode] = useState('embed');
    const [showOpenHint, setShowOpenHint] = useState(false);
    const [loadedTabIds, setLoadedTabIds] = useState([]);
    const [dismissedLoadingIds, setDismissedLoadingIds] = useState([]);
    const [isFireflyDrawerOpen, setIsFireflyDrawerOpen] = useState(false);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        setIsFireflyDrawerOpen(false);
    }, [storageKey, title]);

    useEffect(() => {
        setIsFireflyDrawerOpen(false);
    }, [activeTab?.id]);

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

        if (tab.id === activeTab?.id) {
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
    const navItemMap = useMemo(
        () => Object.fromEntries(navItems.map((item) => [item.id, item])),
        [navItems]
    );
    const drawerContextSnapshot = useMemo(() => ({
        workspaceTitle: title,
        activeTabLabel: activeTab?.label || title,
        pageUrl: activeTab?.url || '',
        openModeLabel: OPEN_MODE_LABELS[openMode],
    }), [activeTab, openMode, title]);
    const drawerContextChips = [
        title,
        activeTab?.label || null,
    ].filter(Boolean);
    const drawerShortcuts = [
        {
            id: 'understand-entry',
            label: '理解这个入口',
            prompt: `请帮我说明“${activeTab?.label || title}”这个入口主要解决什么问题，适合谁使用。`,
        },
        {
            id: 'next-steps',
            label: '给我操作路径',
            prompt: `如果我想在“${activeTab?.label || title}”里完成一项任务，请给我一个清晰的操作路径。`,
        },
        {
            id: 'taskify',
            label: '转成待办',
            prompt: `请把当前“${title} / ${activeTab?.label || title}”理解成一个工作面，并帮我整理成 3 条可执行待办。`,
        },
    ];
    const drawerSecondaryAction = {
        href: buildFireflyHandoffHref(
            `请基于我当前在“${title} / ${activeTab?.label || title}”的页面上下文，继续帮我推进任务。`,
            capabilityIds
        ),
        label: '完整工作台',
    };

    return (
        <div className={`external-workspace ${showSidebar ? '' : 'sidebar-hidden'}`}>
            {showSidebar && (
                <aside className={`external-sidebar glass-strong ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                    <div className="external-sidebar-header">
                        {!isSidebarCollapsed && (
                            <div className="external-sidebar-header-copy">
                                <h2>
                                    <span className="external-sidebar-accent">{accent}</span>
                                    <span>{title}</span>
                                </h2>
                                {headerControl && (
                                    <div className="external-header-inline-control">
                                        {headerControl}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="external-sidebar-actions">
                            <button
                                className="external-toggle-btn"
                                type="button"
                                onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                                title={isSidebarCollapsed ? '展开边栏' : '收起边栏'}
                            >
                                {isSidebarCollapsed ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M9 6l6 6-6 6" />
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M15 6l-6 6 6 6" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {showNav && navItems.length > 0 && (
                        <div className="external-nav-list">
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    className={`external-nav-item ${activeTab?.id === item.id ? 'active' : ''}`}
                                    type="button"
                                    onClick={() => handleTabSwitch(item)}
                                    title={isSidebarCollapsed ? item.label : undefined}
                                >
                                    <span className="external-nav-icon">{item.icon}</span>
                                    {!isSidebarCollapsed && <span>{item.label}</span>}
                                </button>
                            ))}
                        </div>
                    )}

                    {sidebarFooter && !isSidebarCollapsed && (
                        <div className="external-sidebar-footer">
                            {sidebarFooter}
                        </div>
                    )}
                </aside>
            )}

            <section className="external-content">
                {!showOpenHint && (
                    <div className="external-floating-controls">
                        <ExternalOpenModeControl
                            value={openMode}
                            onChange={persistMode}
                            extraSections={extraControlSections}
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

                {showLoadingBanner && activeTab && (
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
                    {activeTab && (
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
                    )}
                </div>

                <FireflySideDrawer
                    isOpen={isFireflyDrawerOpen}
                    onOpenChange={setIsFireflyDrawerOpen}
                    storageNamespace={drawerStorageNamespace}
                    threadKey={activeTab?.id || 'default'}
                    historyOrigin={historyOrigin}
                    title="萤火虫"
                    launcherLabel="萤火虫"
                    launcherHint={activeTab?.label || '页面协同'}
                    description={`围绕当前“${title} / ${activeTab?.label || title}”继续提问，我会优先帮你理解入口、整理路径或推进下一步。`}
                    emptyTitle="从当前页面继续问"
                    emptyDescription="这里更像一个贴身协同抽屉，不打断你当前工作区，也能把当前入口快速变成可执行建议。"
                    placeholder={`围绕“${activeTab?.label || title}”提问，例如：这个入口最适合先做什么？`}
                    shortcuts={drawerShortcuts}
                    contextChips={drawerContextChips}
                    capabilityIds={capabilityIds}
                    contextSnapshot={drawerContextSnapshot}
                    buildContextMessage={buildExternalContextMessage}
                    buildFallbackReply={buildExternalFallbackReply}
                    secondaryAction={drawerSecondaryAction}
                    buildSession={({ threadKey: currentThreadKey, thread, modelId, historyOrigin: origin }) => {
                        if (!thread.length) {
                            return null;
                        }

                        const tab = navItemMap[currentThreadKey];
                        const updatedAt = thread[thread.length - 1]?.time || new Date().toISOString();

                        return {
                            id: `external-${storageKey || title}-${currentThreadKey}`,
                            title: `${title} · ${tab?.label || currentThreadKey}`,
                            date: new Date(updatedAt).toLocaleDateString('zh-CN'),
                            updatedAt,
                            messages: thread.map((item) => ({
                                role: item.role === 'user' ? 'user' : 'ai',
                                content: item.content,
                                time: item.time,
                                modelId: item.modelId || modelId,
                            })),
                            meta: {
                                capabilityIds,
                                modelId,
                                webSearchEnabled: false,
                                deepResearchEnabled: false,
                                origin,
                                surface: 'external-workspace',
                                workspaceTitle: title,
                                tabId: currentThreadKey,
                                tabLabel: tab?.label || currentThreadKey,
                            },
                        };
                    }}
                />
            </section>
        </div>
    );
}
