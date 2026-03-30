'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { buildMessageSourceTabs } from '@/data/campusPlatform';
import {
    formatMessageTime,
    loadMessageCenterItems,
    markAllMessagesRead,
    markMessageRead,
    subscribeMessageCenter,
} from '@/data/messageCenter';
import './messages.css';

const statusTabs = [
    { id: 'all', label: '全部' },
    { id: 'unread', label: '未读' },
    { id: 'read', label: '已读' },
];

export default function MessagesPage() {
    const [items, setItems] = useState(() => loadMessageCenterItems({ preferStorage: false }));
    const [statusFilter, setStatusFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');

    useEffect(() => {
        setItems(loadMessageCenterItems());
        return subscribeMessageCenter(setItems);
    }, []);

    const sourceTabs = useMemo(() => buildMessageSourceTabs(), []);

    const filteredItems = useMemo(
        () => items.filter((item) => {
            const statusMatched = statusFilter === 'all'
                ? true
                : statusFilter === 'unread'
                    ? !item.read
                    : item.read;
            const sourceMatched = sourceFilter === 'all' ? true : item.sourceId === sourceFilter;
            return statusMatched && sourceMatched;
        }),
        [items, sourceFilter, statusFilter]
    );

    const unreadCount = items.filter((item) => !item.read).length;

    return (
        <div className="message-page">
            <div className="message-page-shell">
                <header className="message-page-header glass-strong">
                    <div className="message-page-header-copy">
                        <span className="message-page-kicker">消息中心</span>
                        <h1>统一查看业务提醒、系统通知与萤火虫回执</h1>
                        <p>在这里可以区分来源、已读状态和后续动作，不再只是在导航里看一眼就消失。</p>
                    </div>
                    <div className="message-page-header-actions">
                        <div className="message-page-metrics">
                            <div className="message-metric-card">
                                <strong>{items.length}</strong>
                                <span>累计消息</span>
                            </div>
                            <div className="message-metric-card accent">
                                <strong>{unreadCount}</strong>
                                <span>未读消息</span>
                            </div>
                        </div>
                        <button type="button" className="message-page-action-btn" onClick={() => markAllMessagesRead()}>
                            全部标记为已读
                        </button>
                    </div>
                </header>

                <section className="message-page-filters glass">
                    <div className="message-filter-row">
                        {statusTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={`message-filter-chip ${statusFilter === tab.id ? 'active' : ''}`}
                                onClick={() => setStatusFilter(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="message-filter-row source">
                        {sourceTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={`message-filter-chip ${sourceFilter === tab.id ? 'active' : ''}`}
                                onClick={() => setSourceFilter(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </section>

                <section className="message-list-shell">
                    {filteredItems.length === 0 ? (
                        <div className="message-empty-state glass">
                            <strong>当前筛选条件下没有消息</strong>
                            <span>你可以切换来源或状态，查看其他业务系统和萤火虫产生的消息。</span>
                        </div>
                    ) : (
                        filteredItems.map((item) => (
                            <article key={item.id} className={`message-list-card glass ${item.read ? '' : 'unread'}`}>
                                <Link
                                    href={`/messages/${encodeURIComponent(item.id)}`}
                                    className="message-list-card-link"
                                    onClick={() => markMessageRead(item.id, true)}
                                >
                                    <div className="message-list-card-top">
                                        <span className={`message-center-source ${item.sourceId}`}>{item.sourceLabel}</span>
                                        <div className="message-list-card-meta">
                                            <span className={`message-center-status ${item.read ? 'read' : 'unread'}`}>
                                                {item.read ? '已读' : '未读'}
                                            </span>
                                            <small>{formatMessageTime(item.createdAt, true)}</small>
                                        </div>
                                    </div>
                                    <h2>{item.title}</h2>
                                    <p>{item.body}</p>
                                </Link>
                                <div className="message-list-card-actions">
                                    <Link href={`/messages/${encodeURIComponent(item.id)}`} className="message-inline-link">
                                        查看详情
                                    </Link>
                                    <button
                                        type="button"
                                        className="message-inline-btn"
                                        onClick={() => markMessageRead(item.id, !item.read)}
                                    >
                                        {item.read ? '标记未读' : '标记已读'}
                                    </button>
                                </div>
                            </article>
                        ))
                    )}
                </section>
            </div>
        </div>
    );
}
