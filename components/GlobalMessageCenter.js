'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CAMPUS_NOTIFY_EVENT } from '@/data/campusPlatform';
import {
    addMessageCenterItem,
    buildSeedMessages,
    formatMessageTime,
    loadMessageCenterItems,
    markAllMessagesRead,
    markMessageRead,
    requestOpenFireflyAction,
    subscribeMessageCenter,
} from '@/data/messageCenter';
import './GlobalMessageCenter.css';

export default function GlobalMessageCenter() {
    const panelRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const [items, setItems] = useState(() => buildSeedMessages());
    const [toasts, setToasts] = useState([]);

    const unreadCount = useMemo(
        () => items.filter((item) => !item.read).length,
        [items]
    );

    useEffect(() => {
        setItems(loadMessageCenterItems());
        return subscribeMessageCenter(setItems);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handlePointerDown = (event) => {
            if (panelRef.current && !panelRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isOpen]);

    useEffect(() => {
        if (toasts.length === 0) {
            return undefined;
        }

        const timer = window.setTimeout(() => {
            setToasts((prev) => prev.slice(1));
        }, 5200);

        return () => window.clearTimeout(timer);
    }, [toasts]);

    useEffect(() => {
        const handleCampusNotify = (event) => {
            const nextItem = addMessageCenterItem(event.detail || {});
            setToasts((prev) => [...prev, nextItem].slice(-4));
        };

        window.addEventListener(CAMPUS_NOTIFY_EVENT, handleCampusNotify);
        return () => window.removeEventListener(CAMPUS_NOTIFY_EVENT, handleCampusNotify);
    }, []);

    const previewItems = items.slice(0, 6);

    const handleToastAction = (item) => {
        markMessageRead(item.id, true);
        setToasts((prev) => prev.filter((toast) => toast.id !== item.id));
        requestOpenFireflyAction(item);
    };

    return (
        <>
            <div className="message-center" ref={panelRef}>
                <button
                    type="button"
                    className={`nav-action-btn message-center-trigger ${isOpen ? 'active' : ''}`}
                    title="消息中心"
                    onClick={() => setIsOpen((prev) => !prev)}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {unreadCount > 0 && <span className="message-center-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                </button>

                {isOpen && (
                    <div className="message-center-popover glass-strong">
                        <div className="message-center-head">
                            <div>
                                <strong>消息中心</strong>
                                <span>业务提醒、萤火虫回执与系统通知会统一汇总到这里</span>
                            </div>
                            <div className="message-center-head-actions">
                                <button
                                    type="button"
                                    className="message-center-mark-btn"
                                    onClick={() => markAllMessagesRead()}
                                >
                                    全部已读
                                </button>
                                <Link href="/messages" className="message-center-more-link" onClick={() => setIsOpen(false)}>
                                    查看更多
                                </Link>
                            </div>
                        </div>

                        <div className="message-center-list">
                            {previewItems.length === 0 ? (
                                <div className="message-center-empty">
                                    <strong>暂时没有新消息</strong>
                                    <span>后续业务提醒和萤火虫完成通知会出现在这里。</span>
                                </div>
                            ) : (
                                previewItems.map((item) => (
                                    <div key={item.id} className={`message-center-item ${item.read ? '' : 'unread'}`}>
                                        <Link
                                            href={`/messages/${encodeURIComponent(item.id)}`}
                                            className="message-center-item-link"
                                            onClick={() => {
                                                markMessageRead(item.id, true);
                                                setIsOpen(false);
                                            }}
                                        >
                                            <div className="message-center-item-head">
                                                <span className={`message-center-source ${item.sourceId}`}>{item.sourceLabel}</span>
                                                <small>{formatMessageTime(item.createdAt, true)}</small>
                                            </div>
                                            <strong>{item.title}</strong>
                                            <p>{item.body}</p>
                                        </Link>
                                        <div className="message-center-item-actions">
                                            <span className={`message-center-status ${item.read ? 'read' : 'unread'}`}>
                                                {item.read ? '已读' : '未读'}
                                            </span>
                                            <button
                                                type="button"
                                                className="message-center-quick-action"
                                                onClick={() => {
                                                    markMessageRead(item.id, true);
                                                    setIsOpen(false);
                                                    requestOpenFireflyAction(item);
                                                }}
                                            >
                                                {item.actionLabel}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="message-toast-stack">
                {toasts.map((toast) => (
                    <button
                        key={toast.id}
                        type="button"
                        className="message-toast glass-strong"
                        onClick={() => handleToastAction(toast)}
                    >
                        <div className="message-toast-head">
                            <span className={`message-center-source ${toast.sourceId}`}>{toast.sourceLabel}</span>
                            <small>刚刚</small>
                        </div>
                        <strong>{toast.title}</strong>
                        <p>{toast.body}</p>
                    </button>
                ))}
            </div>
        </>
    );
}
