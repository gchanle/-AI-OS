'use client';
import { useEffect, useState } from 'react';
import LandingView from '@/components/LandingView';
import LeftSidebar from '@/components/LeftSidebar';
import ChatArea from '@/components/ChatArea';
import RightSidebar from '@/components/RightSidebar';
import {
  campusCapabilities,
  defaultCapabilityIds,
  defaultChatModelId,
  sortCapabilityIds,
} from '@/data/workspace';
import './home.css';

export default function Home() {
  const [chatStarted, setChatStarted] = useState(false);
  const [initialMessage, setInitialMessage] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState(defaultCapabilityIds);
  const [preferredModelId, setPreferredModelId] = useState(defaultChatModelId);

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
        })
      );
    } catch (error) {
      console.error('Failed to persist workspace preferences:', error);
    }
  }, [selectedCapabilityIds, preferredModelId]);

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
    <div className={`home-layout ${chatStarted ? 'chat-mode' : 'landing-mode'}`}>
      {/* 全局背景修饰（蓝白色块） */}
      <div className="global-bg">
        <div className="bg-orb bg-orb-1"></div>
        <div className="bg-orb bg-orb-2"></div>
        <div className="bg-orb bg-orb-3"></div>
      </div>

      {/* 侧边栏始终存在 */}
      <LeftSidebar onNewChat={handleReset} onSelectSession={handleSelectSession} />

      <div className="main-content">
        {/* 只在主区域切换 落地页 / 聊天页 */}
        {!chatStarted ? (
          <LandingView
            onStartChat={handleStartChat}
            capabilities={campusCapabilities}
            selectedCapabilityIds={selectedCapabilityIds}
            onToggleCapability={handleToggleCapability}
          />
        ) : (
          <ChatArea
            initialMessage={initialMessage}
            sessionId={currentSessionId}
            defaultCapabilityIds={selectedCapabilityIds}
            preferredModelId={preferredModelId}
            onPreferredModelChange={setPreferredModelId}
          />
        )}
      </div>

      <RightSidebar />
    </div>
  );
}
