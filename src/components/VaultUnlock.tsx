import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Flame, Lock, Key, Download, Copy, Check, 
  AlertTriangle, Clock, FileText, ArrowRight, Eye, RefreshCw, Sparkles 
} from 'lucide-react';
import { decryptPayload } from '../lib/crypto';
import { useToast } from './Toast';

interface VaultUnlockProps {
  initialToken?: string;
  initialKey?: string;
  onGoToCreate?: () => void;
}

interface VaultMetadata {
  id: string;
  isText: boolean;
  filename?: string;
  mimeType?: string;
  size: number;
  createdAt: number;
  expiresAt: number;
  burnOnRead: boolean;
  maxViews: number;
  viewsRemaining: number;
  hasPassword: boolean;
}

export const VaultUnlock: React.FC<VaultUnlockProps> = ({ 
  initialToken, 
  initialKey,
  onGoToCreate 
}) => {
  const { showToast } = useToast();
  const [tokenInput, setTokenInput] = useState(initialToken || '');
  const [encryptionKey, setEncryptionKey] = useState(initialKey || '');
  const [password, setPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [metadata, setMetadata] = useState<VaultMetadata | null>(null);
  const [isBurned, setIsBurned] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Unlocked content state
  const [unlockedSecret, setUnlockedSecret] = useState<string | null>(null);
  const [unlockedFileTicket, setUnlockedFileTicket] = useState<string | null>(null);
  const [wasBurnedOnUnlock, setWasBurnedOnUnlock] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');

  // Fetch metadata for given token
  const fetchMetadata = useCallback(async (token: string) => {
    if (!token.trim()) return;
    setIsLoading(true);
    setErrorMessage(null);
    setNotFound(false);
    setIsBurned(false);
    setMetadata(null);
    setUnlockedSecret(null);

    try {
      const res = await fetch(`/api/vault/meta/${encodeURIComponent(token.trim())}`);
      const data = await res.json();

      if (res.status === 410 || data.burned) {
        setIsBurned(true);
      } else if (res.status === 404) {
        setNotFound(true);
      } else if (!res.ok) {
        setErrorMessage(data.error || 'Failed to check secret.');
      } else {
        setMetadata(data);
      }
    } catch {
      setErrorMessage('Network error contacting server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialToken) {
      setTokenInput(initialToken);
      fetchMetadata(initialToken);
    }
  }, [initialToken, fetchMetadata]);

  useEffect(() => {
    if (initialKey) {
      setEncryptionKey(initialKey);
    }
  }, [initialKey]);

  // Countdown ticker
  useEffect(() => {
    if (!metadata) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = metadata.expiresAt - now;
      if (diff <= 0) {
        setTimeLeftStr('Expired');
        setIsBurned(true);
        setMetadata(null);
        clearInterval(interval);
      } else {
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        const hours = Math.floor(diff / (1000 * 60 * 60));
        setTimeLeftStr(`${hours > 0 ? `${hours}h ` : ''}${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [metadata]);

  // Unlock and reveal secret
  const handleUnlock = async () => {
    if (!tokenInput.trim()) return;
    setIsUnlocking(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/vault/unlock/${encodeURIComponent(tokenInput.trim())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: password.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to unlock secret.');
      }

      setWasBurnedOnUnlock(data.burned || false);

      if (data.isText && data.secret) {
        let finalPlaintext = data.secret;

        // Attempt E2EE client-side decryption if applicable
        try {
          const parsed = JSON.parse(data.secret);
          if (parsed.e2ee && parsed.ciphertext && parsed.iv) {
            if (!encryptionKey) {
              throw new Error('This secret is end-to-end encrypted, but no decryption key was found in the link.');
            }
            finalPlaintext = await decryptPayload(parsed.ciphertext, parsed.iv, encryptionKey);
          }
        } catch (e: any) {
          if (e.message.includes('decryption key')) {
            throw e;
          }
          // Regular text
        }

        setUnlockedSecret(finalPlaintext);
        showToast({
          message: 'Secret unlocked! ✨',
          subtext: data.burned ? 'It has been deleted from memory.' : undefined,
          type: data.burned ? 'burn' : 'success',
        });
      } else if (!data.isText && data.ticket) {
        setUnlockedFileTicket(data.ticket);
        showToast({
          message: 'File ready for download! 📥',
          type: 'success',
        });
      }

    } catch (err: any) {
      setErrorMessage(err.message || 'Incorrect password or error unlocking.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleCopySecret = async () => {
    if (!unlockedSecret) return;
    try {
      await navigator.clipboard.writeText(unlockedSecret);
      setCopied(true);
      showToast({
        message: 'Secret copied to clipboard! 📋',
        type: 'success',
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6">
      
      {/* Header */}
      <div className="mb-8 text-center space-y-2">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-medium"
        >
          <Key className="w-3.5 h-3.5" />
          <span>One-time secret reader</span>
        </motion.div>
        
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Open a Secret
        </h1>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Read a self-destructing message or download a secure file.
        </p>
      </div>

      {/* Burned / Expired State */}
      {isBurned && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-3xl p-8 text-center space-y-4 border border-red-500/30"
        >
          <div className="w-16 h-16 mx-auto rounded-3xl bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400">
            <Flame className="w-8 h-8 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-white">This secret is gone</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            It was already opened and permanently deleted, or its timer expired. Secrets cannot be recovered once burned.
          </p>
          <div className="pt-2">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onGoToCreate}
              className="px-5 py-2.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
            >
              Send a new secret ✨
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Not Found State */}
      {notFound && !isBurned && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-3xl p-8 text-center space-y-4"
        >
          <div className="w-16 h-16 mx-auto rounded-3xl bg-slate-800 flex items-center justify-center text-slate-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Secret not found</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Please check the link or code. It may have already expired or been mistyped.
          </p>
          <div className="pt-2">
            <button
              onClick={() => { setNotFound(false); setTokenInput(''); }}
              className="px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
            >
              Try another code
            </button>
          </div>
        </motion.div>
      )}

      {/* Unlocked Secret Content */}
      {(unlockedSecret || unlockedFileTicket) && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card-cyan rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Secret Revealed</h3>
                <span className="text-xs text-amber-300 flex items-center gap-1">
                  {wasBurnedOnUnlock ? '🔥 Deleted from server memory' : 'Active secret'}
                </span>
              </div>
            </div>

            {unlockedSecret && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCopySecret}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-500/20"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Text</span>
                  </>
                )}
              </motion.button>
            )}
          </div>

          {/* Text Content */}
          {unlockedSecret && (
            <div className="p-4 bg-[#0a0f1d] border border-cyan-500/25 rounded-2xl">
              <pre className="text-sm text-slate-100 font-sans whitespace-pre-wrap break-words leading-relaxed select-all">
                {unlockedSecret}
              </pre>
            </div>
          )}

          {/* File Download Button */}
          {unlockedFileTicket && (
            <div className="p-6 bg-[#0a0f1d] border border-cyan-500/30 rounded-2xl text-center space-y-3">
              <FileText className="w-10 h-10 mx-auto text-cyan-400" />
              <div>
                <p className="text-sm font-bold text-white">
                  {metadata?.filename || 'Secure File Attachment'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {metadata?.size ? `${(metadata.size / 1024 / 1024).toFixed(2)} MB` : ''}
                </p>
              </div>

              <a
                href={`/api/vault/download/${unlockedFileTicket}`}
                download={metadata?.filename || true}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-cyan-500/25"
              >
                <Download className="w-4 h-4" />
                <span>Download File Now</span>
              </a>
            </div>
          )}

          <div className="pt-2 text-center">
            <button
              onClick={onGoToCreate}
              className="text-xs text-slate-400 hover:text-cyan-300 transition-colors"
            >
              Need to send a secret of your own? Click here →
            </button>
          </div>
        </motion.div>
      )}

      {/* Pre-Unlock or Input Form */}
      {!isBurned && !notFound && !unlockedSecret && !unlockedFileTicket && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl"
        >
          {/* If token is already in URL or loaded */}
          {metadata ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white">
                      Secret Ready to Open
                    </h2>
                    <p className="text-xs text-slate-400">
                      {metadata.isText ? 'Private text message' : metadata.filename || 'Secure file'}
                    </p>
                  </div>
                </div>

                {/* Countdown Badge */}
                {timeLeftStr && (
                  <div className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-cyan-300 flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{timeLeftStr}</span>
                  </div>
                )}
              </div>

              {/* Friendly Warning Banner */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-start gap-3">
                <Flame className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold block">
                    {metadata.burnOnRead
                      ? 'One-Time Secret: Will delete right after opening!'
                      : `${metadata.viewsRemaining} views remaining before deletion.`}
                  </span>
                  <span className="text-amber-300/80 block text-[11px]">
                    Make sure you are ready to copy or read it now.
                  </span>
                </div>
              </div>

              {/* Password prompt if required */}
              {metadata.hasPassword && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Enter Secret Password:</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password required by sender"
                    className="w-full p-3.5 bg-[#0a0f1d] border border-slate-800 rounded-2xl text-slate-100 text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              {errorMessage && (
                <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-2xl text-xs text-red-300">
                  {errorMessage}
                </div>
              )}

              {/* Reveal Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleUnlock}
                disabled={isUnlocking}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50"
              >
                <Eye className="w-4 h-4" />
                <span>{isUnlocking ? 'Opening secret...' : 'Reveal Secret ✨'}</span>
              </motion.button>
            </div>
          ) : (
            /* Manual Token Entry */
            <div className="space-y-4">
              <label className="text-xs font-semibold text-slate-300 block">
                Paste Secret Link or Code:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Handle full URL pasted
                    if (val.includes('#/vault/')) {
                      const after = val.split('#/vault/')[1];
                      const [t, q] = after.split('?');
                      setTokenInput(t);
                      if (q) {
                        const p = new URLSearchParams(q);
                        const k = p.get('key');
                        if (k) setEncryptionKey(k);
                      }
                    } else {
                      setTokenInput(val);
                    }
                  }}
                  placeholder="Paste link or token here..."
                  className="flex-1 p-3 bg-[#0a0f1d] border border-slate-800 rounded-2xl text-slate-100 text-sm focus:outline-none focus:border-cyan-500/60"
                />
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => fetchMetadata(tokenInput)}
                  disabled={isLoading || !tokenInput.trim()}
                  className="px-5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs disabled:opacity-50 shadow-md shadow-cyan-500/20"
                >
                  {isLoading ? 'Checking...' : 'Check'}
                </motion.button>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-2xl text-xs text-red-300">
                  {errorMessage}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

    </div>
  );
};
