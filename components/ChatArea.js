'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import './ChatArea.css';

export default function ChatArea({ initialMessage, sessionId }) {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const hasInitialized = useRef(false);
    const abortControllerRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => { scrollToBottom(); }, [messages]);

    // Update messages when sessionId changes
    useEffect(() => {
        if (sessionId) {
            try {
                const sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
                const found = sessions.find(s => s.id === sessionId);
                if (found) {
                    setMessages(found.messages);
                    hasInitialized.current = true; // prevent initialMessage from triggering
                }
            } catch(e) {}
        } else if (!initialMessage) {
            setMessages([]);
            hasInitialized.current = false;
        }
    }, [sessionId, initialMessage]);

    const sendToAI = useCallback(async (allMessages) => {
        setIsTyping(true);

        // Add a placeholder AI message for streaming
        setMessages((prev) => [...prev, { role: 'ai', content: '', time: new Date(), streaming: true }]);

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
                body: JSON.stringify({ messages: apiMessages }),
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

            // Finalize the message
            setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'ai') {
                    updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: fullContent || '抱歉，我暂时无法回答这个问题，请稍后再试。',
                        streaming: false,
                    };
                }
                
                // Save to localStorage
                try {
                    const finalContent = fullContent || '抱歉，我暂时无法回答这个问题，请稍后再试。';
                    const updatedComplete = [...allMessages, { role: 'ai', content: finalContent, time: new Date() }];
                    const sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
                    let sid = sessionStorage.getItem('current_sid');
                    if (!sid) {
                        sid = 'session-' + Date.now();
                        sessionStorage.setItem('current_sid', sid);
                    }
                    const existingIdx = sessions.findIndex(s => s.id === sid);
                    const sessionObj = {
                        id: sid,
                        title: updatedComplete[0].content.substring(0, 15) + (updatedComplete[0].content.length > 15 ? '...' : ''),
                        date: new Date().toLocaleDateString(),
                        messages: updatedComplete
                    };
                    if (existingIdx >= 0) {
                        sessions[existingIdx] = sessionObj;
                    } else {
                        sessions.unshift(sessionObj);
                    }
                    localStorage.setItem('chat_sessions', JSON.stringify(sessions));
                    window.dispatchEvent(new Event('chat-history-updated'));
                } catch(e) { console.error('History save error', e); }

                return updated;
            });

            // Extract tasks asynchronously
            try {
                const userText = allMessages[allMessages.length-1]?.content || '';
                fetch('/api/extract-tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: `User: ${userText}\nAI: ${fullContent}`, sessionId: sid })
                }).then(res => res.json()).then(data => {
                    if (data.tasks && data.tasks.length > 0) {
                        const existingTasks = JSON.parse(localStorage.getItem('dynamic_tasks') || '[]');
                        const newTasks = [...data.tasks, ...existingTasks];
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
                    };
                }
                return updated;
            });
        } finally {
            setIsTyping(false);
        }
    }, []);

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

    return (
        <div className="chat-area">
            <div className="messages-container">
                <div className="chat-container-inner">
                    {messages.length === 0 && !isTyping ? (
                        <div className="chat-empty">
                            <div className="empty-icon glass-strong">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                            </div>
                            <p>我是萤火虫，有什么我可以帮你的吗？</p>
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
                                    <div className="msg-time">{formatTime(msg.time)}</div>
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
                    <div className="chat-input-box glass-strong">
                        <textarea
                            className="chat-textarea"
                            placeholder="继续对话..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={3}
                        />
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
                    <div className="chat-footer-hint">AI 生成内容仅供参考，请注意甄别信息准确性。</div>
                </div>
            </div>
        </div>
    );
}
