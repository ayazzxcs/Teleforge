import React, { useState, useMemo } from 'react';
import { X, Search, Check, Users, Radio, Bot, User } from 'lucide-react';
import { Chat } from '../types';
import { Avatar } from './Avatar';

interface ChatPickerModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  chats: Chat[];
  selectedChatIds: string[];
  onSave: (selectedIds: string[]) => void;
  onClose: () => void;
}

export const ChatPickerModal: React.FC<ChatPickerModalProps> = ({
  isOpen,
  title,
  subtitle,
  chats,
  selectedChatIds,
  onSave,
  onClose,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(selectedChatIds);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync with prop when opened
  React.useEffect(() => {
    if (isOpen) {
      setSelectedIds(selectedChatIds);
      setSearchQuery('');
    }
  }, [isOpen, selectedChatIds]);

  const filteredChats = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return chats;
    return chats.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(q);
      const usernameMatch = c.username?.toLowerCase().includes(q);
      return nameMatch || usernameMatch;
    });
  }, [chats, searchQuery]);

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

  const toggleChat = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const idsToAdd = filteredChats.map((c) => c.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const getTypeIcon = (type: Chat['type']) => {
    switch (type) {
      case 'group':
        return <Users size={12} className="text-gray-400" />;
      case 'channel':
        return <Radio size={12} className="text-gray-400" />;
      case 'bot':
        return <Bot size={12} className="text-gray-400" />;
      default:
        return <User size={12} className="text-gray-400" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-teleforge-darkSurface rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl border border-gray-200 dark:border-teleforge-darkBorder overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-teleforge-darkBorder bg-gray-50/50 dark:bg-teleforge-darkCanvas/40">
          <div>
            <h3 className="font-bold text-base text-gray-900 dark:text-teleforge-cream">{title}</h3>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-200/60 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-gray-100 dark:border-teleforge-darkBorder bg-white dark:bg-teleforge-darkSurface">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search chats, groups, channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-gray-100 dark:bg-teleforge-darkCanvas text-sm text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-teleforge-primary/30 border border-transparent"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between mt-2 px-1 text-xs">
            <span className="text-teleforge-primary dark:text-rose-300 font-semibold">
              {selectedIds.length} selected
            </span>
            <div className="space-x-3">
              {filteredChats.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="text-gray-500 hover:text-teleforge-primary dark:text-gray-400 dark:hover:text-teleforge-cream transition-colors"
                >
                  Select All
                </button>
              )}
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-gray-400 hover:text-rose-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100/70 dark:divide-gray-800/60 min-h-[260px] max-h-[420px]">
          {filteredChats.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No matching Telegram chats found.
            </div>
          ) : (
            filteredChats.map((chat) => {
              const isSelected = selectedIds.includes(chat.id);
              return (
                <div
                  key={chat.id}
                  onClick={() => toggleChat(chat.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors ${
                    isSelected
                      ? 'bg-teleforge-primary/10 dark:bg-teleforge-primary/20'
                      : 'hover:bg-gray-50 dark:hover:bg-teleforge-darkCanvas/60'
                  }`}
                >
                  {/* Selection Checkbox */}
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                      isSelected
                        ? 'bg-teleforge-primary border-teleforge-primary text-teleforge-cream'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-teleforge-darkCanvas'
                    }`}
                  >
                    {isSelected && <Check size={13} strokeWidth={3} />}
                  </div>

                  {/* Avatar */}
                  <Avatar
                    src={chat.avatar}
                    previewSrc={chat.thumbUrl}
                    name={chat.name}
                    color={chat.avatarColor}
                    size="md"
                    className="shrink-0"
                    peerId={chat.id}
                  />

                  {/* Title & Type */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm text-gray-900 dark:text-teleforge-cream truncate">
                        {chat.name}
                      </span>
                      {getTypeIcon(chat.type)}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {chat.username
                        ? `@${chat.username}`
                        : chat.type === 'channel'
                        ? 'Channel'
                        : chat.type === 'group'
                        ? 'Group'
                        : 'Direct Message'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-gray-100 dark:border-teleforge-darkBorder bg-gray-50/50 dark:bg-teleforge-darkCanvas/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(selectedIds);
              onClose();
            }}
            className="px-5 py-2 text-xs font-semibold bg-teleforge-primary hover:bg-teleforge-primaryHover text-teleforge-cream rounded-xl shadow-sm transition-all"
          >
            Apply ({selectedIds.length})
          </button>
        </div>
      </div>
    </div>
  );
};
