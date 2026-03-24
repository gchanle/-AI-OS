'use client';
import ExternalWorkspaceShell from '@/components/ExternalWorkspaceShell';

// 办事大厅外置导航映射表
const serviceNavItems = [
    { id: 'home', label: '首页', url: 'https://demo.hall.chaoxing.com/home', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg> },
    { id: 'news', label: '资讯中心', url: 'https://demo.hall.chaoxing.com/news', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2H2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/></svg> },
    { id: 'service-hall', label: '服务大厅', url: 'https://demo.hall.chaoxing.com/service-hall', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> },
    { id: 'business', label: '业务系统', url: 'https://demo.hall.chaoxing.com/business-system', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
    { id: 'schedule', label: '日程中心', url: 'https://demo.hall.chaoxing.com/schedule-center', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { id: 'profile', label: '个人中心', url: 'https://demo.hall.chaoxing.com/schedule-center', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
];

export default function ServicesPage() {
    return <ExternalWorkspaceShell accent="AI" title="办事大厅" navItems={serviceNavItems} loadingNoun="办事页面" />;
}
