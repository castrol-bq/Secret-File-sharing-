import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, UploadCloud, Shield, Lock, Clock, Flame, 
  Copy, Check, AlertTriangle, Key, Trash2, Eye, QrCode, Sparkles, X, ChevronDown 
} from 'lucide-react';
import { encryptPayload, generateSecretKey } from '../lib/crypto';
import { generateQRCodeSVG } from '../lib/qrcode';
import { useToast } from './Toast';

interface VaultCreateProps {
  onVaultCreated?: (token: string) => void;
  onViewCreatedVault?: (token: string, key?: string) => void;
}

export const VaultCreate: React.FC<VaultCreateProps> = ({ onViewCreatedVault }) => {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [secretText, setSecretText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ttlSeconds, setTtlSeconds] = useState(3600); // 1 hour default
  const [burnOnRead, setBurnOnRead] = useState(true);
  const [password, setPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [enableE2EE, setEnableE2EE] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Result state
  const [createdVault, setCreatedVault] = useState<{
    token: string;
    encryptionKey?: string;
    expiresAt: number;
    burnOnRead: boolean;
    viewsRemaining: number;
    hasPassword: boolean;
    isText: boolean;
    filename?: string;
    size: number;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  const [burnedSuccess, setBurnedSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const timerOptions = [
    { label: '🔥 After 1 view', value: 0, burn: true },
    { label: '⚡ 5 minutes', value: 300, burn: false },
    { label: '🕒 1 hour', value: 3600, burn: false },
    { label: '🌙 24 hours', value: 86400, burn: false },
    { label: '📅 7 days', value: 604800, burn: false },
  ];

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === 'text' && !secretText.trim()) {
      setErrorMessage('Please write something in your secret note.');
      return;
    }

    if (mode === 'file' && !selectedFile) {
      setErrorMessage('Please select a file to share.');
      return;
    }

    setIsSubmitting(true);

    try {
      let clientEncryptionKey: string | undefined = undefined;
      let textToSend = secretText;

      // If text mode and E2EE enabled: encrypt client-side first
      if (mode === 'text' && enableE2EE) {
        clientEncryptionKey = await generateSecretKey();
        const encrypted = await encryptPayload(secretText, clientEncryptionKey);
        textToSend = JSON.stringify({
          e2ee: true,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
        });
      }

      let response: Response;

      if (mode === 'text') {
        response = await fetch('/api/vault/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'text',
            text: textToSend,
            ttlSeconds,
            burnOnRead,
            maxViews: burnOnRead ? 1 : 5,
            password: password.trim() || undefined,
          }),
        });
      } else {
        const formData = new FormData();
        formData.append('file', selectedFile!);
        formData.append('ttlSeconds', ttlSeconds.toString());
        formData.append('burnOnRead', burnOnRead ? 'true' : 'false');
        formData.append('maxViews', burnOnRead ? '1' : '5');
        if (password.trim()) {
          formData.append('password', password.trim());
        }

        response = await fetch('/api/vault/upload', {
          method: 'POST',
          body: formData,
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create secret.');
      }

      setCreatedVault({
        token: data.token,
        encryptionKey: clientEncryptionKey,
        expiresAt: data.expiresAt,
        burnOnRead: data.burnOnRead,
        viewsRemaining: data.viewsRemaining,
        hasPassword: data.hasPassword,
        isText: mode === 'text',
        filename: selectedFile?.name,
        size: data.size || 0,
      });

      showToast({
        message: 'Secret created successfully! 🚀',
        subtext: 'Copy the link below to share with your recipient.',
        type: 'success',
      });

    } catch (err: any) {
      setErrorMessage(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getVaultShareUrl = () => {
    if (!createdVault) return '';
    const origin = window.location.origin;
    const base = `${origin}#/vault/${createdVault.token}`;
    if (createdVault.encryptionKey) {
      return `${base}?key=${createdVault.encryptionKey}`;
    }
    return base;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getVaultShareUrl());
      setCopied(true);
      showToast({
        message: 'Link copied to clipboard! 📋',
        subtext: 'Send it to your recipient through any messaging app.',
        type: 'success',
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handlePanicBurn = async () => {
    if (!createdVault) return;
    setIsBurning(true);
    try {
      const res = await fetch(`/api/vault/burn/${createdVault.token}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setBurnedSuccess(true);
        showToast({
          message: 'Secret deleted permanently! 💥',
          subtext: 'The link is now destroyed and will return 404.',
          type: 'burn',
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsBurning(false);
    }
  };

  const resetCreator = () => {
    setCreatedVault(null);
    setBurnedSuccess(false);
    setSecretText('');
    setSelectedFile(null);
    setPassword('');
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6">
      
      {/* Title & Introduction */}
      <div className="mb-8 text-center space-y-2">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-medium"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Self-destructing secure link</span>
        </motion.div>
        
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Send a Private Secret
        </h1>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Share sensitive passwords, notes, or files. Once opened or expired, it disappears forever.
        </p>
      </div>

      {/* Result Card (When Secret is Created) */}
      <AnimatePresence mode="wait">
        {createdVault ? (
          <motion.div
            key="created"
            initial={{ opacity: 0, y: 15, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card-cyan rounded-3xl p-6 sm:p-8 space-y-6 relative"
          >
            {burnedSuccess ? (
              <div className="text-center py-8 space-y-3">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                  <Flame className="w-8 h-8 animate-bounce" />
                </div>
                <h3 className="text-xl font-bold text-white">Secret permanently deleted</h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                  All contents have been shredded from memory. The link is now dead and cannot be recovered.
                </p>
                <div className="pt-3">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={resetCreator}
                    className="px-5 py-2.5 text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-2xl transition-all"
                  >
                    Send Another Secret
                  </motion.button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-cyan-500/20 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-white">
                        Your Secret Link is Ready
                      </h2>
                      <p className="text-xs text-cyan-300/80">
                        Share this link with your recipient.
                      </p>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowQRModal(true)}
                    className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs flex items-center gap-1.5 font-medium transition-colors"
                    title="Show QR Code"
                  >
                    <QrCode className="w-4 h-4" />
                    <span className="hidden sm:inline">QR Code</span>
                  </motion.button>
                </div>

                {/* Share URL Box */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300">
                    Recipient Link:
                  </label>
                  <div className="flex items-center gap-2 p-2 bg-[#0a0f1d] border border-cyan-500/30 rounded-2xl shadow-inner">
                    <input
                      type="text"
                      readOnly
                      value={getVaultShareUrl()}
                      className="w-full bg-transparent px-2 text-xs sm:text-sm text-cyan-200 select-all focus:outline-none truncate"
                    />
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={handleCopyLink}
                      className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/30 shrink-0"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>

                {/* Friendly Info Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
                    <span className="text-slate-400 block text-[11px]">Self-Destruct</span>
                    <span className="text-amber-300 font-medium mt-0.5 block flex items-center gap-1">
                      {createdVault.burnOnRead ? '🔥 Right after reading' : `${createdVault.viewsRemaining} views max`}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
                    <span className="text-slate-400 block text-[11px]">Expires</span>
                    <span className="text-cyan-300 font-medium mt-0.5 block">
                      {new Date(createdVault.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl col-span-2 sm:col-span-1">
                    <span className="text-slate-400 block text-[11px]">Privacy</span>
                    <span className="text-emerald-300 font-medium mt-0.5 block">
                      {createdVault.encryptionKey ? '🔒 E2E Encrypted' : 'Protected'}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onViewCreatedVault) {
                        onViewCreatedVault(createdVault.token, createdVault.encryptionKey);
                      }
                    }}
                    className="px-4 py-2 text-xs font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-950/40 hover:bg-cyan-950/70 border border-cyan-800/80 rounded-xl flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview how recipient sees it</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePanicBurn}
                      disabled={isBurning}
                      className="px-3.5 py-2 text-xs font-medium text-red-300 hover:text-red-200 bg-red-950/30 hover:bg-red-950/60 border border-red-800/60 rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isBurning ? 'Deleting...' : 'Delete now'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={resetCreator}
                      className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors"
                    >
                      New Secret
                    </button>
                  </div>
                </div>

                {/* Animated QR Code Pop-up Modal */}
                <AnimatePresence>
                  {showQRModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.85, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.85, y: 15 }}
                        className="glass-card-cyan rounded-3xl p-6 max-w-sm w-full space-y-4 border border-cyan-500/40 shadow-2xl relative"
                      >
                        <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <QrCode className="w-4 h-4 text-cyan-400" />
                            <span>Scan to Open Secret</span>
                          </h3>
                          <button
                            onClick={() => setShowQRModal(false)}
                            className="p-1 rounded-full text-slate-400 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="p-3 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                          <img
                            src={generateQRCodeSVG(getVaultShareUrl(), 220)}
                            alt="QR code"
                            className="w-48 h-48"
                          />
                        </div>

                        <p className="text-xs text-center text-slate-300">
                          Scan with any phone camera to unlock this secret.
                        </p>

                        <button
                          onClick={() => setShowQRModal(false)}
                          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
                        >
                          Done
                        </button>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        ) : (
          /* Create Form */
          <motion.form
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleSubmit}
            className="glass-card rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative"
          >
            {/* Mode Switcher: Note vs File */}
            <div className="flex items-center p-1.5 bg-slate-900/90 border border-slate-800/80 rounded-2xl gap-1">
              <button
                type="button"
                onClick={() => setMode('text')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  mode === 'text'
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-200 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Secret Note</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('file')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  mode === 'file'
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-200 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UploadCloud className="w-4 h-4 text-cyan-400" />
                <span>Secret File</span>
              </button>
            </div>

            {/* Note Input */}
            {mode === 'text' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-slate-300 font-medium flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Your Secret Message:</span>
                  </label>
                  <span className="text-slate-500">{secretText.length} characters</span>
                </div>
                <textarea
                  value={secretText}
                  onChange={(e) => setSecretText(e.target.value)}
                  placeholder="Paste passwords, private keys, sensitive messages, or codes here..."
                  rows={6}
                  className="w-full p-4 bg-[#0a0f1d] border border-slate-800 rounded-2xl text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all resize-y"
                />

                {/* Friendly E2EE Pill */}
                <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-400">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-200 block">
                        Browser End-to-End Encryption
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        Encrypted in your browser before sending. Even Jailoroom cannot read it.
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    id="e2ee-toggle"
                    checked={enableE2EE}
                    onChange={(e) => setEnableE2EE(e.target.checked)}
                    className="w-4 h-4 rounded-md bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* File Upload Mode */}
            {mode === 'file' && (
              <div className="space-y-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
                    selectedFile
                      ? 'border-cyan-500/60 bg-cyan-950/20'
                      : 'border-slate-800 hover:border-cyan-500/40 bg-[#0a0f1d]/60 hover:bg-[#0a0f1d]'
                  }`}
                >
                  {selectedFile ? (
                    <div className="space-y-2">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                        <Check className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-white">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Click or drop to replace
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-white">
                        Drag and drop your file here, or browse
                      </p>
                      <p className="text-xs text-slate-400">
                        Photos, documents, PDFs, keys (up to 50 MB)
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Self-Destruct Timer (Bubbly pills) */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>When should it self-destruct?</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {timerOptions.map((opt) => {
                  const isSelected = opt.burn ? burnOnRead : (!burnOnRead && ttlSeconds === opt.value);
                  return (
                    <motion.button
                      key={opt.label}
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        if (opt.burn) {
                          setBurnOnRead(true);
                          setTtlSeconds(3600); // 1 hour safety net
                        } else {
                          setBurnOnRead(false);
                          setTtlSeconds(opt.value);
                        }
                      }}
                      className={`p-2.5 rounded-2xl text-xs font-medium text-center border transition-all ${
                        isSelected
                          ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40 shadow-sm'
                          : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Expandable Password Protection Pill */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowPasswordInput(!showPasswordInput)}
                className="text-xs font-medium text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                <Key className="w-3.5 h-3.5 text-cyan-400" />
                <span>{showPasswordInput ? 'Hide extra password option' : '+ Add an optional unlock password'}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showPasswordInput ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showPasswordInput && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Optional password (recipient must enter this to unlock)"
                      className="w-full p-3 bg-[#0a0f1d] border border-slate-800 rounded-2xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500/60"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-950/40 border border-red-500/30 rounded-2xl text-xs text-red-300 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </motion.div>
            )}

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? 'Creating safe link...' : 'Create Secret Link ✨'}</span>
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>

    </div>
  );
};
