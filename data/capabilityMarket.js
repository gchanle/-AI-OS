export const CAPABILITY_MARKET_INSTALLS_KEY = 'campus_capability_market_installs_v1';
export const CAPABILITY_MARKET_INSTALLS_EVENT = 'campus-capability-market-installs-sync';

const MARKET_SKILL_STATUSES = new Set(['listed', 'limited']);
const MARKET_MCP_RUNTIME_STATUSES = new Set(['ready', 'pilot']);
const MARKET_MCP_PUBLISH_STATUSES = new Set(['listed', 'limited']);

function canUseStorage() {
    return typeof window !== 'undefined';
}

function normalizeUid(uid = '') {
    return String(uid || 'anonymous-demo-user').trim() || 'anonymous-demo-user';
}

function normalizeInstallItem(item = {}) {
    const kind = item.kind === 'mcp' ? 'mcp' : 'skill';
    const packageId = String(item.packageId || item.id || '').trim();

    return {
        kind,
        packageId,
        installedAt: String(item.installedAt || new Date().toISOString()).trim(),
        enabled: item.enabled !== false,
        pinned: Boolean(item.pinned),
    };
}

function normalizeInstallState(raw = {}) {
    const users = raw?.users && typeof raw.users === 'object' ? raw.users : {};

    return {
        users: Object.fromEntries(
            Object.entries(users).map(([uid, value]) => {
                const items = Array.isArray(value?.items)
                    ? value.items.map(normalizeInstallItem).filter((item) => item.packageId)
                    : [];

                return [normalizeUid(uid), { items }];
            })
        ),
    };
}

function readInstallState() {
    if (!canUseStorage()) {
        return normalizeInstallState();
    }

    try {
        const raw = JSON.parse(localStorage.getItem(CAPABILITY_MARKET_INSTALLS_KEY) || 'null');
        return normalizeInstallState(raw || {});
    } catch (error) {
        console.error('Failed to restore capability market installs:', error);
        return normalizeInstallState();
    }
}

function writeInstallState(state = normalizeInstallState()) {
    if (!canUseStorage()) {
        return;
    }

    try {
        const normalized = normalizeInstallState(state);
        localStorage.setItem(CAPABILITY_MARKET_INSTALLS_KEY, JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(CAPABILITY_MARKET_INSTALLS_EVENT, {
            detail: normalized,
        }));
    } catch (error) {
        console.error('Failed to persist capability market installs:', error);
    }
}

export function isSkillMarketReady(skill = {}) {
    return skill.status === 'enabled'
        && MARKET_SKILL_STATUSES.has(String(skill.marketStatus || '').trim())
        && Boolean(skill.validationPassed);
}

export function isMcpMarketReady(mcp = {}) {
    return MARKET_MCP_RUNTIME_STATUSES.has(String(mcp.status || '').trim())
        && MARKET_MCP_PUBLISH_STATUSES.has(String(mcp.marketStatus || '').trim())
        && Boolean(mcp.endpoint)
        && Boolean(mcp.artifactValidationPassed)
        && mcp.validation?.state !== 'invalid';
}

function isSkillMarketListedInCatalog(skill = {}) {
    return skill.status === 'enabled'
        && MARKET_SKILL_STATUSES.has(String(skill.marketStatus || '').trim())
        && skill.validationPassed !== false;
}

function isMcpMarketListedInCatalog(mcp = {}) {
    return MARKET_MCP_RUNTIME_STATUSES.has(String(mcp.status || '').trim())
        && MARKET_MCP_PUBLISH_STATUSES.has(String(mcp.marketStatus || '').trim())
        && Boolean(mcp.endpoint)
        && mcp.artifactValidationPassed !== false
        && mcp.validation?.state !== 'invalid';
}

function buildUnavailableCapabilityReason(item = {}, kind = 'skill') {
    if (!item) {
        return {
            label: '已从市场移除',
            reviewLabel: '市场不可用',
            summary: '该能力已不在当前市场目录中，不能再启用给萤火虫，但仍可保留记录或手动卸载。',
        };
    }

    if (kind === 'skill') {
        if (item.status !== 'enabled') {
            return {
                label: '未启用',
                reviewLabel: '暂不可用',
                summary: '该 Skill 当前未处于启用状态，不能继续暴露给前台用户。',
            };
        }
        if (!MARKET_SKILL_STATUSES.has(String(item.marketStatus || '').trim())) {
            return {
                label: '未上架',
                reviewLabel: '已下架或待审核',
                summary: '该 Skill 当前未处于已上架或定向开放状态，因此不会继续展示在市场中。',
            };
        }
        if (!item.validationPassed) {
            return {
                label: '制品失效',
                reviewLabel: '待修复',
                summary: '该 Skill 的制品校验未通过，已自动从市场可用集合中移出。',
            };
        }
    }

    if (kind === 'mcp') {
        if (!MARKET_MCP_RUNTIME_STATUSES.has(String(item.status || '').trim())) {
            return {
                label: '运行未开放',
                reviewLabel: '暂不可用',
                summary: '该 MCP 当前未处于可接入或试点状态，不能开放给前台用户安装。',
            };
        }
        if (!MARKET_MCP_PUBLISH_STATUSES.has(String(item.marketStatus || '').trim())) {
            return {
                label: '未上架',
                reviewLabel: '已下架或待审核',
                summary: '该 MCP 当前未处于已上架或定向开放状态，因此不会继续展示在市场中。',
            };
        }
        if (!item.endpoint || !item.artifactValidationPassed || item.validation?.state === 'invalid') {
            return {
                label: '接入失效',
                reviewLabel: '待修复',
                summary: '该 MCP 的接入定义、制品或 endpoint 校验失败，已从市场可用集合中移出。',
            };
        }
    }

    return {
        label: '市场不可用',
        reviewLabel: '暂不可用',
        summary: '该能力当前不满足前台市场开放条件。',
    };
}

function buildInstalledOnlyEntry(install = {}, sourceItem = null) {
    const kind = install.kind === 'mcp' ? 'mcp' : 'skill';
    const unavailable = buildUnavailableCapabilityReason(sourceItem, kind);
    const name = sourceItem?.name || install.packageId;
    const summary = sourceItem?.summary || unavailable.summary;
    const capabilityId = kind === 'mcp'
        ? sourceItem?.capabilityId
        : sourceItem?.targetCapabilityId;
    const capabilityLabel = kind === 'mcp'
        ? sourceItem?.capabilityId
        : sourceItem?.targetCapabilityLabel;
    const version = kind === 'mcp'
        ? sourceItem?.artifactVersion
        : sourceItem?.packageVersion;
    const provider = sourceItem?.provider || sourceItem?.owner || '未标注';
    const updatedAt = kind === 'mcp'
        ? sourceItem?.lastCheckedAt
        : sourceItem?.lastUpdatedAt;

    return {
        id: `${kind}:${install.packageId}`,
        kind,
        packageId: install.packageId,
        name,
        summary,
        owner: sourceItem?.owner || '',
        provider,
        capabilityId: capabilityId || 'services',
        capabilityLabel: capabilityLabel || capabilityId || 'services',
        badge: kind === 'mcp' ? 'MCP' : 'Skill',
        reviewLabel: unavailable.reviewLabel,
        version: version || '1.0.0',
        audience: sourceItem?.audience || sourceItem?.scope || '',
        statusLabel: unavailable.label,
        href: sourceItem ? `/connectors/${kind === 'mcp' ? 'mcp' : 'skills'}/${install.packageId}` : '/connectors',
        install,
        installed: true,
        enabled: false,
        requestedEnabled: Boolean(install.enabled),
        marketReady: false,
        availableInMarket: false,
        fireflyEligible: false,
        updatedAt: updatedAt || install.installedAt || '',
        sortAt: install.installedAt || updatedAt || '',
        meta: sourceItem,
    };
}

export function loadUserCapabilityInstalls(profile = {}) {
    const uid = normalizeUid(profile?.uid || profile);
    const state = readInstallState();
    const items = Array.isArray(state.users?.[uid]?.items) ? state.users[uid].items : [];
    return items.map(normalizeInstallItem).filter((item) => item.packageId);
}

export function subscribeUserCapabilityInstalls(profile = {}, callback) {
    if (!canUseStorage()) {
        return () => {};
    }

    const uid = normalizeUid(profile?.uid || profile);
    const emit = () => {
        callback(loadUserCapabilityInstalls(uid));
    };

    const handleSync = () => emit();
    const handleStorage = (event) => {
        if (event.key === CAPABILITY_MARKET_INSTALLS_KEY) {
            emit();
        }
    };

    window.addEventListener(CAPABILITY_MARKET_INSTALLS_EVENT, handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener(CAPABILITY_MARKET_INSTALLS_EVENT, handleSync);
        window.removeEventListener('storage', handleStorage);
    };
}

export function installUserCapability(profile = {}, capabilityRef = {}) {
    const uid = normalizeUid(profile?.uid || profile);
    const nextItem = normalizeInstallItem({
        kind: capabilityRef.kind,
        packageId: capabilityRef.packageId,
        enabled: capabilityRef.enabled !== false,
        pinned: capabilityRef.pinned,
        installedAt: capabilityRef.installedAt || new Date().toISOString(),
    });

    const state = readInstallState();
    const currentItems = Array.isArray(state.users?.[uid]?.items) ? state.users[uid].items : [];
    const filtered = currentItems.filter((item) => !(item.kind === nextItem.kind && item.packageId === nextItem.packageId));

    writeInstallState({
        ...state,
        users: {
            ...state.users,
            [uid]: {
                items: [nextItem, ...filtered],
            },
        },
    });

    return nextItem;
}

export function uninstallUserCapability(profile = {}, capabilityRef = {}) {
    const uid = normalizeUid(profile?.uid || profile);
    const kind = capabilityRef.kind === 'mcp' ? 'mcp' : 'skill';
    const packageId = String(capabilityRef.packageId || '').trim();
    const state = readInstallState();
    const currentItems = Array.isArray(state.users?.[uid]?.items) ? state.users[uid].items : [];

    writeInstallState({
        ...state,
        users: {
            ...state.users,
            [uid]: {
                items: currentItems.filter((item) => !(item.kind === kind && item.packageId === packageId)),
            },
        },
    });
}

export function updateUserCapabilityInstall(profile = {}, capabilityRef = {}, patch = {}) {
    const uid = normalizeUid(profile?.uid || profile);
    const kind = capabilityRef.kind === 'mcp' ? 'mcp' : 'skill';
    const packageId = String(capabilityRef.packageId || '').trim();
    const state = readInstallState();
    const currentItems = Array.isArray(state.users?.[uid]?.items) ? state.users[uid].items : [];
    const target = currentItems.find((item) => item.kind === kind && item.packageId === packageId);

    if (!target) {
        return installUserCapability(uid, {
            kind,
            packageId,
            ...patch,
        });
    }

    const updated = normalizeInstallItem({
        ...target,
        ...patch,
    });

    writeInstallState({
        ...state,
        users: {
            ...state.users,
            [uid]: {
                items: currentItems.map((item) => (
                    item.kind === kind && item.packageId === packageId ? updated : item
                )),
            },
        },
    });

    return updated;
}

export function buildCapabilityInstallSnapshot(installs = []) {
    const installedSkillIds = installs.filter((item) => item.kind === 'skill').map((item) => item.packageId);
    const installedMcpIds = installs.filter((item) => item.kind === 'mcp').map((item) => item.packageId);
    const enabledSkillIds = installs.filter((item) => item.kind === 'skill' && item.enabled).map((item) => item.packageId);
    const enabledMcpIds = installs.filter((item) => item.kind === 'mcp' && item.enabled).map((item) => item.packageId);

    return {
        installedSkillIds,
        installedMcpIds,
        enabledSkillIds,
        enabledMcpIds,
    };
}

export function buildCapabilityMarketAccessContext({
    skillViews = [],
    mcpViews = [],
    installs = [],
} = {}) {
    const installSnapshot = buildCapabilityInstallSnapshot(installs);
    return {
        marketAccess: {
            ...installSnapshot,
            marketListedSkillIds: skillViews.filter(isSkillMarketReady).map((item) => item.id),
            marketListedMcpIds: mcpViews.filter(isMcpMarketReady).map((item) => item.id),
        },
    };
}

export function buildCapabilityMarketAccessContextFromCatalog({
    skills = [],
    mcps = [],
    installs = [],
} = {}) {
    const installSnapshot = buildCapabilityInstallSnapshot(installs);
    return {
        marketAccess: {
            ...installSnapshot,
            marketListedSkillIds: skills
                .filter(isSkillMarketListedInCatalog)
                .map((item) => item.id),
            marketListedMcpIds: mcps
                .filter(isMcpMarketListedInCatalog)
                .map((item) => item.id),
        },
    };
}

export function buildCapabilityMarketEntries({
    skillViews = [],
    mcpViews = [],
    installs = [],
} = {}) {
    const installMap = new Map(
        installs.map((item) => [`${item.kind}:${item.packageId}`, item])
    );

    const skillEntries = skillViews
        .filter(isSkillMarketReady)
        .map((skill) => {
            const install = installMap.get(`skill:${skill.id}`) || null;
            return {
                id: `skill:${skill.id}`,
                kind: 'skill',
                packageId: skill.id,
                name: skill.name,
                summary: skill.summary,
                owner: skill.owner,
                provider: skill.provider,
                capabilityId: skill.targetCapabilityId,
                capabilityLabel: skill.targetCapabilityLabel,
                badge: 'Skill',
                reviewLabel: '已审核上架',
                version: skill.packageVersion || '1.0.0',
                audience: skill.audience,
                statusLabel: skill.marketLabel,
                href: `/connectors/skills/${skill.id}`,
                install,
                installed: Boolean(install),
                enabled: Boolean(install?.enabled),
                marketReady: true,
                availableInMarket: true,
                fireflyEligible: Boolean(skill.fireflyEnabled && skill.canEnableFirefly),
                updatedAt: skill.lastUpdatedAt,
                sortAt: skill.lastUpdatedAt || '',
                meta: skill,
            };
        });

    const mcpEntries = mcpViews
        .filter(isMcpMarketReady)
        .map((mcp) => {
            const install = installMap.get(`mcp:${mcp.id}`) || null;
            return {
                id: `mcp:${mcp.id}`,
                kind: 'mcp',
                packageId: mcp.id,
                name: mcp.name,
                summary: mcp.summary,
                owner: mcp.owner,
                provider: mcp.provider,
                capabilityId: mcp.capabilityId,
                capabilityLabel: mcp.capabilityId,
                badge: 'MCP',
                reviewLabel: mcp.status === 'ready' ? '已审核可用' : '试点开放',
                version: mcp.artifactVersion || '1.0.0',
                audience: mcp.scope || '校园用户',
                statusLabel: mcp.marketLabel || mcp.statusMeta?.label || mcp.status,
                href: `/connectors/mcp/${mcp.id}`,
                install,
                installed: Boolean(install),
                enabled: Boolean(install?.enabled),
                marketReady: true,
                availableInMarket: true,
                fireflyEligible: Boolean(mcp.enabled),
                updatedAt: mcp.lastCheckedAt,
                sortAt: mcp.lastCheckedAt || '',
                meta: mcp,
            };
        });

    return [...skillEntries, ...mcpEntries]
        .sort((left, right) => String(right.sortAt || '').localeCompare(String(left.sortAt || '')));
}

export function filterInstalledCapabilityEntries(entries = []) {
    return entries.filter((item) => item.installed);
}

export function buildInstalledCapabilityEntries({
    skillViews = [],
    mcpViews = [],
    installs = [],
} = {}) {
    const marketEntries = buildCapabilityMarketEntries({
        skillViews,
        mcpViews,
        installs,
    });
    const marketMap = new Map(marketEntries.map((item) => [item.id, item]));
    const skillMap = new Map(skillViews.map((item) => [item.id, item]));
    const mcpMap = new Map(mcpViews.map((item) => [item.id, item]));

    return installs.map((install) => {
        const key = `${install.kind}:${install.packageId}`;
        const marketEntry = marketMap.get(key);
        if (marketEntry) {
            return marketEntry;
        }

        return buildInstalledOnlyEntry(
            install,
            install.kind === 'mcp' ? (mcpMap.get(install.packageId) || null) : (skillMap.get(install.packageId) || null)
        );
    }).sort((left, right) => String(right.sortAt || '').localeCompare(String(left.sortAt || '')));
}

export function filterFireflyToolsByMarketAccess(tools = [], contextSnapshot = {}) {
    const marketAccess = contextSnapshot?.marketAccess;
    if (!marketAccess || typeof marketAccess !== 'object') {
        return tools;
    }

    const enabledSkills = new Set(Array.isArray(marketAccess.enabledSkillIds) ? marketAccess.enabledSkillIds : []);
    const enabledMcps = new Set(Array.isArray(marketAccess.enabledMcpIds) ? marketAccess.enabledMcpIds : []);
    const listedSkills = new Set(Array.isArray(marketAccess.marketListedSkillIds) ? marketAccess.marketListedSkillIds : []);
    const listedMcps = new Set(Array.isArray(marketAccess.marketListedMcpIds) ? marketAccess.marketListedMcpIds : []);

    return tools.filter((tool) => {
        if (!tool?.sourceRefs) {
            return true;
        }

        const skillRefs = Array.isArray(tool.sourceRefs.skills) ? tool.sourceRefs.skills.filter((item) => listedSkills.has(item)) : [];
        const mcpRefs = Array.isArray(tool.sourceRefs.mcp) ? tool.sourceRefs.mcp.filter((item) => listedMcps.has(item)) : [];

        if (tool.sourceKind === 'skill_adapter' && skillRefs.length > 0) {
            return skillRefs.some((item) => enabledSkills.has(item));
        }

        if (tool.sourceKind === 'mcp_backed' && mcpRefs.length > 0) {
            return mcpRefs.some((item) => enabledMcps.has(item));
        }

        if (tool.sourceKind === 'connector_backed' && (skillRefs.length > 0 || mcpRefs.length > 0)) {
            return skillRefs.some((item) => enabledSkills.has(item)) || mcpRefs.some((item) => enabledMcps.has(item));
        }

        return true;
    });
}
