import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  MessageSquare,
  Users,
  Megaphone,
  Check,
  Lock,
  Globe,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { Chat, ChatType } from '../types';
import { telegramApi } from '../services/telegramApi';
import { mapDialogToChat } from '../utils/telegramAdapter';
import { showToast } from './Toast';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateChat: (newChat: Chat) => void;
}

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose, onCreateChat }) => {
  const [type, setType] = useState<ChatType>('channel');
  const [isPublic, setIsPublic] = useState(true);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [description, setDescription] = useState('');

  // Live username check state
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameMessage, setUsernameMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');

  const checkTimeoutRef = useRef<any>(null);

  // Universal Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isSubmitting]);

  // Reset state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setName('');
      setUsername('');
      setDescription('');
      setIsPublic(true);
      setUsernameStatus('idle');
      setUsernameMessage('');
      setSubmitError('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Debounced live username availability check
  useEffect(() => {
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    if (type === 'direct' || !isPublic) {
      setUsernameStatus('idle');
      setUsernameMessage('');
      return;
    }

    const clean = username.replace(/^@+/, '').trim();
    if (!clean) {
      setUsernameStatus('idle');
      setUsernameMessage('');
      return;
    }

    if (clean.length < 5) {
      setUsernameStatus('invalid');
      setUsernameMessage('Username must be at least 5 characters');
      return;
    }

    if (clean.length > 32) {
      setUsernameStatus('invalid');
      setUsernameMessage('Username cannot exceed 32 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      setUsernameStatus('invalid');
      setUsernameMessage('Only letters, numbers, and underscores allowed');
      return;
    }

    if (/^[0-9]/.test(clean)) {
      setUsernameStatus('invalid');
      setUsernameMessage('Username cannot start with a number');
      return;
    }

    setUsernameStatus('checking');
    setUsernameMessage('Checking availability...');

    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await telegramApi.checkUsername(clean);
        if (result.available) {
          setUsernameStatus('available');
          setUsernameMessage(`@${clean} is available!`);
        } else {
          setUsernameStatus('taken');
          setUsernameMessage(result.error || `@${clean} is already taken`);
        }
      } catch (err: any) {
        setUsernameStatus('taken');
        setUsernameMessage(err.message || 'Could not verify username');
      }
    }, 350);

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [username, type, isPublic]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setSubmitError('');

    // If channel or group and public, validate username
    const cleanUsername = username.replace(/^@+/, '').trim();
    if (type !== 'direct' && isPublic) {
      if (!cleanUsername) {
        setSubmitError('Public conversations require a valid username');
        return;
      }
      if (usernameStatus === 'checking') {
        setSubmitError('Please wait for username verification to finish');
        return;
      }
      if (usernameStatus !== 'available') {
        setSubmitError(usernameMessage || 'Please choose an available username');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (type === 'channel' || type === 'group') {
        // Create on Telegram Cloud MTProto
        const dialog = await telegramApi.createChannelOrGroup({
          type,
          title: name.trim(),
          about: description.trim() || undefined,
          isPublic,
          username: isPublic ? cleanUsername : undefined,
        });

        const createdChat = mapDialogToChat(dialog);
        createdChat.description = description.trim() || undefined;
        createdChat.messages = [
          {
            id: `msg-${Date.now()}`,
            chatId: createdChat.id,
            senderId: 'system',
            senderName: 'TeleForge',
            text: type === 'channel' ? `Channel "${name.trim()}" created.` : `Group "${name.trim()}" created.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            date: 'Today',
            isOutgoing: false,
            status: 'read',
          },
        ];

        onCreateChat(createdChat);
        showToast(`${type === 'channel' ? 'Channel' : 'Group'} created successfully!`, 'success');
        onClose();
      } else {
        // Direct chat creation
        const colors = [
          'from-blue-500 to-indigo-600',
          'from-emerald-500 to-teal-600',
          'from-purple-500 to-pink-600',
          'from-orange-500 to-amber-600',
          'from-cyan-500 to-sky-600',
        ];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        const created: Chat = {
          id: `chat-${Date.now()}`,
          name: name.trim(),
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=2481cc,2aabee`,
          avatarColor: randomColor,
          type: 'direct',
          online: true,
          lastSeen: 'online',
          username: cleanUsername ? `@${cleanUsername}` : undefined,
          description: description.trim() || undefined,
          unreadCount: 0,
          messages: [
            {
              id: `msg-${Date.now()}`,
              chatId: `chat-${Date.now()}`,
              senderId: 'system',
              senderName: 'TeleForge',
              text: `Chat with ${name.trim()} started.`,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              date: 'Today',
              isOutgoing: false,
              status: 'read',
            },
          ],
        };

        onCreateChat(created);
        showToast('Chat created', 'success');
        onClose();
      }
    } catch (err: any) {
      console.error('[NewChatModal] Error creating conversation:', err);
      const errMsg = err?.errorMessage || err?.message || 'Failed to create conversation';
      setSubmitError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4" onClick={() => !isSubmitting && onClose()}>
      <div
        className="w-full max-w-md bg-white dark:bg-[#17212b] rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teleforge-primary" />
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {type === 'channel' ? 'New Channel' : type === 'group' ? 'New Group' : 'New Direct Chat'}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Chat Type Tabs */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Conversation Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('channel')}
                disabled={isSubmitting}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-center ${
                  type === 'channel'
                    ? 'border-teleforge-primary bg-teleforge-primary/10 text-teleforge-primary font-semibold shadow-xs'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-gray-600 dark:text-gray-300'
                }`}
              >
                <Megaphone size={20} />
                <span className="text-xs">Channel</span>
              </button>

              <button
                type="button"
                onClick={() => setType('group')}
                disabled={isSubmitting}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-center ${
                  type === 'group'
                    ? 'border-teleforge-primary bg-teleforge-primary/10 text-teleforge-primary font-semibold shadow-xs'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-gray-600 dark:text-gray-300'
                }`}
              >
                <Users size={20} />
                <span className="text-xs">Group</span>
              </button>

              <button
                type="button"
                onClick={() => setType('direct')}
                disabled={isSubmitting}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-center ${
                  type === 'direct'
                    ? 'border-teleforge-primary bg-teleforge-primary/10 text-teleforge-primary font-semibold shadow-xs'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-gray-600 dark:text-gray-300'
                }`}
              >
                <MessageSquare size={20} />
                <span className="text-xs">Direct Chat</span>
              </button>
            </div>
          </div>

          {/* Privacy Selector (Public vs Private) for Channel & Group */}
          {type !== 'direct' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Privacy Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  disabled={isSubmitting}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                    isPublic
                      ? 'border-teleforge-primary bg-teleforge-primary/10 text-teleforge-primary font-semibold'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  <Globe size={16} />
                  <span className="text-xs">Public</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  disabled={isSubmitting}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                    !isPublic
                      ? 'border-teleforge-primary bg-teleforge-primary/10 text-teleforge-primary font-semibold'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  <Lock size={16} />
                  <span className="text-xs">Private</span>
                </button>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 px-1">
                {isPublic
                  ? `Public ${type}s can be found in search and joined by anyone with a public @username link.`
                  : `Private ${type}s can only be joined via an invite link.`}
              </p>
            </div>
          )}

          {/* Name Field */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">
              {type === 'channel' ? 'Channel Name' : type === 'group' ? 'Group Name' : 'Contact Name'}{' '}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder={
                type === 'channel'
                  ? 'e.g. Daily Tech Radar'
                  : type === 'group'
                  ? 'e.g. TeleForge Community'
                  : 'e.g. David Miller'
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm focus:outline-hidden focus:border-teleforge-primary focus:ring-2 focus:ring-teleforge-primary/20"
              required
              autoFocus
            />
          </div>

          {/* Public Username Field with Live Availability Check */}
          {(type === 'direct' || isPublic) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">
                  {type === 'direct' ? 'Username (Optional)' : 'Public Link / Username'}{' '}
                  {type !== 'direct' && isPublic && <span className="text-red-500">*</span>}
                </label>
                {type !== 'direct' && isPublic && (
                  <span className="text-[11px] font-medium text-gray-400">
                    t.me/{username.replace(/^@+/, '').trim() || 'username'}
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">
                  @
                </span>
                <input
                  type="text"
                  placeholder="username"
                  value={username.replace(/^@+/, '')}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSubmitting}
                  className={`w-full pl-8 pr-10 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border text-sm focus:outline-hidden transition-colors ${
                    usernameStatus === 'available'
                      ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                      : usernameStatus === 'taken' || usernameStatus === 'invalid'
                      ? 'border-red-500 ring-1 ring-red-500/30'
                      : 'border-gray-200 dark:border-gray-700 focus:border-teleforge-primary focus:ring-2 focus:ring-teleforge-primary/20'
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                  {usernameStatus === 'checking' && (
                    <Loader2 size={16} className="animate-spin text-teleforge-primary" />
                  )}
                  {usernameStatus === 'available' && (
                    <Check size={16} className="text-emerald-500 font-bold" />
                  )}
                  {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                    <AlertCircle size={16} className="text-red-500" />
                  )}
                </div>
              </div>

              {/* Live status feedback badge */}
              {usernameMessage && (
                <div
                  className={`flex items-center gap-1.5 mt-1.5 text-xs px-1 ${
                    usernameStatus === 'available'
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : usernameStatus === 'checking'
                      ? 'text-blue-500'
                      : 'text-red-500 dark:text-red-400'
                  }`}
                >
                  {usernameMessage}
                </div>
              )}
            </div>
          )}

          {/* Description Field */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">
              Description / Bio (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="What is this conversation about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm focus:outline-hidden focus:border-teleforge-primary focus:ring-2 focus:ring-teleforge-primary/20 resize-none"
            />
          </div>

          {/* Global Submit Error Banner */}
          {submitError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs flex items-start gap-2 animate-in fade-in duration-200">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !name.trim() ||
                isSubmitting ||
                (type !== 'direct' && isPublic && usernameStatus !== 'available')
              }
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teleforge-primary text-teleforge-cream text-sm font-semibold hover:bg-teleforge-hover active:bg-teleforge-active disabled:opacity-50 transition-all shadow-sm shadow-red-950/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Creating...
                </>
              ) : (
                <>
                  <Check size={16} /> Create {type === 'channel' ? 'Channel' : type === 'group' ? 'Group' : 'Chat'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
