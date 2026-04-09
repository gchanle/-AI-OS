'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    buildAdminWorkspaceBootstrap,
    loadAdminConsoleSettings,
    saveAdminConsoleSettings,
} from '@/data/adminConsole';
import { campusCapabilities, chatModelOptions } from '@/data/workspace';
import './SchoolConsolePanel.css';

function cloneSettings(settings) {
    return JSON.parse(JSON.stringify(settings));
}

function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function SchoolConsolePanel() {
    const [settings, setSettings] = useState(() => cloneSettings(loadAdminConsoleSettings()));
    const [savedAt, setSavedAt] = useState('');

    useEffect(() => {
        setSettings(cloneSettings(loadAdminConsoleSettings()));
    }, []);

    const bootstrap = useMemo(() => buildAdminWorkspaceBootstrap(settings), [settings]);
    const capabilityModuleMap = useMemo(
        () => Object.fromEntries(campusCapabilities.map((item) => [item.id, item.name])),
        []
    );
    const adminStats = useMemo(() => ([
        {
            label: '已启用模块',
            value: settings.moduleAccess.filter((item) => item.enabled).length,
            hint: '学校层级可见的业务入口',
        },
        {
            label: '知识源',
            value: settings.knowledgeSources.filter((item) => item.status === 'enabled').length,
            hint: '已发布的学校知识源',
        },
        {
            label: '流程规范',
            value: settings.processRules.filter((item) => item.status === 'enabled').length,
            hint: '正在生效的流程规则',
        },
        {
            label: '默认能力',
            value: bootstrap.capabilityIds.length,
            hint: '用户首次打开萤火虫默认接入',
        },
    ]), [bootstrap.capabilityIds.length, settings.knowledgeSources, settings.moduleAccess, settings.processRules]);

    const updateSchoolProfile = (key, value) => {
        setSettings((prev) => ({
            ...prev,
            schoolProfile: {
                ...prev.schoolProfile,
                [key]: value,
            },
        }));
    };

    const toggleModule = (moduleId) => {
        setSettings((prev) => ({
            ...prev,
            moduleAccess: prev.moduleAccess.map((item) => (
                item.moduleId === moduleId
                    ? { ...item, enabled: !item.enabled }
                    : item
            )),
        }));
    };

    const updateFireflyDefault = (key, value) => {
        setSettings((prev) => ({
            ...prev,
            defaultFirefly: {
                ...prev.defaultFirefly,
                [key]: value,
            },
        }));
    };

    const toggleDefaultCapability = (capabilityId) => {
        setSettings((prev) => {
            const current = new Set(prev.defaultFirefly.capabilityIds);
            if (current.has(capabilityId)) {
                current.delete(capabilityId);
            } else {
                current.add(capabilityId);
            }

            return {
                ...prev,
                defaultFirefly: {
                    ...prev.defaultFirefly,
                    capabilityIds: Array.from(current),
                },
            };
        });
    };

    const updateListItem = (listKey, id, key, value) => {
        setSettings((prev) => ({
            ...prev,
            [listKey]: prev[listKey].map((item) => (
                item.id === id
                    ? { ...item, [key]: value }
                    : item
            )),
        }));
    };

    const addListItem = (listKey, template) => {
        setSettings((prev) => ({
            ...prev,
            [listKey]: [
                ...prev[listKey],
                {
                    ...template,
                    id: uid(listKey),
                },
            ],
        }));
    };

    const removeListItem = (listKey, id) => {
        setSettings((prev) => ({
            ...prev,
            [listKey]: prev[listKey].filter((item) => item.id !== id),
        }));
    };

    const updateRolePolicy = (id, key, value) => {
        setSettings((prev) => ({
            ...prev,
            rolePolicies: prev.rolePolicies.map((item) => (
                item.id === id
                    ? { ...item, [key]: value }
                    : item
            )),
        }));
    };

    const toggleRoleCapability = (roleId, capabilityId) => {
        setSettings((prev) => ({
            ...prev,
            rolePolicies: prev.rolePolicies.map((item) => {
                if (item.id !== roleId) {
                    return item;
                }

                const current = new Set(item.defaultCapabilities || []);
                if (current.has(capabilityId)) {
                    current.delete(capabilityId);
                } else {
                    current.add(capabilityId);
                }

                return {
                    ...item,
                    defaultCapabilities: Array.from(current),
                };
            }),
        }));
    };

    const handleSave = () => {
        const saved = saveAdminConsoleSettings(settings);
        setSettings(cloneSettings(saved));
        setSavedAt(new Date().toLocaleString('zh-CN'));
    };

    return (
        <div className="school-console">
            <section className="school-console-hero glass-strong">
                <div>
                    <span className="school-console-kicker">School Policy</span>
                    <h2>学校策略与默认能力</h2>
                    <p>这里处理的是学校级策略，不是单个老师的个人偏好。它决定用户端能看到什么、默认能用什么，以及后续知识库和规范怎么统一接入。</p>
                </div>
                <button type="button" className="school-console-save" onClick={handleSave}>
                    {savedAt ? `已保存 ${savedAt}` : '保存学校配置'}
                </button>
            </section>

            <section className="school-console-overview">
                {adminStats.map((item) => (
                    <article key={item.label} className="school-console-stat glass">
                        <small>{item.label}</small>
                        <strong>{item.value}</strong>
                        <span>{item.hint}</span>
                    </article>
                ))}
            </section>

            <section className="school-console-grid school-console-grid-two">
                <article className="school-console-panel glass">
                    <div className="school-console-head">
                        <h3>学校信息</h3>
                        <small>用于学校级展示与配置归属</small>
                    </div>
                    <div className="school-console-form">
                        <label className="school-console-field">
                            <span>学校名称</span>
                            <input value={settings.schoolProfile.name} onChange={(event) => updateSchoolProfile('name', event.target.value)} />
                        </label>
                        <label className="school-console-field">
                            <span>学校编码</span>
                            <input value={settings.schoolProfile.code} onChange={(event) => updateSchoolProfile('code', event.target.value)} />
                        </label>
                        <label className="school-console-field">
                            <span>归口部门</span>
                            <input value={settings.schoolProfile.owner} onChange={(event) => updateSchoolProfile('owner', event.target.value)} />
                        </label>
                        <label className="school-console-field">
                            <span>发布通道</span>
                            <input value={settings.schoolProfile.releaseChannel} onChange={(event) => updateSchoolProfile('releaseChannel', event.target.value)} />
                        </label>
                    </div>
                </article>

                <article className="school-console-panel glass">
                    <div className="school-console-head">
                        <h3>学校级能力启停</h3>
                        <small>关闭后，用户端不展示对应模块入口</small>
                    </div>
                    <div className="school-console-toggle-list">
                        {settings.moduleAccess.map((item) => (
                            <button key={item.moduleId} type="button" className={`school-console-toggle-card ${item.enabled ? 'active' : ''}`} onClick={() => toggleModule(item.moduleId)}>
                                <div>
                                    <strong>{item.label}</strong>
                                    <small>{item.moduleId}</small>
                                </div>
                                <span>{item.enabled ? '已开启' : '已关闭'}</span>
                            </button>
                        ))}
                    </div>
                </article>
            </section>

            <section className="school-console-grid school-console-grid-two">
                <article className="school-console-panel glass">
                    <div className="school-console-head">
                        <h3>知识源配置</h3>
                        <small>后续接学校知识库、学院资料库和课程知识库</small>
                    </div>
                    <div className="school-console-stack">
                        {settings.knowledgeSources.map((item) => (
                            <div key={item.id} className="school-console-card">
                                <div className="school-console-row">
                                    <input value={item.name} onChange={(event) => updateListItem('knowledgeSources', item.id, 'name', event.target.value)} />
                                    <select value={item.status} onChange={(event) => updateListItem('knowledgeSources', item.id, 'status', event.target.value)}>
                                        <option value="enabled">启用</option>
                                        <option value="draft">草稿</option>
                                        <option value="paused">暂停</option>
                                    </select>
                                </div>
                                <div className="school-console-row">
                                    <input value={item.scope} onChange={(event) => updateListItem('knowledgeSources', item.id, 'scope', event.target.value)} />
                                    <button type="button" className="school-console-danger" onClick={() => removeListItem('knowledgeSources', item.id)}>删除</button>
                                </div>
                                <textarea rows={2} value={item.summary} onChange={(event) => updateListItem('knowledgeSources', item.id, 'summary', event.target.value)} />
                            </div>
                        ))}
                        <button type="button" className="school-console-inline" onClick={() => addListItem('knowledgeSources', {
                            name: '新的学校知识源',
                            scope: '全校',
                            status: 'draft',
                            summary: '用于描述这个知识源将服务哪类问答与工作流。',
                        })}>新增知识源</button>
                    </div>
                </article>

                <article className="school-console-panel glass">
                    <div className="school-console-head">
                        <h3>流程规范配置</h3>
                        <small>用于沉淀学校办事、审批、教学与阅读流程规范</small>
                    </div>
                    <div className="school-console-stack">
                        {settings.processRules.map((item) => (
                            <div key={item.id} className="school-console-card">
                                <div className="school-console-row">
                                    <input value={item.name} onChange={(event) => updateListItem('processRules', item.id, 'name', event.target.value)} />
                                    <select value={item.status} onChange={(event) => updateListItem('processRules', item.id, 'status', event.target.value)}>
                                        <option value="enabled">启用</option>
                                        <option value="draft">草稿</option>
                                        <option value="paused">暂停</option>
                                    </select>
                                </div>
                                <div className="school-console-row">
                                    <input value={item.scope} onChange={(event) => updateListItem('processRules', item.id, 'scope', event.target.value)} />
                                    <button type="button" className="school-console-danger" onClick={() => removeListItem('processRules', item.id)}>删除</button>
                                </div>
                                <textarea rows={2} value={item.summary} onChange={(event) => updateListItem('processRules', item.id, 'summary', event.target.value)} />
                            </div>
                        ))}
                        <button type="button" className="school-console-inline" onClick={() => addListItem('processRules', {
                            name: '新的流程规范',
                            scope: '全校',
                            status: 'draft',
                            summary: '用于描述这个流程规范将约束或引导哪类校园业务流程。',
                        })}>新增流程规范</button>
                    </div>
                </article>
            </section>

            <section className="school-console-grid school-console-grid-two">
                <article className="school-console-panel glass">
                    <div className="school-console-head">
                        <h3>萤火虫默认打开方式</h3>
                        <small>决定用户首次进入时默认可用的能力与开关</small>
                    </div>
                    <div className="school-console-form">
                        <label className="school-console-field">
                            <span>默认模型</span>
                            <select value={settings.defaultFirefly.modelId} onChange={(event) => updateFireflyDefault('modelId', event.target.value)}>
                                {chatModelOptions.map((item) => (
                                    <option key={item.id} value={item.id}>{item.label}</option>
                                ))}
                            </select>
                        </label>
                        <div className="school-console-field">
                            <span>默认接入能力</span>
                            <div className="school-console-pill-grid">
                                {bootstrap.enabledCapabilityIds.map((capabilityId) => (
                                    <button
                                        key={capabilityId}
                                        type="button"
                                        className={`school-console-pill ${settings.defaultFirefly.capabilityIds.includes(capabilityId) ? 'active' : ''}`}
                                        onClick={() => toggleDefaultCapability(capabilityId)}
                                    >
                                        {capabilityModuleMap[capabilityId] || capabilityId}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="school-console-switch-grid">
                            <button type="button" className={`school-console-switch ${settings.defaultFirefly.webSearchEnabled ? 'active' : ''}`} onClick={() => updateFireflyDefault('webSearchEnabled', !settings.defaultFirefly.webSearchEnabled)}>
                                <strong>联网搜索</strong>
                                <span>{settings.defaultFirefly.webSearchEnabled ? '默认开启' : '默认关闭'}</span>
                            </button>
                            <button type="button" className={`school-console-switch ${settings.defaultFirefly.deepResearchEnabled ? 'active' : ''}`} onClick={() => updateFireflyDefault('deepResearchEnabled', !settings.defaultFirefly.deepResearchEnabled)}>
                                <strong>深度研究</strong>
                                <span>{settings.defaultFirefly.deepResearchEnabled ? '默认开启' : '默认关闭'}</span>
                            </button>
                            <button type="button" className={`school-console-switch ${settings.defaultFirefly.enabledToolTrace ? 'active' : ''}`} onClick={() => updateFireflyDefault('enabledToolTrace', !settings.defaultFirefly.enabledToolTrace)}>
                                <strong>工具过程显示</strong>
                                <span>{settings.defaultFirefly.enabledToolTrace ? '允许显示' : '默认隐藏'}</span>
                            </button>
                            <button type="button" className={`school-console-switch ${settings.defaultFirefly.allowExternalConnectors ? 'active' : ''}`} onClick={() => updateFireflyDefault('allowExternalConnectors', !settings.defaultFirefly.allowExternalConnectors)}>
                                <strong>外部系统接入</strong>
                                <span>{settings.defaultFirefly.allowExternalConnectors ? '允许' : '关闭'}</span>
                            </button>
                        </div>
                    </div>
                </article>

                <article className="school-console-panel glass">
                    <div className="school-console-head">
                        <h3>角色策略</h3>
                        <small>同样的 Agent 能力，不同角色看到的入口与默认能力不同</small>
                    </div>
                    <div className="school-console-stack">
                        {settings.rolePolicies.map((item) => (
                            <div key={item.id} className="school-console-card">
                                <div className="school-console-row">
                                    <div className="school-console-role-copy">
                                        <strong>{item.label}</strong>
                                        <small>{item.id}</small>
                                    </div>
                                    <span className={`school-console-role-badge ${item.visibleAdminEntry ? 'active' : ''}`}>
                                        {item.visibleAdminEntry ? '可见管理端' : '仅用户端'}
                                    </span>
                                </div>
                                <div className="school-console-row">
                                    <button type="button" className={`school-console-inline ${item.visibleAdminEntry ? 'active' : ''}`} onClick={() => updateRolePolicy(item.id, 'visibleAdminEntry', !item.visibleAdminEntry)}>
                                        管理端入口
                                    </button>
                                    <button type="button" className={`school-console-inline ${item.canUseResearch ? 'active' : ''}`} onClick={() => updateRolePolicy(item.id, 'canUseResearch', !item.canUseResearch)}>
                                        AI 科研权限
                                    </button>
                                </div>
                                <div className="school-console-role-editor">
                                    <span>默认打开能力</span>
                                    <div className="school-console-pill-grid">
                                        {bootstrap.enabledCapabilityIds.map((capabilityId) => (
                                            <button
                                                key={`${item.id}-${capabilityId}`}
                                                type="button"
                                                disabled={capabilityId === 'research' && !item.canUseResearch}
                                                className={`school-console-pill ${item.defaultCapabilities.includes(capabilityId) ? 'active' : ''}`}
                                                onClick={() => toggleRoleCapability(item.id, capabilityId)}
                                            >
                                                {capabilityModuleMap[capabilityId] || capabilityId}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </article>
            </section>
        </div>
    );
}
