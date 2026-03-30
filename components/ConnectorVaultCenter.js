'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    buildConnectorDefinitions,
    buildDefaultConnectorDefinitionState,
    buildDefaultVaultItems,
    capabilityLabelMap,
    connectorTypeMap,
    loadConnectorDefinitionState,
    loadConnectorVault,
    saveConnectorVault,
    vaultKindMap,
} from '@/data/connectors';
import './ConnectorVaultCenter.css';

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

export default function ConnectorVaultCenter() {
    const [definitions, setDefinitions] = useState(() => buildConnectorDefinitions(buildDefaultConnectorDefinitionState()));
    const [vaultItems, setVaultItems] = useState(() => buildDefaultVaultItems(definitions));
    const [statusFilter, setStatusFilter] = useState('all');
    const [toast, setToast] = useState(null);
    const [hasHydrated, setHasHydrated] = useState(false);

    useEffect(() => {
        const nextDefinitions = buildConnectorDefinitions(loadConnectorDefinitionState());
        setDefinitions(nextDefinitions);
        setVaultItems(loadConnectorVault(nextDefinitions));
        setHasHydrated(true);
    }, []);

    useEffect(() => {
        if (!hasHydrated) {
            return;
        }

        saveConnectorVault(vaultItems);
    }, [hasHydrated, vaultItems]);

    useEffect(() => {
        if (!toast) {
            return undefined;
        }

        const timer = window.setTimeout(() => setToast(null), 2400);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const rows = useMemo(
        () => vaultItems.map((item) => {
            const connector = definitions.find((entry) => entry.id === item.connectorId);
            return {
                ...item,
                connector,
            };
        }).filter((item) => statusFilter === 'all' ? true : item.status === statusFilter),
        [definitions, statusFilter, vaultItems]
    );

    const metrics = useMemo(() => ({
        total: vaultItems.length,
        valid: vaultItems.filter((item) => item.status === 'valid').length,
        review: vaultItems.filter((item) => item.status === 'review').length,
        expiring: vaultItems.filter((item) => new Date(item.expiresAt).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 14).length,
    }), [vaultItems]);

    const updateVaultStatus = (vaultId, status) => {
        setVaultItems((prev) => prev.map((item) => (
            item.id === vaultId
                ? {
                    ...item,
                    status,
                    lastVerifiedAt: new Date().toISOString(),
                }
                : item
        )));

        setToast({
            title: '凭证状态已更新',
            body: status === 'valid' ? '该凭证已标记为可继续使用。' : '该凭证已进入复核状态。',
        });
    };

    return (
        <div className="vault-page">
            <div className="vault-shell">
                <header className="vault-hero glass-strong">
                    <div className="vault-hero-copy">
                        <span className="vault-kicker">凭证保险库 / 授权中心</span>
                        <h1>把授权路径、会话、令牌和密码兜底从连接器配置中拆出来</h1>
                        <p>连接器负责系统能力编排，这里只负责凭证、有效期、授权模式和审计可见性，避免把敏感信息塞进普通业务配置里。</p>
                    </div>
                    <div className="vault-hero-actions">
                        <Link href="/connectors" className="vault-inline-link">返回连接器中心</Link>
                    </div>
                </header>

                <section className="vault-metrics">
                    <div className="vault-metric glass">
                        <span>凭证记录</span>
                        <strong>{metrics.total}</strong>
                    </div>
                    <div className="vault-metric glass">
                        <span>有效可用</span>
                        <strong>{metrics.valid}</strong>
                    </div>
                    <div className="vault-metric glass attention">
                        <span>待复核</span>
                        <strong>{metrics.review}</strong>
                    </div>
                    <div className="vault-metric glass attention">
                        <span>14 天内到期</span>
                        <strong>{metrics.expiring}</strong>
                    </div>
                </section>

                <section className="vault-table-shell glass">
                    <div className="vault-toolbar">
                        <div className="vault-filter-row">
                            <button type="button" className={`vault-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>全部</button>
                            <button type="button" className={`vault-chip ${statusFilter === 'valid' ? 'active' : ''}`} onClick={() => setStatusFilter('valid')}>可用</button>
                            <button type="button" className={`vault-chip ${statusFilter === 'review' ? 'active' : ''}`} onClick={() => setStatusFilter('review')}>待复核</button>
                        </div>
                    </div>

                    <div className="vault-table-wrap">
                        <table className="vault-table">
                            <thead>
                                <tr>
                                    <th>凭证名称</th>
                                    <th>绑定系统</th>
                                    <th>凭证类型</th>
                                    <th>能力归属</th>
                                    <th>状态</th>
                                    <th>最近校验</th>
                                    <th>最近使用</th>
                                    <th>到期时间</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="vault-cell-main">
                                                <strong>{item.title}</strong>
                                                <span>{item.id}</span>
                                            </div>
                                        </td>
                                        <td>{item.connectorName}</td>
                                        <td>{vaultKindMap[item.kind] || item.kind}</td>
                                        <td>{capabilityLabelMap[item.scope] || item.scope}</td>
                                        <td>
                                            <span className={`vault-status ${item.status}`}>
                                                {item.status === 'valid' ? '可用' : '待复核'}
                                            </span>
                                        </td>
                                        <td>{formatDateTime(item.lastVerifiedAt)}</td>
                                        <td>{formatDateTime(item.lastUsedAt)}</td>
                                        <td>{formatDateTime(item.expiresAt)}</td>
                                        <td>
                                            <div className="vault-row-actions">
                                                <button type="button" className="vault-inline-btn" onClick={() => updateVaultStatus(item.id, 'valid')}>设为可用</button>
                                                <button type="button" className="vault-inline-btn subtle" onClick={() => updateVaultStatus(item.id, 'review')}>设为复核</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="vault-guides">
                    <article className="vault-guide glass">
                        <span className="vault-kicker">使用原则</span>
                        <h3>不要把账号密码放进普通业务表</h3>
                        <ul>
                            <li>统一登录优先，其次是服务令牌或客户侧代理。</li>
                            <li>账号密码仅用于历史系统兜底，并且要有审计与最小权限。</li>
                            <li>连接器配置里只保留 `vaultRef`，不直接存明文。</li>
                        </ul>
                    </article>
                    <article className="vault-guide glass">
                        <span className="vault-kicker">连接关系</span>
                        <h3>凭证与连接器是一对多关系的入口</h3>
                        <p>后续可以继续扩展到租户级、个人级和部门级授权视图，把同一个系统的不同授权方式拆开管理。</p>
                    </article>
                </section>
            </div>

            {toast && (
                <div className="vault-toast">
                    <strong>{toast.title}</strong>
                    <span>{toast.body}</span>
                </div>
            )}
        </div>
    );
}
