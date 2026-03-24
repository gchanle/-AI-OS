'use client';
import { useRef, useState } from 'react';
import { workflowActions } from '@/data/mock';
import './LandingView.css';

const capabilityIcons = {
    services: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
    research: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>,
    assistant: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>,
    library: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
    agents: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></svg>,
};

export default function LandingView({ onStartChat, capabilities, selectedCapabilityIds, onToggleCapability }) {
    const [inputValue, setInputValue] = useState('');
    const textareaRef = useRef(null);

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
    const selectedCapabilities = capabilities.filter((item) => selectedCapabilityIds.includes(item.id));
    const mainCapability = selectedCapabilities.length > 0 ? selectedCapabilities[0] : capabilities[0];
    const activeCapabilityNames = selectedCapabilities.map((item) => item.name).join(' · ');

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
                            title="接入能力配置"
                        >
                            <span className="agent-btn-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                            </span>
                            <span className="agent-btn-copy">
                                <span className="agent-btn-name">{mainCapability.name}</span>
                                <span className="agent-btn-meta">{selectedCapabilities.length} 个能力已接入</span>
                            </span>
                            <svg className={`chevron ${showAgentMenu ? 'up' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>

                        {showAgentMenu && (
                            <div className="agent-dropdown glass-strong">
                                <div className="dropdown-header">接入能力配置</div>
                                <div className="dropdown-list">
                                    {capabilities.map((capability) => (
                                        <button
                                            key={capability.id}
                                            className={`dropdown-item ${selectedCapabilityIds.includes(capability.id) ? 'active' : ''}`}
                                            onClick={() => onToggleCapability(capability.id)}
                                        >
                                            <span className="di-icon">{capabilityIcons[capability.id]}</span>
                                            <span className="di-name">{capability.name}</span>
                                            {selectedCapabilityIds.includes(capability.id) && (
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
                        {selectedCapabilities.map((capability) => (
                            <span key={`selected-${capability.id}`} className="system-strip-pill">
                                {capability.name}
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
                            <div className="search-box-status">{selectedCapabilities.length} 个能力已接入</div>
                        </div>

                        <div
                            className="search-input-area"
                            style={{ flex: 1 }}
                            onClick={() => textareaRef.current?.focus()}
                        >
                            <textarea
                                ref={textareaRef}
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
                        {activeCapabilityNames || '尚未接入校园能力'}
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
