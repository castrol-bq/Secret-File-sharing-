import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Send, KeyRound, MessageCircle, HelpCircle } from 'lucide-react';

export type TabType = 'create' | 'unlock' | 'chat' | 'security';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  stats: {
    activeVaults: number;
    totalWiped: number;
    activeChatRooms: number;
  } | null;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, stats }) => {
  const navTabs: { id: TabType; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'create',
      label: 'Send Secret',
      icon: <Send className="w-4 h-4" />,
    },
    {
      id: 'unlock',
      label: 'Open Secret',
      icon: <KeyRound className="w-4 h-4" />,
    },
    {
      id: 'chat',
      label: 'Quick Chat',
      icon: <MessageCircle className="w-4 h-4" />,
      badge: stats && stats.activeChatRooms > 0 ? `${stats.activeChatRooms} live` : undefined,
    },
    {
      id: 'security',
      label: 'How it works',
      icon: <HelpCircle className="w-4 h-4" />,
    },
  ];

  return (
    <header className="border-b border-slate-800/60 bg-[#0b111e]/85 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-3">
          
          {/* Brand Logo & Friendly Tagline */}
          <motion.div 
            onClick={() => setActiveTab('create')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-3 cursor-pointer select-none"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">
                  Jailo<span className="text-cyan-400">room</span>
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 hidden sm:inline-flex">
                  Zero Logs
                </span>
              </div>
              <p className="text-xs text-slate-400 font-normal">
                Disappearing notes, files & chat
              </p>
            </div>
          </motion.div>

          {/* Smooth Bubbly Navigation Tabs */}
          <nav className="flex items-center p-1.5 bg-slate-900/90 border border-slate-800/80 rounded-2xl shadow-inner gap-1">
            {navTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 z-10 ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {/* Sliding Pill Indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="activeNavBubble"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                      className="absolute inset-0 bg-gradient-to-r from-cyan-500/25 to-blue-500/20 border border-cyan-400/35 rounded-xl shadow-[0_4px_16px_rgba(6,182,212,0.2)] -z-10"
                    />
                  )}
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>

                  {tab.badge && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-cyan-500 text-slate-950 font-bold ml-0.5">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Friendly Top Status Bar */}
        <div className="py-2.5 border-t border-slate-800/40 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-slate-300 font-medium text-[11px] sm:text-xs">
              Safe & Private: Nothing is permanently stored
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            {stats && stats.totalWiped > 0 ? (
              <span className="flex items-center gap-1 text-slate-300">
                <span className="text-amber-400 font-semibold">{stats.totalWiped}</span>
                <span>secrets wiped cleanly</span>
              </span>
            ) : (
              <span className="hidden sm:inline text-slate-500">
                Encrypted in browser · Wiped on read
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
