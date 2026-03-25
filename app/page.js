'use client';
import { useEffect, useState } from 'react';
import LandingView from '@/components/LandingView';
import LeftSidebar from '@/components/LeftSidebar';
import ChatArea from '@/components/ChatArea';
import RightSidebar from '@/components/RightSidebar';
import {
  campusCapabilities,
  chatModelOptions,
  defaultCapabilityIds,
  defaultChatModelId,
  sortCapabilityIds,
} from '@/data/workspace';
import './home.css';

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

  useEffect(() => {
    try {
      const rawPrefs = localStorage.getItem('campus_workspace_prefs');
      if (!rawPrefs) return;

      const parsedPrefs = JSON.parse(rawPrefs);
      if (Array.isArray(parsedPrefs.capabilityIds) && parsedPrefs.capabilityIds.length > 0) {
        setSelectedCapabilityIds(sortCapabilityIds(parsedPrefs.capabilityIds));
      }
      if (parsedPrefs.modelId) {
        setPreferredModelId(parsedPrefs.modelId);
      }
      if (parsedPrefs.workspaceMode) {
        setWorkspaceMode(parsedPrefs.workspaceMode);
      }
    } catch (error) {
      console.error('Failed to restore workspace preferences:', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'campus_workspace_prefs',
        JSON.stringify({
          capabilityIds: selectedCapabilityIds,
          modelId: preferredModelId,
          workspaceMode,
        })
      );
    } catch (error) {
      console.error('Failed to persist workspace preferences:', error);
    }
  }, [selectedCapabilityIds, preferredModelId, workspaceMode]);

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

  const handleStartChat = (message) => {
    setInitialMessage(message);
    setChatStarted(true);
    setCurrentSessionId(null);
  };

  const handleSelectSession = (sessionId) => {
    setCurrentSessionId(sessionId);
    setChatStarted(true);
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('current_sid', sessionId);
    }
  };

  const handleReset = () => {
    setChatStarted(false);
    setInitialMessage('');
    setCurrentSessionId(null);
    if (typeof window !== 'undefined') {
        sessionStorage.removeItem('current_sid');
    }
  };

  const handleToggleCapability = (capabilityId) => {
    setSelectedCapabilityIds((prev) => {
      if (prev.includes(capabilityId)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== capabilityId);
      }

      return sortCapabilityIds([...prev, capabilityId]);
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

      {/* 侧边栏始终存在 */}
      <LeftSidebar
        onNewChat={handleReset}
        onSelectSession={handleSelectSession}
        variant={workspaceMode}
        onQuickStart={handleStartChat}
      />

      <div className="main-content">
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
        {/* 只在主区域切换 落地页 / 聊天页 */}
        {!chatStarted ? (
          <LandingView
            onStartChat={handleStartChat}
            capabilities={campusCapabilities}
            selectedCapabilityIds={selectedCapabilityIds}
            onToggleCapability={handleToggleCapability}
            availableModels={availableModels}
            preferredModelId={preferredModelId}
            onPreferredModelChange={setPreferredModelId}
            variant={workspaceMode}
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
          />
        )}
      </div>

      {workspaceMode === 'classic' && <RightSidebar />}
    </div>
  );
}
