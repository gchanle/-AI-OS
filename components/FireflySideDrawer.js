'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    consumePendingFireflyAction,
} from '@/data/messageCenter';
import {
    CAMPUS_OPEN_FIREFLY_EVENT,
    loadWorkspacePrefs,
    mergeWorkspacePrefs,
    publishCampusNotification,
} from '@/data/campusPlatform';
import {
    chatModelOptions,
    defaultChatModelId,
    resolveChatModel,
} from '@/data/workspace';
import './FireflySideDrawer.css';

function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeThread(items = []) {
    return items
        .filter(Boolean)
        .map((item, index) => ({
            ...item,
            id: item.id || `drawer-thread-${item.time || index}-${index}`,
            role: item.role === 'assistant' ? 'ai' : item.role,
            time: item.time || new Date().toISOString(),
            streaming: Boolean(item.streaming),
        }));
}

function persistWorkspacePreferredModel(modelId) {
    mergeWorkspacePrefs({ modelId });
}

export default function FireflySideDrawer({
    isOpen,
    onOpenChange,
    openStorageKey = null,
    storageNamespace,
    threadKey = 'default',
    historyOrigin,
    title = '萤火虫',
    description = '围绕当前工作面继续提问。',
    launcherLabel = '萤火虫',
    launcherHint = null,
    emptyTitle = '从这里继续提问',
    emptyDescription = '我会基于当前页面上下文，继续帮你梳理问题、给出建议或推进下一步动作。',
    placeholder = '输入你想继续追问的内容',
    shortcuts = [],
    contextChips = [],
    capabilityIds = [],
    contextSnapshot = null,
    buildContextMessage,
    buildFallbackReply,
    buildSession,
    secondaryAction = null,
    onAsk = null,
    onFallback = null,
    panelClassName = '',
}) {
    const pathname = usePathname();
    const threadStorageKey = useMemo(
        () => `${storageNamespace}:threads`,
        [storageNamespace]
    );
    const modelStorageKey = useMemo(
        () => `${storageNamespace}:model`,
        [storageNamespace]
    );
    const launcherStorageKey = useMemo(
        () => `${storageNamespace}:launcher-position`,
        [storageNamespace]
    );

    const [threads, setThreads] = useState({});
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [availableModels, setAvailableModels] = useState(chatModelOptions);
    const [activeModelId, setActiveModelId] = useState(defaultChatModelId);
    const [internalOpen, setInternalOpen] = useState(false);
    const [launcherPosition, setLauncherPosition] = useState(0.72);

    const shellRef = useRef(null);
    const textareaRef = useRef(null);
    const messagesEndRef = useRef(null);
    const abortControllerRef = useRef(null);
    const dragStateRef = useRef({
        active: false,
        moved: false,
        startY: 0,
        startRatio: 0.72,
    });

    const drawerOpen = typeof isOpen === 'boolean' ? isOpen : internalOpen;
    const currentThread = useMemo(
        () => normalizeThread(threads[threadKey] || []),
        [threadKey, threads]
    );
    const activeModel = resolveChatModel(activeModelId);

    const setDrawerOpen = (nextValue) => {
        if (typeof isOpen === 'boolean') {
            onOpenChange?.(nextValue);
            return;
        }

        setInternalOpen(nextValue);
        onOpenChange?.(nextValue);
    };

    useEffect(() => {
        try {
            const storedThreads = JSON.parse(localStorage.getItem(threadStorageKey) || 'null');
            const storedModelId = localStorage.getItem(modelStorageKey);
            const storedWorkspacePrefs = loadWorkspacePrefs();
            const storedOpenState = openStorageKey ? localStorage.getItem(openStorageKey) : null;
            const storedLauncherPosition = localStorage.getItem(launcherStorageKey);

            if (storedThreads && typeof storedThreads === 'object') {
                setThreads(
                    Object.fromEntries(
                        Object.entries(storedThreads).map(([key, value]) => [
                            key,
                            normalizeThread(value),
                        ])
                    )
                );
            }

            if (storedModelId) {
                setActiveModelId(storedModelId);
            } else if (storedWorkspacePrefs?.modelId) {
                setActiveModelId(storedWorkspacePrefs.modelId);
            }

            if (typeof isOpen !== 'boolean' && storedOpenState !== null) {
                setInternalOpen(storedOpenState === '1');
            }

            if (storedLauncherPosition) {
                const parsedPosition = Number.parseFloat(storedLauncherPosition);
                if (!Number.isNaN(parsedPosition)) {
                    setLauncherPosition(clamp(parsedPosition, 0.16, 0.86));
                }
            }
        } catch (error) {
            console.error('Failed to restore firefly drawer state:', error);
        }
    }, [isOpen, launcherStorageKey, modelStorageKey, openStorageKey, threadStorageKey]);

    useEffect(() => {
        try {
            localStorage.setItem(
                threadStorageKey,
                JSON.stringify(
                    Object.fromEntries(
                        Object.entries(threads).map(([key, value]) => [
                            key,
                            normalizeThread(value).filter((item) => !item.streaming),
                        ])
                    )
                )
            );
        } catch (error) {
            console.error('Failed to persist firefly drawer threads:', error);
        }
    }, [threadStorageKey, threads]);

    useEffect(() => {
        try {
            localStorage.setItem(modelStorageKey, activeModelId);
            persistWorkspacePreferredModel(activeModelId);
        } catch (error) {
            console.error('Failed to persist firefly drawer model:', error);
        }
    }, [activeModelId, modelStorageKey]);

    useEffect(() => {
        if (!openStorageKey || typeof isOpen === 'boolean') {
            return;
        }

        try {
            localStorage.setItem(openStorageKey, drawerOpen ? '1' : '0');
        } catch (error) {
            console.error('Failed to persist firefly drawer open state:', error);
        }
    }, [drawerOpen, isOpen, openStorageKey]);

    useEffect(() => {
        try {
            localStorage.setItem(launcherStorageKey, String(launcherPosition));
        } catch (error) {
            console.error('Failed to persist firefly launcher position:', error);
        }
    }, [launcherPosition, launcherStorageKey]);

    useEffect(() => {
        let mounted = true;

        fetch('/api/models')
            .then((res) => res.json())
            .then((data) => {
                if (!mounted || !Array.isArray(data.models) || data.models.length === 0) {
                    return;
                }

                setAvailableModels(data.models);
            })
            .catch(() => {
                if (mounted) {
                    setAvailableModels(chatModelOptions);
                }
            });

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [currentThread, drawerOpen]);

    useEffect(() => {
        if (!historyOrigin || typeof buildSession !== 'function') {
            return;
        }

        try {
            const storedSessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
            const remainingSessions = Array.isArray(storedSessions)
                ? storedSessions.filter((session) => session?.meta?.origin !== historyOrigin)
                : [];

            const nextSessions = Object.entries(threads)
                .map(([key, items]) => buildSession({
                    threadKey: key,
                    thread: normalizeThread(items).filter((item) => item.content && !item.streaming),
                    modelId: activeModelId,
                    historyOrigin,
                }))
                .filter(Boolean);

            const mergedSessions = [...remainingSessions, ...nextSessions].sort(
                (left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
            );

            localStorage.setItem('chat_sessions', JSON.stringify(mergedSessions));
            window.dispatchEvent(new Event('chat-history-updated'));
        } catch (error) {
            console.error('Failed to sync firefly drawer history:', error);
        }
    }, [activeModelId, buildSession, historyOrigin, threads]);

    useEffect(() => {
        setDrawerOpen(false);
    }, [pathname]);

    useEffect(() => {
        const handleOpenRequest = (event) => {
            const target = event.detail?.target;
            if (!target) {
                return;
            }

            if (target === storageNamespace || target === historyOrigin) {
                setDrawerOpen(true);
            }
        };

        window.addEventListener(CAMPUS_OPEN_FIREFLY_EVENT, handleOpenRequest);
        return () => window.removeEventListener(CAMPUS_OPEN_FIREFLY_EVENT, handleOpenRequest);
    }, [historyOrigin, storageNamespace]);

    useEffect(() => {
        const pendingAction = consumePendingFireflyAction([storageNamespace, historyOrigin]);
        if (pendingAction) {
            setDrawerOpen(true);
        }
    }, [historyOrigin, storageNamespace]);

    useEffect(() => () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    const pushTaskNotification = (content) => {
        const summary = (content || '').replace(/\s+/g, ' ').trim().slice(0, 72);
        publishCampusNotification({
            id: uid('message'),
            sourceId: 'firefly',
            title: `${launcherLabel} 已完成`,
            body: summary || '萤火虫已经整理好当前任务，你可以继续查看结果。',
            detail: content || summary || '萤火虫已经整理好当前任务。',
            target: storageNamespace,
            pathname,
            href: secondaryAction?.href || pathname,
            actionLabel: secondaryAction?.label || '查看结果',
            createdAt: new Date().toISOString(),
            meta: {
                capabilityIds,
                threadKey,
            },
        });
    };

    const handleLauncherPointerDown = (event) => {
        if (drawerOpen) {
            return;
        }

        dragStateRef.current = {
            active: true,
            moved: false,
            startY: event.clientY,
            startRatio: launcherPosition,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handleLauncherPointerMove = (event) => {
        if (!dragStateRef.current.active || drawerOpen) {
            return;
        }

        const shellRect = shellRef.current?.getBoundingClientRect();
        if (!shellRect || !shellRect.height) {
            return;
        }

        const deltaRatio = (event.clientY - dragStateRef.current.startY) / shellRect.height;
        const nextRatio = clamp(dragStateRef.current.startRatio + deltaRatio, 0.16, 0.86);

        if (Math.abs(event.clientY - dragStateRef.current.startY) > 6) {
            dragStateRef.current.moved = true;
        }

        setLauncherPosition(nextRatio);
    };

    const handleLauncherPointerUp = (event) => {
        if (!dragStateRef.current.active) {
            return;
        }

        event.currentTarget.releasePointerCapture?.(event.pointerId);
        dragStateRef.current.active = false;
    };

    const handleLauncherClick = (event) => {
        if (dragStateRef.current.moved) {
            dragStateRef.current.moved = false;
            event.preventDefault();
            return;
        }

        setDrawerOpen(!drawerOpen);
    };

    const sendMessage = async (presetQuestion = '') => {
        const question = (presetQuestion || inputValue).trim();
        if (!question || isLoading) {
            return;
        }

        const cleanThread = currentThread.filter((item) => !item.streaming);
        const userEntry = {
            id: uid('drawer-msg'),
            role: 'user',
            content: question,
            time: new Date().toISOString(),
            context: contextSnapshot,
        };
        const placeholderEntry = {
            id: uid('drawer-msg'),
            role: 'ai',
            content: '',
            time: new Date().toISOString(),
            streaming: true,
            modelId: activeModelId,
        };
        const baseThread = [...cleanThread, userEntry];

        setThreads((prev) => ({
            ...prev,
            [threadKey]: [...baseThread, placeholderEntry],
        }));
        setInputValue('');
        setDrawerOpen(true);
        setIsLoading(true);
        onAsk?.({
            question,
            threadKey,
            contextSnapshot,
        });

        try {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }

            abortControllerRef.current = new AbortController();

            const apiMessages = baseThread.map((message) => ({
                role: message.role === 'ai' ? 'assistant' : 'user',
                content: message.role === 'user' && typeof buildContextMessage === 'function'
                    ? buildContextMessage(message.context, message.content)
                    : message.content,
            }));

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    model: activeModelId,
                    capabilityIds,
                    webSearchEnabled: false,
                    deepResearchEnabled: false,
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`drawer-chat ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) {
                        continue;
                    }

                    const data = trimmed.slice(6);
                    if (data === '[DONE]') {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        if (!parsed.content) {
                            continue;
                        }

                        fullContent += parsed.content;
                        setThreads((prev) => ({
                            ...prev,
                            [threadKey]: [
                                ...baseThread,
                                {
                                    ...placeholderEntry,
                                    content: fullContent,
                                    streaming: true,
                                    modelId: activeModelId,
                                },
                            ],
                        }));
                    } catch {
                        // Ignore malformed SSE chunks.
                    }
                }
            }

            const finalContent = fullContent || (
                typeof buildFallbackReply === 'function'
                    ? buildFallbackReply(contextSnapshot, question)
                    : '我已经结合当前页面做了一轮整理。你可以继续追问更具体的任务、问题或下一步动作。'
            );

            setThreads((prev) => ({
                ...prev,
                [threadKey]: [
                    ...baseThread,
                    {
                        id: placeholderEntry.id,
                        role: 'ai',
                        content: finalContent,
                        time: new Date().toISOString(),
                        modelId: activeModelId,
                    },
                ],
            }));
            pushTaskNotification(finalContent);
        } catch (error) {
            if (error.name !== 'AbortError') {
                const fallback = typeof buildFallbackReply === 'function'
                    ? buildFallbackReply(contextSnapshot, question)
                    : '当前连接暂时不稳定，我先基于页面上下文给你一个保守建议：把问题收窄到当前任务、当前入口或当前资料，再继续追问会更高效。';

                setThreads((prev) => ({
                    ...prev,
                    [threadKey]: [
                        ...baseThread,
                        {
                            id: placeholderEntry.id,
                            role: 'ai',
                            content: fallback,
                            time: new Date().toISOString(),
                            modelId: activeModelId,
                        },
                    ],
                }));
                pushTaskNotification(fallback);
                onFallback?.(error);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div ref={shellRef} className={`firefly-side-shell ${drawerOpen ? 'open' : ''}`}>
            <button
                type="button"
                className={`firefly-side-launcher ${drawerOpen ? 'open' : ''}`}
                aria-expanded={drawerOpen}
                onClick={handleLauncherClick}
                onPointerDown={handleLauncherPointerDown}
                onPointerMove={handleLauncherPointerMove}
                onPointerUp={handleLauncherPointerUp}
                title={drawerOpen ? '收起萤火虫' : `打开${launcherLabel}`}
                style={{ top: `${launcherPosition * 100}%` }}
            >
                <span className="firefly-side-launcher-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 7h16v10H7l-3 3V7z" />
                    </svg>
                </span>
                <span className="firefly-side-launcher-copy">
                    <strong>{drawerOpen ? '收起' : launcherLabel}</strong>
                    <small>{launcherHint || '侧边协同'}</small>
                </span>
            </button>

            {drawerOpen && (
                <>
                    <button
                        type="button"
                        aria-label="关闭萤火虫侧边抽屉"
                        className="firefly-side-backdrop visible"
                        onClick={() => setDrawerOpen(false)}
                    />

                    <aside className={`firefly-side-panel glass-strong ${panelClassName} open`}>
                        <div className="firefly-side-header">
                            <div className="firefly-side-header-copy">
                                <span className="firefly-side-kicker">{title}</span>
                                <h3>{launcherLabel} 协同面板</h3>
                                <p>{description}</p>
                            </div>
                            <div className="firefly-side-header-actions">
                                <span className="firefly-side-model-badge">{activeModel.label}</span>
                                {secondaryAction?.href && secondaryAction?.label && (
                                    <Link href={secondaryAction.href} className="firefly-side-link">
                                        {secondaryAction.label}
                                    </Link>
                                )}
                                <button
                                    type="button"
                                    className="firefly-side-close"
                                    aria-label="关闭萤火虫侧边抽屉"
                                    onClick={() => setDrawerOpen(false)}
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        {contextChips.length > 0 && (
                            <div className="firefly-side-chip-row">
                                {contextChips.map((chip) => (
                                    <span key={chip} className="firefly-side-chip">{chip}</span>
                                ))}
                            </div>
                        )}

                        {shortcuts.length > 0 && (
                            <div className="firefly-side-shortcuts">
                                {shortcuts.map((shortcut) => (
                                    <button
                                        key={shortcut.id}
                                        type="button"
                                        className="firefly-side-shortcut"
                                        onClick={() => sendMessage(shortcut.prompt)}
                                    >
                                        {shortcut.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="firefly-side-messages">
                            {currentThread.length === 0 ? (
                                <div className="firefly-side-empty">
                                    <h4>{emptyTitle}</h4>
                                    <p>{emptyDescription}</p>
                                </div>
                            ) : (
                                currentThread.map((message) => (
                                    <div key={message.id} className={`firefly-side-message ${message.role}`}>
                                        <div className="firefly-side-message-body">
                                            <p>{message.content}{message.streaming ? '…' : ''}</p>
                                        </div>
                                        <div className="firefly-side-message-meta">
                                            <span>{message.role === 'user' ? '我' : '萤火虫'}</span>
                                            <small>{new Date(message.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="firefly-side-composer" onClick={() => textareaRef.current?.focus()}>
                            <textarea
                                ref={textareaRef}
                                value={inputValue}
                                onChange={(event) => setInputValue(event.target.value)}
                                placeholder={placeholder}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault();
                                        sendMessage();
                                    }
                                }}
                            />
                            <div className="firefly-side-composer-footer">
                                <label className="firefly-side-model-select">
                                    <span>模型</span>
                                    <select
                                        value={activeModelId}
                                        onChange={(event) => setActiveModelId(event.target.value)}
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        {availableModels.map((model) => (
                                            <option key={model.id} value={model.id}>
                                                {model.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <div className="firefly-side-composer-actions">
                                    <button
                                        type="button"
                                        className="firefly-side-secondary-btn"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setDrawerOpen(false);
                                        }}
                                    >
                                        稍后继续
                                    </button>
                                    <button
                                        type="button"
                                        className="firefly-side-primary-btn"
                                        disabled={isLoading || !inputValue.trim()}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            sendMessage();
                                        }}
                                    >
                                        {isLoading ? '生成中...' : '发送'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </aside>
                </>
            )}
        </div>
    );
}
