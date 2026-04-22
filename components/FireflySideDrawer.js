'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    loadApprovalCenterState,
    syncCampusApprovals,
} from '@/data/approvalCenter';
import {
    consumePendingFireflyAction,
    formatMessageTime,
    loadMessageCenterItems,
    syncStudyNoticeMessages,
} from '@/data/messageCenter';
import {
    buildMcpDefinitions,
    loadMcpDefinitionState,
} from '@/data/mcp';
import { upsertFireflyTask } from '@/data/fireflyTasks';
import {
    buildSkillDefinitions,
    loadSkillDefinitionState,
} from '@/data/skills';
import {
    loadCampusUserProfile,
    subscribeCampusUserProfile,
} from '@/data/userProfile';
import {
    buildCapabilityMarketAccessContextFromCatalog,
    loadUserCapabilityInstalls,
    subscribeUserCapabilityInstalls,
} from '@/data/capabilityMarket';
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
import {
    isFireflyRuntimeTaskStreaming,
    requestFireflyRuntimeControl,
    resolveFireflyRuntimeTaskPhase,
} from '@/lib/fireflyRuntimeControlClient';
import { shouldInjectCampusContext as shouldInjectCampusContextForQuestion } from '@/lib/fireflyResponseMode';
import {
    buildApprovalSummary,
    buildUnreadSummary,
    renderRichMessageContent,
} from '@/components/RichMessageContent';
import FireflyControlPlanePanel from '@/components/FireflyControlPlanePanel';
import FireflyRuntimeStrip from '@/components/FireflyRuntimeStrip';
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

function buildRenderableMessages(messages = []) {
    const blocks = [];

    for (let index = 0; index < messages.length; index += 1) {
        const current = messages[index];
        const next = messages[index + 1];

        if (
            current?.messageKind === 'runtime-trace'
            && current?.runtimeTask
            && next?.role === 'ai'
            && next?.messageKind === 'assistant-final'
        ) {
            blocks.push({
                type: 'assistant-with-runtime',
                assistant: next,
                runtime: current,
                key: `drawer-assistant-runtime-${current.id || index}-${next.id || index + 1}`,
            });
            index += 1;
            continue;
        }

        blocks.push({
            type: 'message',
            message: current,
            key: `drawer-message-${current?.id || index}`,
        });
    }

    return blocks;
}

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

function buildFallbackThreadHistory(messages = [], latestQuestion = '') {
    const compactMessages = messages
        .filter((message) => String(message?.content || '').trim())
        .map((message) => ({
            role: message.role === 'ai' ? 'assistant' : 'user',
            content: String(message.content || '').trim(),
        }));

    if (!compactMessages.length) {
        return compactMessages;
    }

    if (isTroubleshootingQuestion(latestQuestion)) {
        const lastFailureIndex = [...messages]
            .map((message, index) => ({ message, index }))
            .reverse()
            .find(({ message }) => isFailureLikeAssistantMessage(message))?.index;

        if (typeof lastFailureIndex === 'number') {
            return messages
                .slice(Math.max(0, lastFailureIndex - 1))
                .filter((message) => String(message?.content || '').trim())
                .map((message) => ({
                    role: message.role === 'ai' ? 'assistant' : 'user',
                    content: String(message.content || '').trim(),
                }))
                .slice(-4);
        }
    }

    return compactMessages.slice(-8);
}

function formatTaskStatus(status = '') {
    switch (status) {
    case 'planning':
        return '规划中';
    case 'running':
        return '执行中';
    case 'completed':
        return '已完成';
    case 'failed':
        return '执行失败';
    default:
        return status || '处理中';
    }
}

function formatStepStatus(status = '') {
    switch (status) {
    case 'pending':
        return '待开始';
    case 'running':
        return '进行中';
    case 'completed':
        return '已完成';
    case 'failed':
        return '失败';
    default:
        return status || '处理中';
    }
}

function formatTaskLogTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function buildPendingAgentContent(mode = 'planning') {
    if (mode === 'fallback') {
        return [
            '## 已切换到普通对话',
            '- 当前问题没有命中特定可执行技能。',
            '- 我会继续基于当前上下文直接回答，并把内容逐步显示在这里。',
        ].join('\n');
    }

    return [
        '## 萤火虫正在准备',
        '- 正在识别可执行能力。',
        '- 接下来会把执行步骤和中间结果逐步显示在这里。',
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

    if (task.reasoning?.length) {
        lines.push('', '## 调度判断');
        task.reasoning.forEach((item, index) => {
            lines.push(`${index + 1}. ${item}`);
        });
    }

    if (task.steps?.length) {
        lines.push('', '## 执行步骤');
        task.steps.forEach((step, index) => {
            const summary = step.summary ? `｜${step.summary}` : '';
            lines.push(`${index + 1}. ${step.label}｜${formatStepStatus(step.status)}${summary}`);
        });
    }

    const recentLogs = Array.isArray(task.executionLogs)
        ? task.executionLogs.slice(-6)
        : [];

    if (recentLogs.length) {
        lines.push('', '## 最新进展');
        recentLogs.forEach((log) => {
            const timeLabel = formatTaskLogTime(log.createdAt);
            lines.push(`- ${timeLabel ? `${timeLabel} ` : ''}${log.message}`);
        });
    }

    const artifacts = Array.isArray(task.artifacts)
        ? task.artifacts.slice(-3)
        : [];

    if (artifacts.length) {
        lines.push('', '## 当前产出');
        artifacts.forEach((artifact) => {
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

function persistWorkspacePreferredModel(modelId) {
    mergeWorkspacePrefs({ modelId });
}

function appendAgentModelDisclosure(content = '', modelId = '') {
    const normalized = String(content || '').trim();
    const label = String(resolveChatModel(modelId)?.label || modelId || '大模型').trim();
    const disclosure = `本次回复来自“${label}”整理生成，请注意甄别。`;

    if (!normalized) {
        return disclosure;
    }

    if (normalized.includes(disclosure)) {
        return normalized;
    }

    return `${normalized}\n\n---\n\n${disclosure}`;
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
    chromeMode = 'minimal',
}) {
    const showRichChrome = chromeMode !== 'minimal';
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
    const [campusUserProfile, setCampusUserProfile] = useState(() => loadCampusUserProfile());
    const [capabilityInstalls, setCapabilityInstalls] = useState(() => loadUserCapabilityInstalls(loadCampusUserProfile()));
    const [runtimeControlState, setRuntimeControlState] = useState({
        pendingAction: '',
        taskId: '',
        stepId: '',
        message: '',
        error: '',
    });

    const shellRef = useRef(null);
    const textareaRef = useRef(null);
    const messagesEndRef = useRef(null);
    const abortControllerRef = useRef(null);
    const controlRef = useRef({
        isControlled: false,
        onOpenChange: null,
    });
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
    const drawerMarketAccess = useMemo(() => (
        buildCapabilityMarketAccessContextFromCatalog({
            skills: buildSkillDefinitions(loadSkillDefinitionState()),
            mcps: buildMcpDefinitions(loadMcpDefinitionState()),
            installs: capabilityInstalls,
        }).marketAccess
    ), [capabilityInstalls]);
    const renderableMessages = useMemo(
        () => buildRenderableMessages(currentThread),
        [currentThread]
    );
    const activeModel = resolveChatModel(activeModelId);
    const enrichTaskForStorage = useCallback((task) => ({
        ...task,
        uiContext: {
            ...(task?.uiContext || {}),
            pathname,
            storageNamespace,
            historyOrigin,
            drawerThreadKey: threadKey,
            capabilityIds: [...capabilityIds],
            surfaceLabel: contextChips?.[0] || title || launcherLabel,
            pageLabel: contextChips?.[1] || '',
            secondaryHref: secondaryAction?.href || '',
            launcherLabel,
        },
    }), [
        capabilityIds,
        contextChips,
        historyOrigin,
        launcherLabel,
        pathname,
        secondaryAction?.href,
        storageNamespace,
        threadKey,
        title,
    ]);
    const applyRuntimeControlResultToThread = useCallback((items = [], {
        taskId = '',
        nextTask = null,
        nextReply = '',
    } = {}) => {
        const normalizedTaskId = String(taskId || '').trim();
        if (!normalizedTaskId) {
            return items;
        }

        const updated = Array.isArray(items) ? [...items] : [];
        const traceIndex = updated.findIndex((message) => (
            message?.messageKind === 'runtime-trace'
            && String(message?.runtimeTask?.id || '').trim() === normalizedTaskId
        ));

        if (traceIndex < 0) {
            return items;
        }

        const traceMessage = updated[traceIndex];
        const nextRuntimeTask = nextTask || traceMessage.runtimeTask || null;

        updated[traceIndex] = {
            ...traceMessage,
            runtimeTask: nextRuntimeTask,
            runtimePhase: resolveFireflyRuntimeTaskPhase(nextRuntimeTask),
            streaming: isFireflyRuntimeTaskStreaming(nextRuntimeTask),
            time: new Date().toISOString(),
            modelId: activeModelId,
        };

        if (nextReply) {
            const assistantIndex = traceIndex + 1;
            const assistantMessage = updated[assistantIndex];
            const nextContent = appendAgentModelDisclosure(nextReply, activeModelId);

            if (assistantMessage?.role === 'ai' && assistantMessage?.messageKind === 'assistant-final') {
                updated[assistantIndex] = {
                    ...assistantMessage,
                    content: nextContent,
                    streaming: false,
                    time: new Date().toISOString(),
                    modelId: activeModelId,
                };
            } else {
                updated.splice(assistantIndex, 0, {
                    id: uid('drawer-msg'),
                    role: 'ai',
                    content: nextContent,
                    time: new Date().toISOString(),
                    streaming: false,
                    modelId: activeModelId,
                    messageKind: 'assistant-final',
                });
            }
        }

        return updated;
    }, [activeModelId]);

    const handleRuntimeControlAction = useCallback(async (action, task, stepId = '') => {
        const taskId = String(task?.id || '').trim();
        if (!taskId) {
            return;
        }

        setRuntimeControlState({
            pendingAction: action,
            taskId,
            stepId,
            message: '',
            error: '',
        });

        try {
            const result = await requestFireflyRuntimeControl({
                action,
                taskId,
                stepId,
                uid: campusUserProfile.uid,
                fid: campusUserProfile.fid,
            });
            const nextTask = result.task ? enrichTaskForStorage(result.task) : null;

            if (nextTask?.id) {
                upsertFireflyTask(nextTask);
            }

            setThreads((prev) => ({
                ...prev,
                [threadKey]: applyRuntimeControlResultToThread(prev[threadKey] || [], {
                    taskId,
                    nextTask,
                    nextReply: result.reply,
                }),
            }));
            setRuntimeControlState({
                pendingAction: '',
                taskId,
                stepId,
                message: result.message,
                error: '',
            });
        } catch (error) {
            setRuntimeControlState({
                pendingAction: '',
                taskId,
                stepId,
                message: '',
                error: error instanceof Error ? error.message : '运行控制动作执行失败。',
            });
        }
    }, [
        applyRuntimeControlResultToThread,
        campusUserProfile.fid,
        campusUserProfile.uid,
        enrichTaskForStorage,
        threadKey,
    ]);

    const setDrawerOpen = useCallback((nextValue) => {
        if (typeof isOpen === 'boolean') {
            onOpenChange?.(nextValue);
            return;
        }

        setInternalOpen(nextValue);
        onOpenChange?.(nextValue);
    }, [isOpen, onOpenChange]);

    useEffect(() => {
        controlRef.current = {
            isControlled: typeof isOpen === 'boolean',
            onOpenChange,
        };
    }, [isOpen, onOpenChange]);

    useEffect(() => {
        setCapabilityInstalls(loadUserCapabilityInstalls(campusUserProfile));
        return subscribeUserCapabilityInstalls(campusUserProfile, setCapabilityInstalls);
    }, [campusUserProfile]);

    useEffect(() => subscribeCampusUserProfile(setCampusUserProfile), []);

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
        if (!Array.isArray(availableModels) || availableModels.length === 0) {
            return;
        }

        if (!availableModels.some((item) => item.id === activeModelId)) {
            setActiveModelId(availableModels[0].id);
        }
    }, [activeModelId, availableModels]);

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
        if (controlRef.current.isControlled) {
            controlRef.current.onOpenChange?.(false);
            return;
        }

        setInternalOpen(false);
        controlRef.current.onOpenChange?.(false);
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
    }, [historyOrigin, setDrawerOpen, storageNamespace]);

    useEffect(() => {
        const pendingAction = consumePendingFireflyAction([storageNamespace, historyOrigin]);
        if (pendingAction) {
            setDrawerOpen(true);
        }
    }, [historyOrigin, setDrawerOpen, storageNamespace]);

    useEffect(() => () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    const pushTaskNotification = (content, task = null) => {
        const baseSummary = task?.resultSummary || content || '';
        const summary = String(baseSummary).replace(/\s+/g, ' ').trim().slice(0, 72);
        publishCampusNotification({
            id: uid('message'),
            sourceId: 'firefly',
            title: task?.title ? `${launcherLabel} 已完成：${task.title}` : `${launcherLabel} 已完成`,
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
                taskId: task?.id || null,
                taskStatus: task?.status || null,
                selectedSkillIds: task?.selectedSkillIds || [],
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

        let unreadSummary = null;
        let approvalSummary = null;
        const userProfile = loadCampusUserProfile();
        const marketAccessContext = buildCapabilityMarketAccessContextFromCatalog({
            skills: buildSkillDefinitions(loadSkillDefinitionState()),
            mcps: buildMcpDefinitions(loadMcpDefinitionState()),
            installs: loadUserCapabilityInstalls(userProfile),
        });

        if (shouldAttachUnreadSummary(question)) {
            try {
                const syncedMessages = await syncStudyNoticeMessages({
                    uid: userProfile.uid,
                    fid: userProfile.fid,
                });
                const unreadItems = Array.isArray(syncedMessages)
                    ? syncedMessages.filter((item) => !item.read)
                    : [];
                unreadSummary = buildUnreadSummary(unreadItems, formatMessageTime);
            } catch {
                unreadSummary = null;
            }
        }

        if (shouldAttachApprovalSummary(question)) {
            try {
                const approvalState = await syncCampusApprovals({
                    uid: userProfile.uid,
                    fid: userProfile.fid,
                });
                approvalSummary = buildApprovalSummary({
                    pending: approvalState.pending,
                    pendingCount: approvalState.pendingCount,
                    initiated: approvalState.initiated,
                    initiatedCount: approvalState.initiatedCount,
                    records: approvalState.records,
                    recordsByStatus: approvalState.recordsByStatus,
                    recordCountsByStatus: approvalState.recordCountsByStatus,
                    formatter: formatMessageTime,
                });
            } catch {
                approvalSummary = null;
            }
        }

        const cleanThread = currentThread.filter((item) => !item.streaming);
        const mergedContext = {
            ...(contextSnapshot || {}),
            ...marketAccessContext,
            ...(unreadSummary ? { unreadSummary } : {}),
            ...(approvalSummary ? { approvalSummary } : {}),
        };
        const userEntry = {
            id: uid('drawer-msg'),
            role: 'user',
            content: question,
            time: new Date().toISOString(),
            context: mergedContext,
        };
        const placeholderEntry = {
            id: uid('drawer-msg'),
            role: 'ai',
            content: buildPendingAgentContent(),
            time: new Date().toISOString(),
            streaming: true,
            modelId: activeModelId,
            messageKind: 'runtime-trace',
            runtimeTask: null,
            runtimePhase: 'planning',
            traceExpanded: false,
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
            contextSnapshot: mergedContext,
        });

        try {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }

            abortControllerRef.current = new AbortController();

            try {
                const agentResponse = await fetch('/api/firefly/agent/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        question,
                        threadKey,
                        capabilityIds,
                        contextSnapshot: mergedContext,
                        uid: userProfile.uid,
                        fid: userProfile.fid,
                    }),
                    signal: abortControllerRef.current.signal,
                });

                if (agentResponse.ok && agentResponse.body) {
                    const applyAgentContent = (content, streaming = true) => {
                        setThreads((prev) => ({
                            ...prev,
                            [threadKey]: [
                                ...baseThread,
                                {
                                    ...placeholderEntry,
                                    content,
                                    messageKind: 'assistant-final',
                                    runtimeTask: null,
                                    streaming,
                                    modelId: activeModelId,
                                },
                            ],
                        }));
                    };
                    const applyAgentTrace = (task, phase = 'running') => {
                        setThreads((prev) => ({
                            ...prev,
                            [threadKey]: [
                                ...baseThread,
                                {
                                    ...placeholderEntry,
                                    content: '',
                                    messageKind: 'runtime-trace',
                                    runtimeTask: task || null,
                                    runtimePhase: phase,
                                    streaming: phase === 'running',
                                    modelId: activeModelId,
                                    traceExpanded: false,
                                },
                            ],
                        }));
                    };
                    const applyAgentReply = (task, content, streaming = true, phase = 'completed') => {
                        setThreads((prev) => ({
                            ...prev,
                            [threadKey]: [
                                ...baseThread,
                                {
                                    id: `${placeholderEntry.id}-trace`,
                                    role: 'ai',
                                    content: '',
                                    time: new Date().toISOString(),
                                    modelId: activeModelId,
                                    messageKind: 'runtime-trace',
                                    runtimeTask: task || null,
                                    runtimePhase: phase,
                                    streaming: phase === 'running',
                                    traceExpanded: false,
                                },
                                {
                                    id: placeholderEntry.id,
                                    role: 'ai',
                                    content,
                                    time: new Date().toISOString(),
                                    streaming,
                                    modelId: activeModelId,
                                    messageKind: 'assistant-final',
                                },
                            ],
                        }));
                    };
                    const reader = agentResponse.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    let agentHandled = false;
                    let shouldFallbackToChat = true;
                    let latestTask = null;
                    let finalTask = null;
                    let finalReply = '';

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

                                if (parsed.task?.id) {
                                    latestTask = enrichTaskForStorage(parsed.task);
                                    upsertFireflyTask(latestTask);
                                }

                                if (parsed.type === 'unhandled') {
                                    applyAgentContent(buildPendingAgentContent('fallback'));
                                    shouldFallbackToChat = true;
                                    continue;
                                }

                                if (parsed.type === 'task_created'
                                    || parsed.type === 'plan_ready'
                                    || parsed.type === 'task_started'
                                    || parsed.type === 'step_started'
                                    || parsed.type === 'step_completed'
                                    || parsed.type === 'step_failed') {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    applyAgentTrace(
                                        latestTask,
                                        latestTask?.status === 'failed' ? 'failed' : 'running'
                                    );
                                    continue;
                                }

                                if (parsed.type === 'task_completed' || parsed.type === 'task_failed') {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    finalTask = parsed.task
                                        ? enrichTaskForStorage(parsed.task)
                                        : latestTask;
                                    finalReply = parsed.reply || buildStreamingTaskContent(
                                        finalTask,
                                        parsed.type === 'task_failed' ? 'failed' : 'completed'
                                    );
                                    applyAgentTrace(finalTask, parsed.type === 'task_failed' ? 'failed' : 'completed');
                                    continue;
                                }

                                if (parsed.type === 'reply_started') {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    applyAgentReply(finalTask || latestTask, '', true, finalTask?.status === 'failed' ? 'failed' : 'completed');
                                    continue;
                                }

                                if (parsed.type === 'reply_delta') {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    finalReply += parsed.content || '';
                                    applyAgentReply(finalTask || latestTask, finalReply, true, finalTask?.status === 'failed' ? 'failed' : 'completed');
                                    continue;
                                }

                                if (parsed.type === 'reply_completed') {
                                    agentHandled = true;
                                    shouldFallbackToChat = false;
                                    applyAgentReply(
                                        finalTask || latestTask,
                                        appendAgentModelDisclosure(finalReply, activeModelId),
                                        false,
                                        finalTask?.status === 'failed' ? 'failed' : 'completed'
                                    );
                                    continue;
                                }

                                if (parsed.type === 'done') {
                                    shouldFallbackToChat = !parsed.handled;
                                    if (parsed.handled) {
                                        agentHandled = true;
                                        finalTask = parsed.task
                                            ? enrichTaskForStorage(parsed.task)
                                            : (finalTask || latestTask);
                                        finalReply = parsed.reply || finalReply || buildStreamingTaskContent(finalTask, 'completed');
                                    }
                                    continue;
                                }

                                if (parsed.type === 'error') {
                                    shouldFallbackToChat = true;
                                }
                            } catch {
                                // Ignore malformed SSE chunks.
                            }
                        }
                    }

                    if (agentHandled && !shouldFallbackToChat) {
                        const finalContent = appendAgentModelDisclosure(
                            finalReply || (
                                finalTask
                                    ? buildStreamingTaskContent(finalTask, finalTask.status === 'failed' ? 'failed' : 'completed')
                                    : (
                                        typeof buildFallbackReply === 'function'
                                            ? buildFallbackReply(mergedContext, question)
                                            : '我已经完成这轮任务调度，你可以继续追问更具体的下一步动作。'
                                    )
                            ),
                            activeModelId
                        );

                        if (finalTask) {
                            upsertFireflyTask(finalTask);
                        }

                        setThreads((prev) => ({
                            ...prev,
                            [threadKey]: [
                                ...baseThread,
                                {
                                    id: `${placeholderEntry.id}-trace`,
                                    role: 'ai',
                                    content: '',
                                    time: new Date().toISOString(),
                                    modelId: activeModelId,
                                    messageKind: 'runtime-trace',
                                    runtimeTask: finalTask || null,
                                    runtimePhase: finalTask?.status === 'failed' ? 'failed' : 'completed',
                                    streaming: false,
                                    traceExpanded: false,
                                },
                                {
                                    id: placeholderEntry.id,
                                    role: 'ai',
                                    content: finalContent,
                                    time: new Date().toISOString(),
                                    modelId: activeModelId,
                                    messageKind: 'assistant-final',
                                },
                            ],
                        }));
                        pushTaskNotification(finalContent, finalTask || null);
                        return;
                    }
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw error;
                }
            }

            const includeCampusContext = shouldInjectCampusContextForQuestion(question);
            const apiMessages = buildFallbackThreadHistory(baseThread, question).map((message, index, array) => {
                const isLastUserMessage = message.role === 'user' && index === array.map((item) => item.role).lastIndexOf('user');
                if (message.role !== 'user') {
                    return message;
                }

                if (!isLastUserMessage) {
                    return message;
                }

                if (includeCampusContext && typeof buildContextMessage === 'function') {
                    return {
                        ...message,
                        content: buildContextMessage({ unreadSummary, approvalSummary }, message.content),
                    };
                }

                if (includeCampusContext && (unreadSummary || approvalSummary)) {
                    return {
                        ...message,
                        content: [
                            unreadSummary ? `未读消息摘要：\n${unreadSummary}` : '',
                            approvalSummary ? `审批摘要：\n${approvalSummary}` : '',
                            `用户问题：${message.content}`,
                            isTroubleshootingQuestion(question)
                                ? '用户当前是在追问排障或认证问题。请优先解释失败原因、缺少的认证条件和下一步排查动作，不要继续生成审批/消息汇总文档。'
                                : '请使用清晰的 Markdown 结构，适合时用小标题和列表组织信息。如果需要返回链接，请使用 Markdown 链接格式，例如 [查看详情](/messages/xx) 或 [打开审批](https://example.com)，不要直接输出长网址。',
                        ].filter(Boolean).join('\n\n'),
                    };
                }

                return message;
            });

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
                        <div className={`firefly-side-header ${showRichChrome ? '' : 'compact'}`}>
                            <div className="firefly-side-header-copy">
                                {showRichChrome && (
                                    <span className="firefly-side-kicker">{title}</span>
                                )}
                                <h3>{launcherLabel} 协同面板</h3>
                                {showRichChrome && <p>{description}</p>}
                            </div>
                            <div className="firefly-side-header-actions">
                                {showRichChrome && <span className="firefly-side-model-badge">{activeModel.label}</span>}
                                {showRichChrome && secondaryAction?.href && secondaryAction?.label && (
                                    <Link href={secondaryAction.href} className="firefly-side-link">
                                        {secondaryAction.label}
                                    </Link>
                                )}
                                <button
                                    type="button"
                                    className="firefly-side-collapse-btn"
                                    aria-label="收起萤火虫侧边抽屉"
                                    onClick={() => setDrawerOpen(false)}
                                >
                                    收起
                                </button>
                            </div>
                        </div>

                        {showRichChrome && contextChips.length > 0 && (
                            <div className="firefly-side-chip-row">
                                {contextChips.map((chip) => (
                                    <span key={chip} className="firefly-side-chip">{chip}</span>
                                ))}
                            </div>
                        )}

                        {showRichChrome && shortcuts.length > 0 && (
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

                        <FireflyControlPlanePanel
                            surface="drawer"
                            threadKey={threadKey}
                            userProfile={campusUserProfile}
                            capabilityIds={capabilityIds}
                            marketAccess={drawerMarketAccess}
                            contextSnapshot={contextSnapshot}
                            className="firefly-side-control-plane"
                            defaultExpanded={false}
                        />

                        <div className="firefly-side-messages">
                            {currentThread.length === 0 ? (
                                <div className="firefly-side-empty">
                                    <h4>{emptyTitle}</h4>
                                    <p>{emptyDescription}</p>
                                </div>
                            ) : (
                                renderableMessages.map((item) => {
                                    if (item.type === 'assistant-with-runtime') {
                                        const runtimeMessage = item.runtime;
                                        const assistantMessage = item.assistant;

                                        return (
                                            <div key={item.key} className="firefly-side-message ai">
                                                <div className="firefly-side-message-stack">
                                                    <div className="firefly-side-message-body">
                                                        <div>
                                                            {renderRichMessageContent(assistantMessage.content, 'firefly-side-inline-link')}
                                                            {assistantMessage.streaming ? '…' : ''}
                                                        </div>
                                                    </div>
                                                    <FireflyRuntimeStrip
                                                        task={runtimeMessage.runtimeTask}
                                                        timeLabel={runtimeMessage.streaming ? '正在运行' : new Date(runtimeMessage.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                                        defaultExpanded={Boolean(runtimeMessage.traceExpanded)}
                                                        surface="drawer"
                                                        controlState={runtimeControlState}
                                                        onControlAction={handleRuntimeControlAction}
                                                    />
                                                </div>
                                                <div className="firefly-side-message-meta">
                                                    <span>萤火虫</span>
                                                    <small>{new Date(assistantMessage.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small>
                                                </div>
                                            </div>
                                        );
                                    }

                                    const message = item.message;

                                    return (
                                        <div key={item.key} className={`firefly-side-message ${message.role}`}>
                                            {message.messageKind === 'runtime-trace' && message.runtimeTask ? (
                                                <FireflyRuntimeStrip
                                                    task={message.runtimeTask}
                                                    timeLabel={message.streaming ? '正在运行' : new Date(message.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                                    defaultExpanded={Boolean(message.traceExpanded)}
                                                    surface="drawer"
                                                    controlState={runtimeControlState}
                                                    onControlAction={handleRuntimeControlAction}
                                                />
                                            ) : (
                                                <div className="firefly-side-message-body">
                                                    <div>
                                                        {renderRichMessageContent(message.content, 'firefly-side-inline-link')}
                                                        {message.streaming ? '…' : ''}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="firefly-side-message-meta">
                                                <span>{message.role === 'user' ? '我' : '萤火虫'}</span>
                                                <small>{new Date(message.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small>
                                            </div>
                                        </div>
                                    );
                                })
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
