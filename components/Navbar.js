'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import FireflyMark from '@/components/FireflyMark';
import GlobalMessageCenter from '@/components/GlobalMessageCenter';
import './Navbar.css';
import React from 'react';

const icons = {
    home: <FireflyMark size={18} className="nav-firefly-icon" decorative />,
    service: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
    research: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>,
    assistant: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    library: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
    agent: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></svg>,
    connector: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 1 1 7 7l-1 1" /><path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" /></svg>,
    capability: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h10v10H7z" /><path d="M4 4h4" /><path d="M16 4h4" /><path d="M4 20h4" /><path d="M16 20h4" /><path d="M20 8v8" /><path d="M4 8v8" /></svg>,
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
    const [isSearchOpen, setIsSearchOpen] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState('');
    const searchRef = React.useRef(null);
    const inputRef = React.useRef(null);

    React.useEffect(() => {
        if (!isSearchOpen) {
            return;
        }

        inputRef.current?.focus();
    }, [isSearchOpen]);

    React.useEffect(() => {
        if (!isSearchOpen) {
            return;
        }

        const handlePointerDown = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsSearchOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isSearchOpen]);

    const handleSearchSubmit = (event) => {
        event?.preventDefault();
        const query = searchValue.trim();
        if (!query) {
            inputRef.current?.focus();
            return;
        }

        window.location.href = `https://sosoai.libsou.com/result?query=${encodeURIComponent(query)}&mode=speed`;
    };

    return (
        <nav className="navbar glass-strong">
            <div className="navbar-inner">
                <Link href="/" className="navbar-logo">
                    <div className="logo-glow">
                        <img
                            src="/chaoxing-logo-wordmark.png"
                            alt="超星"
                            className="logo-mark"
                        />
                    </div>
                    <div className="logo-lockup">
                        <span className="logo-product">
                            <span className="logo-product-mark">
                                <FireflyMark size={18} className="logo-firefly-icon" decorative />
                            </span>
                            <span className="logo-product-copy">
                                <strong>萤火虫</strong>
                                <small>AI 校园 OS</small>
                            </span>
                        </span>
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
                    <Link href="/connectors" className={`nav-utility-link ${pathname.startsWith('/connectors') || pathname.startsWith('/skills') ? 'active' : ''}`}>
                        <span className="nav-icon">{icons.capability}</span>
                        <span>能力接入</span>
                    </Link>
                    <div className="nav-search" ref={searchRef}>
                        <button
                            className={`nav-action-btn ${isSearchOpen ? 'active' : ''}`}
                            title="AI智搜"
                            type="button"
                            onClick={() => setIsSearchOpen((prev) => !prev)}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                        </button>

                        {isSearchOpen && (
                            <form className="nav-search-popover glass-strong" onSubmit={handleSearchSubmit}>
                                <input
                                    ref={inputRef}
                                    className="nav-search-input"
                                    type="text"
                                    placeholder="输入想搜索的问题、论文或资源"
                                    value={searchValue}
                                    onChange={(event) => setSearchValue(event.target.value)}
                                />
                                <button className="nav-search-submit" type="submit" title="执行搜索">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                </button>
                            </form>
                        )}
                    </div>
                    <GlobalMessageCenter />
                    <div className="nav-user-profile" title="个人中心">
                        <div className="nav-user-avatar">
                            <img
                                src="/user-avatar.png"
                                alt="亚敏 Alexis"
                                className="nav-user-avatar-image"
                            />
                        </div>
                        <div className="nav-user-copy">
                            <span className="nav-user-name">亚敏 Alexis</span>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
