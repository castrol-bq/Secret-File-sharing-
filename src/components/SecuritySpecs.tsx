import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ShieldCheck, Lock, Flame, EyeOff, Sparkles, 
  HelpCircle, CheckCircle2, RefreshCw, Layers 
} from 'lucide-react';

export const SecuritySpecs: React.FC = () => {
  const [stats, setStats] = useState<{
    activeVaults: number;
    totalWiped: number;
    activeChatRooms: number;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/vault/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      
      {/* Header */}
      <div className="text-center space-y-2">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-medium"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Simple, Private & Transparent</span>
        </motion.div>
        
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          How It Works & Why It's Safe
        </h1>
        <p className="text-sm text-slate-400 max-w-lg mx-auto">
          Jailoroom is built so you can share passwords, sensitive notes, and confidential files without leaving a trace.
        </p>
      </div>

      {/* Live State Card */}
      <div className="glass-card-cyan rounded-3xl p-6 shadow-xl relative">
        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-xs sm:text-sm font-bold text-white">
              Live Safe System Status
            </h2>
          </div>
          <button
            onClick={fetchStats}
            disabled={isLoading}
            className="p-1.5 text-xs text-slate-400 hover:text-cyan-300 rounded-xl bg-slate-900 border border-slate-800"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 bg-slate-900/70 border border-slate-800/80 rounded-2xl">
            <span className="text-slate-400 block text-[11px]">Active Secrets in Memory</span>
            <span className="text-xl font-bold text-cyan-300 mt-1 block">
              {stats ? stats.activeVaults : '--'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-900/70 border border-slate-800/80 rounded-2xl">
            <span className="text-slate-400 block text-[11px]">Cleanly Wiped & Shredded</span>
            <span className="text-xl font-bold text-amber-300 mt-1 block">
              {stats ? stats.totalWiped : '--'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-900/70 border border-slate-800/80 rounded-2xl col-span-2 sm:col-span-1">
            <span className="text-slate-400 block text-[11px]">Live Chat Rooms</span>
            <span className="text-xl font-bold text-emerald-300 mt-1 block">
              {stats ? stats.activeChatRooms : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* 4 Pillars Explained Simply */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Pillar 1 */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="glass-card rounded-3xl p-6 space-y-3"
        >
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">
            1. Burn-After-Reading
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            When you send a note or file set to burn after reading, it can only be opened once. The instant your recipient reveals it, the server deletes it permanently. If someone tries to open it again, it's gone.
          </p>
        </motion.div>

        {/* Pillar 2 */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="glass-card rounded-3xl p-6 space-y-3"
        >
          <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">
            2. Encrypted in Your Browser
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Before your secret note leaves your device, your browser encrypts it with AES-256. The decryption key stays exclusively in the link's hashtag (#key=...). Web browsers never send this hashtag to servers.
          </p>
        </motion.div>

        {/* Pillar 3 */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="glass-card rounded-3xl p-6 space-y-3"
        >
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">
            3. Safe Secure Erasing
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            When a secret or file is deleted, it isn't just marked as deleted—its memory is overwritten with zeroes and random noise before release. It cannot be undeleted or recovered.
          </p>
        </motion.div>

        {/* Pillar 4 */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="glass-card rounded-3xl p-6 space-y-3"
        >
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <EyeOff className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white">
            4. Disposable Live Chat
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Temporary chat rooms run entirely in temporary memory with zero database logging. As soon as a room is closed or time runs out, all messages vanish into thin air.
          </p>
        </motion.div>

      </div>

      {/* Simple 3-step timeline */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          <span>Quick 3-Step Summary</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-4 bg-[#0a0f1d] border border-slate-800 rounded-2xl space-y-1">
            <span className="text-cyan-400 font-bold block text-sm">Step 1</span>
            <p className="font-semibold text-white">You write a secret</p>
            <p className="text-slate-400 text-[11px]">Type text or drop a file, choose your timer, and copy the private link.</p>
          </div>

          <div className="p-4 bg-[#0a0f1d] border border-slate-800 rounded-2xl space-y-1">
            <span className="text-cyan-400 font-bold block text-sm">Step 2</span>
            <p className="font-semibold text-white">You share the link</p>
            <p className="text-slate-400 text-[11px]">Send via WhatsApp, Signal, Slack, or email. Only the person with the link can open it.</p>
          </div>

          <div className="p-4 bg-[#0a0f1d] border border-slate-800 rounded-2xl space-y-1">
            <span className="text-cyan-400 font-bold block text-sm">Step 3</span>
            <p className="font-semibold text-white">It self-destructs</p>
            <p className="text-slate-400 text-[11px]">Once read or expired, it is permanently erased. No trace remains.</p>
          </div>
        </div>
      </div>

    </div>
  );
};
