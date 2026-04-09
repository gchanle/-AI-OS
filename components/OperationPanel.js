'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { requestOpenFireflyAction } from '@/data/messageCenter';
import {
    capabilityMap,
    resolveChatModel,
} from '@/data/workspace';
import { loadFireflyTasks, subscribeFireflyTasks } from '@/data/fireflyTasks';
import { loadFireflyMemories, subscribeFireflyMemories } from '@/data/fireflyMemory';
import './OperationPanel.css';

function normalizeLegacyTask(task = {}) {
    return {
        id: task.id || `legacy-${Date.now()}`,
        title: task.title || '聊天任务',
        status: task.status || 'in-progress',
        summary: task.description || '',
    };
}

function getTaskLabel(status = '') {
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'planning') return '规划中';
    if (status === 'running' || status === 'in-progress') return '进行中';
    return status || '待执行';
}

function formatToolOutputValue(value) {
    if (value === null || value === undefined || value === '') {
        return '暂无';
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function truncateText(text = '', limit = 240) {
    const content = String(text || '').replace(/\s+/g, ' ').trim();
    if (content.length <= limit) {
        return content;
    }

    return `${content.slice(0, limit)}...`;
}

function buildToolOutputEntries(task = null) {
    if (!task) {
        return [];
    }

    const steps = Array.isArray(task.steps) ? task.steps : [];
    const stepResults = task.stepResults && typeof task.stepResults === 'object' ? task.stepResults : {};

    return steps
        .map((step, index) => {
            const result = stepResults[step.outputKey] || stepResults[step.toolId] || null;
            const data = result?.data || null;
            const summary = step.summary || result?.summary || '当前步骤暂无结构化结果。';

            return {
                id: step.outputKey || step.toolId || step.id || `tool-output-${index + 1}`,
                stepId: step.id,
                toolId: step.toolId || step.skillId || step.outputKey || '',
                label: step.label || step.toolId || `步骤 ${index + 1}`,
                status: step.status || 'pending',
                summary,
                result,
                data,
            };
        })
        .filter((item) => item.toolId || item.result || item.status !== 'pending');
}

function renderToolOutputSections(entry = null) {
    if (!entry) {
        return [];
    }

    const data = entry.data || {};

    if (entry.toolId === 'web.search') {
        const results = Array.isArray(data.results) ? data.results : [];
        return [
            {
                title: '搜索来源',
                type: 'list',
                items: results.map((item, index) => ({
                    title: item.title || `来源 ${index + 1}`,
                    body: truncateText(item.snippet || '暂无摘要', 180),
                    href: item.url || '',
                    meta: item.url || '',
                })),
                emptyText: '当前没有搜索命中来源。',
            },
        ];
    }

    if (entry.toolId === 'url.inspect') {
        const target = data.target || {};
        const hints = Array.isArray(target.hints) ? target.hints : [];

        return [
            {
                title: '链接识别',
                type: 'kv',
                items: [
                    { label: '域名', value: target.hostname || '未知' },
                    { label: '类型', value: target.siteKind || 'unknown' },
                    { label: '模式', value: target.interactionMode || 'read' },
                ],
            },
            {
                title: '识别信号',
                type: 'list',
                items: hints.map((item, index) => ({
                    title: `信号 ${index + 1}`,
                    body: item,
                    href: target.url || '',
                    meta: target.url || '',
                })),
                emptyText: '当前没有额外识别信号。',
            },
        ];
    }

    if (entry.toolId === 'research.search') {
        const queries = Array.isArray(data.queries) ? data.queries : [];
        const results = Array.isArray(data.results) ? data.results : [];

        return [
            {
                title: '研究查询',
                type: 'list',
                items: queries.map((item, index) => ({
                    title: `查询 ${index + 1}`,
                    body: item,
                    href: '',
                    meta: '',
                })),
                emptyText: '当前没有生成研究查询。',
            },
            {
                title: '候选来源',
                type: 'list',
                items: results.map((item, index) => ({
                    title: item.title || `来源 ${index + 1}`,
                    body: truncateText(item.snippet || '暂无摘要', 180),
                    href: item.url || '',
                    meta: item.researchQuery || '',
                })),
                emptyText: '当前没有研究来源。',
            },
        ];
    }

    if (entry.toolId === 'research.read') {
        const pages = Array.isArray(data.pages) ? data.pages : [];
        const failedPages = Array.isArray(data.failedPages) ? data.failedPages : [];

        return [
            {
                title: '正文摘录',
                type: 'list',
                items: pages.map((item, index) => ({
                    title: item.title || `正文 ${index + 1}`,
                    body: truncateText(item.excerpt || '未提取到正文', 260),
                    href: item.url || '',
                    meta: item.researchQuery || '',
                })),
                emptyText: '当前没有抓取到研究正文。',
            },
            {
                title: '受限来源',
                type: 'list',
                items: failedPages.map((item, index) => ({
                    title: item.title || `受限来源 ${index + 1}`,
                    body: '该来源当前未成功提取正文。',
                    href: item.url || '',
                    meta: item.researchQuery || '',
                })),
                emptyText: '当前没有受限来源。',
            },
        ];
    }

    if (entry.toolId === 'research.report') {
        const searchResults = Array.isArray(data.searchResults) ? data.searchResults : [];

        return [
            {
                title: '研究简报',
                type: 'text',
                text: String(data.answer || '').trim() || '当前没有返回研究报告正文。',
            },
            {
                title: '研究来源',
                type: 'list',
                items: searchResults.map((item, index) => ({
                    title: item.title || `来源 ${index + 1}`,
                    body: truncateText(item.snippet || '暂无摘要', 180),
                    href: item.url || '',
                    meta: item.researchQuery || '',
                })),
                emptyText: '当前没有研究来源。',
            },
        ];
    }

    if (entry.toolId === 'page.read') {
        const page = data.page || {};
        const decision = data.decision || {};
        const limitations = Array.isArray(decision.limitations) ? decision.limitations : [];

        return [
            {
                title: '页面读取',
                type: 'kv',
                items: [
                    { label: '标题', value: page.title || '未识别标题' },
                    { label: '质量', value: decision.quality || 'unknown' },
                    { label: '推荐通道', value: decision.recommendedAction || 'page.read' },
                    { label: '提取方式', value: page.extractionKind || 'unknown' },
                ],
            },
            {
                title: '正文片段',
                type: 'text',
                text: page.excerpt || '当前没有提取到稳定正文。',
            },
            {
                title: '当前限制',
                type: 'list',
                items: limitations.map((item, index) => ({
                    title: `限制 ${index + 1}`,
                    body: item,
                    href: data.fetch?.finalUrl || data.target?.url || '',
                    meta: data.fetch?.finalUrl || data.target?.url || '',
                })),
                emptyText: '当前没有额外限制。',
            },
        ];
    }

    if (entry.toolId === 'page.answer') {
        const limitations = Array.isArray(data.limitations) ? data.limitations : [];

        return [
            {
                title: '页面解读',
                type: 'text',
                text: String(data.answer || '').trim() || '当前没有拿到足够稳定的正文，因此只返回了受限说明。',
            },
            {
                title: '附加说明',
                type: 'list',
                items: limitations.map((item, index) => ({
                    title: `说明 ${index + 1}`,
                    body: item,
                    href: data.targetUrl || '',
                    meta: data.targetUrl || '',
                })),
                emptyText: '当前没有附加限制说明。',
            },
        ];
    }

    if (entry.toolId === 'web.fetch') {
        const pages = Array.isArray(data.pages) ? data.pages : [];
        const failedPages = Array.isArray(data.failedPages) ? data.failedPages : [];
        return [
            {
                title: '已抓取正文',
                type: 'list',
                items: pages.map((item, index) => ({
                    title: item.title || `正文 ${index + 1}`,
                    body: truncateText(item.excerpt || '未提取到正文', 260),
                    href: item.url || '',
                    meta: item.url || '',
                })),
                emptyText: '当前没有抓取到可用正文。',
            },
            {
                title: '读取失败来源',
                type: 'list',
                items: failedPages.map((item, index) => ({
                    title: item.title || `失败来源 ${index + 1}`,
                    body: '该来源暂时未提取到正文。',
                    href: item.url || '',
                    meta: item.url || '',
                })),
                emptyText: '当前没有读取失败的来源。',
            },
        ];
    }

    if (entry.toolId === 'web.answer') {
        const searchResults = Array.isArray(data.searchResults) ? data.searchResults : [];
        const answer = String(data.answer || '').trim();
        const groundingLabel = data.groundedBy === 'page_excerpt' ? '网页正文摘录' : '搜索摘要';

        return [
            {
                title: '回答内容',
                type: 'text',
                text: answer || '当前还没有返回可展示的回答正文。',
            },
            {
                title: '回答依据',
                type: 'kv',
                items: [
                    { label: 'Grounding', value: groundingLabel },
                    { label: '来源数量', value: String(searchResults.length) },
                    { label: '正文页数', value: String(Array.isArray(data.fetchedPages) ? data.fetchedPages.length : 0) },
                ],
            },
            {
                title: '引用来源',
                type: 'list',
                items: searchResults.map((item, index) => ({
                    title: `[${index + 1}] ${item.title || '来源'}`,
                    body: truncateText(item.snippet || '暂无摘要', 160),
                    href: item.url || '',
                    meta: item.url || '',
                })),
                emptyText: '当前没有可展示的引用来源。',
            },
        ];
    }

    if (entry.toolId === 'messages.unread_summary') {
        const items = Array.isArray(data.items) ? data.items : [];
        return [
            {
                title: '未读消息',
                type: 'list',
                items: items.map((item) => ({
                    title: item.title || '未命名消息',
                    body: item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '暂无时间',
                    href: item.href || '',
                    meta: item.senderName || '',
                })),
                emptyText: '当前没有未读消息。',
            },
        ];
    }

    if (entry.toolId === 'approvals.center_overview') {
        const pending = Array.isArray(data.pending) ? data.pending : [];
        const initiated = Array.isArray(data.initiated) ? data.initiated : [];
        return [
            {
                title: '待我审批',
                type: 'list',
                items: pending.map((item) => ({
                    title: item.title || '审批事项',
                    body: `${item.statusLabel || '待处理'}${item.updatedAt ? ` · ${new Date(item.updatedAt).toLocaleString('zh-CN')}` : ''}`,
                    href: item.href || '',
                    meta: item.href || '',
                })),
                emptyText: '当前没有待我审批事项。',
            },
            {
                title: '我发起的',
                type: 'list',
                items: initiated.map((item) => ({
                    title: item.title || '审批事项',
                    body: `${item.statusLabel || '处理中'}${item.updatedAt ? ` · ${new Date(item.updatedAt).toLocaleString('zh-CN')}` : ''}`,
                    href: item.href || '',
                    meta: item.href || '',
                })),
                emptyText: '当前没有我发起的审批事项。',
            },
        ];
    }

    if (entry.toolId === 'digest.morning_briefing') {
        const counts = data.counts || {};
        return [
            {
                title: '聚合指标',
                type: 'kv',
                items: [
                    { label: '未读消息', value: String(counts.unreadMessages || 0) },
                    { label: '待我审批', value: String(counts.pendingApprovals || 0) },
                    { label: '我发起的', value: String(counts.initiatedApprovals || 0) },
                    { label: '已审批', value: String(counts.approvedRecords || 0) },
                ],
            },
        ];
    }

    if (entry.toolId === 'library.reading_context') {
        return [
            {
                title: '阅读上下文',
                type: 'kv',
                items: [
                    { label: '图书', value: data.bookTitle || '未命中图书' },
                    { label: '页标题', value: data.pageTitle || '未命中页面' },
                    { label: '进度', value: data.readingProgress || '暂无进度' },
                ],
            },
            {
                title: '页面正文摘录',
                type: 'text',
                text: truncateText(data.pageBody || data.bookSummary || data.pageQuote || '当前没有可展示的正文上下文。', 360),
            },
        ];
    }

    return [
        {
            title: '结构化结果',
            type: 'text',
            text: formatToolOutputValue(data || entry.result || ''),
        },
    ];
}

function extractSessionArtifacts(message) {
    if (!message?.content) {
        return [];
    }

    const content = message.content;
    const codeMatches = [...content.matchAll(/```([\w-]+)?\n([\s\S]*?)```/g)].map((match, index) => ({
        id: `code-${index}`,
        type: 'code',
        label: match[1] || '代码片段',
        content: match[2].trim(),
        href: '',
    }));

    const fileMatches = [...content.matchAll(/\[([^\]]+\.(pdf|docx|pptx|xlsx|csv|md|txt|png|jpg|jpeg))\]\(([^)]+)\)/gi)].map((match, index) => ({
        id: `file-${index}`,
        type: 'file',
        label: match[1],
        content: '',
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
            href: '',
        }]
        : [];

    return [...summaryArtifact, ...codeMatches, ...fileMatches];
}

function buildTaskContinuePrompt(task = {}, nextAction = '') {
    const lines = [
        `继续帮我推进这项任务：「${task.title || '萤火虫任务'}」。`,
    ];

    if (task.goal) {
        lines.push(`原始目标：${task.goal}`);
    }

    if (task.resultSummary) {
        lines.push(`当前结果摘要：${task.resultSummary}`);
    }

    if (task.recoveryIntent?.summary) {
        lines.push(`恢复意图：${task.recoveryIntent.summary}`);
    }

    if (nextAction?.prompt) {
        lines.push(nextAction.prompt);
    } else if (nextAction?.summary) {
        lines.push(`优先执行这一步：${nextAction.summary}`);
    }

    lines.push('请不要从头重复解释，直接承接已有上下文，先判断现在最值得继续的动作，再继续推进。');

    return lines.join('\n');
}

function resolveWorkspaceRecovery(task = {}, action = null) {
    const snapshot = task.workspaceSnapshot || {};
    const capabilityId = Array.isArray(task.capabilityIds) ? task.capabilityIds[0] : '';
    const pathname = action?.pathname
        || snapshot.path
        || snapshot.pathname
        || (capabilityId === 'services' ? '/services' : '')
        || (capabilityId === 'research' ? '/research' : '')
        || (capabilityId === 'assistant' ? '/assistant' : '')
        || (capabilityId === 'library' ? '/library' : '')
        || (capabilityId === 'agents' ? '/agent-builder' : '')
        || '/';
    const target = action?.target
        || snapshot.drawerTarget
        || (capabilityId === 'services' ? 'external_drawer:办事大厅' : '')
        || (capabilityId === 'research' ? 'external_drawer:research:wendao' : '')
        || (capabilityId === 'assistant' ? 'external_drawer:助教中心' : '')
        || (capabilityId === 'library' ? 'library_firefly_drawer_v1' : '')
        || (capabilityId === 'agents' ? 'external_drawer:能力中心' : '')
        || 'campus_global_firefly_drawer_v1';

    const query = action?.tabId ? `?tab=${encodeURIComponent(action.tabId)}` : '';

    return {
        pathname: `${pathname}${query}`,
        target,
    };
}

export default function OperationPanel({
    visible = false,
    chatStarted,
    sessionId,
    initialMessage,
    capabilityIds,
    preferredModelId,
    onContinueTask,
}) {
    const [tasks, setTasks] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [fireflyTasks, setFireflyTasks] = useState([]);
    const [memories, setMemories] = useState([]);
    const [collapsed, setCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState('artifacts');
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [selectedStepId, setSelectedStepId] = useState('');
    const [selectedArtifactId, setSelectedArtifactId] = useState('');
    const [selectedOutputId, setSelectedOutputId] = useState('');

    useEffect(() => {
        const load = () => {
            try {
                const storedTasks = JSON.parse(localStorage.getItem('dynamic_tasks') || '[]');
                const storedSessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
                setTasks(Array.isArray(storedTasks) ? storedTasks.map(normalizeLegacyTask) : []);
                setSessions(Array.isArray(storedSessions) ? storedSessions : []);
                setFireflyTasks(loadFireflyTasks());
                setMemories(loadFireflyMemories());
            } catch {
                setTasks([]);
                setSessions([]);
                setFireflyTasks([]);
                setMemories([]);
            }
        };

        load();
        window.addEventListener('tasks-updated', load);
        window.addEventListener('chat-history-updated', load);
        const unsubscribeFireflyTasks = subscribeFireflyTasks(setFireflyTasks);
        const unsubscribeMemories = subscribeFireflyMemories(setMemories);

        return () => {
            window.removeEventListener('tasks-updated', load);
            window.removeEventListener('chat-history-updated', load);
            unsubscribeFireflyTasks();
            unsubscribeMemories();
        };
    }, []);

    const currentSession = useMemo(() => (
        sessionId ? sessions.find((item) => item.id === sessionId) : null
    ), [sessionId, sessions]);

    const currentFireflyTask = useMemo(() => {
        if (sessionId) {
            return fireflyTasks.find((item) => item.sessionId === sessionId) || fireflyTasks[0] || null;
        }

        return fireflyTasks[0] || null;
    }, [fireflyTasks, sessionId]);

    const relevantFireflyTasks = useMemo(() => {
        const sessionScoped = sessionId
            ? fireflyTasks.filter((item) => item.sessionId === sessionId)
            : [];
        const capabilityScoped = fireflyTasks.filter((item) => (
            item.capabilityIds?.some((id) => capabilityIds.includes(id))
        ));
        const merged = [...sessionScoped, ...capabilityScoped, ...fireflyTasks];
        const seen = new Set();
        return merged.filter((item) => {
            if (!item?.id || seen.has(item.id)) {
                return false;
            }
            seen.add(item.id);
            return true;
        }).slice(0, 8);
    }, [capabilityIds, fireflyTasks, sessionId]);

    useEffect(() => {
        if (!relevantFireflyTasks.length) {
            setSelectedTaskId('');
            return;
        }

        if (!selectedTaskId || !relevantFireflyTasks.some((item) => item.id === selectedTaskId)) {
            setSelectedTaskId(relevantFireflyTasks[0].id);
        }
    }, [relevantFireflyTasks, selectedTaskId]);

    const selectedFireflyTask = useMemo(() => (
        relevantFireflyTasks.find((item) => item.id === selectedTaskId) || currentFireflyTask
    ), [currentFireflyTask, relevantFireflyTasks, selectedTaskId]);

    const currentLegacyTasks = useMemo(() => {
        if (sessionId) {
            return tasks.filter((item) => item.sessionId === sessionId);
        }

        return tasks.slice(0, 4);
    }, [sessionId, tasks]);

    const activeCapabilities = capabilityIds.map((id) => capabilityMap[id]).filter(Boolean);
    const activeModel = resolveChatModel(preferredModelId);
    const title = selectedFireflyTask?.title || currentSession?.title || initialMessage || '等待任务启动';
    const latestMessages = currentSession?.messages || [];
    const latestAssistantMessage = [...latestMessages].reverse().find((item) => item.role === 'ai');

    const artifacts = useMemo(() => {
        if (selectedFireflyTask?.artifacts?.length) {
            return selectedFireflyTask.artifacts.map((artifact) => ({
                id: artifact.id,
                type: artifact.type || 'summary',
                label: artifact.label || '执行结果',
                content: artifact.content || '',
                href: artifact.href || '',
            }));
        }

        return extractSessionArtifacts(latestAssistantMessage);
    }, [latestAssistantMessage, selectedFireflyTask]);

    useEffect(() => {
        if (!artifacts.length) {
            setSelectedArtifactId('');
            return;
        }

        if (!selectedArtifactId || !artifacts.some((item) => item.id === selectedArtifactId)) {
            setSelectedArtifactId(artifacts[0].id);
        }
    }, [artifacts, selectedArtifactId]);

    const runtimeSteps = useMemo(() => {
        if (selectedFireflyTask?.steps?.length) {
            return selectedFireflyTask.steps;
        }

        return currentLegacyTasks;
    }, [currentLegacyTasks, selectedFireflyTask]);

    useEffect(() => {
        if (!runtimeSteps.length) {
            setSelectedStepId('');
            return;
        }

        if (!selectedStepId || !runtimeSteps.some((item) => item.id === selectedStepId)) {
            setSelectedStepId(runtimeSteps[0].id);
        }
    }, [runtimeSteps, selectedStepId]);

    const selectedArtifact = useMemo(() => (
        artifacts.find((item) => item.id === selectedArtifactId) || artifacts[0] || null
    ), [artifacts, selectedArtifactId]);

    const selectedStep = useMemo(() => (
        runtimeSteps.find((item) => item.id === selectedStepId) || runtimeSteps[0] || null
    ), [runtimeSteps, selectedStepId]);

    const toolOutputs = useMemo(() => buildToolOutputEntries(selectedFireflyTask), [selectedFireflyTask]);

    useEffect(() => {
        if (!toolOutputs.length) {
            setSelectedOutputId('');
            return;
        }

        if (!selectedOutputId || !toolOutputs.some((item) => item.id === selectedOutputId)) {
            setSelectedOutputId(toolOutputs[0].id);
        }
    }, [selectedOutputId, toolOutputs]);

    const selectedOutput = useMemo(() => (
        toolOutputs.find((item) => item.id === selectedOutputId) || toolOutputs[0] || null
    ), [selectedOutputId, toolOutputs]);

    const selectedOutputSections = useMemo(() => renderToolOutputSections(selectedOutput), [selectedOutput]);

    const currentLogs = useMemo(() => (
        Array.isArray(selectedFireflyTask?.executionLogs)
            ? selectedFireflyTask.executionLogs.slice(-8).reverse()
            : []
    ), [selectedFireflyTask]);

    const relatedMemories = useMemo(() => {
        if (!selectedFireflyTask) {
            return memories.slice(0, 5);
        }

        return memories.filter((item) => (
            item.taskId === selectedFireflyTask.id
            || item.sessionId === selectedFireflyTask.sessionId
            || item.capabilityIds?.some((id) => capabilityIds.includes(id))
        )).slice(0, 5);
    }, [capabilityIds, memories, selectedFireflyTask]);

    useEffect(() => {
        if (artifacts.length > 0 || runtimeSteps.length > 0 || relatedMemories.length > 0) {
            setCollapsed(false);
        }
    }, [artifacts.length, relatedMemories.length, runtimeSteps.length]);

    const handleContinueTask = (task, nextAction = null) => {
        if (!task) {
            return;
        }

        onContinueTask?.(buildTaskContinuePrompt(task, nextAction), {
            capabilityIds: task.capabilityIds || capabilityIds,
            runtimeContext: {
                ...(task.resumeContext || {}),
                ...(task.contextSnapshot || {}),
                resumeMode: true,
                parentTaskId: task.id,
                taskTitle: task.title,
                taskGoal: task.goal,
                taskResultSummary: task.resultSummary,
                recoveryIntent: nextAction?.summary || task.recoveryIntent?.summary || '',
                preferredToolIds: nextAction?.preferredToolIds || [],
                taskSelectedSkills: task.selectedSkillLabels || [],
                memoryIds: task.memoryIds || [],
            },
            threadKey: task.threadKey || task.id,
        });
    };

    const handleOpenWorkspace = (task, action = null) => {
        if (!task) {
            return;
        }

        const recovery = resolveWorkspaceRecovery(task, action);
        requestOpenFireflyAction({
            pathname: recovery.pathname,
            href: recovery.pathname,
            target: recovery.target,
        });
    };

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
                            <h3 className="operation-panel-title">任务详情</h3>
                        </div>
                        <span className="operation-panel-badge">{activeModel.label}</span>
                    </div>

                    <div className="operation-panel-tabs">
                        <button
                            type="button"
                            className={`operation-tab ${activeTab === 'artifacts' ? 'active' : ''}`}
                            onClick={() => setActiveTab('artifacts')}
                        >
                            产物
                        </button>
                        <button
                            type="button"
                            className={`operation-tab ${activeTab === 'steps' ? 'active' : ''}`}
                            onClick={() => setActiveTab('steps')}
                        >
                            执行
                        </button>
                        <button
                            type="button"
                            className={`operation-tab ${activeTab === 'outputs' ? 'active' : ''}`}
                            onClick={() => setActiveTab('outputs')}
                        >
                            工具输出
                        </button>
                        <button
                            type="button"
                            className={`operation-tab ${activeTab === 'actions' ? 'active' : ''}`}
                            onClick={() => setActiveTab('actions')}
                        >
                            记忆
                        </button>
                    </div>

                    <div className="operation-panel-body">
                        <section className="operation-section">
                            <div className="operation-section-label">当前任务</div>
                            <div className="operation-focus-card">
                                <strong>{title}</strong>
                                <p>
                                    {selectedFireflyTask?.resultSummary
                                        ? selectedFireflyTask.resultSummary
                                        : chatStarted
                                            ? '这里会承接 Agent 任务的产物、执行日志和长期记忆，不再把所有内容都塞在聊天气泡里。'
                                            : '启动一个任务后，这里会逐步承接步骤、产物和记忆线索。'}
                                </p>
                            </div>

                            {relevantFireflyTasks.length > 0 ? (
                                <div className="operation-task-rail">
                                    {relevantFireflyTasks.map((task) => (
                                        <button
                                            key={task.id}
                                            type="button"
                                            className={`operation-task-chip ${selectedFireflyTask?.id === task.id ? 'active' : ''}`}
                                            onClick={() => setSelectedTaskId(task.id)}
                                        >
                                            <span className={`operation-status ${task.status || 'planning'}`} />
                                            <span className="operation-task-chip-copy">
                                                <strong>{task.title}</strong>
                                                <small>{getTaskLabel(task.status)}</small>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}

                            {selectedFireflyTask ? (
                                <div className="operation-meta-grid">
                                    <div className="operation-meta-card">
                                        <span className="operation-canvas-kicker">任务状态</span>
                                        <strong>{getTaskLabel(selectedFireflyTask.status)}</strong>
                                        <small>{selectedFireflyTask.planKind || 'single_tool'}</small>
                                    </div>
                                    <div className="operation-meta-card">
                                        <span className="operation-canvas-kicker">能力数量</span>
                                        <strong>{selectedFireflyTask.selectedSkillLabels?.length || 0}</strong>
                                        <small>{selectedFireflyTask.selectedSkillLabels?.join('、') || '暂无'}</small>
                                    </div>
                                    <div className="operation-meta-card">
                                        <span className="operation-canvas-kicker">恢复模式</span>
                                        <strong>{selectedFireflyTask.planMetadata?.isResume ? '续办中' : '新任务'}</strong>
                                        <small>{selectedFireflyTask.planMetadata?.resumeTarget || '当前会话直接发起'}</small>
                                    </div>
                                </div>
                            ) : null}

                            {selectedFireflyTask?.workspaceSnapshot ? (
                                <div className="operation-recovery-panel">
                                    <div className="operation-recovery-card">
                                        <span className="operation-canvas-kicker">工作面快照</span>
                                        <strong>
                                            {selectedFireflyTask.workspaceSnapshot.moduleLabel || '未记录模块'}
                                            {selectedFireflyTask.workspaceSnapshot.pageLabel ? ` / ${selectedFireflyTask.workspaceSnapshot.pageLabel}` : ''}
                                        </strong>
                                        <small>{selectedFireflyTask.workspaceSnapshot.path || '当前未记录页面路径'}</small>
                                    </div>
                                    <div className="operation-recovery-card">
                                        <span className="operation-canvas-kicker">恢复意图</span>
                                        <strong>{selectedFireflyTask.recoveryIntent?.summary || '从当前会话新发起'}</strong>
                                        <small>{selectedFireflyTask.recoveryState?.ready ? '已具备恢复上下文' : '恢复上下文仍待补充'}</small>
                                    </div>
                                </div>
                            ) : null}

                            {selectedFireflyTask ? (
                                <div className="operation-recovery-actions">
                                    <button
                                        type="button"
                                        className="operation-inline-action primary"
                                        onClick={() => handleContinueTask(selectedFireflyTask)}
                                    >
                                        在主会话继续
                                    </button>
                                    <button
                                        type="button"
                                        className="operation-inline-action"
                                        onClick={() => handleOpenWorkspace(selectedFireflyTask)}
                                    >
                                        回到对应工作面
                                    </button>
                                </div>
                            ) : null}
                        </section>

                        {activeTab === 'artifacts' && (
                            <section className="operation-section operation-section-grow">
                                <div className="operation-section-label">任务产物</div>
                                <div className="operation-canvas">
                                    {artifacts.length > 0 ? (
                                        <>
                                            <div className="operation-artifact-nav">
                                                {artifacts.map((artifact) => (
                                                    <button
                                                        key={artifact.id}
                                                        type="button"
                                                        className={`operation-artifact-chip ${selectedArtifact?.id === artifact.id ? 'active' : ''}`}
                                                        onClick={() => setSelectedArtifactId(artifact.id)}
                                                    >
                                                        {artifact.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {selectedArtifact ? (
                                                <div className={`operation-artifact ${selectedArtifact.type}`}>
                                                    <span className="operation-canvas-kicker">{selectedArtifact.label}</span>
                                                    {selectedArtifact.href ? (
                                                        <>
                                                            {selectedArtifact.content ? (
                                                                <div className="operation-canvas-text">{selectedArtifact.content}</div>
                                                            ) : null}
                                                            <a href={selectedArtifact.href} className="operation-file-link" target="_blank" rel="noreferrer">
                                                                打开结果
                                                            </a>
                                                        </>
                                                    ) : (
                                                        <div className="operation-canvas-text">{selectedArtifact.content}</div>
                                                    )}
                                                </div>
                                            ) : null}
                                        </>
                                    ) : (
                                        <>
                                            <span className="operation-canvas-kicker">等待产出</span>
                                            <div className="operation-canvas-text">
                                                当 Agent 任务生成结构化结果、代码片段或链接型产物时，会优先显示在这里。
                                            </div>
                                        </>
                                    )}
                                </div>
                            </section>
                        )}

                        {activeTab === 'steps' && (
                            <section className="operation-section">
                                <div className="operation-section-label">执行记录</div>
                                <div className="operation-list">
                                    {runtimeSteps.length > 0 ? runtimeSteps.map((task, index) => (
                                        <button
                                            type="button"
                                            key={task.id || index}
                                            className={`operation-item operation-step-button ${selectedStep?.id === task.id ? 'active' : ''}`}
                                            onClick={() => setSelectedStepId(task.id)}
                                        >
                                            <div className={`operation-status ${task.status || 'in-progress'}`} />
                                            <div className="operation-item-copy">
                                                <strong>{task.label || task.title}</strong>
                                                <span>{task.summary || getTaskLabel(task.status)}</span>
                                            </div>
                                        </button>
                                    )) : (
                                        <div className="operation-empty">
                                            当前还没有可展示的步骤。等 Agent Runtime 触发后，这里会显示计划和执行状态。
                                        </div>
                                    )}
                                </div>

                                {selectedStep ? (
                                    <div className="operation-step-detail">
                                        <span className="operation-canvas-kicker">步骤详情</span>
                                        <strong>{selectedStep.label || '当前步骤'}</strong>
                                        <p className="operation-canvas-text">
                                            {selectedStep.purpose || selectedStep.summary || '当前步骤暂无额外说明。'}
                                        </p>
                                        <div className="operation-step-meta">
                                            <span>状态：{getTaskLabel(selectedStep.status)}</span>
                                            <span>输出键：{selectedStep.outputKey || '-'}</span>
                                            <span>继续执行：{selectedStep.continueOnError ? '是' : '否'}</span>
                                        </div>
                                    </div>
                                ) : null}

                                <div className="operation-section-label">最新日志</div>
                                <div className="operation-log-list">
                                    {currentLogs.length > 0 ? currentLogs.map((log) => (
                                        <div key={log.id} className="operation-log-item">
                                            <strong>{log.message}</strong>
                                            <small>{new Date(log.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small>
                                        </div>
                                    )) : (
                                        <div className="operation-empty">
                                            当前任务还没有记录到详细执行日志。
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {activeTab === 'outputs' && (
                            <section className="operation-section operation-section-grow">
                                <div className="operation-section-label">工具原始输出</div>
                                <div className="operation-canvas">
                                    {toolOutputs.length > 0 ? (
                                        <>
                                            <div className="operation-artifact-nav">
                                                {toolOutputs.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        className={`operation-artifact-chip ${selectedOutput?.id === item.id ? 'active' : ''}`}
                                                        onClick={() => setSelectedOutputId(item.id)}
                                                    >
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>

                                            {selectedOutput ? (
                                                <div className="operation-output-panel">
                                                    <div className="operation-output-header">
                                                        <div>
                                                            <span className="operation-canvas-kicker">当前工具</span>
                                                            <strong>{selectedOutput.label}</strong>
                                                        </div>
                                                        <div className="operation-step-meta">
                                                            <span>状态：{getTaskLabel(selectedOutput.status)}</span>
                                                            <span>Tool ID：{selectedOutput.toolId || '-'}</span>
                                                        </div>
                                                    </div>

                                                    <div className="operation-output-summary">
                                                        {selectedOutput.summary || '当前步骤暂无摘要。'}
                                                    </div>

                                                    <div className="operation-output-sections">
                                                        {selectedOutputSections.map((section) => (
                                                            <div key={section.title} className="operation-output-card">
                                                                <span className="operation-canvas-kicker">{section.title}</span>
                                                                {section.type === 'text' ? (
                                                                    <div className="operation-output-pre">{section.text}</div>
                                                                ) : null}
                                                                {section.type === 'kv' ? (
                                                                    <div className="operation-output-kv-grid">
                                                                        {section.items.map((item) => (
                                                                            <div key={item.label} className="operation-output-kv-item">
                                                                                <strong>{item.label}</strong>
                                                                                <span>{item.value}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : null}
                                                                {section.type === 'list' ? (
                                                                    <div className="operation-output-list">
                                                                        {section.items.length > 0 ? section.items.map((item, index) => (
                                                                            <div key={`${section.title}-${item.title}-${index}`} className="operation-output-item">
                                                                                <strong>{item.title}</strong>
                                                                                <span>{item.body}</span>
                                                                                {item.meta ? <small>{item.meta}</small> : null}
                                                                                {item.href ? (
                                                                                    <a href={item.href} className="operation-file-link" target="_blank" rel="noreferrer">
                                                                                        打开来源
                                                                                    </a>
                                                                                ) : null}
                                                                            </div>
                                                                        )) : (
                                                                            <div className="operation-empty">{section.emptyText}</div>
                                                                        )}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="operation-output-card">
                                                        <span className="operation-canvas-kicker">原始结构</span>
                                                        <pre className="operation-output-json">{formatToolOutputValue(selectedOutput.result || {})}</pre>
                                                    </div>
                                                </div>
                                            ) : null}
                                        </>
                                    ) : (
                                        <>
                                            <span className="operation-canvas-kicker">等待工具执行</span>
                                            <div className="operation-canvas-text">
                                                当任务真正调用工具后，这里会展示每一步返回的结构化输出，而不只是聊天摘要。
                                            </div>
                                        </>
                                    )}
                                </div>
                            </section>
                        )}

                        {activeTab === 'actions' && (
                            <section className="operation-section">
                                <div className="operation-section-label">长期记忆</div>
                                <div className="operation-memory-group">
                                    <div className="operation-memory-card">
                                        <span className="operation-canvas-kicker">关联记忆</span>
                                        <div className="operation-memory-list">
                                            {relatedMemories.length > 0 ? relatedMemories.map((memory) => (
                                                <div key={memory.id} className="operation-memory-item">
                                                    <strong>{memory.title}</strong>
                                                    <small>{memory.summary || '暂无摘要'}</small>
                                                </div>
                                            )) : (
                                                <div className="operation-empty">
                                                    当前没有与这轮任务强关联的长期记忆。
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {selectedFireflyTask?.planMetadata?.memoryTitles?.length ? (
                                        <div className="operation-memory-card">
                                            <span className="operation-canvas-kicker">规划依据</span>
                                            <div className="operation-memory-list">
                                                {selectedFireflyTask.planMetadata.memoryTitles.map((titleItem) => (
                                                    <div key={titleItem} className="operation-memory-item">
                                                        <strong>{titleItem}</strong>
                                                        <small>这条记忆已被带入本轮任务规划。</small>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}

                                    {selectedFireflyTask?.nextActions?.length ? (
                                        <div className="operation-memory-card">
                                            <span className="operation-canvas-kicker">推荐下一步</span>
                                            <div className="operation-memory-list">
                                                {selectedFireflyTask.nextActions.map((item) => (
                                                    <button
                                                        type="button"
                                                        key={item.id}
                                                        className="operation-memory-item operation-memory-action"
                                                        onClick={() => (
                                                            item.kind === 'open_workspace'
                                                                ? handleOpenWorkspace(selectedFireflyTask, item)
                                                                : handleContinueTask(selectedFireflyTask, item)
                                                        )}
                                                    >
                                                        <strong>{item.label || '继续推进'}</strong>
                                                        <small>{item.summary}</small>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="operation-memory-card">
                                        <span className="operation-canvas-kicker">快速跳转</span>
                                        <div className="operation-actions">
                                            {activeCapabilities.map((capability) => (
                                                <Link key={capability.id} href={capability.href || '/'} className="operation-action">
                                                    <span>{capability.name}</span>
                                                    <small>{capability.source}</small>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                </>
            )}
        </aside>
    );
}
