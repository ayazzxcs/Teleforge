import React, { useState } from 'react';
import { X, Trash2, Smartphone, Cloud, Loader2, AlertTriangle } from 'lucide-react';

interface ClearHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClear: (revoke: boolean) => Promise<void>;
  chatName: string;
  chatType: 'direct' | 'group' | 'channel' | 'bot';
}

export const ClearHistoryModal: React.FC<ClearHistoryModalProps> = ({
  isOpen,
  onClose,
  onClear,
  chatName,
  chatType,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'local' | 'cloud'>('local');

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onClear(selectedMode === 'cloud');
      onClose();
    } catch (err) {
      console.error('[ClearHistoryModal] Error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={isDeleting ? undefined : onClose}
    >
      <div
        className="bg-white dark:bg-teleforge-surface rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-800/80 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-500 flex items-center justify-center shrink-0">
              <Trash2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Clear Chat History
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[240px]">
                {chatName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body / Options */}
        <div className="p-6 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Select how you would like to clear history for this {chatType === 'channel' ? 'channel' : chatType === 'group' ? 'group' : 'chat'}:
          </p>

          {/* Option 1: Delete Locally (For me only) */}
          <div
            onClick={() => !isDeleting && setSelectedMode('local')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
              selectedMode === 'local'
                ? 'border-teleforge-primary bg-teleforge-primary/5 dark:bg-teleforge-primary/10'
                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30'
            }`}
          >
            <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
              selectedMode === 'local'
                ? 'bg-teleforge-primary text-white'
                : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}>
              <Smartphone size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Delete Locally (For me only)
                </span>
                <input
                  type="radio"
                  name="clearMode"
                  checked={selectedMode === 'local'}
                  onChange={() => setSelectedMode('local')}
                  disabled={isDeleting}
                  className="accent-teleforge-primary w-4 h-4 cursor-pointer"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Clears message history for your account and device only. Other participants will retain their messages.
              </p>
            </div>
          </div>

          {/* Option 2: Delete Cloud-Wise (For everyone) */}
          <div
            onClick={() => !isDeleting && setSelectedMode('cloud')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
              selectedMode === 'cloud'
                ? 'border-red-500 bg-red-50/60 dark:bg-red-950/20'
                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30'
            }`}
          >
            <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
              selectedMode === 'cloud'
                ? 'bg-red-500 text-white'
                : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}>
              <Cloud size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                  Delete Cloud-Wise (For everyone)
                </span>
                <input
                  type="radio"
                  name="clearMode"
                  checked={selectedMode === 'cloud'}
                  onChange={() => setSelectedMode('cloud')}
                  disabled={isDeleting}
                  className="accent-red-500 w-4 h-4 cursor-pointer"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Permanently deletes the entire history from Telegram cloud servers for all participants. Cannot be undone.
              </p>
            </div>
          </div>

          {selectedMode === 'cloud' && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 text-xs">
              <AlertTriangle size={15} className="shrink-0" />
              <span>This will delete messages on Telegram cloud across all devices.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className={`px-5 py-2 text-xs font-semibold text-white rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer ${
              selectedMode === 'cloud'
                ? 'bg-red-600 hover:bg-red-700 active:scale-98'
                : 'bg-teleforge-primary hover:opacity-90 active:scale-98'
            }`}
          >
            {isDeleting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Clearing...</span>
              </>
            ) : selectedMode === 'cloud' ? (
              <>
                <Trash2 size={14} />
                <span>Delete for Everyone</span>
              </>
            ) : (
              <>
                <Trash2 size={14} />
                <span>Delete for Me</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
