'use client';
import { useEffect, useState } from 'react';
import ExternalWorkspaceShell from '@/components/ExternalWorkspaceShell';

const RESEARCH_PLATFORM_STORAGE_KEY = 'campus_research_platform';

const wendaoNavItems = [
    { id: 'home', label: '科学探索', url: 'https://kexuedaohang.libsp.net/#/home', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg> },
    { id: 'researcher', label: 'AI研究员', url: 'https://kexuedaohang.libsp.net/#/aiResearcher', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    { id: 'scientific', label: '学术追踪', url: 'https://kexuedaohang.libsp.net/#/scientific', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
    { id: 'kb', label: 'AI知识库', url: 'https://kexuedaohang.libsp.net/#/aiKnowledgeBase', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> },
    { id: 'course', label: '课程', url: 'https://kexuedaohang.libsp.net/#/outAgent', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
    { id: 'apps', label: 'AI应用', url: 'https://kexuedaohang.libsp.net/#/aiApplications', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
    { id: 'starlink', label: '知识星链', url: 'https://kexuedaohang.libsp.net/#/knowledgeBase', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> },
];

const bohriumNavItems = [
    { id: 'station', label: '空间站首页', url: 'https://www.bohrium.com/', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" /><path d="M12 7v10" /><path d="M5 9.5l7 4 7-4" /></svg> },
];

const researchPlatforms = [
    {
        id: 'wendao',
        name: '闻道科学导航',
        navItems: wendaoNavItems,
        showSidebar: true,
        showShellNav: true,
        loadingNoun: '科学导航页面',
        frameOffset: 64,
    },
    {
        id: 'bohrium',
        name: '波尔科研空间站',
        navItems: bohriumNavItems,
        showSidebar: false,
        showShellNav: false,
        loadingNoun: '科研空间页面',
        frameOffset: 0,
    },
];

export default function ResearchPage() {
    const [platformId, setPlatformId] = useState('wendao');

    useEffect(() => {
        try {
            const storedPlatformId = localStorage.getItem(RESEARCH_PLATFORM_STORAGE_KEY);
            if (storedPlatformId && researchPlatforms.some((platform) => platform.id === storedPlatformId)) {
                setPlatformId(storedPlatformId);
            }
        } catch (error) {
            console.error('Failed to restore research platform preference:', error);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(RESEARCH_PLATFORM_STORAGE_KEY, platformId);
        } catch (error) {
            console.error('Failed to persist research platform preference:', error);
        }
    }, [platformId]);

    const activePlatform = researchPlatforms.find((platform) => platform.id === platformId) || researchPlatforms[0];
    const floatingControlSections = activePlatform.id === 'bohrium'
        ? [
            {
                title: '切换平台',
                items: researchPlatforms.map((platform) => ({
                    id: platform.id,
                    label: platform.name,
                    active: platform.id === platformId,
                    onSelect: () => setPlatformId(platform.id),
                })),
            },
        ]
        : [];

    const sidebarFooter = (
        <label className="research-platform-sidebar-picker">
            <span className="research-platform-picker-label">切换平台</span>
            <select value={platformId} onChange={(event) => setPlatformId(event.target.value)}>
                {researchPlatforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                        {platform.name}
                    </option>
                ))}
            </select>
        </label>
    );

    return (
        <ExternalWorkspaceShell
            accent="AI"
            title="科研空间"
            headerControl={null}
            sidebarFooter={activePlatform.showSidebar ? sidebarFooter : null}
            storageKey={`research:${activePlatform.id}`}
            navItems={activePlatform.navItems}
            showSidebar={activePlatform.showSidebar}
            showNav={activePlatform.showShellNav}
            loadingNoun={activePlatform.loadingNoun}
            frameOffset={activePlatform.frameOffset}
            extraControlSections={floatingControlSections}
            capabilityIds={['research']}
        />
    );
}
