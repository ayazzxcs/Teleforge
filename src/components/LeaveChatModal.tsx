import React, { useState } from 'react';
import { X, LogOut, Loader2, AlertCircle } from 'lucide-react';

interface LeaveChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeave: () => Promise<void>;
  chatName: string;
  chatType: 'group' | 'channel' | string;
}

export const LeaveChatModal: React.FC<LeaveChatModalProps> = ({
  isOpen,
  onClose,
  onLeave,
  chatName,
  chatType,
}) => {
  const [isLeaving, setIsLeaving] = useState(false);

  if (!isOpen) return null;

  const isChannel = chatType === 'channel';
  const label = isChannel ? 'Channel' : 'Group';

  const handleConfirm = async () => {
    setIsLeaving(true);
    try {
      await onLeave();
      onClose();
    } catch (err) {
      console.error('[LeaveChatModal] Error leaving chat:', err);
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={isLeaving ? undefined : onClose}
    >
      <div
        className="bg-white dark:bg-teleforge-surface rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-800/80 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-500 flex items-center justify-center shrink-0">
              <LogOut size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Leave {label}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[200px]">
                {chatName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLeaving}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            Are you sure you want to leave <strong className="text-gray-900 dark:text-gray-100 font-semibold">"{chatName}"</strong>?
          </p>

          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-red-50/60 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>
              You will no longer receive new messages from this {label.toLowerCase()}. You can only rejoin if the {label.toLowerCase()} is public or via an invite link.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLeaving}
            className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLeaving}
            className="px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:scale-98 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            {isLeaving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Leaving...</span>
              </>
            ) : (
              <>
                <LogOut size={14} />
                <span>Leave {label}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
