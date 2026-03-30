'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
    campusCapabilities,
    capabilityMap,
    chatModelOptions,
    resolveChatModel,
} from '@/data/workspace';
import './ChatArea.css';

export default function ChatArea({
    initialMessage,
    sessionId,
    defaultCapabilityIds,
    preferredModelId,
    onPreferredModelChange,
    availableModels = chatModelOptions,
    variant = 'classic',
    onToggleCapability,
    webSearchEnabled = false,
    deepResearchEnabled = false,
    onWebSearchChange,
    onDeepResearchChange,
}) {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [activeCapabilityIds, setActiveCapabilityIds] = useState(defaultCapabilityIds);
    const [activeModelId, setActiveModelId] = useState(preferredModelId);
    const [showCapabilityMenu, setShowCapabilityMenu] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const hasInitialized = useRef(false);
    const abortControllerRef = useRef(null);
    const speechRecognitionRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => { scrollToBottom(); }, [messages]);

    useEffect(() => {
        if (!sessionId) {
            setActiveCapabilityIds(defaultCapabilityIds);
            setActiveModelId(preferredModelId);
        }
    }, [sessionId, defaultCapabilityIds, preferredModelId]);

    // Update messages when sessionId changes
    useEffect(() => {
        if (sessionId) {
            try {
                const sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
                const found = sessions.find(s => s.id === sessionId);
                if (found) {
                    setMessages(found.messages);
                    setActiveCapabilityIds(found.meta?.capabilityIds?.length ? found.meta.capabilityIds : defaultCapabilityIds);
                    setActiveModelId(found.meta?.modelId || preferredModelId);
                    onWebSearchChange?.(Boolean(found.meta?.webSearchEnabled));
                    onDeepResearchChange?.(Boolean(found.meta?.deepResearchEnabled));
                    hasInitialized.current = true; // prevent initialMessage from triggering
                }
            } catch(e) {}
        } else if (!initialMessage) {
            setMessages([]);
            hasInitialized.current = false;
            setActiveCapabilityIds(defaultCapabilityIds);
            setActiveModelId(preferredModelId);
            onWebSearchChange?.(false);
            onDeepResearchChange?.(false);
        }
    }, [sessionId, initialMessage, defaultCapabilityIds, preferredModelId, onWebSearchChange, onDeepResearchChange]);

    const persistConversation = useCallback((allMessages, finalContent, meta) => {
        try {
            const updatedComplete = [...allMessages, {
                role: 'ai',
                content: finalContent,
                time: new Date(),
                modelId: activeModelId,
            }];
            const sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
            let sid = sessionStorage.getItem('current_sid');

            if (!sid) {
                sid = `session-${Date.now()}`;
                sessionStorage.setItem('current_sid', sid);
            }

            const existingIdx = sessions.findIndex((session) => session.id === sid);
            const firstUserMessage = updatedComplete.find((message) => message.role === 'user')?.content || '新对话';
            const sessionObj = {
                id: sid,
                title: firstUserMessage.substring(0, 15) + (firstUserMessage.length > 15 ? '...' : ''),
                date: new Date().toLocaleDateString(),
                updatedAt: new Date().toISOString(),
                messages: updatedComplete,
                meta,
            };

            if (existingIdx >= 0) {
                sessions[existingIdx] = sessionObj;
            } else {
                sessions.unshift(sessionObj);
            }

            localStorage.setItem('chat_sessions', JSON.stringify(sessions));
            window.dispatchEvent(new Event('chat-history-updated'));

            return sid;
        } catch (error) {
            console.error('History save error', error);
            return null;
        }
    }, [activeModelId]);

    const sendToAI = useCallback(async (allMessages) => {
        setIsTyping(true);

        // Add a placeholder AI message for streaming
        setMessages((prev) => [...prev, {
            role: 'ai',
            content: '',
            time: new Date(),
            streaming: true,
            modelId: activeModelId,
        }]);

        try {
            // Abort previous request if any
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            const apiMessages = allMessages.map((m) => ({
                role: m.role === 'ai' ? 'assistant' : 'user',
                content: m.content,
            }));

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    model: activeModelId,
                    capabilityIds: activeCapabilityIds,
                    webSearchEnabled,
                    deepResearchEnabled,
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const data = trimmed.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            fullContent += parsed.content;
                            // Update the last AI message with streamed content
                            setMessages((prev) => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (lastIdx >= 0 && updated[lastIdx].role === 'ai') {
                                    updated[lastIdx] = {
                                        ...updated[lastIdx],
                                        content: fullContent,
                                        modelId: activeModelId,
                                    };
                                }
                                return updated;
                            });
                        }
                    } catch {
                        // skip malformed JSON chunks
                    }
                }
            }

            const finalContent = fullContent || '抱歉，我暂时无法回答这个问题，请稍后再试。';

            setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'ai') {
                    updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: finalContent,
                        streaming: false,
                        modelId: activeModelId,
                    };
                }

                return updated;
            });

            const persistedSessionId = persistConversation(allMessages, finalContent, {
                capabilityIds: activeCapabilityIds,
                modelId: activeModelId,
                webSearchEnabled,
                deepResearchEnabled,
            });

            // Extract tasks asynchronously
            try {
                const userText = allMessages[allMessages.length - 1]?.content || '';
                fetch('/api/extract-tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: `User: ${userText}\nAI: ${finalContent}`,
                        sessionId: persistedSessionId,
                    })
                }).then(res => res.json()).then(data => {
                    if (data.tasks && data.tasks.length > 0) {
                        const existingTasks = JSON.parse(localStorage.getItem('dynamic_tasks') || '[]');
                        const newTasks = [
                            ...data.tasks.map((task) => ({
                                ...task,
                                createdAt: task.createdAt || new Date().toISOString(),
                            })),
                            ...existingTasks,
                        ];
                        localStorage.setItem('dynamic_tasks', JSON.stringify(newTasks));
                        window.dispatchEvent(new CustomEvent('tasks-updated', { detail: data.tasks }));
                    }
                }).catch(console.error);
            } catch(e) {}
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Chat error:', error);
            setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'ai') {
                    updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: '⚠️ 网络连接异常，请检查网络后重试。',
                        streaming: false,
                        modelId: activeModelId,
                    };
                }
                return updated;
            });
        } finally {
            setIsTyping(false);
        }
    }, [persistConversation, activeCapabilityIds, activeModelId, webSearchEnabled, deepResearchEnabled]);

    // Handle initial message from landing page
    useEffect(() => {
        if (initialMessage && !hasInitialized.current) {
            hasInitialized.current = true;
            const userMsg = { role: 'user', content: initialMessage, time: new Date() };
            setMessages([userMsg]);
            sendToAI([userMsg]);
        }
    }, [initialMessage, sendToAI]);

    const handleSend = () => {
        const message = inputValue.trim();
        if (!message || isTyping) return;
        const userMsg = { role: 'user', content: message, time: new Date() };
        const newMessages = [...messages.filter(m => !m.streaming), userMsg];
        setMessages(newMessages);
        setInputValue('');
        sendToAI(newMessages);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatTime = (date) => {
        const d = new Date(date);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const handleModelChange = (e) => {
        const nextModelId = e.target.value;
        setActiveModelId(nextModelId);
        onPreferredModelChange?.(nextModelId);
    };

    const handleCapabilityToggle = (capabilityId) => {
        setActiveCapabilityIds((prev) => {
            const next = prev.includes(capabilityId)
                ? (prev.length === 1 ? prev : prev.filter((item) => item !== capabilityId))
                : [...prev, capabilityId];

            onToggleCapability?.(capabilityId);
            return next;
        });
    };

    const handleVoiceInput = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            return;
        }

        if (speechRecognitionRef.current) {
            speechRecognitionRef.current.stop();
            speechRecognitionRef.current = null;
            setIsListening(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            const transcript = event.results?.[0]?.[0]?.transcript;
            if (transcript) {
                setInputValue((prev) => `${prev}${prev ? '\n' : ''}${transcript}`);
            }
        };

        recognition.onend = () => {
            speechRecognitionRef.current = null;
            setIsListening(false);
        };

        recognition.onerror = () => {
            speechRecognitionRef.current = null;
            setIsListening(false);
        };

        speechRecognitionRef.current = recognition;
        setIsListening(true);
        recognition.start();
    };
    const preventComposerFocusSteal = (event) => {
        event.stopPropagation();
    };

    const firstUserMessage = messages.find((message) => message.role === 'user')?.content || initialMessage || '新的校园任务';
    const workspaceTitle = firstUserMessage.length > 40 ? `${firstUserMessage.slice(0, 40)}...` : firstUserMessage;
    const activeCapabilities = activeCapabilityIds.map((id) => capabilityMap[id]).filter(Boolean);
    const activeModel = resolveChatModel(activeModelId || preferredModelId);
    const capabilitySummary = activeCapabilities.map((capability) => capability.name).join('、');
    const isMinimal = variant === 'minimal';
    const workspaceBadges = [
        sessionId ? '历史会话' : '当前工作区',
        activeModel?.label || '默认模型',
        `${activeCapabilities.length} 个校园能力`,
    ];

    return (
        <div className={`chat-area ${isMinimal ? 'minimal' : ''}`}>
            <div className="messages-container">
                <div className="chat-container-inner">
                    <div className="chat-workspace-head glass">
                        <div className="chat-workspace-copy">
                            {!isMinimal && (
                                <span className="chat-workspace-badge">萤火虫工作区</span>
                            )}
                            <h2 className="chat-workspace-title">{workspaceTitle}</h2>
                            {!isMinimal && (
                                <p className="chat-workspace-desc">
                                    围绕当前问题组织校园上下文，让对话、任务和后续动作保持在同一个工作面板里。
                                </p>
                            )}
                        </div>
                        <div className="chat-workspace-tags">
                            {workspaceBadges.map((badge) => (
                                <span
                                    key={badge}
                                    className="chat-workspace-tag"
                                    title={badge.includes('校园能力') ? capabilitySummary : undefined}
                                >
                                    {badge}
                                </span>
                            ))}
                        </div>
                    </div>

                    {messages.length === 0 && !isTyping ? (
                        <div className="chat-empty">
                            <div className="empty-icon glass-strong">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                            </div>
                            <p>我是萤火虫，准备好为你整理校园事务、学习任务和系统信息了。</p>
                        </div>
                    ) : (
                        messages.map((msg, idx) => (
                            <div key={idx} className={`message ${msg.role === 'user' ? 'user' : 'ai'}`}>
                                {msg.role !== 'user' && (
                                    <div className="msg-avatar ai-av">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
                                    </div>
                                )}
                                <div className="msg-bubble">
                                    <div className="msg-content">
                                        {msg.content}
                                        {msg.streaming && <span className="streaming-cursor">|</span>}
                                    </div>
                                    <div className="msg-meta">
                                        <span className="msg-time">
                                            {msg.streaming ? '正在生成' : formatTime(msg.time)}
                                        </span>
                                        {msg.role === 'ai' && (
                                            <span className="msg-model-note">
                                                该回复来自“{resolveChatModel(msg.modelId || activeModelId).label}”，请注意甄别
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {msg.role === 'user' && (
                                    <div className="msg-avatar user-av">我</div>
                                )}
                            </div>
                        ))
                    )}
                    {isTyping && !messages.find(m => m.streaming) && (
                        <div className="message ai typing-indicator">
                            <div className="msg-avatar ai-av">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
                            </div>
                            <div className="msg-bubble typing-dots">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className="chat-input-area">
                <div className="chat-container-inner">
                    {isMinimal ? (
                        <div className="chat-composer-minimal glass-strong">
                            <div className="chat-composer-status">
                                继续输入，萤火虫会拆解任务、组织结果，并围绕当前任务保持简洁对话。
                            </div>
                            <div className="chat-input-box chat-input-box-minimal" onClick={() => textareaRef.current?.focus()}>
                                <textarea
                                    ref={textareaRef}
                                    className="chat-textarea chat-textarea-minimal"
                                    placeholder=""
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    rows={4}
                                />
                            </div>
                            <div
                                className="chat-composer-footer"
                                onMouseDown={preventComposerFocusSteal}
                                onClick={preventComposerFocusSteal}
                            >
                                <div className="chat-composer-tools">
                                    <button className="chat-tool-btn" type="button" title="添加附件">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                                    </button>
                                    <label className="chat-composer-select">
                                        <span>模型</span>
                                        <select value={activeModelId} onChange={handleModelChange}>
                                            {availableModels.map((model) => (
                                                <option key={model.id} value={model.id}>
                                                    {model.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                <button
                                    className={`chat-tool-chip ${webSearchEnabled ? 'active' : ''}`}
                                    type="button"
                                    onClick={() => onWebSearchChange?.(!webSearchEnabled)}
                                >
                                        联网搜索
                                    </button>
                                    <button
                                        className={`chat-tool-chip ${deepResearchEnabled ? 'active' : ''}`}
                                        type="button"
                                        onClick={() => onDeepResearchChange?.(!deepResearchEnabled)}
                                    >
                                        深度研究
                                    </button>
                                    <button
                                        className={`chat-tool-btn ${isListening ? 'active' : ''}`}
                                        type="button"
                                        title="语音输入"
                                        onClick={handleVoiceInput}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                    </button>
                                    <div className="chat-menu-wrap">
                                        <button className="chat-tool-chip" type="button" onClick={() => setShowCapabilityMenu((prev) => !prev)}>
                                            接入
                                        </button>
                                        {showCapabilityMenu && (
                                            <div className="chat-floating-menu glass-strong">
                                                {campusCapabilities.map((capability) => (
                                                    <button
                                                        key={capability.id}
                                                        type="button"
                                                        className={`chat-floating-item ${activeCapabilityIds.includes(capability.id) ? 'active' : ''}`}
                                                        onClick={() => handleCapabilityToggle(capability.id)}
                                                    >
                                                        <strong>{capability.name}</strong>
                                                        <span>{capability.source}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button
                                    className={`chat-send ${inputValue.trim() ? 'active' : ''}`}
                                    onClick={handleSend}
                                    disabled={!inputValue.trim() || isTyping}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div
                            className="chat-input-box glass-strong"
                            onClick={() => textareaRef.current?.focus()}
                        >
                            <textarea
                                ref={textareaRef}
                                className="chat-textarea"
                                placeholder="继续推进当前校园任务，或补充新的上下文..."
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={3}
                            />
                            <div
                                className="chat-input-footer"
                                onMouseDown={preventComposerFocusSteal}
                                onClick={preventComposerFocusSteal}
                            >
                                <div className="chat-composer-tools">
                                    <label className="chat-composer-select">
                                        <span>模型</span>
                                        <select value={activeModelId} onChange={handleModelChange}>
                                            {availableModels.map((model) => (
                                                <option key={model.id} value={model.id}>
                                                    {model.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <button
                                        className={`chat-tool-chip ${webSearchEnabled ? 'active' : ''}`}
                                        type="button"
                                        onClick={() => onWebSearchChange?.(!webSearchEnabled)}
                                    >
                                        联网搜索
                                    </button>
                                    <button
                                        className={`chat-tool-chip ${deepResearchEnabled ? 'active' : ''}`}
                                        type="button"
                                        onClick={() => onDeepResearchChange?.(!deepResearchEnabled)}
                                    >
                                        深度研究
                                    </button>
                                    <button
                                        className={`chat-tool-btn ${isListening ? 'active' : ''}`}
                                        type="button"
                                        title="语音输入"
                                        onClick={handleVoiceInput}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                    </button>
                                    <div className="chat-menu-wrap">
                                        <button className="chat-tool-chip" type="button" onClick={() => setShowCapabilityMenu((prev) => !prev)}>
                                            接入
                                        </button>
                                        {showCapabilityMenu && (
                                            <div className="chat-floating-menu glass-strong">
                                                {campusCapabilities.map((capability) => (
                                                    <button
                                                        key={capability.id}
                                                        type="button"
                                                        className={`chat-floating-item ${activeCapabilityIds.includes(capability.id) ? 'active' : ''}`}
                                                        onClick={() => handleCapabilityToggle(capability.id)}
                                                    >
                                                        <strong>{capability.name}</strong>
                                                        <span>{capability.source}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <span className="chat-inline-config" title={capabilitySummary}>
                                        已接入 {activeCapabilities.length} 个校园能力
                                    </span>
                                </div>
                                <button
                                    className={`chat-send ${inputValue.trim() ? 'active' : ''}`}
                                    onClick={handleSend}
                                    disabled={!inputValue.trim() || isTyping}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="chat-footer-hint">AI 生成内容仅供参考，涉及制度与流程时请以校园正式通知为准。</div>
                </div>
            </div>
        </div>
    );
}
