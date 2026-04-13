'use client';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import FireflyMark from '@/components/FireflyMark';
import { workflowActions } from '@/data/mock';
import { resolveChatModel } from '@/data/workspace';
import './LandingView.css';

const capabilityIcons = {
    services: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
    research: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>,
    assistant: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>,
    library: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
    agents: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></svg>,
};

const dashboardModuleOptions = [
    { id: 'paths', label: '常用场景', desc: '展示几个最容易直接开始的入口' },
    { id: 'modules', label: '模块入口', desc: '展示当前默认模块和常用能力入口' },
    { id: 'continuity', label: '使用提示', desc: '展示右侧萤火虫和跨页接力说明' },
    { id: 'templates', label: '快捷模板', desc: '展示高频发起方式和常用模板' },
];

export default function LandingView({
    onStartChat,
    capabilities,
    selectedCapabilityIds,
    onToggleCapability,
    availableModels,
    preferredModelId,
    onPreferredModelChange,
    variant = 'classic',
    webSearchEnabled = false,
    deepResearchEnabled = false,
    onWebSearchChange,
    onDeepResearchChange,
    dashboardSections = ['paths'],
    onToggleDashboardSection,
}) {
    const [inputValue, setInputValue] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [showAgentMenu, setShowAgentMenu] = useState(false);
    const [showLayoutMenu, setShowLayoutMenu] = useState(false);
    const textareaRef = useRef(null);
    const speechRecognitionRef = useRef(null);

    const selectedCapabilities = useMemo(
        () => capabilities.filter((item) => selectedCapabilityIds.includes(item.id)),
        [capabilities, selectedCapabilityIds]
    );
    const capabilityById = useMemo(
        () => Object.fromEntries(capabilities.map((item) => [item.id, item])),
        [capabilities]
    );
    const visibleDashboardSections = Array.isArray(dashboardSections)
        ? dashboardSections
        : [];
    const visibleCapabilityCards = selectedCapabilities.length > 0
        ? selectedCapabilities
        : capabilities.slice(0, 3);
    const mainCapability = selectedCapabilities[0] || capabilities[0];
    const activeCapabilityNames = selectedCapabilities.map((item) => item.name).join(' · ');
    const activeModelLabel = resolveChatModel(preferredModelId).label;
    const isMinimal = variant === 'minimal';

    const goldenPaths = [
        {
            id: 'services',
            eyebrow: '事务推进',
            title: '办事事项快速整理',
            desc: '从 AI 办事 进入，把今天要处理的事务整理成清晰待办。',
            steps: ['进入 AI 办事', '补充需求', '整理为待办'],
            href: capabilityById.services?.href || '/services',
            prompt: '请基于 AI 办事 场景，帮我梳理今天最需要推进的校园事务，并按优先级整理成清单。',
        },
        {
            id: 'research',
            eyebrow: '科研探索',
            title: '科研问题快速起步',
            desc: '从 AI 科研 进入，把研究问题拆成检索方向、比较维度和下一步动作。',
            steps: ['进入 AI 科研', '继续追问', '形成研究框架'],
            href: capabilityById.research?.href || '/research',
            prompt: '请基于 AI 科研 场景，帮我把一个待探索的研究问题拆成检索方向、比较维度和后续动作。',
        },
        {
            id: 'library',
            eyebrow: '阅读沉淀',
            title: '阅读与笔记整理',
            desc: '从 AI 图书馆 选书、阅读，并把关键内容沉淀为笔记。',
            steps: ['进入 AI 图书馆', '边读边问', '整理成笔记'],
            href: capabilityById.library?.href || '/library',
            prompt: '请基于 AI 图书馆 场景，帮我把当前阅读过程整理成一套可持续推进的阅读与笔记计划。',
        },
    ];

    const continuityPoints = [
        {
            id: 'drawer',
            title: '模块页可继续提问',
            desc: '进入 AI 办事、AI 科研、AI 助教、AI 图书馆和 AI 智能体 后，都可以继续打开右侧萤火虫。',
        },
        {
            id: 'memory',
            title: '对话记录会持续保留',
            desc: '你在业务页里的提问、阅读和整理结果，会回到萤火虫的对话记录里。',
        },
        {
            id: 'config',
            title: '首页可以按角色调整',
            desc: '你可以根据岗位需要决定首页展示哪些模块和常用入口。',
        },
    ];

    const closeMenus = () => {
        setShowAgentMenu(false);
        setShowLayoutMenu(false);
    };

    const handleSend = (text) => {
        const message = (text || inputValue).trim();
        if (!message) {
            return;
        }
        closeMenus();
        onStartChat(message);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSend();
        }
    };

    const preventComposerFocusSteal = (event) => {
        event.stopPropagation();
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

    const handlePathStart = (path) => {
        if (!selectedCapabilityIds.includes(path.id)) {
            onToggleCapability?.(path.id);
        }
        handleSend(path.prompt);
    };

    if (isMinimal) {
        return (
            <div className="landing landing-minimal">
                <div className="landing-minimal-shell glass-strong">
                    <div className="landing-minimal-head">
                        <div className="landing-minimal-brand">
                            <FireflyMark size={22} className="landing-brand-mark" decorative />
                            <span className="landing-brand-text">萤火虫</span>
                        </div>
                    </div>

                    <div className="landing-minimal-copy">
                        <h1>今天想让萤火虫帮你做什么？</h1>
                        <p>直接输入任务、问题或目标即可开始。你也可以先切换模型、联网搜索和接入模块，再发起对话。</p>
                    </div>

                    <div className="chat-composer-minimal landing-composer-minimal glass">
                        <div className="chat-composer-status">
                            当前默认模块：{activeCapabilityNames || '尚未接入校园能力'}。你也可以在这里直接调整模型、联网搜索和接入模块。
                        </div>
                        <div
                            className="chat-input-box chat-input-box-minimal"
                            onClick={() => textareaRef.current?.focus()}
                        >
                            <textarea
                                ref={textareaRef}
                                className="chat-textarea chat-textarea-minimal"
                                placeholder="例如：帮我把今天要推进的科研、办事和阅读任务整理成一条工作链"
                                value={inputValue}
                                onChange={(event) => setInputValue(event.target.value)}
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
                                    <select
                                        value={preferredModelId}
                                        onChange={(event) => onPreferredModelChange?.(event.target.value)}
                                    >
                                        {availableModels.map((model) => (
                                            <option key={model.id} value={model.id}>
                                                {model.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <button
                                    className={`chat-tool-btn ${isListening ? 'active' : ''}`}
                                    type="button"
                                    title="语音输入"
                                    onClick={handleVoiceInput}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                </button>
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
                                <div className="chat-menu-wrap">
                                    <button
                                        className="chat-tool-chip"
                                        type="button"
                                        onClick={() => {
                                            setShowAgentMenu((prev) => !prev);
                                            setShowLayoutMenu(false);
                                        }}
                                    >
                                        接入
                                    </button>
                                    {showAgentMenu && (
                                        <div className="chat-floating-menu glass-strong">
                                            {capabilities.map((capability) => (
                                                <button
                                                    key={capability.id}
                                                    type="button"
                                                    className={`chat-floating-item ${selectedCapabilityIds.includes(capability.id) ? 'active' : ''}`}
                                                    onClick={() => onToggleCapability(capability.id)}
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

                    <div className="landing-minimal-footnote">
                        <span>当前模型</span>
                        <strong>{activeModelLabel}</strong>
                        <span>·</span>
                        <strong>{activeCapabilityNames || '尚未接入校园能力'}</strong>
                    </div>
                </div>

                {showAgentMenu && (
                    <div
                        className="agent-menu-overlay"
                        onClick={closeMenus}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="landing landing-classic">
            <div className="landing-content landing-content-rich">
                <div className="landing-topbar">
                    <div className="landing-brandline">
                        <span className="landing-brand-badge">
                            <FireflyMark size={16} className="landing-brand-mark" decorative />
                            萤火虫
                        </span>
                        <span className="landing-brand-text">超星 AI 校园 OS</span>
                    </div>

                    <div className="landing-controls">
                        <Link href="/firefly-workbench" className="landing-workbench-link glass">
                            打开任务工作台
                        </Link>
                        <div className="layout-selector-wrapper">
                            <button
                                className={`workspace-config-btn glass ${showLayoutMenu ? 'active' : ''}`}
                                type="button"
                                onClick={() => {
                                    setShowLayoutMenu((prev) => !prev);
                                    setShowAgentMenu(false);
                                }}
                            >
                                <span className="workspace-config-copy">
                                    <strong>首页卡片</strong>
                                    <small>{visibleDashboardSections.length > 0 ? `${visibleDashboardSections.length} 个已显示` : '当前已隐藏'}</small>
                                </span>
                                <svg className={`chevron ${showLayoutMenu ? 'up' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>

                            {showLayoutMenu && (
                                <div className="layout-dropdown glass-strong">
                                    <div className="dropdown-header">首页卡片</div>
                                    <div className="dropdown-list">
                                        {dashboardModuleOptions.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                className={`dropdown-item layout-option ${visibleDashboardSections.includes(item.id) ? 'active' : ''}`}
                                                onClick={() => onToggleDashboardSection?.(item.id)}
                                            >
                                                <span className="layout-option-copy">
                                                    <strong>{item.label}</strong>
                                                    <span>{item.desc}</span>
                                                </span>
                                                {visibleDashboardSections.includes(item.id) && (
                                                    <svg className="di-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="agent-selector-wrapper">
                            <button
                                className="current-agent-btn glass"
                                type="button"
                                onClick={() => {
                                    setShowAgentMenu((prev) => !prev);
                                    setShowLayoutMenu(false);
                                }}
                                title="默认工作面配置"
                            >
                                <span className="agent-btn-icon">{capabilityIcons[mainCapability.id]}</span>
                                <span className="agent-btn-copy">
                                    <span className="agent-btn-name">{mainCapability.name}</span>
                                    <span className="agent-btn-meta">{selectedCapabilities.length} 个能力已接入</span>
                                </span>
                                <svg className={`chevron ${showAgentMenu ? 'up' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>

                            {showAgentMenu && (
                                <div className="agent-dropdown glass-strong">
                                    <div className="dropdown-header">默认工作面</div>
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
                </div>

                <div className="landing-hero-grid">
                    <div className="landing-hero">
                        <div className="hero-kicker">欢迎使用萤火虫</div>
                        <h1 className="hero-title">
                            今天想先处理什么，
                            <span className="gradient-text">直接交给萤火虫开始</span>
                        </h1>
                        <p className="hero-desc">
                            你可以直接发起任务，也可以先进入 AI 办事、AI 科研、AI 图书馆等模块再继续处理。
                            首页默认只保留更常用的内容，其他模块可以按需展开。
                        </p>
                        <div className="landing-hero-pills">
                            <span className="landing-hero-pill">{selectedCapabilities.length} 个已接入模块</span>
                            <span className="landing-hero-pill">{activeModelLabel}</span>
                            <span className="landing-hero-pill">右侧随时唤起</span>
                        </div>
                        <div className="landing-compact-modules glass">
                            <span className="landing-compact-modules-label">当前模块</span>
                            <div className="landing-compact-module-list">
                                {visibleCapabilityCards.map((capability) => (
                                    <span key={capability.id} className="landing-compact-module-pill">
                                        <span className="landing-compact-module-icon">{capabilityIcons[capability.id]}</span>
                                        <span>{capability.name}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="landing-search-center">
                    <div className="search-box glass-hyper">
                        <div className="search-box-head">
                            <div>
                                <div className="search-box-title">告诉萤火虫你现在要做什么</div>
                                <div className="search-box-desc">支持直接发起任务，也可以先切换模型、联网搜索和接入模块。</div>
                            </div>
                            <div className="search-box-status">已接入 {selectedCapabilities.length} 个模块</div>
                        </div>

                        <div
                            className="search-input-area"
                            onClick={() => textareaRef.current?.focus()}
                        >
                            <textarea
                                ref={textareaRef}
                                className="search-textarea"
                                placeholder="例如：帮我把今天需要推进的科研、办事和阅读任务串成一条工作链"
                                value={inputValue}
                                onChange={(event) => setInputValue(event.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={3}
                            />

                            <div
                                className="search-actions"
                                onMouseDown={preventComposerFocusSteal}
                                onClick={preventComposerFocusSteal}
                            >
                                <div className="search-composer-tools">
                                    <button className="tool-btn" type="button" title="上传附件">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                                    </button>
                                    <button
                                        className={`tool-btn ${isListening ? 'listening' : ''}`}
                                        type="button"
                                        title="语音输入"
                                        onClick={handleVoiceInput}
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                                    </button>
                                    <label className="search-composer-select" title="主对话模型">
                                        <span>模型</span>
                                        <select
                                            value={preferredModelId}
                                            onChange={(event) => onPreferredModelChange?.(event.target.value)}
                                        >
                                            {availableModels.map((model) => (
                                                <option key={model.id} value={model.id}>
                                                    {model.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <button
                                        className={`search-tool-chip ${webSearchEnabled ? 'active' : ''}`}
                                        type="button"
                                        onClick={() => onWebSearchChange?.(!webSearchEnabled)}
                                    >
                                        联网搜索
                                    </button>
                                    <button
                                        className={`search-tool-chip ${deepResearchEnabled ? 'active' : ''}`}
                                        type="button"
                                        onClick={() => onDeepResearchChange?.(!deepResearchEnabled)}
                                    >
                                        深度研究
                                    </button>
                                </div>

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
                        <span>当前模块：{activeCapabilityNames || '尚未接入校园能力'}</span>
                        <strong>可随时调整模型和接入模块</strong>
                    </div>
                </div>

                {visibleDashboardSections.includes('paths') && (
                    <section className="landing-section">
                        <div className="landing-section-head">
                            <div className="landing-section-copy">
                                <span className="landing-section-kicker">常用场景</span>
                                <h2>从这里开始会更方便</h2>
                            </div>
                            <p className="landing-section-meta">适合第一次进入时直接开始，不需要先自己找入口。</p>
                        </div>

                        <div className="landing-path-grid">
                            {goldenPaths.map((path) => (
                                <article key={path.id} className="landing-path-card glass">
                                    <div className="landing-path-top">
                                        <span className="landing-path-kicker">{path.eyebrow}</span>
                                        <span className="landing-path-source">{capabilityById[path.id]?.name}</span>
                                    </div>
                                    <h3>{path.title}</h3>
                                    <p>{path.desc}</p>
                                    <div className="landing-path-steps">
                                        {path.steps.map((step) => (
                                            <span key={step} className="landing-path-step">{step}</span>
                                        ))}
                                    </div>
                                    <div className="landing-path-actions">
                                        <Link href={path.href} className="landing-inline-link">
                                            进入模块
                                        </Link>
                                        <button
                                            type="button"
                                            className="landing-primary-action"
                                            onClick={() => handlePathStart(path)}
                                        >
                                            直接开始
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                )}

                {visibleDashboardSections.includes('modules') && (
                    <section className="landing-section">
                        <div className="landing-section-head">
                            <div className="landing-section-copy">
                                <span className="landing-section-kicker">模块入口</span>
                                <h2>常用模块</h2>
                            </div>
                            <p className="landing-section-meta">按你的岗位和使用习惯，选择首页默认显示的模块。</p>
                        </div>

                        <div className="landing-module-grid">
                            {capabilities.map((capability) => {
                                const active = selectedCapabilityIds.includes(capability.id);

                                return (
                                    <article key={capability.id} className={`landing-module-card glass ${active ? 'active' : ''}`}>
                                        <div className="landing-module-head">
                                            <span className="landing-module-icon">{capabilityIcons[capability.id]}</span>
                                            <div className="landing-module-copy">
                                                <strong>{capability.name}</strong>
                                                <span>{capability.source}</span>
                                            </div>
                                            <span className={`landing-module-status ${active ? 'active' : ''}`}>
                                                {active ? '默认接入' : '可加入'}
                                            </span>
                                        </div>
                                        <p className="landing-module-summary">{capability.summary}</p>
                                        <div className="landing-module-actions">
                                            <Link href={capability.href} className="landing-inline-link">
                                                进入模块
                                            </Link>
                                            {active ? (
                                                <span className="landing-module-state-text">已加入当前工作面</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="landing-module-join"
                                                    onClick={() => onToggleCapability?.(capability.id)}
                                                >
                                                    加入默认工作面
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                )}

                {visibleDashboardSections.includes('continuity') && (
                    <section className="landing-section landing-continuity-section">
                        <div className="landing-section-head">
                            <div className="landing-section-copy">
                                <span className="landing-section-kicker">使用提示</span>
                                <h2>在不同页面继续使用萤火虫</h2>
                            </div>
                            <p className="landing-section-meta">如果你需要，萤火虫会保留当前上下文，方便继续提问和整理。</p>
                        </div>

                        <div className="landing-continuity-grid glass-strong">
                            {continuityPoints.map((item, index) => (
                                <div key={item.id} className="landing-continuity-card">
                                    <span className="landing-continuity-index">0{index + 1}</span>
                                    <h3>{item.title}</h3>
                                    <p>{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {visibleDashboardSections.includes('templates') && (
                    <section className="landing-section">
                        <div className="landing-section-head">
                            <div className="landing-section-copy">
                                <span className="landing-section-kicker">快捷模板</span>
                                <h2>常用发起方式</h2>
                            </div>
                            <p className="landing-section-meta">如果你暂时不知道怎么提问，可以从这些方式开始。</p>
                        </div>

                        <div className="landing-template-grid">
                            {workflowActions.map((action, index) => (
                                <button
                                    key={`wf-${action.id}`}
                                    type="button"
                                    className="func-capsule primary glass"
                                    onClick={() => handleSend(action.action)}
                                    style={{ animationDelay: `${0.16 + index * 0.04}s` }}
                                >
                                    <span className="fc-icon">{action.icon}</span>
                                    <span className="fc-label">
                                        <strong>{action.title}</strong>
                                        {action.desc}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}
            </div>

            {(showAgentMenu || showLayoutMenu) && (
                <div
                    className="agent-menu-overlay"
                    onClick={closeMenus}
                />
            )}
        </div>
    );
}
