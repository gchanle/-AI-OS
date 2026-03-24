import { useState, useEffect } from 'react';
import TasksModal from './TasksModal';
import './LeftSidebar.css';

export default function LeftSidebar({ onNewChat, onSelectSession }) {
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

    const handleDeleteTask = (taskId) => {
        const newTasks = tasks.filter(t => t.id !== taskId);
        setTasks(newTasks);
        localStorage.setItem('dynamic_tasks', JSON.stringify(newTasks));
    };

    const handleSaveEdit = (taskId) => {
        const newTasks = tasks.map(t => t.id === taskId ? { ...t, title: editingTitle } : t);
        setTasks(newTasks);
        localStorage.setItem('dynamic_tasks', JSON.stringify(newTasks));
        setEditingTaskId(null);
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
                const normalizedTasks = Array.isArray(storedTasks)
                    ? storedTasks.map((task) => ({
                        ...task,
                        createdAt: task.createdAt || sessionTimeMap[task.sessionId] || new Date().toISOString(),
                    }))
                    : [];

                setTasks(normalizedTasks);
                setChats(normalizedChats);
                window.clearTimeout(readyTimer);
                readyTimer = window.setTimeout(() => setIsReady(true), 220);
            } catch(e) {}
        };
        
        loadData();
        setCalendarAnchor(new Date());

        window.addEventListener('tasks-updated', loadData);
        window.addEventListener('chat-history-updated', loadData);
        return () => {
            window.clearTimeout(readyTimer);
            window.removeEventListener('tasks-updated', loadData);
            window.removeEventListener('chat-history-updated', loadData);
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

        const calendar = [];
        for (let i = 0; i < 42; i++) {
            const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
            const dStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
            const cCount = chatMap[dStr] || 0;
            const tCount = taskMap[dStr] || 0;
            const total = cCount + tCount;
            let level = 0;
            if (total > 0) level = 1;
            if (total >= 2) level = 2;
            if (total >= 4) level = 3;
            if (total >= 6) level = 4;
            const formattedDate = `${d.getMonth()+1}月${d.getDate()}日`;
            calendar.push({ type: 'day', id: i, formattedDate, level, dStr, cCount, tCount });
        }
        setCalendarProps({ calendar, startDate, endDate });
    }, [calendarAnchor, pageOffset, chats, tasks]);

    const { calendar: calendarData, startDate, endDate } = calendarProps;
    const handlePrevPage = () => setPageOffset(prev => prev - 1);
    const handleNextPage = () => setPageOffset(prev => prev + 1);
    const activeHoverCell = hoveredCell || calendarData.find((cell) => cell.level > 0) || calendarData[calendarData.length - 1];

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
                    <>
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
                                    if (!isManageMode && t.sessionId && onSelectSession) {
                                        onSelectSession(t.sessionId);
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
                                            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(t.id); }}
                                            placeholder="按回车保存"
                                            className="ls-task-edit-input"
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ) : (
                                        <div className="ls-task-name">{t.title}</div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div className={`ls-task-status ${t.status}`}>
                                            {t.status === 'completed' ? '已完成' : (t.status === 'stopped' ? '已停止' : '进行中')}
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
                                                <button className="ls-task-del" onClick={(e) => { e.stopPropagation(); handleDeleteTask(t.id); }} title="移出">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="ls-task-bar-bg">
                                    <div className="ls-task-bar-fill" style={{ 
                                        width: `${t.status === 'completed' ? 100 : (t.status === 'stopped' ? 0 : (t.progress > 0 ? t.progress : 40))}%`, 
                                        background: t.status === 'completed' ? 'var(--accent-green)' : (t.status === 'stopped' ? 'var(--text-tertiary)' : 'var(--primary)') 
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
                    <div className="ls-heatmap-card">
                        <div className="calendar-grid">
                            {calendarData.map((cell) => (
                                <div 
                                    key={cell.id} 
                                    className={`heat-cell heat-${cell.level}`} 
                                    onMouseEnter={() => setHoveredCell(cell)}
                                    onMouseLeave={() => setHoveredCell(null)}
                                ></div>
                            ))}
                        </div>
                        {activeHoverCell && (
                            <div className="ls-heatmap-meta">
                                <strong>{activeHoverCell.formattedDate}</strong>
                                <span>{activeHoverCell.cCount} 条对话</span>
                                <span>{activeHoverCell.tCount} 个任务</span>
                            </div>
                        )}
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
                                    <div className="ls-chat-time">{chat.time || chat.date}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    </>
                )}
            </div>

            <TasksModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                tasks={tasks}
                onSelectSession={onSelectSession}
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
