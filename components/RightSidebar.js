'use client';
import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import {
    todayCourses,
    mockNews,
    mockSchedules,
    mockFavoriteServices,
    mockRecentServices
} from '@/data/mock';
import {
    loadApprovalCenterState,
    subscribeApprovalCenter,
    syncCampusApprovals,
} from '@/data/approvalCenter';
import {
    formatMessageTime,
    loadMessageCenterItems,
    subscribeMessageCenter,
} from '@/data/messageCenter';
import {
    ensureCampusUserProfile,
    subscribeCampusUserProfile,
} from '@/data/userProfile';
import './RightSidebar.css';

const RIGHT_SIDEBAR_COLLAPSE_KEY = 'campus_right_sidebar_collapsed';

const icons = {
    info: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>,
    todo: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
    service: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
    calendar: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
    clock: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 15 15" /></svg>,
    pin: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
    bell: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
    message: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
    news: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1m2 13a2 2 0 0 1-2-2V7m2 13a2 2 0 0 0 2-2V9.5a2.5 2.5 0 0 0-2.5-2.5H15" /></svg>,
    favorite: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
    recent: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" /></svg>,
    collapseArrow: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>,
    expandArrow: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>,
};

const getServiceIcon = (type) => {
    switch (type) {
        case 'exam': return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
        case 'calendar': return icons.calendar;
        case 'library': return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
        case 'card': return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>;
        case 'repair': return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>;
        case 'bus': return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
        case 'food': return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>;
        case 'medical': return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
        default: return icons.service;
    }
};

export default function RightSidebar() {
    const [activeTab, setActiveTab] = useState('todo');
    const [approvalTab, setApprovalTab] = useState('pending');
    const [collapsed, setCollapsed] = useState(false);
    const [liveData, setLiveData] = useState({ weibo: [], news: [] });
    const [isReady, setIsReady] = useState(false);
    const [messageItems, setMessageItems] = useState(() => loadMessageCenterItems({ preferStorage: false }));
    const [approvalState, setApprovalState] = useState(() => loadApprovalCenterState());
    const [userProfile, setUserProfile] = useState(() => ensureCampusUserProfile());

    useEffect(() => {
        try {
            const storedState = localStorage.getItem(RIGHT_SIDEBAR_COLLAPSE_KEY);
            if (storedState !== null) {
                setCollapsed(storedState === '1');
            }
        } catch (error) {
            console.error('Failed to restore right sidebar state:', error);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(RIGHT_SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
        } catch (error) {
            console.error('Failed to persist right sidebar state:', error);
        }
    }, [collapsed]);

    useEffect(() => {
        let mounted = true;
        const readyTimer = window.setTimeout(() => {
            if (mounted) setIsReady(true);
        }, 220);

        const fetchNews = async () => {
            try {
                const res = await fetch('/api/news');
                if (res.ok && mounted) {
                    const data = await res.json();
                    if (data.weibo || data.news) {
                        setLiveData(data);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch news:", err);
            }
        };
        fetchNews();
        const timer = setInterval(fetchNews, 300000);
        return () => {
            mounted = false;
            clearInterval(timer);
            window.clearTimeout(readyTimer);
        };
    }, []);

    useEffect(() => {
        setMessageItems(loadMessageCenterItems());
        return subscribeMessageCenter(setMessageItems);
    }, []);

    useEffect(() => subscribeCampusUserProfile(setUserProfile), []);

    useEffect(() => {
        setApprovalState(loadApprovalCenterState());
        return subscribeApprovalCenter(setApprovalState);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const syncApprovals = async () => {
            try {
                const nextState = await syncCampusApprovals({
                    uid: userProfile.uid,
                    fid: userProfile.fid,
                });

                if (!cancelled) {
                    setApprovalState(nextState);
                }
            } catch (error) {
                if (!cancelled) {
                    setApprovalState(loadApprovalCenterState());
                }
            }
        };

        syncApprovals();
        const timer = window.setInterval(syncApprovals, 4 * 60 * 1000);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [userProfile.fid, userProfile.uid]);

    const messagePreview = messageItems.slice(0, 4);
    const noticePreview = messageItems.filter((item) => item.sourceId === 'study' || item.sourceId === 'system').slice(0, 3);
    const newsPreview = liveData.news.slice(0, 4);
    const hotPreview = liveData.weibo.slice(0, 5);
    const approvalGroups = [
        {
            key: 'pending',
            label: '待我审批',
            count: approvalState.pendingCount,
            items: approvalState.pending.slice(0, 4),
        },
        {
            key: 'initiated',
            label: '我发起的',
            count: approvalState.initiatedCount,
            items: approvalState.initiated.slice(0, 4),
        },
        {
            key: 'records',
            label: '审批记录',
            count: approvalState.recordCount,
            items: approvalState.records.slice(0, 4),
        },
    ];
    const hasApprovals = approvalGroups.some((group) => group.items.length > 0);
    const activeApprovalGroup = approvalGroups.find((group) => group.key === approvalTab) || approvalGroups[0];

    const tabs = [
        { key: 'info', label: '资讯', icon: icons.info },
        { key: 'todo', label: '待办', icon: icons.todo },
        { key: 'service', label: '服务', icon: icons.service },
    ];

    if (collapsed) {
        return (
            <aside className="right-sidebar collapsed glass-strong">
                <div className="rs-collapsed-head">
                    <button className="rs-toggle-btn" onClick={() => setCollapsed(false)} title="展开个人空间">
                        {icons.expandArrow}
                    </button>
                </div>
                <div className="rs-collapsed-nav">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            className={`rs-nav-item ${activeTab === tab.key ? 'active' : ''}`}
                            title={tab.label}
                            onClick={() => {
                                setActiveTab(tab.key);
                                setCollapsed(false);
                            }}
                        >
                            {tab.icon}
                        </button>
                    ))}
                </div>
            </aside>
        );
    }

    return (
        <aside className="right-sidebar glass-strong">
            <div className="rs-header">
                <div className="rs-header-top">
                    <button className="rs-toggle-btn" onClick={() => setCollapsed(true)} title="收起个人空间" style={{ background: 'var(--bg-white)', border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        {icons.collapseArrow}
                    </button>
                    <h3 className="rs-title" style={{ flex: 1, textAlign: 'right' }}>个人空间</h3>
                </div>
                <div className="rs-tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            className={`rs-tab ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            <span className="rs-tab-icon">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rs-body">
                {!isReady ? (
                    <div className="rs-skeleton-stack">
                        <div className="rs-skeleton-section">
                            <div className="skeleton-box rs-skeleton-title"></div>
                            <div className="skeleton-box rs-skeleton-card"></div>
                            <div className="skeleton-box rs-skeleton-card"></div>
                        </div>
                        <div className="rs-skeleton-section">
                            <div className="skeleton-box rs-skeleton-title"></div>
                            <div className="skeleton-box rs-skeleton-row"></div>
                            <div className="skeleton-box rs-skeleton-row"></div>
                            <div className="skeleton-box rs-skeleton-row short"></div>
                        </div>
                    </div>
                ) : (
                    <div className="rs-live-body">
                {/* INFO TAB */}
                {activeTab === 'info' && (
                    <div className="rs-tab-content">
                        <div className="rs-section">
                            <div className="rs-section-head">
                                <div className="rs-section-title">{icons.message} 消息</div>
                                <Link href="/messages" className="rs-more-link">查看更多</Link>
                            </div>
                            <div className="rs-list rs-list-capped">
                                {messagePreview.length === 0 ? (
                                    <div className="rs-list-empty">暂无消息</div>
                                ) : (
                                    messagePreview.map((m) => (
                                        <Link key={m.id} href={`/messages/${encodeURIComponent(m.id)}`} className={`rs-list-item ${m.read ? '' : 'unread'}`}>
                                            {!m.read && <div className="item-dot"></div>}
                                            <div className="item-body">
                                                <div className="item-title-row">
                                                    <span className="item-sender">{m.sourceLabel}</span>
                                                    <span className="item-time">{formatMessageTime(m.createdAt)}</span>
                                                </div>
                                                <div className="item-desc">{m.title}</div>
                                            </div>
                                        </Link>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="rs-section">
                            <div className="rs-section-head">
                                <div className="rs-section-title">{icons.bell} 通知</div>
                                <Link href="/messages" className="rs-more-link">查看更多</Link>
                            </div>
                            <div className="rs-list rs-list-capped">
                                {noticePreview.length === 0 ? (
                                    <div className="rs-list-empty">暂无通知</div>
                                ) : (
                                    noticePreview.map((n) => (
                                        <Link key={n.id} href={`/messages/${encodeURIComponent(n.id)}`} className={`rs-list-item ${n.read ? '' : 'unread'}`}>
                                            {!n.read && <div className="item-dot"></div>}
                                            <div className="item-body">
                                                <div className="item-title">{n.title}</div>
                                                <div className="item-time">{formatMessageTime(n.createdAt)}</div>
                                            </div>
                                        </Link>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="rs-section">
                            <div className="rs-section-head">
                                <div className="rs-section-title">🔥 热搜</div>
                                <a href="https://s.weibo.com/top/summary" target="_blank" rel="noopener noreferrer" className="rs-more-link">查看原榜</a>
                            </div>
                            <div className="rs-list rs-list-capped rs-list-tight">
                                {hotPreview.length === 0 ? (
                                    <div className="rs-list-empty">加载中...</div>
                                ) : (
                                    hotPreview.map((news) => (
                                        <a key={news.id} href={news.url} target="_blank" rel="noopener noreferrer" className="rs-list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                                            <div className="item-body">
                                                <div className="item-title">
                                                    <span style={{ color: news.rank <= 3 ? '#FF3B30' : 'var(--text-secondary)', marginRight: 6, fontWeight: 500 }}>{news.rank}</span>
                                                    {news.title}
                                                    {news.isHot && <span style={{ background: '#FF3B30', color: 'white', fontSize: 10, padding: '1px 4px', borderRadius: 4, marginLeft: 6, display: 'inline-block', lineHeight: 1.2 }}>热</span>}
                                                </div>
                                                <div className="item-time">{news.date} - 微博热榜</div>
                                            </div>
                                        </a>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="rs-section">
                            <div className="rs-section-head">
                                <div className="rs-section-title">📰 综合新闻</div>
                                <span className="rs-more-link muted">实时更新</span>
                            </div>
                            <div className="rs-list rs-list-capped">
                                {newsPreview.length === 0 ? (
                                    <div className="rs-list-empty">加载中...</div>
                                ) : (
                                    newsPreview.map((news) => (
                                        <a key={news.id} href={news.url} target="_blank" rel="noopener noreferrer" className="rs-list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                                            <div className="item-body">
                                                <div className="item-title">
                                                    <span style={{ color: news.rank <= 3 ? '#FF3B30' : 'var(--text-secondary)', marginRight: 6, fontWeight: 500 }}>{news.rank}</span>
                                                    {news.title}
                                                </div>
                                                <div className="item-time">{news.date} - 实时资讯</div>
                                            </div>
                                        </a>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* TODO TAB */}
                {activeTab === 'todo' && (
                    <div className="rs-tab-content">
                        <div className="rs-section">
                            <div className="rs-section-title">{icons.calendar} 课程</div>
                            <div className="rs-course-list">
                                {todayCourses.map((c) => (
                                    <div key={c.id} className="rs-course">
                                        <div className="course-color" style={{ background: c.color }}></div>
                                        <div className="course-body">
                                            <div className="course-name">{c.name}</div>
                                            <div className="course-meta">
                                                <span>{icons.clock} {c.time}</span>
                                                <span>{icons.pin} {c.location}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rs-section">
                            <div className="rs-section-title">{icons.clock} 日程</div>
                            <div className="rs-list">
                                {mockSchedules.map((s) => (
                                    <div key={s.id} className="rs-list-item schedule-item">
                                        <div className="item-body">
                                            <div className="item-title">{s.title}</div>
                                            <div className="item-time">{s.time}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rs-section rs-approval-section">
                            <div className="rs-section-head rs-approval-head">
                                <div className="rs-section-title">{icons.todo} 审批待办</div>
                                <a
                                    href="https://office.chaoxing.com/front/web/approve/apps/index?"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rs-more-link"
                                >
                                    查看更多
                                </a>
                            </div>
                            {!hasApprovals ? (
                                <div className="rs-list-empty">审批数据同步后会显示在这里</div>
                            ) : (
                                <div className="rs-progress-list">
                                    <div className="rs-approval-tabs">
                                        {approvalGroups.map((group) => (
                                            <button
                                                key={group.key}
                                                type="button"
                                                className={`rs-approval-tab ${approvalTab === group.key ? 'active' : ''}`}
                                                onClick={() => setApprovalTab(group.key)}
                                            >
                                                <span className="rs-approval-tab-label">{group.label}</span>
                                                <small className="rs-approval-tab-count">{group.count}</small>
                                            </button>
                                        ))}
                                    </div>
                                    {activeApprovalGroup?.items.length === 0 ? (
                                        <div className="rs-approval-empty">当前没有记录</div>
                                    ) : (
                                        activeApprovalGroup.items.map((item) => (
                                            <a
                                                key={item.id}
                                                className="rs-progress rs-progress-link"
                                                href={item.href || 'https://demo.hall.chaoxing.com/home'}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <div className="prog-top">
                                                    <span className="prog-name">{item.title}</span>
                                                    <span
                                                        className="prog-badge"
                                                        style={{
                                                            background: `${item.status.color}18`,
                                                            color: item.status.color,
                                                        }}
                                                    >
                                                        {item.statusLabel}
                                                    </span>
                                                </div>
                                                <div className="prog-meta">
                                                    <span>{item.formName}</span>
                                                    {item.sponsor ? <span>发起人：{item.sponsor}</span> : null}
                                                    {item.group === 'records' ? <span>类型：{item.source}</span> : null}
                                                </div>
                                                <div className="prog-time">{formatMessageTime(item.updatedAt, true)}</div>
                                            </a>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* SERVICE TAB */}
                {activeTab === 'service' && (
                    <div className="rs-tab-content">
                        <div className="rs-section">
                            <div className="rs-section-title">{icons.favorite} 我的收藏服务</div>
                            <div className="rs-service-grid">
                                {mockFavoriteServices.map((s) => (
                                    <button key={s.id} className="rs-service-item">
                                        <span className="rsi-icon">{getServiceIcon(s.iconType)}</span>
                                        <span className="rsi-label">{s.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="rs-section" style={{ marginTop: 32 }}>
                            <div className="rs-section-title">{icons.recent} 最近使用服务</div>
                            <div className="rs-service-grid">
                                {mockRecentServices.map((s) => (
                                    <button key={s.id} className="rs-service-item">
                                        <span className="rsi-icon">{getServiceIcon(s.iconType)}</span>
                                        <span className="rsi-label">{s.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                    </div>
                )}
            </div>
        </aside>
    );
}
