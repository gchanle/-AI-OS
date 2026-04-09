'use client';

import { useEffect, useMemo, useState } from 'react';
import { chatModelCandidates } from '@/data/workspace';
import './AdminAgentRuntimePanel.css';

function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}

const maturityToneMap = {
    ready: 'ready',
    partial: 'partial',
    gap: 'gap',
};

export default function AdminAgentRuntimePanel() {
    const [config, setConfig] = useState(null);
    const [maturity, setMaturity] = useState([]);
    const [tools, setTools] = useState([]);
    const [memoryStats, setMemoryStats] = useState(null);
    const [saving, setSaving] = useState(false);
    const [savedLabel, setSavedLabel] = useState('');

    useEffect(() => {
        let mounted = true;

        const loadAll = async () => {
            const [configRes, toolsRes] = await Promise.all([
                fetch('/api/admin/agent-runtime', { cache: 'no-store' }),
                fetch('/api/firefly/tools', { cache: 'no-store' }),
            ]);
            const configPayload = await configRes.json();
            const toolsPayload = await toolsRes.json();

            if (!mounted) {
                return;
            }

            if (configPayload?.ok) {
                setConfig(cloneValue(configPayload.config));
                setMaturity(Array.isArray(configPayload.maturity) ? configPayload.maturity : []);
                setMemoryStats(configPayload.memory || null);
            }
            if (toolsPayload?.ok) {
                setTools(Array.isArray(toolsPayload.tools) ? toolsPayload.tools : []);
            }
        };

        loadAll().catch((error) => {
            console.error('Failed to load admin agent runtime panel:', error);
        });

        return () => {
            mounted = false;
        };
    }, []);

    const toolsById = useMemo(
        () => Object.fromEntries(tools.map((item) => [item.id, item])),
        [tools]
    );

    const updateConfigSection = (section, key, value) => {
        setConfig((prev) => ({
            ...prev,
            [section]: {
                ...prev[section],
                [key]: value,
            },
        }));
    };

    const toggleEnabledModel = (modelId) => {
        setConfig((prev) => {
            const current = new Set(prev.models.enabledModelIds || []);
            if (current.has(modelId)) {
                current.delete(modelId);
            } else {
                current.add(modelId);
            }

            const nextEnabled = Array.from(current);
            return {
                ...prev,
                models: {
                    ...prev.models,
                    enabledModelIds: nextEnabled.length > 0 ? nextEnabled : [prev.models.primaryModelId],
                },
            };
        });
    };

    const toggleToolPolicy = (toolId) => {
        setConfig((prev) => ({
            ...prev,
            toolPolicies: {
                ...prev.toolPolicies,
                [toolId]: {
                    ...(prev.toolPolicies?.[toolId] || {}),
                    enabled: !prev.toolPolicies?.[toolId]?.enabled,
                },
            },
        }));
    };

    const handleSave = async () => {
        if (!config) {
            return;
        }

        setSaving(true);
        try {
            const response = await fetch('/api/admin/agent-runtime', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ config }),
            });
            const payload = await response.json();
            if (payload?.ok) {
                setConfig(cloneValue(payload.config));
                setMaturity(Array.isArray(payload.maturity) ? payload.maturity : []);
                setMemoryStats(payload.memory || null);
                setSavedLabel(`已保存 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
            }
        } catch (error) {
            console.error('Failed to save agent runtime config:', error);
        } finally {
            setSaving(false);
        }
    };

    if (!config) {
        return (
            <div className="admin-agent-panel glass">
                <p>正在加载 Agent Runtime 配置…</p>
            </div>
        );
    }

    return (
        <div className="admin-agent-workspace">
            <section className="admin-agent-hero glass-strong">
                <div>
                    <span className="admin-agent-kicker">Agent Runtime</span>
                    <h2>萤火虫 Agent 配置治理</h2>
                    <p>这部分才更接近 OpenClaw 的后台能力。它不面向学生和老师，而是面向学校后台去治理模型、工具、记忆、恢复和调度策略。</p>
                </div>
                <button type="button" className="admin-agent-save" onClick={handleSave} disabled={saving}>
                    {saving ? '保存中…' : savedLabel || '保存 Agent 配置'}
                </button>
            </section>

            <section className="admin-agent-grid two">
                <article className="admin-agent-panel glass">
                    <div className="admin-agent-head">
                        <h3>模型治理</h3>
                        <small>决定学校可用模型与默认路由</small>
                    </div>
                    <div className="admin-agent-form">
                        <label className="admin-agent-field">
                            <span>主对话模型</span>
                            <select value={config.models.primaryModelId} onChange={(event) => updateConfigSection('models', 'primaryModelId', event.target.value)}>
                                {chatModelCandidates.map((item) => (
                                    <option key={item.id} value={item.id}>{item.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="admin-agent-field">
                            <span>规划模型</span>
                            <select value={config.models.plannerModelId} onChange={(event) => updateConfigSection('models', 'plannerModelId', event.target.value)}>
                                {chatModelCandidates.map((item) => (
                                    <option key={item.id} value={item.id}>{item.label}</option>
                                ))}
                            </select>
                        </label>
                        <div className="admin-agent-field">
                            <span>学校可用模型</span>
                            <div className="admin-agent-pill-grid">
                                {chatModelCandidates.map((model) => (
                                    <button
                                        key={model.id}
                                        type="button"
                                        className={`admin-agent-pill ${config.models.enabledModelIds.includes(model.id) ? 'active' : ''}`}
                                        onClick={() => toggleEnabledModel(model.id)}
                                    >
                                        {model.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="admin-agent-switch-grid">
                            <button type="button" className={`admin-agent-switch ${config.models.allowUserModelSwitch ? 'active' : ''}`} onClick={() => updateConfigSection('models', 'allowUserModelSwitch', !config.models.allowUserModelSwitch)}>
                                <strong>允许前台切换模型</strong>
                                <span>{config.models.allowUserModelSwitch ? '已允许' : '已关闭'}</span>
                            </button>
                            <button type="button" className="admin-agent-switch active">
                                <strong>模型路由</strong>
                                <span>{config.models.routingMode === 'single_primary' ? '单主模型' : config.models.routingMode}</span>
                            </button>
                        </div>
                    </div>
                </article>

                <article className="admin-agent-panel glass">
                    <div className="admin-agent-head">
                        <h3>运行策略</h3>
                        <small>决定 planner 和 executor 如何工作</small>
                    </div>
                    <div className="admin-agent-form">
                        <label className="admin-agent-field">
                            <span>最大规划步数</span>
                            <input
                                type="number"
                                min="1"
                                max="8"
                                value={config.runtime.maxPlannerSteps}
                                onChange={(event) => updateConfigSection('runtime', 'maxPlannerSteps', Number(event.target.value))}
                            />
                        </label>
                        <label className="admin-agent-field">
                            <span>最大并发运行数</span>
                            <input
                                type="number"
                                min="1"
                                max="16"
                                value={config.runtime.maxConcurrentRuns}
                                onChange={(event) => updateConfigSection('runtime', 'maxConcurrentRuns', Number(event.target.value))}
                            />
                        </label>
                        <label className="admin-agent-field">
                            <span>并行工具上限</span>
                            <input
                                type="number"
                                min="1"
                                max="8"
                                value={config.runtime.maxParallelTools}
                                onChange={(event) => updateConfigSection('runtime', 'maxParallelTools', Number(event.target.value))}
                            />
                        </label>
                        <label className="admin-agent-field">
                            <span>子任务上限</span>
                            <input
                                type="number"
                                min="1"
                                max="12"
                                value={config.runtime.maxSubtasksPerRun}
                                onChange={(event) => updateConfigSection('runtime', 'maxSubtasksPerRun', Number(event.target.value))}
                            />
                        </label>
                        <div className="admin-agent-switch-grid">
                            <button type="button" className={`admin-agent-switch ${config.runtime.allowMultiStep ? 'active' : ''}`} onClick={() => updateConfigSection('runtime', 'allowMultiStep', !config.runtime.allowMultiStep)}>
                                <strong>允许多步规划</strong>
                                <span>{config.runtime.allowMultiStep ? '已开启' : '仅单步'}</span>
                            </button>
                            <button type="button" className={`admin-agent-switch ${config.runtime.allowPartialSuccess ? 'active' : ''}`} onClick={() => updateConfigSection('runtime', 'allowPartialSuccess', !config.runtime.allowPartialSuccess)}>
                                <strong>允许部分成功</strong>
                                <span>{config.runtime.allowPartialSuccess ? '已开启' : '失败即终止'}</span>
                            </button>
                            <button type="button" className={`admin-agent-switch ${config.runtime.allowParallelToolCalls ? 'active' : ''}`} onClick={() => updateConfigSection('runtime', 'allowParallelToolCalls', !config.runtime.allowParallelToolCalls)}>
                                <strong>允许并行工具执行</strong>
                                <span>{config.runtime.allowParallelToolCalls ? '已开启' : '串行执行'}</span>
                            </button>
                            <button type="button" className={`admin-agent-switch ${config.runtime.enableTaskDecomposition ? 'active' : ''}`} onClick={() => updateConfigSection('runtime', 'enableTaskDecomposition', !config.runtime.enableTaskDecomposition)}>
                                <strong>启用任务拆解</strong>
                                <span>{config.runtime.enableTaskDecomposition ? '已启用' : '直接执行'}</span>
                            </button>
                            <button type="button" className={`admin-agent-switch ${config.runtime.checkpointingEnabled ? 'active' : ''}`} onClick={() => updateConfigSection('runtime', 'checkpointingEnabled', !config.runtime.checkpointingEnabled)}>
                                <strong>启用运行检查点</strong>
                                <span>{config.runtime.checkpointingEnabled ? '已记录' : '不记录'}</span>
                            </button>
                        </div>
                    </div>
                </article>
            </section>

            <section className="admin-agent-grid two">
                <article className="admin-agent-panel glass">
                    <div className="admin-agent-head">
                        <h3>记忆与恢复</h3>
                        <small>这部分决定萤火虫能否更像长期工作的 agent</small>
                    </div>
                    <div className="admin-agent-switch-grid">
                        <button type="button" className={`admin-agent-switch ${config.memory.enabled ? 'active' : ''}`} onClick={() => updateConfigSection('memory', 'enabled', !config.memory.enabled)}>
                            <strong>长期记忆</strong>
                            <span>{config.memory.enabled ? '已开启' : '已关闭'}</span>
                        </button>
                        <button type="button" className={`admin-agent-switch ${config.recovery.enabled ? 'active' : ''}`} onClick={() => updateConfigSection('recovery', 'enabled', !config.recovery.enabled)}>
                            <strong>任务恢复</strong>
                            <span>{config.recovery.enabled ? '已开启' : '已关闭'}</span>
                        </button>
                        <button type="button" className={`admin-agent-switch ${config.memory.retainReadingMemory ? 'active' : ''}`} onClick={() => updateConfigSection('memory', 'retainReadingMemory', !config.memory.retainReadingMemory)}>
                            <strong>阅读记忆</strong>
                            <span>{config.memory.retainReadingMemory ? '保留' : '不保留'}</span>
                        </button>
                        <button type="button" className={`admin-agent-switch ${config.recovery.allowCrossWorkspaceHandoff ? 'active' : ''}`} onClick={() => updateConfigSection('recovery', 'allowCrossWorkspaceHandoff', !config.recovery.allowCrossWorkspaceHandoff)}>
                            <strong>跨工作面接力</strong>
                            <span>{config.recovery.allowCrossWorkspaceHandoff ? '允许' : '关闭'}</span>
                        </button>
                    </div>
                    <div className="admin-agent-form compact">
                        <label className="admin-agent-field">
                            <span>记忆上限</span>
                            <input type="number" min="20" max="300" value={config.memory.maxEntries} onChange={(event) => updateConfigSection('memory', 'maxEntries', Number(event.target.value))} />
                        </label>
                        <label className="admin-agent-field">
                            <span>注入 Top-K</span>
                            <input type="number" min="1" max="10" value={config.memory.injectTopK} onChange={(event) => updateConfigSection('memory', 'injectTopK', Number(event.target.value))} />
                        </label>
                    </div>
                    {memoryStats ? (
                        <div className="admin-agent-metrics">
                            <article className="admin-agent-metric-card">
                                <strong>{memoryStats.total}</strong>
                                <span>服务端记忆条目</span>
                            </article>
                            <article className="admin-agent-metric-card">
                                <strong>{Array.isArray(memoryStats.typed) ? memoryStats.typed.length : 0}</strong>
                                <span>记忆类型</span>
                            </article>
                            <article className="admin-agent-metric-card">
                                <strong>{memoryStats.recentTitles?.[0] || '暂无'}</strong>
                                <span>最近写入</span>
                            </article>
                        </div>
                    ) : null}
                </article>

                <article className="admin-agent-panel glass">
                    <div className="admin-agent-head">
                        <h3>工具治理</h3>
                        <small>决定哪些工具能被 planner 真正命中</small>
                    </div>
                    <div className="admin-agent-tool-list">
                        {Object.entries(config.toolPolicies || {}).map(([toolId, policy]) => {
                            const tool = toolsById[toolId];
                            return (
                                <button key={toolId} type="button" className={`admin-agent-tool-card ${policy.enabled ? 'active' : ''}`} onClick={() => toggleToolPolicy(toolId)}>
                                    <div>
                                        <strong>{tool?.name || toolId}</strong>
                                        <small>{tool?.capabilityId || 'tool'} · {policy.exposure}</small>
                                    </div>
                                    <span>{policy.enabled ? '已开放' : '已停用'}</span>
                                </button>
                            );
                        })}
                    </div>
                </article>
            </section>

            <section className="admin-agent-panel glass">
                <div className="admin-agent-head">
                    <h3>对标 OpenClaw 的剩余差距</h3>
                    <small>不是为了照搬界面，而是对齐 agent 能力成熟度</small>
                </div>
                <div className="admin-agent-maturity-list">
                    {maturity.map((item) => (
                        <article key={item.id} className={`admin-agent-maturity-card ${maturityToneMap[item.current] || 'partial'}`}>
                            <div className="admin-agent-maturity-head">
                                <strong>{item.label}</strong>
                                <span>{item.currentLabel}</span>
                            </div>
                            <p>{item.gap}</p>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}
