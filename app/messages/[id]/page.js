'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { buildMessageSourceTabs, getCampusMessageSource } from '@/data/campusPlatform';
import {
    formatMessageTime,
    getMessageById,
    loadMessageCenterItems,
    markMessageRead,
    requestOpenFireflyAction,
    subscribeMessageCenter,
} from '@/data/messageCenter';
import '../messages.css';

const pageSize = 8;
const statusTabs = [
    { id: 'all', label: '全部' },
    { id: 'unread', label: '未读' },
    { id: 'read', label: '已读' },
];

function buildPaginationItems(currentPage, totalPages) {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 4) {
        return [1, 2, 3, 4, 5, 'ellipsis-right', totalPages];
    }

    if (currentPage >= totalPages - 3) {
        return [1, 'ellipsis-left', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, 'ellipsis-left', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-right', totalPages];
}

export default function MessageDetailPage() {
    const params = useParams();
    const routeMessageId = decodeURIComponent(params?.id || '');
    const [items, setItems] = useState(() => loadMessageCenterItems({ preferStorage: false }));
    const [selectedId, setSelectedId] = useState(routeMessageId);
    const [statusFilter, setStatusFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [page, setPage] = useState(1);
    const sourceTabs = useMemo(() => buildMessageSourceTabs(), []);

    useEffect(() => {
        const initialItems = loadMessageCenterItems();
        setItems(initialItems);
        setSelectedId(routeMessageId);
        return subscribeMessageCenter(setItems);
    }, [routeMessageId]);

    useEffect(() => {
        const handlePopState = () => {
            const nextId = decodeURIComponent(window.location.pathname.split('/').pop() || '');
            if (nextId) {
                setSelectedId(nextId);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const selectedItem = useMemo(
        () => items.find((entry) => entry.id === selectedId) || getMessageById(selectedId),
        [items, selectedId]
    );

    useEffect(() => {
        const current = getMessageById(selectedId);
        if (current && !current.read) {
            markMessageRead(current.id, true);
        }
    }, [selectedId]);

    const filteredItems = useMemo(
        () => items.filter((entry) => {
            const statusMatched = statusFilter === 'all'
                ? true
                : statusFilter === 'unread'
                    ? !entry.read
                    : entry.read;
            const sourceMatched = sourceFilter === 'all' ? true : entry.sourceId === sourceFilter;
            return statusMatched && sourceMatched;
        }),
        [items, sourceFilter, statusFilter]
    );

    const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
    const pageItems = useMemo(
        () => filteredItems.slice((page - 1) * pageSize, page * pageSize),
        [filteredItems, page]
    );
    const selectedItemIndex = filteredItems.findIndex((entry) => entry.id === selectedId);
    const paginationItems = useMemo(
        () => buildPaginationItems(page, totalPages),
        [page, totalPages]
    );
    const sourceMeta = getCampusMessageSource(selectedItem?.sourceId || 'system');
    const isExternalLink = (href) => /^https?:\/\//.test(href || '');
    const showPrimaryAction = Boolean(
        selectedItem?.target ||
        (selectedItem?.pathname && !isExternalLink(selectedItem.pathname)) ||
        (!isExternalLink(selectedItem?.href) && selectedItem?.actionLabel)
    );

    useEffect(() => {
        setPage(1);
    }, [statusFilter, sourceFilter]);

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    useEffect(() => {
        if (selectedItemIndex < 0) {
            return;
        }

        const nextPage = Math.floor(selectedItemIndex / pageSize) + 1;
        if (nextPage !== page) {
            setPage(nextPage);
        }
    }, [page, selectedItemIndex]);

    const handleSelectItem = (entryId) => {
        setSelectedId(entryId);
        markMessageRead(entryId, true);

        if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', `/messages/${encodeURIComponent(entryId)}`);
        }
    };

    if (!selectedItem) {
        return (
            <div className="message-page">
                <div className="message-page-shell">
                    <div className="message-empty-state glass">
                        <strong>这条消息不存在或已经被移除</strong>
                        <Link href="/messages" className="message-inline-link">返回消息中心</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="message-page">
            <div className="message-page-shell">
                <div className="message-reader-shell">
                    <aside className="message-reader-list glass">
                        <div className="message-reader-list-head">
                            <div>
                                <span className="message-page-kicker">消息中心</span>
                                <h2>继续查看其他消息</h2>
                            </div>
                            <Link href="/messages" className="message-inline-link">回到总列表</Link>
                        </div>
                        <div className="message-reader-filters">
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
                        </div>
                        <div className="message-reader-list-body">
                            {pageItems.map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    className={`message-reader-item ${entry.id === selectedId ? 'active' : ''} ${entry.read ? '' : 'unread'}`}
                                    onClick={() => handleSelectItem(entry.id)}
                                >
                                    <div className="message-reader-item-head">
                                        <span className={`message-center-source ${entry.sourceId}`}>{entry.sourceLabel}</span>
                                        <small>{formatMessageTime(entry.createdAt, true)}</small>
                                    </div>
                                    <strong>{entry.title}</strong>
                                    <p>{entry.body}</p>
                                </button>
                            ))}
                        </div>
                    </aside>

                    <div className="message-detail-shell">
                        <div className="message-detail-main glass-strong">
                            <div className="message-detail-breadcrumb">
                                <Link href="/messages">消息中心</Link>
                                <span>/</span>
                                <span>消息详情</span>
                            </div>

                            <div className="message-list-card-head">
                                <div className="message-list-card-title-row">
                                    <span className={`message-center-source ${selectedItem.sourceId}`}>{selectedItem.sourceLabel}</span>
                                    <h1 className="message-detail-title">{selectedItem.title}</h1>
                                </div>
                                <div className="message-list-card-meta">
                                    <span className={`message-center-status ${selectedItem.read ? 'read' : 'unread'}`}>
                                        {selectedItem.read ? '已读' : '未读'}
                                    </span>
                                    <small>{formatMessageTime(selectedItem.createdAt, true)}</small>
                                </div>
                            </div>

                            <p className="message-detail-body">{selectedItem.detail || selectedItem.body}</p>

                            <div className="message-detail-inline-meta">
                                <div className="message-detail-inline-item">
                                    <span>来源</span>
                                    <strong>{sourceMeta?.label || selectedItem.sourceLabel}</strong>
                                    <small>{sourceMeta?.summary || `这条消息来自 ${selectedItem.sourceLabel} 工作面或其相关业务链路。`}</small>
                                </div>
                                <div className="message-detail-inline-item">
                                    <span>建议动作</span>
                                    <strong>{selectedItem.actionLabel || '继续处理'}</strong>
                                    <small>如需继续推进，可直接打开原文或回到对应工作面继续处理。</small>
                                </div>
                            </div>

                            <div className="message-detail-section">
                                <span className="message-page-kicker">消息摘要</span>
                                <div className="message-detail-summary glass">
                                    <p>{selectedItem.body}</p>
                                </div>
                            </div>

                            <div className="message-detail-actions">
                                {showPrimaryAction && (
                                    <button
                                        type="button"
                                        className="message-page-action-btn"
                                        onClick={() => requestOpenFireflyAction(selectedItem)}
                                    >
                                        {selectedItem.actionLabel || '继续处理'}
                                    </button>
                                )}
                                {isExternalLink(selectedItem.href) && (
                                    <a
                                        href={selectedItem.href}
                                        className="message-inline-link"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        原文
                                    </a>
                                )}
                                <button
                                    type="button"
                                    className="message-inline-btn"
                                    onClick={() => {
                                        markMessageRead(selectedItem.id, !selectedItem.read);
                                    }}
                                >
                                    {selectedItem.read ? '标记未读' : '标记已读'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="message-pagination-shell glass">
                    <button
                        type="button"
                        className="message-inline-btn"
                        disabled={page <= 1}
                        onClick={() => setPage(1)}
                    >
                        首页
                    </button>
                    <button
                        type="button"
                        className="message-inline-btn"
                        disabled={page <= 1}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    >
                        上一页
                    </button>

                    <div className="message-pagination-numbers">
                        {paginationItems.map((entry, index) => (
                            entry === 'ellipsis-left' || entry === 'ellipsis-right' ? (
                                <span key={`${entry}-${index}`} className="message-pagination-ellipsis">…</span>
                            ) : (
                                <button
                                    key={entry}
                                    type="button"
                                    className={`message-pagination-number ${page === entry ? 'active' : ''}`}
                                    onClick={() => setPage(entry)}
                                >
                                    {entry}
                                </button>
                            )
                        ))}
                    </div>

                    <button
                        type="button"
                        className="message-inline-btn"
                        disabled={page >= totalPages}
                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    >
                        下一页
                    </button>
                    <button
                        type="button"
                        className="message-inline-btn"
                        disabled={page >= totalPages}
                        onClick={() => setPage(totalPages)}
                    >
                        末页
                    </button>
                </div>
            </div>
        </div>
    );
}
