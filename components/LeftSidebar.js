import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import TasksModal from './TasksModal';
import { workflowActions } from '@/data/mock';
import {
    loadFireflyTasks,
    patchFireflyTask,
    removeFireflyTask,
    subscribeFireflyTasks,
} from '@/data/fireflyTasks';
import {
    buildFireflyMemorySnapshot,
    touchFireflyMemory,
} from '@/data/fireflyMemory';
import { loadCampusUserProfile } from '@/data/userProfile';
import { campusCapabilities } from '@/data/workspace';
import './LeftSidebar.css';

const LEFT_SIDEBAR_COLLAPSE_KEY = 'campus_left_sidebar_collapsed';

function sortByRecent(items = []) {
    return [...items].sort(
        (left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime()
            - new Date(left.updatedAt || left.createdAt || 0).getTime()
    );
}

function mapLegacyTask(task = {}, fallbackCreatedAt = null) {
    return {
        ...task,
        rawId: task.id,
        taskKind: 'legacy',
        sourceLabel: '聊天任务',
        status: task.status || 'in-progress',
        createdAt: task.createdAt || fallbackCreatedAt || new Date().toISOString(),
        updatedAt: task.updatedAt || task.createdAt || fallbackCreatedAt || new Date().toISOString(),
        progress: Number(task.progress || 0),
    };
}

function mapFireflyTask(task = {}) {
    const steps = Array.isArray(task.steps) ? task.steps : [];
    const completedSteps = steps.filter((step) => step.status === 'completed').length;
    const progress = steps.length > 0
        ? Math.max(
            task.status === 'running' || task.status === 'planning' ? 16 : 0,
            Math.round((completedSteps / steps.length) * 100)
        )
        : (task.status === 'completed' ? 100 : 40);

    return {
        id: `firefly:${task.id}`,
        rawId: task.id,
        title: task.title || '萤火虫任务',
        taskKind: 'firefly',
        sourceLabel: task.uiContext?.surfaceLabel || '萤火虫',
        status: task.status === 'completed'
            ? 'completed'
            : task.status === 'failed'
                ? 'failed'
                : 'in-progress',
        progress: task.status === 'completed' ? 100 : progress,
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
        capabilityIds: Array.isArray(task.capabilityIds) ? task.capabilityIds : [],
        resultSummary: task.resultSummary || '',
        goal: task.goal || '',
        uiContext: task.uiContext || {},
        memoryIds: Array.isArray(task.memoryIds) ? task.memoryIds : [],
        resumeContext: task.resumeContext || {},
        steps,
        selectedSkillLabels: Array.isArray(task.selectedSkillLabels) ? task.selectedSkillLabels : [],
    };
}

function buildFireflyContinuePrompt(task = {}) {
    const lines = [
        `继续帮我推进这项任务：「${task.title || '萤火虫任务'}」。`,
    ];

    if (task.goal) {
        lines.push(`原始目标：${task.goal}`);
    }

    if (task.sourceLabel) {
        lines.push(`任务来源：${task.sourceLabel}`);
    }

    if (task.resultSummary) {
        lines.push(`当前结果摘要：${task.resultSummary}`);
    } else if (task.status === 'in-progress') {
        lines.push('当前状态：任务还在推进中，请先基于已有上下文判断最值得继续的下一步。');
    } else if (task.status === 'failed') {
        lines.push('当前状态：上一次执行失败，请先判断失败点和更稳妥的继续方式。');
    }

    lines.push('请先给我一个简短判断：接下来最值得做什么；然后把下一步拆成最多 3 条可执行动作。');

    return lines.join('\n');
}

function getTaskStatusLabel(task = {}) {
    if (task.status === 'completed') {
        return '已完成';
    }
    if (task.status === 'failed') {
        return '失败';
    }
    if (task.status === 'stopped') {
        return '已停止';
    }
    return '进行中';
}

export default function LeftSidebar({ onNewChat, onSelectSession, variant = 'classic', onQuickStart }) {
    const [collapsed, setCollapsed] = useState(false);
    const [activeChat, setActiveChat] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [chats, setChats] = useState([]);
    const [isReady, setIsReady] = useState(false);
    const [isManageMode, setIsManageMode] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTaskId, setEditingTaskId] = useState(null);
    const [editingTitle, setEditingTitle] = useState('');
    const [pageOffset, setPageOffset] = useState(0);
    const [calendarAnchor, setCalendarAnchor] = useState(null);
    const [hoveredCell, setHoveredCell] = useState(null);
    const [minimalTab, setMinimalTab] = useState('chats');
    const [minimalSearch, setMinimalSearch] = useState('');
    const heatmapCardRef = useRef(null);

    useEffect(() => {
        try {
            const storedState = localStorage.getItem(LEFT_SIDEBAR_COLLAPSE_KEY);
            if (storedState !== null) {
                setCollapsed(storedState === '1');
            }
        } catch (error) {
            console.error('Failed to restore left sidebar state:', error);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(LEFT_SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
        } catch (error) {
            console.error('Failed to persist left sidebar state:', error);
        }
    }, [collapsed]);

    const handleDeleteTask = (task) => {
        if (task?.taskKind === 'firefly') {
            removeFireflyTask(task.rawId);
            return;
        }

        const newTasks = tasks
            .filter((item) => item.id !== task?.id)
            .filter((item) => item.taskKind !== 'firefly');
        const legacyTasks = newTasks.map(({ taskKind, rawId, sourceLabel, ...item }) => item);
        setTasks(sortByRecent([...newTasks, ...loadFireflyTasks().map(mapFireflyTask)]));
        localStorage.setItem('dynamic_tasks', JSON.stringify(legacyTasks));
        window.dispatchEvent(new Event('tasks-updated'));
    };

    const handleSaveEdit = (task) => {
        if (!task) {
            return;
        }

        if (task.taskKind === 'firefly') {
            patchFireflyTask(task.rawId, { title: editingTitle });
            setEditingTaskId(null);
            return;
        }

        const newTasks = tasks.map((item) => (
            item.id === task.id ? { ...item, title: editingTitle } : item
        ));
        const legacyTasks = newTasks
            .filter((item) => item.taskKind !== 'firefly')
            .map(({ taskKind, rawId, sourceLabel, ...item }) => item);
        setTasks(newTasks);
        localStorage.setItem('dynamic_tasks', JSON.stringify(legacyTasks));
        window.dispatchEvent(new Event('tasks-updated'));
        setEditingTaskId(null);
    };

    const handleOpenTask = (task) => {
        if (!task) {
            return;
        }

        if (task.taskKind === 'firefly') {
            const profile = loadCampusUserProfile();
            const memorySnapshot = buildFireflyMemorySnapshot({
                uid: profile.uid,
                capabilityIds: task.capabilityIds || [],
                question: `${task.title} ${task.goal || ''}`,
                limit: 3,
            });
            touchFireflyMemory(task.memoryIds || []);
            onQuickStart?.(
                buildFireflyContinuePrompt(task),
                {
                    capabilityIds: task.capabilityIds || [],
                    runtimeContext: {
                        ...(task.resumeContext || {}),
                        resumeMode: true,
                        parentTaskId: task.rawId,
                        taskTitle: task.title,
                        taskGoal: task.goal,
                        taskResultSummary: task.resultSummary,
                        taskMemorySummary: memorySnapshot.markdown,
                        memoryIds: task.memoryIds || [],
                        taskSelectedSkills: task.selectedSkillLabels || [],
                    },
                    threadKey: task.uiContext?.drawerThreadKey || task.rawId,
                }
            );
            return;
        }

        if (task.sessionId && onSelectSession) {
            onSelectSession(task.sessionId);
        }
    };

    useEffect(() => {
        let readyTimer;

        const loadData = () => {
            try {
                const storedChats = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
                const normalizedChats = Array.isArray(storedChats)
                    ? storedChats.map((chat) => ({
                        ...chat,
                        updatedAt: chat.updatedAt || chat.time || chat.date || new Date().toISOString(),
                    }))
                    : [];

                const sessionTimeMap = Object.fromEntries(
                    normalizedChats.map((chat) => [chat.id, chat.updatedAt])
                );

                const storedTasks = JSON.parse(localStorage.getItem('dynamic_tasks') || '[]');
                const normalizedLegacyTasks = Array.isArray(storedTasks)
                    ? storedTasks.map((task) => mapLegacyTask(task, sessionTimeMap[task.sessionId]))
                    : [];
                const fireflyTasks = loadFireflyTasks().map(mapFireflyTask);

                setTasks(sortByRecent([...normalizedLegacyTasks, ...fireflyTasks]));
                setChats(normalizedChats);
                window.clearTimeout(readyTimer);
                readyTimer = window.setTimeout(() => setIsReady(true), 220);
            } catch(e) {}
        };
        
        loadData();
        setCalendarAnchor(new Date());

        window.addEventListener('tasks-updated', loadData);
        window.addEventListener('chat-history-updated', loadData);
        const unsubscribeFireflyTasks = subscribeFireflyTasks(loadData);
        return () => {
            window.clearTimeout(readyTimer);
            window.removeEventListener('tasks-updated', loadData);
            window.removeEventListener('chat-history-updated', loadData);
            unsubscribeFireflyTasks();
        };
    }, []);

    const [calendarProps, setCalendarProps] = useState({ calendar: [], startDate: null, endDate: null });

    useEffect(() => {
        if (!calendarAnchor) return;

        const today = calendarAnchor;
        const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (pageOffset * 42));
        const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 41);
        
        const chatMap = {};
        const taskMap = {};
        chats.forEach(c => {
            const d = new Date(c.updatedAt || c.time || c.date || new Date());
            if (!isNaN(d)) {
                const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
                chatMap[key] = (chatMap[key] || 0) + 1;
            }
        });
        tasks.forEach(t => {
            const d = new Date(t.createdAt || new Date());
            if (!isNaN(d)) {
                const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
                taskMap[key] = (taskMap[key] || 0) + 1;
            }
        });

        const dayTotals = [];
        const calendar = [];
        for (let i = 0; i < 42; i++) {
            const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
            const dStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
            const cCount = chatMap[dStr] || 0;
            const tCount = taskMap[dStr] || 0;
            const total = cCount + tCount;
            dayTotals.push(total);
            const formattedDate = `${d.getMonth()+1}月${d.getDate()}日`;
            calendar.push({ type: 'day', id: i, formattedDate, dStr, cCount, tCount, total });
        }

        const maxDensity = Math.max(...dayTotals, 0);
        const calendarWithLevels = calendar.map((cell) => {
            let level = 0;

            if (cell.total > 0) {
                if (maxDensity <= 3) {
                    level = Math.min(4, cell.total);
                } else {
                    level = Math.min(4, Math.max(1, Math.ceil((cell.total / maxDensity) * 4)));
                }
            }

            return {
                ...cell,
                level,
            };
        });

        setCalendarProps({ calendar: calendarWithLevels, startDate, endDate });
    }, [calendarAnchor, pageOffset, chats, tasks]);

    const { calendar: calendarData, startDate, endDate } = calendarProps;
    const handlePrevPage = () => setPageOffset(prev => prev - 1);
    const handleNextPage = () => setPageOffset(prev => prev + 1);
    const totalChatsInRange = calendarData.reduce((sum, cell) => sum + cell.cCount, 0);
    const totalTasksInRange = calendarData.reduce((sum, cell) => sum + cell.tCount, 0);

    const handleHeatCellEnter = (event, cell) => {
        const cardRect = heatmapCardRef.current?.getBoundingClientRect();
        const cellRect = event.currentTarget.getBoundingClientRect();

        if (!cardRect) {
            setHoveredCell(cell);
            return;
        }

        const nextLeft = Math.min(
            Math.max(cellRect.left - cardRect.left + (cellRect.width / 2), 84),
            cardRect.width - 84
        );

        setHoveredCell({
            ...cell,
            tooltipLeft: nextLeft,
        });
    };

    const formatHistoryTime = (chat) => {
        const raw = chat.updatedAt || chat.time || chat.date;
        const date = new Date(raw);

        if (Number.isNaN(date.getTime())) {
            return raw;
        }

        return date.toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const filteredChats = useMemo(() => {
        const keyword = minimalSearch.trim().toLowerCase();
        if (!keyword) {
            return chats;
        }

        return chats.filter((chat) => (
            chat.title?.toLowerCase().includes(keyword)
            || formatHistoryTime(chat).toLowerCase().includes(keyword)
        ));
    }, [chats, minimalSearch]);

    const filteredTasks = useMemo(() => {
        const keyword = minimalSearch.trim().toLowerCase();
        if (!keyword) {
            return tasks;
        }

        return tasks.filter((task) => (
            task.title?.toLowerCase().includes(keyword)
            || (task.status || '').toLowerCase().includes(keyword)
            || (task.sourceLabel || '').toLowerCase().includes(keyword)
        ));
    }, [tasks, minimalSearch]);

    const filteredCapabilities = useMemo(() => {
        const keyword = minimalSearch.trim().toLowerCase();
        if (!keyword) {
            return campusCapabilities;
        }

        return campusCapabilities.filter((capability) => (
            capability.name.toLowerCase().includes(keyword)
            || capability.source.toLowerCase().includes(keyword)
            || capability.summary.toLowerCase().includes(keyword)
        ));
    }, [minimalSearch]);

    const filteredSkills = useMemo(() => {
        const keyword = minimalSearch.trim().toLowerCase();
        if (!keyword) {
            return workflowActions;
        }

        return workflowActions.filter((action) => (
            action.title.toLowerCase().includes(keyword)
            || action.desc.toLowerCase().includes(keyword)
            || action.action.toLowerCase().includes(keyword)
        ));
    }, [minimalSearch]);

    if (variant === 'minimal') {
        if (collapsed) {
            return (
                <aside className="ls-sidebar collapsed ls-sidebar-minimal-collapsed glass">
                    <button className="ls-icon-btn" onClick={() => setCollapsed(false)} title="展开左侧面板">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                    </button>
                    <button className={`ls-icon-btn ${minimalTab === 'chats' ? 'active' : ''}`} onClick={() => { setMinimalTab('chats'); setCollapsed(false); }} title="对话">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    </button>
                    <button className={`ls-icon-btn ${minimalTab === 'library' ? 'active' : ''}`} onClick={() => { setMinimalTab('library'); setCollapsed(false); }} title="库">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                    </button>
                    <button className={`ls-icon-btn ${minimalTab === 'tasks' ? 'active' : ''}`} onClick={() => { setMinimalTab('tasks'); setCollapsed(false); }} title="任务">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                    </button>
                </aside>
            );
        }

        return (
            <aside className="ls-sidebar ls-sidebar-minimal glass">
                <div className="ls-header ls-header-minimal">
                    <button className="ls-new-btn glass-strong" onClick={onNewChat} title="开启新对话">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        <span>开启新对话</span>
                    </button>
                    <button className="ls-icon-btn collapse-btn" onClick={() => setCollapsed(true)} title="收起左侧面板">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                    </button>
                </div>

                <div className="ls-scroll ls-scroll-minimal">
                    <div className="ls-minimal-search glass-strong">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                        <input
                            type="text"
                            value={minimalSearch}
                            onChange={(event) => setMinimalSearch(event.target.value)}
                            placeholder="搜索对话、能力、任务"
                        />
                    </div>

                    <div className="ls-minimal-tabs">
                        <button type="button" className={`ls-minimal-tab ${minimalTab === 'chats' ? 'active' : ''}`} onClick={() => setMinimalTab('chats')}>对话</button>
                        <button type="button" className={`ls-minimal-tab ${minimalTab === 'library' ? 'active' : ''}`} onClick={() => setMinimalTab('library')}>库</button>
                        <button type="button" className={`ls-minimal-tab ${minimalTab === 'tasks' ? 'active' : ''}`} onClick={() => setMinimalTab('tasks')}>任务</button>
                    </div>

                    {!isReady ? (
                        <div className="ls-skeleton-stack">
                            <div className="ls-skeleton-section">
                                <div className="skeleton-box ls-skeleton-title"></div>
                                <div className="skeleton-box ls-skeleton-row"></div>
                                <div className="skeleton-box ls-skeleton-row"></div>
                                <div className="skeleton-box ls-skeleton-row short"></div>
                            </div>
                        </div>
                    ) : (
                        <div className="ls-live-body">
                            {minimalTab === 'chats' && (
                                <div className="ls-section ls-history-section ls-history-section-minimal">
                                    <div className="ls-sec-title ls-sec-title-minimal">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                        对话
                                    </div>
                                    <div className="ls-history">
                                        {filteredChats.length > 0 ? filteredChats.map((chat, idx) => (
                                            <div
                                                key={chat.id || idx}
                                                className={`ls-chat-item ${activeChat === chat.id ? 'active' : ''}`}
                                                onClick={() => {
                                                    setActiveChat(chat.id);
                                                    if (onSelectSession) onSelectSession(chat.id);
                                                }}
                                            >
                                                <div className="ls-chat-title">{chat.title}</div>
                                                <div className="ls-chat-time">{formatHistoryTime(chat)}</div>
                                            </div>
                                        )) : (
                                            <div className="ls-empty-text">没有匹配的对话记录</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {minimalTab === 'library' && (
                                <div className="ls-section ls-library-section">
                                    <div className="ls-sec-title ls-sec-title-minimal">能力库</div>
                                    <div className="ls-minimal-card-list">
                                        {filteredCapabilities.map((capability) => (
                                            <Link key={capability.id} href={capability.href || '/'} className="ls-mini-card">
                                                <strong>{capability.name}</strong>
                                                <span>{capability.source}</span>
                                            </Link>
                                        ))}
                                    </div>

                                    <div className="ls-sec-title ls-sec-title-minimal">技能快捷指令</div>
                                    <div className="ls-minimal-card-list">
                                        {filteredSkills.map((action) => (
                                            <button
                                                key={action.id}
                                                type="button"
                                                className="ls-mini-card action"
                                                onClick={() => onQuickStart?.(action.action)}
                                            >
                                                <strong>{action.title}</strong>
                                                <span>{action.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {minimalTab === 'tasks' && (
                                <div className="ls-section ls-library-section">
                                    <div className="ls-sec-title ls-sec-title-minimal">任务队列</div>
                                    <div className="ls-minimal-card-list">
                                        {filteredTasks.length > 0 ? filteredTasks.map((task, idx) => (
                                            <button
                                                key={task.id || idx}
                                                type="button"
                                                className="ls-mini-card action"
                                                onClick={() => handleOpenTask(task)}
                                            >
                                                <strong>{task.title}</strong>
                                                <span>{task.sourceLabel} · {getTaskStatusLabel(task)}</span>
                                            </button>
                                        )) : (
                                            <div className="ls-empty-text">当前没有匹配的任务</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </aside>
        );
    }

    if (collapsed) {
        return (
            <aside className="ls-sidebar collapsed">
                <button className="ls-icon-btn" onClick={() => setCollapsed(false)} title="展开边栏">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                </button>
                <button className="ls-icon-btn" onClick={onNewChat} title="新建对话 / 回到主页">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                </button>
            </aside>
        );
    }

    return (
        <aside className="ls-sidebar glass">
            <div className="ls-header">
                <button className="ls-new-btn glass-strong" onClick={onNewChat} title="开启新对话">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    <span>开启新对话</span>
                </button>
                <button className="ls-icon-btn collapse-btn" onClick={() => setCollapsed(true)} title="收起边栏">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                </button>
            </div>

            <div className="ls-scroll">
                {!isReady ? (
                    <div className="ls-skeleton-stack">
                        <div className="ls-skeleton-section">
                            <div className="skeleton-box ls-skeleton-title"></div>
                            <div className="skeleton-box ls-skeleton-card"></div>
                            <div className="skeleton-box ls-skeleton-card"></div>
                        </div>
                        <div className="ls-skeleton-section">
                            <div className="skeleton-box ls-skeleton-title"></div>
                            <div className="skeleton-box ls-skeleton-heatmap"></div>
                            <div className="skeleton-box ls-skeleton-meta"></div>
                        </div>
                        <div className="ls-skeleton-section">
                            <div className="skeleton-box ls-skeleton-title"></div>
                            <div className="skeleton-box ls-skeleton-row"></div>
                            <div className="skeleton-box ls-skeleton-row"></div>
                            <div className="skeleton-box ls-skeleton-row short"></div>
                        </div>
                    </div>
                ) : (
                    <div className="ls-live-body">
                {/* 1. 任务进度看板 */}
                <div className="ls-section">
                    <div className="ls-sec-title-area">
                        <div className="ls-sec-title">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                            任务看板
                        </div>
                        {tasks.length > 0 && (
                            <button className="ls-manage-btn" onClick={() => setIsManageMode(!isManageMode)}>
                                {isManageMode ? '完成' : '管理'}
                            </button>
                        )}
                    </div>
                    <div className="ls-task-list">
                        {tasks.slice(0, 3).map((t, idx) => (
                            <div 
                                key={t.id || idx} 
                                className={`ls-task ${!isManageMode ? 'clickable' : ''}`}
                                onClick={() => {
                                    if (!isManageMode) {
                                        handleOpenTask(t);
                                    }
                                }}
                            >
                                <div className="ls-task-info">
                                    {editingTaskId === t.id ? (
                                        <input 
                                            autoFocus
                                            type="text" 
                                            value={editingTitle} 
                                            onChange={e => setEditingTitle(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(t); }}
                                            placeholder="按回车保存"
                                            className="ls-task-edit-input"
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ) : (
                                        <div className="ls-task-copy">
                                            <div className="ls-task-name">{t.title}</div>
                                            <div className="ls-task-meta-line">{t.sourceLabel}{t.resultSummary ? ` · ${t.resultSummary}` : ''}</div>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div className={`ls-task-status ${t.status}`}>
                                            {getTaskStatusLabel(t)}
                                        </div>
                                        {isManageMode && (
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button className="ls-task-del" onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    setEditingTaskId(t.id);
                                                    setEditingTitle(t.title);
                                                }} title="编辑名称" style={{ color: 'var(--primary)' }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                                </button>
                                                <button className="ls-task-del" onClick={(e) => { e.stopPropagation(); handleDeleteTask(t); }} title="移出">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                    <div className="ls-task-bar-bg">
                                        <div className="ls-task-bar-fill" style={{ 
                                        width: `${t.status === 'completed' ? 100 : (t.status === 'stopped' ? 0 : (t.progress > 0 ? t.progress : 40))}%`, 
                                        background: t.status === 'completed'
                                            ? 'var(--accent-green)'
                                            : (t.status === 'failed' ? '#ff7a7a' : (t.status === 'stopped' ? 'var(--text-tertiary)' : 'var(--primary)')) 
                                    }}></div>
                                </div>
                            </div>
                        ))}
                        {tasks.length > 3 && (
                            <button className="ls-view-more" onClick={() => setIsModalOpen(true)}>
                                查看更多 ({tasks.length - 3})
                            </button>
                        )}
                        {tasks.length === 0 && (
                            <div className="ls-empty-text">暂无任务，快去和 AI 聊聊吧</div>
                        )}
                    </div>
                </div>
                
                {/* 2. 日历式活跃度统计 */}
                <div className="ls-section ls-heatmap-section">
                    <div className="ls-sec-title-area">
                        <div className="ls-sec-title">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                            近期活跃
                        </div>
                        <div className="ls-calendar-nav">
                            <button onClick={handlePrevPage}>&lt;</button>
                            <span>
                                {startDate && endDate
                                    ? `${startDate.getMonth() + 1}/${startDate.getDate()} - ${endDate.getMonth() + 1}/${endDate.getDate()}`
                                    : '正在加载'}
                            </span>
                            <button onClick={handleNextPage}>&gt;</button>
                        </div>
                    </div>
                    <div
                        className="ls-heatmap-card"
                        ref={heatmapCardRef}
                        onMouseLeave={() => setHoveredCell(null)}
                    >
                        {hoveredCell && (
                            <div
                                className="ls-heatmap-tooltip"
                                style={{ left: hoveredCell.tooltipLeft || '50%' }}
                            >
                                <strong>{hoveredCell.formattedDate}</strong>
                                <span>{hoveredCell.cCount} 条对话</span>
                                <span>{hoveredCell.tCount} 个任务</span>
                            </div>
                        )}
                        <div className="ls-heatmap-grid-wrap">
                            <div className="calendar-grid">
                                {calendarData.map((cell) => (
                                    <div 
                                        key={cell.id} 
                                        className={`heat-cell heat-${cell.level}`}
                                        onMouseEnter={(event) => handleHeatCellEnter(event, cell)}
                                        title={`${cell.formattedDate} · ${cell.cCount} 条对话 · ${cell.tCount} 个任务`}
                                    ></div>
                                ))}
                            </div>
                        </div>
                        <div className="ls-heatmap-meta">
                            <strong>最近 42 天</strong>
                            <span>{totalChatsInRange} 条对话</span>
                            <span>{totalTasksInRange} 个任务</span>
                        </div>
                    </div>
                </div>

                {/* 3. 历史对话列表 */}
                <div className="ls-section ls-history-section">
                        <div className="ls-sec-title">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                            最近对话
                        </div>
                        <div className="ls-history">
                            {chats.map((chat, idx) => (
                                <div
                                    key={chat.id || idx}
                                    className={`ls-chat-item ${activeChat === chat.id ? 'active' : ''}`}
                                    onClick={() => {
                                        setActiveChat(chat.id);
                                        if (onSelectSession) onSelectSession(chat.id);
                                    }}
                                >
                                    <div className="ls-chat-title">{chat.title}</div>
                                    <div className="ls-chat-time">{formatHistoryTime(chat)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    </div>
                )}
            </div>

            <TasksModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                tasks={tasks}
                onOpenTask={handleOpenTask}
                onDeleteTask={handleDeleteTask}
                onSaveEdit={handleSaveEdit}
                editingTaskId={editingTaskId}
                setEditingTaskId={setEditingTaskId}
                editingTitle={editingTitle}
                setEditingTitle={setEditingTitle}
            />
        </aside>
    );
}
