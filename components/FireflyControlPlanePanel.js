'use client';

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { filterFireflyToolsByMarketAccess } from '@/data/capabilityMarket';
import {
    listFireflyControlPlanePresets,
    resolveFireflyControlPlanePreset,
} from '@/lib/fireflyControlPlanePresets';
import {
    buildFireflyExecutionImpactDiff,
    buildFireflyGovernanceSuggestions,
    buildFireflyPlannerExplainers,
    buildFireflyExecutionPreview,
} from '@/lib/fireflyExecutionPreview';
import './FireflyControlPlanePanel.css';

function truncate(value = '', limit = 132) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function formatMemoryType(type = '') {
    if (type === 'workflow_hint') return '流程线索';
    if (type === 'task_result') return '任务结果';
    if (type === 'user_preference') return '用户偏好';
    if (type === 'reading_context') return '阅读上下文';
    return type || '记忆';
}

function formatMemoryLayer(layer = '') {
    return layer === 'compressed' ? '压缩层' : '原始层';
}

function formatPriorityBand(priorityBand = '') {
    if (priorityBand === 'critical') return '关键';
    if (priorityBand === 'high') return '高优先';
    if (priorityBand === 'working') return '工作中';
    return '标准';
}

function formatRetentionPolicy(policy = '') {
    if (policy === 'compressed_rollup') return '压缩汇总';
    if (policy === 'session_only') return '仅当前周期';
    return '滚动保留';
}

function formatSourceKind(kind = '') {
    if (kind === 'web_runtime') return '联网';
    if (kind === 'research_runtime') return '研究';
    if (kind === 'skill_adapter') return 'Skill';
    if (kind === 'mcp_backed') return 'MCP';
    if (kind === 'connector_backed') return '连接器';
    if (kind === 'thread_workspace') return '工作区';
    if (kind === 'url_runtime') return 'URL';
    if (kind === 'composed_runtime') return '内建';
    return kind || '工具';
}

function formatRelativeTime(value) {
    if (!value) {
        return '刚刚更新';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '刚刚更新';
    }

    return date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatGovernanceKind(kind = '') {
    if (kind === 'memory') return '记忆';
    if (kind === 'tool') return '工具';
    if (kind === 'policy') return '策略';
    return kind || '治理';
}

function describeGovernanceImpact(event = {}) {
    const action = String(event.action || '').trim();
    if (action === 'tool_pin') return '再次应用后，这个工具会更稳定地进入下一轮优先候选。';
    if (action === 'tool_unpin') return '回到未固定状态后，planner 会更依赖自动收敛。';
    if (action === 'tool_lease') return '再次应用后，这个工具会在当前线程里被临时抬高优先级。';
    if (action === 'tool_revoke') return '撤销后，这个工具不会再享受线程级临时偏置。';
    if (action === 'tool_block') return '屏蔽后，下一轮不会再调度这个工具。';
    if (action === 'tool_unblock') return '恢复后，planner 会把这个工具重新纳入候选空间。';
    if (action === 'tool_require_confirm') return '命中该工具时，会先在前台暂停等你确认。';
    if (action === 'tool_skip_confirm') return '该工具命中后会恢复直接执行，不再先暂停确认。';
    if (action === 'settings_update') return '再次应用后，下一轮 managed context 会按这套前台策略重新生成。';
    if (action === 'memory_update') return '再次应用后，这条记忆的优先级/冻结状态会继续影响记忆注入。';
    if (action === 'memory_create' || action === 'memory_remember_task') return '再次应用后，这条记忆会继续作为下一轮规划的长期上下文输入。';
    if (action === 'memory_summarize') return '再次应用后，会再生成一条压缩记忆，帮助跨周期续跑。';
    if (action === 'memory_delete') return '回滚后，这条记忆会重新回到可注入集合。';
    return '再次应用后，下一轮执行路径会按这条治理动作重新收敛。';
}

function buildScopeQuery({ uid = '', fid = '', threadKey = '', capabilityIds = [] } = {}) {
    const params = new URLSearchParams();
    if (uid) params.set('uid', uid);
    if (fid) params.set('fid', fid);
    if (threadKey) params.set('threadKey', threadKey);
    capabilityIds.filter(Boolean).forEach((item) => params.append('capabilityIds', item));
    return params.toString();
}

function sortToolCatalog(catalog = [], toolbeltMap = new Map()) {
    return [...catalog].sort((left, right) => {
        const leftState = toolbeltMap.get(left.id);
        const rightState = toolbeltMap.get(right.id);
        const leftPin = leftState?.pinned ? 1 : 0;
        const rightPin = rightState?.pinned ? 1 : 0;
        if (rightPin !== leftPin) {
            return rightPin - leftPin;
        }

        const leftLease = leftState?.leased ? 1 : 0;
        const rightLease = rightState?.leased ? 1 : 0;
        if (rightLease !== leftLease) {
            return rightLease - leftLease;
        }

        const leftScore = Number(leftState?.successCount || 0) - Number(leftState?.failureCount || 0);
        const rightScore = Number(rightState?.successCount || 0) - Number(rightState?.failureCount || 0);
        if (rightScore !== leftScore) {
            return rightScore - leftScore;
        }

        return String(left.name || left.id).localeCompare(String(right.name || right.id), 'zh-CN');
    });
}

function buildDefaultState() {
    return {
        loading: false,
        error: '',
        message: '',
        activeTask: null,
        memory: {
            entries: [],
            metrics: {
                total: 0,
                compressed: 0,
                raw: 0,
                types: [],
            },
        },
        toolbelt: {
            items: [],
            pinnedToolIds: [],
            leasedToolIds: [],
            preferredToolIds: [],
            strategy: {
                pinnedCount: 0,
                leasedCount: 0,
                learnedCount: 0,
            },
        },
        toolCatalog: [],
        controlPlanePrefs: {
            presetId: 'balanced',
            memory: {
                injectTopK: 4,
                autoRememberTasks: true,
                defaultPriorityBand: 'standard',
            },
            tools: {
                selectionMode: 'auto',
                webSearchMode: 'auto',
                blockedToolIds: [],
                confirmBeforeUseToolIds: ['workspace.publish'],
            },
        },
        governanceEvents: [],
    };
}

export default function FireflyControlPlanePanel({
    threadKey = '',
    activeTask = null,
    userProfile = null,
    capabilityIds = [],
    marketAccess = null,
    contextSnapshot = null,
    surface = 'workbench',
    className = '',
    defaultExpanded = surface !== 'drawer',
}) {
    const [panelState, setPanelState] = useState(() => buildDefaultState());
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [pendingAction, setPendingAction] = useState('');
    const [pendingBatchAction, setPendingBatchAction] = useState('');
    const [noteDrafts, setNoteDrafts] = useState({});
    const [manualMemoryDraft, setManualMemoryDraft] = useState({
        title: '',
        summary: '',
        detail: '',
        memoryType: 'user_preference',
        priorityBand: 'standard',
        retentionPolicy: 'rolling',
        crossThreadPinned: false,
    });

    const uid = String(userProfile?.uid || '').trim();
    const fid = String(userProfile?.fid || '').trim();
    const normalizedCapabilityIds = useMemo(
        () => (Array.isArray(capabilityIds) ? capabilityIds.filter(Boolean) : []),
        [capabilityIds]
    );
    const scopeQuery = useMemo(() => buildScopeQuery({
        uid,
        fid,
        threadKey,
        capabilityIds: normalizedCapabilityIds,
    }), [fid, normalizedCapabilityIds, threadKey, uid]);
    const expansionScopeKey = useMemo(
        () => `${surface}:${threadKey || 'global'}`,
        [surface, threadKey]
    );

    const applyPayload = useCallback((payload, message = '') => {
        setPanelState({
            loading: false,
            error: '',
            message,
            activeTask: payload.activeTask || null,
            memory: payload.memory || buildDefaultState().memory,
            toolbelt: payload.toolbelt || buildDefaultState().toolbelt,
            toolCatalog: Array.isArray(payload.toolCatalog) ? payload.toolCatalog : [],
            controlPlanePrefs: payload.controlPlanePrefs || buildDefaultState().controlPlanePrefs,
            governanceEvents: Array.isArray(payload.governanceEvents) ? payload.governanceEvents : [],
        });
    }, []);

    const loadControlPlane = useCallback(async (message = '') => {
        setPanelState((current) => ({
            ...current,
            loading: true,
            error: '',
            message: '',
        }));

        const response = await fetch(`/api/firefly/control-plane?${scopeQuery}`, {
            cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok || !payload?.ok) {
            throw new Error(payload?.error || '加载 control plane 失败');
        }

        applyPayload(payload, message);
    }, [applyPayload, scopeQuery]);

    useEffect(() => {
        setExpanded(Boolean(defaultExpanded));
    }, [defaultExpanded, expansionScopeKey]);

    useEffect(() => {
        let cancelled = false;

        async function syncControlPlane() {
            try {
                await loadControlPlane();

                if (cancelled) {
                    return;
                }
            } catch (error) {
                if (!cancelled) {
                    setPanelState((current) => ({
                        ...current,
                        loading: false,
                        error: error instanceof Error ? error.message : '加载 control plane 失败',
                    }));
                }
            }
        }

        syncControlPlane();
        return () => {
            cancelled = true;
        };
    }, [loadControlPlane]);

    const effectiveTask = activeTask?.id ? activeTask : panelState.activeTask;
    const toolbeltMap = useMemo(
        () => new Map((panelState.toolbelt?.items || []).map((item) => [item.toolId, item])),
        [panelState.toolbelt?.items]
    );
    const filteredToolCatalog = useMemo(() => {
        const filtered = filterFireflyToolsByMarketAccess(
            Array.isArray(panelState.toolCatalog) ? panelState.toolCatalog : [],
            {
                ...(contextSnapshot && typeof contextSnapshot === 'object' ? contextSnapshot : {}),
                capabilityIds: normalizedCapabilityIds,
                marketAccess,
            }
        );

        return sortToolCatalog(filtered, toolbeltMap);
    }, [contextSnapshot, marketAccess, normalizedCapabilityIds, panelState.toolCatalog, toolbeltMap]);
    const controlPlanePrefs = panelState.controlPlanePrefs || buildDefaultState().controlPlanePrefs;
    const blockedToolIds = useMemo(
        () => (Array.isArray(controlPlanePrefs?.tools?.blockedToolIds) ? controlPlanePrefs.tools.blockedToolIds : []),
        [controlPlanePrefs?.tools?.blockedToolIds]
    );
    const blockedToolSet = useMemo(() => new Set(blockedToolIds), [blockedToolIds]);
    const confirmBeforeUseToolIds = useMemo(
        () => (Array.isArray(controlPlanePrefs?.tools?.confirmBeforeUseToolIds) ? controlPlanePrefs.tools.confirmBeforeUseToolIds : []),
        [controlPlanePrefs?.tools?.confirmBeforeUseToolIds]
    );
    const confirmBeforeUseSet = useMemo(() => new Set(confirmBeforeUseToolIds), [confirmBeforeUseToolIds]);
    const policyPresets = useMemo(() => listFireflyControlPlanePresets(), []);
    const visibleMemoryEntries = useMemo(
        () => (Array.isArray(panelState.memory?.entries) ? panelState.memory.entries : []),
        [panelState.memory?.entries]
    );
    const controlPlanePreview = useMemo(() => buildFireflyExecutionPreview({
        task: effectiveTask,
        prefs: controlPlanePrefs,
        memoryEntries: visibleMemoryEntries,
        displayTools: filteredToolCatalog,
        displayToolMode: 'catalog',
        toolbelt: panelState.toolbelt,
        blockedToolIds,
        confirmBeforeUseToolIds,
    }), [
        blockedToolIds,
        confirmBeforeUseToolIds,
        controlPlanePrefs,
        effectiveTask,
        filteredToolCatalog,
        panelState.toolbelt,
        visibleMemoryEntries,
    ]);
    const controlPlaneImpactDiff = useMemo(() => buildFireflyExecutionImpactDiff({
        task: effectiveTask,
        candidateTools: filteredToolCatalog,
        blockedToolIds,
        confirmBeforeUseToolIds,
        visibleToolMode: 'catalog',
        webSearchMode: controlPlanePrefs?.tools?.webSearchMode,
    }), [
        blockedToolIds,
        confirmBeforeUseToolIds,
        controlPlanePrefs?.tools?.webSearchMode,
        effectiveTask,
        filteredToolCatalog,
    ]);
    const plannerExplainers = useMemo(
        () => buildFireflyPlannerExplainers(effectiveTask),
        [effectiveTask]
    );
    const governanceSuggestions = useMemo(() => buildFireflyGovernanceSuggestions({
        task: effectiveTask,
        prefs: controlPlanePrefs,
        candidateTools: filteredToolCatalog,
        toolbeltItems: panelState.toolbelt?.items || [],
        blockedToolIds,
        confirmBeforeUseToolIds,
        visibleToolMode: 'catalog',
    }), [
        blockedToolIds,
        confirmBeforeUseToolIds,
        controlPlanePrefs,
        effectiveTask,
        filteredToolCatalog,
        panelState.toolbelt?.items,
    ]);

    useEffect(() => {
        setNoteDrafts((current) => {
            const next = {};
            visibleMemoryEntries.forEach((item) => {
                next[item.id] = Object.prototype.hasOwnProperty.call(current, item.id)
                    ? current[item.id]
                    : (item.note || '');
            });
            return next;
        });
    }, [visibleMemoryEntries]);

    const mutateControlPlane = async (action, extraPayload = {}) => {
        setPendingAction(action);
        setPanelState((current) => ({
            ...current,
            error: '',
            message: '',
        }));

        try {
            const response = await fetch('/api/firefly/control-plane', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action,
                    uid,
                    fid,
                    threadKey,
                    capabilityIds: normalizedCapabilityIds,
                    ...extraPayload,
                }),
            });
            const payload = await response.json();
            if (!response.ok || !payload?.ok) {
                throw new Error(payload?.error || '更新 control plane 失败');
            }

            setPanelState({
                loading: false,
                error: '',
                message: String(payload.message || '').trim(),
                activeTask: payload.activeTask || null,
                memory: payload.memory || buildDefaultState().memory,
                toolbelt: payload.toolbelt || buildDefaultState().toolbelt,
                toolCatalog: Array.isArray(payload.toolCatalog) ? payload.toolCatalog : [],
                controlPlanePrefs: payload.controlPlanePrefs || buildDefaultState().controlPlanePrefs,
                governanceEvents: Array.isArray(payload.governanceEvents) ? payload.governanceEvents : [],
            });
        } catch (error) {
            setPanelState((current) => ({
                ...current,
                error: error instanceof Error ? error.message : '更新 control plane 失败',
            }));
        } finally {
            setPendingAction('');
        }
    };

    const applySuggestionGroup = async (group) => {
        const items = Array.isArray(group?.items) ? group.items : [];
        if (!items.length) {
            return;
        }

        setPendingBatchAction(group.id);
        setPanelState((current) => ({
            ...current,
            error: '',
            message: '',
        }));

        try {
            for (const item of items) {
                const response = await fetch('/api/firefly/control-plane', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: item.action,
                        uid,
                        fid,
                        threadKey,
                        capabilityIds: normalizedCapabilityIds,
                        ...(item.payload || {}),
                    }),
                });
                const payload = await response.json();
                if (!response.ok || !payload?.ok) {
                    throw new Error(payload?.error || '批量更新 control plane 失败');
                }

                setPanelState({
                    loading: false,
                    error: '',
                    message: String(payload.message || '').trim(),
                    activeTask: payload.activeTask || null,
                    memory: payload.memory || buildDefaultState().memory,
                    toolbelt: payload.toolbelt || buildDefaultState().toolbelt,
                    toolCatalog: Array.isArray(payload.toolCatalog) ? payload.toolCatalog : [],
                    controlPlanePrefs: payload.controlPlanePrefs || buildDefaultState().controlPlanePrefs,
                    governanceEvents: Array.isArray(payload.governanceEvents) ? payload.governanceEvents : [],
                });
            }

            setPanelState((current) => ({
                ...current,
                message: `已应用「${group.title}」建议。`,
            }));
        } catch (error) {
            setPanelState((current) => ({
                ...current,
                error: error instanceof Error ? error.message : '批量更新 control plane 失败',
            }));
        } finally {
            setPendingBatchAction('');
        }
    };

    const visibleToolCatalog = filteredToolCatalog.slice(0, surface === 'drawer' ? 6 : 10);
    const pending = Boolean(pendingAction || pendingBatchAction);
    const governanceEvents = Array.isArray(panelState.governanceEvents) ? panelState.governanceEvents : [];

    return (
        <section className={`firefly-control-plane ${surface} ${expanded ? 'expanded' : 'collapsed'} ${className}`.trim()}>
            <div className="firefly-control-plane-head">
                <div className="firefly-control-plane-copy">
                    <span className="firefly-control-plane-kicker">Control Plane</span>
                    <strong>Agent 控制台</strong>
                    <p>这是给高级干预用的面板：你可以在这里看记忆、工具偏好和下一轮策略。普通对话不用一直开着，只有想手动接管 agent 时再展开就行。</p>
                </div>
                <div className="firefly-control-plane-head-actions">
                    <div className="firefly-control-plane-summary">
                        <span>{panelState.memory?.metrics?.total || 0} 条记忆</span>
                        <span>{panelState.toolbelt?.strategy?.pinnedCount || 0} 个固定工具</span>
                        <span>{panelState.toolbelt?.strategy?.leasedCount || 0} 个临时工具</span>
                        <span>{blockedToolIds.length} 个已屏蔽工具</span>
                        <span>{confirmBeforeUseToolIds.length} 个使用前确认</span>
                    </div>
                    <button
                        type="button"
                        className="firefly-control-plane-ghost-btn"
                        disabled={panelState.loading || pending}
                        onClick={() => {
                            loadControlPlane('已刷新 control plane。').catch((error) => {
                                setPanelState((current) => ({
                                    ...current,
                                    loading: false,
                                    error: error instanceof Error ? error.message : '刷新失败',
                                }));
                            });
                        }}
                    >
                        {panelState.loading ? '刷新中…' : '刷新'}
                    </button>
                    <button
                        type="button"
                        className="firefly-control-plane-toggle-btn"
                        onClick={() => setExpanded((value) => !value)}
                    >
                        {expanded ? '收起' : '展开'}
                    </button>
                    {surface === 'drawer' ? (
                        <button
                            type="button"
                            className="firefly-control-plane-ghost-btn"
                            onClick={() => setExpanded(false)}
                        >
                            关闭
                        </button>
                    ) : null}
                </div>
            </div>

            {panelState.error ? (
                <div className="firefly-control-plane-feedback error">{panelState.error}</div>
            ) : null}
            {panelState.message ? (
                <div className="firefly-control-plane-feedback success">{panelState.message}</div>
            ) : null}

            {expanded ? (
                <div className="firefly-control-plane-body">
                    <article className="firefly-control-plane-section wide">
                        <div className="firefly-control-plane-section-head">
                            <div>
                                <span className="firefly-control-plane-section-kicker">Governance</span>
                                <h3>策略与治理</h3>
                            </div>
                            <div className="firefly-control-plane-section-actions">
                                <span className="firefly-control-plane-task-pill">
                                    自动路由：{controlPlanePrefs?.tools?.selectionMode === 'pinned_only'
                                        ? '仅固定工具'
                                        : controlPlanePrefs?.tools?.selectionMode === 'prefer_pinned'
                                            ? '优先固定工具'
                                            : '自动'}
                                </span>
                            </div>
                        </div>
                        <div className="firefly-control-plane-preview">
                            <div className="firefly-control-plane-preview-head">
                                <strong>{controlPlanePreview.title}</strong>
                                <p>{controlPlanePreview.summary}</p>
                            </div>
                            <div className="firefly-control-plane-tags">
                                {controlPlanePreview.chips.map((item) => (
                                    <span key={item}>{item}</span>
                                ))}
                            </div>
                            <div className="firefly-control-plane-preview-list">
                                {controlPlanePreview.lines.map((item) => (
                                    <p key={item}>{item}</p>
                                ))}
                            </div>
                            {controlPlaneImpactDiff.length > 0 ? (
                                <div className="firefly-control-plane-diff-box">
                                    <strong>和当前执行路径相比</strong>
                                    <div className="firefly-control-plane-preview-list">
                                        {controlPlaneImpactDiff.map((item) => (
                                            <p key={item}>{item}</p>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {plannerExplainers.map((section) => (
                                <div key={section.id} className="firefly-control-plane-diff-box">
                                    <strong>{section.title}</strong>
                                    <div className="firefly-control-plane-preview-list">
                                        {section.lines.map((item) => (
                                            <p key={item}>{item}</p>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {governanceSuggestions.length > 0 ? (
                                <div className="firefly-control-plane-diff-box">
                                    <strong>建议直接调整</strong>
                                    <div className="firefly-control-plane-suggestion-list">
                                        {governanceSuggestions.map((group) => (
                                            <section key={group.id} className="firefly-control-plane-suggestion-group">
                                                <div className="firefly-control-plane-suggestion-group-head">
                                                    <strong>{group.title}</strong>
                                                    {group.items.length > 1 ? (
                                                        <button
                                                            type="button"
                                                            className="firefly-control-plane-inline-btn"
                                                            disabled={pending}
                                                            onClick={() => applySuggestionGroup(group)}
                                                        >
                                                            {pendingBatchAction === group.id ? '应用中…' : '整组应用'}
                                                        </button>
                                                    ) : null}
                                                </div>
                                                {group.items.map((item) => (
                                                    <article key={item.id} className="firefly-control-plane-suggestion-card">
                                                        <div className="firefly-control-plane-preview-list">
                                                            <p><strong>{item.title}</strong></p>
                                                            <p>{item.detail}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className={`firefly-control-plane-inline-btn ${item.tone === 'accent' ? 'accent' : ''}`}
                                                            disabled={pending}
                                                            onClick={() => mutateControlPlane(item.action, item.payload || {})}
                                                        >
                                                            {pendingAction === item.action ? '处理中…' : item.buttonLabel}
                                                        </button>
                                                    </article>
                                                ))}
                                            </section>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        <div className="firefly-control-plane-policy-grid">
                            <div className="firefly-control-plane-policy-card wide">
                                <span>策略预设</span>
                                <div className="firefly-control-plane-preset-row">
                                    {policyPresets.map((preset) => {
                                        const active = String(controlPlanePrefs?.presetId || 'balanced') === preset.id;
                                        return (
                                            <button
                                                key={preset.id}
                                                type="button"
                                                className={`firefly-control-plane-preset-btn ${active ? 'active' : ''}`}
                                                disabled={pending}
                                                onClick={() => mutateControlPlane('settings_update', {
                                                    controlPlanePrefs: resolveFireflyControlPlanePreset(preset.id).controlPlanePrefs,
                                                })}
                                            >
                                                <strong>{preset.label}</strong>
                                                <small>{preset.description}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                                <small>一键切换当前用户的治理策略，后续 planner 会直接按这套规则调度。</small>
                            </div>

                            <label className="firefly-control-plane-policy-card">
                                <span>记忆注入强度</span>
                                <select
                                    value={String(controlPlanePrefs?.memory?.injectTopK ?? 4)}
                                    disabled={pending}
                                    onChange={(event) => mutateControlPlane('settings_update', {
                                        controlPlanePrefs: {
                                            memory: {
                                                injectTopK: Number(event.target.value),
                                            },
                                        },
                                    })}
                                >
                                    <option value="2">2 条</option>
                                    <option value="4">4 条</option>
                                    <option value="6">6 条</option>
                                    <option value="8">8 条</option>
                                </select>
                                <small>控制每轮规划时可注入多少条长期记忆。</small>
                            </label>

                            <label className="firefly-control-plane-policy-card">
                                <span>默认记忆优先级</span>
                                <select
                                    value={String(controlPlanePrefs?.memory?.defaultPriorityBand || 'standard')}
                                    disabled={pending}
                                    onChange={(event) => mutateControlPlane('settings_update', {
                                        controlPlanePrefs: {
                                            memory: {
                                                defaultPriorityBand: event.target.value,
                                            },
                                        },
                                    })}
                                >
                                    <option value="working">工作中</option>
                                    <option value="standard">标准</option>
                                    <option value="high">高优先</option>
                                    <option value="critical">关键</option>
                                </select>
                                <small>影响新写入任务记忆的默认优先级。</small>
                            </label>

                            <label className="firefly-control-plane-policy-card checkbox">
                                <div className="firefly-control-plane-checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={controlPlanePrefs?.memory?.autoRememberTasks !== false}
                                        disabled={pending}
                                        onChange={(event) => mutateControlPlane('settings_update', {
                                            controlPlanePrefs: {
                                                memory: {
                                                    autoRememberTasks: event.target.checked,
                                                },
                                            },
                                        })}
                                    />
                                    <span>自动写入任务记忆</span>
                                </div>
                                <small>关闭后只保留手动记住的任务，不自动沉淀完成或失败结果。</small>
                            </label>

                            <label className="firefly-control-plane-policy-card">
                                <span>工具选择模式</span>
                                <select
                                    value={String(controlPlanePrefs?.tools?.selectionMode || 'auto')}
                                    disabled={pending}
                                    onChange={(event) => mutateControlPlane('settings_update', {
                                        controlPlanePrefs: {
                                            tools: {
                                                selectionMode: event.target.value,
                                            },
                                        },
                                    })}
                                >
                                    <option value="auto">自动</option>
                                    <option value="prefer_pinned">优先固定工具</option>
                                    <option value="pinned_only">仅固定工具</option>
                                </select>
                                <small>控制 planner 是否优先或只使用你固定过的工具。</small>
                            </label>

                            <label className="firefly-control-plane-policy-card">
                                <span>联网研究路由</span>
                                <select
                                    value={String(controlPlanePrefs?.tools?.webSearchMode || 'auto')}
                                    disabled={pending}
                                    onChange={(event) => mutateControlPlane('settings_update', {
                                        controlPlanePrefs: {
                                            tools: {
                                                webSearchMode: event.target.value,
                                            },
                                        },
                                    })}
                                >
                                    <option value="auto">自动判断</option>
                                    <option value="manual_only">手动开启后才允许</option>
                                </select>
                                <small>控制实时问题是否允许在未显式开启时自动进入联网研究链路。</small>
                            </label>

                            <div className="firefly-control-plane-policy-card readonly">
                                <span>已屏蔽工具</span>
                                <strong>{blockedToolIds.length} 个</strong>
                                <small>被屏蔽的工具仍展示在面板里，但不会进入 planner 调度。</small>
                            </div>

                            <div className="firefly-control-plane-policy-card readonly">
                                <span>使用前确认</span>
                                <strong>{confirmBeforeUseToolIds.length} 个</strong>
                                <small>命中这些工具时，任务会先暂停，等你在前台批准后再继续。</small>
                            </div>
                        </div>
                    </article>

                    <article className="firefly-control-plane-section">
                        <div className="firefly-control-plane-section-head">
                            <div>
                                <span className="firefly-control-plane-section-kicker">Memory</span>
                                <h3>记忆面板</h3>
                            </div>
                            <div className="firefly-control-plane-section-actions">
                                <button
                                    type="button"
                                    className="firefly-control-plane-action-btn"
                                    disabled={pending || !effectiveTask?.id}
                                    onClick={() => mutateControlPlane('memory_remember_task', {
                                        taskId: effectiveTask?.id,
                                        defaultPriorityBand: controlPlanePrefs?.memory?.defaultPriorityBand || 'standard',
                                    })}
                                >
                                    {pendingAction === 'memory_remember_task' ? '记忆中…' : '记住当前任务'}
                                </button>
                                <button
                                    type="button"
                                    className="firefly-control-plane-action-btn subtle"
                                    disabled={pending}
                                    onClick={() => mutateControlPlane('memory_summarize', {
                                        title: effectiveTask?.title
                                            ? `线程摘要：${effectiveTask.title}`
                                            : '线程记忆压缩摘要',
                                    })}
                                >
                                    {pendingAction === 'memory_summarize' ? '压缩中…' : '压缩记忆'}
                                </button>
                            </div>
                        </div>
                        <div className="firefly-control-plane-metrics">
                            <span>{panelState.memory?.metrics?.compressed || 0} 条压缩记忆</span>
                            <span>{panelState.memory?.metrics?.raw || 0} 条原始记忆</span>
                            {(panelState.memory?.metrics?.types || []).slice(0, 2).map((item) => (
                                <span key={item.id}>{formatMemoryType(item.id)} {item.count}</span>
                            ))}
                        </div>
                        <div className="firefly-control-plane-list">
                            {visibleMemoryEntries.length > 0 ? visibleMemoryEntries.map((item) => (
                                <article
                                    key={item.id}
                                    className={`firefly-control-plane-card memory ${item.memoryLayer === 'compressed' ? 'compressed' : ''}`}
                                >
                                    <div className="firefly-control-plane-card-top">
                                        <div>
                                            <strong>{item.title}</strong>
                                            <p>{truncate(item.summary || item.detail || '暂无摘要', 108)}</p>
                                        </div>
                                        <button
                                            type="button"
                                            className="firefly-control-plane-inline-btn danger"
                                            disabled={pending}
                                            onClick={() => {
                                                if (!window.confirm('确认移除这条记忆吗？')) {
                                                    return;
                                                }

                                                mutateControlPlane('memory_delete', {
                                                    memoryId: item.id,
                                                });
                                            }}
                                        >
                                            移除
                                        </button>
                                    </div>
                                    <div className="firefly-control-plane-tags">
                                        <span>{formatMemoryType(item.memoryType)}</span>
                                        <span>{formatMemoryLayer(item.memoryLayer)}</span>
                                        <span>{formatPriorityBand(item.priorityBand)}</span>
                                        <span>{formatRetentionPolicy(item.retentionPolicy)}</span>
                                        {item.frozen ? <span>已冻结</span> : null}
                                        {item.crossThreadPinned ? <span>跨线程固定</span> : null}
                                        <span>{formatRelativeTime(item.updatedAt)}</span>
                                    </div>
                                    <div className="firefly-control-plane-card-governance">
                                        <label>
                                            <span>优先级</span>
                                            <select
                                                value={String(item.priorityBand || 'standard')}
                                                disabled={pending}
                                                onChange={(event) => mutateControlPlane('memory_update', {
                                                    memoryId: item.id,
                                                    priorityBand: event.target.value,
                                                    retentionPolicy: item.retentionPolicy || 'rolling',
                                                    visibility: item.visibility || 'runtime',
                                                })}
                                            >
                                                <option value="working">工作中</option>
                                                <option value="standard">标准</option>
                                                <option value="high">高优先</option>
                                                <option value="critical">关键</option>
                                            </select>
                                        </label>
                                        <label>
                                            <span>保留策略</span>
                                            <select
                                                value={String(item.retentionPolicy || 'rolling')}
                                                disabled={pending}
                                                onChange={(event) => mutateControlPlane('memory_update', {
                                                    memoryId: item.id,
                                                    priorityBand: item.priorityBand || 'standard',
                                                    retentionPolicy: event.target.value,
                                                    visibility: item.visibility || 'runtime',
                                                })}
                                            >
                                                <option value="rolling">滚动保留</option>
                                                <option value="compressed_rollup">压缩汇总</option>
                                                <option value="session_only">仅当前周期</option>
                                            </select>
                                        </label>
                                        <button
                                            type="button"
                                            className={`firefly-control-plane-inline-btn ${item.frozen ? 'accent' : ''}`}
                                            disabled={pending}
                                            onClick={() => mutateControlPlane('memory_update', {
                                                memoryId: item.id,
                                                priorityBand: item.priorityBand || 'standard',
                                                retentionPolicy: item.retentionPolicy || 'rolling',
                                                visibility: item.visibility || 'runtime',
                                                note: noteDrafts[item.id] || '',
                                                frozen: !item.frozen,
                                                crossThreadPinned: item.crossThreadPinned || false,
                                            })}
                                        >
                                            {item.frozen ? '取消冻结' : '冻结'}
                                        </button>
                                        <button
                                            type="button"
                                            className={`firefly-control-plane-inline-btn ${item.crossThreadPinned ? 'accent' : ''}`}
                                            disabled={pending}
                                            onClick={() => mutateControlPlane('memory_update', {
                                                memoryId: item.id,
                                                priorityBand: item.priorityBand || 'standard',
                                                retentionPolicy: item.retentionPolicy || 'rolling',
                                                visibility: item.visibility || 'runtime',
                                                note: noteDrafts[item.id] || '',
                                                frozen: item.frozen || false,
                                                crossThreadPinned: !item.crossThreadPinned,
                                            })}
                                        >
                                            {item.crossThreadPinned ? '取消跨线程固定' : '跨线程固定'}
                                        </button>
                                    </div>
                                    <div className="firefly-control-plane-note-box">
                                        <textarea
                                            value={noteDrafts[item.id] || ''}
                                            disabled={pending}
                                            onChange={(event) => setNoteDrafts((current) => ({
                                                ...current,
                                                [item.id]: event.target.value,
                                            }))}
                                            placeholder="给这条记忆补一条治理备注，方便后续规划时复用。"
                                        />
                                        <button
                                            type="button"
                                            className="firefly-control-plane-inline-btn"
                                            disabled={pending}
                                            onClick={() => mutateControlPlane('memory_update', {
                                                memoryId: item.id,
                                                priorityBand: item.priorityBand || 'standard',
                                                retentionPolicy: item.retentionPolicy || 'rolling',
                                                visibility: item.visibility || 'runtime',
                                                note: noteDrafts[item.id] || '',
                                                frozen: item.frozen || false,
                                                crossThreadPinned: item.crossThreadPinned || false,
                                            })}
                                        >
                                            保存备注
                                        </button>
                                    </div>
                                    {item.detail ? (
                                        <small>{truncate(item.detail, 132)}</small>
                                    ) : null}
                                </article>
                            )) : (
                                <div className="firefly-control-plane-empty">
                                    当前线程还没有沉淀出可管理的记忆。先跑一轮任务，再回来压缩和治理会更直观。
                                </div>
                            )}
                        </div>
                    </article>

                    <article className="firefly-control-plane-section">
                        <div className="firefly-control-plane-section-head">
                            <div>
                                <span className="firefly-control-plane-section-kicker">Toolbelt</span>
                                <h3>工具箱面板</h3>
                            </div>
                            <div className="firefly-control-plane-section-actions">
                                {effectiveTask?.title ? (
                                    <span className="firefly-control-plane-task-pill">
                                        当前任务：{truncate(effectiveTask.title, 24)}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                        <div className="firefly-control-plane-metrics">
                            <span>{panelState.toolbelt?.strategy?.pinnedCount || 0} 个固定</span>
                            <span>{panelState.toolbelt?.strategy?.leasedCount || 0} 个临时</span>
                            <span>{panelState.toolbelt?.strategy?.learnedCount || 0} 个已学习</span>
                            <span>{blockedToolIds.length} 个已屏蔽</span>
                            <span>{confirmBeforeUseToolIds.length} 个使用前确认</span>
                        </div>
                        <div className="firefly-control-plane-list">
                            {visibleToolCatalog.length > 0 ? visibleToolCatalog.map((tool) => {
                                const toolState = toolbeltMap.get(tool.id) || null;
                                const blocked = blockedToolSet.has(tool.id);
                                return (
                                    <article
                                        key={tool.id}
                                        className={`firefly-control-plane-card tool ${toolState?.pinned ? 'pinned' : ''} ${toolState?.leased ? 'leased' : ''} ${blocked ? 'blocked' : ''}`}
                                    >
                                        <div className="firefly-control-plane-card-top">
                                            <div>
                                                <strong>{tool.name || tool.id}</strong>
                                                <p>{truncate(tool.description || '当前未补充说明。', 108)}</p>
                                            </div>
                                            <div className="firefly-control-plane-tags compact">
                                                <span>{formatSourceKind(tool.sourceKind)}</span>
                                                {toolState?.pinned ? <span>已固定</span> : null}
                                                {toolState?.leased ? <span>临时启用</span> : null}
                                                {blocked ? <span>已屏蔽</span> : null}
                                                {confirmBeforeUseSet.has(tool.id) ? <span>使用前确认</span> : null}
                                            </div>
                                        </div>
                                        <div className="firefly-control-plane-card-meta">
                                            <small>{tool.id}</small>
                                            {toolState?.lastSummary ? (
                                                <small>{truncate(toolState.lastSummary, 96)}</small>
                                            ) : (
                                                <small>尚未形成最近结果摘要。</small>
                                            )}
                                        </div>
                                        <div className="firefly-control-plane-card-actions">
                                            <button
                                                type="button"
                                                className="firefly-control-plane-inline-btn"
                                                disabled={pending || blocked}
                                                onClick={() => mutateControlPlane(
                                                    toolState?.pinned ? 'tool_unpin' : 'tool_pin',
                                                    {
                                                        toolId: tool.id,
                                                        label: tool.name || tool.id,
                                                    }
                                                )}
                                            >
                                                {pendingAction === 'tool_pin' || pendingAction === 'tool_unpin'
                                                    ? '处理中…'
                                                    : toolState?.pinned ? '取消固定' : '固定到工具箱'}
                                            </button>
                                            <button
                                                type="button"
                                                className="firefly-control-plane-inline-btn accent"
                                                disabled={pending || blocked}
                                                onClick={() => mutateControlPlane(
                                                    toolState?.leased ? 'tool_revoke' : 'tool_lease',
                                                    {
                                                        toolId: tool.id,
                                                        label: tool.name || tool.id,
                                                        leaseReason: effectiveTask?.title || 'frontstage_control_plane',
                                                    }
                                                )}
                                            >
                                                {pendingAction === 'tool_lease' || pendingAction === 'tool_revoke'
                                                    ? '处理中…'
                                                    : toolState?.leased ? '撤销临时启用' : '临时启用'}
                                            </button>
                                            <button
                                                type="button"
                                                className={`firefly-control-plane-inline-btn ${blocked ? 'accent' : 'danger'}`}
                                                disabled={pending}
                                                onClick={() => mutateControlPlane(
                                                    blocked ? 'tool_unblock' : 'tool_block',
                                                    {
                                                        toolId: tool.id,
                                                    }
                                                )}
                                            >
                                                {pendingAction === 'tool_block' || pendingAction === 'tool_unblock'
                                                    ? '处理中…'
                                                    : blocked ? '恢复工具' : '屏蔽工具'}
                                            </button>
                                            <button
                                                type="button"
                                                className={`firefly-control-plane-inline-btn ${confirmBeforeUseSet.has(tool.id) ? 'accent' : ''}`}
                                                disabled={pending}
                                                onClick={() => mutateControlPlane(
                                                    confirmBeforeUseSet.has(tool.id) ? 'tool_skip_confirm' : 'tool_require_confirm',
                                                    {
                                                        toolId: tool.id,
                                                    }
                                                )}
                                            >
                                                {pendingAction === 'tool_require_confirm' || pendingAction === 'tool_skip_confirm'
                                                    ? '处理中…'
                                                    : confirmBeforeUseSet.has(tool.id) ? '取消确认' : '使用前确认'}
                                            </button>
                                        </div>
                                    </article>
                                );
                            }) : (
                                <div className="firefly-control-plane-empty">
                                    当前没有可显示的工具目录。请先检查前台能力接入、Skill / MCP 安装状态或运行时配置。
                                </div>
                            )}
                        </div>
                    </article>

                    <article className="firefly-control-plane-section">
                        <div className="firefly-control-plane-section-head">
                            <div>
                                <span className="firefly-control-plane-section-kicker">Governance Log</span>
                                <h3>最近治理动作</h3>
                            </div>
                            <div className="firefly-control-plane-section-actions">
                                <span className="firefly-control-plane-task-pill">{governanceEvents.length} 条</span>
                            </div>
                        </div>
                        <div className="firefly-control-plane-list">
                            {governanceEvents.length > 0 ? governanceEvents.map((item) => (
                                <article key={item.id} className="firefly-control-plane-card">
                                    <div className="firefly-control-plane-card-top">
                                        <div>
                                            <strong>{item.label || '前台治理动作'}</strong>
                                            <p>{truncate(item.detail || '当前没有补充说明。', 108)}</p>
                                        </div>
                                    </div>
                                    <div className="firefly-control-plane-tags">
                                        <span>{formatGovernanceKind(item.kind)}</span>
                                        <span>{item.scope === 'thread' ? '线程级' : '用户级'}</span>
                                        <span>{formatRelativeTime(item.createdAt)}</span>
                                    </div>
                                    <small>{describeGovernanceImpact(item)}</small>
                                    <div className="firefly-control-plane-card-actions">
                                        {item.availableActions?.replay?.action ? (
                                            <button
                                                type="button"
                                                className="firefly-control-plane-inline-btn"
                                                disabled={pending}
                                                onClick={() => mutateControlPlane('governance_replay', {
                                                    instruction: item.availableActions.replay,
                                                })}
                                            >
                                                {pendingAction === 'governance_replay' ? '处理中…' : (item.availableActions.replay.label || '再次应用')}
                                            </button>
                                        ) : null}
                                        {item.availableActions?.rollback?.action ? (
                                            <button
                                                type="button"
                                                className="firefly-control-plane-inline-btn danger"
                                                disabled={pending}
                                                onClick={() => mutateControlPlane('governance_rollback', {
                                                    instruction: item.availableActions.rollback,
                                                })}
                                            >
                                                {pendingAction === 'governance_rollback' ? '处理中…' : (item.availableActions.rollback.label || '回滚')}
                                            </button>
                                        ) : null}
                                    </div>
                                </article>
                            )) : (
                                <div className="firefly-control-plane-empty">
                                    你还没有在前台做过治理动作。后续固定工具、冻结记忆、切换策略后，这里会形成可回看的治理轨迹。
                                </div>
                            )}
                        </div>
                    </article>

                    <article className="firefly-control-plane-section">
                        <div className="firefly-control-plane-section-head">
                            <div>
                                <span className="firefly-control-plane-section-kicker">Manual Memory</span>
                                <h3>手动写入记忆</h3>
                            </div>
                            <div className="firefly-control-plane-section-actions">
                                <span className="firefly-control-plane-task-pill">前台直写</span>
                            </div>
                        </div>
                        <div className="firefly-control-plane-manual-grid">
                            <label className="firefly-control-plane-policy-card">
                                <span>记忆标题</span>
                                <input
                                    value={manualMemoryDraft.title}
                                    disabled={pending}
                                    onChange={(event) => setManualMemoryDraft((current) => ({
                                        ...current,
                                        title: event.target.value,
                                    }))}
                                    placeholder="例如：用户偏好更喜欢简洁回答"
                                />
                            </label>
                            <label className="firefly-control-plane-policy-card">
                                <span>记忆摘要</span>
                                <input
                                    value={manualMemoryDraft.summary}
                                    disabled={pending}
                                    onChange={(event) => setManualMemoryDraft((current) => ({
                                        ...current,
                                        summary: event.target.value,
                                    }))}
                                    placeholder="下一轮规划时最想让 agent 记住的点"
                                />
                            </label>
                            <label className="firefly-control-plane-policy-card">
                                <span>记忆类型</span>
                                <select
                                    value={manualMemoryDraft.memoryType}
                                    disabled={pending}
                                    onChange={(event) => setManualMemoryDraft((current) => ({
                                        ...current,
                                        memoryType: event.target.value,
                                    }))}
                                >
                                    <option value="user_preference">用户偏好</option>
                                    <option value="workflow_hint">流程线索</option>
                                    <option value="task_result">任务结果</option>
                                    <option value="reading_context">阅读上下文</option>
                                </select>
                            </label>
                            <label className="firefly-control-plane-policy-card">
                                <span>优先级</span>
                                <select
                                    value={manualMemoryDraft.priorityBand}
                                    disabled={pending}
                                    onChange={(event) => setManualMemoryDraft((current) => ({
                                        ...current,
                                        priorityBand: event.target.value,
                                    }))}
                                >
                                    <option value="working">工作中</option>
                                    <option value="standard">标准</option>
                                    <option value="high">高优先</option>
                                    <option value="critical">关键</option>
                                </select>
                            </label>
                        </div>
                        <div className="firefly-control-plane-note-box">
                            <textarea
                                value={manualMemoryDraft.detail}
                                disabled={pending}
                                onChange={(event) => setManualMemoryDraft((current) => ({
                                    ...current,
                                    detail: event.target.value,
                                }))}
                                placeholder="补充细节、约束或背景。比如：问候只简单回应，不要主动介绍全部能力。"
                            />
                            <div className="firefly-control-plane-card-actions">
                                <label className="firefly-control-plane-checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={manualMemoryDraft.crossThreadPinned}
                                        disabled={pending}
                                        onChange={(event) => setManualMemoryDraft((current) => ({
                                            ...current,
                                            crossThreadPinned: event.target.checked,
                                        }))}
                                    />
                                    <span>跨线程固定</span>
                                </label>
                                <button
                                    type="button"
                                    className="firefly-control-plane-action-btn"
                                    disabled={pending || !manualMemoryDraft.title.trim() || !manualMemoryDraft.summary.trim()}
                                    onClick={async () => {
                                        await mutateControlPlane('memory_create', {
                                            taskId: effectiveTask?.id || '',
                                            title: manualMemoryDraft.title.trim(),
                                            summary: manualMemoryDraft.summary.trim(),
                                            detail: manualMemoryDraft.detail.trim(),
                                            memoryType: manualMemoryDraft.memoryType,
                                            priorityBand: manualMemoryDraft.priorityBand,
                                            retentionPolicy: manualMemoryDraft.retentionPolicy,
                                            crossThreadPinned: manualMemoryDraft.crossThreadPinned,
                                        });
                                        setManualMemoryDraft({
                                            title: '',
                                            summary: '',
                                            detail: '',
                                            memoryType: 'user_preference',
                                            priorityBand: 'standard',
                                            retentionPolicy: 'rolling',
                                            crossThreadPinned: false,
                                        });
                                    }}
                                >
                                    {pendingAction === 'memory_create' ? '写入中…' : '写入这条记忆'}
                                </button>
                            </div>
                        </div>
                    </article>
                </div>
            ) : null}
        </section>
    );
}
