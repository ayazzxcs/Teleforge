import React, { useState } from 'react';
import {
  X,
  Wrench,
  MessageSquare,
  Smile,
  Hand,
  Image,
  Search,
  Check,
  RotateCcw,
  Sliders,
  Type,
  Maximize2,
  Trash2,
  Plus,
  Clock,
} from 'lucide-react';
import {
  TeleForgePowerToolsSettings,
  SwipeAction,
  MessageFontSize,
  TimestampFormat,
  getPowerToolsSettings,
  savePowerToolsSettings,
  DEFAULT_POWER_TOOLS_SETTINGS,
  DEFAULT_QUICK_REACTIONS,
} from '../services/teleforgePowerTools';

interface PowerToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings?: TeleForgePowerToolsSettings;
  onUpdateSettings?: (settings: TeleForgePowerToolsSettings) => void;
  onSettingsChanged?: (settings: TeleForgePowerToolsSettings) => void;
}

type PowerToolsSection = 'chat' | 'reactions' | 'gestures' | 'media' | 'search';

export const PowerToolsModal: React.FC<PowerToolsModalProps> = ({
  isOpen,
  onClose,
  settings: initialSettings,
  onUpdateSettings,
  onSettingsChanged,
}) => {
  const [settings, setSettings] = useState<TeleForgePowerToolsSettings>(() => initialSettings || getPowerToolsSettings());
  const [activeSection, setActiveSection] = useState<PowerToolsSection>('chat');
  const [saveToast, setSaveToast] = useState(false);
  const [newEmojiInput, setNewEmojiInput] = useState('');

  // Sync state if initialSettings changes
  React.useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
    }
  }, [initialSettings]);

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

  const updateSettings = (updated: TeleForgePowerToolsSettings) => {
    setSettings(updated);
    savePowerToolsSettings(updated);
    onUpdateSettings?.(updated);
    onSettingsChanged?.(updated);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 1800);
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all TeleForge Power Tools settings back to defaults?')) {
      updateSettings(DEFAULT_POWER_TOOLS_SETTINGS);
    }
  };

  const handleAddEmoji = () => {
    if (!newEmojiInput.trim()) return;
    const emoji = newEmojiInput.trim();
    if (!settings.reactions.quickReactions.includes(emoji)) {
      const updated = {
        ...settings,
        reactions: {
          ...settings.reactions,
          quickReactions: [...settings.reactions.quickReactions, emoji],
        },
      };
      updateSettings(updated);
      setNewEmojiInput('');
    }
  };

  const handleRemoveEmoji = (emojiToRemove: string) => {
    const updated = {
      ...settings,
      reactions: {
        ...settings.reactions,
        quickReactions: settings.reactions.quickReactions.filter((e) => e !== emojiToRemove),
      },
    };
    updateSettings(updated);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#151c27] text-gray-900 dark:text-gray-100 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800/80 flex items-center justify-between bg-gray-50/50 dark:bg-[#12161f]/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center shadow-md">
              <Wrench size={16} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">TeleForge Power Tools</h3>
                <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-amber-500/15 text-amber-500 border border-amber-500/20">
                  Settings Hub
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Advanced chat experience, gestures, reactions, and presentation controls
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              title="Reset all settings to default"
              className="p-1.5 rounded-xl text-gray-400 hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xs flex items-center gap-1"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800/80 bg-gray-50 dark:bg-[#111722] overflow-x-auto no-scrollbar">
          {[
            { id: 'chat', label: 'Chat & Density', icon: MessageSquare },
            { id: 'reactions', label: 'Reactions', icon: Smile },
            { id: 'gestures', label: 'Swipe Gestures', icon: Hand },
            { id: 'media', label: 'Media Viewer', icon: Image },
            { id: 'search', label: 'Search Filters', icon: Search },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id as PowerToolsSection)}
                className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'border-teleforge-primary text-teleforge-primary dark:text-rose-300 bg-white dark:bg-[#151c27]'
                    : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* =========================================================================
              CHAT & DENSITY
             ========================================================================= */}
          {activeSection === 'chat' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">Chat & Layout Controls</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Configure message spacing, global typography size, and information density
                </p>
              </div>

              {/* Compact Mode Toggle */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span>Compact Chat Mode</span>
                    {settings.compactMode && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Tightens padding and message margins to fit significantly more messages on screen
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.compactMode}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      compactMode: e.target.checked,
                    })
                  }
                  className="w-5 h-5 accent-teleforge-primary rounded cursor-pointer"
                />
              </div>

              {/* Message Font Size */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80">
                <div className="text-xs font-bold text-gray-900 dark:text-white mb-1">Message Font Size</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Scale text size while strictly preserving timestamps, replies, and touch targets
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'small', label: 'Small', px: '13px' },
                    { id: 'default', label: 'Default', px: '15px' },
                    { id: 'large', label: 'Large', px: '17px' },
                    { id: 'extraLarge', label: 'Extra Large', px: '19px' },
                  ].map((sz) => {
                    const isSelected = settings.messageFontSize === sz.id;
                    return (
                      <button
                        key={sz.id}
                        onClick={() =>
                          updateSettings({
                            ...settings,
                            messageFontSize: sz.id as MessageFontSize,
                          })
                        }
                        className={`p-3 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'border-teleforge-primary bg-teleforge-primary/10 text-teleforge-primary font-bold ring-1 ring-teleforge-primary'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <div className="text-xs">{sz.label}</div>
                        <div className="text-[11px] opacity-60 font-mono">{sz.px}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message Timestamps Format */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-teleforge-primary" />
                    <div>
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                        Timestamp Display Format
                      </h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Choose how message times are presented across chats
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: '24h', label: '24-Hour', example: '14:30' },
                    { id: '12h', label: '12-Hour', example: '2:30 PM' },
                    { id: 'hidden', label: 'Hidden', example: '—' },
                  ].map((fmt) => {
                    const currentFormat = settings.timestampFormat || '24h';
                    const isSelected = currentFormat === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        onClick={() =>
                          updateSettings({
                            ...settings,
                            timestampFormat: fmt.id as TimestampFormat,
                          })
                        }
                        className={`p-3 rounded-xl border text-center transition-all ${
                          isSelected
                            ? 'border-teleforge-primary bg-teleforge-primary/10 text-teleforge-primary font-bold ring-1 ring-teleforge-primary'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <div className="text-xs">{fmt.label}</div>
                        <div className="text-[11px] opacity-60 font-mono">{fmt.example}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              REACTIONS
             ========================================================================= */}
          {activeSection === 'reactions' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">Quick Reactions</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Configure preferred quick reactions shown when hovering or long-pressing messages
                </p>
              </div>

              {/* Quick Reactions List */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80">
                <div className="text-xs font-bold text-gray-900 dark:text-white mb-2">
                  Active Quick Reactions ({settings.reactions.quickReactions.length})
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {settings.reactions.quickReactions.map((emoji) => (
                    <div
                      key={emoji}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-2"
                    >
                      <span className="text-lg">{emoji}</span>
                      <button
                        onClick={() => handleRemoveEmoji(emoji)}
                        title="Remove"
                        className="text-gray-400 hover:text-red-400"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Emoji Control */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    value={newEmojiInput}
                    onChange={(e) => setNewEmojiInput(e.target.value)}
                    placeholder="Type or paste emoji (e.g. 🚀)..."
                    maxLength={4}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-xs w-48 focus:outline-hidden focus:ring-1 focus:ring-teleforge-primary"
                  />
                  <button
                    type="button"
                    onClick={handleAddEmoji}
                    className="px-3 py-1.5 rounded-xl bg-teleforge-primary text-white text-xs font-semibold flex items-center gap-1 hover:bg-teleforge-hover transition-colors cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Add</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        ...settings,
                        reactions: {
                          ...settings.reactions,
                          quickReactions: DEFAULT_QUICK_REACTIONS,
                        },
                      })
                    }
                    className="text-xs text-gray-400 hover:text-amber-400 ml-auto"
                  >
                    Reset Defaults
                  </button>
                </div>
              </div>

              {/* Unread Reactions Alerts */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">Unread Reaction Indicators</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Highlight messages that recently received new reactions
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.reactions.showUnreadReactions}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      reactions: {
                        ...settings.reactions,
                        showUnreadReactions: e.target.checked,
                      },
                    })
                  }
                  className="w-5 h-5 accent-teleforge-primary rounded cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* =========================================================================
              GESTURES
             ========================================================================= */}
          {activeSection === 'gestures' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">Chat Swipe Gestures</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Configure touch swipe actions on chat rows in the sidebar
                </p>
              </div>

              {/* Enable Gestures */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">Enable Chat List Swipe Actions</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Swipe left or right on conversations to perform quick operations
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.gestures.enableSwipeActions}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      gestures: {
                        ...settings.gestures,
                        enableSwipeActions: e.target.checked,
                      },
                    })
                  }
                  className="w-5 h-5 accent-teleforge-primary rounded cursor-pointer"
                />
              </div>

              {/* Swipe Left Action */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">Swipe Left Action</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Action executed when swiping a chat to the left
                  </div>
                </div>
                <select
                  value={settings.gestures.swipeLeftAction}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      gestures: {
                        ...settings.gestures,
                        swipeLeftAction: e.target.value as SwipeAction,
                      },
                    })
                  }
                  className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-800 dark:text-gray-100"
                >
                  <option value="read">Mark as Read / Unread</option>
                  <option value="mute">Mute Notifications</option>
                  <option value="pin">Pin / Unpin</option>
                  <option value="archive">Archive Chat</option>
                  <option value="none">Disabled</option>
                </select>
              </div>

              {/* Swipe Right Action */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">Swipe Right Action</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Action executed when swiping a chat to the right
                  </div>
                </div>
                <select
                  value={settings.gestures.swipeRightAction}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      gestures: {
                        ...settings.gestures,
                        swipeRightAction: e.target.value as SwipeAction,
                      },
                    })
                  }
                  className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-800 dark:text-gray-100"
                >
                  <option value="reply">Quick Reply</option>
                  <option value="read">Mark as Read</option>
                  <option value="pin">Pin Chat</option>
                  <option value="none">Disabled</option>
                </select>
              </div>
            </div>
          )}

          {/* =========================================================================
              MEDIA VIEWER
             ========================================================================= */}
          {activeSection === 'media' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">Media Viewer Options</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Customization for photos, videos, and full-screen media inspection
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">Tap to Hide Controls (Immersive)</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Clicking the media hides the top toolbar and actions for full immersion
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.mediaViewer.immersiveMode}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      mediaViewer: {
                        ...settings.mediaViewer,
                        immersiveMode: e.target.checked,
                      },
                    })
                  }
                  className="w-5 h-5 accent-teleforge-primary rounded cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">Show Detailed Media Metadata</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Display file size, date, and sender info in the media viewer header
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.mediaViewer.showMediaInfo}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      mediaViewer: {
                        ...settings.mediaViewer,
                        showMediaInfo: e.target.checked,
                      },
                    })
                  }
                  className="w-5 h-5 accent-teleforge-primary rounded cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* =========================================================================
              SEARCH FILTERS
             ========================================================================= */}
          {activeSection === 'search' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">In-Chat Search Configuration</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Filter messages by media category directly within the search bar
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80">
                <div className="text-xs font-bold text-gray-900 dark:text-white mb-2">Supported Categories</div>
                <div className="flex flex-wrap gap-2">
                  {['All', 'Photos', 'Videos', 'Files', 'Voice / Audio', 'Links'].map((cat) => (
                    <span
                      key={cat}
                      className="px-3 py-1 rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-800 dark:text-gray-200"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
                <div className="text-[11px] text-gray-400 mt-3">
                  Filter pills appear automatically when opening in-chat search.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800/80 flex items-center justify-between bg-gray-50/50 dark:bg-[#12161f]/50">
          <div className="text-xs text-gray-400 flex items-center gap-1.5">
            {saveToast && (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Check size={13} /> Settings saved & applied
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-teleforge-primary hover:bg-teleforge-hover text-white text-xs font-semibold shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
