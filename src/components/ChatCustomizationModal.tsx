import React, { useState, useEffect } from 'react';
import {
  X,
  Palette,
  Sliders,
  Type,
  Maximize2,
  Clock,
  User,
  RotateCcw,
  Check,
  Eye,
  CheckCheck,
} from 'lucide-react';
import {
  ChatCustomizationConfig,
  MessageFontSize,
  CornerRounding,
  TimestampFormat,
  getChatCustomization,
  saveChatCustomization,
  resetChatCustomization,
  getGlobalTimestampFormat,
  saveGlobalTimestampFormat,
  getFontSizeClass,
  getCornerRadiusClass,
} from '../services/teleforgePowerTools';
import { Chat } from '../types';
import { Avatar } from './Avatar';

interface ChatCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat;
  onSaved: (config: ChatCustomizationConfig) => void;
}

export const ChatCustomizationModal: React.FC<ChatCustomizationModalProps> = ({
  isOpen,
  onClose,
  chat,
  onSaved,
}) => {
  const [config, setConfig] = useState<ChatCustomizationConfig>(() => getChatCustomization(chat.id));
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfig(getChatCustomization(chat.id));
    }
  }, [isOpen, chat.id]);

  // Universal Escape key listener
  useEffect(() => {
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

  const handleSave = () => {
    const toSave = { ...config, timestampFormat: config.timestampFormat || getGlobalTimestampFormat() };
    saveChatCustomization(chat.id, toSave);
    saveGlobalTimestampFormat(toSave.timestampFormat);
    onSaved(toSave);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 400);
  };

  const handleTimestampFormatChange = (newFmt: TimestampFormat) => {
    const updated = { ...config, timestampFormat: newFmt };
    setConfig(updated);
    saveChatCustomization(chat.id, updated);
    saveGlobalTimestampFormat(newFmt);
    onSaved(updated);
  };

  const handleReset = () => {
    if (window.confirm(`Reset custom styles for "${chat.name}" back to global theme defaults?`)) {
      resetChatCustomization(chat.id);
      const emptyConfig: ChatCustomizationConfig = {};
      setConfig(emptyConfig);
      onSaved(emptyConfig);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#151c27] text-gray-900 dark:text-gray-100 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar src={chat.avatar} name={chat.name} color={chat.avatarColor} size="sm" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Custom Styling: {chat.name}</h3>
                <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-teleforge-primary/10 text-teleforge-primary border border-teleforge-primary/20">
                  Per-Chat
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Personalize visual appearance specifically for this conversation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Live Preview Card */}
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-[#0c1017] border border-gray-200 dark:border-gray-800">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Eye size={12} />
              <span>Live Preview for this chat</span>
            </div>

            <div className="space-y-2.5 p-3 rounded-xl bg-white/60 dark:bg-[#12161f]/80 border border-gray-200/60 dark:border-gray-800/60">
              {/* Incoming Mock */}
              <div className="flex items-end gap-2 max-w-[85%]">
                <div
                  className={`p-2.5 shadow-xs border ${getCornerRadiusClass(config.cornerRounding, false)}`}
                  style={{
                    backgroundColor: config.bubbleInColor || 'var(--tf-bubble-in)',
                    color: config.bubbleInTextColor || 'var(--tf-bubble-in-text)',
                    borderColor: 'var(--tf-border)',
                  }}
                >
                  <div className={getFontSizeClass(config.fontSize)}>
                    Hey! This chat has its own custom styling.
                  </div>
                  <div className="text-[10px] opacity-70 mt-1 text-right">
                    {(config.timestampFormat || getGlobalTimestampFormat()) === 'hidden' ? '' : (config.timestampFormat || getGlobalTimestampFormat()) === '24h' ? '14:20' : '2:20 PM'}
                  </div>
                </div>
              </div>

              {/* Outgoing Mock */}
              <div className="flex items-end justify-end max-w-[85%] ml-auto">
                <div
                  className={`p-2.5 shadow-xs border ${getCornerRadiusClass(config.cornerRounding, true)}`}
                  style={{
                    backgroundColor: config.bubbleOutColor || 'var(--tf-bubble-out)',
                    color: config.bubbleOutTextColor || 'var(--tf-bubble-out-text)',
                    borderColor: 'var(--tf-border)',
                  }}
                >
                  <div className={getFontSizeClass(config.fontSize)}>
                    Looks crisp and personalized! 🚀
                  </div>
                  <div className="flex items-center justify-end gap-1 text-[10px] opacity-70 mt-1">
                    <span>
                      {(config.timestampFormat || getGlobalTimestampFormat()) === 'hidden' ? '' : (config.timestampFormat || getGlobalTimestampFormat()) === '24h' ? '14:21' : '2:21 PM'}
                    </span>
                    <CheckCheck size={12} style={{ color: config.chatAccent || 'var(--tf-primary)' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Color Overrides */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Palette size={13} />
              <span>Color Customization</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Custom Accent */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">Chat Accent</div>
                  <div className="text-[10px] text-gray-400">Highlights and icons</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.chatAccent || '#8B1E22'}
                    onChange={(e) => setConfig({ ...config, chatAccent: e.target.value })}
                    className="w-7 h-7 rounded-lg border cursor-pointer"
                  />
                  {config.chatAccent && (
                    <button
                      onClick={() => setConfig({ ...config, chatAccent: undefined })}
                      className="text-[10px] text-gray-400 hover:text-red-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Incoming Bubble */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">Incoming Bubble</div>
                  <div className="text-[10px] text-gray-400">Received message background</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.bubbleInColor || '#1a2430'}
                    onChange={(e) => setConfig({ ...config, bubbleInColor: e.target.value })}
                    className="w-7 h-7 rounded-lg border cursor-pointer"
                  />
                  {config.bubbleInColor && (
                    <button
                      onClick={() => setConfig({ ...config, bubbleInColor: undefined })}
                      className="text-[10px] text-gray-400 hover:text-red-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Outgoing Bubble */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">Outgoing Bubble</div>
                  <div className="text-[10px] text-gray-400">Sent message background</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.bubbleOutColor || '#43191d'}
                    onChange={(e) => setConfig({ ...config, bubbleOutColor: e.target.value })}
                    className="w-7 h-7 rounded-lg border cursor-pointer"
                  />
                  {config.bubbleOutColor && (
                    <button
                      onClick={() => setConfig({ ...config, bubbleOutColor: undefined })}
                      className="text-[10px] text-gray-400 hover:text-red-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Wallpaper Pattern */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">Chat Wallpaper</div>
                  <div className="text-[10px] text-gray-400">Background pattern</div>
                </div>
                <select
                  value={config.wallpaperPattern || 'default'}
                  onChange={(e) => setConfig({ ...config, wallpaperPattern: e.target.value as any })}
                  className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-800 dark:text-gray-100"
                >
                  <option value="default">Default Pattern</option>
                  <option value="subtle">Subtle Dots</option>
                  <option value="none">Solid Canvas</option>
                </select>
              </div>
            </div>
          </div>

          {/* Typography & Layout */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders size={13} />
              <span>Layout & Geometry</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Font Size */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">Message Font Size</div>
                  <div className="text-[10px] text-gray-400">Chat text scaling</div>
                </div>
                <select
                  value={config.fontSize || 'default'}
                  onChange={(e) => setConfig({ ...config, fontSize: e.target.value as MessageFontSize })}
                  className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-800 dark:text-gray-100"
                >
                  <option value="small">Small (13px)</option>
                  <option value="default">Default (15px)</option>
                  <option value="large">Large (17px)</option>
                  <option value="extraLarge">Extra Large (19px)</option>
                </select>
              </div>

              {/* Corner Rounding */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">Corner Radius</div>
                  <div className="text-[10px] text-gray-400">Bubble curvature</div>
                </div>
                <select
                  value={config.cornerRounding || 'default'}
                  onChange={(e) => setConfig({ ...config, cornerRounding: e.target.value as CornerRounding })}
                  className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-800 dark:text-gray-100"
                >
                  <option value="sharp">Sharp (6px)</option>
                  <option value="default">Rounded (16px)</option>
                  <option value="extra">Extra Round (24px)</option>
                </select>
              </div>

              {/* Timestamps Format */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">Timestamps</div>
                  <div className="text-[10px] text-gray-400">Time display format</div>
                </div>
                <select
                  value={config.timestampFormat || getGlobalTimestampFormat()}
                  onChange={(e) => handleTimestampFormatChange(e.target.value as TimestampFormat)}
                  className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-800 dark:text-gray-100"
                >
                  <option value="24h">24-Hour (14:30)</option>
                  <option value="12h">12-Hour (2:30 PM)</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>

              {/* Spacing & Avatars Toggles */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">Compact Spacing</div>
                  <div className="text-[10px] text-gray-400">Tighten message margins</div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(config.compactSpacing)}
                  onChange={(e) => setConfig({ ...config, compactSpacing: e.target.checked })}
                  className="w-4 h-4 accent-teleforge-primary rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-gray-100 dark:border-gray-800/80 flex items-center justify-between bg-gray-50/50 dark:bg-[#12161f]/50">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 rounded-xl text-xs text-gray-500 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw size={13} />
            <span>Reset to Theme</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-teleforge-primary hover:bg-teleforge-hover text-white text-xs font-semibold shadow-xs flex items-center gap-1.5"
            >
              {saveSuccess ? <Check size={14} className="text-emerald-300" /> : null}
              <span>{saveSuccess ? 'Saved!' : 'Save & Apply'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
