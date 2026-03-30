'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getCampusMessageSource } from '@/data/campusPlatform';
import {
    formatMessageTime,
    getMessageById,
    markMessageRead,
    requestOpenFireflyAction,
    subscribeMessageCenter,
} from '@/data/messageCenter';
import '../messages.css';

export default function MessageDetailPage() {
    const params = useParams();
    const messageId = decodeURIComponent(params?.id || '');
    const [item, setItem] = useState(null);
    const sourceMeta = getCampusMessageSource(item?.sourceId || 'system');

    useEffect(() => {
        const current = getMessageById(messageId);
        setItem(current);
        if (current) {
            markMessageRead(messageId, true);
        }

        return subscribeMessageCenter((items) => {
            setItem(items.find((entry) => entry.id === messageId) || null);
        });
    }, [messageId]);

    if (!item) {
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
                <div className="message-detail-shell">
                    <div className="message-detail-main glass-strong">
                        <div className="message-detail-breadcrumb">
                            <Link href="/messages">消息中心</Link>
                            <span>/</span>
                            <span>消息详情</span>
                        </div>

                        <div className="message-list-card-top">
                            <span className={`message-center-source ${item.sourceId}`}>{item.sourceLabel}</span>
                            <div className="message-list-card-meta">
                                <span className={`message-center-status ${item.read ? 'read' : 'unread'}`}>
                                    {item.read ? '已读' : '未读'}
                                </span>
                                <small>{formatMessageTime(item.createdAt, true)}</small>
                            </div>
                        </div>

                        <h1 className="message-detail-title">{item.title}</h1>
                        <p className="message-detail-body">{item.detail || item.body}</p>

                        <div className="message-detail-section">
                            <span className="message-page-kicker">消息摘要</span>
                            <div className="message-detail-summary glass">
                                <p>{item.body}</p>
                            </div>
                        </div>

                        <div className="message-detail-actions">
                            <button
                                type="button"
                                className="message-page-action-btn"
                                onClick={() => requestOpenFireflyAction(item)}
                            >
                                {item.actionLabel}
                            </button>
                            <button
                                type="button"
                                className="message-inline-btn"
                                onClick={() => {
                                    const next = markMessageRead(item.id, !item.read);
                                    setItem(next);
                                }}
                            >
                                {item.read ? '标记未读' : '标记已读'}
                            </button>
                        </div>
                    </div>

                    <aside className="message-detail-side glass">
                        <div className="message-detail-side-card">
                            <span className="message-page-kicker">来源信息</span>
                            <strong>{sourceMeta?.label || item.sourceLabel}</strong>
                            <p>{sourceMeta?.summary || `这条消息来自 ${item.sourceLabel} 工作面或其相关业务链路。`}</p>
                        </div>
                        <div className="message-detail-side-card">
                            <span className="message-page-kicker">下一步</span>
                            <p>如果这是业务提醒，建议进入对应模块继续处理；如果是萤火虫回执，可以直接回到对应工作面继续追问。</p>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
