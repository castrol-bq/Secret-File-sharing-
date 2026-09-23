import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, Users, Lock, Clock, Send, 
  Trash2, Copy, Check, Eye, EyeOff, Paperclip, 
  FileText, QrCode, Sparkles, X, ShieldCheck, LogOut, Flame, Smile 
} from 'lucide-react';
import { 
  generateRandomCodename, 
  CYBER_COLORS, 
  encryptPayload, 
  decryptPayload, 
  generateSecretKey 
} from '../lib/crypto';
import { generateQRCodeSVG } from '../lib/qrcode';
import { useToast } from './Toast';

interface ChatMember {
  socketId: string;
  codename: string;
  color: string;
  joinedAt: number;
  isHost: boolean;
}

interface ChatMessage {
  id: string;
  senderName: string;
  senderColor: string;
  senderSocketId: string;
  timestamp: number;
  text?: string;
  fileData?: {
    filename: string;
    size: number;
    mimeType: string;
    dataUrl: string;
  };
  isEncrypted: boolean;
  iv?: string;
  ttlSeconds?: number;
  burnAt?: number;
}

interface ChatRoomProps {
  initialRoomId?: string;
  initialKey?: string;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ initialRoomId, initialKey }) => {
  const { showToast } = useToast();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Lobby states
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [roomName, setRoomName] = useState('Private Chat');
  const [ttlMinutes, setTtlMinutes] = useState(60);
  const [passcode, setPasscode] = useState('');
  const [joinRoomId, setJoinRoomId] = useState(initialRoomId || '');
  const [joinPasscode, setJoinPasscode] = useState('');
  const [e2eeEnabled, setE2eeEnabled] = useState(true);
  const [roomSecretKey, setRoomSecretKey] = useState(initialKey || '');

  // Identity state
  const [myCodename, setMyCodename] = useState(generateRandomCodename());
  const [myColor, setMyColor] = useState(CYBER_COLORS[0]);

  // Active room state
  const [currentRoom, setCurrentRoom] = useState<{
    id: string;
    name: string;
    createdAt: number;
    expiresAt: number;
    hasPasscode: boolean;
    isHost: boolean;
  } | null>(null);

  const [members, setMembers] = useState<ChatMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [messageTtl, setMessageTtl] = useState<number | undefined>(undefined);
  const [attachedFile, setAttachedFile] = useState<{
    filename: string;
    size: number;
    mimeType: string;
    dataUrl: string;
  } | null>(null);

  // Status & modal toggles
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [nukedNotice, setNukedNotice] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [timeRemainingStr, setTimeRemainingStr] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  // Socket init
  useEffect(() => {
    const s = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => setIsConnected(true));
    s.on('disconnect', () => setIsConnected(false));
    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  // Room events
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = async (msg: ChatMessage) => {
      if (msg.isEncrypted && msg.text && msg.iv && roomSecretKey) {
        try {
          const decrypted = await decryptPayload(msg.text, msg.iv, roomSecretKey);
          msg.text = decrypted;
        } catch {
          msg.text = '[Decryption error]';
        }
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    const handleUserJoined = ({ member, systemMessage }: any) => {
      setMembers((prev) => {
        if (prev.some((m) => m.socketId === member.socketId)) return prev;
        return [...prev, member];
      });
      addSystemNotice(systemMessage);
    };

    const handleUserLeft = ({ socketId, systemMessage }: any) => {
      setMembers((prev) => prev.filter((m) => m.socketId !== socketId));
      addSystemNotice(systemMessage);
    };

    const handleRoomNuked = ({ reason }: any) => {
      setNukedNotice(reason || 'The room has ended and all messages were erased.');
      setCurrentRoom(null);
      setMessages([]);
      setMembers([]);
      showToast({
        message: 'Chat room closed & wiped! 💨',
        type: 'burn',
      });
    };

    const handleTyping = ({ codename, isTyping }: any) => {
      setTypingUsers((prev) => {
        if (isTyping) {
          if (!prev.includes(codename)) return [...prev, codename];
          return prev;
        } else {
          return prev.filter((name) => name !== codename);
        }
      });
    };

    const handleMessageBurned = ({ messageId }: any) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    };

    socket.on('room:new-message', handleNewMessage);
    socket.on('room:user-joined', handleUserJoined);
    socket.on('room:user-left', handleUserLeft);
    socket.on('room:nuked', handleRoomNuked);
    socket.on('room:typing', handleTyping);
    socket.on('message:burned', handleMessageBurned);

    return () => {
      socket.off('room:new-message', handleNewMessage);
      socket.off('room:user-joined', handleUserJoined);
      socket.off('room:user-left', handleUserLeft);
      socket.off('room:nuked', handleRoomNuked);
      socket.off('room:typing', handleTyping);
      socket.off('message:burned', handleMessageBurned);
    };
  }, [socket, roomSecretKey]);

  const addSystemNotice = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}-${Math.random()}`,
        senderName: 'SYSTEM',
        senderColor: '#64748b',
        senderSocketId: 'system',
        timestamp: Date.now(),
        text,
        isEncrypted: false,
      },
    ]);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Expiration ticker
  useEffect(() => {
    if (!currentRoom) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = currentRoom.expiresAt - now;

      if (diff <= 0) {
        setTimeRemainingStr('Expired');
        setCurrentRoom(null);
        setNukedNotice('Room time has expired. All messages have vanished.');
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeRemainingStr(`${hours > 0 ? `${hours}h ` : ''}${mins}m ${secs}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentRoom]);

  // Auto-fill roomId from URL
  useEffect(() => {
    if (initialRoomId && socket && isConnected && !currentRoom) {
      setJoinRoomId(initialRoomId);
      setMode('join');
    }
  }, [initialRoomId, socket, isConnected, currentRoom]);

  // Create room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket) return;
    setErrorMessage(null);
    setNukedNotice(null);

    let key = roomSecretKey;
    if (e2eeEnabled && !key) {
      key = await generateSecretKey();
      setRoomSecretKey(key);
    }

    socket.emit(
      'room:create',
      {
        name: roomName,
        ttlMinutes,
        passcode: passcode.trim() || undefined,
        codename: myCodename,
        color: myColor,
      },
      (res: any) => {
        if (!res.success) {
          setErrorMessage(res.error || 'Failed to create room.');
          return;
        }

        setCurrentRoom(res.room);
        setMembers(res.room.members);
        setMessages([
          {
            id: 'init-0',
            senderName: 'SYSTEM',
            senderColor: '#06b6d4',
            senderSocketId: 'system',
            timestamp: Date.now(),
            text: `Welcome to "${res.room.name}". Messages vanish once the room ends.`,
            isEncrypted: false,
          },
        ]);

        showToast({
          message: 'Chat room created! 🎉',
          subtext: 'Invite someone using the link or QR code.',
          type: 'success',
        });
      }
    );
  };

  // Join room
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !joinRoomId.trim()) return;
    setErrorMessage(null);
    setNukedNotice(null);

    socket.emit(
      'room:join',
      {
        roomId: joinRoomId.trim().toLowerCase(),
        passcode: joinPasscode.trim() || undefined,
        codename: myCodename,
        color: myColor,
      },
      async (res: any) => {
        if (!res.success) {
          setErrorMessage(res.error || 'Could not join room. Check code or password.');
          return;
        }

        setCurrentRoom(res.room);
        setMembers(res.room.members);

        if (res.room.recentMessages) {
          const decryptedMsgs = await Promise.all(
            res.room.recentMessages.map(async (m: ChatMessage) => {
              if (m.isEncrypted && m.text && m.iv && roomSecretKey) {
                try {
                  const d = await decryptPayload(m.text, m.iv, roomSecretKey);
                  return { ...m, text: d };
                } catch {
                  return { ...m, text: '[Decryption key mismatch]' };
                }
              }
              return m;
            })
          );
          setMessages(decryptedMsgs);
        }

        showToast({
          message: 'Joined chat room! 👋',
          type: 'success',
        });
      }
    );
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !currentRoom) return;
    if (!inputMessage.trim() && !attachedFile) return;

    let payloadText = inputMessage.trim();
    let isEncrypted = false;
    let iv: string | undefined = undefined;

    if (e2eeEnabled && roomSecretKey && payloadText) {
      try {
        const encrypted = await encryptPayload(payloadText, roomSecretKey);
        payloadText = encrypted.ciphertext;
        iv = encrypted.iv;
        isEncrypted = true;
      } catch (err) {
        console.error(err);
      }
    }

    socket.emit(
      'room:message',
      {
        roomId: currentRoom.id,
        text: payloadText,
        fileData: attachedFile || undefined,
        isEncrypted,
        iv,
        ttlSeconds: messageTtl,
      },
      () => {
        setInputMessage('');
        setAttachedFile(null);
        socket.emit('room:typing', { roomId: currentRoom.id, isTyping: false });
      }
    );
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
    if (!socket || !currentRoom) return;
    socket.emit('room:typing', { roomId: currentRoom.id, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('room:typing', { roomId: currentRoom.id, isTyping: false });
    }, 1500);
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      showToast({
        message: 'File too large',
        subtext: 'Temporary transfer limit is 8 MB.',
        type: 'warning',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        filename: file.name,
        size: file.size,
        mimeType: file.type,
        dataUrl: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleCloseRoom = () => {
    if (!socket || !currentRoom) return;
    socket.emit('room:nuke', { roomId: currentRoom.id }, () => {
      setNukedNotice('Room was closed. All messages are erased.');
      setCurrentRoom(null);
      setMessages([]);
      setMembers([]);
      setShowConfirmClose(false);
      showToast({
        message: 'Room deleted permanently 💨',
        type: 'burn',
      });
    });
  };

  const handleLeaveRoom = () => {
    if (!socket || !currentRoom) return;
    socket.emit('room:leave', { roomId: currentRoom.id });
    setCurrentRoom(null);
    setMessages([]);
    setMembers([]);
  };

  const getRoomShareLink = () => {
    if (!currentRoom) return '';
    let link = `${window.location.origin}/#/chat/${currentRoom.id}`;
    if (roomSecretKey) {
      link += `?key=${roomSecretKey}`;
    }
    return link;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getRoomShareLink());
      setCopiedLink(true);
      showToast({
        message: 'Chat link copied! 📋',
        subtext: 'Send it to your friends to invite them.',
        type: 'success',
      });
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6">
      
      {/* Active Room View */}
      {currentRoom ? (
        <div className="glass-card rounded-3xl border border-cyan-500/25 shadow-2xl flex flex-col h-[78vh] overflow-hidden relative">
          
          {/* Room Header */}
          <div className="p-4 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-slate-950 shadow-md shrink-0"
                style={{ backgroundColor: myColor }}
              >
                {myCodename.slice(0, 2).toUpperCase()}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-white truncate">
                    {currentRoom.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/25 text-[10px] text-cyan-300 font-semibold shrink-0">
                    {members.length} {members.length === 1 ? 'person' : 'people'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <span className="truncate">You: <b className="text-slate-200">{myCodename}</b></span>
                  {timeRemainingStr && (
                    <span className="text-cyan-400 font-medium">· ⏱️ {timeRemainingStr}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowShareModal(true)}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/35 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Invite</span>
              </motion.button>

              <button
                onClick={() => setShowConfirmClose(true)}
                className="p-2 rounded-xl text-red-400 hover:bg-red-500/15 transition-colors"
                title="End & Delete Chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                onClick={handleLeaveRoom}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Leave room"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-3.5 soft-glow-bg">
            {messages.map((msg) => {
              const isMe = msg.senderSocketId === socket?.id;
              const isSys = msg.senderSocketId === 'system';

              if (isSys) {
                return (
                  <div key={msg.id} className="text-center my-2">
                    <span className="inline-block px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-400">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: msg.senderColor }}
                    />
                    <span className="font-semibold text-slate-300">
                      {isMe ? 'You' : msg.senderName}
                    </span>
                    <span>· {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.ttlSeconds && (
                      <span className="text-amber-400 flex items-center gap-0.5">
                        <Flame className="w-3 h-3" />
                        <span>{msg.ttlSeconds}s</span>
                      </span>
                    )}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`max-w-[85%] sm:max-w-[70%] p-3.5 rounded-3xl text-sm leading-relaxed shadow-md ${
                      isMe
                        ? 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 font-medium rounded-br-md shadow-cyan-500/15'
                        : 'bg-slate-900/90 text-slate-100 border border-slate-800 rounded-bl-md shadow-black/30'
                    }`}
                  >
                    {msg.text && (
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    )}

                    {/* Image / File Attachment preview */}
                    {msg.fileData && (
                      <div className="mt-2 space-y-1.5">
                        {msg.fileData.mimeType.startsWith('image/') ? (
                          <img
                            src={msg.fileData.dataUrl}
                            alt={msg.fileData.filename}
                            className="rounded-2xl max-h-56 w-auto object-cover border border-white/20 shadow-inner"
                          />
                        ) : (
                          <div className={`p-3 rounded-2xl flex items-center gap-2 ${isMe ? 'bg-black/15 text-slate-950' : 'bg-slate-800/80 text-slate-200'}`}>
                            <FileText className="w-5 h-5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold truncate">{msg.fileData.filename}</p>
                              <p className="text-[10px] opacity-75">{(msg.fileData.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <a
                              href={msg.fileData.dataUrl}
                              download={msg.fileData.filename}
                              className={`p-1.5 rounded-xl font-bold text-xs ${isMe ? 'bg-slate-950 text-white' : 'bg-cyan-500 text-slate-950'}`}
                            >
                              Get
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div className="px-4 py-1 text-[11px] text-cyan-300 italic bg-slate-950/60 flex items-center gap-1.5">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-100"></span>
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-200"></span>
              </span>
              <span>{typingUsers.join(', ')} is typing...</span>
            </div>
          )}

          {/* Attached file thumbnail before sending */}
          {attachedFile && (
            <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="truncate text-cyan-300 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                <span>{attachedFile.filename}</span>
              </span>
              <button
                onClick={() => setAttachedFile(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-0.5"
              >
                Remove
              </button>
            </div>
          )}

          {/* Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-slate-900/95 border-t border-slate-800/80 flex items-center gap-2"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileAttach}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-2xl text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors shrink-0"
              title="Attach photo or file"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Message Self-Destruct Bubble Pill Toggle */}
            <button
              type="button"
              onClick={() => {
                if (!messageTtl) setMessageTtl(15);
                else if (messageTtl === 15) setMessageTtl(60);
                else setMessageTtl(undefined);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors ${
                messageTtl
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-800/60'
              }`}
              title="Message self-destruct timer"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>{messageTtl ? `${messageTtl}s` : 'Keep'}</span>
            </button>

            <input
              type="text"
              value={inputMessage}
              onChange={handleInputChange}
              placeholder="Type a disappearing message..."
              className="flex-1 bg-[#0a0f1d] border border-slate-800 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60"
            />

            <motion.button
              type="submit"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={!inputMessage.trim() && !attachedFile}
              className="p-2.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold disabled:opacity-40 transition-colors shadow-md shadow-cyan-500/20 shrink-0"
            >
              <Send className="w-4 h-4" />
            </motion.button>
          </form>

          {/* Share Modal */}
          <AnimatePresence>
            {showShareModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: 15 }}
                  className="glass-card-cyan rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl relative"
                >
                  <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <span>Invite to this Chat</span>
                    </h3>
                    <button
                      onClick={() => setShowShareModal(false)}
                      className="p-1 rounded-full text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                    <img
                      src={generateQRCodeSVG(getRoomShareLink(), 200)}
                      alt="Room QR"
                      className="w-44 h-44"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 font-medium">Room Invite Link:</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={getRoomShareLink()}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-cyan-200 truncate focus:outline-none"
                      />
                      <button
                        onClick={handleCopyLink}
                        className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shrink-0"
                      >
                        {copiedLink ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 text-center">
                    Anyone with this link can join until the room ends.
                  </p>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Confirm Close Modal */}
          <AnimatePresence>
            {showConfirmClose && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: 15 }}
                  className="glass-card rounded-3xl p-6 max-w-sm w-full space-y-4 border border-red-500/40 shadow-2xl"
                >
                  <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
                    <Trash2 className="w-6 h-6" />
                  </div>

                  <div className="text-center space-y-1">
                    <h3 className="text-base font-bold text-white">Delete and Close Room?</h3>
                    <p className="text-xs text-slate-400">
                      This will disconnect all members and wipe all messages permanently. This cannot be undone.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setShowConfirmClose(false)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCloseRoom}
                      className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30"
                    >
                      Delete Room
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

        </div>
      ) : (
        /* Lobby View */
        <div className="space-y-6">
          
          <div className="text-center space-y-2">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-medium"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Temporary Private Chat</span>
            </motion.div>

            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Disposable Chat Room
            </h1>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Zero logs. No chat history is saved. When the room closes, everything disappears forever.
            </p>
          </div>

          {/* Nuked Notice */}
          {nukedNotice && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-3"
            >
              <Flame className="w-5 h-5 text-amber-400 shrink-0" />
              <span>{nukedNotice}</span>
            </motion.div>
          )}

          {/* Lobby Card */}
          <div className="glass-card rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            
            {/* Create vs Join Pills */}
            <div className="flex items-center p-1.5 bg-slate-900/90 border border-slate-800/80 rounded-2xl gap-1">
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  mode === 'create'
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-200 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create a Room
              </button>
              <button
                type="button"
                onClick={() => setMode('join')}
                className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  mode === 'join'
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-200 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Join with Code
              </button>
            </div>

            {/* Identity Customizer Pill */}
            <div className="p-4 bg-[#0a0f1d] border border-slate-800 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-slate-950 shrink-0 shadow-md"
                  style={{ backgroundColor: myColor }}
                >
                  {myCodename.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] text-slate-400 block">Your Chat Alias</span>
                  <input
                    type="text"
                    value={myCodename}
                    onChange={(e) => setMyCodename(e.target.value)}
                    className="text-sm font-bold text-white bg-transparent focus:outline-none truncate w-full"
                  />
                </div>
              </div>

              {/* Color bubbles */}
              <div className="flex items-center gap-1.5 shrink-0">
                {CYBER_COLORS.slice(0, 4).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setMyColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${
                      myColor === c ? 'scale-125 border-white' : 'border-transparent hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Mode: Create Form */}
            {mode === 'create' ? (
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Room Name:</label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. Project Discussion, Private Chat"
                    className="w-full p-3 bg-[#0a0f1d] border border-slate-800 rounded-2xl text-slate-100 text-sm focus:outline-none focus:border-cyan-500/60"
                  />
                </div>

                {/* Duration Pills */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Room Duration:</span>
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '15 mins', val: 15 },
                      { label: '1 hour', val: 60 },
                      { label: '6 hours', val: 360 },
                      { label: '24 hours', val: 1440 },
                    ].map((item) => (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => setTtlMinutes(item.val)}
                        className={`p-2 rounded-xl text-xs font-medium border transition-all ${
                          ttlMinutes === item.val
                            ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40 shadow-sm'
                            : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Passcode */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Optional Passcode (leave blank for open room):
                  </label>
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Optional room password"
                    className="w-full p-3 bg-[#0a0f1d] border border-slate-800 rounded-2xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500/60"
                  />
                </div>

                {errorMessage && (
                  <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-2xl text-xs text-red-300">
                    {errorMessage}
                  </div>
                )}

                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 transition-all"
                >
                  Create Chat Room ✨
                </motion.button>
              </form>
            ) : (
              /* Mode: Join Form */
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Room Code or Link:</label>
                  <input
                    type="text"
                    value={joinRoomId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.includes('#/chat/')) {
                        const after = val.split('#/chat/')[1];
                        const [r, q] = after.split('?');
                        setJoinRoomId(r);
                        if (q) {
                          const p = new URLSearchParams(q);
                          const k = p.get('key');
                          if (k) setRoomSecretKey(k);
                        }
                      } else {
                        setJoinRoomId(val);
                      }
                    }}
                    placeholder="Paste room code or full invite URL"
                    className="w-full p-3 bg-[#0a0f1d] border border-slate-800 rounded-2xl text-slate-100 text-sm focus:outline-none focus:border-cyan-500/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Passcode (if required):</label>
                  <input
                    type="password"
                    value={joinPasscode}
                    onChange={(e) => setJoinPasscode(e.target.value)}
                    placeholder="Enter room password"
                    className="w-full p-3 bg-[#0a0f1d] border border-slate-800 rounded-2xl text-slate-100 text-xs focus:outline-none focus:border-cyan-500/60"
                  />
                </div>

                {errorMessage && (
                  <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-2xl text-xs text-red-300">
                    {errorMessage}
                  </div>
                )}

                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 transition-all"
                >
                  Join Chat Room →
                </motion.button>
              </form>
            )}

          </div>

        </div>
      )}

    </div>
  );
};
