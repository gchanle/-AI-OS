'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import GlobalFireflyDrawer from '@/components/GlobalFireflyDrawer';
import CampusSchedulerRuntime from '@/components/CampusSchedulerRuntime';
import CampusUserBootstrap from '@/components/CampusUserBootstrap';

export default function AppShell({ children }) {
    const pathname = usePathname();
    const isAdminRoute = pathname?.startsWith('/admin');

    if (isAdminRoute) {
        return children;
    }

    return (
        <>
            <CampusUserBootstrap />
            <Navbar />
            <main style={{ marginTop: 'var(--navbar-height)' }}>
                {children}
            </main>
            <GlobalFireflyDrawer />
            <CampusSchedulerRuntime />
        </>
    );
}
