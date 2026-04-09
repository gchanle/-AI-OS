import React, { useState } from 'react';
import './TasksModal.css';

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

export default function TasksModal({ isOpen, onClose, tasks, onOpenTask, onDeleteTask, onSaveEdit, editingTaskId, setEditingTaskId, editingTitle, setEditingTitle }) {
    const [activeTab, setActiveTab] = useState('in-progress');

    if (!isOpen) return null;

    const filteredTasks = tasks.filter(t => {
        if (activeTab === 'in-progress') return t.status === 'pending' || t.status === 'in-progress';
        if (activeTab === 'completed') return t.status === 'completed';
        if (activeTab === 'stopped') return t.status === 'stopped' || t.status === 'failed';
        return true;
    });

    return (
        <div className="tasks-modal-overlay" onClick={onClose}>
            <div className="tasks-modal-content" onClick={e => e.stopPropagation()}>
                <div className="tasks-modal-header">
                    <h3>全部任务</h3>
                    <button className="tasks-modal-close" onClick={onClose}>&times;</button>
                </div>
                <div className="tasks-modal-tabs">
                    <button className={`tab-btn ${activeTab === 'in-progress' ? 'active' : ''}`} onClick={() => setActiveTab('in-progress')}>进行中</button>
                    <button className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`} onClick={() => setActiveTab('completed')}>已完成</button>
                    <button className={`tab-btn ${activeTab === 'stopped' ? 'active' : ''}`} onClick={() => setActiveTab('stopped')}>已停止</button>
                </div>
                <div className="tasks-modal-body">
                    {filteredTasks.length === 0 ? (
                        <div className="tasks-empty">暂无任务</div>
                    ) : (
                        <div className="tasks-list-modal">
                            {filteredTasks.map((t, idx) => (
                                <div 
                                    key={t.id || idx} 
                                    className="ls-task modal-task" 
                                    onClick={() => {
                                        onOpenTask?.(t);
                                        onClose();
                                    }}
                                >
                                    <div className="task-header-modal">
                                        {editingTaskId === t.id ? (
                                            <input 
                                                autoFocus
                                                type="text" 
                                                value={editingTitle} 
                                                onChange={e => setEditingTitle(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(t); }}
                                                placeholder="按回车保存"
                                                className="ls-task-edit-input modal-edit-input"
                                                onClick={e => e.stopPropagation()}
                                            />
                                        ) : (
                                            <div className="task-copy-modal">
                                                <div className="task-title-modal">{t.title}</div>
                                                <div className="task-meta-modal">{t.sourceLabel}{t.resultSummary ? ` · ${t.resultSummary}` : ''}</div>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button className="task-delete-btn" onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setEditingTaskId(t.id);
                                                setEditingTitle(t.title);
                                            }} title="编辑" style={{ color: 'var(--primary)' }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                            </button>
                                            <button className="task-delete-btn" onClick={(e) => { e.stopPropagation(); onDeleteTask(t); }} title="移出任务">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className={`ls-task-status ${t.status}`}>
                                        {getTaskStatusLabel(t)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
