/**
 * Jailoroom - Private, disappearing notes, files & temporary chat
 */
import React, { useState, useEffect } from 'react';
import { Header, TabType } from './components/Header';
import { VaultCreate } from './components/VaultCreate';
import { VaultUnlock } from './components/VaultUnlock';
import { ChatRoom } from './components/ChatRoom';
import { SecuritySpecs } from './components/SecuritySpecs';
import { ToastProvider } from './components/Toast';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('create');
  const [targetVaultToken, setTargetVaultToken] = useState<string | undefined>(undefined);
  const [targetVaultKey, setTargetVaultKey] = useState<string | undefined>(undefined);
  const [targetRoomId, setTargetRoomId] = useState<string | undefined>(undefined);
  const [targetRoomKey, setTargetRoomKey] = useState<string | undefined>(undefined);

  const [stats, setStats] = useState<{
    activeVaults: number;
    totalWiped: number;
    activeChatRooms: number;
  } | null>(null);

  // Parse URL hash or path for deep-linking (e.g. #/vault/xyz?key=abc or #/chat/123)
  useEffect(() => {
    const parseUrlRoute = () => {
      const hash = window.location.hash;
      const pathname = window.location.pathname;

      // Check Hash route first
      if (hash.startsWith('#/vault/')) {
        const full = hash.replace('#/vault/', '');
        const [tokenPart, queryPart] = full.split('?');
        const token = tokenPart.trim();
        let key: string | undefined = undefined;
        if (queryPart) {
          const params = new URLSearchParams(queryPart);
          key = params.get('key') || undefined;
        }
        if (token) {
          setTargetVaultToken(token);
          setTargetVaultKey(key);
          setActiveTab('unlock');
          return;
        }
      }

      if (hash.startsWith('#/chat/')) {
        const full = hash.replace('#/chat/', '');
        const [roomPart, queryPart] = full.split('?');
        const roomId = roomPart.trim();
        let key: string | undefined = undefined;
        if (queryPart) {
          const params = new URLSearchParams(queryPart);
          key = params.get('key') || undefined;
        }
        if (roomId) {
          setTargetRoomId(roomId);
          setTargetRoomKey(key);
          setActiveTab('chat');
          return;
        }
      }

      // Check Path route
      if (pathname.startsWith('/vault/')) {
        const token = pathname.replace('/vault/', '').split('/')[0];
        if (token) {
          setTargetVaultToken(token);
          setActiveTab('unlock');
          return;
        }
      }

      if (pathname.startsWith('/chat/')) {
        const roomId = pathname.replace('/chat/', '').split('/')[0];
        if (roomId) {
          setTargetRoomId(roomId);
          setActiveTab('chat');
          return;
        }
      }
    };

    parseUrlRoute();
    window.addEventListener('hashchange', parseUrlRoute);
    return () => window.removeEventListener('hashchange', parseUrlRoute);
  }, []);

  // Fetch telemetry stats
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/vault/stats');
      if (res.ok) {
        const data = await res.json();
        setStats({
          activeVaults: data.activeVaults,
          totalWiped: data.totalWiped,
          activeChatRooms: data.activeChatRooms,
        });
      }
    } catch {
      // Offline / server starting
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleViewCreatedVault = (token: string, key?: string) => {
    setTargetVaultToken(token);
    setTargetVaultKey(key);
    setActiveTab('unlock');
    window.location.hash = `#/vault/${token}${key ? `?key=${key}` : ''}`;
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col soft-glow-bg relative selection:bg-cyan-500/30 selection:text-cyan-200 overflow-x-hidden">
        
        {/* Floating animated ambient bubbles */}
        <div className="fixed top-12 left-10 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -z-10 animate-float-slow" />
        <div className="fixed bottom-20 right-10 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -z-10 animate-float-reverse" />
        <div className="fixed top-1/2 left-1/3 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -z-10 animate-float-slow" />

        {/* Friendly Top Header */}
        <Header
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            if (tab === 'create') {
              window.location.hash = '';
            }
          }}
          stats={stats}
        />

        {/* Main Content View */}
        <main className="flex-1 pb-16">
          {activeTab === 'create' && (
            <VaultCreate onViewCreatedVault={handleViewCreatedVault} />
          )}

          {activeTab === 'unlock' && (
            <VaultUnlock
              initialToken={targetVaultToken}
              initialKey={targetVaultKey}
              onGoToCreate={() => {
                setActiveTab('create');
                window.location.hash = '';
              }}
            />
          )}

          {activeTab === 'chat' && (
            <ChatRoom
              initialRoomId={targetRoomId}
              initialKey={targetRoomKey}
            />
          )}

          {activeTab === 'security' && (
            <SecuritySpecs />
          )}
        </main>

        {/* Friendly Clean Footer */}
        <footer className="border-t border-slate-800/60 bg-[#090d16]/80 backdrop-blur-md py-5 text-center text-xs text-slate-400">
          <div className="max-w-5xl mx-auto px-4 flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium text-slate-300">
              Jailoroom · Disappearing notes, files & temporary chat
            </span>
            <span className="text-slate-500">
              Zero logs · Browser encryption · Vanishes once read
            </span>
          </div>
        </footer>

      </div>
    </ToastProvider>
  );
}
