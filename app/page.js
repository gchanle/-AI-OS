'use client';
import { useEffect, useState } from 'react';
import LandingView from '@/components/LandingView';
import LeftSidebar from '@/components/LeftSidebar';
import ChatArea from '@/components/ChatArea';
import RightSidebar from '@/components/RightSidebar';
import {
  buildAdminWorkspaceBootstrap,
  loadAdminConsoleSettings,
  subscribeAdminConsoleSettings,
} from '@/data/adminConsole';
import {
  consumeFireflyHandoffRequest,
  loadWorkspacePrefs,
  saveWorkspacePrefs,
} from '@/data/campusPlatform';
import {
  campusCapabilities,
  chatModelOptions,
  defaultCapabilityIds,
  defaultChatModelId,
  sortCapabilityIds,
} from '@/data/workspace';
import {
  ensureCampusUserProfile,
  loadCampusUserProfile,
  subscribeCampusUserProfile,
} from '@/data/userProfile';
import { upsertCampusPreferenceMemory } from '@/data/fireflyMemory';
import './home.css';

const DASHBOARD_SECTION_ORDER = ['paths', 'modules', 'continuity', 'templates'];
const DEFAULT_DASHBOARD_SECTIONS = ['paths'];

export default function Home() {
  const workspaceModes = [
    { id: 'classic', label: '工作台' },
    { id: 'minimal', label: '对话' },
  ];
  const [chatStarted, setChatStarted] = useState(false);
  const [initialMessage, setInitialMessage] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState(defaultCapabilityIds);
  const [preferredModelId, setPreferredModelId] = useState(defaultChatModelId);
  const [availableModels, setAvailableModels] = useState(chatModelOptions);
  const [workspaceMode, setWorkspaceMode] = useState('classic');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);
  const [dashboardSections, setDashboardSections] = useState(DEFAULT_DASHBOARD_SECTIONS);
  const [launchRuntimeContext, setLaunchRuntimeContext] = useState(null);
  const [launchThreadKey, setLaunchThreadKey] = useState(null);
  const [userProfile, setUserProfile] = useState(() => loadCampusUserProfile());
  const [enabledCapabilityIds, setEnabledCapabilityIds] = useState(() => buildAdminWorkspaceBootstrap().enabledCapabilityIds);

  useEffect(() => {
    const ensuredProfile = ensureCampusUserProfile();
    setUserProfile(ensuredProfile);
    const adminBootstrap = buildAdminWorkspaceBootstrap(loadAdminConsoleSettings(), ensuredProfile);
    const parsedPrefs = loadWorkspacePrefs();
    setEnabledCapabilityIds(adminBootstrap.enabledCapabilityIds);

    if (Array.isArray(parsedPrefs.capabilityIds) && parsedPrefs.capabilityIds.length > 0) {
      setSelectedCapabilityIds(sortCapabilityIds(parsedPrefs.capabilityIds.filter((item) => adminBootstrap.enabledCapabilityIds.includes(item))));
    } else if (adminBootstrap.capabilityIds.length > 0) {
      setSelectedCapabilityIds(sortCapabilityIds(adminBootstrap.capabilityIds));
    }
    if (parsedPrefs.modelId) {
      setPreferredModelId(parsedPrefs.modelId);
    } else if (adminBootstrap.modelId) {
      setPreferredModelId(adminBootstrap.modelId);
    }
    if (parsedPrefs.workspaceMode) {
      setWorkspaceMode(parsedPrefs.workspaceMode);
    }
    if (typeof parsedPrefs.webSearchEnabled === 'boolean') {
      setWebSearchEnabled(parsedPrefs.webSearchEnabled);
    } else {
      setWebSearchEnabled(Boolean(adminBootstrap.webSearchEnabled));
    }
    if (typeof parsedPrefs.deepResearchEnabled === 'boolean') {
      setDeepResearchEnabled(parsedPrefs.deepResearchEnabled);
    } else {
      setDeepResearchEnabled(Boolean(adminBootstrap.deepResearchEnabled));
    }
    if (Array.isArray(parsedPrefs.dashboardSections) && parsedPrefs.dashboardSections.length > 0) {
      const storedSections = DASHBOARD_SECTION_ORDER.filter((item) => parsedPrefs.dashboardSections.includes(item));
      const isLegacyDefault =
        (storedSections.length === 3 &&
          storedSections.includes('paths') &&
          storedSections.includes('modules') &&
          storedSections.includes('continuity') &&
          !storedSections.includes('templates')) ||
        (storedSections.length === 2 &&
          storedSections.includes('paths') &&
          storedSections.includes('modules') &&
          !storedSections.includes('continuity') &&
          !storedSections.includes('templates'));

      setDashboardSections(
        isLegacyDefault ? DEFAULT_DASHBOARD_SECTIONS : storedSections
      );
    }
  }, []);

  useEffect(() => subscribeAdminConsoleSettings((settings) => {
    const bootstrap = buildAdminWorkspaceBootstrap(settings, userProfile);
    setEnabledCapabilityIds(bootstrap.enabledCapabilityIds);
    setSelectedCapabilityIds((prev) => {
      const filtered = prev.filter((item) => bootstrap.enabledCapabilityIds.includes(item));
      if (filtered.length > 0) {
        return sortCapabilityIds(filtered);
      }
      return sortCapabilityIds(bootstrap.capabilityIds);
    });
  }), [userProfile]);

  useEffect(() => subscribeCampusUserProfile((profile) => {
    setUserProfile(profile);
    const bootstrap = buildAdminWorkspaceBootstrap(loadAdminConsoleSettings(), profile);
    setEnabledCapabilityIds(bootstrap.enabledCapabilityIds);
    setSelectedCapabilityIds((prev) => {
      const filtered = prev.filter((item) => bootstrap.enabledCapabilityIds.includes(item));
      if (filtered.length > 0) {
        return sortCapabilityIds(filtered);
      }
      return sortCapabilityIds(bootstrap.capabilityIds);
    });
  }), []);

  useEffect(() => {
    saveWorkspacePrefs({
      capabilityIds: selectedCapabilityIds,
      modelId: preferredModelId,
      workspaceMode,
      webSearchEnabled,
      deepResearchEnabled,
      dashboardSections,
    });
    const profile = loadCampusUserProfile();
    upsertCampusPreferenceMemory({
      uid: profile.uid,
      fid: profile.fid,
      preferredModelId,
      capabilityIds: selectedCapabilityIds,
      workspaceMode,
      webSearchEnabled,
      deepResearchEnabled,
    });
  }, [selectedCapabilityIds, preferredModelId, workspaceMode, webSearchEnabled, deepResearchEnabled, dashboardSections]);

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
    const handoffRequest = consumeFireflyHandoffRequest();
    if (!handoffRequest?.prompt) {
      return;
    }

    if (handoffRequest.capabilityIds.length > 0) {
      setSelectedCapabilityIds(sortCapabilityIds(handoffRequest.capabilityIds));
    }

    setInitialMessage(handoffRequest.prompt);
    setChatStarted(true);
    setCurrentSessionId(null);
    sessionStorage.removeItem('current_sid');
  }, []);

  const handleStartChat = (message, options = {}) => {
    if (Array.isArray(options.capabilityIds) && options.capabilityIds.length > 0) {
      setSelectedCapabilityIds(sortCapabilityIds(options.capabilityIds.filter((item) => enabledCapabilityIds.includes(item))));
    }

    setLaunchRuntimeContext(options.runtimeContext || null);
    setLaunchThreadKey(options.threadKey || null);
    setInitialMessage(message);
    setChatStarted(true);
    setCurrentSessionId(null);
  };

  const handleSelectSession = (sessionId) => {
    setCurrentSessionId(sessionId);
    setLaunchRuntimeContext(null);
    setLaunchThreadKey(null);
    setChatStarted(true);
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('current_sid', sessionId);
    }
  };

  const handleReset = () => {
    setChatStarted(false);
    setInitialMessage('');
    setCurrentSessionId(null);
    setLaunchRuntimeContext(null);
    setLaunchThreadKey(null);
    if (typeof window !== 'undefined') {
        sessionStorage.removeItem('current_sid');
    }
  };

  const handleToggleCapability = (capabilityId) => {
    if (!enabledCapabilityIds.includes(capabilityId)) {
      return;
    }

    setSelectedCapabilityIds((prev) => {
      if (prev.includes(capabilityId)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== capabilityId);
      }

      return sortCapabilityIds([...prev, capabilityId]);
    });
  };

  const handleToggleDashboardSection = (sectionId) => {
    setDashboardSections((prev) => {
      if (prev.includes(sectionId)) {
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter((item) => item !== sectionId);
      }

      return DASHBOARD_SECTION_ORDER.filter((item) => [...prev, sectionId].includes(item));
    });
  };

  return (
    <div className={`home-layout ${chatStarted ? 'chat-mode' : 'landing-mode'} workspace-${workspaceMode}`}>
      {/* 全局背景修饰（蓝白色块） */}
      <div className="global-bg">
        <div className="bg-orb bg-orb-1"></div>
        <div className="bg-orb bg-orb-2"></div>
        <div className="bg-orb bg-orb-3"></div>
      </div>

      <div className="workspace-mode-switch glass-strong" role="tablist" aria-label="萤火虫界面版本">
        {workspaceModes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`workspace-mode-button ${workspaceMode === mode.id ? 'active' : ''}`}
            onClick={() => setWorkspaceMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* 侧边栏始终存在 */}
      <LeftSidebar
        onNewChat={handleReset}
        onSelectSession={handleSelectSession}
        variant={workspaceMode}
        onQuickStart={handleStartChat}
      />

      <div className="main-content">
        {/* 只在主区域切换 落地页 / 聊天页 */}
        {!chatStarted ? (
          <LandingView
            onStartChat={handleStartChat}
            capabilities={campusCapabilities.filter((item) => enabledCapabilityIds.includes(item.id))}
            selectedCapabilityIds={selectedCapabilityIds}
            onToggleCapability={handleToggleCapability}
            availableModels={availableModels}
            preferredModelId={preferredModelId}
            onPreferredModelChange={setPreferredModelId}
            variant={workspaceMode}
            webSearchEnabled={webSearchEnabled}
            deepResearchEnabled={deepResearchEnabled}
            onWebSearchChange={setWebSearchEnabled}
            onDeepResearchChange={setDeepResearchEnabled}
            dashboardSections={dashboardSections}
            onToggleDashboardSection={handleToggleDashboardSection}
          />
        ) : (
          <ChatArea
            initialMessage={initialMessage}
            sessionId={currentSessionId}
            defaultCapabilityIds={selectedCapabilityIds}
            preferredModelId={preferredModelId}
            onPreferredModelChange={setPreferredModelId}
            availableModels={availableModels}
            variant={workspaceMode}
            onToggleCapability={handleToggleCapability}
            webSearchEnabled={webSearchEnabled}
            deepResearchEnabled={deepResearchEnabled}
            onWebSearchChange={setWebSearchEnabled}
            onDeepResearchChange={setDeepResearchEnabled}
            initialRuntimeContext={launchRuntimeContext}
            initialThreadKey={launchThreadKey}
          />
        )}
      </div>

      {workspaceMode === 'classic' && <RightSidebar />}
    </div>
  );
}
