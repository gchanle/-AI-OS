'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    buildMcpDefinitions,
    buildMcpViews,
    loadMcpDefinitionState,
    loadMcpRuntime,
} from '@/data/mcp';
import {
    buildSkillDefinitions,
    buildSkillViews,
    capabilityLabelMap,
    loadSkillDefinitionState,
} from '@/data/skills';
import {
    buildCapabilityMarketEntries,
    buildInstalledCapabilityEntries,
    installUserCapability,
    loadUserCapabilityInstalls,
    subscribeUserCapabilityInstalls,
    uninstallUserCapability,
    updateUserCapabilityInstall,
} from '@/data/capabilityMarket';
import {
    ensureCampusUserProfile,
    hasCampusAdminAccess,
    subscribeCampusUserProfile,
} from '@/data/userProfile';
import './CapabilityMarketplaceCenter.css';

const kindFilters = [
    { id: 'all', label: '全部能力' },
    { id: 'skill', label: 'Skills' },
    { id: 'mcp', label: 'MCP' },
];

const hubTabs = [
    { id: 'market', label: '能力市场' },
    { id: 'installed', label: '我的能力' },
];

function formatDateTime(value) {
    if (!value) {
        return '最近未更新';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function buildCapabilityBadge(kind = 'skill') {
    return kind === 'mcp' ? 'MCP' : 'Skill';
}

function CapabilityCard({
    item,
    mode = 'market',
    onInstall,
    onUninstall,
    onToggleEnabled,
}) {
    return (
        <article className="cap-market-card glass">
            <div className="cap-market-card-top">
                <div>
                    <div className="cap-market-badge-row">
                        <span className={`cap-market-badge ${item.kind}`}>{buildCapabilityBadge(item.kind)}</span>
                        <span className="cap-market-review">{item.reviewLabel}</span>
                    </div>
                    <h3>{item.name}</h3>
                </div>
                <span className={`cap-market-install-pill ${item.installed ? 'installed' : ''}`}>
                    {item.installed ? '已安装' : '未安装'}
                </span>
            </div>

            <p>{item.summary}</p>

            <div className="cap-market-meta">
                <span>能力域：{capabilityLabelMap[item.capabilityId] || item.capabilityLabel || item.capabilityId}</span>
                <span>提供方：{item.provider || item.owner || '未标注'}</span>
                <span>版本：{item.version || '1.0.0'}</span>
                <span>更新：{formatDateTime(item.updatedAt)}</span>
            </div>

            <div className="cap-market-tags">
                <span>{item.statusLabel}</span>
                {!item.availableInMarket ? <span>市场已隐藏</span> : null}
                {item.fireflyEligible ? <span>可被萤火虫调用</span> : <span>仅可安装浏览</span>}
                {item.audience ? <span>{item.audience}</span> : null}
            </div>

            <div className="cap-market-actions">
                {mode === 'market' ? (
                    item.installed ? (
                        <>
                            <button type="button" className="cap-market-btn subtle" onClick={() => onUninstall?.(item)}>卸载</button>
                            <button type="button" className={`cap-market-btn ${item.enabled ? 'secondary' : 'primary'}`} onClick={() => onToggleEnabled?.(item)}>
                                {item.enabled ? '停用' : '启用给萤火虫'}
                            </button>
                        </>
                    ) : (
                        <button type="button" className="cap-market-btn primary" onClick={() => onInstall?.(item)}>安装能力</button>
                    )
                ) : (
                    <>
                        <button
                            type="button"
                            className={`cap-market-btn ${item.enabled ? 'secondary' : 'primary'}`}
                            onClick={() => onToggleEnabled?.(item)}
                            disabled={!item.availableInMarket}
                        >
                            {item.availableInMarket ? (item.enabled ? '已启用' : '启用给萤火虫') : '当前不可启用'}
                        </button>
                        <button type="button" className="cap-market-btn subtle" onClick={() => onUninstall?.(item)}>卸载</button>
                    </>
                )}
                <Link href={item.href} className="cap-market-inline-link">查看详情</Link>
            </div>
        </article>
    );
}

export default function CapabilityMarketplaceCenter() {
    const [activeTab, setActiveTab] = useState('market');
    const [kindFilter, setKindFilter] = useState('all');
    const [searchValue, setSearchValue] = useState('');
    const [userProfile, setUserProfile] = useState(() => ensureCampusUserProfile());
    const [installs, setInstalls] = useState(() => loadUserCapabilityInstalls(ensureCampusUserProfile()));
    const [skillViews, setSkillViews] = useState([]);
    const [mcpViews, setMcpViews] = useState([]);

    useEffect(() => subscribeCampusUserProfile(setUserProfile), []);

    useEffect(() => {
        setInstalls(loadUserCapabilityInstalls(userProfile));
        return subscribeUserCapabilityInstalls(userProfile, setInstalls);
    }, [userProfile]);

    useEffect(() => {
        let disposed = false;

        const loadCatalog = async () => {
            const skillDefinitions = buildSkillDefinitions(loadSkillDefinitionState());
            const mcpDefinitions = buildMcpDefinitions(loadMcpDefinitionState());
            const mcpRuntime = loadMcpRuntime(mcpDefinitions);

            try {
                const [skillsResponse, mcpResponse] = await Promise.all([
                    fetch('/api/skills/packages', { cache: 'no-store' }),
                    fetch('/api/mcp/packages', { cache: 'no-store' }),
                ]);
                const [skillsPayload, mcpPayload] = await Promise.all([
                    skillsResponse.json(),
                    mcpResponse.json(),
                ]);

                if (disposed) {
                    return;
                }

                setSkillViews(buildSkillViews(
                    skillDefinitions,
                    undefined,
                    Array.isArray(skillsPayload.packages) ? skillsPayload.packages : []
                ));
                setMcpViews(buildMcpViews(
                    mcpDefinitions,
                    mcpRuntime,
                    Array.isArray(mcpPayload.packages) ? mcpPayload.packages : []
                ));
            } catch {
                if (!disposed) {
                    setSkillViews(buildSkillViews(skillDefinitions, undefined, []));
                    setMcpViews(buildMcpViews(mcpDefinitions, mcpRuntime, []));
                }
            }
        };

        loadCatalog();
        return () => {
            disposed = true;
        };
    }, []);

    const marketEntries = useMemo(() => buildCapabilityMarketEntries({
        skillViews,
        mcpViews,
        installs,
    }), [installs, mcpViews, skillViews]);

    const installedEntries = useMemo(
        () => buildInstalledCapabilityEntries({
            skillViews,
            mcpViews,
            installs,
        }),
        [installs, mcpViews, skillViews]
    );

    const filteredEntries = useMemo(() => {
        const source = activeTab === 'installed' ? installedEntries : marketEntries;
        const keyword = searchValue.trim().toLowerCase();

        return source.filter((item) => {
            const kindMatched = kindFilter === 'all' ? true : item.kind === kindFilter;
            const searchMatched = !keyword
                ? true
                : [
                    item.name,
                    item.summary,
                    item.provider,
                    item.owner,
                    item.capabilityLabel,
                    capabilityLabelMap[item.capabilityId] || item.capabilityId,
                ]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(keyword));

            return kindMatched && searchMatched;
        });
    }, [activeTab, installedEntries, kindFilter, marketEntries, searchValue]);

    const summary = useMemo(() => ({
        listed: marketEntries.length,
        installed: installedEntries.length,
        enabled: installedEntries.filter((item) => item.enabled).length,
        skills: marketEntries.filter((item) => item.kind === 'skill').length,
        mcps: marketEntries.filter((item) => item.kind === 'mcp').length,
    }), [installedEntries, marketEntries]);

    const handleInstall = (item) => {
        installUserCapability(userProfile, {
            kind: item.kind,
            packageId: item.packageId,
            enabled: true,
        });
    };

    const handleUninstall = (item) => {
        uninstallUserCapability(userProfile, {
            kind: item.kind,
            packageId: item.packageId,
        });
    };

    const handleToggleEnabled = (item) => {
        if (!item.availableInMarket) {
            return;
        }

        updateUserCapabilityInstall(userProfile, {
            kind: item.kind,
            packageId: item.packageId,
        }, {
            enabled: !item.enabled,
        });
    };

    return (
        <main className="cap-market-page">
            <div className="cap-market-shell">
                <header className="cap-market-hero glass-strong">
                    <div className="cap-market-hero-copy">
                        <span className="cap-market-kicker">能力市场</span>
                        <h1>管理员审核上架，用户自行安装和选用</h1>
                        <p>后台只负责上传、审核和上架；前台用户只会看到已经通过审核的 Skill 和 MCP。安装完成后，用户再决定哪些能力继续开放给自己的萤火虫使用。</p>
                    </div>
                    <div className="cap-market-hero-actions">
                        <button type="button" className={`cap-market-tab-switch ${activeTab === 'market' ? 'active' : ''}`} onClick={() => setActiveTab('market')}>能力市场</button>
                        <button type="button" className={`cap-market-tab-switch ${activeTab === 'installed' ? 'active' : ''}`} onClick={() => setActiveTab('installed')}>我的能力</button>
                        {hasCampusAdminAccess(userProfile) ? (
                            <Link href="/admin/access?tab=catalog" className="cap-market-admin-link">打开后台治理</Link>
                        ) : null}
                    </div>
                </header>

                <section className="cap-market-principles glass">
                    <div>
                        <strong>Harness 原则校验</strong>
                        <p>前台不能直接消费草稿、待审或私有制品；只有后台已审核上架的能力才会进入市场。萤火虫也不会默认拿到平台全量能力，而是只读取当前用户“已安装并启用”的集合。</p>
                    </div>
                </section>

                <section className="cap-market-metrics">
                    <div className="cap-market-metric glass">
                        <span>市场在售</span>
                        <strong>{summary.listed}</strong>
                    </div>
                    <div className="cap-market-metric glass">
                        <span>我的已安装</span>
                        <strong>{summary.installed}</strong>
                    </div>
                    <div className="cap-market-metric glass">
                        <span>已启用给萤火虫</span>
                        <strong>{summary.enabled}</strong>
                    </div>
                    <div className="cap-market-metric glass">
                        <span>Skills</span>
                        <strong>{summary.skills}</strong>
                    </div>
                    <div className="cap-market-metric glass">
                        <span>MCP</span>
                        <strong>{summary.mcps}</strong>
                    </div>
                </section>

                <section className="cap-market-toolbar glass">
                    <div className="cap-market-filter-row">
                        {hubTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={`cap-market-chip ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <div className="cap-market-filter-row">
                        {kindFilters.map((filter) => (
                            <button
                                key={filter.id}
                                type="button"
                                className={`cap-market-chip ${kindFilter === filter.id ? 'active' : ''}`}
                                onClick={() => setKindFilter(filter.id)}
                            >
                                {filter.label}
                            </button>
                        ))}
                    </div>
                    <label className="cap-market-search">
                        <input
                            type="search"
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.target.value)}
                            placeholder="搜索名称、能力域或提供方"
                        />
                    </label>
                </section>

                {filteredEntries.length === 0 ? (
                    <section className="cap-market-empty glass">
                        <strong>{activeTab === 'market' ? '当前没有可展示的上架能力' : '你还没有安装任何能力'}</strong>
                        <p>{activeTab === 'market' ? '如果你确认后台已经上传过 Skill 或 MCP，下一步我可以继续帮你把后台审核状态和前台市场展示做成真正联动。' : '可以先去能力市场安装你需要的 Skill 和 MCP，再决定哪些能力开放给自己的萤火虫。'}</p>
                    </section>
                ) : (
                    <section className="cap-market-grid">
                        {filteredEntries.map((item) => (
                            <CapabilityCard
                                key={item.id}
                                item={item}
                                mode={activeTab}
                                onInstall={handleInstall}
                                onUninstall={handleUninstall}
                                onToggleEnabled={handleToggleEnabled}
                            />
                        ))}
                    </section>
                )}
            </div>
        </main>
    );
}
