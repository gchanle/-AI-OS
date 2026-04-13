'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    buildDefaultMcpDefinitionState,
    buildDefaultMcpRuntime,
    buildMcpDefinitions,
    buildMcpDraft,
    buildMcpSummary,
    buildMcpViews,
    getMcpById,
    mcpMarketStatusMap,
    loadMcpDefinitionState,
    loadMcpRuntime,
    mcpAuthModeMap,
    mcpStatusMap,
    mcpTransportMap,
    saveMcpDefinitionState,
    saveMcpRuntime,
    uid,
} from '@/data/mcp';
import './McpCenter.css';

const mcpTabs = [
    { id: 'config', label: '接入配置' },
    { id: 'auth', label: '认证方式' },
    { id: 'health', label: '健康检查' },
    { id: 'governance', label: '治理说明' },
];

const sortOptions = [
    { id: 'name', label: '按名称' },
    { id: 'status', label: '按状态' },
    { id: 'validation', label: '按规范校验' },
    { id: 'updated', label: '按最近巡检' },
];

function formatDateTime(value) {
    if (!value) {
        return '未记录';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function compareValues(left, right, direction = 'asc') {
    const dir = direction === 'asc' ? 1 : -1;
    if (left < right) return -1 * dir;
    if (left > right) return 1 * dir;
    return 0;
}

function buildDrawerFormState(item) {
    const target = item || buildMcpDraft();
    return {
        id: target.id,
        name: target.name || '',
        summary: target.summary || '',
        provider: target.provider || '',
        owner: target.owner || '',
        status: target.status || 'design',
        marketStatus: target.marketStatus || 'private',
        capabilityId: target.capabilityId || 'services',
        transport: target.transport || 'streamable_http',
        protocolVersion: target.protocolVersion || '2026-03-01',
        endpoint: target.endpoint || '',
        manifestPath: target.manifestPath || '/.well-known/mcp.json',
        authModesText: Array.isArray(target.authModes) ? target.authModes.join('、') : '',
        scope: target.scope || '',
        expectedToolsText: Array.isArray(target.expectedTools) ? target.expectedTools.join('、') : '',
        expectedResourcesText: Array.isArray(target.expectedResources) ? target.expectedResources.join('、') : '',
        risksText: Array.isArray(target.risks) ? target.risks.join('\n') : '',
        governanceNote: target.governanceNote || '',
    };
}

export default function McpCenter({ initialMcpId = null, initialMcpPackages = [] }) {
    const [definitionState, setDefinitionState] = useState(() => buildDefaultMcpDefinitionState());
    const [runtime, setRuntime] = useState({});
    const [mcpPackages, setMcpPackages] = useState(initialMcpPackages);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [selectedMcpId, setSelectedMcpId] = useState(initialMcpId || 'mcp-library-search');
    const [activeTab, setActiveTab] = useState('config');
    const [searchValue, setSearchValue] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [drawerState, setDrawerState] = useState({ open: false, mode: 'create' });
    const [drawerForm, setDrawerForm] = useState(buildDrawerFormState(null));
    const [toast, setToast] = useState(null);
    const [isSavingPackage, setIsSavingPackage] = useState(false);

    const definitions = useMemo(
        () => buildMcpDefinitions(definitionState),
        [definitionState]
    );
    const mcps = useMemo(
        () => buildMcpViews(definitions, runtime, mcpPackages),
        [definitions, mcpPackages, runtime]
    );
    const summary = useMemo(() => buildMcpSummary(mcps), [mcps]);

    const visibleMcps = useMemo(() => {
        const keyword = searchValue.trim().toLowerCase();
        const filtered = mcps.filter((item) => {
            const statusMatched = statusFilter === 'all' ? true : item.status === statusFilter;
            const searchMatched = keyword.length === 0
                ? true
                : [
                    item.name,
                    item.summary,
                    item.provider,
                    item.owner,
                    item.endpoint,
                    item.scope,
                    ...item.expectedTools,
                ].join(' ').toLowerCase().includes(keyword);

            return statusMatched && searchMatched;
        });

        return filtered.sort((left, right) => {
            if (sortBy === 'status') {
                return compareValues(left.statusMeta.label, right.statusMeta.label, sortDirection);
            }
            if (sortBy === 'validation') {
                return compareValues(left.validationMeta.label, right.validationMeta.label, sortDirection);
            }
            if (sortBy === 'updated') {
                return compareValues(new Date(left.lastCheckedAt || 0).getTime(), new Date(right.lastCheckedAt || 0).getTime(), sortDirection);
            }
            return compareValues(left.name, right.name, sortDirection);
        });
    }, [mcps, searchValue, sortBy, sortDirection, statusFilter]);

    const selectedMcp = useMemo(
        () => mcps.find((item) => item.id === selectedMcpId) || visibleMcps[0] || mcps[0] || null,
        [mcps, selectedMcpId, visibleMcps]
    );

    const refreshMcpPackages = async () => {
        const response = await fetch('/api/mcp/packages', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.error || 'Failed to load MCP packages');
        }

        const packages = Array.isArray(payload.packages) ? payload.packages : [];
        setMcpPackages(packages);
        return packages;
    };

    useEffect(() => {
        const nextDefinitions = loadMcpDefinitionState();
        const mergedDefinitions = buildMcpDefinitions(nextDefinitions);
        setDefinitionState(nextDefinitions);
        setRuntime(loadMcpRuntime(mergedDefinitions));
        setMcpPackages(initialMcpPackages);
        refreshMcpPackages().catch(() => {
            setMcpPackages(initialMcpPackages);
        });
        setHasHydrated(true);
    }, [initialMcpPackages]);

    useEffect(() => {
        if (!hasHydrated) {
            return;
        }

        saveMcpDefinitionState(definitionState);
    }, [definitionState, hasHydrated]);

    useEffect(() => {
        if (!hasHydrated) {
            return;
        }

        saveMcpRuntime(runtime);
    }, [hasHydrated, runtime]);

    useEffect(() => {
        if (!selectedMcp && visibleMcps.length > 0) {
            setSelectedMcpId(visibleMcps[0].id);
        }
    }, [selectedMcp, visibleMcps]);

    useEffect(() => {
        if (!toast) {
            return undefined;
        }
        const timer = window.setTimeout(() => setToast(null), 2600);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const patchMcp = (mcpId, patch) => {
        const target = getMcpById(mcpId, definitions, runtime, mcpPackages);
        if (!target) {
            return;
        }

        if (target.isCustom) {
            setDefinitionState((prev) => ({
                ...prev,
                custom: prev.custom.map((item) => (
                    item.id === mcpId ? { ...item, ...patch } : item
                )),
            }));
            return;
        }

        setDefinitionState((prev) => ({
            ...prev,
            patches: {
                ...prev.patches,
                [mcpId]: {
                    ...(prev.patches[mcpId] || {}),
                    ...patch,
                },
            },
        }));
    };

    const handleDrawerChange = (field, value) => {
        setDrawerForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const openDrawerForCreate = () => {
        const draft = buildMcpDraft();
        setDrawerForm(buildDrawerFormState(draft));
        setDrawerState({ open: true, mode: 'create' });
    };

    const openDrawerForEdit = (item) => {
        setDrawerForm(buildDrawerFormState(item));
        setDrawerState({ open: true, mode: 'edit' });
    };

    const closeDrawer = () => {
        setDrawerState({ open: false, mode: 'create' });
    };

    const handleSaveDrawer = async () => {
        const nextMcp = {
            id: drawerForm.id,
            name: drawerForm.name || '未命名 MCP',
            summary: drawerForm.summary,
            provider: drawerForm.provider,
            owner: drawerForm.owner,
            status: drawerForm.status,
            marketStatus: drawerForm.marketStatus,
            capabilityId: drawerForm.capabilityId,
            transport: drawerForm.transport,
            protocolVersion: drawerForm.protocolVersion,
            endpoint: drawerForm.endpoint,
            manifestPath: drawerForm.manifestPath,
            authModes: drawerForm.authModesText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean),
            scope: drawerForm.scope,
            expectedTools: drawerForm.expectedToolsText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean),
            expectedResources: drawerForm.expectedResourcesText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean),
            risks: drawerForm.risksText.split(/\n+/).map((item) => item.trim()).filter(Boolean),
            governanceNote: drawerForm.governanceNote,
            isCustom: drawerState.mode === 'create' ? true : Boolean(mcps.find((item) => item.id === drawerForm.id)?.isCustom),
        };

        setIsSavingPackage(true);
        try {
            const response = await fetch('/api/mcp/packages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(nextMcp),
            });
            const payload = await response.json();
            if (!response.ok || !payload?.ok || !payload?.package) {
                throw new Error(payload?.error || 'Failed to persist MCP package');
            }

            const savedMcp = {
                ...nextMcp,
                id: payload.package.id,
            };

            if (drawerState.mode === 'create') {
                setDefinitionState((prev) => ({
                    ...prev,
                    custom: [...prev.custom, savedMcp],
                }));
                setRuntime((prev) => ({
                    ...prev,
                    ...buildDefaultMcpRuntime([savedMcp]),
                }));
            } else {
                patchMcp(savedMcp.id, savedMcp);
            }

            setSelectedMcpId(savedMcp.id);
            await refreshMcpPackages();
            setToast({
                tone: payload.package.validation?.state === 'valid' ? 'success' : 'info',
                title: drawerState.mode === 'create' ? 'MCP 已创建并生成制品' : 'MCP 已更新并重建制品',
                body: `当前制品状态：${payload.package.validation?.label || '待检查'}。`,
            });
            closeDrawer();
        } catch (error) {
            setToast({
                tone: 'warning',
                title: '保存失败',
                body: error instanceof Error ? error.message : 'MCP package 生成失败。',
            });
        } finally {
            setIsSavingPackage(false);
        }
    };

    const handleRunHealthCheck = (item) => {
        const nextHandshakeState = item.validation.state === 'invalid' ? 'failed' : item.status === 'ready' ? 'ok' : 'warning';
        setRuntime((prev) => ({
            ...prev,
            [item.id]: {
                ...(prev[item.id] || {}),
                lastCheckedAt: new Date().toISOString(),
                latencyMs: item.status === 'ready' ? 420 : item.status === 'pilot' ? 880 : null,
                handshakeState: nextHandshakeState,
                manifestState: item.endpoint ? 'ok' : 'missing',
                lastError: item.validation.state === 'invalid'
                    ? item.validation.errors[0] || '规范未通过，无法完成握手测试。'
                    : item.status === 'design'
                        ? '当前仍为待设计状态，尚未提供可用 endpoint。'
                        : null,
            },
        }));

        setToast({
            tone: nextHandshakeState === 'ok' ? 'success' : 'info',
            title: '健康检查已完成',
            body: nextHandshakeState === 'ok' ? '握手测试通过，可以进入更细的协议联调。' : '当前状态已刷新，请根据校验和错误信息继续修正。',
        });
    };

    const handleAuthorize = (item, nextValue) => {
        setRuntime((prev) => ({
            ...prev,
            [item.id]: {
                ...(prev[item.id] || {}),
                authorized: nextValue,
            },
        }));

        setToast({
            tone: 'success',
            title: nextValue ? '已允许接入' : '已回收授权',
            body: nextValue ? '该 MCP 已进入可调度范围。' : '该 MCP 将不再被上层能力调用。',
        });
    };

    const handleSetAuthMode = (item, authMode) => {
        setRuntime((prev) => ({
            ...prev,
            [item.id]: {
                ...(prev[item.id] || {}),
                authMode,
            },
        }));

        setToast({
            tone: 'success',
            title: '默认认证方式已更新',
            body: '后续联调会优先按这条认证路径进行。',
        });
    };

    return (
        <div className="mcp-page">
            <div className="mcp-shell">
                <header className="mcp-hero glass-strong">
                    <div className="mcp-hero-copy">
                        <span className="mcp-kicker">MCP Registry</span>
                        <h1>把 MCP 从方案说明做成真实接入对象</h1>
                        <p>这里管理的是标准协议型能力接入，不只是写一行 endpoint。我们至少要知道它支持什么 transport、怎么认证、预期暴露哪些 tools/resources，以及当前握手和 manifest 校验是否真的通过。</p>
                    </div>
                    <div className="mcp-hero-actions">
                        <Link href="/connectors" className="mcp-inline-link">能力接入中心</Link>
                        <button type="button" className="mcp-primary-btn" onClick={openDrawerForCreate}>新建 MCP</button>
                    </div>
                </header>

                <section className="mcp-metrics">
                    <div className="mcp-metric glass">
                        <span>MCP 总数</span>
                        <strong>{summary.total}</strong>
                    </div>
                    <div className="mcp-metric glass">
                        <span>可接入</span>
                        <strong>{summary.ready}</strong>
                    </div>
                    <div className="mcp-metric glass attention">
                        <span>试点中</span>
                        <strong>{summary.pilot}</strong>
                    </div>
                    <div className="mcp-metric glass">
                        <span>规范通过</span>
                        <strong>{summary.validated}</strong>
                    </div>
                    <div className="mcp-metric glass">
                        <span>市场上架</span>
                        <strong>{summary.listed}</strong>
                    </div>
                    <div className="mcp-metric glass">
                        <span>已生成制品</span>
                        <strong>{summary.packaged}</strong>
                    </div>
                    <div className="mcp-metric glass attention">
                        <span>需关注</span>
                        <strong>{summary.attention}</strong>
                    </div>
                </section>

                <section className="mcp-table-shell glass">
                    <div className="mcp-toolbar">
                        <div className="mcp-toolbar-left">
                            <input
                                className="mcp-search"
                                type="text"
                                placeholder="搜索 MCP、provider、endpoint 或 tool"
                                value={searchValue}
                                onChange={(event) => setSearchValue(event.target.value)}
                            />
                            <div className="mcp-filter-row">
                                <button type="button" className={`mcp-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>全部状态</button>
                                {Object.values(mcpStatusMap).map((item) => (
                                    <button key={item.id} type="button" className={`mcp-chip ${statusFilter === item.id ? 'active' : ''}`} onClick={() => setStatusFilter(item.id)}>
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mcp-toolbar-right">
                            <label className="mcp-sort-select">
                                <span>排序</span>
                                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                                    {sortOptions.map((option) => (
                                        <option key={option.id} value={option.id}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <button type="button" className="mcp-secondary-btn" onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}>
                                {sortDirection === 'asc' ? '升序' : '降序'}
                            </button>
                        </div>
                    </div>

                    <div className="mcp-table-wrap">
                        <table className="mcp-table">
                            <thead>
                                <tr>
                                    <th>MCP</th>
                                    <th>能力归属</th>
                                    <th>Transport</th>
                                    <th>制品</th>
                                    <th>规范校验</th>
                                    <th>认证方式</th>
                                    <th>最近巡检</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleMcps.map((item) => (
                                    <tr
                                        key={item.id}
                                        className={selectedMcpId === item.id ? 'active' : ''}
                                        onClick={() => {
                                            setSelectedMcpId(item.id);
                                            setActiveTab('config');
                                        }}
                                    >
                                        <td>
                                            <div className="mcp-cell-main">
                                                <strong>{item.name}</strong>
                                                <span>{item.provider}</span>
                                            </div>
                                        </td>
                                        <td>{item.capabilityId}</td>
                                        <td>{mcpTransportMap[item.transport] || item.transport}</td>
                                        <td><span className={`mcp-status-pill ${item.artifactValidationMeta.tone}`}>{item.artifactValidationMeta.label}</span></td>
                                        <td><span className={`mcp-status-pill ${item.validationMeta.tone}`}>{item.validationMeta.label}</span></td>
                                        <td>{mcpAuthModeMap[item.authMode] || item.authMode || '未配置'}</td>
                                        <td>{formatDateTime(item.lastCheckedAt)}</td>
                                        <td onClick={(event) => event.stopPropagation()}>
                                            <div className="mcp-row-actions">
                                                <button type="button" className="mcp-inline-link" onClick={() => openDrawerForEdit(item)}>编辑</button>
                                                <button type="button" className="mcp-secondary-btn" onClick={() => handleRunHealthCheck(item)}>巡检</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {selectedMcp && (
                    <section className="mcp-detail-layout">
                        <div className="mcp-detail-main">
                            <div className="mcp-detail-head glass-strong">
                                <div className="mcp-detail-copy">
                                    <div className="mcp-detail-topline">
                                        <span className={`mcp-status-pill ${selectedMcp.statusMeta.tone}`}>{selectedMcp.statusMeta.label}</span>
                                        <span className={`mcp-status-pill ${selectedMcp.validationMeta.tone}`}>{selectedMcp.validationMeta.label}</span>
                                        <span className={`mcp-status-pill ${selectedMcp.artifactValidationMeta.tone}`}>{selectedMcp.artifactValidationMeta.label}</span>
                                        <span className="mcp-status-pill draft">{selectedMcp.marketLabel}</span>
                                    </div>
                                    <h2>{selectedMcp.name}</h2>
                                    <p>{selectedMcp.summary}</p>
                                </div>
                                <div className="mcp-detail-actions">
                                    <button type="button" className="mcp-primary-btn" onClick={() => handleRunHealthCheck(selectedMcp)}>运行握手检查</button>
                                    <button type="button" className="mcp-secondary-btn" onClick={() => handleAuthorize(selectedMcp, !selectedMcp.authorized)}>
                                        {selectedMcp.authorized ? '回收授权' : '允许接入'}
                                    </button>
                                </div>
                            </div>

                            <div className="mcp-tab-row">
                                {mcpTabs.map((tab) => (
                                    <button key={tab.id} type="button" className={`mcp-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {activeTab === 'config' && (
                                <div className="mcp-panel-grid">
                                    <article className="mcp-panel glass">
                                        <span className="mcp-section-kicker">接入配置</span>
                                        <h3>协议与 endpoint</h3>
                                        <div className="mcp-overview-grid">
                                            <div className="mcp-overview-item">
                                                <span>Endpoint</span>
                                                <strong>{selectedMcp.endpoint || '未填写'}</strong>
                                            </div>
                                            <div className="mcp-overview-item">
                                                <span>Manifest</span>
                                                <strong>{selectedMcp.manifestPath}</strong>
                                            </div>
                                            <div className="mcp-overview-item">
                                                <span>Transport</span>
                                                <strong>{mcpTransportMap[selectedMcp.transport] || selectedMcp.transport}</strong>
                                            </div>
                                            <div className="mcp-overview-item">
                                                <span>协议版本</span>
                                                <strong>{selectedMcp.protocolVersion}</strong>
                                            </div>
                                            <div className="mcp-overview-item">
                                                <span>MCP.md</span>
                                                <strong>{selectedMcp.artifactPath || '未生成'}</strong>
                                            </div>
                                            <div className="mcp-overview-item">
                                                <span>制品版本</span>
                                                <strong>{selectedMcp.artifactVersion}</strong>
                                            </div>
                                        </div>
                                    </article>
                                    <article className="mcp-panel glass">
                                        <span className="mcp-section-kicker">暴露能力</span>
                                        <h3>Tools 与 Resources 预期</h3>
                                        <div className="mcp-token-list">
                                            {selectedMcp.expectedTools.map((item) => (
                                                <span key={item} className="mcp-token">{item}</span>
                                            ))}
                                        </div>
                                        <div className="mcp-token-list">
                                            {selectedMcp.expectedResources.map((item) => (
                                                <span key={item} className="mcp-token subtle">{item}</span>
                                            ))}
                                        </div>
                                    </article>
                                </div>
                            )}

                            {activeTab === 'auth' && (
                                <div className="mcp-panel-grid">
                                    <article className="mcp-panel glass">
                                        <span className="mcp-section-kicker">认证方式</span>
                                        <h3>默认联调路径</h3>
                                        <div className="mcp-auth-list">
                                            {selectedMcp.authModes.map((mode) => (
                                                <label key={mode} className={`mcp-auth-card ${selectedMcp.authMode === mode ? 'active' : ''}`}>
                                                    <input type="radio" name={`mcp-auth-${selectedMcp.id}`} checked={selectedMcp.authMode === mode} onChange={() => handleSetAuthMode(selectedMcp, mode)} />
                                                    <div>
                                                        <strong>{mcpAuthModeMap[mode] || mode}</strong>
                                                        <p>后续巡检、调试和平台调用会优先使用这条认证方式。</p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </article>
                                    <article className="mcp-panel glass">
                                        <span className="mcp-section-kicker">使用边界</span>
                                        <h3>适用范围</h3>
                                        <p>{selectedMcp.scope}</p>
                                    </article>
                                </div>
                            )}

                            {activeTab === 'health' && (
                                <div className="mcp-panel-grid">
                                    <article className="mcp-panel glass">
                                        <span className="mcp-section-kicker">健康状态</span>
                                        <h3>握手与 manifest 检查</h3>
                                        <div className="mcp-overview-grid">
                                            <div className="mcp-overview-item">
                                                <span>最近巡检</span>
                                                <strong>{formatDateTime(selectedMcp.lastCheckedAt)}</strong>
                                            </div>
                                            <div className="mcp-overview-item">
                                                <span>延迟</span>
                                                <strong>{selectedMcp.latencyMs ? `${selectedMcp.latencyMs} ms` : '未记录'}</strong>
                                            </div>
                                            <div className="mcp-overview-item">
                                                <span>握手状态</span>
                                                <strong>{selectedMcp.handshakeState}</strong>
                                            </div>
                                            <div className="mcp-overview-item">
                                                <span>Manifest 状态</span>
                                                <strong>{selectedMcp.manifestState}</strong>
                                            </div>
                                        </div>
                                        {selectedMcp.lastError && (
                                            <div className="mcp-error-card">
                                                <strong>最近错误</strong>
                                                <p>{selectedMcp.lastError}</p>
                                            </div>
                                        )}
                                    </article>
                                    <article className="mcp-panel glass">
                                        <span className="mcp-section-kicker">规范与制品</span>
                                        <h3>当前阻塞项</h3>
                                        <strong>接入定义</strong>
                                        {selectedMcp.validation.errors.length > 0 ? (
                                            <ul className="mcp-validation-list error">
                                                {selectedMcp.validation.errors.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p>当前没有阻塞性错误。</p>
                                        )}
                                        {selectedMcp.validation.warnings.length > 0 && (
                                            <ul className="mcp-validation-list warning">
                                                {selectedMcp.validation.warnings.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        )}
                                        <strong>MCP.md 制品</strong>
                                        {selectedMcp.artifactValidation?.errors?.length > 0 ? (
                                            <ul className="mcp-validation-list error">
                                                {selectedMcp.artifactValidation.errors.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p>当前没有制品阻塞项。</p>
                                        )}
                                        {selectedMcp.artifactValidation?.warnings?.length > 0 && (
                                            <ul className="mcp-validation-list warning">
                                                {selectedMcp.artifactValidation.warnings.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </article>
                                </div>
                            )}

                            {activeTab === 'governance' && (
                                <div className="mcp-panel-grid">
                                    <article className="mcp-panel glass">
                                        <span className="mcp-section-kicker">治理说明</span>
                                        <h3>上线边界</h3>
                                        <p>{selectedMcp.governanceNote}</p>
                                        <ul className="mcp-validation-list warning">
                                            {selectedMcp.risks.map((item) => (
                                                <li key={item}>{item}</li>
                                            ))}
                                        </ul>
                                    </article>
                                    <article className="mcp-panel glass">
                                        <span className="mcp-section-kicker">下一步</span>
                                        <h3>从台账进入联调</h3>
                                        <div className="mcp-overview-item">
                                            <span>制品路径</span>
                                            <strong>{selectedMcp.artifactPath || '未生成 MCP.md'}</strong>
                                        </div>
                                        <div className="mcp-overview-item">
                                            <span>找到章节</span>
                                            <strong>{selectedMcp.artifactSections.length}</strong>
                                        </div>
                                        <ul className="mcp-validation-list">
                                            <li>先完成 endpoint、manifest、authModes 和 MCP.md 校验。</li>
                                            <li>再跑握手检查，确认 transport、manifest 与协议握手可达。</li>
                                            <li>最后再决定是否允许被上层能力接入与调用。</li>
                                        </ul>
                                    </article>
                                </div>
                            )}
                        </div>

                        <aside className="mcp-side-context">
                            <article className="mcp-panel glass">
                                <span className="mcp-section-kicker">快速入口</span>
                                <h3>继续去别处收口</h3>
                                <div className="mcp-link-list">
                                    <Link href="/connectors" className="mcp-inline-link">能力接入中心</Link>
                                    <Link href="/connectors/catalog" className="mcp-inline-link">连接器台账</Link>
                                    <Link href="/connectors/vault" className="mcp-inline-link">凭证保险库</Link>
                                </div>
                            </article>
                            <article className="mcp-panel glass">
                                <span className="mcp-section-kicker">对象边界</span>
                                <h3>为什么它不是一张卡片</h3>
                                <ul className="mcp-validation-list">
                                    <li>MCP 至少要有 endpoint、transport、manifest 和 authModes。</li>
                                    <li>没有握手状态和 `MCP.md` 制品校验，就不能算真实接入对象。</li>
                                    <li>只有“可接入”或“试点中”的对象，才应该进入下一步联调。</li>
                                </ul>
                            </article>
                        </aside>
                    </section>
                )}
            </div>

            {drawerState.open && (
                <>
                    <button type="button" className="mcp-drawer-backdrop" onClick={closeDrawer} aria-label="关闭抽屉" />
                    <aside className="mcp-drawer glass-strong">
                        <div className="mcp-drawer-head">
                            <div>
                                <span className="mcp-section-kicker">{drawerState.mode === 'create' ? '新建 MCP' : '编辑 MCP'}</span>
                                <h3>{drawerState.mode === 'create' ? '新增协议接入对象' : '编辑 MCP 配置'}</h3>
                            </div>
                            <button type="button" className="mcp-secondary-btn" onClick={closeDrawer}>关闭</button>
                        </div>
                        <div className="mcp-drawer-body">
                            <div className="mcp-form-grid">
                                <label className="mcp-field">
                                    <span>名称</span>
                                    <input type="text" value={drawerForm.name} onChange={(event) => handleDrawerChange('name', event.target.value)} />
                                </label>
                                <label className="mcp-field">
                                    <span>提供方</span>
                                    <input type="text" value={drawerForm.provider} onChange={(event) => handleDrawerChange('provider', event.target.value)} />
                                </label>
                                <label className="mcp-field">
                                    <span>负责人</span>
                                    <input type="text" value={drawerForm.owner} onChange={(event) => handleDrawerChange('owner', event.target.value)} />
                                </label>
                                <label className="mcp-field">
                                    <span>状态</span>
                                    <select value={drawerForm.status} onChange={(event) => handleDrawerChange('status', event.target.value)}>
                                        {Object.values(mcpStatusMap).map((item) => (
                                            <option key={item.id} value={item.id}>{item.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="mcp-field">
                                    <span>市场状态</span>
                                    <select value={drawerForm.marketStatus} onChange={(event) => handleDrawerChange('marketStatus', event.target.value)}>
                                        {Object.entries(mcpMarketStatusMap).map(([id, label]) => (
                                            <option key={id} value={id}>{label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="mcp-field">
                                    <span>Transport</span>
                                    <select value={drawerForm.transport} onChange={(event) => handleDrawerChange('transport', event.target.value)}>
                                        {Object.entries(mcpTransportMap).map(([id, label]) => (
                                            <option key={id} value={id}>{label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="mcp-field">
                                    <span>协议版本</span>
                                    <input type="text" value={drawerForm.protocolVersion} onChange={(event) => handleDrawerChange('protocolVersion', event.target.value)} />
                                </label>
                                <label className="mcp-field full">
                                    <span>摘要说明</span>
                                    <textarea rows={2} value={drawerForm.summary} onChange={(event) => handleDrawerChange('summary', event.target.value)} />
                                </label>
                                <label className="mcp-field full">
                                    <span>Endpoint</span>
                                    <input type="text" value={drawerForm.endpoint} onChange={(event) => handleDrawerChange('endpoint', event.target.value)} />
                                </label>
                                <label className="mcp-field">
                                    <span>Manifest Path</span>
                                    <input type="text" value={drawerForm.manifestPath} onChange={(event) => handleDrawerChange('manifestPath', event.target.value)} />
                                </label>
                                <label className="mcp-field">
                                    <span>能力归属</span>
                                    <input type="text" value={drawerForm.capabilityId} onChange={(event) => handleDrawerChange('capabilityId', event.target.value)} />
                                </label>
                                <label className="mcp-field full">
                                    <span>认证方式</span>
                                    <textarea rows={2} value={drawerForm.authModesText} onChange={(event) => handleDrawerChange('authModesText', event.target.value)} placeholder="例如：sso_session、bearer_token" />
                                </label>
                                <label className="mcp-field full">
                                    <span>作用范围</span>
                                    <textarea rows={2} value={drawerForm.scope} onChange={(event) => handleDrawerChange('scope', event.target.value)} />
                                </label>
                                <label className="mcp-field full">
                                    <span>Expected Tools</span>
                                    <textarea rows={2} value={drawerForm.expectedToolsText} onChange={(event) => handleDrawerChange('expectedToolsText', event.target.value)} />
                                </label>
                                <label className="mcp-field full">
                                    <span>Expected Resources</span>
                                    <textarea rows={2} value={drawerForm.expectedResourcesText} onChange={(event) => handleDrawerChange('expectedResourcesText', event.target.value)} />
                                </label>
                                <label className="mcp-field full">
                                    <span>风险说明</span>
                                    <textarea rows={3} value={drawerForm.risksText} onChange={(event) => handleDrawerChange('risksText', event.target.value)} />
                                </label>
                                <label className="mcp-field full">
                                    <span>治理说明</span>
                                    <textarea rows={3} value={drawerForm.governanceNote} onChange={(event) => handleDrawerChange('governanceNote', event.target.value)} />
                                </label>
                            </div>
                        </div>
                        <div className="mcp-drawer-actions">
                            <button type="button" className="mcp-secondary-btn" onClick={closeDrawer}>取消</button>
                            <button type="button" className="mcp-primary-btn" onClick={handleSaveDrawer} disabled={isSavingPackage}>
                                {isSavingPackage ? '正在生成...' : '保存并生成 MCP.md'}
                            </button>
                        </div>
                    </aside>
                </>
            )}

            {toast && (
                <div className={`mcp-toast ${toast.tone || 'info'}`}>
                    <strong>{toast.title}</strong>
                    <span>{toast.body}</span>
                </div>
            )}
        </div>
    );
}
