'use client';
import { useState } from 'react';
import LandingView from '@/components/LandingView';
import LeftSidebar from '@/components/LeftSidebar';
import ChatArea from '@/components/ChatArea';
import RightSidebar from '@/components/RightSidebar';
import './home.css';

export default function Home() {
  const [chatStarted, setChatStarted] = useState(false);
  const [initialMessage, setInitialMessage] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState(null);

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
          <LandingView onStartChat={handleStartChat} />
        ) : (
          <ChatArea initialMessage={initialMessage} sessionId={currentSessionId} />
        )}
      </div>

      <RightSidebar />
    </div>
  );
}
