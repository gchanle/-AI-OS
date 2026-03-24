'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import './Navbar.css';
import React from 'react';

const icons = {
    home: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l10 9l-2 2l-8-7l-8 7l-2-2z" /><path d="M4 11v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9" /></svg>,
    service: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
    research: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>,
    assistant: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    library: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
    agent: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></svg>,
};

const navItems = [
    { href: '/', label: '萤火虫', icon: icons.home },
    { href: '/services', label: 'AI办事', icon: icons.service },
    { href: '/research', label: 'AI科研', icon: icons.research },
    { href: '/assistant', label: 'AI助教', icon: icons.assistant },
    { href: '/library', label: 'AI图书馆', icon: icons.library },
    { href: '/agent-builder', label: 'AI智能体', icon: icons.agent },
];

export default function Navbar() {
    const pathname = usePathname();

    return (
        <nav className="navbar glass-strong">
            <div className="navbar-inner">
                <Link href="/" className="navbar-logo">
                    <div className="logo-glow" style={{ padding: 0, background: 'transparent', boxShadow: 'none' }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zm0 20l-10-5V7l10 5 10-5v10l-10 5z"/></svg>
                        </div>
                    </div>
                    <div className="logo-lockup">
                        <span className="logo-text">超星</span>
                        <span className="logo-product">AI 校园 OS</span>
                    </div>
                </Link>

                <div className="navbar-links">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`navbar-link ${pathname === item.href ? 'active' : ''}`}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span className="nav-label">{item.label}</span>
                            {pathname === item.href && <div className="active-pill" />}
                        </Link>
                    ))}
                </div>

                <div className="navbar-actions">
                    <button className="nav-action-btn" title="AI智搜">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </button>
                    <div className="nav-user-avatar" title="个人中心">
                        <span>张</span>
                    </div>
                </div>
            </div>
        </nav>
    );
}
