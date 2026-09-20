import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Bot,
  Users,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Megaphone,
} from 'lucide-react';
import { Chat } from '../types';
import { telegramApi, resolveApiUrl } from '../services/telegramApi';
import { Avatar } from './Avatar';
import { showToast } from './Toast';

interface AddBotToChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  botUsername: string;
  startParam?: string;
  groups: Chat[];
  onBotAdded: (groupId: string, groupName: string) => void;
}

export const AddBotToChatModal: React.FC<AddBotToChatModalProps> = ({
  isOpen,
  onClose,
  botUsername,
  startParam,
  groups,
  onBotAdded,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedGroupId(null);
      setIsSubmitting(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

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

  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.username && g.username.toLowerCase().includes(q))
    );
  }, [groups, searchQuery]);

  if (!isOpen) return null;

  const handleAddBot = async (group: Chat) => {
    setSelectedGroupId(group.id);
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const cleanBotName = botUsername.replace(/^@+/, '');
      const res = await telegramApi.addBotToChat(group.id, cleanBotName, startParam);

      if (res.success) {
        showToast(`Added @${cleanBotName} to ${group.name}!`, 'success');
        onBotAdded(group.id, group.name);
        onClose();
      } else {
        setErrorMessage(res.error || 'Failed to add bot to group');
      }
    } catch (err: any) {
      console.error('[AddBotModal] Error adding bot:', err);
      setErrorMessage(err.message || 'Error communicating with Telegram servers');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      <div className="relative bg-white dark:bg-teleforge-surface rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150 z-10">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-teleforge-primary/10 text-teleforge-primary flex items-center justify-center shrink-0">
              <Bot size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                Add to Group
              </h2>
              <p className="text-xs text-teleforge-primary font-medium truncate">
                @{botUsername.replace(/^@+/, '')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mx-4 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-start gap-2 animate-in fade-in duration-150">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1 break-words">{errorMessage}</div>
          </div>
        )}

        {/* Search Bar */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search your groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 placeholder-gray-400 border border-transparent focus:border-teleforge-primary rounded-xl outline-hidden transition-colors"
            />
          </div>
        </div>

        {/* Group List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/60 p-1">
          {filteredGroups.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <Users size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {groups.length === 0 ? 'No groups found' : 'No matching groups'}
              </p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                {groups.length === 0
                  ? 'You must be a member or administrator of at least one group to add this bot.'
                  : `No groups match "${searchQuery}".`}
              </p>
            </div>
          ) : (
            filteredGroups.map((group) => {
              const isSelected = selectedGroupId === group.id && isSubmitting;
              return (
                <div
                  key={group.id}
                  onClick={() => {
                    if (!isSubmitting) handleAddBot(group);
                  }}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-teleforge-primary/10 dark:bg-teleforge-primary/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      src={resolveApiUrl(`/api/telegram/avatar?id=${encodeURIComponent(group.id)}`)}
                      previewSrc={group.thumbUrl}
                      name={group.name}
                      color={group.avatarColor}
                      size="md"
                      peerId={group.id}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate flex items-center gap-1.5">
                        <span className="truncate">{group.name}</span>
                        {group.type === 'channel' ? (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.2 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-medium">
                            Channel
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-medium">
                            Group
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {typeof group.memberCount === 'number'
                          ? `${group.memberCount.toLocaleString()} members`
                          : group.type === 'channel'
                          ? 'Broadcast Channel'
                          : 'Telegram Group'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isSubmitting) handleAddBot(group);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-teleforge-primary text-white'
                        : 'bg-gray-100 dark:bg-gray-800 hover:bg-teleforge-primary hover:text-white dark:hover:bg-teleforge-primary text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Adding...</span>
                      </>
                    ) : (
                      <span>Add</span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-gray-50/70 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
            <span>Added directly via Telegram MTProto</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
