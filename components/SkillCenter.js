'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    buildFireflyHandoffHref,
    publishCampusNotification,
} from '@/data/campusPlatform';
import {
    buildConnectorDefinitions,
    loadConnectorDefinitionState,
} from '@/data/connectors';
import {
    buildDefaultSkillDefinitionState,
    buildSkillDefinitions,
    buildSkillDraft,
    buildSkillPackageMap,
    buildSkillSummary,
    buildSkillViews,
    capabilityLabelMap,
    getSkillById,
    loadSkillDefinitionState,
    saveSkillDefinitionState,
    skillMarketStatusMap,
    skillOriginMap,
    skillStatusMap,
    skillTriggerModeMap,
    uid,
} from '@/data/skills';
import './SkillCenter.css';

const skillTabs = [
    { id: 'overview', label: '技能说明' },
    { id: 'connectors', label: '连接关系' },
    { id: 'governance', label: '审核与上架' },
    { id: 'firefly', label: '萤火虫调用' },
];

const sortOptions = [
    { id: 'name', label: '按名称' },
    { id: 'status', label: '按状态' },
    { id: 'capability', label: '按归属能力' },
    { id: 'validation', label: '按规范校验' },
    { id: 'updated', label: '按最近更新' },
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

function buildDrawerFormState(skill) {
    const target = skill || buildSkillDraft();
    return {
        id: target.id,
        name: target.name || '',
        summary: target.summary || '',
        owner: target.owner || '',
        provider: target.provider || '',
        origin: target.origin || 'personal',
        status: target.status || 'draft',
        marketStatus: target.marketStatus || 'private',
        targetCapabilityId: target.targetCapabilityId || 'services',
        connectorIdsText: Array.isArray(target.connectorIds) ? target.connectorIds.join('、') : '',
        invocationModesText: Array.isArray(target.invocationModes) ? target.invocationModes.join('、') : '',
        audience: target.audience || '',
        description: target.description || '',
        publishNote: target.publishNote || '',
        reviewNote: target.reviewNote || '',
        suggestedPromptsText: Array.isArray(target.suggestedPrompts) ? target.suggestedPrompts.join('\n') : '',
        fireflyEnabled: Boolean(target.fireflyEnabled),
    };
}

function compareValues(left, right, direction = 'asc') {
    const dir = direction === 'asc' ? 1 : -1;
    if (left < right) return -1 * dir;
    if (left > right) return 1 * dir;
    return 0;
}

export default function SkillCenter({ initialSkillId = null }) {
    const [definitionState, setDefinitionState] = useState(() => buildDefaultSkillDefinitionState());
    const [connectorDefinitions, setConnectorDefinitions] = useState(() => buildConnectorDefinitions(loadConnectorDefinitionState()));
    const [hasHydrated, setHasHydrated] = useState(false);
    const [selectedSkillId, setSelectedSkillId] = useState(initialSkillId || 'service-timetable-brief');
    const [activeTab, setActiveTab] = useState('overview');
    const [statusFilter, setStatusFilter] = useState('all');
    const [originFilter, setOriginFilter] = useState('all');
    const [capabilityFilter, setCapabilityFilter] = useState('all');
    const [searchValue, setSearchValue] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const [drawerState, setDrawerState] = useState({ open: false, mode: 'create' });
    const [drawerForm, setDrawerForm] = useState(buildDrawerFormState(null));
    const [toast, setToast] = useState(null);
    const [skillPackages, setSkillPackages] = useState([]);
    const [isSavingPackage, setIsSavingPackage] = useState(false);

    const definitions = useMemo(
        () => buildSkillDefinitions(definitionState),
        [definitionState]
    );
    const skills = useMemo(
        () => buildSkillViews(definitions, connectorDefinitions, skillPackages),
        [connectorDefinitions, definitions, skillPackages]
    );
    const summary = useMemo(() => buildSkillSummary(skills), [skills]);
    const packageMap = useMemo(() => buildSkillPackageMap(skillPackages), [skillPackages]);

    const visibleSkills = useMemo(() => {
        const keyword = searchValue.trim().toLowerCase();
        const filtered = skills.filter((skill) => {
            const statusMatched = statusFilter === 'all' ? true : skill.status === statusFilter;
            const originMatched = originFilter === 'all' ? true : skill.origin === originFilter;
            const capabilityMatched = capabilityFilter === 'all' ? true : skill.targetCapabilityId === capabilityFilter;
            const searchMatched = keyword.length === 0
                ? true
                : [
                    skill.name,
                    skill.summary,
                    skill.owner,
                    skill.provider,
                    skill.originLabel,
                    skill.targetCapabilityLabel,
                    ...skill.connectorIds,
                ].join(' ').toLowerCase().includes(keyword);

            return statusMatched && originMatched && capabilityMatched && searchMatched;
        });

        return filtered.sort((left, right) => {
            if (sortBy === 'status') {
                return compareValues(left.status, right.status, sortDirection);
            }
            if (sortBy === 'capability') {
                return compareValues(left.targetCapabilityLabel, right.targetCapabilityLabel, sortDirection);
            }
            if (sortBy === 'validation') {
                return compareValues(left.packageValidationMeta.label, right.packageValidationMeta.label, sortDirection);
            }
            if (sortBy === 'updated') {
                return compareValues(new Date(left.lastUpdatedAt || 0).getTime(), new Date(right.lastUpdatedAt || 0).getTime(), sortDirection);
            }
            return compareValues(left.name, right.name, sortDirection);
        });
    }, [capabilityFilter, originFilter, searchValue, skills, sortBy, sortDirection, statusFilter]);

    const selectedSkill = useMemo(
        () => skills.find((item) => item.id === selectedSkillId) || visibleSkills[0] || skills[0] || null,
        [selectedSkillId, skills, visibleSkills]
    );

    useEffect(() => {
        setDefinitionState(loadSkillDefinitionState());
        setConnectorDefinitions(buildConnectorDefinitions(loadConnectorDefinitionState()));
        fetch('/api/skills/packages', { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload) => {
                if (Array.isArray(payload.packages)) {
                    setSkillPackages(payload.packages);
                }
            })
            .catch(() => {
                setSkillPackages([]);
            });
        setHasHydrated(true);
    }, []);

    useEffect(() => {
        if (!selectedSkill && visibleSkills.length > 0) {
            setSelectedSkillId(visibleSkills[0].id);
        }
    }, [selectedSkill, visibleSkills]);

    useEffect(() => {
        if (!hasHydrated) {
            return;
        }

        saveSkillDefinitionState(definitionState);
    }, [definitionState, hasHydrated]);

    useEffect(() => {
        if (!toast) {
            return undefined;
        }

        const timer = window.setTimeout(() => setToast(null), 2600);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const patchSkill = (skillId, patch) => {
        const target = getSkillById(skillId, definitions, connectorDefinitions, skillPackages);
        if (!target) {
            return;
        }

        if (target.isCustom) {
            setDefinitionState((prev) => ({
                ...prev,
                custom: prev.custom.map((item) => (
                    item.id === skillId
                        ? {
                            ...item,
                            ...patch,
                            lastUpdatedAt: new Date().toISOString(),
                        }
                        : item
                )),
            }));
            return;
        }

        setDefinitionState((prev) => ({
            ...prev,
            patches: {
                ...prev.patches,
                [skillId]: {
                    ...(prev.patches[skillId] || {}),
                    ...patch,
                    lastUpdatedAt: new Date().toISOString(),
                },
            },
        }));
    };

    const refreshSkillPackages = async () => {
        const response = await fetch('/api/skills/packages', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.error || 'Failed to load skill packages');
        }

        setSkillPackages(Array.isArray(payload.packages) ? payload.packages : []);
        return Array.isArray(payload.packages) ? payload.packages : [];
    };

    const emitSkillNotification = (skill, title, body, prompt = null) => {
        publishCampusNotification({
            id: uid('message'),
            sourceId: 'agents',
            title,
            body,
            detail: [
                `技能：${skill.name}`,
                `归属能力：${skill.targetCapabilityLabel}`,
                `来源：${skill.originLabel}`,
                `市场状态：${skill.marketLabel}`,
                prompt ? `建议动作：${prompt}` : '建议动作：回到萤火虫继续配置和试运行。',
            ].join('\n'),
            href: prompt
                ? buildFireflyHandoffHref(prompt, [skill.targetCapabilityId])
                : '/connectors/skills',
            pathname: prompt
                ? buildFireflyHandoffHref(prompt, [skill.targetCapabilityId])
                : '/connectors/skills',
            actionLabel: prompt ? '去萤火虫试运行' : '查看技能中心',
            createdAt: new Date().toISOString(),
            read: false,
        });
    };

    const openDrawerForCreate = () => {
        const draft = buildSkillDraft();
        setDrawerForm(buildDrawerFormState(draft));
        setDrawerState({ open: true, mode: 'create' });
    };

    const openDrawerForEdit = (skill) => {
        setDrawerForm(buildDrawerFormState(skill));
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

    const handleSaveDrawer = async () => {
        const nextSkill = {
            id: drawerForm.id,
            name: drawerForm.name || '未命名技能',
            summary: drawerForm.summary,
            owner: drawerForm.owner,
            provider: drawerForm.provider || drawerForm.owner || '当前租户',
            origin: drawerForm.origin,
            status: drawerForm.status,
            marketStatus: drawerForm.marketStatus,
            targetCapabilityId: drawerForm.targetCapabilityId,
            connectorIds: drawerForm.connectorIdsText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean),
            invocationModes: drawerForm.invocationModesText.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean),
            audience: drawerForm.audience,
            description: drawerForm.description,
            publishNote: drawerForm.publishNote,
            reviewNote: drawerForm.reviewNote,
            suggestedPrompts: drawerForm.suggestedPromptsText.split(/\n+/).map((item) => item.trim()).filter(Boolean),
            fireflyEnabled: drawerForm.fireflyEnabled,
            lastUpdatedAt: new Date().toISOString(),
            isCustom: drawerState.mode === 'create' ? true : Boolean(skills.find((item) => item.id === drawerForm.id)?.isCustom),
        };

        setIsSavingPackage(true);
        try {
            const response = await fetch('/api/skills/packages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(nextSkill),
            });
            const payload = await response.json();
            if (!response.ok || !payload?.ok || !payload?.package) {
                throw new Error(payload?.error || 'Failed to persist skill package');
            }

            const savedSkill = {
                ...nextSkill,
                id: payload.package.id,
                packagePath: payload.package.relativePath,
                packageVersion: payload.package.version,
            };

            if (drawerState.mode === 'create') {
                setDefinitionState((prev) => ({
                    ...prev,
                    custom: [...prev.custom, savedSkill],
                }));
                setSelectedSkillId(savedSkill.id);
            } else {
                patchSkill(savedSkill.id, savedSkill);
            }

            await refreshSkillPackages();
            setToast({
                tone: payload.package.validation?.state === 'valid' ? 'success' : 'info',
                title: drawerState.mode === 'create' ? '技能已创建并生成制品' : '技能已更新并重建制品',
                body: `当前规范状态：${payload.package.validation?.label || '待检查'}。`,
            });
            closeDrawer();
        } catch (error) {
            setToast({
                tone: 'warning',
                title: '保存失败',
                body: error instanceof Error ? error.message : 'Skill package 生成失败。',
            });
        } finally {
            setIsSavingPackage(false);
        }
    };

    const handleToggleFirefly = (skill) => {
        if (!skill.canEnableFirefly) {
            setToast({
                tone: 'warning',
                title: '暂不能接入萤火虫',
                body: '该 Skill 还没有通过规范校验，请先补齐或修复 SKILL.md 后再启用。',
            });
            return;
        }

        const nextEnabled = !skill.fireflyEnabled;
        patchSkill(skill.id, {
            fireflyEnabled: nextEnabled,
            status: nextEnabled && skill.status === 'draft' ? 'enabled' : skill.status,
        });

        const nextPrompt = skill.suggestedPrompts?.[0] || `帮我试运行技能“${skill.name}”。`;
        emitSkillNotification(
            skill,
            nextEnabled ? `${skill.name} 已加入萤火虫调用范围` : `${skill.name} 已从萤火虫调用范围移除`,
            nextEnabled ? '后续萤火虫可以在合适场景下调用该技能。' : '后续该技能不会再被萤火虫自动使用。',
            nextEnabled ? nextPrompt : null
        );

        setToast({
            tone: nextEnabled ? 'success' : 'info',
            title: nextEnabled ? '已启用给萤火虫' : '已移出萤火虫',
            body: nextEnabled ? '技能现在可以作为萤火虫的可调度能力。' : '技能仍保留在台账中，但不会被主动调用。',
        });
    };

    const handleStatusChange = (skill, nextStatus) => {
        patchSkill(skill.id, { status: nextStatus });
        setToast({
            tone: 'success',
            title: '技能状态已更新',
            body: `${skill.name} 当前状态已更新为“${skillStatusMap[nextStatus]?.label || nextStatus}”。`,
        });
    };

    const handleMarketAction = (skill, action) => {
        if (action === 'submit') {
            if (!skill.validationPassed) {
                setToast({
                    tone: 'warning',
                    title: '暂不能提交审核',
                    body: '该 Skill 还没有通过规范校验，不能进入审核队列。',
                });
                return;
            }
            patchSkill(skill.id, {
                status: 'review',
                marketStatus: 'review',
            });
            emitSkillNotification(skill, `${skill.name} 已提交学校审核`, '技能已进入学校 Skills 市场审核队列。');
            setToast({
                tone: 'info',
                title: '已提交审核',
                body: '后续学校管理员可以决定是否允许该技能上架市场。',
            });
            return;
        }

        if (action === 'list') {
            if (!skill.canPublishMarket) {
                setToast({
                    tone: 'warning',
                    title: '暂不能上架学校市场',
                    body: '学校市场要求 Skill 规范完全通过，请先修复校验错误。',
                });
                return;
            }
            patchSkill(skill.id, {
                status: 'enabled',
                marketStatus: 'listed',
                fireflyEnabled: true,
            });
            emitSkillNotification(skill, `${skill.name} 已上架学校 Skills 市场`, '技能现在可以被校内用户启用，并进入萤火虫调用范围。', skill.suggestedPrompts?.[0] || null);
            setToast({
                tone: 'success',
                title: '已上架学校市场',
                body: '技能已进入可发现、可启用状态，并默认允许萤火虫调用。',
            });
            return;
        }

        if (action === 'private') {
            patchSkill(skill.id, {
                marketStatus: 'private',
            });
            setToast({
                tone: 'info',
                title: '已改为私有',
                body: '技能仍可保留给自己或当前团队继续调试。',
            });
        }
    };

    const handleCloneSkill = (skill) => {
        const clonedId = uid('skill');
        setDefinitionState((prev) => ({
            ...prev,
            custom: [
                ...prev.custom,
                {
                    ...skill,
                    id: clonedId,
                    name: `${skill.name}（副本）`,
                    owner: '当前用户',
                    provider: '个人空间',
                    origin: 'personal',
                    status: 'draft',
                    marketStatus: 'private',
                    fireflyEnabled: false,
                    isCustom: true,
                    lastUpdatedAt: new Date().toISOString(),
                    lastInvokedAt: null,
                    monthlyCalls: 0,
                },
            ],
        }));
        setSelectedSkillId(clonedId);
        setToast({
            tone: 'success',
            title: '已复制到个人空间',
            body: '你可以在副本上继续改造，再决定是否提交学校审核。',
        });
    };

    return (
        <div className="skill-page">
            <div className="skill-shell">
                <header className="skill-hero glass-strong">
                    <div className="skill-hero-copy">
                        <span className="skill-kicker">Skills 管理中心</span>
                        <h1>把校园能力从“系统接入”真正升级成“可调用技能”</h1>
                        <p>连接器中心解决“怎么接入系统”，Skills 管理中心解决“把哪些能力封装给谁用、是否允许萤火虫调用、能不能上架学校市场”。这样学校官方、超星官方和个人自建 Skill 才能进入同一套治理链路。</p>
                    </div>
                    <div className="skill-hero-actions">
                        <Link href="/connectors" className="skill-inline-link">能力接入中心</Link>
                        <Link href="/connectors/catalog" className="skill-inline-link">连接器台账</Link>
                        <button type="button" className="skill-primary-btn" onClick={openDrawerForCreate}>新建 Skill</button>
                    </div>
                </header>

                <section className="skill-architecture">
                    <article className="skill-architecture-card glass">
                        <span className="skill-kicker">Step 1</span>
                        <h3>连接器负责接入</h3>
                        <p>系统地址、授权方式、凭证保险库、巡检与调试都留在连接器中心，不把系统接入和能力封装混在一起。</p>
                    </article>
                    <article className="skill-architecture-card glass">
                        <span className="skill-kicker">Step 2</span>
                        <h3>Skill 负责能力封装</h3>
                        <p>一个 Skill 可以绑定多个连接器，也可以只是一个提示词和工作流模板，再决定是否开放给个人、学校或市场。</p>
                    </article>
                    <article className="skill-architecture-card glass">
                        <span className="skill-kicker">Step 3</span>
                        <h3>萤火虫负责调度</h3>
                        <p>启用后的 Skill 会进入萤火虫的可调用范围，用户不需要知道背后到底是连接器、工作流还是学校官方能力。</p>
                    </article>
                </section>

                <section className="skill-metrics">
                    <div className="skill-metric glass">
                        <span>登记 Skills</span>
                        <strong>{summary.total}</strong>
                    </div>
                    <div className="skill-metric glass">
                        <span>已启用</span>
                        <strong>{summary.enabled}</strong>
                    </div>
                    <div className="skill-metric glass attention">
                        <span>待审核</span>
                        <strong>{summary.review}</strong>
                    </div>
                    <div className="skill-metric glass">
                        <span>可供萤火虫调用</span>
                        <strong>{summary.fireflyEnabled}</strong>
                    </div>
                    <div className="skill-metric glass">
                        <span>已上架学校市场</span>
                        <strong>{summary.listed}</strong>
                    </div>
                    <div className="skill-metric glass">
                        <span>个人自建</span>
                        <strong>{summary.personal}</strong>
                    </div>
                </section>

                <section className="skill-table-shell glass">
                    <div className="skill-toolbar">
                        <div className="skill-toolbar-left">
                            <input
                                className="skill-search"
                                type="text"
                                placeholder="搜索 Skill、负责人、连接器或归属能力"
                                value={searchValue}
                                onChange={(event) => setSearchValue(event.target.value)}
                            />
                            <div className="skill-filter-row">
                                <button type="button" className={`skill-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>全部状态</button>
                                {Object.values(skillStatusMap).map((status) => (
                                    <button key={status.id} type="button" className={`skill-chip ${statusFilter === status.id ? 'active' : ''}`} onClick={() => setStatusFilter(status.id)}>
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                            <div className="skill-filter-row">
                                <button type="button" className={`skill-chip ${originFilter === 'all' ? 'active' : ''}`} onClick={() => setOriginFilter('all')}>全部来源</button>
                                {Object.entries(skillOriginMap).map(([id, label]) => (
                                    <button key={id} type="button" className={`skill-chip ${originFilter === id ? 'active' : ''}`} onClick={() => setOriginFilter(id)}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="skill-filter-row">
                                <button type="button" className={`skill-chip ${capabilityFilter === 'all' ? 'active' : ''}`} onClick={() => setCapabilityFilter('all')}>全部归属能力</button>
                                {Object.entries(capabilityLabelMap).map(([id, label]) => (
                                    <button key={id} type="button" className={`skill-chip ${capabilityFilter === id ? 'active' : ''}`} onClick={() => setCapabilityFilter(id)}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="skill-toolbar-right">
                            <label className="skill-sort-select">
                                <span>排序</span>
                                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                                    {sortOptions.map((option) => (
                                        <option key={option.id} value={option.id}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <button type="button" className="skill-secondary-btn" onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}>
                                {sortDirection === 'asc' ? '升序' : '降序'}
                            </button>
                        </div>
                    </div>

                    <div className="skill-table-wrap">
                        <table className="skill-table">
                            <thead>
                                <tr>
                                    <th>Skill</th>
                                    <th>来源</th>
                                        <th>归属能力</th>
                                        <th>依赖连接器</th>
                                        <th>规范校验</th>
                                        <th>萤火虫</th>
                                        <th>市场状态</th>
                                        <th>最近调用</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleSkills.map((skill) => (
                                    <tr
                                        key={skill.id}
                                        className={selectedSkillId === skill.id ? 'active' : ''}
                                        onClick={() => {
                                            setSelectedSkillId(skill.id);
                                            setActiveTab('overview');
                                        }}
                                    >
                                        <td>
                                            <div className="skill-cell-main">
                                                <strong>{skill.name}</strong>
                                                <span>{skill.summary}</span>
                                            </div>
                                        </td>
                                        <td>{skill.originLabel}</td>
                                        <td>{skill.targetCapabilityLabel}</td>
                                        <td>{skill.connectorCount > 0 ? skill.linkedConnectors.map((item) => item.shortName || item.name).join('、') : '暂未绑定'}</td>
                                        <td>
                                            <span className={`skill-validation-pill ${skill.packageValidationMeta.tone}`}>
                                                {skill.packageValidationMeta.label}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`skill-firefly-pill ${skill.fireflyEnabled ? 'enabled' : 'disabled'}`}>
                                                {skill.fireflyEnabled ? '已接入' : '未接入'}
                                            </span>
                                        </td>
                                        <td>{skill.marketLabel}</td>
                                        <td>{formatDateTime(skill.lastInvokedAt)}</td>
                                        <td onClick={(event) => event.stopPropagation()}>
                                            <div className="skill-row-actions">
                                                <button type="button" className="skill-inline-btn" onClick={() => openDrawerForEdit(skill)}>编辑</button>
                                                <button type="button" className="skill-inline-btn subtle" onClick={() => handleCloneSkill(skill)}>复制</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {selectedSkill && (
                    <section className="skill-detail-layout">
                        <div className="skill-detail-main">
                            <div className="skill-detail-head glass-strong">
                                <div className="skill-detail-copy">
                                    <span className="skill-kicker">{selectedSkill.targetCapabilityLabel}</span>
                                    <h2>{selectedSkill.name}</h2>
                                    <p>{selectedSkill.description || selectedSkill.summary}</p>
                                </div>
                                <div className="skill-detail-actions">
                                    <button type="button" className="skill-secondary-btn" onClick={() => handleToggleFirefly(selectedSkill)}>
                                        {selectedSkill.fireflyEnabled ? '移出萤火虫' : '启用给萤火虫'}
                                    </button>
                                    <Link
                                        href={buildFireflyHandoffHref(
                                            selectedSkill.suggestedPrompts?.[0] || `帮我试运行技能“${selectedSkill.name}”。`,
                                            [selectedSkill.targetCapabilityId]
                                        )}
                                        className="skill-primary-btn"
                                    >
                                        去萤火虫试运行
                                    </Link>
                                </div>
                            </div>

                            <div className="skill-tab-row">
                                {skillTabs.map((tab) => (
                                    <button key={tab.id} type="button" className={`skill-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {activeTab === 'overview' && (
                                <div className="skill-panel-grid">
                                    <article className="skill-panel glass">
                                        <span className="skill-section-kicker">能力说明</span>
                                        <h3>谁来用、解决什么问题</h3>
                                        <div className="skill-overview-grid">
                                            <div className="skill-overview-item">
                                                <span>负责人</span>
                                                <strong>{selectedSkill.owner}</strong>
                                            </div>
                                            <div className="skill-overview-item">
                                                <span>适用对象</span>
                                                <strong>{selectedSkill.audience}</strong>
                                            </div>
                                            <div className="skill-overview-item">
                                                <span>来源</span>
                                                <strong>{selectedSkill.originLabel}</strong>
                                            </div>
                                            <div className="skill-overview-item">
                                                <span>归属能力</span>
                                                <strong>{selectedSkill.targetCapabilityLabel}</strong>
                                            </div>
                                        </div>
                                        <p>{selectedSkill.summary}</p>
                                    </article>
                                    <article className="skill-panel glass">
                                        <span className="skill-section-kicker">示例问题</span>
                                        <h3>给萤火虫的推荐问法</h3>
                                        <div className="skill-prompt-list">
                                            {selectedSkill.suggestedPrompts.map((prompt) => (
                                                <Link
                                                    key={prompt}
                                                    href={buildFireflyHandoffHref(prompt, [selectedSkill.targetCapabilityId])}
                                                    className="skill-prompt-card"
                                                >
                                                    {prompt}
                                                </Link>
                                            ))}
                                        </div>
                                    </article>
                                    <article className="skill-panel glass">
                                        <span className="skill-section-kicker">Skill 制品</span>
                                        <h3>当前规范文件</h3>
                                        <div className="skill-overview-grid">
                                            <div className="skill-overview-item">
                                                <span>文件路径</span>
                                                <strong>{selectedSkill.packagePath || '未生成'}</strong>
                                            </div>
                                            <div className="skill-overview-item">
                                                <span>版本</span>
                                                <strong>{selectedSkill.packageVersion}</strong>
                                            </div>
                                            <div className="skill-overview-item">
                                                <span>找到章节</span>
                                                <strong>{selectedSkill.packageSections.length}</strong>
                                            </div>
                                            <div className="skill-overview-item">
                                                <span>缺失章节</span>
                                                <strong>{selectedSkill.packageMissingSections.length}</strong>
                                            </div>
                                        </div>
                                        <div className="skill-validation-card">
                                            <div className="skill-validation-head">
                                                <span className={`skill-validation-pill ${selectedSkill.packageValidationMeta.tone}`}>
                                                    {selectedSkill.packageValidationMeta.label}
                                                </span>
                                            </div>
                                            {selectedSkill.packageValidation?.errors?.length > 0 && (
                                                <ul className="skill-validation-list error">
                                                    {selectedSkill.packageValidation.errors.map((item) => (
                                                        <li key={item}>{item}</li>
                                                    ))}
                                                </ul>
                                            )}
                                            {selectedSkill.packageValidation?.warnings?.length > 0 && (
                                                <ul className="skill-validation-list warning">
                                                    {selectedSkill.packageValidation.warnings.map((item) => (
                                                        <li key={item}>{item}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </article>
                                </div>
                            )}

                            {activeTab === 'connectors' && (
                                <div className="skill-panel-grid">
                                    <article className="skill-panel glass">
                                        <span className="skill-section-kicker">连接依赖</span>
                                        <h3>当前 Skill 依赖哪些系统</h3>
                                        {selectedSkill.linkedConnectors.length > 0 ? (
                                            <div className="skill-connector-list">
                                                {selectedSkill.linkedConnectors.map((connector) => (
                                                    <Link key={connector.id} href={`/connectors/${connector.id}`} className="skill-connector-card">
                                                        <strong>{connector.name}</strong>
                                                        <span>{connector.summary}</span>
                                                        <small>{connector.owner}</small>
                                                    </Link>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="skill-empty-state">
                                                <strong>当前没有绑定连接器</strong>
                                                <span>这类 Skill 更接近提示词工作流或人工编排能力，后续也可以补绑定系统接入。</span>
                                            </div>
                                        )}
                                    </article>
                                    <article className="skill-panel glass">
                                        <span className="skill-section-kicker">调用模式</span>
                                        <h3>萤火虫会怎么使用它</h3>
                                        <div className="skill-tag-list">
                                            {selectedSkill.invocationModes.map((mode) => (
                                                <span key={mode} className="skill-tag">
                                                    {skillTriggerModeMap[mode] || mode}
                                                </span>
                                            ))}
                                        </div>
                                        <p>Skill 不一定直接去碰系统。它可以只做意图理解、步骤编排、信息整理，也可以把多个连接器组合成一个更适合用户理解的能力。</p>
                                    </article>
                                </div>
                            )}

                            {activeTab === 'governance' && (
                                <div className="skill-panel-grid">
                                    <article className="skill-panel glass">
                                        <span className="skill-section-kicker">审核与上架</span>
                                        <h3>是否进入学校 Skills 市场</h3>
                                        <div className="skill-governance-box">
                                            <div className="skill-governance-item">
                                                <span>当前状态</span>
                                                <strong>{selectedSkill.statusMeta.label}</strong>
                                            </div>
                                            <div className="skill-governance-item">
                                                <span>市场状态</span>
                                                <strong>{selectedSkill.marketLabel}</strong>
                                            </div>
                                            <div className="skill-governance-item">
                                                <span>规范校验</span>
                                                <strong>{selectedSkill.packageValidationMeta.label}</strong>
                                            </div>
                                            <div className="skill-governance-item">
                                                <span>是否可上架</span>
                                                <strong>{selectedSkill.canPublishMarket ? '可上架' : '需先修复规范'}</strong>
                                            </div>
                                        </div>
                                        <p>{selectedSkill.publishNote}</p>
                                        <div className="skill-action-row">
                                            <button type="button" className="skill-secondary-btn" onClick={() => handleMarketAction(selectedSkill, 'submit')}>提交学校审核</button>
                                            <button type="button" className="skill-secondary-btn" onClick={() => handleMarketAction(selectedSkill, 'list')}>上架学校市场</button>
                                            <button type="button" className="skill-secondary-btn subtle" onClick={() => handleMarketAction(selectedSkill, 'private')}>改为仅自己可见</button>
                                        </div>
                                    </article>
                                    <article className="skill-panel glass">
                                        <span className="skill-section-kicker">审核备注</span>
                                        <h3>当前治理建议</h3>
                                        <p>{selectedSkill.reviewNote}</p>
                                        <div className="skill-action-row">
                                            <button type="button" className="skill-secondary-btn" onClick={() => handleStatusChange(selectedSkill, 'enabled')}>标记为已启用</button>
                                            <button type="button" className="skill-secondary-btn" onClick={() => handleStatusChange(selectedSkill, 'review')}>标记为待审核</button>
                                            <button type="button" className="skill-secondary-btn subtle" onClick={() => handleStatusChange(selectedSkill, 'paused')}>暂停使用</button>
                                        </div>
                                    </article>
                                </div>
                            )}

                            {activeTab === 'firefly' && (
                                <div className="skill-panel-grid">
                                    <article className="skill-panel glass">
                                        <span className="skill-section-kicker">调用开关</span>
                                        <h3>是否允许萤火虫调度</h3>
                                        <label className="skill-toggle-card">
                                            <input
                                                type="checkbox"
                                                checked={selectedSkill.fireflyEnabled}
                                                onChange={() => handleToggleFirefly(selectedSkill)}
                                            />
                                            <div>
                                                <strong>{selectedSkill.fireflyEnabled ? '已接入萤火虫' : '暂未接入萤火虫'}</strong>
                                                <p>启用后，萤火虫可以在对应能力场景下主动调用这个 Skill，而不是只把它当成一个静态配置项。</p>
                                            </div>
                                        </label>
                                        <div className="skill-firefly-meta">
                                            <div className="skill-overview-item">
                                                <span>默认归属能力</span>
                                                <strong>{selectedSkill.targetCapabilityLabel}</strong>
                                            </div>
                                            <div className="skill-overview-item">
                                                <span>推荐入口</span>
                                                <strong>{selectedSkill.invocationModes.map((mode) => skillTriggerModeMap[mode] || mode).join(' / ')}</strong>
                                            </div>
                                        </div>
                                    </article>
                                    <article className="skill-panel glass">
                                        <span className="skill-section-kicker">调用结果</span>
                                        <h3>用户看到的应该是什么</h3>
                                        <ul className="skill-bullet-list">
                                            <li>用户不需要知道背后依赖了哪个连接器，只需要知道萤火虫完成了什么。</li>
                                            <li>如果没有真实返回，就必须显式说明当前只是建议或草稿，不能伪造结果。</li>
                                            <li>高风险动作应继续回到连接器授权模型中做确认，而不是由 Skill 自行突破权限边界。</li>
                                        </ul>
                                    </article>
                                </div>
                            )}
                        </div>

                        <aside className="skill-side-context">
                            <article className="skill-panel glass">
                                <span className="skill-section-kicker">运行态</span>
                                <h3>当前技能表现</h3>
                                <div className="skill-runtime-grid">
                                    <div className="skill-runtime-item">
                                        <span>月调用量</span>
                                        <strong>{selectedSkill.monthlyCalls}</strong>
                                    </div>
                                    <div className="skill-runtime-item">
                                        <span>成功率</span>
                                        <strong>{selectedSkill.successRate}</strong>
                                    </div>
                                    <div className="skill-runtime-item">
                                        <span>最近更新</span>
                                        <strong>{formatDateTime(selectedSkill.lastUpdatedAt)}</strong>
                                    </div>
                                    <div className="skill-runtime-item">
                                        <span>最近调用</span>
                                        <strong>{formatDateTime(selectedSkill.lastInvokedAt)}</strong>
                                    </div>
                                </div>
                            </article>

                            <article className="skill-panel glass">
                                <span className="skill-section-kicker">规范状态</span>
                                <h3>Harness 校验</h3>
                                <div className="skill-validation-card">
                                    <div className="skill-validation-head">
                                        <span className={`skill-validation-pill ${selectedSkill.packageValidationMeta.tone}`}>
                                            {selectedSkill.packageValidationMeta.label}
                                        </span>
                                    </div>
                                    <p>只有通过 SKILL.md 规范校验的 Skill，才应进入学校审核和萤火虫调用链路。</p>
                                </div>
                            </article>

                            <article className="skill-panel glass">
                                <span className="skill-section-kicker">产品边界</span>
                                <h3>为什么不放进连接器中心</h3>
                                <ul className="skill-bullet-list">
                                    <li>连接器是系统接入层，关心怎么登录、怎么巡检、怎么授权。</li>
                                    <li>Skill 是能力封装层，关心给谁用、怎么审核、是否上架市场。</li>
                                    <li>萤火虫是调度层，关心什么时候调用哪个 Skill 更合适。</li>
                                </ul>
                            </article>

                            <article className="skill-panel glass">
                                <span className="skill-section-kicker">快速入口</span>
                                <h3>继续去别处收口</h3>
                                <div className="skill-link-list">
                                    <Link href="/connectors" className="skill-inline-link">返回能力接入中心</Link>
                                    <Link href="/connectors/catalog" className="skill-inline-link">进入连接器台账</Link>
                                    <Link href="/connectors/vault" className="skill-inline-link">打开凭证保险库</Link>
                                    <Link href="/agent-builder" className="skill-inline-link">回到 AI 智能体</Link>
                                </div>
                            </article>
                        </aside>
                    </section>
                )}
            </div>

            {drawerState.open && (
                <>
                    <button type="button" className="skill-drawer-backdrop" onClick={closeDrawer} aria-label="关闭抽屉" />
                    <aside className="skill-drawer glass-strong">
                        <div className="skill-drawer-head">
                            <div>
                                <span className="skill-section-kicker">{drawerState.mode === 'create' ? '新建 Skill' : '编辑 Skill'}</span>
                                <h3>{drawerState.mode === 'create' ? '新增技能' : '编辑技能配置'}</h3>
                            </div>
                            <button type="button" className="skill-secondary-btn" onClick={closeDrawer}>关闭</button>
                        </div>
                        <div className="skill-drawer-body">
                            <div className="skill-form-stack">
                                <section className="skill-form-section">
                                    <div className="skill-form-section-head">
                                        <span className="skill-section-kicker">基础信息</span>
                                        <h4>这个 Skill 是什么</h4>
                                    </div>
                                    <div className="skill-form-grid">
                                        <label className="skill-field">
                                            <span>技能名称</span>
                                            <input type="text" value={drawerForm.name} onChange={(event) => handleDrawerChange('name', event.target.value)} />
                                        </label>
                                        <label className="skill-field">
                                            <span>负责人</span>
                                            <input type="text" value={drawerForm.owner} onChange={(event) => handleDrawerChange('owner', event.target.value)} />
                                        </label>
                                        <label className="skill-field">
                                            <span>提供方</span>
                                            <input type="text" value={drawerForm.provider} onChange={(event) => handleDrawerChange('provider', event.target.value)} />
                                        </label>
                                        <label className="skill-field">
                                            <span>适用对象</span>
                                            <input type="text" value={drawerForm.audience} onChange={(event) => handleDrawerChange('audience', event.target.value)} />
                                        </label>
                                        <label className="skill-field full">
                                            <span>摘要说明</span>
                                            <textarea rows={2} value={drawerForm.summary} onChange={(event) => handleDrawerChange('summary', event.target.value)} />
                                        </label>
                                        <label className="skill-field full">
                                            <span>详细描述</span>
                                            <textarea rows={3} value={drawerForm.description} onChange={(event) => handleDrawerChange('description', event.target.value)} />
                                        </label>
                                    </div>
                                </section>

                                <section className="skill-form-section">
                                    <div className="skill-form-section-head">
                                        <span className="skill-section-kicker">调用与归属</span>
                                        <h4>这个 Skill 如何进入萤火虫</h4>
                                    </div>
                                    <div className="skill-form-grid">
                                        <label className="skill-field">
                                            <span>来源类型</span>
                                            <select value={drawerForm.origin} onChange={(event) => handleDrawerChange('origin', event.target.value)}>
                                                {Object.entries(skillOriginMap).map(([id, label]) => (
                                                    <option key={id} value={id}>{label}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="skill-field">
                                            <span>归属能力</span>
                                            <select value={drawerForm.targetCapabilityId} onChange={(event) => handleDrawerChange('targetCapabilityId', event.target.value)}>
                                                {Object.entries(capabilityLabelMap).map(([id, label]) => (
                                                    <option key={id} value={id}>{label}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="skill-field full">
                                            <span>连接器依赖</span>
                                            <textarea rows={2} value={drawerForm.connectorIdsText} onChange={(event) => handleDrawerChange('connectorIdsText', event.target.value)} placeholder="例如：academic-affairs、notice-center" />
                                        </label>
                                        <label className="skill-field full">
                                            <span>调用模式</span>
                                            <textarea rows={2} value={drawerForm.invocationModesText} onChange={(event) => handleDrawerChange('invocationModesText', event.target.value)} placeholder="例如：chat、workflow、sidebar" />
                                        </label>
                                        <label className="skill-field full">
                                            <span>推荐问法</span>
                                            <textarea rows={4} value={drawerForm.suggestedPromptsText} onChange={(event) => handleDrawerChange('suggestedPromptsText', event.target.value)} placeholder="每行一条，后续可直接投喂给萤火虫" />
                                        </label>
                                        <label className="skill-toggle-card full">
                                            <input
                                                type="checkbox"
                                                checked={drawerForm.fireflyEnabled}
                                                onChange={(event) => handleDrawerChange('fireflyEnabled', event.target.checked)}
                                            />
                                            <div>
                                                <strong>创建后直接纳入萤火虫调用范围</strong>
                                                <p>适合已经明确可被调度的技能；如果只是草稿，建议先关闭。</p>
                                            </div>
                                        </label>
                                    </div>
                                </section>

                                <section className="skill-form-section">
                                    <div className="skill-form-section-head">
                                        <span className="skill-section-kicker">审核与上架</span>
                                        <h4>这个 Skill 如何被治理</h4>
                                    </div>
                                    <div className="skill-form-grid">
                                        <label className="skill-field">
                                            <span>状态</span>
                                            <select value={drawerForm.status} onChange={(event) => handleDrawerChange('status', event.target.value)}>
                                                {Object.entries(skillStatusMap).map(([id, meta]) => (
                                                    <option key={id} value={id}>{meta.label}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="skill-field">
                                            <span>市场状态</span>
                                            <select value={drawerForm.marketStatus} onChange={(event) => handleDrawerChange('marketStatus', event.target.value)}>
                                                {Object.entries(skillMarketStatusMap).map(([id, label]) => (
                                                    <option key={id} value={id}>{label}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="skill-field full">
                                            <span>上架说明</span>
                                            <textarea rows={2} value={drawerForm.publishNote} onChange={(event) => handleDrawerChange('publishNote', event.target.value)} />
                                        </label>
                                        <label className="skill-field full">
                                            <span>审核备注</span>
                                            <textarea rows={2} value={drawerForm.reviewNote} onChange={(event) => handleDrawerChange('reviewNote', event.target.value)} />
                                        </label>
                                    </div>
                                </section>
                            </div>
                        </div>
                        <div className="skill-drawer-actions">
                            <button type="button" className="skill-secondary-btn" onClick={closeDrawer}>取消</button>
                            <button type="button" className="skill-primary-btn" onClick={handleSaveDrawer} disabled={isSavingPackage}>
                                {isSavingPackage ? '正在生成 SKILL.md' : '保存并生成 SKILL.md'}
                            </button>
                        </div>
                    </aside>
                </>
            )}

            {toast && (
                <div className={`skill-toast ${toast.tone || 'info'}`}>
                    <strong>{toast.title}</strong>
                    <span>{toast.body}</span>
                </div>
            )}
        </div>
    );
}
