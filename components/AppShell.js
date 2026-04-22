'use client';

import { Suspense } from 'react';
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
            <Suspense fallback={null}>
                <CampusUserBootstrap />
            </Suspense>
            <Navbar />
            <main style={{ marginTop: 'var(--navbar-height)' }}>
                {children}
            </main>
            <GlobalFireflyDrawer />
            <CampusSchedulerRuntime />
        </>
    );
}
