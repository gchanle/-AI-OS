'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    buildCliDefinitions,
    buildCliDraft,
    buildCliSummary,
    buildCliViews,
    buildDefaultCliDefinitionState,
    buildDefaultCliRuntime,
    cliAuthModeMap,
    cliExecutionModeMap,
    cliRunnerMap,
    cliStatusMap,
    getCliById,
    loadCliDefinitionState,
    loadCliRuntime,
    saveCliDefinitionState,
    saveCliRuntime,
} from '@/data/cli';
import './CliCenter.css';

const cliTabs = [
    { id: 'config', label: '执行配置' },
    { id: 'auth', label: '授权路径' },
    { id: 'health', label: '巡检状态' },
    { id: 'governance', label: '治理说明' },
];

const sortOptions = [
    { id: 'name', label: '按名称' },
    { id: 'status', label: '按状态' },
    { id: 'runner', label: '按执行形态' },
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
    const target = item || buildCliDraft();
    return {
        id: target.id,
        name: target.name || '',
        summary: target.summary || '',
        provider: target.provider || '',
        owner: target.owner || '',
        status: target.status || 'design',
        capabilityId: target.capabilityId || 'services',
        runnerType: target.runnerType || 'desktop_agent',
        executionMode: target.executionMode || 'user_session',
        command: target.command || '',
        workingDirectory: target.workingDirectory || '',
        packageRef: target.packageRef || '',
        installGuide: target.installGuide || '',
        authModesText: Array.isArray(target.authModes) ? target.authModes.join('、') : '',
        supportedOsText: Array.isArray(target.supportedOs) ? target.supportedOs.join('、') : '',
        expectedInputsText: Array.isArray(target.expectedInputs) ? target.expectedInputs.join('、') : '',
        expectedOutputsText: Array.isArray(target.expectedOutputs) ? target.expectedOutputs.join('、') : '',
        risksText: Array.isArray(target.risks) ? target.risks.join('\n') : '',
        governanceNote: target.governanceNote || '',
    };
}

export default function CliCenter({ initialCliId = null, initialCliPackages = [] }) {
    const [definitionState, setDefinitionState] = useState(() => buildDefaultCliDefinitionState());
    const [runtime, setRuntime] = useState({});
    const [cliPackages, setCliPackages] = useState(initialCliPackages);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [selectedCliId, setSelectedCliId] = useState(initialCliId || 'cli-browser-bridge');
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
        () => buildCliDefinitions(definitionState),
        [definitionState]
    );
    const clis = useMemo(
        () => buildCliViews(definitions, runtime, cliPackages),
        [cliPackages, definitions, runtime]
    );
    const summary = useMemo(() => buildCliSummary(clis), [clis]);

    const visibleClis = useMemo(() => {
        const keyword = searchValue.trim().toLowerCase();
        const filtered = clis.filter((item) => {
            const statusMatched = statusFilter === 'all' ? true : item.status === statusFilter;
            const searchMatched = keyword.length === 0
                ? true
                : [
                    item.name,
                    item.summary,
                    item.provider,
                    item.owner,
                    item.command,
                    item.packageRef,
                    item.runnerMeta,
                    ...item.expectedInputs,
                ].join(' ').toLowerCase().includes(keyword);

            return statusMatched && searchMatched;
        });

        return filtered.sort((left, right) => {
            if (sortBy === 'status') {
                return compareValues(left.statusMeta.label, right.statusMeta.label, sortDirection);
            }
            if (sortBy === 'runner') {
                return compareValues(left.runnerMeta, right.runnerMeta, sortDirection);
            }
            if (sortBy === 'validation') {
                return compareValues(left.validationMeta.label, right.validationMeta.label, sortDirection);
            }
            if (sortBy === 'updated') {
                return compareValues(new Date(left.lastCheckedAt || 0).getTime(), new Date(right.lastCheckedAt || 0).getTime(), sortDirection);
            }
            return compareValues(left.name, right.name, sortDirection);
        });
    }, [clis, searchValue, sortBy, sortDirection, statusFilter]);

    const selectedCli = useMemo(
        () => clis.find((item) => item.id === selectedCliId) || visibleClis[0] || clis[0] || null,
        [clis, selectedCliId, visibleClis]
    );

    const refreshCliPackages = async () => {
        const response = await fetch('/api/cli/packages', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.error || 'Failed to load CLI packages');
        }

        const packages = Array.isArray(payload.packages) ? payload.packages : [];
        setCliPackages(packages);
        return packages;
    };

    useEffect(() => {
        const nextDefinitions = loadCliDefinitionState();
        const mergedDefinitions = buildCliDefinitions(nextDefinitions);
        setDefinitionState(nextDefinitions);
        setRuntime(loadCliRuntime(mergedDefinitions));
        setCliPackages(initialCliPackages);
        refreshCliPackages().catch(() => {
            setCliPackages(initialCliPackages);
        });
        setHasHydrated(true);
    }, [initialCliPackages]);

    useEffect(() => {
        if (!hasHydrated) {
            return;
        }

        saveCliDefinitionState(definitionState);
    }, [definitionState, hasHydrated]);

    useEffect(() => {
        if (!hasHydrated) {
            return;
        }

        saveCliRuntime(runtime);
    }, [hasHydrated, runtime]);

    useEffect(() => {
        if (!selectedCli && visibleClis.length > 0) {
            setSelectedCliId(visibleClis[0].id);
        }
    }, [selectedCli, visibleClis]);

    useEffect(() => {
        if (!toast) {
            return undefined;
        }

        const timer = window.setTimeout(() => setToast(null), 2600);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const patchCli = (cliId, patch) => {
        const target = getCliById(cliId, definitions, runtime, cliPackages);
        if (!target) {
            return;
        }

        if (target.isCustom) {
            setDefinitionState((prev) => ({
                ...prev,
                custom: prev.custom.map((item) => (
                    item.id === cliId ? { ...item, ...patch } : item
                )),
            }));
            return;
        }

        setDefinitionState((prev) => ({
            ...prev,
            patches: {
                ...prev.patches,
                [cliId]: {
                    ...(prev.patches[cliId] || {}),
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
        const draft = buildCliDraft();
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
        const nextCli = {
            id: drawerForm.id,
            name: drawerForm.name || '未命名 CLI',
            summary: drawerForm.summary,
            provider: drawerForm.provider,
            owner: drawerForm.owner,
            status: drawerForm.status,
            capabilityId: drawerForm.capabilityId,
            runnerType: drawerForm.runnerType,
            executionMode: drawerForm.executionMode,
            command: drawerForm.command,
            workingDirectory: drawerForm.workingDirectory,
            packageRef: drawerForm.packageRef,
            installGuide: drawerForm.installGuide,
            authModes: drawerForm.authModesText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean),
            supportedOs: drawerForm.supportedOsText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean),
            expectedInputs: drawerForm.expectedInputsText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean),
            expectedOutputs: drawerForm.expectedOutputsText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean),
            risks: drawerForm.risksText.split(/\n+/).map((item) => item.trim()).filter(Boolean),
            governanceNote: drawerForm.governanceNote,
            isCustom: drawerState.mode === 'create' ? true : Boolean(clis.find((item) => item.id === drawerForm.id)?.isCustom),
        };

        setIsSavingPackage(true);
        try {
            const response = await fetch('/api/cli/packages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(nextCli),
            });
            const payload = await response.json();
            if (!response.ok || !payload?.ok || !payload?.package) {
                throw new Error(payload?.error || 'Failed to persist CLI package');
            }

            const savedCli = {
                ...nextCli,
                id: payload.package.id,
            };

            if (drawerState.mode === 'create') {
                setDefinitionState((prev) => ({
                    ...prev,
                    custom: [...prev.custom, savedCli],
                }));
                setRuntime((prev) => ({
                    ...prev,
                    ...buildDefaultCliRuntime([savedCli]),
                }));
            } else {
                patchCli(savedCli.id, savedCli);
            }

            setSelectedCliId(savedCli.id);
            await refreshCliPackages();
            setToast({
                tone: payload.package.validation?.state === 'valid' ? 'success' : 'info',
                title: drawerState.mode === 'create' ? 'CLI 已创建并生成制品' : 'CLI 已更新并重建制品',
                body: `当前制品状态：${payload.package.validation?.label || '待检查'}。`,
            });
            closeDrawer();
        } catch (error) {
            setToast({
                tone: 'warning',
                title: '保存失败',
                body: error instanceof Error ? error.message : 'CLI package 生成失败。',
            });
        } finally {
            setIsSavingPackage(false);
        }
    };

    const handleRunProbe = (item) => {
        const nextInstalled = item.validation.state !== 'invalid' && item.status !== 'design';
        const nextExitCode = item.validation.state === 'invalid' ? 2 : item.status === 'design' ? 1 : 0;
        setRuntime((prev) => ({
            ...prev,
            [item.id]: {
                ...(prev[item.id] || {}),
                installed: nextInstalled,
                lastCheckedAt: new Date().toISOString(),
                lastRunAt: nextInstalled ? new Date().toISOString() : null,
                versionDetected: item.packageRef ? item.packageRef.split('@')[1] || '未记录' : '未发现',
                lastExitCode: nextExitCode,
                lastError: item.validation.state === 'invalid'
                    ? item.validation.errors[0] || '规范未通过，无法完成运行探针。'
                    : item.status === 'design'
                        ? '当前仍为待设计状态，尚未具备可执行安装包。'
                        : null,
            },
        }));

        setToast({
            tone: nextExitCode === 0 ? 'success' : 'info',
            title: '运行探针已完成',
            body: nextExitCode === 0 ? '安装与命令探针通过，可以继续做更细的联调。' : '当前状态已刷新，请根据阻塞项继续完善安装和执行边界。',
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
            body: nextValue ? '该 CLI 已进入可调度范围。' : '该 CLI 将不再被上层能力调用。',
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
            title: '默认授权路径已更新',
            body: '后续执行会优先按这条授权路径进行。',
        });
    };

    return (
        <div className="cli-page">
            <div className="cli-shell">
                <header className="cli-hero glass-strong">
                    <div className="cli-hero-copy">
                        <span className="cli-kicker">CLI Registry</span>
                        <h1>把 CLI 从占位方案做成可治理的执行对象</h1>
                        <p>这里管理的不是“看起来像命令”的介绍卡片，而是客户侧、本地终端和运维环境里的真实执行单元。至少要明确它由谁部署、以什么形态运行、如何授权、能收什么输入、吐什么输出，以及当前探针是否真的通过。</p>
                    </div>
                    <div className="cli-hero-actions">
                        <Link href="/connectors" className="cli-inline-link">能力接入中心</Link>
                        <button type="button" className="cli-primary-btn" onClick={openDrawerForCreate}>新建 CLI</button>
                    </div>
                </header>

                <section className="cli-metrics">
                    <div className="cli-metric glass">
                        <span>CLI 总数</span>
                        <strong>{summary.total}</strong>
                    </div>
                    <div className="cli-metric glass">
                        <span>可接入</span>
                        <strong>{summary.ready}</strong>
                    </div>
                    <div className="cli-metric glass attention">
                        <span>试点中</span>
                        <strong>{summary.pilot}</strong>
                    </div>
                    <div className="cli-metric glass">
                        <span>规范通过</span>
                        <strong>{summary.validated}</strong>
                    </div>
                    <div className="cli-metric glass">
                        <span>已生成制品</span>
                        <strong>{summary.packaged}</strong>
                    </div>
                    <div className="cli-metric glass">
                        <span>已安装</span>
                        <strong>{summary.installed}</strong>
                    </div>
                    <div className="cli-metric glass attention">
                        <span>需关注</span>
                        <strong>{summary.attention}</strong>
                    </div>
                </section>

                <section className="cli-table-shell glass">
                    <div className="cli-toolbar">
                        <div className="cli-toolbar-left">
                            <input
                                className="cli-search"
                                type="text"
                                placeholder="搜索 CLI、provider、命令或输入输出"
                                value={searchValue}
                                onChange={(event) => setSearchValue(event.target.value)}
                            />
                            <div className="cli-filter-row">
                                <button type="button" className={`cli-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>全部状态</button>
                                {Object.values(cliStatusMap).map((item) => (
                                    <button key={item.id} type="button" className={`cli-chip ${statusFilter === item.id ? 'active' : ''}`} onClick={() => setStatusFilter(item.id)}>
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="cli-toolbar-right">
                            <label className="cli-sort-select">
                                <span>排序</span>
                                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                                    {sortOptions.map((option) => (
                                        <option key={option.id} value={option.id}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <button type="button" className="cli-secondary-btn" onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}>
                                {sortDirection === 'asc' ? '升序' : '降序'}
                            </button>
                        </div>
                    </div>

                    <div className="cli-table-wrap">
                        <table className="cli-table">
                            <thead>
                                <tr>
                                    <th>CLI</th>
                                    <th>能力归属</th>
                                    <th>执行形态</th>
                                    <th>制品</th>
                                    <th>规范校验</th>
                                    <th>默认授权</th>
                                    <th>最近巡检</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleClis.map((item) => (
                                    <tr
                                        key={item.id}
                                        className={selectedCliId === item.id ? 'active' : ''}
                                        onClick={() => {
                                            setSelectedCliId(item.id);
                                            setActiveTab('config');
                                        }}
                                    >
                                        <td>
                                            <div className="cli-cell-main">
                                                <strong>{item.name}</strong>
                                                <span>{item.command}</span>
                                            </div>
                                        </td>
                                        <td>{item.capabilityId}</td>
                                        <td>{item.runnerMeta}</td>
                                        <td><span className={`cli-status-pill ${item.artifactValidationMeta.tone}`}>{item.artifactValidationMeta.label}</span></td>
                                        <td><span className={`cli-status-pill ${item.validationMeta.tone}`}>{item.validationMeta.label}</span></td>
                                        <td>{cliAuthModeMap[item.authMode] || item.authMode || '未配置'}</td>
                                        <td>{formatDateTime(item.lastCheckedAt)}</td>
                                        <td onClick={(event) => event.stopPropagation()}>
                                            <div className="cli-row-actions">
                                                <button type="button" className="cli-inline-link" onClick={() => openDrawerForEdit(item)}>编辑</button>
                                                <button type="button" className="cli-secondary-btn" onClick={() => handleRunProbe(item)}>探针</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {selectedCli && (
                    <section className="cli-detail-layout">
                        <div className="cli-detail-main">
                            <div className="cli-detail-head glass-strong">
                                <div className="cli-detail-copy">
                                    <div className="cli-detail-topline">
                                        <span className={`cli-status-pill ${selectedCli.statusMeta.tone}`}>{selectedCli.statusMeta.label}</span>
                                        <span className={`cli-status-pill ${selectedCli.validationMeta.tone}`}>{selectedCli.validationMeta.label}</span>
                                        <span className={`cli-status-pill ${selectedCli.artifactValidationMeta.tone}`}>{selectedCli.artifactValidationMeta.label}</span>
                                    </div>
                                    <h2>{selectedCli.name}</h2>
                                    <p>{selectedCli.summary}</p>
                                </div>
                                <div className="cli-detail-actions">
                                    <button type="button" className="cli-primary-btn" onClick={() => handleRunProbe(selectedCli)}>运行探针</button>
                                    <button type="button" className="cli-secondary-btn" onClick={() => handleAuthorize(selectedCli, !selectedCli.authorized)}>
                                        {selectedCli.authorized ? '回收授权' : '允许接入'}
                                    </button>
                                </div>
                            </div>

                            <div className="cli-tab-row">
                                {cliTabs.map((tab) => (
                                    <button key={tab.id} type="button" className={`cli-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {activeTab === 'config' && (
                                <div className="cli-panel-grid">
                                    <article className="cli-panel glass">
                                        <span className="cli-section-kicker">执行配置</span>
                                        <h3>命令与运行上下文</h3>
                                        <div className="cli-overview-grid">
                                            <div className="cli-overview-item">
                                                <span>Command</span>
                                                <strong>{selectedCli.command || '未填写'}</strong>
                                            </div>
                                            <div className="cli-overview-item">
                                                <span>Package</span>
                                                <strong>{selectedCli.packageRef || '未填写'}</strong>
                                            </div>
                                            <div className="cli-overview-item">
                                                <span>执行形态</span>
                                                <strong>{selectedCli.runnerMeta}</strong>
                                            </div>
                                            <div className="cli-overview-item">
                                                <span>执行模式</span>
                                                <strong>{selectedCli.executionModeMeta}</strong>
                                            </div>
                                            <div className="cli-overview-item cli-overview-item-full">
                                                <span>Working Directory</span>
                                                <strong>{selectedCli.workingDirectory || '未填写'}</strong>
                                            </div>
                                            <div className="cli-overview-item cli-overview-item-full">
                                                <span>CLI.md</span>
                                                <strong>{selectedCli.artifactPath || '未生成'}</strong>
                                            </div>
                                        </div>
                                    </article>
                                    <article className="cli-panel glass">
                                        <span className="cli-section-kicker">输入输出</span>
                                        <h3>上层调用边界</h3>
                                        <div className="cli-token-section">
                                            <small>Expected Inputs</small>
                                            <div className="cli-token-list">
                                                {selectedCli.expectedInputs.map((item) => (
                                                    <span key={item} className="cli-token">{item}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="cli-token-section">
                                            <small>Expected Outputs</small>
                                            <div className="cli-token-list">
                                                {selectedCli.expectedOutputs.map((item) => (
                                                    <span key={item} className="cli-token subtle">{item}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </article>
                                </div>
                            )}

                            {activeTab === 'auth' && (
                                <div className="cli-panel-grid">
                                    <article className="cli-panel glass">
                                        <span className="cli-section-kicker">授权路径</span>
                                        <h3>默认执行授权</h3>
                                        <div className="cli-auth-list">
                                            {selectedCli.authModes.map((mode) => (
                                                <label key={mode} className={`cli-auth-card ${selectedCli.authMode === mode ? 'active' : ''}`}>
                                                    <input type="radio" name={`cli-auth-${selectedCli.id}`} checked={selectedCli.authMode === mode} onChange={() => handleSetAuthMode(selectedCli, mode)} />
                                                    <div>
                                                        <strong>{cliAuthModeMap[mode] || mode}</strong>
                                                        <p>平台调度该 CLI 时，会优先走这条授权路径。</p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </article>
                                    <article className="cli-panel glass">
                                        <span className="cli-section-kicker">运行环境</span>
                                        <h3>支持平台</h3>
                                        <div className="cli-token-list">
                                            {selectedCli.supportedOs.map((item) => (
                                                <span key={item} className="cli-token">{item}</span>
                                            ))}
                                        </div>
                                        <p>{selectedCli.installGuide || '尚未填写安装说明。'}</p>
                                    </article>
                                </div>
                            )}

                            {activeTab === 'health' && (
                                <div className="cli-panel-grid">
                                    <article className="cli-panel glass">
                                        <span className="cli-section-kicker">巡检状态</span>
                                        <h3>安装与运行探针</h3>
                                        <div className="cli-overview-grid">
                                            <div className="cli-overview-item">
                                                <span>最近巡检</span>
                                                <strong>{formatDateTime(selectedCli.lastCheckedAt)}</strong>
                                            </div>
                                            <div className="cli-overview-item">
                                                <span>最近运行</span>
                                                <strong>{formatDateTime(selectedCli.lastRunAt)}</strong>
                                            </div>
                                            <div className="cli-overview-item">
                                                <span>安装状态</span>
                                                <strong>{selectedCli.installed ? '已安装' : '未安装'}</strong>
                                            </div>
                                            <div className="cli-overview-item">
                                                <span>Exit Code</span>
                                                <strong>{typeof selectedCli.lastExitCode === 'number' ? selectedCli.lastExitCode : '未记录'}</strong>
                                            </div>
                                            <div className="cli-overview-item cli-overview-item-full">
                                                <span>Version</span>
                                                <strong>{selectedCli.versionDetected || '未记录'}</strong>
                                            </div>
                                        </div>
                                        {selectedCli.lastError && (
                                            <div className="cli-error-card">
                                                <strong>最近错误</strong>
                                                <p>{selectedCli.lastError}</p>
                                            </div>
                                        )}
                                    </article>
                                    <article className="cli-panel glass">
                                        <span className="cli-section-kicker">规范与制品</span>
                                        <h3>当前阻塞项</h3>
                                        <strong>执行定义</strong>
                                        {selectedCli.validation.errors.length > 0 ? (
                                            <ul className="cli-validation-list error">
                                                {selectedCli.validation.errors.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p>当前没有阻塞性错误。</p>
                                        )}
                                        {selectedCli.validation.warnings.length > 0 && (
                                            <ul className="cli-validation-list warning">
                                                {selectedCli.validation.warnings.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        )}
                                        <strong>CLI.md 制品</strong>
                                        {selectedCli.artifactValidation?.errors?.length > 0 ? (
                                            <ul className="cli-validation-list error">
                                                {selectedCli.artifactValidation.errors.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p>当前没有制品阻塞项。</p>
                                        )}
                                        {selectedCli.artifactValidation?.warnings?.length > 0 && (
                                            <ul className="cli-validation-list warning">
                                                {selectedCli.artifactValidation.warnings.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </article>
                                </div>
                            )}

                            {activeTab === 'governance' && (
                                <div className="cli-panel-grid">
                                    <article className="cli-panel glass">
                                        <span className="cli-section-kicker">治理说明</span>
                                        <h3>上线边界</h3>
                                        <p>{selectedCli.governanceNote}</p>
                                        <ul className="cli-validation-list warning">
                                            {selectedCli.risks.map((item) => (
                                                <li key={item}>{item}</li>
                                            ))}
                                        </ul>
                                    </article>
                                    <article className="cli-panel glass">
                                        <span className="cli-section-kicker">下一步</span>
                                        <h3>从台账进入真实交付</h3>
                                        <div className="cli-overview-item cli-overview-item-full">
                                            <span>制品路径</span>
                                            <strong>{selectedCli.artifactPath || '未生成 CLI.md'}</strong>
                                        </div>
                                        <div className="cli-overview-item">
                                            <span>制品版本</span>
                                            <strong>{selectedCli.artifactVersion}</strong>
                                        </div>
                                        <div className="cli-overview-item">
                                            <span>找到章节</span>
                                            <strong>{selectedCli.artifactSections.length}</strong>
                                        </div>
                                        <ul className="cli-validation-list">
                                            <li>先明确可执行命令、版本、工作目录、授权路径和 CLI.md。</li>
                                            <li>再跑安装探针，确认运行环境和命令入口真实存在。</li>
                                            <li>最后才允许萤火虫或上层流程接入与调用。</li>
                                        </ul>
                                    </article>
                                </div>
                            )}
                        </div>

                        <aside className="cli-side-context">
                            <article className="cli-panel glass">
                                <span className="cli-section-kicker">快速入口</span>
                                <h3>继续去别处收口</h3>
                                <div className="cli-link-list">
                                    <Link href="/connectors" className="cli-inline-link">能力接入中心</Link>
                                    <Link href="/connectors/mcp" className="cli-inline-link">MCP 管理</Link>
                                    <Link href="/connectors/vault" className="cli-inline-link">凭证保险库</Link>
                                </div>
                            </article>
                            <article className="cli-panel glass">
                                <span className="cli-section-kicker">对象边界</span>
                                <h3>为什么它不是命令示意图</h3>
                                <ul className="cli-validation-list">
                                    <li>CLI 至少要有 command、runnerType、executionMode 和 authModes。</li>
                                    <li>没有安装探针、授权状态和 `CLI.md` 制品校验，就不能算真实执行对象。</li>
                                    <li>只有“可接入”或“试点中”的对象，才应该进入下一步联调。</li>
                                </ul>
                            </article>
                        </aside>
                    </section>
                )}
            </div>

            {drawerState.open && (
                <>
                    <button type="button" className="cli-drawer-backdrop" onClick={closeDrawer} aria-label="关闭抽屉" />
                    <aside className="cli-drawer glass-strong">
                        <div className="cli-drawer-head">
                            <div>
                                <span className="cli-section-kicker">{drawerState.mode === 'create' ? '新建 CLI' : '编辑 CLI'}</span>
                                <h3>{drawerState.mode === 'create' ? '新增执行对象' : '编辑 CLI 配置'}</h3>
                            </div>
                            <button type="button" className="cli-secondary-btn" onClick={closeDrawer}>关闭</button>
                        </div>
                        <div className="cli-drawer-body">
                            <div className="cli-form-grid">
                                <label className="cli-field">
                                    <span>名称</span>
                                    <input type="text" value={drawerForm.name} onChange={(event) => handleDrawerChange('name', event.target.value)} />
                                </label>
                                <label className="cli-field">
                                    <span>提供方</span>
                                    <input type="text" value={drawerForm.provider} onChange={(event) => handleDrawerChange('provider', event.target.value)} />
                                </label>
                                <label className="cli-field">
                                    <span>负责人</span>
                                    <input type="text" value={drawerForm.owner} onChange={(event) => handleDrawerChange('owner', event.target.value)} />
                                </label>
                                <label className="cli-field">
                                    <span>状态</span>
                                    <select value={drawerForm.status} onChange={(event) => handleDrawerChange('status', event.target.value)}>
                                        {Object.values(cliStatusMap).map((item) => (
                                            <option key={item.id} value={item.id}>{item.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="cli-field">
                                    <span>能力归属</span>
                                    <select value={drawerForm.capabilityId} onChange={(event) => handleDrawerChange('capabilityId', event.target.value)}>
                                        <option value="services">AI 办事</option>
                                        <option value="research">AI 科研</option>
                                        <option value="assistant">AI 助教</option>
                                        <option value="library">AI 图书馆</option>
                                        <option value="agents">AI 智能体</option>
                                    </select>
                                </label>
                                <label className="cli-field">
                                    <span>执行形态</span>
                                    <select value={drawerForm.runnerType} onChange={(event) => handleDrawerChange('runnerType', event.target.value)}>
                                        {Object.entries(cliRunnerMap).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="cli-field">
                                    <span>执行模式</span>
                                    <select value={drawerForm.executionMode} onChange={(event) => handleDrawerChange('executionMode', event.target.value)}>
                                        {Object.entries(cliExecutionModeMap).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="cli-field">
                                    <span>命令</span>
                                    <input type="text" value={drawerForm.command} onChange={(event) => handleDrawerChange('command', event.target.value)} />
                                </label>
                                <label className="cli-field cli-field-full">
                                    <span>摘要</span>
                                    <textarea value={drawerForm.summary} onChange={(event) => handleDrawerChange('summary', event.target.value)} />
                                </label>
                                <label className="cli-field">
                                    <span>工作目录</span>
                                    <input type="text" value={drawerForm.workingDirectory} onChange={(event) => handleDrawerChange('workingDirectory', event.target.value)} />
                                </label>
                                <label className="cli-field">
                                    <span>Package Ref</span>
                                    <input type="text" value={drawerForm.packageRef} onChange={(event) => handleDrawerChange('packageRef', event.target.value)} />
                                </label>
                                <label className="cli-field cli-field-full">
                                    <span>安装说明</span>
                                    <textarea value={drawerForm.installGuide} onChange={(event) => handleDrawerChange('installGuide', event.target.value)} />
                                </label>
                                <label className="cli-field">
                                    <span>授权方式</span>
                                    <input type="text" value={drawerForm.authModesText} onChange={(event) => handleDrawerChange('authModesText', event.target.value)} />
                                </label>
                                <label className="cli-field">
                                    <span>支持环境</span>
                                    <input type="text" value={drawerForm.supportedOsText} onChange={(event) => handleDrawerChange('supportedOsText', event.target.value)} />
                                </label>
                                <label className="cli-field">
                                    <span>输入声明</span>
                                    <input type="text" value={drawerForm.expectedInputsText} onChange={(event) => handleDrawerChange('expectedInputsText', event.target.value)} />
                                </label>
                                <label className="cli-field">
                                    <span>输出声明</span>
                                    <input type="text" value={drawerForm.expectedOutputsText} onChange={(event) => handleDrawerChange('expectedOutputsText', event.target.value)} />
                                </label>
                                <label className="cli-field cli-field-full">
                                    <span>风险说明</span>
                                    <textarea value={drawerForm.risksText} onChange={(event) => handleDrawerChange('risksText', event.target.value)} />
                                </label>
                                <label className="cli-field cli-field-full">
                                    <span>治理说明</span>
                                    <textarea value={drawerForm.governanceNote} onChange={(event) => handleDrawerChange('governanceNote', event.target.value)} />
                                </label>
                            </div>
                        </div>
                        <div className="cli-drawer-actions">
                            <button type="button" className="cli-secondary-btn" onClick={closeDrawer}>取消</button>
                            <button type="button" className="cli-primary-btn" onClick={handleSaveDrawer} disabled={isSavingPackage}>
                                {isSavingPackage ? '正在生成...' : '保存并生成 CLI.md'}
                            </button>
                        </div>
                    </aside>
                </>
            )}

            {toast && (
                <div className={`cli-toast ${toast.tone}`}>
                    <strong>{toast.title}</strong>
                    <span>{toast.body}</span>
                </div>
            )}
        </div>
    );
}
