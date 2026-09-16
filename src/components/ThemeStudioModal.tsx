import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Check,
  CheckCheck,
  Sun,
  Moon,
  RotateCcw,
  Download,
  Upload,
  Plus,
  Copy,
  Edit2,
  Trash2,
  Palette,
  Eye,
  AlertTriangle,
  Sliders,
  MessageSquare,
  Compass,
  Layers,
  Send,
  Phone,
  Info,
  Search,
  ShieldCheck,
  Volume2,
  Play,
  Flame,
  CheckSquare,
} from 'lucide-react';
import {
  TeleForgeTheme,
  TeleForgeThemeTokens,
  BUILTIN_PRESETS,
  teleforgeRedPreset,
  getSavedCustomThemes,
  saveCustomThemes,
  applyTheme,
  exportThemeToFile,
  validateAndSanitizeTheme,
  checkContrast,
  ContrastStatus,
} from '../theme/teleforgeTheme';
import { Avatar } from './Avatar';
import { showToast } from './Toast';

interface ThemeStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTheme: TeleForgeTheme;
  onThemeApplied: (theme: TeleForgeTheme) => void;
}

type TokenCategory = 'general' | 'chat' | 'navigation' | 'media' | 'custom';

interface TokenDefinition {
  key: keyof TeleForgeThemeTokens;
  label: string;
  description: string;
  category: TokenCategory;
  contrastAgainst?: keyof TeleForgeThemeTokens;
}

const TOKEN_DEFINITIONS: TokenDefinition[] = [
  // 1. General / Accent
  { key: 'primary', label: 'Primary Brand Accent', description: 'Core buttons, active indicators, and brand highlights', category: 'general' },
  { key: 'primaryHover', label: 'Primary Hover State', description: 'Interactive button hover state', category: 'general' },
  { key: 'primaryActive', label: 'Primary Active State', description: 'Pressed and active button state', category: 'general' },
  { key: 'primarySubtle', label: 'Subtle Accent Tint', description: 'Translucent background selections and subtle highlights', category: 'general' },
  { key: 'secondaryAccent', label: 'Secondary Accent', description: 'Secondary branding, badges, and complementary accents', category: 'general' },
  { key: 'textPrimary', label: 'Primary Text', description: 'Main headlines, messages, and titles', category: 'general', contrastAgainst: 'bg' },
  { key: 'textSecondary', label: 'Secondary Text', description: 'Captions, timestamps, and muted labels', category: 'general', contrastAgainst: 'bg' },
  { key: 'linkColor', label: 'Link Color', description: 'Hyperlinks, hashtags, and clickable mentions', category: 'general', contrastAgainst: 'bg' },
  { key: 'bg', label: 'Canvas Background', description: 'Root application and chat background', category: 'general' },
  { key: 'surface', label: 'Surface Background', description: 'Sidebar, drawers, and headers', category: 'general' },
  { key: 'surfaceElevated', label: 'Elevated Surface', description: 'Cards, popovers, and floating menus', category: 'general' },

  // 2. Chat
  { key: 'bubbleIn', label: 'Incoming Bubble Fill', description: 'Background of received message bubbles', category: 'chat' },
  { key: 'bubbleInText', label: 'Incoming Message Text', description: 'Text color inside received bubbles', category: 'chat', contrastAgainst: 'bubbleIn' },
  { key: 'bubbleOut', label: 'Outgoing Bubble Fill', description: 'Background of sent message bubbles', category: 'chat' },
  { key: 'bubbleOutText', label: 'Outgoing Message Text', description: 'Text color inside sent bubbles', category: 'chat', contrastAgainst: 'bubbleOut' },
  { key: 'replyAccent', label: 'Reply Quote Accent', description: 'Vertical border line and sender name on quoted replies', category: 'chat' },
  { key: 'selectedMessage', label: 'Selected Message Highlight', description: 'Overlay tint for selected messages', category: 'chat' },
  { key: 'timestamp', label: 'Bubble Timestamp', description: 'Sent/received timestamp and delivery receipt color', category: 'chat', contrastAgainst: 'bubbleIn' },

  // 3. Navigation
  { key: 'topBar', label: 'Top Bar / Header', description: 'Chat header and navigation toolbar background', category: 'navigation' },
  { key: 'tabBg', label: 'Tab Bar Background', description: 'Background container for folder tabs', category: 'navigation' },
  { key: 'tabSelected', label: 'Selected Tab Color', description: 'Active folder tab text and underline indicator', category: 'navigation' },
  { key: 'border', label: 'Border & Dividers', description: 'Card strokes, separators, and subtle list dividers', category: 'navigation' },
  { key: 'searchBg', label: 'Search Field Background', description: 'Input container background for search bar', category: 'navigation' },
  { key: 'actionButton', label: 'Action Button Fill', description: 'Send message button and floating action buttons', category: 'navigation' },

  // 4. Media / UI
  { key: 'mediaOverlay', label: 'Media Scrim / Overlay', description: 'Backdrop overlay for image previews and media controls', category: 'media' },
  { key: 'progressBar', label: 'Progress Bar Fill', description: 'Voice message playback and file download progress', category: 'media' },
  { key: 'switchActive', label: 'Switch Active Fill', description: 'Active track color for toggle switches', category: 'media' },
  { key: 'checkboxActive', label: 'Checkbox Active Fill', description: 'Checked background fill for checkboxes', category: 'media' },
  { key: 'iconTint', label: 'Navigation Icon Tint', description: 'Action icons in headers and list items', category: 'media' },
];

export const ThemeStudioModal: React.FC<ThemeStudioModalProps> = ({
  isOpen,
  onClose,
  activeTheme: initialActiveTheme,
  onThemeApplied,
}) => {
  // Custom Themes list in state
  const [customThemes, setCustomThemes] = useState<TeleForgeTheme[]>(() => getSavedCustomThemes());

  // Current theme being inspected/edited in Studio
  const [currentTheme, setCurrentTheme] = useState<TeleForgeTheme>(() => {
    const base = initialActiveTheme || teleforgeRedPreset;
    return {
      ...base,
      tokens: { ...(base.tokens || teleforgeRedPreset.tokens) },
    };
  });

  // Active Category tab
  const [activeCategory, setActiveCategory] = useState<TokenCategory>('general');

  // Interactive Live Preview toggles
  const [previewSwitchChecked, setPreviewSwitchChecked] = useState(true);
  const [previewCheckboxChecked, setPreviewCheckboxChecked] = useState(true);
  const [appliedNotice, setAppliedNotice] = useState(false);

  // Mobile View mode: 'editor' | 'preview'
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');

  const [copiedTokenKey, setCopiedTokenKey] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState(false);

  // Modals inside Theme Studio
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [renameThemeId, setRenameThemeId] = useState<string | null>(null);
  const [isNewThemeModalOpen, setIsNewThemeModalOpen] = useState(false);
  const [newThemeNameInput, setNewThemeNameInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Universal Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isNewThemeModalOpen) {
          setIsNewThemeModalOpen(false);
        } else if (isImportModalOpen) {
          setIsImportModalOpen(false);
        } else if (isRenameModalOpen) {
          setIsRenameModalOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isNewThemeModalOpen, isImportModalOpen, isRenameModalOpen, onClose]);

  // Sync when initialActiveTheme changes from outside
  useEffect(() => {
    if (initialActiveTheme) {
      setCurrentTheme({
        ...initialActiveTheme,
        tokens: { ...(initialActiveTheme.tokens || teleforgeRedPreset.tokens) },
      });
    }
  }, [initialActiveTheme]);

  // Combined themes list
  const allThemes = useMemo(() => {
    return [...BUILTIN_PRESETS, ...customThemes];
  }, [customThemes]);

  // Find base preset reference for resetting single tokens
  const basePreset = useMemo(() => {
    const theme = currentTheme || teleforgeRedPreset;
    return (
      BUILTIN_PRESETS.find((p) => p.id === theme?.id) ||
      (theme?.mode === 'light' ? BUILTIN_PRESETS[3] : BUILTIN_PRESETS[0])
    );
  }, [currentTheme?.id, currentTheme?.mode]);

  // Filter tokens by active category
  const filteredTokens = useMemo(() => {
    return TOKEN_DEFINITIONS.filter((t) => t.category === activeCategory);
  }, [activeCategory]);

  if (!isOpen) return null;

  // Handler: Select a theme from presets or custom themes
  const handleSelectTheme = (themeId: string) => {
    const selected = allThemes.find((t) => t.id === themeId);
    if (selected) {
      setCurrentTheme({
        ...selected,
        tokens: { ...selected.tokens },
      });
    }
  };

  // Handler: Update a single token value
  const handleTokenChange = (key: keyof TeleForgeThemeTokens, value: string) => {
    setCurrentTheme((prev) => ({
      ...prev,
      tokens: {
        ...prev.tokens,
        [key]: value,
      },
    }));
  };

  // Handler: Toggle Dark / Light mode
  const handleToggleMode = () => {
    const nextMode = currentTheme.mode === 'dark' ? 'light' : 'dark';
    const matchingPreset = nextMode === 'light' ? BUILTIN_PRESETS[3] : BUILTIN_PRESETS[0];
    setCurrentTheme((prev) => ({
      ...prev,
      mode: nextMode,
      tokens: {
        ...matchingPreset.tokens,
        primary: prev.tokens.primary, // preserve custom primary
      },
    }));
  };

  // Handler: Reset a single token to preset default
  const handleResetToken = (key: keyof TeleForgeThemeTokens) => {
    const defaultValue = basePreset.tokens[key];
    if (defaultValue) {
      handleTokenChange(key, defaultValue);
    }
  };

  // Handler: Reset entire theme to preset defaults
  const handleResetEntireTheme = () => {
    setCurrentTheme({
      ...basePreset,
      name: currentTheme.isCustom ? currentTheme.name : basePreset.name,
      isCustom: currentTheme.isCustom,
      tokens: { ...basePreset.tokens },
    });
    showToast(`Reset "${currentTheme.name}" back to preset colors.`, 'info');
  };

  // Handler: Open Create New Custom Theme modal
  const handleCreateNewTheme = () => {
    setNewThemeNameInput('My Custom Theme');
    setIsNewThemeModalOpen(true);
  };

  const handleConfirmCreateTheme = () => {
    const name = newThemeNameInput.trim() || 'My Custom Theme';
    const newTheme: TeleForgeTheme = {
      id: `custom-${Date.now()}`,
      name,
      mode: currentTheme.mode,
      isCustom: true,
      tokens: { ...currentTheme.tokens },
    };

    const updated = [...customThemes, newTheme];
    setCustomThemes(updated);
    saveCustomThemes(updated);
    setCurrentTheme(newTheme);
    setIsNewThemeModalOpen(false);
    showToast(`Created custom theme "${name}"!`, 'success');
  };

  // Handler: Duplicate Current Theme
  const handleDuplicateTheme = () => {
    const duplicateTheme: TeleForgeTheme = {
      id: `custom-${Date.now()}`,
      name: `${currentTheme.name} (Copy)`,
      mode: currentTheme.mode,
      isCustom: true,
      tokens: { ...currentTheme.tokens },
    };

    const updated = [...customThemes, duplicateTheme];
    setCustomThemes(updated);
    saveCustomThemes(updated);
    setCurrentTheme(duplicateTheme);
  };

  // Handler: Open Rename Dialog
  const handleOpenRename = (theme: TeleForgeTheme) => {
    setRenameThemeId(theme.id);
    setRenameInput(theme.name);
    setIsRenameModalOpen(true);
  };

  // Handler: Rename Theme
  const handleRenameConfirm = () => {
    const trimmed = renameInput.trim();
    if (!trimmed) return;
    const targetId = renameThemeId || currentTheme.id;
    if (currentTheme.id === targetId) {
      setCurrentTheme((prev) => ({ ...prev, name: trimmed }));
    }
    const updated = customThemes.map((t) => (t.id === targetId ? { ...t, name: trimmed } : t));
    setCustomThemes(updated);
    saveCustomThemes(updated);
    setIsRenameModalOpen(false);
    setRenameThemeId(null);
    showToast(`Renamed theme to "${trimmed}"`, 'success');
  };

  // Handler: Delete Custom Theme
  const handleDeleteTheme = (themeIdToDelete?: string | React.MouseEvent) => {
    const idToDelete = typeof themeIdToDelete === 'string' ? themeIdToDelete : currentTheme.id;
    const themeToDelete = customThemes.find((t) => t.id === idToDelete);
    if (!themeToDelete) return;

    const updated = customThemes.filter((t) => t.id !== idToDelete);
    setCustomThemes(updated);
    saveCustomThemes(updated);
    if (currentTheme.id === idToDelete) {
      setCurrentTheme({
        ...teleforgeRedPreset,
        tokens: { ...teleforgeRedPreset.tokens },
      });
    }
    showToast(`Deleted custom theme "${themeToDelete.name}"`, 'info');
  };

  // Handler: Apply Theme to Real Application
  const handleApplyTheme = () => {
    let themeToApply = currentTheme;

    // If it's a custom theme, persist modifications first
    if (currentTheme.isCustom) {
      const exists = customThemes.some((t) => t.id === currentTheme.id);
      const updated = exists
        ? customThemes.map((t) => (t.id === currentTheme.id ? currentTheme : t))
        : [...customThemes, currentTheme];
      setCustomThemes(updated);
      saveCustomThemes(updated);
    }

    applyTheme(themeToApply);
    onThemeApplied(themeToApply);

    setAppliedNotice(true);
    setTimeout(() => setAppliedNotice(false), 2400);
  };

  // Handler: Export Theme to File
  const handleExport = () => {
    exportThemeToFile(currentTheme);
  };

  // Handler: Import Theme via File Picker
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = validateAndSanitizeTheme(content);
      if (res.success && res.theme) {
        const updated = [...customThemes, res.theme];
        setCustomThemes(updated);
        saveCustomThemes(updated);
        setCurrentTheme(res.theme);
        showToast(`Successfully imported "${res.theme.name}"!`, 'success');
      } else {
        showToast(`Failed to import theme: ${res.error || 'Invalid file format'}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Handler: Import Theme via JSON Paste Modal
  const handlePasteImportConfirm = () => {
    const res = validateAndSanitizeTheme(importJsonText);
    if (res.success && res.theme) {
      const updated = [...customThemes, res.theme];
      setCustomThemes(updated);
      saveCustomThemes(updated);
      setCurrentTheme(res.theme);
      setIsImportModalOpen(false);
      setImportJsonText('');
      setImportError(null);
    } else {
      setImportError(res.error || 'Invalid theme format.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="bg-[#12161f] text-gray-100 rounded-2xl shadow-2xl border border-gray-800/80 w-full max-w-6xl h-[94vh] max-h-[950px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* =========================================================================
            HEADER BAR
           ========================================================================= */}
        <div className="px-4 py-3 bg-[#151c27] border-b border-gray-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#8B1E22] to-[#B91C1C] flex items-center justify-center shadow-md shadow-red-950/40">
              <Palette size={20} className="text-[#FFF8EE]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">TeleForge Theme Studio</h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-[#8B1E22]/20 text-rose-300 border border-[#8B1E22]/30">
                  Live Engine
                </span>
              </div>
              <p className="text-xs text-gray-400">Design, preview, and apply real-time styles across TeleForge</p>
            </div>
          </div>

          {/* Theme Selector & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Theme Dropdown */}
            <div className="relative">
              <select
                value={currentTheme.id}
                onChange={(e) => handleSelectTheme(e.target.value)}
                className="bg-[#1e2736] border border-gray-700/80 hover:border-gray-600 rounded-xl px-3 py-1.5 text-xs text-white font-medium focus:outline-hidden focus:ring-2 focus:ring-teleforge-primary cursor-pointer pr-8"
              >
                <optgroup label="TeleForge Built-in Presets">
                  {BUILTIN_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.mode === 'light' ? '☀️' : '🌙'}
                    </option>
                  ))}
                </optgroup>
                {customThemes.length > 0 && (
                  <optgroup label="My Custom Themes">
                    {customThemes.map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Dark / Light Toggle */}
            <button
              onClick={handleToggleMode}
              title={`Toggle base mode (currently ${currentTheme.mode})`}
              className="p-1.5 rounded-xl bg-[#1e2736] border border-gray-700/80 hover:bg-gray-800 text-gray-300 transition-colors flex items-center gap-1 text-xs"
            >
              {currentTheme.mode === 'dark' ? <Moon size={15} className="text-rose-400" /> : <Sun size={15} className="text-amber-400" />}
            </button>

            {/* Theme Management Buttons */}
            <button
              onClick={handleCreateNewTheme}
              title="Create new theme"
              className="p-1.5 rounded-xl bg-[#1e2736] border border-gray-700/80 hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
            >
              <Plus size={15} />
            </button>

            <button
              onClick={handleDuplicateTheme}
              title="Duplicate theme"
              className="p-1.5 rounded-xl bg-[#1e2736] border border-gray-700/80 hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
            >
              <Copy size={15} />
            </button>

            {currentTheme.isCustom && (
              <>
                <button
                  onClick={() => {
                    setRenameInput(currentTheme.name);
                    setIsRenameModalOpen(true);
                  }}
                  title="Rename theme"
                  className="p-1.5 rounded-xl bg-[#1e2736] border border-gray-700/80 hover:bg-gray-800 text-gray-300 hover:text-white transition-colors"
                >
                  <Edit2 size={15} />
                </button>

                <button
                  onClick={handleDeleteTheme}
                  title="Delete theme"
                  className="p-1.5 rounded-xl bg-red-950/40 border border-red-800/50 hover:bg-red-900/60 text-red-300 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}

            {/* Reset Entire Theme */}
            <button
              onClick={handleResetEntireTheme}
              title="Reset theme to default"
              className="p-1.5 rounded-xl bg-[#1e2736] border border-gray-700/80 hover:bg-gray-800 text-gray-300 hover:text-amber-400 transition-colors"
            >
              <RotateCcw size={15} />
            </button>

            {/* Export */}
            <button
              onClick={handleExport}
              title="Export theme (.json)"
              className="px-2.5 py-1.5 rounded-xl bg-[#1e2736] border border-gray-700/80 hover:bg-gray-800 text-gray-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-medium"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export</span>
            </button>

            {/* Import */}
            <button
              onClick={() => setIsImportModalOpen(true)}
              title="Import theme"
              className="px-2.5 py-1.5 rounded-xl bg-[#1e2736] border border-gray-700/80 hover:bg-gray-800 text-gray-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-medium"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">Import</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.teleforge-theme"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Apply Button */}
            <button
              onClick={handleApplyTheme}
              className="px-3.5 py-1.5 rounded-xl bg-[#8B1E22] hover:bg-[#74181B] text-[#FFF8EE] font-semibold text-xs shadow-md shadow-red-950/40 transition-all flex items-center gap-1.5 cursor-pointer active:scale-98"
            >
              {appliedNotice ? <Check size={14} className="text-emerald-300 animate-in zoom-in" /> : <Palette size={14} />}
              <span>{appliedNotice ? 'Applied!' : 'Apply Theme'}</span>
            </button>

            {/* Close Studio */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Mobile View Toggle Buttons */}
        <div className="md:hidden flex border-b border-gray-800 bg-[#151c27]">
          <button
            onClick={() => setMobileTab('editor')}
            className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 ${
              mobileTab === 'editor' ? 'border-[#8B1E22] text-white' : 'border-transparent text-gray-400'
            }`}
          >
            Palette Editor
          </button>
          <button
            onClick={() => setMobileTab('preview')}
            className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 ${
              mobileTab === 'preview' ? 'border-[#8B1E22] text-white' : 'border-transparent text-gray-400'
            }`}
          >
            Live Preview
          </button>
        </div>

        {/* =========================================================================
            MAIN BODY: DUAL PANE LAYOUT (Editor on Left, Live Realistic Preview on Right)
           ========================================================================= */}
        <div className="flex-1 flex overflow-hidden">
          {/* -----------------------------------------------------------------------
              LEFT PANE: TOKEN EDITOR & COLOR PICKERS
             ----------------------------------------------------------------------- */}
          <div
            className={`w-full md:w-[48%] lg:w-[45%] flex flex-col border-r border-gray-800/80 bg-[#12161f] ${
              mobileTab === 'editor' ? 'flex' : 'hidden md:flex'
            }`}
          >
            {/* Category Tabs */}
            <div className="p-2 border-b border-gray-800/80 bg-[#151c27]/60 flex items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveCategory('general')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeCategory === 'general'
                    ? 'bg-[#8B1E22] text-[#FFF8EE] shadow-xs'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                }`}
              >
                <Sliders size={13} />
                <span>General & Accent</span>
              </button>

              <button
                onClick={() => setActiveCategory('chat')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeCategory === 'chat'
                    ? 'bg-[#8B1E22] text-[#FFF8EE] shadow-xs'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                }`}
              >
                <MessageSquare size={13} />
                <span>Chat & Bubbles</span>
              </button>

              <button
                onClick={() => setActiveCategory('navigation')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeCategory === 'navigation'
                    ? 'bg-[#8B1E22] text-[#FFF8EE] shadow-xs'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                }`}
              >
                <Compass size={13} />
                <span>Navigation & Bar</span>
              </button>

              <button
                onClick={() => setActiveCategory('media')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeCategory === 'media'
                    ? 'bg-[#8B1E22] text-[#FFF8EE] shadow-xs'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                }`}
              >
                <Layers size={13} />
                <span>Media & UI</span>
              </button>

              <button
                onClick={() => setActiveCategory('custom')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeCategory === 'custom'
                    ? 'bg-[#8B1E22] text-[#FFF8EE] shadow-xs'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                }`}
              >
                <Palette size={13} />
                <span>My Themes {customThemes.length > 0 ? `(${customThemes.length})` : ''}</span>
              </button>
            </div>

            {/* Token List Scroll Area OR My Themes View */}
            {activeCategory === 'custom' ? (
              customThemes.length === 0 ? (
                <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#161d28] border border-gray-800 flex items-center justify-center text-gray-500 mb-3 shadow-inner">
                    <Palette size={26} className="text-gray-400" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1">No custom themes yet.</h4>
                  <p className="text-xs text-gray-400 max-w-xs mb-5">
                    Create your first theme in Theme Studio.
                  </p>
                  <button
                    onClick={handleCreateNewTheme}
                    className="px-4 py-2 rounded-xl bg-[#8B1E22] hover:bg-[#74181B] text-[#FFF8EE] text-xs font-semibold flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all"
                  >
                    <Plus size={14} />
                    <span>Create Custom Theme</span>
                  </button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                    <span className="text-xs font-semibold text-gray-300">
                      Your Custom Themes ({customThemes.length})
                    </span>
                    <button
                      onClick={handleCreateNewTheme}
                      className="px-2.5 py-1 rounded-lg bg-[#8B1E22] hover:bg-[#74181B] text-[#FFF8EE] text-[11px] font-medium flex items-center gap-1 transition-colors"
                    >
                      <Plus size={12} />
                      <span>New Theme</span>
                    </button>
                  </div>
                  {customThemes.map((ct) => {
                    const isSelected = currentTheme.id === ct.id;
                    return (
                      <div
                        key={ct.id}
                        className={`p-3 rounded-xl border transition-all flex flex-col gap-2.5 ${
                          isSelected
                            ? 'bg-[#182232] border-[#8B1E22] shadow-sm'
                            : 'bg-[#161d28] border-gray-800 hover:border-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex -space-x-1 shrink-0">
                              <span
                                className="w-4 h-4 rounded-full border border-black/40 inline-block"
                                style={{ backgroundColor: ct.tokens.primary }}
                              />
                              <span
                                className="w-4 h-4 rounded-full border border-black/40 inline-block"
                                style={{ backgroundColor: ct.tokens.bubbleOut }}
                              />
                              <span
                                className="w-4 h-4 rounded-full border border-black/40 inline-block"
                                style={{ backgroundColor: ct.tokens.bg }}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                <span>{ct.name}</span>
                                {isSelected && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-[#8B1E22]/30 text-[#FFF8EE] text-[10px] font-medium border border-[#8B1E22]/50">
                                    Active
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-gray-400 capitalize">
                                {ct.mode} mode
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleOpenRename(ct)}
                              title="Rename theme"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/80 transition-colors"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteTheme(ct.id)}
                              title="Delete theme"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-gray-800/80 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1 border-t border-gray-800/60">
                          <button
                            onClick={() => handleSelectTheme(ct.id)}
                            className={`flex-1 py-1 px-2.5 rounded-lg text-xs font-medium transition-colors text-center ${
                              isSelected
                                ? 'bg-[#8B1E22]/20 text-white border border-[#8B1E22]/40 cursor-default'
                                : 'bg-gray-800/70 hover:bg-gray-800 text-gray-300 hover:text-white'
                            }`}
                          >
                            {isSelected ? 'Currently Editing' : 'Load in Editor'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {filteredTokens.map((tokenDef) => {
                  const currentColor = (currentTheme.tokens as any)[tokenDef.key] || '#000000';
                  const defaultColor = (basePreset.tokens as any)[tokenDef.key] || '';
                  const isModified = defaultColor && currentColor.toLowerCase() !== defaultColor.toLowerCase();

                  // WCAG Contrast check if applicable
                  let contrast: ContrastStatus | null = null;
                  if (tokenDef.contrastAgainst) {
                    const bg = (currentTheme.tokens as any)[tokenDef.contrastAgainst];
                    if (bg) {
                      contrast = checkContrast(bg, currentColor);
                    }
                  }

                  return (
                    <div
                      key={tokenDef.key}
                      className="p-3 rounded-xl bg-[#161d28] border border-gray-800 hover:border-gray-700/80 transition-all flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-gray-200 flex items-center gap-2">
                            <span>{tokenDef.label}</span>
                            {isModified && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Customized" />
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400 leading-tight mt-0.5">{tokenDef.description}</div>
                        </div>

                        {isModified && (
                          <button
                            onClick={() => handleResetToken(tokenDef.key)}
                            title="Reset this color to preset default"
                            className="p-1 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-gray-800/60 transition-colors"
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                      </div>

                      {/* Color Input Controls */}
                      <div className="flex items-center gap-2 mt-1">
                        {/* Native Color Picker Swatch */}
                        <label
                          className="relative w-9 h-9 rounded-xl border border-white/20 shadow-xs cursor-pointer shrink-0 overflow-hidden flex items-center justify-center transition-transform hover:scale-105"
                          style={{ backgroundColor: currentColor }}
                        >
                          <input
                            type="color"
                            value={currentColor.startsWith('#') && currentColor.length === 7 ? currentColor : '#8B1E22'}
                            onChange={(e) => handleTokenChange(tokenDef.key, e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </label>

                        {/* HEX / CSS Value Input */}
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={currentColor}
                            onChange={(e) => handleTokenChange(tokenDef.key, e.target.value)}
                            className="w-full bg-[#1e2736] border border-gray-700/80 rounded-xl px-3 py-1.5 text-xs font-mono text-white focus:outline-hidden focus:ring-1 focus:ring-teleforge-primary"
                            placeholder="#RRGGBB or rgba(...)"
                          />
                        </div>

                        {/* Quick Swatches */}
                        <div className="hidden sm:flex items-center gap-1 shrink-0">
                          {['#8B1E22', '#00D2FF', '#E11D48', '#0284C7', '#10B981', '#8B5CF6', '#FFFFFF'].map((swatch) => (
                            <button
                              key={swatch}
                              type="button"
                              onClick={() => handleTokenChange(tokenDef.key, swatch)}
                              className="w-4 h-4 rounded-md border border-black/20 shrink-0 hover:scale-115 transition-transform"
                              style={{ backgroundColor: swatch }}
                              title={`Set to ${swatch}`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* WCAG Contrast Rating Pill */}
                      {contrast && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 ${
                              contrast.isCompliant
                                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                                : 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                            }`}
                          >
                            {!contrast.isCompliant && <AlertTriangle size={10} />}
                            <span>
                              {contrast.ratio}:1 &bull; {contrast.message}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Editor Footer Hint */}
            <div className="p-3 bg-[#151c27]/60 border-t border-gray-800/80 flex items-center justify-between text-[11px] text-gray-400">
              <span>Changes in the preview are live (0ms).</span>
              <span className="text-gray-400">Click &quot;Apply Theme&quot; to apply to TeleForge.</span>
            </div>
          </div>

          {/* -----------------------------------------------------------------------
              RIGHT PANE: REALISTIC INTERACTIVE LIVE PREVIEW
             ----------------------------------------------------------------------- */}
          <div
            className={`w-full md:w-[52%] lg:w-[55%] flex flex-col bg-[#0b0e14] p-3 sm:p-4 md:p-6 overflow-y-auto ${
              mobileTab === 'preview' ? 'flex' : 'hidden md:flex'
            }`}
          >
            {/* Window Container Mockup */}
            <div
              className="w-full max-w-xl mx-auto rounded-2xl shadow-2xl border flex flex-col overflow-hidden transition-colors duration-150"
              style={{
                backgroundColor: currentTheme.tokens.bg,
                borderColor: currentTheme.tokens.border,
                color: currentTheme.tokens.textPrimary,
              }}
            >
              {/* Window Header Title Bar */}
              <div
                className="px-4 py-3 flex items-center justify-between border-b transition-colors"
                style={{
                  backgroundColor: currentTheme.tokens.topBar,
                  borderColor: currentTheme.tokens.border,
                }}
              >
                {/* Contact Profile in Header */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative">
                    <Avatar
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
                      name="Elena Rostova"
                      size="sm"
                    />
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 rounded-full" style={{ borderColor: currentTheme.tokens.topBar }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold truncate" style={{ color: currentTheme.tokens.textPrimary }}>
                        Elena Rostova
                      </span>
                      <ShieldCheck size={13} style={{ color: currentTheme.tokens.primary }} />
                    </div>
                    <div className="text-[10px]" style={{ color: currentTheme.tokens.textSecondary }}>
                      online &bull; MTProto 2.0
                    </div>
                  </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="p-1.5 rounded-full hover:opacity-80 transition-opacity"
                    style={{ color: currentTheme.tokens.iconTint }}
                  >
                    <Phone size={15} />
                  </button>
                  <button
                    type="button"
                    className="p-1.5 rounded-full hover:opacity-80 transition-opacity"
                    style={{ color: currentTheme.tokens.iconTint }}
                  >
                    <Info size={15} />
                  </button>
                </div>
              </div>

              {/* Navigation / Folders Mock Bar */}
              <div
                className="px-2 py-1 flex items-center gap-1 border-b text-[11px] font-semibold"
                style={{
                  backgroundColor: currentTheme.tokens.tabBg,
                  borderColor: currentTheme.tokens.border,
                }}
              >
                <div
                  className="px-2.5 py-1 rounded-lg border-b-2 flex items-center gap-1"
                  style={{
                    color: currentTheme.tokens.tabSelected,
                    borderColor: currentTheme.tokens.tabSelected,
                  }}
                >
                  <span>All</span>
                  <span
                    className="px-1 py-0.2 rounded-full text-[9px] font-bold"
                    style={{
                      backgroundColor: currentTheme.tokens.primary,
                      color: currentTheme.tokens.secondaryAccent,
                    }}
                  >
                    4
                  </span>
                </div>

                <div className="px-2.5 py-1 opacity-60 flex items-center gap-1" style={{ color: currentTheme.tokens.textSecondary }}>
                  <span>Personal 💬</span>
                </div>

                <div className="px-2.5 py-1 opacity-60 flex items-center gap-1" style={{ color: currentTheme.tokens.textSecondary }}>
                  <span>Work</span>
                </div>
              </div>

              {/* Search Bar Mockup */}
              <div className="px-3 py-2 border-b" style={{ borderColor: currentTheme.tokens.border }}>
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                  style={{ backgroundColor: currentTheme.tokens.searchBg }}
                >
                  <Search size={13} style={{ color: currentTheme.tokens.iconTint }} />
                  <span className="text-[11px] opacity-60" style={{ color: currentTheme.tokens.textSecondary }}>
                    Search chats, messages, files...
                  </span>
                </div>
              </div>

              {/* Chat Stream Area */}
              <div
                className="p-4 space-y-3 min-h-[260px] teleforge-chat-pattern flex flex-col justify-end"
                style={{ backgroundColor: currentTheme.tokens.bg }}
              >
                {/* Received Message Bubble */}
                <div className="flex items-end gap-2 max-w-[85%]">
                  <Avatar
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
                    name="Elena Rostova"
                    size="sm"
                    className="w-7 h-7 mb-0.5"
                  />
                  <div
                    className="p-3 rounded-2xl rounded-tl-xs shadow-sm border text-xs"
                    style={{
                      backgroundColor: currentTheme.tokens.bubbleIn,
                      color: currentTheme.tokens.bubbleInText,
                      borderColor: currentTheme.tokens.border,
                    }}
                  >
                    {/* Reply quote snippet */}
                    <div
                      className="mb-1.5 pl-2 py-0.5 border-l-2 text-[11px] rounded-r-sm bg-black/5 dark:bg-white/5"
                      style={{ borderColor: currentTheme.tokens.replyAccent }}
                    >
                      <div className="font-bold text-[10px]" style={{ color: currentTheme.tokens.replyAccent }}>
                        Elena Rostova
                      </div>
                      <div className="opacity-80 text-[10px]">What do you think of this theme palette?</div>
                    </div>

                    <div>Everything looks remarkably smooth and sharp in TeleForge! Check the real-time contrast.</div>

                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px]" style={{ color: currentTheme.tokens.timestamp }}>
                      <span>10:42 AM</span>
                    </div>
                  </div>
                </div>

                {/* Outgoing Message Bubble */}
                <div className="flex items-end justify-end max-w-[85%] ml-auto">
                  <div
                    className="p-3 rounded-2xl rounded-tr-xs shadow-sm border text-xs relative"
                    style={{
                      backgroundColor: currentTheme.tokens.bubbleOut,
                      color: currentTheme.tokens.bubbleOutText,
                      borderColor: currentTheme.tokens.border,
                    }}
                  >
                    <div>The live preview updates instantaneously without reloads! 🚀</div>

                    {/* Reaction Chip */}
                    <div
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold mt-1.5 border shadow-2xs"
                      style={{
                        backgroundColor: currentTheme.tokens.surfaceElevated,
                        borderColor: currentTheme.tokens.border,
                        color: currentTheme.tokens.textPrimary,
                      }}
                    >
                      <Flame size={11} className="text-amber-500" />
                      <span>3</span>
                    </div>

                    <div
                      className="flex items-center justify-end gap-1 mt-1 text-[10px]"
                      style={{ color: currentTheme.tokens.timestamp }}
                    >
                      <span>10:43 AM</span>
                      <CheckCheck size={13} style={{ color: currentTheme.tokens.primary }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Mock Controls & Input Footer */}
              <div
                className="p-3 border-t flex flex-col gap-2.5"
                style={{
                  backgroundColor: currentTheme.tokens.surface,
                  borderColor: currentTheme.tokens.border,
                }}
              >
                {/* Interactive Controls Row (Progress bar, Switch, Checkbox) */}
                <div className="flex items-center justify-between gap-3 text-xs px-1">
                  {/* Interactive Audio Scrubber */}
                  <div className="flex-1 flex items-center gap-2">
                    <button
                      type="button"
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 shadow-xs"
                      style={{ backgroundColor: currentTheme.tokens.primary }}
                    >
                      <Play size={11} className="translate-x-0.2" />
                    </button>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-500/20 relative overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: '68%',
                          backgroundColor: currentTheme.tokens.progressBar,
                        }}
                      />
                    </div>
                    <span className="text-[10px] opacity-70 font-mono" style={{ color: currentTheme.tokens.textSecondary }}>
                      0:18
                    </span>
                  </div>

                  {/* Interactive Toggle Switch */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewSwitchChecked(!previewSwitchChecked)}
                      className="w-8 h-4.5 rounded-full relative transition-colors cursor-pointer"
                      style={{
                        backgroundColor: previewSwitchChecked ? currentTheme.tokens.switchActive : '#4B5563',
                      }}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${
                          previewSwitchChecked ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                    <span className="text-[10px] select-none" style={{ color: currentTheme.tokens.textSecondary }}>
                      Alerts
                    </span>
                  </div>

                  {/* Interactive Checkbox */}
                  <div
                    onClick={() => setPreviewCheckboxChecked(!previewCheckboxChecked)}
                    className="flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <div
                      className="w-4 h-4 rounded-md border flex items-center justify-center transition-colors shadow-2xs"
                      style={{
                        backgroundColor: previewCheckboxChecked ? currentTheme.tokens.checkboxActive : 'transparent',
                        borderColor: previewCheckboxChecked ? currentTheme.tokens.checkboxActive : currentTheme.tokens.border,
                      }}
                    >
                      {previewCheckboxChecked && <Check size={11} className="text-white" />}
                    </div>
                    <span className="text-[10px] select-none" style={{ color: currentTheme.tokens.textSecondary }}>
                      Pin
                    </span>
                  </div>
                </div>

                {/* Message Input & Action Button */}
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 px-3 py-2 rounded-xl text-xs flex items-center border"
                    style={{
                      backgroundColor: currentTheme.tokens.surfaceElevated,
                      borderColor: currentTheme.tokens.border,
                      color: currentTheme.tokens.textPrimary,
                    }}
                  >
                    <span className="opacity-60">Write a message...</span>
                  </div>

                  <button
                    type="button"
                    className="p-2 rounded-xl text-white shadow-md flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity shrink-0"
                    style={{ backgroundColor: currentTheme.tokens.actionButton }}
                  >
                    <Send size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Theme Info Card */}
            <div className="mt-4 p-3.5 rounded-xl bg-[#141a24] border border-gray-800 text-xs text-gray-400 flex items-center justify-between">
              <div>
                <span className="font-semibold text-white">{currentTheme.name}</span> &bull;{' '}
                <span className="capitalize">{currentTheme.mode} Mode</span> &bull;{' '}
                {currentTheme.isCustom ? 'Custom User Theme' : 'Official Preset'}
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full border border-white/20"
                  style={{ backgroundColor: currentTheme.tokens.primary }}
                  title="Primary"
                />
                <span
                  className="w-3 h-3 rounded-full border border-white/20"
                  style={{ backgroundColor: currentTheme.tokens.bubbleOut }}
                  title="Outgoing Bubble"
                />
                <span
                  className="w-3 h-3 rounded-full border border-white/20"
                  style={{ backgroundColor: currentTheme.tokens.bg }}
                  title="Background"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          IMPORT JSON MODAL
         ========================================================================= */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#17212b] border border-gray-700/80 rounded-2xl p-5 max-w-lg w-full shadow-2xl text-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Upload size={16} className="text-teleforge-primary" />
                <span>Import TeleForge Theme</span>
              </h3>
              <button onClick={() => setIsImportModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-3">
              Upload a <code className="text-rose-300">.json</code> theme file or paste theme JSON code below:
            </p>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 rounded-xl border border-dashed border-gray-600 hover:border-teleforge-primary bg-gray-800/40 text-xs font-semibold text-gray-300 hover:text-white transition-all flex items-center justify-center gap-2 mb-3"
            >
              <Upload size={14} />
              <span>Browse Theme File from Computer</span>
            </button>

            <div className="text-[11px] text-gray-400 mb-1 font-semibold">Or Paste Raw JSON:</div>
            <textarea
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder="Paste theme JSON object here..."
              rows={6}
              className="w-full font-mono text-xs p-3 rounded-xl bg-[#101722] border border-gray-700 text-gray-200 focus:outline-hidden focus:ring-1 focus:ring-teleforge-primary"
            />

            {importError && (
              <div className="mt-2 text-xs text-rose-400 flex items-center gap-1.5">
                <AlertTriangle size={13} />
                <span>{importError}</span>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handlePasteImportConfirm}
                className="px-4 py-1.5 rounded-xl bg-[#8B1E22] hover:bg-[#74181B] text-[#FFF8EE] text-xs font-semibold shadow-xs"
              >
                Import & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          RENAME MODAL
         ========================================================================= */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#17212b] border border-gray-700/80 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-gray-200">
            <h3 className="text-sm font-bold text-white mb-2">Rename Custom Theme</h3>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#101722] border border-gray-700 text-sm text-white focus:outline-hidden focus:ring-1 focus:ring-teleforge-primary mb-4"
              placeholder="Enter theme name"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsRenameModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameConfirm}
                className="px-4 py-1.5 rounded-xl bg-[#8B1E22] hover:bg-[#74181B] text-[#FFF8EE] text-xs font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          NEW CUSTOM THEME MODAL
         ========================================================================= */}
      {isNewThemeModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#17212b] border border-gray-700/80 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-gray-200">
            <h3 className="text-sm font-bold text-white mb-2">Create Custom Theme</h3>
            <p className="text-xs text-gray-400 mb-3">
              Give your new theme a name. Current colors and settings will be copied as a starting point.
            </p>
            <input
              type="text"
              value={newThemeNameInput}
              onChange={(e) => setNewThemeNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmCreateTheme();
              }}
              className="w-full px-3 py-2 rounded-xl bg-[#101722] border border-gray-700 text-sm text-white focus:outline-hidden focus:ring-1 focus:ring-teleforge-primary mb-4"
              placeholder="e.g. Midnight Ruby"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsNewThemeModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCreateTheme}
                className="px-4 py-1.5 rounded-xl bg-[#8B1E22] hover:bg-[#74181B] text-[#FFF8EE] text-xs font-semibold shadow-xs"
              >
                Create Theme
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
