'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    buildFireflyHandoffHref,
    publishCampusNotification,
} from '@/data/campusPlatform';
import {
    buildConnectorDefinitions,
    buildConnectorDraft,
    buildConnectorSummary,
    buildConnectorView,
    buildConnectorViews,
    buildDefaultConnectorDefinitionState,
    buildDefaultConnectorRuntime,
    buildDefaultVaultItems,
    capabilityLabelMap,
    canUseStorage,
    connectorCategoryMap,
    connectorStatusMap,
    connectorTypeMap,
    loadConnectorDefinitionState,
    loadConnectorRuntime,
    loadConnectorVault,
    saveConnectorDefinitionState,
    saveConnectorRuntime,
    saveConnectorVault,
    uid,
} from '@/data/connectors';
import {
    buildDefaultSkillDefinitionState,
    buildSkillDefinitions,
    getSkillsForConnector,
    loadSkillDefinitionState,
} from '@/data/skills';
import './ConnectorCenter.css';

const connectorTabs = [
    { id: 'config', label: '接入配置' },
    { id: 'authorization', label: '授权与范围' },
    { id: 'execution', label: '执行调试' },
    { id: 'audit', label: '审计日志' },
];

const scopeOptions = [
    { id: 'read', label: '只读' },
    { id: 'read-write', label: '读写' },
    { id: 'manual', label: '人工确认后执行' },
];

const sortOptions = [
    { id: 'name', label: '按名称' },
    { id: 'status', label: '按状态' },
    { id: 'owner', label: '按归属部门' },
    { id: 'updated', label: '按最近校验' },
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

function buildDrawerFormState(connector) {
    const target = connector || buildConnectorDraft();
    return {
        id: target.id,
        name: target.name || '',
        shortName: target.shortName || '',
        category: target.category || 'campus',
        sourceLabel: target.sourceLabel || '外部系统',
        summary: target.summary || '',
        owner: target.owner || '',
        openUrl: target.openUrl || '',
        accessPath: target.accessPath || '',
        preferredConnectorType: target.preferredConnectorType || 'browser',
        primaryCapabilityId: target.primaryCapabilityId || 'services',
        status: target.status || 'draft',
        connectionStrategy: target.connectionStrategy || '',
        permissionsText: Array.isArray(target.permissions) ? target.permissions.join('、') : '',
    };
}

function emitConnectorNotification(connector) {
    publishCampusNotification({
        id: uid('message'),
        sourceId: 'connectors',
        title: `${connector.name} ${connector.walkthrough.resultTitle}`,
        body: connector.walkthrough.resultSummary,
        detail: [
            `连接器：${connector.name}`,
            `执行任务：${connector.walkthrough.label}`,
            `用户问题：${connector.walkthrough.userQuery}`,
            `结果摘要：${connector.walkthrough.resultSummary}`,
            '建议回到萤火虫继续整理与解释结果。',
        ].join('\n'),
        href: buildFireflyHandoffHref(
            connector.walkthrough.fireflyPrompt,
            connector.primaryCapabilityId ? [connector.primaryCapabilityId] : []
        ),
        pathname: buildFireflyHandoffHref(
            connector.walkthrough.fireflyPrompt,
            connector.primaryCapabilityId ? [connector.primaryCapabilityId] : []
        ),
        actionLabel: '回到萤火虫',
        createdAt: new Date().toISOString(),
        read: false,
    });
}

function getEffectiveStatus(connector) {
    if (!connector.runtimeConfig?.enabled) {
        return 'paused';
    }

    return connector.status;
}

function compareValues(left, right, direction = 'asc') {
    const dir = direction === 'asc' ? 1 : -1;
    if (left < right) return -1 * dir;
    if (left > right) return 1 * dir;
    return 0;
}

export default function ConnectorCenter({ initialConnectorId = null }) {
    const [definitionState, setDefinitionState] = useState(() => buildDefaultConnectorDefinitionState());
    const [skillDefinitions, setSkillDefinitions] = useState(() => buildSkillDefinitions(buildDefaultSkillDefinitionState()));
    const [runtime, setRuntime] = useState({});
    const [vaultItems, setVaultItems] = useState([]);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [selectedConnectorId, setSelectedConnectorId] = useState(initialConnectorId || 'academic-affairs');
    const [activeTab, setActiveTab] = useState('config');
    const [statusFilter, setStatusFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [searchValue, setSearchValue] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [selectedIds, setSelectedIds] = useState([]);
    const [toast, setToast] = useState(null);
    const [simulation, setSimulation] = useState(null);
    const [drawerState, setDrawerState] = useState({ open: false, mode: 'create' });
    const [drawerForm, setDrawerForm] = useState(buildDrawerFormState(null));
    const [configForm, setConfigForm] = useState(null);
    const timersRef = useRef([]);

    const definitions = useMemo(
        () => buildConnectorDefinitions(definitionState),
        [definitionState]
    );
    const connectors = useMemo(
        () => buildConnectorViews(definitions, runtime, vaultItems),
        [definitions, runtime, vaultItems]
    );
    const connectorSummary = useMemo(() => buildConnectorSummary(connectors), [connectors]);

    const visibleConnectors = useMemo(() => {
        const filtered = connectors.filter((connector) => {
            const effectiveStatus = getEffectiveStatus(connector);
            const statusMatched = statusFilter === 'all' ? true : effectiveStatus === statusFilter;
            const categoryMatched = categoryFilter === 'all' ? true : connector.category === categoryFilter;
            const keyword = searchValue.trim().toLowerCase();
            const searchMatched = keyword.length === 0
                ? true
                : [
                    connector.name,
                    connector.shortName,
                    connector.summary,
                    connector.sourceLabel,
                    connector.owner,
                    connector.openUrl,
                    connector.runtimeConfig?.vaultRef,
                ].join(' ').toLowerCase().includes(keyword);

            return statusMatched && categoryMatched && searchMatched;
        });

        return filtered.sort((left, right) => {
            if (sortBy === 'status') {
                return compareValues(getEffectiveStatus(left), getEffectiveStatus(right), sortDirection);
            }
            if (sortBy === 'owner') {
                return compareValues(left.owner || '', right.owner || '', sortDirection);
            }
            if (sortBy === 'updated') {
                return compareValues(new Date(left.lastValidatedAt || 0).getTime(), new Date(right.lastValidatedAt || 0).getTime(), sortDirection);
            }
            return compareValues(left.name || '', right.name || '', sortDirection);
        });
    }, [categoryFilter, connectors, searchValue, sortBy, sortDirection, statusFilter]);

    const selectedConnector = useMemo(() => {
        return connectors.find((item) => item.id === selectedConnectorId) || visibleConnectors[0] || connectors[0] || null;
    }, [connectors, selectedConnectorId, visibleConnectors]);

    useEffect(() => {
        const definitionsFromStorage = loadConnectorDefinitionState();
        const mergedDefinitions = buildConnectorDefinitions(definitionsFromStorage);
        setDefinitionState(definitionsFromStorage);
        setSkillDefinitions(buildSkillDefinitions(loadSkillDefinitionState()));
        setRuntime(loadConnectorRuntime(mergedDefinitions));
        setVaultItems(loadConnectorVault(mergedDefinitions));
        setHasHydrated(true);
    }, []);

    useEffect(() => {
        if (!selectedConnector && visibleConnectors.length > 0) {
            setSelectedConnectorId(visibleConnectors[0].id);
        }
    }, [selectedConnector, visibleConnectors]);

    useEffect(() => {
        if (!selectedConnector) {
            return;
        }

        setConfigForm({
            openUrl: selectedConnector.runtimeConfig.openUrl,
            accessPath: selectedConnector.runtimeConfig.accessPath,
            owner: selectedConnector.runtimeConfig.owner,
            connectorType: selectedConnector.runtimeConfig.connectorType,
            primaryCapabilityId: selectedConnector.runtimeConfig.primaryCapabilityId,
            scope: selectedConnector.runtimeConfig.scope,
            requireConfirmation: selectedConnector.runtimeConfig.requireConfirmation,
            vaultRef: selectedConnector.runtimeConfig.vaultRef,
            syncWindow: selectedConnector.runtimeConfig.syncWindow,
            timeoutSec: selectedConnector.runtimeConfig.timeoutSec,
            enabled: selectedConnector.runtimeConfig.enabled,
        });
    }, [selectedConnector]);

    useEffect(() => () => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
    }, []);

    useEffect(() => {
        if (!toast) {
            return undefined;
        }

        const timer = window.setTimeout(() => setToast(null), 2600);
        return () => window.clearTimeout(timer);
    }, [toast]);

    useEffect(() => {
        if (!hasHydrated) {
            return;
        }

        saveConnectorDefinitionState(definitionState);
    }, [definitionState, hasHydrated]);

    useEffect(() => {
        if (!hasHydrated) {
            return;
        }

        saveConnectorRuntime(runtime);
    }, [hasHydrated, runtime]);

    useEffect(() => {
        if (!hasHydrated) {
            return;
        }

        saveConnectorVault(vaultItems);
    }, [hasHydrated, vaultItems]);

    const syncConnectorSupportData = (definition) => {
        setRuntime((prev) => {
            if (prev[definition.id]) {
                return prev;
            }

            return {
                ...prev,
                ...buildDefaultConnectorRuntime([definition]),
            };
        });

        setVaultItems((prev) => {
            const defaultVault = buildDefaultVaultItems([definition])[0];
            if (prev.some((item) => item.id === defaultVault.id)) {
                return prev;
            }
            return [defaultVault, ...prev];
        });
    };

    const openDrawerForCreate = () => {
        const draft = buildConnectorDraft();
        setDrawerForm(buildDrawerFormState(draft));
        setDrawerState({ open: true, mode: 'create' });
    };

    const openDrawerForEdit = (connector) => {
        setDrawerForm(buildDrawerFormState(connector));
        setDrawerState({ open: true, mode: 'edit' });
    };

    const closeDrawer = () => {
        setDrawerState({ open: false, mode: 'create' });
    };

    const handleDrawerChange = (field, value) => {
        setDrawerForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleConfigChange = (field, value) => {
        setConfigForm((prev) => ({
            ...(prev || {}),
            [field]: value,
        }));
    };

    const appendAuditTrail = (connectorId, entry) => {
        setRuntime((prev) => ({
            ...prev,
            [connectorId]: {
                ...(prev[connectorId] || {}),
                auditTrail: [entry, ...((prev[connectorId] || {}).auditTrail || [])].slice(0, 16),
                lastExecutedAt: entry.at,
                executionCount: ((prev[connectorId] || {}).executionCount || 0) + (entry.action === '连接健康检查' ? 0 : 1),
            },
        }));
    };

    const handleSaveDrawer = () => {
        const definition = {
            id: drawerForm.id,
            name: drawerForm.name || '未命名连接器',
            shortName: drawerForm.shortName || (drawerForm.name || '连接器').slice(0, 4),
            category: drawerForm.category,
            sourceLabel: drawerForm.sourceLabel,
            summary: drawerForm.summary,
            owner: drawerForm.owner,
            openUrl: drawerForm.openUrl,
            accessPath: drawerForm.accessPath,
            preferredConnectorType: drawerForm.preferredConnectorType,
            primaryCapabilityId: drawerForm.primaryCapabilityId,
            status: drawerForm.status,
            connectionStrategy: drawerForm.connectionStrategy || '优先复用统一认证；若无接口，则由页面连接器或客户侧代理兜底。',
            permissions: drawerForm.permissionsText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean),
            isCustom: drawerState.mode === 'create' ? true : Boolean(connectors.find((item) => item.id === drawerForm.id)?.isCustom),
        };

        if (drawerState.mode === 'create') {
            setDefinitionState((prev) => ({
                ...prev,
                custom: [...prev.custom, definition],
            }));
            syncConnectorSupportData(definition);
            setSelectedConnectorId(definition.id);
            setToast({
                tone: 'success',
                title: '连接器已创建',
                body: '新的连接器已经加入台账，你可以继续补授权方式和凭证。',
            });
        } else {
            const target = connectors.find((item) => item.id === definition.id);
            if (target?.isCustom) {
                setDefinitionState((prev) => ({
                    ...prev,
                    custom: prev.custom.map((item) => (item.id === definition.id ? { ...item, ...definition } : item)),
                }));
            } else {
                setDefinitionState((prev) => ({
                    ...prev,
                    patches: {
                        ...prev.patches,
                        [definition.id]: {
                            ...(prev.patches[definition.id] || {}),
                            ...definition,
                        },
                    },
                }));
            }
            setToast({
                tone: 'success',
                title: '连接器信息已更新',
                body: '台账字段已更新，后续接入和授权会沿用这份配置。',
            });
        }

        closeDrawer();
    };

    const handleSaveConfig = () => {
        if (!selectedConnector || !configForm) {
            return;
        }

        setRuntime((prev) => ({
            ...prev,
            [selectedConnector.id]: {
                ...(prev[selectedConnector.id] || {}),
                config: {
                    ...((prev[selectedConnector.id] || {}).config || {}),
                    ...configForm,
                },
                status: configForm.enabled ? (prev[selectedConnector.id]?.status || selectedConnector.status) : 'paused',
            },
        }));

        appendAuditTrail(selectedConnector.id, {
            id: uid('audit'),
            actor: '管理员',
            action: '更新接入配置',
            outcome: '成功',
            detail: `已更新 ${selectedConnector.name} 的入口参数、执行范围和凭证引用。`,
            at: new Date().toISOString(),
        });

        setToast({
            tone: 'success',
            title: '配置已保存',
            body: '接入配置已更新，连接器会按新的运行参数执行。',
        });
    };

    const handleSetPreferredAuth = (connectorId, authId) => {
        setRuntime((prev) => ({
            ...prev,
            [connectorId]: {
                ...(prev[connectorId] || {}),
                preferredAuthId: authId,
            },
        }));

        setToast({
            tone: 'success',
            title: '默认授权方式已更新',
            body: '后续萤火虫调用该系统时，会优先使用这条授权路径。',
        });
    };

    const handleAuthorize = (connector, nextAuthorized = true) => {
        setRuntime((prev) => ({
            ...prev,
            [connector.id]: {
                ...(prev[connector.id] || {}),
                authorized: nextAuthorized,
            },
        }));

        appendAuditTrail(connector.id, {
            id: uid('audit'),
            actor: '管理员',
            action: nextAuthorized ? '连接授权' : '回收授权',
            outcome: '成功',
            detail: nextAuthorized ? '已允许萤火虫调度该连接器。' : '已暂停该连接器的调度权限。',
            at: new Date().toISOString(),
        });

        setToast({
            tone: 'success',
            title: nextAuthorized ? `${connector.name} 已授权` : `${connector.name} 已暂停调度`,
            body: nextAuthorized ? '当前连接器已进入可调用状态。' : '当前连接器不会再被萤火虫自动调用。',
        });
    };

    const handleValidate = (connector) => {
        setRuntime((prev) => ({
            ...prev,
            [connector.id]: {
                ...(prev[connector.id] || {}),
                status: 'healthy',
                lastValidatedAt: new Date().toISOString(),
            },
        }));

        appendAuditTrail(connector.id, {
            id: uid('audit'),
            actor: '系统巡检',
            action: '连接健康检查',
            outcome: '成功',
            detail: '已完成登录态、入口可达性与关键字段抽取校验。',
            at: new Date().toISOString(),
        });

        setToast({
            tone: 'info',
            title: '连接校验已完成',
            body: `${connector.name} 当前被标记为“${connectorStatusMap.healthy.label}”。`,
        });
    };

    const handleBulkAction = (action) => {
        if (selectedIds.length === 0) {
            return;
        }

        if (action === 'enable') {
            setRuntime((prev) => Object.fromEntries(
                Object.entries(prev).map(([id, item]) => [
                    id,
                    selectedIds.includes(id)
                        ? {
                            ...item,
                            status: item.status === 'paused' ? 'healthy' : item.status,
                            config: {
                                ...(item.config || {}),
                                enabled: true,
                            },
                        }
                        : item,
                ])
            ));
            setToast({ tone: 'success', title: '批量启用完成', body: `已启用 ${selectedIds.length} 个连接器。` });
        }

        if (action === 'pause') {
            setRuntime((prev) => Object.fromEntries(
                Object.entries(prev).map(([id, item]) => [
                    id,
                    selectedIds.includes(id)
                        ? {
                            ...item,
                            status: 'paused',
                            config: {
                                ...(item.config || {}),
                                enabled: false,
                            },
                        }
                        : item,
                ])
            ));
            setToast({ tone: 'success', title: '批量暂停完成', body: `已暂停 ${selectedIds.length} 个连接器。` });
        }

        if (action === 'validate') {
            setRuntime((prev) => Object.fromEntries(
                Object.entries(prev).map(([id, item]) => [
                    id,
                    selectedIds.includes(id)
                        ? {
                            ...item,
                            status: 'healthy',
                            lastValidatedAt: new Date().toISOString(),
                        }
                        : item,
                ])
            ));
            setToast({ tone: 'info', title: '批量巡检已完成', body: `已刷新 ${selectedIds.length} 个连接器的健康状态。` });
        }
    };

    const toggleSelectedId = (connectorId) => {
        setSelectedIds((prev) => (
            prev.includes(connectorId)
                ? prev.filter((id) => id !== connectorId)
                : [...prev, connectorId]
        ));
    };

    const toggleSelectAllVisible = () => {
        setSelectedIds((prev) => (
            prev.length === visibleConnectors.length
                ? []
                : visibleConnectors.map((connector) => connector.id)
        ));
    };

    const handleSimulate = (connector) => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
        timersRef.current = [];

        setSimulation({
            connectorId: connector.id,
            state: 'running',
            currentStep: 0,
        });

        connector.walkthrough.steps.forEach((_, index) => {
            const timer = window.setTimeout(() => {
                setSimulation({
                    connectorId: connector.id,
                    state: 'running',
                    currentStep: index + 1,
                });
            }, (index + 1) * 700);
            timersRef.current.push(timer);
        });

        const completeTimer = window.setTimeout(() => {
            const currentConnector = connectors.find((item) => item.id === connector.id) || connector;

            setRuntime((prev) => ({
                ...prev,
                [connector.id]: {
                    ...(prev[connector.id] || {}),
                    lastQuery: currentConnector.walkthrough.userQuery,
                },
            }));

            appendAuditTrail(connector.id, {
                id: uid('audit'),
                actor: '萤火虫',
                action: currentConnector.walkthrough.label,
                outcome: '成功',
                detail: currentConnector.walkthrough.resultSummary,
                at: new Date().toISOString(),
            });

            emitConnectorNotification(currentConnector);
            setSimulation({
                connectorId: connector.id,
                state: 'done',
                currentStep: currentConnector.walkthrough.steps.length,
            });

            setToast({
                tone: 'success',
                title: '调试任务已完成',
                body: '消息中心会收到一条连接器回执，方便你回到萤火虫继续追问。',
            });
        }, (connector.walkthrough.steps.length + 1) * 700);

        timersRef.current.push(completeTimer);
    };

    const selectedAuthMode = selectedConnector?.authModes.find((item) => item.id === selectedConnector.preferredAuthId) || null;
    const visibleAllSelected = visibleConnectors.length > 0 && selectedIds.length === visibleConnectors.length;
    const relatedSkills = useMemo(() => {
        if (!selectedConnector) {
            return [];
        }

        return getSkillsForConnector(selectedConnector.id, skillDefinitions, definitions);
    }, [definitions, selectedConnector, skillDefinitions]);

    return (
        <div className="connector-page">
            <div className="connector-page-shell">
                <header className="connector-console-head glass-strong">
                    <div className="connector-console-copy">
                        <span className="connector-kicker">连接器授权中心</span>
                        <h1>校内外系统接入管理台</h1>
                        <p>从这里统一管理接入台账、抽屉编辑、凭证引用、授权方式和调试记录，而不是只挂一个外链入口。这里是“系统接入层”的详细台账，而更上层的能力封装、审核和萤火虫调用治理则统一收进能力接入中心。</p>
                    </div>
                    <div className="connector-console-actions">
                        <Link href="/connectors" className="connector-inline-link">能力接入中心</Link>
                        <Link href="/connectors/skills" className="connector-inline-link">Skills 管理</Link>
                        <Link href="/connectors/vault" className="connector-inline-link">凭证保险库</Link>
                        <button type="button" className="connector-primary-btn" onClick={openDrawerForCreate}>新建连接器</button>
                    </div>
                </header>

                <section className="connector-console-strip">
                    <div className="connector-strip-card glass">
                        <span>登记连接器</span>
                        <strong>{connectorSummary.total}</strong>
                    </div>
                    <div className="connector-strip-card glass">
                        <span>已授权</span>
                        <strong>{connectorSummary.authorized}</strong>
                    </div>
                    <div className="connector-strip-card glass">
                        <span>稳定可用</span>
                        <strong>{connectorSummary.healthy}</strong>
                    </div>
                    <div className="connector-strip-card glass attention">
                        <span>待关注</span>
                        <strong>{connectorSummary.needAttention}</strong>
                    </div>
                    <div className="connector-strip-card glass">
                        <span>已暂停</span>
                        <strong>{connectorSummary.paused}</strong>
                    </div>
                </section>

                <section className="connector-table-shell glass">
                    <div className="connector-table-toolbar">
                        <div className="connector-toolbar-left">
                            <input
                                className="connector-search"
                                type="text"
                                placeholder="搜索系统、入口、凭证引用"
                                value={searchValue}
                                onChange={(event) => setSearchValue(event.target.value)}
                            />
                            <div className="connector-filter-row">
                                <button type="button" className={`connector-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>全部状态</button>
                                {Object.values(connectorStatusMap).map((status) => (
                                    <button key={status.id} type="button" className={`connector-chip ${statusFilter === status.id ? 'active' : ''}`} onClick={() => setStatusFilter(status.id)}>
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                            <div className="connector-filter-row">
                                <button type="button" className={`connector-chip ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>全部分类</button>
                                {Object.entries(connectorCategoryMap).map(([id, label]) => (
                                    <button key={id} type="button" className={`connector-chip ${categoryFilter === id ? 'active' : ''}`} onClick={() => setCategoryFilter(id)}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="connector-toolbar-right">
                            <label className="connector-sort-select">
                                <span>排序</span>
                                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                                    {sortOptions.map((option) => (
                                        <option key={option.id} value={option.id}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <button type="button" className="connector-secondary-btn" onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}>
                                {sortDirection === 'asc' ? '升序' : '降序'}
                            </button>
                        </div>
                    </div>

                    <div className="connector-bulk-bar">
                        <label className="connector-bulk-check">
                            <input type="checkbox" checked={visibleAllSelected} onChange={toggleSelectAllVisible} />
                            <span>全选当前列表</span>
                        </label>
                        <div className="connector-bulk-actions">
                            <button type="button" className="connector-secondary-btn" onClick={() => handleBulkAction('enable')} disabled={selectedIds.length === 0}>批量启用</button>
                            <button type="button" className="connector-secondary-btn" onClick={() => handleBulkAction('pause')} disabled={selectedIds.length === 0}>批量暂停</button>
                            <button type="button" className="connector-secondary-btn" onClick={() => handleBulkAction('validate')} disabled={selectedIds.length === 0}>批量巡检</button>
                        </div>
                        <span className="connector-bulk-count">已选 {selectedIds.length} 项</span>
                    </div>

                    <div className="connector-table-wrap">
                        <table className="connector-table">
                            <thead>
                                <tr>
                                    <th />
                                    <th>系统</th>
                                    <th>分类</th>
                                    <th>接入方式</th>
                                    <th>归属部门</th>
                                    <th>凭证引用</th>
                                    <th>状态</th>
                                    <th>最近校验</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleConnectors.map((connector) => {
                                    const effectiveStatus = getEffectiveStatus(connector);
                                    const statusMeta = connectorStatusMap[effectiveStatus] || connectorStatusMap.draft;
                                    return (
                                        <tr
                                            key={connector.id}
                                            className={selectedConnectorId === connector.id ? 'active' : ''}
                                            onClick={() => {
                                                setSelectedConnectorId(connector.id);
                                                setActiveTab('config');
                                            }}
                                        >
                                            <td onClick={(event) => event.stopPropagation()}>
                                                <input type="checkbox" checked={selectedIds.includes(connector.id)} onChange={() => toggleSelectedId(connector.id)} />
                                            </td>
                                            <td>
                                                <div className="connector-cell-main">
                                                    <strong>{connector.name}</strong>
                                                    <span>{connector.sourceLabel}</span>
                                                </div>
                                            </td>
                                            <td>{connectorCategoryMap[connector.category]}</td>
                                            <td>{connectorTypeMap[connector.preferredConnectorType] || connector.preferredConnectorType}</td>
                                            <td>{connector.owner}</td>
                                            <td>{connector.runtimeConfig.vaultRef}</td>
                                            <td><span className={`connector-status-pill ${statusMeta.tone}`}>{statusMeta.label}</span></td>
                                            <td>{formatDateTime(connector.lastValidatedAt)}</td>
                                            <td onClick={(event) => event.stopPropagation()}>
                                                <div className="connector-row-actions">
                                                    <button type="button" className="connector-inline-link" onClick={() => openDrawerForEdit(connector)}>编辑</button>
                                                    <button type="button" className="connector-secondary-btn" onClick={() => handleSimulate(connector)}>调试</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                {selectedConnector && configForm && (
                    <div className="connector-detail-grid">
                        <section className="connector-detail">
                            <div className="connector-control-bar glass-strong">
                                <div className="connector-control-primary">
                                    <div className="connector-control-topline">
                                        <span className={`connector-status-pill ${(connectorStatusMap[getEffectiveStatus(selectedConnector)] || connectorStatusMap.draft).tone}`}>
                                            {(connectorStatusMap[getEffectiveStatus(selectedConnector)] || connectorStatusMap.draft).label}
                                        </span>
                                        <span className="connector-control-type">{connectorTypeMap[selectedConnector.preferredConnectorType] || selectedConnector.preferredConnectorType}</span>
                                        <span className="connector-control-type">{connectorCategoryMap[selectedConnector.category]}</span>
                                    </div>
                                    <h2>{selectedConnector.name}</h2>
                                    <div className="connector-control-meta">
                                        <span>所属：{selectedConnector.owner}</span>
                                        <span>能力归属：{capabilityLabelMap[selectedConnector.primaryCapabilityId] || selectedConnector.primaryCapabilityId}</span>
                                        <span>最近执行：{formatDateTime(selectedConnector.lastExecutedAt)}</span>
                                    </div>
                                </div>
                                <div className="connector-detail-head-actions">
                                    <button type="button" className="connector-primary-btn" onClick={() => handleSimulate(selectedConnector)}>运行调试</button>
                                    <button type="button" className="connector-secondary-btn" onClick={() => handleValidate(selectedConnector)}>健康检查</button>
                                    <button type="button" className="connector-secondary-btn" onClick={() => handleAuthorize(selectedConnector, !selectedConnector.authorized)}>
                                        {selectedConnector.authorized ? '暂停授权' : '启用授权'}
                                    </button>
                                </div>
                            </div>

                            <div className="connector-tab-row">
                                {connectorTabs.map((tab) => (
                                    <button key={tab.id} type="button" className={`connector-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {activeTab === 'config' && (
                                <div className="connector-config-layout">
                                    <article className="connector-panel glass">
                                        <div className="connector-panel-head">
                                            <div>
                                                <span className="connector-section-kicker">接入配置</span>
                                                <h3>入口与运行参数</h3>
                                            </div>
                                            <button type="button" className="connector-primary-btn" onClick={handleSaveConfig}>保存配置</button>
                                        </div>

                                        <div className="connector-form-grid">
                                            <label className="connector-field">
                                                <span>入口地址</span>
                                                <input type="text" value={configForm.openUrl} onChange={(event) => handleConfigChange('openUrl', event.target.value)} />
                                            </label>
                                            <label className="connector-field">
                                                <span>归属部门</span>
                                                <input type="text" value={configForm.owner} onChange={(event) => handleConfigChange('owner', event.target.value)} />
                                            </label>
                                            <label className="connector-field">
                                                <span>接入方式</span>
                                                <select value={configForm.connectorType} onChange={(event) => handleConfigChange('connectorType', event.target.value)}>
                                                    {Object.entries(connectorTypeMap).map(([id, label]) => (
                                                        <option key={id} value={id}>{label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="connector-field">
                                                <span>能力归属</span>
                                                <select value={configForm.primaryCapabilityId} onChange={(event) => handleConfigChange('primaryCapabilityId', event.target.value)}>
                                                    {Object.entries(capabilityLabelMap).map(([id, label]) => (
                                                        <option key={id} value={id}>{label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="connector-field full">
                                                <span>访问路径说明</span>
                                                <textarea rows={3} value={configForm.accessPath} onChange={(event) => handleConfigChange('accessPath', event.target.value)} />
                                            </label>
                                            <label className="connector-field">
                                                <span>执行范围</span>
                                                <select value={configForm.scope} onChange={(event) => handleConfigChange('scope', event.target.value)}>
                                                    {scopeOptions.map((option) => (
                                                        <option key={option.id} value={option.id}>{option.label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="connector-field">
                                                <span>超时时间</span>
                                                <input type="number" value={configForm.timeoutSec} onChange={(event) => handleConfigChange('timeoutSec', Number(event.target.value) || 0)} />
                                            </label>
                                            <label className="connector-field">
                                                <span>同步窗口</span>
                                                <input type="text" value={configForm.syncWindow} onChange={(event) => handleConfigChange('syncWindow', event.target.value)} />
                                            </label>
                                            <label className="connector-field">
                                                <span>凭证引用</span>
                                                <input type="text" value={configForm.vaultRef} onChange={(event) => handleConfigChange('vaultRef', event.target.value)} />
                                            </label>
                                        </div>

                                        <div className="connector-toggle-list">
                                            <label className="connector-toggle">
                                                <input type="checkbox" checked={configForm.enabled} onChange={(event) => handleConfigChange('enabled', event.target.checked)} />
                                                <div>
                                                    <strong>启用连接器</strong>
                                                    <p>关闭后会保留配置，但不再参与自动调度。</p>
                                                </div>
                                            </label>
                                            <label className="connector-toggle">
                                                <input type="checkbox" checked={configForm.requireConfirmation} onChange={(event) => handleConfigChange('requireConfirmation', event.target.checked)} />
                                                <div>
                                                    <strong>高风险操作需人工确认</strong>
                                                    <p>适合涉及写回、续借、成绩提交等不应自动完成的动作。</p>
                                                </div>
                                            </label>
                                        </div>
                                    </article>
                                </div>
                            )}

                            {activeTab === 'authorization' && (
                                <div className="connector-authorization-layout">
                                    <article className="connector-panel glass">
                                        <span className="connector-section-kicker">授权路径</span>
                                        <h3>默认授权方式</h3>
                                        <div className="connector-auth-list">
                                            {selectedConnector.authModes.map((mode) => (
                                                <label key={mode.id} className={`connector-auth-card ${selectedConnector.preferredAuthId === mode.id ? 'active' : ''}`}>
                                                    <input type="radio" name={`connector-auth-${selectedConnector.id}`} checked={selectedConnector.preferredAuthId === mode.id} onChange={() => handleSetPreferredAuth(selectedConnector.id, mode.id)} />
                                                    <div>
                                                        <strong>{mode.label}</strong>
                                                        <p>{mode.detail}</p>
                                                        <span>{mode.risk}</span>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </article>
                                    <article className="connector-panel glass">
                                        <span className="connector-section-kicker">权限范围</span>
                                        <h3>当前允许的能力</h3>
                                        <div className="connector-permission-grid">
                                            {selectedConnector.permissions.map((permission) => (
                                                <div key={permission} className="connector-permission-pill">{permission}</div>
                                            ))}
                                        </div>
                                        <div className="connector-policy-note">
                                            <strong>{selectedConnector.authorized ? '已进入可调度状态' : '当前未授权'}</strong>
                                            <p>建议继续细化到租户、角色和个人级别的授权，不要只停留在系统级别。</p>
                                        </div>
                                        <Link href="/connectors/vault" className="connector-inline-link">前往凭证保险库</Link>
                                    </article>
                                </div>
                            )}

                            {activeTab === 'execution' && (
                                <div className="connector-execution-layout">
                                    <article className="connector-panel glass">
                                        <div className="connector-panel-head">
                                            <div>
                                                <span className="connector-section-kicker">执行调试</span>
                                                <h3>{selectedConnector.walkthrough.label}</h3>
                                            </div>
                                            <button type="button" className="connector-primary-btn" onClick={() => handleSimulate(selectedConnector)}>运行示例</button>
                                        </div>
                                        <label className="connector-field full">
                                            <span>最近一次调试问题</span>
                                            <textarea rows={2} value={selectedConnector.lastQuery} readOnly />
                                        </label>
                                        <div className="connector-step-list">
                                            {selectedConnector.walkthrough.steps.map((step, index) => {
                                                const isDone = simulation?.connectorId === selectedConnector.id && simulation.currentStep > index;
                                                const isCurrent = simulation?.connectorId === selectedConnector.id && simulation.currentStep === index + 1 && simulation.state === 'running';
                                                return (
                                                    <div key={step} className={`connector-step-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
                                                        <span>{index + 1}</span>
                                                        <div>
                                                            <strong>{step}</strong>
                                                            <p>{index === 0 ? '先确认授权方式和入口可达性。' : index === selectedConnector.walkthrough.steps.length - 1 ? '回写萤火虫与消息中心。' : '继续执行抓取、映射或跳转。'}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </article>
                                    <article className="connector-panel glass">
                                        <span className="connector-section-kicker">标准回执</span>
                                        <h3>会返回给上层什么</h3>
                                        <div className="connector-result-card">
                                            <strong>{selectedConnector.walkthrough.resultTitle}</strong>
                                            <p>{selectedConnector.walkthrough.resultSummary}</p>
                                            <div className="connector-result-meta">
                                                <span>授权：{selectedAuthMode?.label || '未配置'}</span>
                                                <span>能力：{selectedConnector.name}</span>
                                            </div>
                                        </div>
                                        <div className="connector-prompt-list">
                                            {selectedConnector.suggestedPrompts.map((prompt) => (
                                                <Link
                                                    key={prompt}
                                                    href={buildFireflyHandoffHref(
                                                        prompt,
                                                        selectedConnector.primaryCapabilityId ? [selectedConnector.primaryCapabilityId] : []
                                                    )}
                                                    className="connector-prompt-card"
                                                >
                                                    {prompt}
                                                </Link>
                                            ))}
                                        </div>
                                    </article>
                                </div>
                            )}

                            {activeTab === 'audit' && (
                                <article className="connector-panel glass">
                                    <div className="connector-panel-head">
                                        <div>
                                            <span className="connector-section-kicker">审计日志</span>
                                            <h3>最近执行与巡检记录</h3>
                                        </div>
                                    </div>
                                    <div className="connector-audit-table">
                                        <div className="connector-audit-columns">
                                            <span>时间</span>
                                            <span>动作</span>
                                            <span>执行者</span>
                                            <span>结果</span>
                                        </div>
                                        {selectedConnector.auditTrail.map((item) => (
                                            <div key={item.id} className="connector-audit-row">
                                                <span>{formatDateTime(item.at)}</span>
                                                <strong>{item.action}</strong>
                                                <span>{item.actor}</span>
                                                <span>{item.outcome}</span>
                                                <p>{item.detail}</p>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            )}
                        </section>

                        <aside className="connector-side-context">
                            <article className="connector-panel glass">
                                <span className="connector-section-kicker">运行态</span>
                                <h3>当前接入状态</h3>
                                <div className="connector-runtime-grid">
                                    <div className="connector-runtime-item">
                                        <span>授权状态</span>
                                        <strong>{selectedConnector.authorized ? '已授权' : '未授权'}</strong>
                                    </div>
                                    <div className="connector-runtime-item">
                                        <span>调度开关</span>
                                        <strong>{selectedConnector.runtimeConfig.enabled ? '开启' : '关闭'}</strong>
                                    </div>
                                    <div className="connector-runtime-item">
                                        <span>默认授权</span>
                                        <strong>{selectedAuthMode?.label || '未配置'}</strong>
                                    </div>
                                    <div className="connector-runtime-item">
                                        <span>凭证引用</span>
                                        <strong>{selectedConnector.runtimeConfig.vaultRef}</strong>
                                    </div>
                                </div>
                            </article>

                            <article className="connector-panel glass">
                                <span className="connector-section-kicker">执行策略</span>
                                <h3>上线前约束</h3>
                                <ul className="connector-bullet-list">
                                    {selectedConnector.executionPolicy.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </article>

                            <article className="connector-panel glass">
                                <span className="connector-section-kicker">风险清单</span>
                                <h3>需要持续关注</h3>
                                <ul className="connector-bullet-list">
                                    {selectedConnector.risks.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </article>

                            <article className="connector-panel glass">
                                <span className="connector-section-kicker">关联 Skills</span>
                                <h3>哪些能力依赖这个接入</h3>
                                {relatedSkills.length > 0 ? (
                                    <ul className="connector-bullet-list">
                                        {relatedSkills.map((skill) => (
                                            <li key={skill.id}>
                                                <Link href={`/connectors/skills/${skill.id}`} className="connector-inline-link">{skill.name}</Link>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p>当前还没有 Skill 绑定这个连接器。后续可以去 Skills 管理中心把它封装成萤火虫可调用能力。</p>
                                )}
                            </article>
                        </aside>
                    </div>
                )}
            </div>

            {drawerState.open && (
                <>
                    <button type="button" className="connector-drawer-backdrop" onClick={closeDrawer} aria-label="关闭抽屉" />
                    <aside className="connector-drawer glass-strong">
                        <div className="connector-drawer-head">
                            <div>
                                <span className="connector-section-kicker">{drawerState.mode === 'create' ? '新建连接器' : '编辑连接器'}</span>
                                <h3>{drawerState.mode === 'create' ? '新增接入系统' : '编辑台账信息'}</h3>
                            </div>
                            <button type="button" className="connector-secondary-btn" onClick={closeDrawer}>关闭</button>
                        </div>
                        <div className="connector-drawer-body">
                            <div className="connector-form-grid">
                                <label className="connector-field">
                                    <span>系统名称</span>
                                    <input type="text" value={drawerForm.name} onChange={(event) => handleDrawerChange('name', event.target.value)} />
                                </label>
                                <label className="connector-field">
                                    <span>简称</span>
                                    <input type="text" value={drawerForm.shortName} onChange={(event) => handleDrawerChange('shortName', event.target.value)} />
                                </label>
                                <label className="connector-field">
                                    <span>来源说明</span>
                                    <input type="text" value={drawerForm.sourceLabel} onChange={(event) => handleDrawerChange('sourceLabel', event.target.value)} />
                                </label>
                                <label className="connector-field">
                                    <span>归属部门</span>
                                    <input type="text" value={drawerForm.owner} onChange={(event) => handleDrawerChange('owner', event.target.value)} />
                                </label>
                                <label className="connector-field">
                                    <span>分类</span>
                                    <select value={drawerForm.category} onChange={(event) => handleDrawerChange('category', event.target.value)}>
                                        {Object.entries(connectorCategoryMap).map(([id, label]) => (
                                            <option key={id} value={id}>{label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="connector-field">
                                    <span>接入方式</span>
                                    <select value={drawerForm.preferredConnectorType} onChange={(event) => handleDrawerChange('preferredConnectorType', event.target.value)}>
                                        {Object.entries(connectorTypeMap).map(([id, label]) => (
                                            <option key={id} value={id}>{label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="connector-field">
                                    <span>能力归属</span>
                                    <select value={drawerForm.primaryCapabilityId} onChange={(event) => handleDrawerChange('primaryCapabilityId', event.target.value)}>
                                        {Object.entries(capabilityLabelMap).map(([id, label]) => (
                                            <option key={id} value={id}>{label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="connector-field">
                                    <span>初始状态</span>
                                    <select value={drawerForm.status} onChange={(event) => handleDrawerChange('status', event.target.value)}>
                                        {Object.entries(connectorStatusMap).map(([id, value]) => (
                                            <option key={id} value={id}>{value.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="connector-field full">
                                    <span>入口地址</span>
                                    <input type="text" value={drawerForm.openUrl} onChange={(event) => handleDrawerChange('openUrl', event.target.value)} />
                                </label>
                                <label className="connector-field full">
                                    <span>摘要说明</span>
                                    <textarea rows={2} value={drawerForm.summary} onChange={(event) => handleDrawerChange('summary', event.target.value)} />
                                </label>
                                <label className="connector-field full">
                                    <span>访问路径说明</span>
                                    <textarea rows={3} value={drawerForm.accessPath} onChange={(event) => handleDrawerChange('accessPath', event.target.value)} />
                                </label>
                                <label className="connector-field full">
                                    <span>权限范围</span>
                                    <textarea rows={2} value={drawerForm.permissionsText} onChange={(event) => handleDrawerChange('permissionsText', event.target.value)} placeholder="例如：课表查询、考试安排、成绩摘要" />
                                </label>
                                <label className="connector-field full">
                                    <span>接入策略说明</span>
                                    <textarea rows={3} value={drawerForm.connectionStrategy} onChange={(event) => handleDrawerChange('connectionStrategy', event.target.value)} />
                                </label>
                            </div>
                        </div>
                        <div className="connector-drawer-actions">
                            <button type="button" className="connector-secondary-btn" onClick={closeDrawer}>取消</button>
                            <button type="button" className="connector-primary-btn" onClick={handleSaveDrawer}>保存连接器</button>
                        </div>
                    </aside>
                </>
            )}

            {toast && (
                <div className={`connector-toast ${toast.tone}`}>
                    <strong>{toast.title}</strong>
                    <span>{toast.body}</span>
                </div>
            )}
        </div>
    );
}
