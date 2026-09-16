import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Star,
  Clock,
  Palette,
  Folder,
  Wrench,
  Maximize2,
  Type,
  Hand,
  Sliders,
  Image,
  HardDrive,
  Bell,
  Shield,
  Moon,
  Sun,
  ChevronRight,
  Trash2,
  Check,
  ExternalLink,
  Cpu,
} from 'lucide-react';
import { TeleForgeTheme } from '../theme/teleforgeTheme';
import {
  TeleForgePowerToolsSettings,
  MessageFontSize,
  CornerRounding,
} from '../services/teleforgePowerTools';
import {
  CommandCenterActionId,
  CommandCenterFeature,
  COMMAND_CENTER_FEATURES,
  getFavorites,
  toggleFavorite,
  isFavorite,
  getRecentlyUsed,
  recordRecent,
  clearRecentlyUsed,
  searchCommandCenter,
  getTeleForgeStorageStats,
  clearTeleForgeLocalCache,
  TeleForgeStorageStats,
} from '../services/teleforgeCommandCenter';

interface CommandCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Navigation & Child Modals
  onOpenThemeStudio: () => void;
  onOpenFolderManager: () => void;
  onOpenPowerTools: () => void;
  onOpenSettingsTab: (tab: 'profile' | 'appearance' | 'notifications' | 'privacy') => void;
  // Active State
  activeTheme: TeleForgeTheme;
  foldersCount: number;
  activeFolderName: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  powerToolsSettings: TeleForgePowerToolsSettings;
  onUpdatePowerToolsSettings: (updated: TeleForgePowerToolsSettings) => void;
}

export const CommandCenterModal: React.FC<CommandCenterModalProps> = ({
  isOpen,
  onClose,
  onOpenThemeStudio,
  onOpenFolderManager,
  onOpenPowerTools,
  onOpenSettingsTab,
  activeTheme,
  foldersCount,
  activeFolderName,
  darkMode,
  onToggleDarkMode,
  powerToolsSettings,
  onUpdatePowerToolsSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesList, setFavoritesList] = useState<CommandCenterActionId[]>(() => getFavorites());
  const [recentsList, setRecentsList] = useState<CommandCenterActionId[]>(() => getRecentlyUsed());
  const [storageStats, setStorageStats] = useState<TeleForgeStorageStats>(() => getTeleForgeStorageStats());
  const [cacheClearedToast, setCacheClearedToast] = useState(false);

  // Refresh storage stats when opened
  useEffect(() => {
    if (isOpen) {
      setStorageStats(getTeleForgeStorageStats());
      setFavoritesList(getFavorites());
      setRecentsList(getRecentlyUsed());
      setSearchQuery('');
    }
  }, [isOpen]);

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

  // Filtered features from search index
  const searchResults = searchCommandCenter(searchQuery);

  const handleToggleFav = (e: React.MouseEvent, id: CommandCenterActionId) => {
    e.stopPropagation();
    const next = toggleFavorite(id);
    setFavoritesList([...next]);
  };

  const handleClearRecents = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearRecentlyUsed();
    setRecentsList([]);
  };

  const handleClearCache = () => {
    clearTeleForgeLocalCache();
    setStorageStats(getTeleForgeStorageStats());
    setCacheClearedToast(true);
    setTimeout(() => setCacheClearedToast(false), 2000);
  };

  // Dispatch action for an action ID
  const handleExecuteAction = (actionId: CommandCenterActionId) => {
    const updatedRecents = recordRecent(actionId);
    setRecentsList([...updatedRecents]);

    switch (actionId) {
      case 'theme-studio':
        onClose();
        onOpenThemeStudio();
        break;
      case 'power-folders':
        onClose();
        onOpenFolderManager();
        break;
      case 'power-tools':
        onClose();
        onOpenPowerTools();
        break;
      case 'compact-mode':
        onUpdatePowerToolsSettings({
          ...powerToolsSettings,
          compactMode: !powerToolsSettings.compactMode,
        });
        break;
      case 'large-text': {
        const nextSize: MessageFontSize =
          powerToolsSettings.messageFontSize === 'large' ? 'default' : 'large';
        onUpdatePowerToolsSettings({
          ...powerToolsSettings,
          messageFontSize: nextSize,
        });
        break;
      }
      case 'swipe-gestures':
        onUpdatePowerToolsSettings({
          ...powerToolsSettings,
          gestures: {
            ...powerToolsSettings.gestures,
            enableSwipeActions: !powerToolsSettings.gestures.enableSwipeActions,
          },
        });
        break;
      case 'chat-appearance':
        onClose();
        onOpenPowerTools();
        break;
      case 'immersive-media':
        onUpdatePowerToolsSettings({
          ...powerToolsSettings,
          mediaViewer: {
            ...powerToolsSettings.mediaViewer,
            immersiveMode: !powerToolsSettings.mediaViewer.immersiveMode,
          },
        });
        break;
      case 'storage-info':
        // Highlight storage card or perform quick cache flush
        break;
      case 'notifications':
        onClose();
        onOpenSettingsTab('notifications');
        break;
      case 'privacy':
        onClose();
        onOpenSettingsTab('privacy');
        break;
      default:
        break;
    }
  };

  // Icon helper mapping
  const renderFeatureIcon = (iconName: string, size = 18) => {
    switch (iconName) {
      case 'Palette':
        return <Palette size={size} />;
      case 'Folder':
        return <Folder size={size} />;
      case 'Wrench':
        return <Wrench size={size} />;
      case 'Maximize2':
        return <Maximize2 size={size} />;
      case 'Type':
        return <Type size={size} />;
      case 'Hand':
        return <Hand size={size} />;
      case 'Sliders':
        return <Sliders size={size} />;
      case 'Image':
        return <Image size={size} />;
      case 'HardDrive':
        return <HardDrive size={size} />;
      case 'Bell':
        return <Bell size={size} />;
      case 'Shield':
        return <Shield size={size} />;
      default:
        return <Cpu size={size} />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 md:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#111923] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* =========================================================================
            HEADER & TITLE
           ========================================================================= */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800/80 bg-white/50 dark:bg-[#151f2b]/70 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#8B1E22] to-[#B91C1C] flex items-center justify-center shadow-md shadow-red-950/20 text-[#FFF8EE]">
              <Cpu size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-lg font-bold text-gray-900 dark:text-[#FFF8EE] tracking-tight">
                  TeleForge Command Center
                </h2>
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-900/30 text-rose-300 border border-red-800/40">
                  HUB
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Unified Control Hub & TeleForge Feature Orchestrator
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
            title="Close Command Center"
          >
            <X size={20} />
          </button>
        </div>

        {/* =========================================================================
            SEARCH BAR (FEATURE & SETTINGS INDEX)
           ========================================================================= */}
        <div className="p-4 pb-3 border-b border-gray-100 dark:border-gray-800/60 bg-gray-50/50 dark:bg-[#131b26]/50 shrink-0">
          <div className="relative flex items-center">
            <Search size={16} className="absolute left-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search TeleForge tools, gestures, themes, folders..."
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700/80 text-sm text-gray-900 dark:text-[#FFF8EE] placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-[#8B1E22]/50 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* =========================================================================
            SCROLLABLE BODY
           ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
          {/* If user is actively searching: Show filtered feature results */}
          {searchQuery.trim() ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Search Results ({searchResults.length})
                </span>
                <span className="text-xs text-gray-400">Settings & Tools</span>
              </div>

              {searchResults.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {searchResults.map((feat) => {
                    const favorited = favoritesList.includes(feat.id);
                    return (
                      <div
                        key={feat.id}
                        onClick={() => handleExecuteAction(feat.id)}
                        className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-red-50/60 dark:hover:bg-red-950/20 border border-gray-200/80 dark:border-gray-700/60 flex items-center justify-between gap-3 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-white dark:bg-gray-900 text-[#8B1E22] dark:text-rose-400 flex items-center justify-center shadow-xs shrink-0">
                            {renderFeatureIcon(feat.icon, 16)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-gray-900 dark:text-white truncate group-hover:text-[#8B1E22] dark:group-hover:text-rose-300 transition-colors">
                              {feat.title}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                              {feat.subtitle}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleToggleFav(e, feat.id)}
                          className="p-1 text-gray-400 hover:text-amber-400 transition-colors shrink-0"
                          title={favorited ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star
                            size={16}
                            className={favorited ? 'text-amber-400 fill-amber-400' : ''}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-400 text-xs">
                  No matching TeleForge features found for "{searchQuery}"
                </div>
              )}
            </div>
          ) : (
            <>
              {/* =========================================================================
                  FAVORITES SECTION (⭐)
                 ========================================================================= */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <Star size={14} className="text-amber-400 fill-amber-400" />
                    <span>Favorites</span>
                  </div>
                  <span className="text-[11px] text-gray-400">Quick access</span>
                </div>

                {favoritesList.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {favoritesList.map((favId) => {
                      const feat = COMMAND_CENTER_FEATURES.find((f) => f.id === favId);
                      if (!feat) return null;
                      return (
                        <button
                          key={favId}
                          onClick={() => handleExecuteAction(favId)}
                          className="p-3 rounded-2xl bg-white dark:bg-gray-800/70 hover:bg-red-50/70 dark:hover:bg-red-950/30 border border-gray-200/90 dark:border-gray-700/70 shadow-xs flex flex-col items-start gap-2 transition-all cursor-pointer group text-left"
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="w-7 h-7 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#8B1E22] dark:text-rose-400 flex items-center justify-center">
                              {renderFeatureIcon(feat.icon, 15)}
                            </div>
                            <span
                              onClick={(e) => handleToggleFav(e, favId)}
                              className="text-amber-400 hover:text-gray-400"
                              title="Unstar"
                            >
                              <Star size={12} className="fill-amber-400" />
                            </span>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-gray-900 dark:text-white truncate group-hover:text-[#8B1E22] dark:group-hover:text-rose-300">
                              {feat.title}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate mt-0.5">
                              {feat.category}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-900/30 text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No favorites. Star your most-used TeleForge tools in Command Center.
                    </p>
                  </div>
                )}
              </div>

              {/* =========================================================================
                  RECENTLY USED SECTION
                 ========================================================================= */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <Clock size={13} />
                    <span>Recently Used</span>
                  </div>
                  {recentsList.length > 0 && (
                    <button
                      onClick={handleClearRecents}
                      className="text-[11px] text-gray-400 hover:text-red-500 dark:hover:text-rose-400 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {recentsList.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {recentsList.map((recentId) => {
                      const feat = COMMAND_CENTER_FEATURES.find((f) => f.id === recentId);
                      if (!feat) return null;
                      return (
                        <button
                          key={recentId}
                          onClick={() => handleExecuteAction(recentId)}
                          className="px-2.5 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800/80 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {renderFeatureIcon(feat.icon, 13)}
                          <span>{feat.title}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-900/30 text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No recent tools. Your recently used TeleForge tools will appear here.
                    </p>
                  </div>
                )}
              </div>

              {/* =========================================================================
                  QUICK CONTROLS MATRIX (INSTANT REAL TOGGLES)
                 ========================================================================= */}
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">
                  Quick Controls
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Compact Mode Switch */}
                  <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Maximize2 size={16} className="text-[#8B1E22] dark:text-rose-400" />
                      <div>
                        <div className="text-xs font-semibold text-gray-900 dark:text-white">
                          Compact Mode
                        </div>
                        <div className="text-[11px] text-gray-400">High-density chat spacing</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdatePowerToolsSettings({
                          ...powerToolsSettings,
                          compactMode: !powerToolsSettings.compactMode,
                        })
                      }
                      className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${
                        powerToolsSettings.compactMode ? 'bg-[#8B1E22]' : 'bg-gray-300 dark:bg-gray-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform transform top-1 absolute ${
                          powerToolsSettings.compactMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Swipe Gestures Switch */}
                  <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Hand size={16} className="text-[#8B1E22] dark:text-rose-400" />
                      <div>
                        <div className="text-xs font-semibold text-gray-900 dark:text-white">
                          Swipe Gestures
                        </div>
                        <div className="text-[11px] text-gray-400">Chat list quick actions</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdatePowerToolsSettings({
                          ...powerToolsSettings,
                          gestures: {
                            ...powerToolsSettings.gestures,
                            enableSwipeActions: !powerToolsSettings.gestures.enableSwipeActions,
                          },
                        })
                      }
                      className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${
                        powerToolsSettings.gestures.enableSwipeActions
                          ? 'bg-[#8B1E22]'
                          : 'bg-gray-300 dark:bg-gray-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform transform top-1 absolute ${
                          powerToolsSettings.gestures.enableSwipeActions
                            ? 'translate-x-6'
                            : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Immersive Media Switch */}
                  <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Image size={16} className="text-[#8B1E22] dark:text-rose-400" />
                      <div>
                        <div className="text-xs font-semibold text-gray-900 dark:text-white">
                          Immersive Media
                        </div>
                        <div className="text-[11px] text-gray-400">Tap-to-hide media chrome</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdatePowerToolsSettings({
                          ...powerToolsSettings,
                          mediaViewer: {
                            ...powerToolsSettings.mediaViewer,
                            immersiveMode: !powerToolsSettings.mediaViewer.immersiveMode,
                          },
                        })
                      }
                      className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${
                        powerToolsSettings.mediaViewer.immersiveMode
                          ? 'bg-[#8B1E22]'
                          : 'bg-gray-300 dark:bg-gray-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform transform top-1 absolute ${
                          powerToolsSettings.mediaViewer.immersiveMode
                            ? 'translate-x-6'
                            : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Night Mode Switch */}
                  <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {darkMode ? (
                        <Moon size={16} className="text-rose-400" />
                      ) : (
                        <Sun size={16} className="text-amber-500" />
                      )}
                      <div>
                        <div className="text-xs font-semibold text-gray-900 dark:text-white">
                          {darkMode ? 'Crimson Dark' : 'Warm Day (Light)'}
                        </div>
                        <div className="text-[11px] text-gray-400">Night mode canvas</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onToggleDarkMode}
                      className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${
                        darkMode ? 'bg-[#8B1E22]' : 'bg-gray-300 dark:bg-gray-700'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform transform top-1 absolute ${
                          darkMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* =========================================================================
                  FEATURE CARDS (THE ORCHESTRATION SHORTCUTS)
                 ========================================================================= */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Theme Studio Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-red-950/20 via-gray-900/40 to-red-950/10 border border-red-900/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-xl bg-[#8B1E22] text-[#FFF8EE] flex items-center justify-center shadow-xs">
                        <Palette size={16} />
                      </div>
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/30 shadow-xs"
                        style={{ backgroundColor: activeTheme.tokens.primary }}
                        title="Active theme color"
                      />
                    </div>
                    <div className="text-xs font-bold text-gray-900 dark:text-white">Theme Studio</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                      Active: {activeTheme.name}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenThemeStudio();
                    }}
                    className="mt-3 w-full py-1.5 px-3 rounded-xl bg-[#8B1E22] hover:bg-[#74181B] text-[#FFF8EE] text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Edit Theme</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                {/* Power Folders Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-950/20 via-gray-900/40 to-blue-950/10 border border-blue-900/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-xl bg-blue-700 text-white flex items-center justify-center shadow-xs">
                        <Folder size={16} />
                      </div>
                      <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-blue-900/40 text-blue-300">
                        {foldersCount} TABS
                      </span>
                    </div>
                    <div className="text-xs font-bold text-gray-900 dark:text-white">Power Folders</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                      Active: {activeFolderName}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenFolderManager();
                    }}
                    className="mt-3 w-full py-1.5 px-3 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Manage Folders</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                {/* Power Tools Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/20 via-gray-900/40 to-amber-950/10 border border-amber-900/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                        <Wrench size={16} />
                      </div>
                      <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-900/40 text-amber-300">
                        5 MODULES
                      </span>
                    </div>
                    <div className="text-xs font-bold text-gray-900 dark:text-white">Power Tools</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {powerToolsSettings.reactions.quickReactions.length} reactions •{' '}
                      {powerToolsSettings.messageFontSize}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPowerTools();
                    }}
                    className="mt-3 w-full py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Open Hub</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>

              {/* =========================================================================
                  CHAT APPEARANCE & TYPOGRAPHY QUICK SELECTOR
                 ========================================================================= */}
              <div className="p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/60">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Type size={16} className="text-[#8B1E22] dark:text-rose-400" />
                    <span className="text-xs font-bold text-gray-900 dark:text-white">
                      Message Font Size
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-gray-500 capitalize">
                    {powerToolsSettings.messageFontSize}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {(['small', 'default', 'large', 'extraLarge'] as MessageFontSize[]).map((sizeKey) => {
                    const isSelected = powerToolsSettings.messageFontSize === sizeKey;
                    const labels: Record<MessageFontSize, string> = {
                      small: 'Small 13px',
                      default: 'Default 15px',
                      large: 'Large 17px',
                      extraLarge: 'XL 19px',
                    };
                    return (
                      <button
                        key={sizeKey}
                        type="button"
                        onClick={() =>
                          onUpdatePowerToolsSettings({
                            ...powerToolsSettings,
                            messageFontSize: sizeKey,
                          })
                        }
                        className={`py-2 px-2 rounded-xl text-center text-xs font-medium border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#8B1E22] text-[#FFF8EE] border-[#8B1E22] font-bold shadow-xs'
                            : 'bg-white dark:bg-gray-900/60 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {labels[sizeKey]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* =========================================================================
                  STORAGE & LOCAL CACHE OVERVIEW
                 ========================================================================= */}
              <div className="p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/60">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <HardDrive size={16} className="text-[#8B1E22] dark:text-rose-400" />
                    <span className="text-xs font-bold text-gray-900 dark:text-white">
                      TeleForge Storage & Local Cache
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-gray-800 dark:text-gray-200">
                    {storageStats.formattedSize}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3 bg-white/60 dark:bg-gray-900/60 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div>
                    Cached Dialogs: <span className="font-semibold text-gray-900 dark:text-white">{storageStats.cachedChatsCount}</span>
                  </div>
                  <div>
                    Config Keys: <span className="font-semibold text-gray-900 dark:text-white">{storageStats.cacheKeysCount}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="text-[11px] text-gray-400">
                    {cacheClearedToast ? (
                      <span className="text-emerald-500 flex items-center gap-1 font-medium">
                        <Check size={13} /> Local cache cleared safely
                      </span>
                    ) : (
                      <span>Session credentials & MTProto keys are never cleared</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleClearCache}
                    className="py-1 px-2.5 rounded-lg bg-gray-200/80 dark:bg-gray-700/80 hover:bg-red-100 dark:hover:bg-red-950/40 text-gray-700 dark:text-gray-200 hover:text-red-600 dark:hover:text-rose-400 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    <span>Clear Cache</span>
                  </button>
                </div>
              </div>

              {/* =========================================================================
                  SYSTEM SHORTCUTS (NOTIFICATIONS & PRIVACY)
                 ========================================================================= */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettingsTab('notifications');
                  }}
                  className="p-3.5 rounded-2xl bg-white dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/60 flex items-center justify-between text-left hover:border-gray-400 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Bell size={16} className="text-[#8B1E22] dark:text-rose-400" />
                    <div>
                      <div className="text-xs font-semibold text-gray-900 dark:text-white">
                        Telegram Notifications
                      </div>
                      <div className="text-[11px] text-gray-400">Alerts, chimes & badges</div>
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-gray-400" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettingsTab('privacy');
                  }}
                  className="p-3.5 rounded-2xl bg-white dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/60 flex items-center justify-between text-left hover:border-gray-400 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Shield size={16} className="text-[#8B1E22] dark:text-rose-400" />
                    <div>
                      <div className="text-xs font-semibold text-gray-900 dark:text-white">
                        Privacy & Security
                      </div>
                      <div className="text-[11px] text-gray-400">MTProto Layer 198 • Sessions</div>
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-gray-400" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* =========================================================================
            FOOTER STATUS BAR
           ========================================================================= */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-[#121922] flex justify-between items-center text-xs text-gray-400 shrink-0">
          <span>TeleForge Command Center v2.0 • Layer 198</span>
          <span className="font-semibold text-gray-600 dark:text-gray-300">Active</span>
        </div>
      </div>
    </div>
  );
};
