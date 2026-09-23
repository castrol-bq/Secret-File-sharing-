import React, { createContext, useContext, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Flame, Info, Sparkles, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'burn' | 'info' | 'warning';
  subtext?: string;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = ({ message, type = 'success', subtext }: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, subtext }]);

    // Auto dismiss after 3.5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Floating Animated Bubble Pop-up Container */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2.5 pointer-events-none px-4 max-w-md w-full">
        <AnimatePresence mode="sync">
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -24, scale: 0.82 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.85, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 450, damping: 28 }}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl backdrop-blur-xl border ${
                toast.type === 'burn'
                  ? 'bg-red-950/90 border-red-500/40 text-red-200 shadow-red-950/40'
                  : toast.type === 'warning'
                  ? 'bg-amber-950/90 border-amber-500/40 text-amber-200 shadow-amber-950/40'
                  : toast.type === 'info'
                  ? 'bg-slate-900/90 border-slate-700 text-slate-200 shadow-black/40'
                  : 'bg-[#0f172a]/95 border-cyan-500/40 text-cyan-100 shadow-cyan-950/30'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-inner ${
                  toast.type === 'burn'
                    ? 'bg-red-500/20 text-red-400'
                    : toast.type === 'warning'
                    ? 'bg-amber-500/20 text-amber-400'
                    : toast.type === 'info'
                    ? 'bg-slate-700/50 text-slate-300'
                    : 'bg-cyan-500/20 text-cyan-400'
                }`}
              >
                {toast.type === 'burn' ? (
                  <Flame className="w-4 h-4 animate-bounce" />
                ) : toast.type === 'warning' ? (
                  <AlertCircle className="w-4 h-4" />
                ) : toast.type === 'info' ? (
                  <Info className="w-4 h-4" />
                ) : (
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-1">
                <p className="text-xs sm:text-sm font-semibold tracking-tight text-white leading-tight">
                  {toast.message}
                </p>
                {toast.subtext && (
                  <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                    {toast.subtext}
                  </p>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
