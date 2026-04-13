'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import FireflyWorkbenchHome from '@/components/FireflyWorkbenchHome';
import {
    buildAdminWorkspaceBootstrap,
    loadAdminConsoleSettings,
    subscribeAdminConsoleSettings,
} from '@/data/adminConsole';
import {
    buildFireflyHandoffHref,
    loadWorkspacePrefs,
} from '@/data/campusPlatform';
import {
    chatModelOptions,
    defaultCapabilityIds,
    defaultChatModelId,
    sortCapabilityIds,
} from '@/data/workspace';
import {
    ensureCampusUserProfile,
    subscribeCampusUserProfile,
} from '@/data/userProfile';

export default function FireflyWorkbenchPage() {
    const router = useRouter();
    const [userProfile, setUserProfile] = useState(() => ensureCampusUserProfile());
    const [selectedCapabilityIds, setSelectedCapabilityIds] = useState(defaultCapabilityIds);
    const [preferredModelId, setPreferredModelId] = useState(defaultChatModelId);
    const [availableModels, setAvailableModels] = useState(chatModelOptions);
    const [webSearchEnabled, setWebSearchEnabled] = useState(false);
    const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);

    useEffect(() => {
        const profile = ensureCampusUserProfile();
        const bootstrap = buildAdminWorkspaceBootstrap(loadAdminConsoleSettings(), profile);
        const prefs = loadWorkspacePrefs();

        setUserProfile(profile);
        setSelectedCapabilityIds(
            Array.isArray(prefs.capabilityIds) && prefs.capabilityIds.length > 0
                ? sortCapabilityIds(prefs.capabilityIds.filter((item) => bootstrap.enabledCapabilityIds.includes(item)))
                : sortCapabilityIds(bootstrap.capabilityIds)
        );
        setPreferredModelId(String(prefs.modelId || bootstrap.modelId || defaultChatModelId).trim());
        setWebSearchEnabled(typeof prefs.webSearchEnabled === 'boolean' ? prefs.webSearchEnabled : Boolean(bootstrap.webSearchEnabled));
        setDeepResearchEnabled(typeof prefs.deepResearchEnabled === 'boolean' ? prefs.deepResearchEnabled : Boolean(bootstrap.deepResearchEnabled));
    }, []);

    useEffect(() => subscribeCampusUserProfile((profile) => {
        setUserProfile(profile);
        const bootstrap = buildAdminWorkspaceBootstrap(loadAdminConsoleSettings(), profile);
        setSelectedCapabilityIds((prev) => {
            const filtered = prev.filter((item) => bootstrap.enabledCapabilityIds.includes(item));
            return filtered.length > 0 ? sortCapabilityIds(filtered) : sortCapabilityIds(bootstrap.capabilityIds);
        });
    }), []);

    useEffect(() => subscribeAdminConsoleSettings((settings) => {
        const bootstrap = buildAdminWorkspaceBootstrap(settings, userProfile);
        setSelectedCapabilityIds((prev) => {
            const filtered = prev.filter((item) => bootstrap.enabledCapabilityIds.includes(item));
            return filtered.length > 0 ? sortCapabilityIds(filtered) : sortCapabilityIds(bootstrap.capabilityIds);
        });
    }), [userProfile]);

    useEffect(() => {
        let mounted = true;

        fetch('/api/models')
            .then((res) => res.json())
            .then((data) => {
                if (!mounted || !Array.isArray(data.models) || data.models.length === 0) {
                    return;
                }
                setAvailableModels(data.models);
            })
            .catch(() => {
                if (mounted) {
                    setAvailableModels(chatModelOptions);
                }
            });

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!Array.isArray(availableModels) || availableModels.length === 0) {
            return;
        }

        if (!availableModels.some((item) => item.id === preferredModelId)) {
            setPreferredModelId(availableModels[0].id);
        }
    }, [availableModels, preferredModelId]);

    const handleStartChat = (prompt) => {
        const href = buildFireflyHandoffHref(prompt, selectedCapabilityIds);
        router.push(href);
    };

    return (
        <FireflyWorkbenchHome
            onStartChat={handleStartChat}
            selectedCapabilityIds={selectedCapabilityIds}
            preferredModelId={preferredModelId}
            webSearchEnabled={webSearchEnabled}
            deepResearchEnabled={deepResearchEnabled}
        />
    );
}
