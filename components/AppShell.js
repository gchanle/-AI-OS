'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import GlobalFireflyDrawer from '@/components/GlobalFireflyDrawer';
import CampusSchedulerRuntime from '@/components/CampusSchedulerRuntime';

export default function AppShell({ children }) {
    const pathname = usePathname();
    const isAdminRoute = pathname?.startsWith('/admin');

    if (isAdminRoute) {
        return children;
    }

    return (
        <>
            <Navbar />
            <main style={{ marginTop: 'var(--navbar-height)' }}>
                {children}
            </main>
            <GlobalFireflyDrawer />
            <CampusSchedulerRuntime />
        </>
    );
}
