import React, { useState } from 'react';
import { X, MessageSquare, Users, Megaphone, Check } from 'lucide-react';
import { Chat, ChatType } from '../types';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateChat: (newChat: Chat) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose, onCreateChat }) => {
  const [type, setType] = useState<ChatType>('direct');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [description, setDescription] = useState('');

  // Universal Escape key listener
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

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
      type,
      online: type === 'direct',
      lastSeen: type === 'direct' ? 'online' : undefined,
      memberCount: type === 'group' ? 1 : type === 'channel' ? 1 : undefined,
      username: username.trim() ? (username.startsWith('@') ? username.trim() : `@${username.trim()}`) : undefined,
      description: description.trim() || undefined,
      unreadCount: 0,
      messages: [
        {
          id: `msg-${Date.now()}`,
          chatId: `chat-${Date.now()}`,
          senderId: 'system',
          senderName: 'Telegram',
          text: type === 'channel' ? `Channel "${name}" created.` : type === 'group' ? `Group "${name}" created.` : `Chat with ${name} started.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: 'Today',
          isOutgoing: false,
          status: 'read',
        },
      ],
    };

    onCreateChat(created);
    onClose();
    setName('');
    setUsername('');
    setDescription('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white dark:bg-[#17212b] rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Create New Conversation</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Chat Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Conversation Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('direct')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  type === 'direct'
                    ? 'border-teleforge-primary bg-red-50/70 dark:bg-red-950/40 text-teleforge-primary font-semibold'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-gray-600 dark:text-gray-300'
                }`}
              >
                <MessageSquare size={18} />
                <span className="text-xs">Direct Chat</span>
              </button>

              <button
                type="button"
                onClick={() => setType('group')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  type === 'group'
                    ? 'border-teleforge-primary bg-red-50/70 dark:bg-red-950/40 text-teleforge-primary font-semibold'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-gray-600 dark:text-gray-300'
                }`}
              >
                <Users size={18} />
                <span className="text-xs">Group</span>
              </button>

              <button
                type="button"
                onClick={() => setType('channel')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  type === 'channel'
                    ? 'border-teleforge-primary bg-red-50/70 dark:bg-red-950/40 text-teleforge-primary font-semibold'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-gray-600 dark:text-gray-300'
                }`}
              >
                <Megaphone size={18} />
                <span className="text-xs">Channel</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">
              {type === 'direct' ? 'Contact Name' : type === 'group' ? 'Group Name' : 'Channel Name'}
            </label>
            <input
              type="text"
              placeholder={type === 'direct' ? 'e.g. David Miller' : type === 'group' ? 'e.g. Product Squad' : 'e.g. Daily Tech Radar'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm focus:outline-hidden focus:border-teleforge-primary focus:ring-1 focus:ring-teleforge-primary/30"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">
              Username (Optional)
            </label>
            <input
              type="text"
              placeholder="@username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm focus:outline-hidden focus:border-teleforge-primary focus:ring-1 focus:ring-teleforge-primary/30"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">
              Description / Bio
            </label>
            <textarea
              rows={2}
              placeholder="Add a brief description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm focus:outline-hidden focus:border-teleforge-primary focus:ring-1 focus:ring-teleforge-primary/30 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-teleforge-primary text-teleforge-cream text-sm font-medium hover:bg-teleforge-hover active:bg-teleforge-active disabled:opacity-50 transition-colors shadow-sm shadow-red-950/20"
            >
              <Check size={16} /> Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
