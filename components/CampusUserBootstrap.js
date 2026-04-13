'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
    CAMPUS_USER_PROFILE_QUERY_KEYS,
    parseCampusUserProfileHandoff,
    saveCampusUserProfile,
} from '@/data/userProfile';

function stripHandoffParams(pathname, searchParams) {
    const nextParams = new URLSearchParams(searchParams.toString());

    Object.values(CAMPUS_USER_PROFILE_QUERY_KEYS).forEach((key) => {
        nextParams.delete(key);
    });

    const query = nextParams.toString();
    return query ? `${pathname}?${query}` : pathname;
}

export default function CampusUserBootstrap() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!searchParams) {
            return;
        }

        const handoff = parseCampusUserProfileHandoff(searchParams);
        if (!handoff.shouldApply || !handoff.profile) {
            return;
        }

        saveCampusUserProfile(handoff.profile);

        const nextUrl = stripHandoffParams(pathname || '/', searchParams);
        window.history.replaceState({}, '', nextUrl);
    }, [pathname, searchParams]);

    return null;
}
