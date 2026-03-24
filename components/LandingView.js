'use client';
import { useState } from 'react';
import { agentList, workflowActions } from '@/data/mock';
import './LandingView.css';

export default function LandingView({ onStartChat }) {
    const [inputValue, setInputValue] = useState('');
    const [agents, setAgents] = useState(agentList);

    const toggleAgent = (id) => {
        setAgents((prev) =>
            prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
        );
    };

    const handleSend = (text) => {
        const message = text || inputValue.trim();
        if (!message) return;
        onStartChat(message);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const [showAgentMenu, setShowAgentMenu] = useState(false);
    const selectedAgents = agents.filter(a => a.enabled);
    const mainAgent = selectedAgents.length > 0 ? selectedAgents[0] : agents[0];
    const activeAgentNames = selectedAgents.map((agent) => agent.name).join(' · ');

    return (
        <div className="landing">
            <div className="landing-content">
                <div className="landing-topbar">
                    <div className="landing-brandline">
                        <span className="landing-brand-badge">萤火虫</span>
                        <span className="landing-brand-text">超星 AI 校园 OS</span>
                    </div>
                    <div className="agent-selector-wrapper">
                        <button
                            className="current-agent-btn glass"
                            onClick={() => setShowAgentMenu(!showAgentMenu)}
                            title="能力配置"
                        >
                            <span className="agent-btn-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                            </span>
                            <span className="agent-btn-copy">
                                <span className="agent-btn-name">{mainAgent.name}</span>
                                <span className="agent-btn-meta">{selectedAgents.length} 个系统在线</span>
                            </span>
                            <svg className={`chevron ${showAgentMenu ? 'up' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>

                        {showAgentMenu && (
                            <div className="agent-dropdown glass-strong">
                                <div className="dropdown-header">切换核心能力</div>
                                <div className="dropdown-list">
                                    {agents.map((agent) => (
                                        <button
                                            key={agent.id}
                                            className={`dropdown-item ${agent.enabled ? 'active' : ''}`}
                                            onClick={() => toggleAgent(agent.id)}
                                        >
                                            <span className="di-icon">{agent.icon}</span>
                                            <span className="di-name">{agent.name}</span>
                                            {agent.enabled && (
                                                <svg className="di-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="landing-hero">
                    <div className="hero-kicker">Campus OS Workspace</div>
                    <h1 className="hero-title">
                        把分散的校园系统，
                        <span className="gradient-text">收进一个克制的 AI 工作台</span>
                    </h1>
                    <p className="hero-desc">
                        萤火虫会围绕你的问题组织教务、学工、办事和科研上下文，
                        让 AI 校园空间逐步成为真正可协同的校园 OS。
                    </p>
                </div>

                <div className="landing-system-strip">
                    <span className="system-strip-label">当前接入</span>
                    <div className="system-strip-list">
                        {selectedAgents.map((agent) => (
                            <span key={`selected-${agent.id}`} className="system-strip-pill">
                                {agent.name}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="landing-search-center">
                    <div className="search-box glass-hyper">
                        <div className="search-box-head">
                            <div>
                                <div className="search-box-title">今天想让萤火虫处理什么校园事务？</div>
                                <div className="search-box-desc">支持连续对话、任务提取和多系统协同入口。</div>
                            </div>
                            <div className="search-box-status">{selectedAgents.length} 个系统已启用</div>
                        </div>

                        <div className="search-input-area" style={{ flex: 1 }}>
                            <textarea
                                className="search-textarea"
                                placeholder="例如：帮我把本周课程、待办和截止时间整理成一个学习推进计划"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={3}
                            />
                            
                            <div className="search-actions">
                                <button className="tool-btn" title="上传附件">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                                </button>
                                <button
                                    className={`send-btn ${inputValue.trim() ? 'active' : ''}`}
                                    onClick={() => handleSend()}
                                    disabled={!inputValue.trim()}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="search-footnote">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                        {activeAgentNames || '尚未接入校园系统'}
                    </div>
                </div>

                <div className="landing-capsules">
                    {workflowActions.map((action, i) => (
                        <button
                            key={`wf-${action.id}`}
                            className="func-capsule primary glass"
                            onClick={() => handleSend(action.action)}
                            style={{ animationDelay: `${0.2 + i * 0.05}s` }}
                        >
                            <span className="fc-icon">{action.icon}</span>
                            <span className="fc-label">
                                <strong style={{ fontWeight: 600, marginRight: '4px' }}>{action.title}</strong>
                                {action.desc}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {showAgentMenu && (
                <div
                    className="agent-menu-overlay"
                    onClick={() => setShowAgentMenu(false)}
                />
            )}
        </div>
    );
}
