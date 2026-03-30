'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    buildDefaultConnectorRuntime,
    buildDefaultVaultItems,
    buildConnectorDefinitions,
    buildConnectorSummary,
    buildConnectorViews,
    loadConnectorDefinitionState,
    loadConnectorRuntime,
    loadConnectorVault,
} from '@/data/connectors';
import {
    accessMethodMap,
} from '@/data/capabilityAccess';
import {
    buildDefaultCliRuntime,
    buildCliDefinitions,
    buildCliSummary,
    buildCliViews,
    loadCliDefinitionState,
    loadCliRuntime,
} from '@/data/cli';
import {
    buildDefaultMcpRuntime,
    buildMcpDefinitions,
    buildMcpSummary,
    buildMcpViews,
    loadMcpDefinitionState,
    loadMcpRuntime,
} from '@/data/mcp';
import {
    buildSkillDefinitions,
    buildSkillSummary,
    buildSkillViews,
    loadSkillDefinitionState,
} from '@/data/skills';
import './CapabilityAccessCenter.css';

const hubTabs = [
    { id: 'overview', label: '总览' },
    { id: 'connectors', label: '连接器' },
    { id: 'skills', label: 'Skills' },
    { id: 'mcp', label: 'MCP' },
    { id: 'cli', label: 'CLI' },
    { id: 'vault', label: '凭证' },
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

export default function CapabilityAccessCenter({
    initialSkillPackages = [],
    initialMcpPackages = [],
    initialCliPackages = [],
}) {
    const [activeTab, setActiveTab] = useState('overview');
    const [connectorViews, setConnectorViews] = useState(() => {
        const connectorDefinitions = buildConnectorDefinitions();
        return buildConnectorViews(
            connectorDefinitions,
            buildDefaultConnectorRuntime(connectorDefinitions),
            buildDefaultVaultItems(connectorDefinitions)
        );
    });
    const [skillViews, setSkillViews] = useState(() => {
        const connectorDefinitions = buildConnectorDefinitions();
        const skillDefinitions = buildSkillDefinitions();
        return buildSkillViews(skillDefinitions, connectorDefinitions, initialSkillPackages);
    });
    const [mcpViews, setMcpViews] = useState(() => {
        const mcpDefinitions = buildMcpDefinitions();
        return buildMcpViews(mcpDefinitions, buildDefaultMcpRuntime(mcpDefinitions), initialMcpPackages);
    });
    const [cliViews, setCliViews] = useState(() => {
        const cliDefinitions = buildCliDefinitions();
        return buildCliViews(cliDefinitions, buildDefaultCliRuntime(cliDefinitions), initialCliPackages);
    });

    useEffect(() => {
        const connectorDefinitions = buildConnectorDefinitions(loadConnectorDefinitionState());
        const connectorRuntime = loadConnectorRuntime(connectorDefinitions);
        const vaultItems = loadConnectorVault(connectorDefinitions);
        setConnectorViews(buildConnectorViews(connectorDefinitions, connectorRuntime, vaultItems));

        const mcpDefinitions = buildMcpDefinitions(loadMcpDefinitionState());
        const mcpRuntime = loadMcpRuntime(mcpDefinitions);
        setMcpViews(buildMcpViews(mcpDefinitions, mcpRuntime, initialMcpPackages));

        fetch('/api/mcp/packages', { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload) => {
                const packages = Array.isArray(payload.packages) ? payload.packages : [];
                setMcpViews(buildMcpViews(mcpDefinitions, mcpRuntime, packages));
            })
            .catch(() => {
                setMcpViews(buildMcpViews(mcpDefinitions, mcpRuntime, initialMcpPackages));
            });

        const cliDefinitions = buildCliDefinitions(loadCliDefinitionState());
        const cliRuntime = loadCliRuntime(cliDefinitions);
        setCliViews(buildCliViews(cliDefinitions, cliRuntime, initialCliPackages));

        fetch('/api/cli/packages', { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload) => {
                const packages = Array.isArray(payload.packages) ? payload.packages : [];
                setCliViews(buildCliViews(cliDefinitions, cliRuntime, packages));
            })
            .catch(() => {
                setCliViews(buildCliViews(cliDefinitions, cliRuntime, initialCliPackages));
            });

        const skillDefinitions = buildSkillDefinitions(loadSkillDefinitionState());
        fetch('/api/skills/packages', { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload) => {
                const packages = Array.isArray(payload.packages) ? payload.packages : [];
                setSkillViews(buildSkillViews(skillDefinitions, connectorDefinitions, packages));
            })
            .catch(() => {
                setSkillViews(buildSkillViews(skillDefinitions, connectorDefinitions, initialSkillPackages));
            });
    }, [initialCliPackages, initialMcpPackages, initialSkillPackages]);

    const connectorSummary = useMemo(() => buildConnectorSummary(connectorViews), [connectorViews]);
    const skillSummary = useMemo(() => buildSkillSummary(skillViews), [skillViews]);
    const mcpSummary = useMemo(() => buildMcpSummary(mcpViews), [mcpViews]);
    const cliSummary = useMemo(() => buildCliSummary(cliViews), [cliViews]);

    const accessMetrics = useMemo(() => ({
        connectors: connectorSummary.total || 0,
        skills: skillSummary.total || 0,
        validatedSkills: skillSummary.validated || 0,
        fireflyReady: skillViews.filter((item) => item.fireflyEnabled && item.validationPassed).length,
        mcp: mcpSummary.ready || 0,
        cli: cliSummary.ready || 0,
        vault: connectorViews.filter((item) => item.runtimeConfig?.vaultRef).length,
    }), [cliSummary.ready, connectorSummary.total, connectorViews, mcpSummary.ready, skillSummary.total, skillSummary.validated, skillViews]);

    const topConnectors = connectorViews.slice(0, 4);
    const topSkills = skillViews.slice(0, 4);
    const topMcps = mcpViews.slice(0, 4);
    const topClis = cliViews.slice(0, 4);

    return (
        <div className="capability-page">
            <div className="capability-shell">
                <header className="capability-hero glass-strong">
                    <div className="capability-hero-copy">
                        <span className="capability-kicker">统一能力接入中心</span>
                        <h1>把连接器、Skills、MCP、CLI 和凭证治理收进同一个平台入口</h1>
                        <p>这里不只是“连接器台账”，而是 AI 校园 OS 的能力接入与治理中枢。后续无论是系统接入、协议接入、本地代理还是能力封装，都应该在这里统一归口，而不是在导航里拆成一堆并列页面。</p>
                    </div>
                    <div className="capability-hero-actions">
                        <Link href="/connectors/catalog" className="capability-primary-link">进入连接器台账</Link>
                        <Link href="/connectors/skills" className="capability-inline-link">进入 Skills 管理</Link>
                        <Link href="/connectors/mcp" className="capability-inline-link">进入 MCP 管理</Link>
                        <Link href="/connectors/cli" className="capability-inline-link">进入 CLI 管理</Link>
                        <Link href="/connectors/vault" className="capability-inline-link">打开凭证保险库</Link>
                    </div>
                </header>

                <section className="capability-metrics">
                    <div className="capability-metric glass">
                        <span>连接器</span>
                        <strong>{accessMetrics.connectors}</strong>
                    </div>
                    <div className="capability-metric glass">
                        <span>Skills</span>
                        <strong>{accessMetrics.skills}</strong>
                    </div>
                    <div className="capability-metric glass">
                        <span>规范通过</span>
                        <strong>{accessMetrics.validatedSkills}</strong>
                    </div>
                    <div className="capability-metric glass">
                        <span>已接入萤火虫</span>
                        <strong>{accessMetrics.fireflyReady}</strong>
                    </div>
                    <div className="capability-metric glass">
                        <span>MCP 已就绪</span>
                        <strong>{accessMetrics.mcp}</strong>
                    </div>
                    <div className="capability-metric glass">
                        <span>CLI 已就绪</span>
                        <strong>{accessMetrics.cli}</strong>
                    </div>
                    <div className="capability-metric glass">
                        <span>凭证引用</span>
                        <strong>{accessMetrics.vault}</strong>
                    </div>
                </section>

                <section className="capability-method-grid">
                    {Object.values(accessMethodMap).map((method) => (
                        <article key={method.id} className="capability-method-card glass">
                            <span className="capability-kicker">{method.label}</span>
                            <h3>{method.summary}</h3>
                            <p>{method.detail}</p>
                        </article>
                    ))}
                </section>

                <div className="capability-tab-row">
                    {hubTabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`capability-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'overview' && (
                    <section className="capability-panel-grid">
                        <article className="capability-panel glass">
                            <div className="capability-panel-head">
                                <div>
                                    <span className="capability-section-kicker">连接器快照</span>
                                    <h3>最值得优先收口的系统接入</h3>
                                </div>
                                <Link href="/connectors/catalog" className="capability-inline-link">查看全部</Link>
                            </div>
                            <div className="capability-card-list">
                                {topConnectors.map((connector) => (
                                    <Link key={connector.id} href={`/connectors/${connector.id}`} className="capability-item-card">
                                        <strong>{connector.name}</strong>
                                        <span>{connector.summary}</span>
                                        <small>{connector.owner} · 最近校验 {formatDateTime(connector.lastValidatedAt)}</small>
                                    </Link>
                                ))}
                            </div>
                        </article>

                        <article className="capability-panel glass">
                            <div className="capability-panel-head">
                                <div>
                                    <span className="capability-section-kicker">Skills 快照</span>
                                    <h3>已经进入能力治理链路的技能</h3>
                                </div>
                                <Link href="/connectors/skills" className="capability-inline-link">查看全部</Link>
                            </div>
                            <div className="capability-card-list">
                                {topSkills.map((skill) => (
                                    <Link key={skill.id} href={`/connectors/skills/${skill.id}`} className="capability-item-card">
                                        <strong>{skill.name}</strong>
                                        <span>{skill.summary}</span>
                                        <small>{skill.targetCapabilityLabel} · {skill.fireflyEnabled ? '已接入萤火虫' : '待接入萤火虫'}</small>
                                    </Link>
                                ))}
                            </div>
                        </article>

                        <article className="capability-panel glass">
                            <div className="capability-panel-head">
                                <div>
                                    <span className="capability-section-kicker">MCP 快照</span>
                                    <h3>已经对象化的协议接入</h3>
                                </div>
                                <Link href="/connectors/mcp" className="capability-inline-link">查看全部</Link>
                            </div>
                            <div className="capability-card-list">
                                {topMcps.map((item) => (
                                    <Link key={item.id} href={`/connectors/mcp/${item.id}`} className="capability-item-card">
                                        <strong>{item.name}</strong>
                                        <span>{item.summary}</span>
                                        <small>{item.artifactValidationMeta.label} · {item.statusMeta.label}</small>
                                    </Link>
                                ))}
                            </div>
                        </article>

                        <article className="capability-panel glass">
                            <div className="capability-panel-head">
                                <div>
                                    <span className="capability-section-kicker">CLI 快照</span>
                                    <h3>已经进入治理链路的本地执行对象</h3>
                                </div>
                                <Link href="/connectors/cli" className="capability-inline-link">查看全部</Link>
                            </div>
                            <div className="capability-card-list">
                                {topClis.map((item) => (
                                    <Link key={item.id} href={`/connectors/cli/${item.id}`} className="capability-item-card">
                                        <strong>{item.name}</strong>
                                        <span>{item.summary}</span>
                                        <small>{item.artifactValidationMeta.label} · {item.statusMeta.label}</small>
                                    </Link>
                                ))}
                            </div>
                        </article>

                        <article className="capability-panel glass">
                            <span className="capability-section-kicker">为什么这么分层</span>
                            <h3>统一入口，但不把概念混在一起</h3>
                            <ul className="capability-bullet-list">
                                <li>连接器回答“如何接入系统”。</li>
                                <li>Skill 回答“这项能力给谁用、能不能上架、是否允许萤火虫调用”。</li>
                                <li>MCP 和 CLI 回答“没有现成 API 时，还有哪些标准和客户侧接入方式可用”。</li>
                                <li>凭证保险库回答“接入能力需要什么授权与安全边界”。</li>
                            </ul>
                        </article>
                    </section>
                )}

                {activeTab === 'connectors' && (
                    <section className="capability-single-panel glass">
                        <div className="capability-panel-head">
                            <div>
                                <span className="capability-section-kicker">连接器台账</span>
                                <h3>系统接入仍然是能力接入中心的基础层</h3>
                            </div>
                            <Link href="/connectors/catalog" className="capability-primary-link">进入详细管理</Link>
                        </div>
                        <div className="capability-table-wrap">
                            <table className="capability-table">
                                <thead>
                                    <tr>
                                        <th>系统</th>
                                        <th>归属能力</th>
                                        <th>接入方式</th>
                                        <th>状态</th>
                                        <th>凭证引用</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {connectorViews.map((connector) => (
                                        <tr key={connector.id}>
                                            <td><Link href={`/connectors/${connector.id}`}>{connector.name}</Link></td>
                                            <td>{connector.primaryCapabilityId}</td>
                                            <td>{connector.preferredConnectorType}</td>
                                            <td>{connector.status}</td>
                                            <td>{connector.runtimeConfig?.vaultRef || '未设置'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {activeTab === 'skills' && (
                    <section className="capability-single-panel glass">
                        <div className="capability-panel-head">
                            <div>
                                <span className="capability-section-kicker">Skills 治理</span>
                                <h3>Skill 不再作为单独导航，而是这里的一种能力封装方式</h3>
                            </div>
                            <Link href="/connectors/skills" className="capability-primary-link">进入详细管理</Link>
                        </div>
                        <div className="capability-table-wrap">
                            <table className="capability-table">
                                <thead>
                                    <tr>
                                        <th>Skill</th>
                                        <th>来源</th>
                                        <th>归属能力</th>
                                        <th>依赖连接器</th>
                                        <th>规范校验</th>
                                        <th>市场状态</th>
                                        <th>萤火虫</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {skillViews.map((skill) => (
                                        <tr key={skill.id}>
                                            <td><Link href={`/connectors/skills/${skill.id}`}>{skill.name}</Link></td>
                                            <td>{skill.originLabel}</td>
                                            <td>{skill.targetCapabilityLabel}</td>
                                            <td>{skill.connectorCount > 0 ? skill.linkedConnectors.map((item) => item.shortName || item.name).join('、') : '暂未绑定'}</td>
                                            <td>{skill.packageValidationMeta.label}</td>
                                            <td>{skill.marketLabel}</td>
                                            <td>{skill.fireflyEnabled ? '已接入' : '未接入'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {activeTab === 'mcp' && (
                    <section className="capability-single-panel glass">
                        <div className="capability-panel-head">
                            <div>
                                <span className="capability-section-kicker">MCP 接入</span>
                                <h3>标准协议型能力接入已经开始对象化管理</h3>
                            </div>
                            <Link href="/connectors/mcp" className="capability-primary-link">进入详细管理</Link>
                        </div>
                        <p>这里展示的是已经对象化并开始制品化的 MCP 台账，包含 transport、endpoint、认证方式以及 `MCP.md` 校验状态。只有定义校验、制品校验和状态一起成立时，才应该被视为下一步可实施候选。</p>
                        <div className="capability-table-wrap">
                            <table className="capability-table">
                                <thead>
                                    <tr>
                                        <th>MCP</th>
                                        <th>能力归属</th>
                                        <th>Transport</th>
                                        <th>制品</th>
                                        <th>规范校验</th>
                                        <th>状态</th>
                                        <th>最近巡检</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mcpViews.map((item) => (
                                        <tr key={item.id}>
                                            <td><Link href={`/connectors/mcp/${item.id}`}>{item.name}</Link></td>
                                            <td>{item.capabilityId}</td>
                                            <td>{item.transport}</td>
                                            <td>{item.artifactValidationMeta.label}</td>
                                            <td>{item.validationMeta.label}</td>
                                            <td>{item.statusMeta.label}</td>
                                            <td>{formatDateTime(item.lastCheckedAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {activeTab === 'cli' && (
                    <section className="capability-single-panel glass">
                        <div className="capability-panel-head">
                            <div>
                                <span className="capability-section-kicker">CLI / 本地工具</span>
                                <h3>客户侧、本地工具和受控执行能力的真实台账</h3>
                            </div>
                            <Link href="/connectors/cli" className="capability-primary-link">进入详细管理</Link>
                        </div>
                        <p>CLI 不再只是几条命令示意，而是带有安装状态、授权路径、执行形态、巡检状态和 `CLI.md` 制品校验的真实执行对象。只有定义和制品都过关后，才应该进入萤火虫或流程层的下一步联调。</p>
                        <div className="capability-table-wrap">
                            <table className="capability-table">
                                <thead>
                                    <tr>
                                        <th>CLI</th>
                                        <th>能力归属</th>
                                        <th>执行形态</th>
                                        <th>制品</th>
                                        <th>规范校验</th>
                                        <th>状态</th>
                                        <th>最近巡检</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cliViews.map((item) => (
                                        <tr key={item.id}>
                                            <td><Link href={`/connectors/cli/${item.id}`}>{item.name}</Link></td>
                                            <td>{item.capabilityId}</td>
                                            <td>{item.runnerMeta}</td>
                                            <td>{item.artifactValidationMeta.label}</td>
                                            <td>{item.validationMeta.label}</td>
                                            <td>{item.statusMeta.label}</td>
                                            <td>{formatDateTime(item.lastCheckedAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {activeTab === 'vault' && (
                    <section className="capability-single-panel glass">
                        <div className="capability-panel-head">
                            <div>
                                <span className="capability-section-kicker">凭证治理</span>
                                <h3>授权与凭证不再散在每个能力配置里</h3>
                            </div>
                            <Link href="/connectors/vault" className="capability-primary-link">进入保险库</Link>
                        </div>
                        <ul className="capability-bullet-list">
                            <li>统一登录优先，服务令牌次之，账号密码仅做历史系统兜底。</li>
                            <li>所有能力配置里只引用 `vaultRef`，不直接保存明文信息。</li>
                            <li>后续无论是 Connector、Skill、MCP 还是 CLI，只要涉及授权都应该回到这里治理。</li>
                        </ul>
                    </section>
                )}
            </div>
        </div>
    );
}
