import React, { useState } from 'react';
import { X, Plus, Folder, ArrowUp, ArrowDown, Edit3, Trash2, AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { Chat, TeleForgeDialogFilter } from '../types';
import { chatMatchesFolder } from '../utils/folderFilter';
import { FolderEditModal } from './FolderEditModal';

interface FolderManagerModalProps {
  isOpen: boolean;
  folders: TeleForgeDialogFilter[];
  chats: Chat[];
  contactIds?: Set<string>;
  onClose: () => void;
  onSaveFilter: (filter: TeleForgeDialogFilter) => Promise<void>;
  onDeleteFilter: (id: string) => Promise<void>;
  onReorderFilters: (orderIds: string[]) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export const FolderManagerModal: React.FC<FolderManagerModalProps> = ({
  isOpen,
  folders,
  chats,
  contactIds,
  onClose,
  onSaveFilter,
  onDeleteFilter,
  onReorderFilters,
  onRefresh,
}) => {
  const [editingFolder, setEditingFolder] = useState<TeleForgeDialogFilter | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Universal Escape key listener
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditOpen) {
          setIsEditOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isEditOpen, onClose]);

  if (!isOpen) return null;

  // Non-default folders (default "All Chats" cannot be deleted/reordered)
  const customFolders = folders.filter((f) => f.id !== 'all' && !f.isDefault);

  const handleOpenCreate = () => {
    setEditingFolder(null);
    setIsEditOpen(true);
  };

  const handleOpenEdit = (folder: TeleForgeDialogFilter) => {
    setEditingFolder(folder);
    setIsEditOpen(true);
  };

  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const newOrder = [...customFolders];
    const temp = newOrder[index - 1];
    newOrder[index - 1] = newOrder[index];
    newOrder[index] = temp;
    
    try {
      await onReorderFilters(newOrder.map((f) => f.id));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reorder folders on Telegram.');
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= customFolders.length - 1) return;
    const newOrder = [...customFolders];
    const temp = newOrder[index + 1];
    newOrder[index + 1] = newOrder[index];
    newOrder[index] = temp;

    try {
      await onReorderFilters(newOrder.map((f) => f.id));
    } catch (err: any) {
      setErrorMessage("Couldn't update this folder. Check your connection and try again.");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await onDeleteFilter(deleteConfirmId);
      setDeleteConfirmId(null);
    } catch (err: any) {
      setErrorMessage("Couldn't delete this folder. Check your connection and try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      await onRefresh();
    } catch (err: any) {
      setErrorMessage("Couldn't sync folders from Telegram. Check your connection and try again.");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-teleforge-darkSurface rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl border border-gray-200 dark:border-teleforge-darkBorder overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-teleforge-darkBorder bg-gray-50/50 dark:bg-teleforge-darkCanvas/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teleforge-primary/10 text-teleforge-primary dark:text-rose-300 flex items-center justify-center">
                <Folder size={18} />
              </div>
              <div>
                <h3 className="font-bold text-base text-gray-900 dark:text-teleforge-cream">
                  Manage Folders
                </h3>
                <p className="text-[11px] text-gray-400">
                  Synchronized with your Telegram cloud account
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                title="Sync from Telegram"
                className="p-1.5 rounded-full hover:bg-gray-200/60 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin text-teleforge-primary' : ''} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-gray-200/60 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-start justify-between gap-2">
                <span>{errorMessage}</span>
                <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Create New Folder Button */}
            <button
              onClick={handleOpenCreate}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-dashed border-teleforge-primary/40 dark:border-rose-400/40 bg-teleforge-primary/5 dark:bg-teleforge-primary/10 hover:bg-teleforge-primary/10 dark:hover:bg-teleforge-primary/20 text-teleforge-primary dark:text-rose-300 font-bold text-xs transition-all"
            >
              <Plus size={16} />
              <span>Create New Power Folder</span>
            </button>

            {/* Folders List */}
            <div className="space-y-2.5">
              {/* Default "All Chats" item */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-teleforge-darkBorder bg-gray-50/50 dark:bg-teleforge-darkCanvas/30 opacity-80">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-lg">
                    💬
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-teleforge-cream">All Chats</h4>
                    <p className="text-xs text-gray-400">{chats.length} chats • System Default</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  Default
                </span>
              </div>

              {/* Custom Folders */}
              {customFolders.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-gray-200 dark:border-teleforge-darkBorder rounded-xl">
                  <Folder className="mx-auto text-gray-300 dark:text-gray-600 mb-2" size={32} />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No custom folders</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                    Create a folder to organize your chats.
                  </p>
                </div>
              ) : (
                customFolders.map((f, index) => {
                  const matchCount = chats.filter((c) => chatMatchesFolder(c, f, contactIds)).length;
                  const fTitle = typeof f.title === 'string' ? f.title : ((f.title as any)?.text || 'Folder');
                  const fEmoticon = typeof f.emoticon === 'string' ? f.emoticon : ((f.emoticon as any)?.text || '📁');

                  return (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-3.5 rounded-xl border border-gray-200 dark:border-teleforge-darkBorder bg-white dark:bg-teleforge-darkSurface hover:border-teleforge-primary/40 dark:hover:border-rose-400/40 transition-all shadow-sm group"
                    >
                      {/* Left: Icon & Details */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-teleforge-primary/10 dark:bg-teleforge-primary/20 flex items-center justify-center text-lg shrink-0">
                          {fEmoticon || '📁'}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-teleforge-cream truncate">
                            {fTitle}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                            <span>{matchCount} {matchCount === 1 ? 'chat' : 'chats'}</span>
                            {f.unreadOnly && <span>• Unread only</span>}
                            {f.groups && <span>• Groups</span>}
                            {f.channels && <span>• Channels</span>}
                            {f.bots && <span>• Bots</span>}
                          </div>
                        </div>
                      </div>

                      {/* Right: Reorder & Edit/Delete Controls */}
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {/* Reorder Buttons */}
                        <div className="flex flex-col mr-1">
                          <button
                            type="button"
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            title="Move Up"
                            className="p-1 rounded text-gray-400 hover:text-teleforge-primary dark:hover:text-teleforge-cream disabled:opacity-20 transition-colors"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDown(index)}
                            disabled={index === customFolders.length - 1}
                            title="Move Down"
                            className="p-1 rounded text-gray-400 hover:text-teleforge-primary dark:hover:text-teleforge-cream disabled:opacity-20 transition-colors"
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(f)}
                          title="Edit Folder"
                          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-teleforge-cream transition-colors"
                        >
                          <Edit3 size={15} />
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(f.id)}
                          title="Delete Folder"
                          className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 dark:border-teleforge-darkBorder bg-gray-50/50 dark:bg-teleforge-darkCanvas/40">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {customFolders.length} custom {customFolders.length === 1 ? 'folder' : 'folders'}
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 text-xs font-semibold bg-teleforge-primary hover:bg-teleforge-primaryHover text-teleforge-cream rounded-xl shadow-sm transition-all"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Folder Edit Modal */}
      <FolderEditModal
        isOpen={isEditOpen}
        folder={editingFolder}
        chats={chats}
        contactIds={contactIds}
        onSave={async (saved) => {
          await onSaveFilter(saved);
          setIsEditOpen(false);
        }}
        onClose={() => setIsEditOpen(false)}
      />

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-teleforge-darkSurface rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-gray-200 dark:border-teleforge-darkBorder">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center mb-3">
              <AlertTriangle size={20} />
            </div>
            <h4 className="font-bold text-base text-gray-900 dark:text-teleforge-cream">
              Delete this folder?
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              This folder will be removed from TeleForge and your Telegram account. Your chats will not be deleted.
            </p>

            <div className="flex items-center justify-end gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                disabled={isDeleting}
                className="px-3.5 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm transition-all flex items-center gap-1.5"
              >
                {isDeleting ? 'Deleting from Telegram...' : 'Delete Folder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
