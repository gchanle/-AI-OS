'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import CampusUserBootstrap from '@/components/CampusUserBootstrap';
import {
    getDefaultCampusUserProfile,
    ensureCampusUserProfile,
    hasCampusAdminAccess,
    subscribeCampusUserProfile,
} from '@/data/userProfile';
import {
    getDefaultAdminConsoleSettings,
    loadAdminConsoleSettings,
    subscribeAdminConsoleSettings,
} from '@/data/adminConsole';
import './AdminShell.css';

const adminNavItems = [
    { href: '/admin', label: '总览', summary: '后台总览与分工入口' },
    { href: '/admin/users', label: '用户管理', summary: '角色、权限与开通范围' },
    { href: '/admin/access', label: '接入管理', summary: '学校策略、能力接入与运行观测' },
    { href: '/admin/agents', label: '智能体管理', summary: '官方智能体、院系模板与上架治理' },
];

export default function AdminShell({ children }) {
    const pathname = usePathname();
    const [profile, setProfile] = useState(() => getDefaultCampusUserProfile());
    const [schoolName, setSchoolName] = useState(() => getDefaultAdminConsoleSettings().schoolProfile.name);

    useEffect(() => {
        setProfile(ensureCampusUserProfile());
        return subscribeCampusUserProfile(setProfile);
    }, []);

    useEffect(() => {
        setSchoolName(loadAdminConsoleSettings().schoolProfile.name);
        return subscribeAdminConsoleSettings((settings) => {
            setSchoolName(settings.schoolProfile.name);
        });
    }, []);

    const canAccess = hasCampusAdminAccess(profile);
    const currentNav = useMemo(
        () => adminNavItems.find((item) => item.href === pathname) || adminNavItems.find((item) => pathname?.startsWith(`${item.href}/`)) || adminNavItems[0],
        [pathname]
    );

    if (!canAccess) {
        return (
            <div className="admin-root">
                <div className="admin-app-shell">
                    <section className="admin-access-denied">
                        <span className="admin-access-kicker">Campus Admin</span>
                        <h1>当前账号没有后台权限</h1>
                        <p>学校级后台只对学校管理员、平台管理员或被授权的运营角色开放。</p>
                        <Link href="/" className="admin-back-link">返回用户端</Link>
                    </section>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-root">
            <CampusUserBootstrap />
            <header className="admin-topbar">
                <div className="admin-topbar-inner">
                    <Link href="/admin" className="admin-brand">
                        <img src="/chaoxing-logo-wordmark.png" alt="超星" className="admin-brand-logo" />
                        <div className="admin-brand-copy">
                            <strong>AI 校园 OS 管理后台</strong>
                            <small>{schoolName}</small>
                        </div>
                    </Link>

                    <nav className="admin-topnav" aria-label="管理后台主导航">
                        {adminNavItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`admin-topnav-link ${pathname === item.href || pathname?.startsWith(`${item.href}/`) ? 'active' : ''}`}
                            >
                                <span>{item.label}</span>
                            </Link>
                        ))}
                    </nav>

                    <div className="admin-topbar-actions">
                        <div className="admin-profile-chip">
                            <img src={profile.avatar} alt={profile.name} className="admin-profile-avatar" />
                            <div>
                                <strong>{profile.name}</strong>
                                <small>学校管理员</small>
                            </div>
                        </div>
                        <Link href="/" target="_blank" className="admin-topbar-link">打开用户端</Link>
                    </div>
                </div>
            </header>

            <main className="admin-app-shell">
                <section className="admin-page-head">
                    <div>
                        <span className="admin-page-kicker">Campus Admin Console</span>
                        <h1>{currentNav.label}</h1>
                        <p>{currentNav.summary}</p>
                    </div>
                </section>
                {children}
            </main>
        </div>
    );
}
