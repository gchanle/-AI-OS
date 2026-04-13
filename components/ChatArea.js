'use client';
import Link from 'next/link';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import FireflyMark from '@/components/FireflyMark';
import {
    buildMcpDefinitions,
    loadMcpDefinitionState,
} from '@/data/mcp';
import {
    buildSkillDefinitions,
    loadSkillDefinitionState,
} from '@/data/skills';
import {
    buildCapabilityMarketAccessContextFromCatalog,
    loadUserCapabilityInstalls,
} from '@/data/capabilityMarket';
import {
    campusCapabilities,
    capabilityMap,
    chatModelOptions,
    resolveChatModel,
} from '@/data/workspace';
import {
    loadApprovalCenterState,
    syncCampusApprovals,
} from '@/data/approvalCenter';
import {
    formatMessageTime as formatCenterMessageTime,
    loadMessageCenterItems,
    syncStudyNoticeMessages,
} from '@/data/messageCenter';
import {
    ensureCampusUserProfile,
    loadCampusUserProfile,
    subscribeCampusUserProfile,
} from '@/data/userProfile';
import { rememberFireflyTask, buildFireflyMemorySnapshot } from '@/data/fireflyMemory';
import { patchFireflyTask, upsertFireflyTask } from '@/data/fireflyTasks';
import {
    buildApprovalSummary,
    buildUnreadSummary,
    renderRichMessageContent,
} from '@/components/RichMessageContent';
import FireflyRuntimeCard from '@/components/FireflyRuntimeCard';
import './ChatArea.css';

function shouldAttachUnreadSummary(question = '') {
    const normalizedQuestion = String(question || '').trim();
    if (!normalizedQuestion) {
        return false;
    }

    if (/未读消息|学习通|校园通知|站内信|消息中心|通知中心|未读通知|校园提醒|维度消息|收件箱/.test(normalizedQuestion)) {
        return true;
    }

    return /消息/.test(normalizedQuestion) && /最近|最新|我的|帮我看|帮我查|获取|整理|汇总|报告|简报|文档/.test(normalizedQuestion);
}

function shouldAttachApprovalSummary(question = '') {
    return /审批|待办|流程|我发起|待我审批|AI ?办事/.test(question);
}

function isTroubleshootingQuestion(question = '') {
    return /token|bearer|cookie|登录|认证|auth|enc|密钥|key|会话|失效|为什么|报错|失败|不能用/i.test(String(question || '').trim());
}

function isFailureLikeAssistantMessage(message = {}) {
    if (message.role !== 'ai') {
        return false;
    }

    return /任务执行失败|执行失败|登录态已失效|审批实时查询失败|未读消息查询失败|MCP|认证|Token|Bearer/.test(String(message.content || ''));
}

function buildFallbackChatHistory(allMessages = [], latestUserMessage = null) {
    const trimmedMessages = allMessages
        .filter((message) => String(message?.content || '').trim())
        .map((message) => ({
            role: message.role === 'ai' ? 'assistant' : 'user',
            content: String(message.content || '').trim(),
        }));

    const latestQuestion = String(latestUserMessage?.content || '').trim();
    if (!trimmedMessages.length) {
        return trimmedMessages;
    }

    if (isTroubleshootingQuestion(latestQuestion)) {
        const lastFailureIndex = [...allMessages]
            .map((message, index) => ({ message, index }))
            .reverse()
            .find(({ message }) => isFailureLikeAssistantMessage(message))?.index;

        if (typeof lastFailureIndex === 'number') {
            const focusedHistory = allMessages
                .slice(Math.max(0, lastFailureIndex - 1))
                .filter((message) => String(message?.content || '').trim())
                .map((message) => ({
                    role: message.role === 'ai' ? 'assistant' : 'user',
                    content: String(message.content || '').trim(),
                }));

            return focusedHistory.slice(-4);
        }
    }

    return trimmedMessages.slice(-8);
}

function formatTaskStatus(status = '') {
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'running') return '执行中';
    if (status === 'planning') return '规划中';
    return status || '待执行';
}

function buildPendingAgentContent(mode = 'planning') {
    if (mode === 'fallback') {
        return [
            '## 已切换到普通对话',
            '- 当前问题没有命中特定可执行工具。',
            '- 我会保留上下文，继续用普通对话方式回答。',
        ].join('\n');
    }

    return [
        '## 萤火虫正在准备',
        '- 正在识别可执行工具。',
        '- 稍后会把计划、步骤和产出逐步显示在这里。',
    ].join('\n');
}

function buildStreamingTaskContent(task, phase = 'running') {
    if (!task) {
        return buildPendingAgentContent();
    }

    const title = phase === 'failed'
        ? '## Agent 执行失败'
        : phase === 'completed'
            ? '## Agent 执行完成'
            : '## Agent 正在执行';
    const lines = [
        title,
        `- 任务：${task.title || '萤火虫任务'}`,
        `- 状态：${formatTaskStatus(task.status)}`,
    ];

    if (task.selectedSkillLabels?.length) {
        lines.push(`- 已调度：${task.selectedSkillLabels.join('、')}`);
    }

    if (task.resultSummary) {
        lines.push(`- 结果摘要：${task.resultSummary}`);
    }

    if (task.steps?.length) {
        lines.push('', '## 执行链路');
        task.steps.forEach((step, index) => {
            const summary = step.summary ? `｜${step.summary}` : '';
            lines.push(`${index + 1}. ${step.label}｜${formatStepStatus(step.status)}${summary}`);
        });
    }

    if (task.artifacts?.length) {
        lines.push('', '## 当前产出');
        task.artifacts.slice(-3).forEach((artifact) => {
            lines.push(`### ${artifact.label}`);
            if (artifact.content) {
                lines.push(artifact.content);
            }
            if (artifact.href) {
                lines.push('', `[打开结果](${artifact.href})`);
            }
        });
    }

    return lines.join('\n\n');
}

function buildRuntimeTraceMessage(task, phase = 'running', modelId = '') {
    return {
        role: 'ai',
        content: '',
        time: new Date(),
        modelId,
        messageKind: 'runtime-trace',
        runtimeTask: task || null,
        runtimePhase: phase,
        streaming: phase === 'running',
        traceExpanded: phase === 'running',
    };
}

function buildAssistantMessage(content, modelId = '') {
    return {
        role: 'ai',
        content,
        time: new Date(),
        modelId,
        messageKind: 'assistant-final',
        streaming: false,
    };
}

function buildRuntimeTraceSummary(task = null) {
    if (!task) {
        return '正在准备可执行工具。';
    }

    if (task.resultSummary) {
        return task.resultSummary;
    }

    if (Array.isArray(task.selectedSkillLabels) && task.selectedSkillLabels.length > 0) {
        return `已调度 ${task.selectedSkillLabels.join('、')}`;
    }

    return '正在组织执行过程。';
}

function ensureClientSessionKey(explicitSessionId = '') {
    if (typeof window === 'undefined') {
        return explicitSessionId || `session-${Date.now()}`;
    }

    const existing = String(explicitSessionId || sessionStorage.getItem('current_sid') || '').trim();
    if (existing) {
        sessionStorage.setItem('current_sid', existing);
        return existing;
    }

    const created = `session-${Date.now()}`;
    sessionStorage.setItem('current_sid', created);
    return created;
}

const fireflyStarterPrompts = [
    '帮我先梳理今天最值得处理的校园事项',
    '帮我把待办审批、未读消息和课程任务排个优先级',
    '我接下来有一堆事情要做，你先帮我拆成执行清单',
];

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
    initialRuntimeContext = null,
    initialThreadKey = null,
}) {
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [activeCapabilityIds, setActiveCapabilityIds] = useState(defaultCapabilityIds);
    const [activeModelId, setActiveModelId] = useState(preferredModelId);
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [runtimeRecovery, setRuntimeRecovery] = useState(null);
    const [userProfile, setUserProfile] = useState(() => ensureCampusUserProfile());
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const toolsMenuRef = useRef(null);
    const hasInitialized = useRef(false);
    const abortControllerRef = useRef(null);
    const speechRecognitionRef = useRef(null);
    const launchRuntimeContextRef = useRef(initialRuntimeContext);
    const launchThreadKeyRef = useRef(initialThreadKey);

    useEffect(() => {
        launchRuntimeContextRef.current = initialRuntimeContext;
    }, [initialRuntimeContext]);

    useEffect(() => {
        launchThreadKeyRef.current = initialThreadKey;
    }, [initialThreadKey]);

    const refreshRuntimeRecovery = useCallback(async (threadKey) => {
        const nextThreadKey = String(threadKey || '').trim();
        if (!nextThreadKey) {
            setRuntimeRecovery(null);
            return null;
        }

        try {
            const response = await fetch(`/api/firefly/runtime/recovery?threadKey=${encodeURIComponent(nextThreadKey)}`);
            if (!response.ok) {
                setRuntimeRecovery(null);
                return null;
            }

            const payload = await response.json();
            if (payload?.ok && payload.available) {
                setRuntimeRecovery(payload);
                return payload;
            }

            setRuntimeRecovery(null);
            return null;
        } catch {
            setRuntimeRecovery(null);
            return null;
        }
    }, []);

    useEffect(() => {
        const candidateThreadKey = String(initialThreadKey || sessionId || '').trim();
        if (!candidateThreadKey) {
            setRuntimeRecovery(null);
            return;
        }

        refreshRuntimeRecovery(candidateThreadKey);
    }, [initialThreadKey, refreshRuntimeRecovery, sessionId]);

    useEffect(() => subscribeCampusUserProfile(setUserProfile), []);

    useEffect(() => {
        if (!showToolsMenu) {
            return undefined;
        }

        const handlePointerDown = (event) => {
            if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target)) {
                setShowToolsMenu(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, [showToolsMenu]);

    const marketAccessContext = useMemo(() => (
        buildCapabilityMarketAccessContextFromCatalog({
            skills: buildSkillDefinitions(loadSkillDefinitionState()),
            mcps: buildMcpDefinitions(loadMcpDefinitionState()),
            installs: loadUserCapabilityInstalls(userProfile),
        })
    ), [userProfile]);

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

    const persistConversation = useCallback((nextMessages, meta) => {
        try {
            const updatedComplete = Array.isArray(nextMessages) ? nextMessages : [];
            const sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
            const sid = ensureClientSessionKey(sessionId);

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
    }, [sessionId]);

    const sendToAI = useCallback(async (allMessages) => {
        setIsTyping(true);

        const latestUserMessage = [...allMessages].reverse().find((message) => message.role === 'user');
        const activeUserProfile = userProfile || loadCampusUserProfile();
        let unreadSummary = '';
        let approvalSummary = '';

        if (latestUserMessage) {
            if (shouldAttachUnreadSummary(latestUserMessage.content)) {
                try {
                    const syncedMessages = await syncStudyNoticeMessages({
                        uid: activeUserProfile.uid,
                        fid: activeUserProfile.fid,
                    });
                    const unreadItems = Array.isArray(syncedMessages)
                        ? syncedMessages.filter((item) => !item.read)
                        : [];
                    unreadSummary = buildUnreadSummary(unreadItems, formatCenterMessageTime);
                } catch {
                    unreadSummary = '';
                }
            }

            if (shouldAttachApprovalSummary(latestUserMessage.content)) {
                try {
                    const approvalState = await syncCampusApprovals({
                        uid: activeUserProfile.uid,
                        fid: activeUserProfile.fid,
                    });
                    approvalSummary = buildApprovalSummary({
                        pending: approvalState.pending,
                        pendingCount: approvalState.pendingCount,
                        initiated: approvalState.initiated,
                        initiatedCount: approvalState.initiatedCount,
                        records: approvalState.records,
                        recordsByStatus: approvalState.recordsByStatus,
                        recordCountsByStatus: approvalState.recordCountsByStatus,
                        formatter: formatCenterMessageTime,
                    });
                } catch {
                    approvalSummary = '';
                }
            }
        }

        const memorySnapshot = buildFireflyMemorySnapshot({
            uid: activeUserProfile.uid,
            capabilityIds: activeCapabilityIds,
            question: latestUserMessage?.content || '',
            limit: 4,
        });
        const sessionThreadKey = ensureClientSessionKey(sessionId);
        const baseRuntimeContext = {
            ...(launchRuntimeContextRef.current || {}),
            ...(latestUserMessage?.context || {}),
            webSearchEnabled,
            deepResearchEnabled,
            ...(unreadSummary ? { unreadSummary } : {}),
            ...(approvalSummary ? { approvalSummary } : {}),
            ...(memorySnapshot.markdown ? {
                memorySummary: memorySnapshot.markdown,
                memoryIds: memorySnapshot.items.map((item) => item.id),
            } : {}),
        };

        const placeholderEntry = {
            role: 'ai',
            content: buildPendingAgentContent(),
            time: new Date(),
            streaming: true,
            modelId: activeModelId,
            messageKind: 'runtime-trace',
            runtimeTask: null,
            runtimePhase: 'planning',
            traceExpanded: true,
        };
        setMessages((prev) => [...prev, placeholderEntry]);

        const updateStreamingMessage = (content, streaming = true) => {
            setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'ai') {
                    updated[lastIdx] = {
                        ...updated[lastIdx],
                        content,
                        streaming,
                        modelId: activeModelId,
                    };
                }
                return updated;
            });
        };

        const updateRuntimeTraceMessage = (task, phase = 'running') => {
            setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'ai') {
                    updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: '',
                        messageKind: 'runtime-trace',
                        runtimeTask: task || updated[lastIdx].runtimeTask || null,
                        runtimePhase: phase,
                        streaming: phase === 'running',
                        traceExpanded: phase === 'running',
                        modelId: activeModelId,
                    };
                }
                return updated;
            });
        };

        try {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            const runtimeThreadKey = String(
                launchThreadKeyRef.current
                || baseRuntimeContext.threadKey
                || sessionId
                || sessionThreadKey
            ).trim();
            let runtimeRecoveryContext = null;

            try {
                runtimeRecoveryContext = await refreshRuntimeRecovery(runtimeThreadKey);
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw error;
                }
            }

            const mergedRuntimeContext = {
                ...baseRuntimeContext,
                ...marketAccessContext,
                ...((baseRuntimeContext?.resumeMode && runtimeRecoveryContext?.summary) ? {
                    runtimeRecoverySummary: runtimeRecoveryContext.summary,
                    parentTaskId: runtimeRecoveryContext.task?.id || baseRuntimeContext.parentTaskId || '',
                    taskTitle: runtimeRecoveryContext.task?.title || baseRuntimeContext.taskTitle || '',
                    taskGoal: runtimeRecoveryContext.task?.goal || baseRuntimeContext.taskGoal || '',
                    taskResultSummary: runtimeRecoveryContext.task?.resultSummary || baseRuntimeContext.taskResultSummary || '',
                    taskMemorySummary: runtimeRecoveryContext.summary,
                    taskSelectedSkills: runtimeRecoveryContext.task?.selectedSkillLabels || [],
                } : {}),
                ...((baseRuntimeContext?.resumeMode && runtimeRecoveryContext?.preferredToolIds?.length) ? {
                    preferredToolIds: runtimeRecoveryContext.preferredToolIds,
                } : {}),
            };

            try {
                const agentResponse = await fetch('/api/firefly/agent/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question: latestUserMessage?.content || '',
                        threadKey: runtimeThreadKey,
                        capabilityIds: activeCapabilityIds,
                        contextSnapshot: mergedRuntimeContext,
                        uid: activeUserProfile.uid,
                        fid: activeUserProfile.fid,
                    }),
                    signal: abortControllerRef.current.signal,
                });

                if (!agentResponse.ok) {
                    let agentErrorMessage = `萤火虫接口异常（${agentResponse.status}）`;

                    try {
                        const payload = await agentResponse.json();
                        if (payload?.error) {
                            agentErrorMessage = payload.error;
                        }
                    } catch {
                        try {
                            const text = await agentResponse.text();
                            if (text) {
                                agentErrorMessage = text;
                            }
                        } catch {
                            // ignore response parsing errors
                        }
                    }

                    throw new Error(agentErrorMessage);
                }

                if (agentResponse.body) {
                    const reader = agentResponse.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    let latestTask = null;
                    let finalTask = null;
                    let finalReply = '';
                    let shouldFallbackToChat = true;
                    let agentHandled = false;

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
                                if (parsed.task?.id) {
                                    latestTask = {
                                        ...parsed.task,
                                        sessionId: runtimeThreadKey,
                                        resumeContext: mergedRuntimeContext,
                                    };
                                    upsertFireflyTask(latestTask);
                                }

                                if (parsed.type === 'error') {
                                    throw new Error(parsed.message || '萤火虫任务执行失败，请稍后重试。');
                                }

                                if (parsed.type === 'unhandled') {
                                    updateStreamingMessage(buildPendingAgentContent('fallback'));
                                    shouldFallbackToChat = true;
                                    continue;
                                }

                                if (['task_created', 'plan_ready', 'task_started', 'step_started', 'step_completed', 'step_failed'].includes(parsed.type)) {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    updateRuntimeTraceMessage(
                                        latestTask,
                                        latestTask?.status === 'failed' || parsed.type === 'step_failed' ? 'failed' : 'running'
                                    );
                                    continue;
                                }

                                if (parsed.type === 'task_completed' || parsed.type === 'task_failed') {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    finalTask = parsed.task
                                        ? {
                                            ...parsed.task,
                                            sessionId: runtimeThreadKey,
                                            resumeContext: mergedRuntimeContext,
                                        }
                                        : latestTask;
                                    finalReply = parsed.reply || buildStreamingTaskContent(finalTask, parsed.type === 'task_failed' ? 'failed' : 'completed');
                                    updateRuntimeTraceMessage(finalTask, parsed.type === 'task_failed' ? 'failed' : 'completed');
                                    continue;
                                }

                                if (parsed.type === 'done') {
                                    shouldFallbackToChat = !parsed.handled;
                                    if (parsed.handled) {
                                        agentHandled = true;
                                        finalTask = parsed.task
                                            ? {
                                                ...parsed.task,
                                                sessionId: runtimeThreadKey,
                                                resumeContext: mergedRuntimeContext,
                                            }
                                            : (finalTask || latestTask);
                                        finalReply = parsed.reply || finalReply || buildStreamingTaskContent(finalTask, 'completed');
                                    }
                                    continue;
                                }
                            } catch (streamError) {
                                if (streamError instanceof Error) {
                                    throw streamError;
                                }
                            }
                        }
                    }

                    if (agentHandled && !shouldFallbackToChat) {
                        const finalContent = finalReply || buildStreamingTaskContent(finalTask, finalTask?.status === 'failed' ? 'failed' : 'completed');
                        const finalizedTraceMessage = buildRuntimeTraceMessage(
                            finalTask || latestTask,
                            finalTask?.status === 'failed' ? 'failed' : 'completed',
                            activeModelId
                        );
                        const finalAssistantMessage = buildAssistantMessage(finalContent, activeModelId);
                        const finalMessages = [...allMessages, finalizedTraceMessage, finalAssistantMessage];
                        setMessages(finalMessages);

                        const persistedSessionId = persistConversation(finalMessages, {
                            capabilityIds: activeCapabilityIds,
                            modelId: activeModelId,
                            webSearchEnabled,
                            deepResearchEnabled,
                            runtimeMode: 'agent',
                        });

                        if (finalTask?.id) {
                            upsertFireflyTask(finalTask);
                            const memoryEntry = rememberFireflyTask(finalTask, {
                                uid: activeUserProfile.uid,
                                fid: activeUserProfile.fid,
                                sessionId: persistedSessionId,
                            });
                            const mergedMemoryIds = [
                                ...(Array.isArray(finalTask.memoryIds) ? finalTask.memoryIds : []),
                                ...(memoryEntry ? [memoryEntry.id] : []),
                            ].filter((item, index, array) => item && array.indexOf(item) === index);
                            patchFireflyTask(finalTask.id, {
                                sessionId: persistedSessionId,
                                resumeContext: mergedRuntimeContext,
                                memoryIds: mergedMemoryIds,
                            });
                        }

                        launchRuntimeContextRef.current = null;
                        launchThreadKeyRef.current = null;
                        refreshRuntimeRecovery(runtimeThreadKey);
                        return;
                    }
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw error;
                }
            }

            let apiMessages = buildFallbackChatHistory(allMessages, latestUserMessage);

            if (latestUserMessage && (unreadSummary || approvalSummary || memorySnapshot.markdown)) {
                const contextSections = ['你可以访问当前校园工作台中已经同步的业务数据。'];
                if (unreadSummary) contextSections.push(`未读消息摘要：\n${unreadSummary}`);
                if (approvalSummary) contextSections.push(`审批摘要：\n${approvalSummary}`);
                if (memorySnapshot.markdown) contextSections.push(memorySnapshot.markdown);
                contextSections.push(
                    `用户问题：${latestUserMessage.content}`,
                    isTroubleshootingQuestion(latestUserMessage.content)
                        ? '用户当前是在追问排障或认证问题。请优先解释失败原因、缺少的认证条件和下一步排查动作，不要继续生成审批/消息汇总文档。'
                        : '请优先基于以上摘要直接回答，不要再说“系统未接入”或“无法获取数据”。请使用清晰的 Markdown 结构，适合时用小标题和列表组织信息。如果需要给用户返回链接，请使用 Markdown 链接格式，例如 [查看详情](/messages/xx) 或 [打开审批](https://example.com)，不要直接输出长网址。若摘要显示为空，就明确告诉用户当前没有对应数据。'
                );

                const targetIndex = apiMessages.map((message, index) => ({ ...message, index })).reverse().find((message) => message.role === 'user');
                if (typeof targetIndex?.index === 'number') {
                    apiMessages = apiMessages.map((message, index) => (
                        index === targetIndex.index
                            ? { ...message, content: contextSections.join('\n\n') }
                            : message
                    ));
                }
            }

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
                let chatErrorMessage = `聊天接口异常（${response.status}）`;

                try {
                    const payload = await response.json();
                    if (payload?.error) {
                        chatErrorMessage = payload.error;
                    }
                } catch {
                    try {
                        const text = await response.text();
                        if (text) {
                            chatErrorMessage = text;
                        }
                    } catch {
                        // ignore response parsing errors
                    }
                }

                throw new Error(chatErrorMessage);
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
                        if (!parsed.content) continue;
                        fullContent += parsed.content;
                        updateStreamingMessage(fullContent);
                    } catch {
                        // skip malformed JSON chunks
                    }
                }
            }

            const finalContent = fullContent || '抱歉，我暂时无法回答这个问题，请稍后再试。';
            const finalMessages = [...allMessages, buildAssistantMessage(finalContent, activeModelId)];
            setMessages(finalMessages);

            const persistedSessionId = persistConversation(finalMessages, {
                capabilityIds: activeCapabilityIds,
                modelId: activeModelId,
                webSearchEnabled,
                deepResearchEnabled,
                runtimeMode: 'chat_fallback',
            });

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
            } catch {}

            launchRuntimeContextRef.current = null;
            launchThreadKeyRef.current = null;
            refreshRuntimeRecovery(sessionThreadKey);
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Chat error:', error);
            const message = error instanceof Error && error.message
                ? `⚠️ ${error.message}`
                : '⚠️ 网络连接异常，请检查网络后重试。';
            updateStreamingMessage(message, false);
        } finally {
            setIsTyping(false);
        }
    }, [persistConversation, activeCapabilityIds, activeModelId, webSearchEnabled, deepResearchEnabled, sessionId, refreshRuntimeRecovery, userProfile]);

    // Handle initial message from landing page
    useEffect(() => {
        if (initialMessage && !hasInitialized.current) {
            hasInitialized.current = true;
            const userMsg = {
                role: 'user',
                content: initialMessage,
                time: new Date(),
                context: launchRuntimeContextRef.current || {},
            };
            setMessages([userMsg]);
            sendToAI([userMsg]);
        }
    }, [initialMessage, sendToAI]);

    const handleSend = () => {
        const message = inputValue.trim();
        if (!message || isTyping) return;
        setShowToolsMenu(false);
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

    const handlePrefillPrompt = (prompt) => {
        setInputValue(prompt);
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
        });
    };

    const firstUserMessage = messages.find((message) => message.role === 'user')?.content || initialMessage || '新的校园任务';
    const workspaceTitle = firstUserMessage.length > 40 ? `${firstUserMessage.slice(0, 40)}...` : firstUserMessage;
    const activeCapabilities = activeCapabilityIds.map((id) => capabilityMap[id]).filter(Boolean);
    const activeModel = resolveChatModel(activeModelId || preferredModelId);
    const capabilitySummary = activeCapabilities.map((capability) => capability.name).join('、');
    const isMinimal = variant === 'minimal';
    const hasConversation = messages.length > 0 || isTyping;
    const runtimeRecoveryLabel = runtimeRecovery?.task?.title || runtimeRecovery?.session?.title || '最近任务';
    const runtimeRecoveryStatus = runtimeRecovery?.task?.status || runtimeRecovery?.run?.phase || '可恢复';
    const workspaceBadges = hasConversation
        ? [
            sessionId ? '历史会话' : '当前对话',
            activeModel?.label || '默认模型',
            `${activeCapabilities.length} 个校园能力`,
        ]
        : [
            sessionId ? '历史会话' : '当前工作区',
            'Agent Runtime',
            activeModel?.label || '默认模型',
            `${activeCapabilities.length} 个校园能力`,
        ];

    const renderToolsMenu = () => (
        <div className="chat-floating-menu glass-strong tools-menu">
            <div className="chat-floating-section">
                <div className="chat-floating-section-title">对话设置</div>
                <label className="chat-floating-select">
                    <span>模型</span>
                    <select value={activeModelId} onChange={handleModelChange}>
                        {availableModels.map((model) => (
                            <option key={model.id} value={model.id}>
                                {model.label}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="chat-floating-toggle-row">
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
                </div>
                <button
                    className={`chat-floating-action ${isListening ? 'active' : ''}`}
                    type="button"
                    onClick={handleVoiceInput}
                >
                    <strong>{isListening ? '停止语音输入' : '语音输入'}</strong>
                    <span>{isListening ? '正在监听你的语音' : '把语音转成输入内容'}</span>
                </button>
            </div>
            <div className="chat-floating-section">
                <div className="chat-floating-section-title">已接入能力</div>
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
        </div>
    );

    return (
        <div className={`chat-area ${isMinimal ? 'minimal' : ''}`}>
            <div className="messages-container">
                <div className="chat-container-inner">
                    <div className={`chat-workspace-head glass ${hasConversation ? 'compact' : ''}`}>
                        <div className="chat-workspace-copy">
                            {!isMinimal && (
                                <span className="chat-workspace-badge">萤火虫工作区</span>
                            )}
                            <h2 className="chat-workspace-title">{workspaceTitle}</h2>
                            {!isMinimal && !hasConversation && (
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

                    {runtimeRecovery?.available && (
                        <div className="chat-runtime-strip glass">
                            <div className="chat-runtime-strip-copy">
                                <span className="chat-runtime-strip-kicker">恢复</span>
                                <strong>{runtimeRecoveryLabel}</strong>
                                <span>上次任务仍可继续</span>
                            </div>
                            <div className="chat-runtime-strip-actions">
                                <span className="chat-runtime-strip-summary">{runtimeRecoveryStatus}</span>
                                <Link
                                    href={`/runtime?threadKey=${encodeURIComponent(runtimeRecovery.threadKey)}`}
                                    className="chat-runtime-strip-link"
                                >
                                    查看详情
                                </Link>
                            </div>
                        </div>
                    )}

                    {messages.length === 0 && !isTyping ? (
                        <div className="chat-empty">
                            <div className="empty-icon glass-strong">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                            </div>
                            <p>我是萤火虫，可以先帮你梳理待办、补齐上下文，再把结果整理成清楚的动作清单。</p>
                            <div className="chat-empty-actions">
                                {fireflyStarterPrompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        className="chat-empty-action"
                                        onClick={() => handlePrefillPrompt(prompt)}
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, idx) => (
                            <div key={idx} className={`message ${msg.role === 'user' ? 'user' : 'ai'}`}>
                                {msg.role !== 'user' && (
                                    <div className="msg-avatar ai-av">
                                        <FireflyMark size={18} className="msg-firefly-mark" decorative />
                                    </div>
                                )}
                                {msg.messageKind === 'runtime-trace' && msg.runtimeTask ? (
                                    <FireflyRuntimeCard
                                        task={msg.runtimeTask}
                                        defaultExpanded={Boolean(msg.traceExpanded)}
                                        timeLabel={msg.streaming ? '正在运行' : formatTime(msg.time)}
                                    />
                                ) : (
                                    <div className="msg-bubble">
                                        <div className="msg-content">
                                            {renderRichMessageContent(msg.content)}
                                            {msg.streaming && <span className="streaming-cursor">|</span>}
                                        </div>
                                        <div className="msg-meta">
                                            <span className="msg-time">
                                                {msg.streaming ? '正在生成' : formatTime(msg.time)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {msg.role === 'user' && (
                                    <div className="msg-avatar user-av">
                                        <img
                                            src={userProfile?.avatar || '/user-avatar.png'}
                                            alt={userProfile?.name || '用户头像'}
                                            className="msg-avatar-image"
                                        />
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                    {isTyping && !messages.find(m => m.streaming) && (
                        <div className="message ai typing-indicator">
                            <div className="msg-avatar ai-av">
                                <FireflyMark size={18} className="msg-firefly-mark" decorative />
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
                                    rows={3}
                                />
                            </div>
                            <div
                                className="chat-composer-footer"
                                onMouseDown={preventComposerFocusSteal}
                                onClick={preventComposerFocusSteal}
                            >
                                <div className="chat-composer-tools">
                                    <div className="chat-menu-wrap" ref={toolsMenuRef}>
                                        <button className={`chat-tool-chip ${showToolsMenu ? 'active' : ''}`} type="button" onClick={() => setShowToolsMenu((prev) => !prev)}>
                                            工具
                                        </button>
                                        {showToolsMenu && renderToolsMenu()}
                                    </div>
                                    <span className="chat-inline-config" title={capabilitySummary}>
                                        {activeModel?.label || '默认模型'} · {activeCapabilities.length} 个能力
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
                    ) : (
                        <div
                            className="chat-input-box glass-strong"
                            onClick={() => textareaRef.current?.focus()}
                        >
                            <textarea
                                ref={textareaRef}
                                className="chat-textarea"
                                placeholder="描述目标、补充背景，或直接粘贴待整理内容..."
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
                                    <div className="chat-menu-wrap" ref={toolsMenuRef}>
                                        <button className={`chat-tool-chip ${showToolsMenu ? 'active' : ''}`} type="button" onClick={() => setShowToolsMenu((prev) => !prev)}>
                                            工具
                                        </button>
                                        {showToolsMenu && renderToolsMenu()}
                                    </div>
                                    <span className="chat-inline-config" title={capabilitySummary}>
                                        {activeModel?.label || '默认模型'} · {activeCapabilities.length} 个能力
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
                    <div className="chat-footer-hint">Enter 发送，Shift + Enter 换行。AI 生成内容仅供参考，涉及制度与流程时请以校园正式通知为准。</div>
                </div>
            </div>
        </div>
    );
}
