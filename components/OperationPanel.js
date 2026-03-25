'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    capabilityMap,
    resolveChatModel,
} from '@/data/workspace';
import './OperationPanel.css';

export default function OperationPanel({
    visible = false,
    chatStarted,
    sessionId,
    initialMessage,
    capabilityIds,
    preferredModelId,
}) {
    const [tasks, setTasks] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [collapsed, setCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState('artifacts');

    useEffect(() => {
        const load = () => {
            try {
                const storedTasks = JSON.parse(localStorage.getItem('dynamic_tasks') || '[]');
                const storedSessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
                setTasks(Array.isArray(storedTasks) ? storedTasks : []);
                setSessions(Array.isArray(storedSessions) ? storedSessions : []);
            } catch {
                setTasks([]);
                setSessions([]);
            }
        };

        load();
        window.addEventListener('tasks-updated', load);
        window.addEventListener('chat-history-updated', load);
        return () => {
            window.removeEventListener('tasks-updated', load);
            window.removeEventListener('chat-history-updated', load);
        };
    }, []);

    const currentSession = useMemo(() => (
        sessionId ? sessions.find((item) => item.id === sessionId) : null
    ), [sessionId, sessions]);

    const currentTasks = useMemo(() => {
        if (sessionId) {
            return tasks.filter((item) => item.sessionId === sessionId);
        }

        return tasks.slice(0, 4);
    }, [sessionId, tasks]);

    const activeCapabilities = capabilityIds.map((id) => capabilityMap[id]).filter(Boolean);
    const activeModel = resolveChatModel(preferredModelId);
    const title = currentSession?.title || initialMessage || '等待任务启动';
    const latestMessages = currentSession?.messages || [];
    const latestAssistantMessage = [...latestMessages].reverse().find((item) => item.role === 'ai');
    const artifacts = useMemo(() => {
        if (!latestAssistantMessage?.content) {
            return [];
        }

        const content = latestAssistantMessage.content;
        const codeMatches = [...content.matchAll(/```([\w-]+)?\n([\s\S]*?)```/g)].map((match, index) => ({
            id: `code-${index}`,
            type: 'code',
            label: match[1] || '代码片段',
            content: match[2].trim(),
        }));

        const fileMatches = [...content.matchAll(/\[([^\]]+\.(pdf|docx|pptx|xlsx|csv|md|txt|png|jpg|jpeg))\]\(([^)]+)\)/gi)].map((match, index) => ({
            id: `file-${index}`,
            type: 'file',
            label: match[1],
            href: match[3],
        }));

        const summaryText = content
            .replace(/```[\s\S]*?```/g, '')
            .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
            .trim();

        const summaryArtifact = summaryText.length > 80
            ? [{
                id: 'summary',
                type: 'summary',
                label: '结果摘要',
                content: summaryText.slice(0, 800),
            }]
            : [];

        return [...summaryArtifact, ...codeMatches, ...fileMatches];
    }, [latestAssistantMessage]);

    useEffect(() => {
        if (artifacts.length > 0 || currentTasks.length > 0) {
            setCollapsed(false);
        }
    }, [artifacts.length, currentTasks.length]);

    if (!visible) {
        return null;
    }

    return (
        <aside className={`operation-panel glass-strong ${collapsed ? 'collapsed' : ''}`}>
            <button
                type="button"
                className="operation-panel-toggle"
                onClick={() => setCollapsed((prev) => !prev)}
                title={collapsed ? '展开操作空间' : '收起操作空间'}
            >
                {collapsed ? '展开' : '收起'}
            </button>

            {!collapsed && (
                <>
                    <div className="operation-panel-head">
                        <div>
                            <span className="operation-panel-kicker">操作空间</span>
                            <h3 className="operation-panel-title">工作结果</h3>
                        </div>
                        <span className="operation-panel-badge">{activeModel.label}</span>
                    </div>

                    <div className="operation-panel-tabs">
                        <button
                            type="button"
                            className={`operation-tab ${activeTab === 'artifacts' ? 'active' : ''}`}
                            onClick={() => setActiveTab('artifacts')}
                        >
                            结果
                        </button>
                        <button
                            type="button"
                            className={`operation-tab ${activeTab === 'steps' ? 'active' : ''}`}
                            onClick={() => setActiveTab('steps')}
                        >
                            步骤
                        </button>
                        <button
                            type="button"
                            className={`operation-tab ${activeTab === 'actions' ? 'active' : ''}`}
                            onClick={() => setActiveTab('actions')}
                        >
                            操作
                        </button>
                    </div>

                    <div className="operation-panel-body">
                        <section className="operation-section">
                            <div className="operation-section-label">当前任务</div>
                            <div className="operation-focus-card">
                                <strong>{title}</strong>
                                <p>
                                    {chatStarted
                                        ? '这里用来承接检索结果、代码、文件、步骤状态等非聊天主文本内容。'
                                        : '启动一个任务后，这里会逐步承接步骤、产物和操作结果。'}
                                </p>
                            </div>
                        </section>

                        {activeTab === 'artifacts' && (
                            <section className="operation-section operation-section-grow">
                                <div className="operation-section-label">结果面板</div>
                                <div className="operation-canvas">
                                    {artifacts.length > 0 ? artifacts.map((artifact) => (
                                        <div key={artifact.id} className={`operation-artifact ${artifact.type}`}>
                                            <span className="operation-canvas-kicker">{artifact.label}</span>
                                            {artifact.type === 'file' ? (
                                                <a href={artifact.href} className="operation-file-link" target="_blank" rel="noreferrer">
                                                    {artifact.label}
                                                </a>
                                            ) : (
                                                <div className="operation-canvas-text">
                                                    {artifact.content}
                                                </div>
                                            )}
                                        </div>
                                    )) : (
                                        <>
                                            <span className="operation-canvas-kicker">等待产出</span>
                                            <div className="operation-canvas-text">
                                                当回答里出现代码、结构化结果或文件链接时，会优先显示在这里，而不是和聊天正文混在一起。
                                            </div>
                                        </>
                                    )}
                                </div>
                            </section>
                        )}

                        {activeTab === 'steps' && (
                            <section className="operation-section">
                                <div className="operation-section-label">执行清单</div>
                                <div className="operation-list">
                                    {currentTasks.length > 0 ? currentTasks.map((task, index) => (
                                        <div key={task.id || index} className="operation-item">
                                            <div className={`operation-status ${task.status || 'in-progress'}`} />
                                            <div className="operation-item-copy">
                                                <strong>{task.title}</strong>
                                                <span>{task.status === 'completed' ? '已完成' : '进行中'}</span>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="operation-empty">
                                            当前还没有拆出来的步骤。后续如果对话触发任务分解，这里会自动接住。
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {activeTab === 'actions' && (
                            <section className="operation-section">
                                <div className="operation-section-label">快速操作</div>
                                <div className="operation-actions">
                                    {activeCapabilities.map((capability) => (
                                        <Link key={capability.id} href={capability.href || '/'} className="operation-action">
                                            <span>{capability.name}</span>
                                            <small>{capability.source}</small>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                </>
            )}
        </aside>
    );
}
