'use client';
import ExternalWorkspaceShell from '@/components/ExternalWorkspaceShell';

const assistantNavItems = [
    { id: 'learned', label: '我学的课', url: 'https://mooc1-1.chaoxing.com/visit/interaction', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg> },
    { id: 'taught', label: '我教的课', url: 'https://mooc1-1.chaoxing.com/visit/interaction', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
];

export default function AssistantPage() {
    return <ExternalWorkspaceShell accent="AI" title="助教中心" navItems={assistantNavItems} loadingNoun="教学页面" />;
}
