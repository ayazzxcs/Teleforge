import React, { useState, useRef } from 'react';
import {
  X,
  Moon,
  Sun,
  Bell,
  BellRing,
  Volume2,
  Shield,
  Key,
  Sparkles,
  User,
  Check,
  Laptop,
  Palette,
  Wrench,
  Cpu,
  Download,
  Upload,
  RotateCcw,
  Info,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Camera,
  Image as ImageIcon,
  Trash2,
  Link as LinkIcon,
  Smartphone,
  LogOut,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { UserProfile } from '../types';
import { TeleForgeTheme, BUILTIN_PRESETS, applyTheme } from '../theme/teleforgeTheme';
import {
  exportTeleForgeSettings,
  importTeleForgeSettings,
  resetTeleForgeSettings,
  TELEFORGE_CLIENT_VERSION,
} from '../services/teleforgeSettingsMigration';
import { showToast } from './Toast';
import { TeleForgeLogo } from './TeleForgeLogo';
import { telegramApi, TelegramSessionInfo, isAndroidApp } from '../services/telegramApi';
import { Avatar } from './Avatar';
import { avatarService } from '../services/avatarService';
import { notificationService, NotificationSettings } from '../services/notificationService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onUpdateUser: (updated: UserProfile) => Promise<void> | void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenThemeStudio?: () => void;
  onOpenPowerTools?: () => void;
  onOpenCommandCenter?: () => void;
  activeTheme?: TeleForgeTheme;
  onSelectTheme?: (theme: TeleForgeTheme) => void;
  initialTab?: 'profile' | 'appearance' | 'teleforge' | 'notifications' | 'privacy' | 'about';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  darkMode,
  onToggleDarkMode,
  onOpenThemeStudio,
  onOpenPowerTools,
  onOpenCommandCenter,
  activeTheme,
  onSelectTheme,
  initialTab = 'profile',
}) => {
  const [activeTab, setActiveTab] = useState<
    'profile' | 'appearance' | 'teleforge' | 'notifications' | 'privacy' | 'about'
  >(initialTab);
  const [formData, setFormData] = useState<UserProfile>(user);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isLicensesOpen, setIsLicensesOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Notification settings state with persistence
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(() =>
    notificationService.getSettings()
  );
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(() =>
    notificationService.getPermissionStatus()
  );

  const handleUpdateNotifSetting = (key: keyof NotificationSettings, val: boolean) => {
    notificationService.updateSettings({ [key]: val });
    setNotifSettings(notificationService.getSettings());
  };

  const handleRequestPermission = async () => {
    const perm = await notificationService.requestPermission();
    setBrowserPermission(perm);
    if (perm === 'granted') {
      showToast('Notifications enabled successfully!', 'success');
    } else if (perm === 'denied') {
      showToast('Notification permission was blocked in browser settings', 'error');
    }
  };

  const handleTestNotification = () => {
    notificationService.playNotificationSound();
    notificationService.showSystemNotification({
      title: 'TeleForge Notification Test',
      body: 'Notifications and Telegram audio chimes are working properly! 🔔',
      chatId: 'saved-messages',
    });
    showToast('Chime played & test notification sent!', 'success');
  };

  // Profile photo state with session persistence
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(() => {
    try {
      return sessionStorage.getItem('teleforge_photo_modal_open') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [photoSourceTab, setPhotoSourceTab] = useState<'upload' | 'url'>('upload');
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('teleforge_preview_photo') || null;
    } catch (e) {
      return null;
    }
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const isUploadingPhotoRef = useRef(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isDeletingPhoto, setIsDeletingPhoto] = useState(false);
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  // Auto-upload photo data URL to Telegram MTProto and update global user avatar
  const uploadPhotoDataUrl = async (photoDataUrl: string, fileName = 'profile.jpg') => {
    if (isUploadingPhotoRef.current) return;
    isUploadingPhotoRef.current = true;
    setIsUploadingPhoto(true);
    setPhotoError(null);
    setPreviewPhoto(photoDataUrl);

    try {
      const result = await telegramApi.uploadProfilePhoto({
        fileBase64: photoDataUrl,
        filename: fileName,
      });

      if (result && result.avatarUrl) {
        const photoSrc = result.dataUrl || photoDataUrl || result.avatarUrl;
        avatarService.setAvatar('me', photoSrc);
        if (formData.id) {
          avatarService.setAvatar(formData.id, photoSrc);
        }
        const updatedUser = {
          ...formData,
          avatar: result.avatarUrl,
        };
        setFormData(updatedUser);
        try {
          localStorage.setItem('teleforge_cached_user', JSON.stringify(updatedUser));
          sessionStorage.removeItem('teleforge_photo_modal_open');
          sessionStorage.removeItem('teleforge_preview_photo');
        } catch (e) {}
        await onUpdateUser(updatedUser);
        showToast('Profile photo updated on Telegram!', 'success');
        setIsPhotoModalOpen(false);
        setPreviewPhoto(null);
        setSelectedFile(null);
      } else {
        throw new Error('No avatar URL returned from Telegram');
      }
    } catch (err: any) {
      console.error('[SettingsModal] Failed to upload photo to Telegram:', err);
      setPhotoError(err?.message || 'Failed to upload photo to Telegram');
    } finally {
      setIsUploadingPhoto(false);
      isUploadingPhotoRef.current = false;
    }
  };

  // Sync photo modal state to sessionStorage
  React.useEffect(() => {
    try {
      if (isPhotoModalOpen) {
        sessionStorage.setItem('teleforge_photo_modal_open', 'true');
      } else {
        sessionStorage.removeItem('teleforge_photo_modal_open');
      }
    } catch (e) {}
  }, [isPhotoModalOpen]);

  React.useEffect(() => {
    try {
      if (previewPhoto) {
        sessionStorage.setItem('teleforge_preview_photo', previewPhoto);
      } else {
        sessionStorage.removeItem('teleforge_preview_photo');
      }
    } catch (e) {}
  }, [previewPhoto]);

  // Listen for native Android photo selection event
  React.useEffect(() => {
    const handleNativePhoto = (e: any) => {
      const dataUrl = e.detail?.dataUrl;
      if (dataUrl) {
        setPreviewPhoto(dataUrl);
        setPhotoError(null);
        setSelectedFile(null);
        setPhotoSourceTab('upload');
        setIsPhotoModalOpen(true);
        uploadPhotoDataUrl(dataUrl, 'profile.jpg');
      }
    };
    window.addEventListener('teleforge:photoSelected', handleNativePhoto);
    return () => window.removeEventListener('teleforge:photoSelected', handleNativePhoto);
  }, [formData]);

  // Privacy & Active Sessions state
  const [phoneNumberRule, setPhoneNumberRule] = useState<'everybody' | 'contacts' | 'nobody'>('contacts');
  const [lastSeenRule, setLastSeenRule] = useState<'everybody' | 'contacts' | 'nobody'>('everybody');
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState<string | null>(null);

  const [isActiveSessionsOpen, setIsActiveSessionsOpen] = useState(false);
  const [sessionsList, setSessionsList] = useState<TelegramSessionInfo[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [terminatingHash, setTerminatingHash] = useState<string | null>(null);
  const [isTerminatingAll, setIsTerminatingAll] = useState(false);

  // Sync privacy & active sessions when privacy tab is active
  React.useEffect(() => {
    if (activeTab === 'privacy' && isOpen) {
      telegramApi.getPrivacy('phoneNumber').then(setPhoneNumberRule).catch(() => {});
      telegramApi.getPrivacy('lastSeen').then(setLastSeenRule).catch(() => {});
      telegramApi.getAuthorizations().then(setSessionsList).catch(() => {});
    }
  }, [activeTab, isOpen]);

  const handleUpdatePrivacy = async (keyType: 'phoneNumber' | 'lastSeen', rule: 'everybody' | 'contacts' | 'nobody') => {
    setIsUpdatingPrivacy(keyType);
    try {
      await telegramApi.setPrivacy(keyType, rule);
      if (keyType === 'phoneNumber') setPhoneNumberRule(rule);
      if (keyType === 'lastSeen') setLastSeenRule(rule);
      showToast(
        `${keyType === 'phoneNumber' ? 'Phone number' : 'Last seen'} visibility set to ${
          rule === 'everybody' ? 'Everybody' : rule === 'contacts' ? 'My Contacts' : 'Nobody'
        }`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Failed to update privacy settings', 'error');
    } finally {
      setIsUpdatingPrivacy(null);
    }
  };

  const handleOpenSessions = async () => {
    setIsActiveSessionsOpen(true);
    setIsLoadingSessions(true);
    try {
      const list = await telegramApi.getAuthorizations();
      setSessionsList(list);
    } catch (err: any) {
      showToast(err?.message || 'Failed to load active sessions', 'error');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleTerminateSession = async (hash: string) => {
    setTerminatingHash(hash);
    try {
      await telegramApi.terminateSession(hash);
      setSessionsList((prev) => prev.filter((s) => s.hash !== hash));
      showToast('Session terminated successfully', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to terminate session', 'error');
    } finally {
      setTerminatingHash(null);
    }
  };

  const handleTerminateAllOtherSessions = async () => {
    setIsTerminatingAll(true);
    try {
      await telegramApi.terminateAllOtherSessions();
      setSessionsList((prev) => prev.filter((s) => s.current));
      showToast('All other sessions terminated on Telegram cloud', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to terminate other sessions', 'error');
    } finally {
      setIsTerminatingAll(false);
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      setFormData(user);
      setSaveError(null);
      setSavedSuccess(false);
    }
  }, [isOpen, user]);

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // Universal Escape key listener
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPhotoModalOpen) {
          setIsPhotoModalOpen(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isPhotoModalOpen]);

  if (!isOpen) return null;

  const handleOpenPhotoModal = () => {
    setPhotoError(null);
    setPreviewPhoto(null);
    setPhotoUrlInput('');
    setSelectedFile(null);
    setPhotoSourceTab('upload');
    setIsPhotoModalOpen(true);
    try {
      sessionStorage.removeItem('teleforge_preview_photo');
      sessionStorage.setItem('teleforge_photo_modal_open', 'true');
    } catch (e) {}
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = !file.type || file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
    if (!isImage) {
      setPhotoError('Please select a valid image file (JPG, PNG, WEBP, GIF).');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setPhotoError('Image size exceeds 20 MB limit.');
      return;
    }

    setSelectedFile(file);
    setPhotoError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) return;

      // Automatically normalize and scale photos to max 1280px JPEG for instant preview and fast Telegram MTProto upload
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1280;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const optimized = canvas.toDataURL('image/jpeg', 0.92);
            setPreviewPhoto(optimized);
            uploadPhotoDataUrl(optimized, file.name);
            return;
          }
        } catch (e) {}
        setPreviewPhoto(rawDataUrl);
        uploadPhotoDataUrl(rawDataUrl, file.name);
      };
      img.onerror = () => {
        setPreviewPhoto(rawDataUrl);
        uploadPhotoDataUrl(rawDataUrl, file.name);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    if (photoFileInputRef.current) {
      photoFileInputRef.current.value = '';
    }
  };

  const handleUrlChange = (url: string) => {
    setPhotoUrlInput(url);
    setPhotoError(null);
    if (url.trim().startsWith('http://') || url.trim().startsWith('https://')) {
      setPreviewPhoto(url.trim());
    } else {
      setPreviewPhoto(null);
    }
  };

  const handleSavePhoto = async () => {
    setPhotoError(null);
    if (photoSourceTab === 'upload') {
      if (previewPhoto) {
        await uploadPhotoDataUrl(previewPhoto, selectedFile?.name || 'profile.jpg');
      } else {
        setPhotoError('Please select an image file first.');
      }
      return;
    }

    if (!photoUrlInput.trim()) {
      setPhotoError('Please enter an image URL.');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const result = await telegramApi.uploadProfilePhoto({
        url: photoUrlInput.trim(),
      });

      if (result && result.avatarUrl) {
        const photoSrc = result.dataUrl || previewPhoto || result.avatarUrl;
        avatarService.setAvatar('me', photoSrc);
        if (formData.id) {
          avatarService.setAvatar(formData.id, photoSrc);
        }
        const updatedUser = {
          ...formData,
          avatar: result.avatarUrl,
        };
        setFormData(updatedUser);
        try {
          localStorage.setItem('teleforge_cached_user', JSON.stringify(updatedUser));
          sessionStorage.removeItem('teleforge_photo_modal_open');
          sessionStorage.removeItem('teleforge_preview_photo');
        } catch (e) {}
        await onUpdateUser(updatedUser);
        showToast('Profile photo updated on Telegram!', 'success');
        setIsPhotoModalOpen(false);
        setPreviewPhoto(null);
        setSelectedFile(null);
        setPhotoUrlInput('');
      }
    } catch (err: any) {
      setPhotoError(err.message || 'Failed to upload photo to Telegram');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!window.confirm('Remove your profile photo from Telegram?')) return;
    setIsDeletingPhoto(true);
    try {
      await telegramApi.deleteProfilePhoto();
      avatarService.deleteAvatar('me');
      if (formData.id) {
        avatarService.deleteAvatar(formData.id);
      }
      const updatedUser = {
        ...formData,
        avatar: '',
      };
      setFormData(updatedUser);
      try {
        localStorage.setItem('teleforge_cached_user', JSON.stringify(updatedUser));
      } catch (e) {}
      await onUpdateUser(updatedUser);
      showToast('Profile photo removed from Telegram', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to remove photo from Telegram', 'error');
    } finally {
      setIsDeletingPhoto(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    try {
      await onUpdateUser(formData);
      setSavedSuccess(true);
      showToast('Profile updated on Telegram', 'success');
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to update profile on Telegram';
      setSaveError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    try {
      exportTeleForgeSettings();
      showToast('Exported TeleForge settings successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to export settings', 'error');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const res = importTeleForgeSettings(content);
      if (res.success) {
        showToast('Settings restored successfully! Reloading...', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else {
        showToast(res.error || 'Invalid settings backup file', 'error');
      }
    };
    reader.readAsText(file);
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const handleConfirmReset = () => {
    resetTeleForgeSettings();
    setIsResetConfirmOpen(false);
    showToast('TeleForge settings reset to defaults. Reloading...', 'info');
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#17212b] rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800/80">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-teleforge-cream">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800 px-4 bg-gray-50/50 dark:bg-[#121921] overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'profile'
                ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <User size={16} /> Profile
          </button>

          <button
            onClick={() => setActiveTab('teleforge')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'teleforge'
                ? 'border-[#8B1E22] text-[#8B1E22] dark:text-rose-400'
                : 'border-transparent text-gray-500 hover:text-[#8B1E22] dark:hover:text-rose-300'
            }`}
          >
            <Cpu size={16} /> TeleForge
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'appearance'
                ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Sparkles size={16} /> Appearance
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'notifications'
                ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Bell size={16} /> Notifications
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Shield size={16} /> Privacy
          </button>

          <button
            onClick={() => setActiveTab('about')}
            className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'about'
                ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Info size={16} /> About
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'profile' && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="relative group shrink-0 w-16 h-16 rounded-full overflow-hidden border-2 border-teleforge-primary shadow-sm bg-teleforge-primary/10 flex items-center justify-center">
                  <Avatar
                    peerId="me"
                    src={formData.avatar}
                    name={formData.name || 'User'}
                    size="xl"
                    className="w-full h-full text-xl"
                  />
                  <button
                    type="button"
                    onClick={handleOpenPhotoModal}
                    className="absolute inset-0 bg-black/50 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                    title="Change profile photo"
                  >
                    <Camera size={18} />
                    <span className="text-[10px] font-semibold mt-0.5">Edit</span>
                  </button>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-base">{formData.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formData.username || 'No username'}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      type="button"
                      onClick={handleOpenPhotoModal}
                      className="text-xs text-telegram-primary font-medium hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Camera size={13} /> Change photo
                    </button>
                    {formData.avatar && (
                      <button
                        type="button"
                        onClick={handleDeletePhoto}
                        disabled={isDeletingPhoto}
                        className="text-xs text-red-500 hover:text-red-600 font-medium hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 size={13} /> {isDeletingPhoto ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm focus:outline-hidden focus:border-telegram-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm focus:outline-hidden focus:border-telegram-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm focus:outline-hidden focus:border-telegram-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">Bio</label>
                <textarea
                  value={formData.bio}
                  rows={2}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm focus:outline-hidden focus:border-telegram-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                {saveError ? (
                  <span className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                    <AlertTriangle size={14} /> {saveError}
                  </span>
                ) : savedSuccess ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check size={14} /> Profile updated on Telegram
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-teleforge-primary text-teleforge-cream font-medium text-sm hover:bg-teleforge-hover transition-colors shadow-sm shadow-red-950/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Saving to Telegram...</span>
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'teleforge' && (
            <div className="space-y-4">
              {/* TeleForge Command Center Hero Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#8B1E22]/30 via-gray-900/50 to-[#8B1E22]/20 border border-red-900/40 shadow-lg">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#8B1E22] to-[#B91C1C] flex items-center justify-center shadow-md text-[#FFF8EE]">
                      <Cpu size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-[#FFF8EE]">TeleForge Command Center</h4>
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-red-900/40 text-rose-300 border border-red-800/40">HUB</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Fast control hub for quick toggles, favorites, storage analysis & search.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-gray-200/20 dark:border-gray-800/60">
                  <div className="text-xs text-gray-400">
                    Primary TeleForge Control Hub
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCommandCenter?.();
                    }}
                    className="px-4 py-2 rounded-xl bg-[#8B1E22] hover:bg-[#74181B] text-[#FFF8EE] text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer hover:scale-102 active:scale-98"
                  >
                    <Cpu size={15} />
                    <span>Launch Command Center</span>
                  </button>
                </div>
              </div>

              {/* Theme Studio Card */}
              <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#8B1E22] text-[#FFF8EE] flex items-center justify-center shadow-xs">
                    <Palette size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900 dark:text-white">Theme Studio</div>
                    <div className="text-[11px] text-gray-400">24 custom color tokens & presets</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenThemeStudio?.();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-[#8B1E22] hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Open
                </button>
              </div>

              {/* Power Tools Card */}
              <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                    <Wrench size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900 dark:text-white">Power Tools Hub</div>
                    <div className="text-[11px] text-gray-400">Reactions, gestures, compact density</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPowerTools?.();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-amber-600 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Open
                </button>
              </div>

              {/* Architecture Safeguard Note */}
              <div className="p-3 rounded-xl bg-gray-100/60 dark:bg-gray-900/60 border border-gray-200/50 dark:border-gray-800/50 text-[11px] text-gray-400 flex items-center justify-between">
                <span>Telegram MTProto Layer 198 Active</span>
                <span className="text-emerald-500 font-medium">Safe Orchestration</span>
              </div>

              {/* Data, Backup & Reset Section */}
              <div className="p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/80 dark:border-gray-800/80 space-y-3">
                <div>
                  <h5 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                    Preferences Backup & Reset
                  </h5>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Save or restore your custom themes, gestures & favorites without sensitive keys
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleExport}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-800 dark:text-gray-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Export Settings</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => importFileRef.current?.click()}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-800 dark:text-gray-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload size={14} />
                    <span>Import Settings</span>
                  </button>
                </div>

                <input
                  type="file"
                  ref={importFileRef}
                  onChange={handleImportFile}
                  accept=".json,application/json"
                  className="hidden"
                />

                <div className="pt-2.5 border-t border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between">
                  <div className="text-[11px] text-gray-400">
                    Reset local customization to factory defaults
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsResetConfirmOpen(true)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Reset Settings</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              {/* TeleForge Theme Studio Banner Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-red-950/30 via-gray-900/40 to-red-950/20 border border-red-900/30 shadow-md">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#8B1E22] to-[#B91C1C] flex items-center justify-center shadow-md">
                      <Palette size={20} className="text-[#FFF8EE]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white">TeleForge Theme Studio</h4>
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-red-900/40 text-rose-300 border border-red-800/40">PRO</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Design 24 custom tokens with interactive live preview & contrast check.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-gray-200/20 dark:border-gray-800/60">
                  <div className="text-xs text-gray-400">
                    Active: <span className="font-semibold text-gray-800 dark:text-gray-200">{activeTheme?.name || 'TeleForge Red'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenThemeStudio?.();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-[#8B1E22] hover:bg-[#74181B] text-[#FFF8EE] text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Palette size={14} />
                    <span>Open Theme Studio</span>
                  </button>
                </div>
              </div>

              {/* TeleForge Power Tools Hub Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/20 via-gray-900/30 to-amber-950/10 border border-amber-800/30 shadow-md">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center shadow-md">
                      <Wrench size={20} className="text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white">TeleForge Power Tools</h4>
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-amber-900/40 text-amber-300 border border-amber-800/40">NEW</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Chat styling, reactions, swipe gestures, compact density & immersive media.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-gray-200/20 dark:border-gray-800/60">
                  <div className="text-xs text-gray-400">
                    5 Power Modules Active
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPowerTools?.();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Wrench size={14} />
                    <span>Open Power Tools</span>
                  </button>
                </div>
              </div>

              {/* Quick Preset Selector */}
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">Preset Themes</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BUILTIN_PRESETS.map((preset) => {
                    const isSelected = activeTheme?.id === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          applyTheme(preset);
                          onSelectTheme?.(preset);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                          isSelected
                            ? 'border-teleforge-primary bg-red-50/70 dark:bg-red-950/40 text-teleforge-primary font-semibold ring-1 ring-teleforge-primary'
                            : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full border border-white/20 shrink-0 shadow-2xs"
                          style={{ backgroundColor: preset.tokens.primary }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs truncate">{preset.name.split(' ')[0]}</div>
                          <div className="text-[10px] opacity-60 capitalize">{preset.mode}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Base Mode</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      if (darkMode) onToggleDarkMode();
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      !darkMode
                        ? 'border-teleforge-primary bg-red-50/60 dark:bg-red-950/30 text-teleforge-primary font-semibold'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <Sun size={20} className="text-amber-600" />
                    <div className="text-left">
                      <div className="text-sm">Warm Day (Light)</div>
                      <div className="text-[11px] opacity-70">Warm cream & deep red</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      if (!darkMode) onToggleDarkMode();
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      darkMode
                        ? 'border-teleforge-primary bg-red-950/40 text-teleforge-primary dark:text-teleforge-cream font-semibold'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <Moon size={20} className="text-rose-400" />
                    <div className="text-left">
                      <div className="text-sm">Crimson Dark</div>
                      <div className="text-[11px] opacity-70">Deep dark elegant canvas</div>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Chat Wallpaper</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Patterned TeleForge chat background with adaptive contrast.
                </p>
                <div className="h-20 w-full rounded-xl teleforge-chat-pattern border border-gray-300 dark:border-gray-700 flex items-center justify-center">
                  <div className="px-3 py-1.5 rounded-lg bg-white/90 dark:bg-[#43191d] text-xs shadow-xs text-gray-900 dark:text-teleforge-cream border border-red-900/20">
                    TeleForge Message Preview
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Message Font Size</h4>
                <input type="range" min="13" max="18" defaultValue="15" className="w-full accent-teleforge-primary" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Small (13px)</span>
                  <span>Standard (15px)</span>
                  <span>Large (18px)</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-4">
              {/* Browser Permission Banner (Web mode) */}
              {!isAndroidApp() && typeof window !== 'undefined' && 'Notification' in window && (
                <div className={`p-4 rounded-xl border transition-all ${
                  browserPermission === 'granted'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300'
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BellRing size={18} className="shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">
                          {browserPermission === 'granted'
                            ? 'Desktop Notifications Active'
                            : 'Desktop Notifications Not Enabled'}
                        </div>
                        <div className="text-[11px] opacity-80 truncate">
                          {browserPermission === 'granted'
                            ? 'TeleForge can alert you when messages arrive in the background.'
                            : 'Grant permission to receive desktop alerts and message badges.'}
                        </div>
                      </div>
                    </div>
                    {browserPermission !== 'granted' && (
                      <button
                        onClick={handleRequestPermission}
                        className="px-3 py-1.5 rounded-lg bg-teleforge-primary text-white text-xs font-medium hover:opacity-90 transition-opacity shrink-0 shadow-sm"
                      >
                        Enable
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Master Notification Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-700/40">
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">Allow Notifications</div>
                  <div className="text-xs text-gray-500">Master switch for all incoming message alerts</div>
                </div>
                <input
                  type="checkbox"
                  checked={notifSettings.notificationsEnabled}
                  onChange={(e) => handleUpdateNotifSetting('notificationsEnabled', e.target.checked)}
                  className="w-4 h-4 accent-teleforge-primary rounded cursor-pointer"
                />
              </div>

              {/* Private Chats */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60">
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Private Chats</div>
                  <div className="text-xs text-gray-500">Alert on new direct messages</div>
                </div>
                <input
                  type="checkbox"
                  checked={notifSettings.privateChats}
                  onChange={(e) => handleUpdateNotifSetting('privateChats', e.target.checked)}
                  disabled={!notifSettings.notificationsEnabled}
                  className="w-4 h-4 accent-teleforge-primary rounded cursor-pointer disabled:opacity-40"
                />
              </div>

              {/* Groups */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60">
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Groups</div>
                  <div className="text-xs text-gray-500">Alert on new messages & mentions</div>
                </div>
                <input
                  type="checkbox"
                  checked={notifSettings.groups}
                  onChange={(e) => handleUpdateNotifSetting('groups', e.target.checked)}
                  disabled={!notifSettings.notificationsEnabled}
                  className="w-4 h-4 accent-teleforge-primary rounded cursor-pointer disabled:opacity-40"
                />
              </div>

              {/* Channels */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60">
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Channels</div>
                  <div className="text-xs text-gray-500">Broadcast channel posts</div>
                </div>
                <input
                  type="checkbox"
                  checked={notifSettings.channels}
                  onChange={(e) => handleUpdateNotifSetting('channels', e.target.checked)}
                  disabled={!notifSettings.notificationsEnabled}
                  className="w-4 h-4 accent-teleforge-primary rounded cursor-pointer disabled:opacity-40"
                />
              </div>

              {/* Message Sound Chime */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60">
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Message Sound</div>
                  <div className="text-xs text-gray-500">Play Telegram audio marimba chime</div>
                </div>
                <input
                  type="checkbox"
                  checked={notifSettings.soundEnabled}
                  onChange={(e) => handleUpdateNotifSetting('soundEnabled', e.target.checked)}
                  disabled={!notifSettings.notificationsEnabled}
                  className="w-4 h-4 accent-teleforge-primary rounded cursor-pointer disabled:opacity-40"
                />
              </div>

              {/* Test Notification Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestNotification}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-teleforge-primary/30 bg-teleforge-primary/10 text-teleforge-primary hover:bg-teleforge-primary/20 transition-all font-medium text-xs shadow-sm"
                >
                  <Volume2 size={16} />
                  <span>Test Notification & Audio Chime</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-4 text-sm">
              {/* Direct MTProto 2.0 Security Architecture Disclosure */}
              <div className="p-4 rounded-2xl bg-[#8B1E22]/5 dark:bg-[#8B1E22]/10 border border-[#8B1E22]/20 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#8B1E22] text-[#FFF8EE] flex items-center justify-center shrink-0">
                    <Shield size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <span>Direct MTProto 2.0 Connection</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                        NO MIDDLEMAN
                      </span>
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Zero-proxy device-to-Telegram encryption</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span>TeleForge connects directly to official Telegram servers using MTProto Layer 198.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span>No third-party server, proxy, or relay ever sees your credentials, messages, or media.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span>All customizations (themes, power tools, folders) reside exclusively in your local storage.</span>
                  </div>
                </div>
              </div>

              {/* Phone Number Visibility */}
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key size={16} className="text-[#8B1E22] dark:text-rose-400" />
                    <div>
                      <div className="font-semibold text-gray-800 dark:text-gray-200 text-xs sm:text-sm">Phone Number Visibility</div>
                      <div className="text-[11px] text-gray-500">Who can see your phone number</div>
                    </div>
                  </div>
                  {isUpdatingPrivacy === 'phoneNumber' && (
                    <Loader2 size={15} className="animate-spin text-teleforge-primary" />
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  {(['everybody', 'contacts', 'nobody'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={isUpdatingPrivacy === 'phoneNumber'}
                      onClick={() => handleUpdatePrivacy('phoneNumber', opt)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center border cursor-pointer ${
                        phoneNumberRule === opt
                          ? 'bg-teleforge-primary text-white border-teleforge-primary shadow-xs font-semibold'
                          : 'bg-white dark:bg-gray-700/60 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {opt === 'everybody' ? 'Everybody' : opt === 'contacts' ? 'My Contacts' : 'Nobody'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Last Seen & Online */}
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield size={16} className="text-[#8B1E22] dark:text-rose-400" />
                    <div>
                      <div className="font-semibold text-gray-800 dark:text-gray-200 text-xs sm:text-sm">Last Seen & Online</div>
                      <div className="text-[11px] text-gray-500">Who can see your last seen and online timestamp</div>
                    </div>
                  </div>
                  {isUpdatingPrivacy === 'lastSeen' && (
                    <Loader2 size={15} className="animate-spin text-teleforge-primary" />
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  {(['everybody', 'contacts', 'nobody'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={isUpdatingPrivacy === 'lastSeen'}
                      onClick={() => handleUpdatePrivacy('lastSeen', opt)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center border cursor-pointer ${
                        lastSeenRule === opt
                          ? 'bg-teleforge-primary text-white border-teleforge-primary shadow-xs font-semibold'
                          : 'bg-white dark:bg-gray-700/60 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {opt === 'everybody' ? 'Everybody' : opt === 'contacts' ? 'My Contacts' : 'Nobody'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Sessions Navigation Card */}
              <div
                onClick={handleOpenSessions}
                className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 group-hover:bg-teleforge-primary group-hover:text-white transition-colors">
                    <Laptop size={16} />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800 dark:text-gray-200 text-xs sm:text-sm">Active Sessions & Devices</div>
                    <div className="text-[11px] text-gray-500">
                      {sessionsList.length > 0 ? `${sessionsList.length} devices connected` : 'View and terminate devices'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200">
                  <span className="font-medium">Manage</span>
                  <ChevronRight size={16} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-4">
              {/* App Branding Hero */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#8B1E22]/20 via-gray-900/40 to-[#8B1E22]/10 border border-[#8B1E22]/30 text-center flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-[#8B1E22] text-[#FFF8EE] flex items-center justify-center shadow-lg mb-3">
                  <TeleForgeLogo size={36} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-[#FFF8EE]">
                  TeleForge
                </h3>
                <div className="text-xs font-semibold text-[#8B1E22] dark:text-rose-300 mt-0.5">
                  Version 1.0.0 (Build 2026.1)
                </div>
                <div className="text-xs italic text-gray-500 dark:text-gray-400 mt-1">
                  &quot;Your Telegram. Your way.&quot;
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-2.5 max-w-sm leading-relaxed">
                  An unofficial client built from the open-source Telegram Android project, engineered for power users with Theme Studio, Power Folders, and deep customizations.
                </p>
              </div>

              {/* Open Source Licenses & Upstream Attribution */}
              <div className="p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/80 dark:border-gray-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Open Source Attribution
                    </h4>
                    <p className="text-[11px] text-gray-400">
                      Built on open standards and permissive open-source libraries
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLicensesOpen(!isLicensesOpen)}
                    className="text-xs text-[#8B1E22] dark:text-rose-400 font-semibold hover:underline cursor-pointer"
                  >
                    {isLicensesOpen ? 'Hide' : 'View'}
                  </button>
                </div>

                {isLicensesOpen && (
                  <div className="pt-2 border-t border-gray-200/60 dark:border-gray-700/60 space-y-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-800">
                      <div className="font-bold text-gray-800 dark:text-gray-200">Telegram Android Client & MTProto</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">GNU General Public License v2.0 / v3.0 & Apache 2.0</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-800">
                      <div className="font-bold text-gray-800 dark:text-gray-200">GramJS (MTProto Protocol Client)</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">MIT License &bull; Copyright (c) Lonami Technologies</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-800">
                      <div className="font-bold text-gray-800 dark:text-gray-200">React & Lucide Icons</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">MIT & ISC Licenses</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Legal Disclaimer */}
              <div className="p-3.5 rounded-2xl bg-gray-100/70 dark:bg-gray-900/70 border border-gray-200/60 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
                <div className="font-bold text-gray-700 dark:text-gray-300">
                  Independent Client Disclaimer
                </div>
                <p>
                  TeleForge is an independent client and is not affiliated with, endorsed by, or sponsored by Telegram FZ-LLC.
                </p>
                <p>
                  Telegram is a registered trademark of Telegram FZ-LLC. All rights reserved.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#121921] flex justify-between items-center text-xs text-gray-400">
          <span>TeleForge 1.0.0 • Unofficial Telegram Client</span>
          <span>MTProto 2.0 Layer 198 Active</span>
        </div>
      </div>

      {/* =========================================================================
          RESET CONFIRMATION MODAL
         ========================================================================= */}
      {isResetConfirmOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) {
              setIsResetConfirmOpen(false);
            }
          }}
        >
          <div
            className="bg-white dark:bg-[#17212b] border border-gray-200 dark:border-gray-700/80 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-gray-800 dark:text-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3">
              <AlertTriangle size={24} />
            </div>

            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1.5">
              Reset TeleForge Settings?
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
              This will reset your local themes, power tools settings, and command center favorites back to defaults.
            </p>

            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-2 mb-4">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>Safe Guarantee:</strong> You will NOT be logged out of Telegram. Your cloud chats, messages, media, and Telegram folders are completely safe and untouched.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Reset Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SET PROFILE PHOTO MODAL
         ========================================================================= */}
      {isPhotoModalOpen && (
        <div
          className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
            if (!isUploadingPhoto && e.target === e.currentTarget) {
              setIsPhotoModalOpen(false);
            }
          }}
        >
          <div
            className="bg-white dark:bg-[#17212b] rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
                <Camera size={18} className="text-teleforge-primary" /> Set Profile Photo
              </h3>
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(false)}
                disabled={isUploadingPhoto}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            {/* Source Tabs */}
            <div className="flex border-b border-gray-100 dark:border-gray-800 px-5 pt-2 gap-4">
              <button
                type="button"
                disabled={isUploadingPhoto}
                onClick={() => {
                  setPhotoSourceTab('upload');
                  setPhotoError(null);
                }}
                className={`pb-2.5 text-sm font-medium border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  photoSourceTab === 'upload'
                    ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Upload size={15} /> Choose from Device
              </button>
              <button
                type="button"
                disabled={isUploadingPhoto}
                onClick={() => {
                  setPhotoSourceTab('url');
                  setPhotoError(null);
                }}
                className={`pb-2.5 text-sm font-medium border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  photoSourceTab === 'url'
                    ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <LinkIcon size={15} /> From Image URL
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {photoSourceTab === 'upload' ? (
                <div>
                  <input
                    type="file"
                    ref={photoFileInputRef}
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      photoFileInputRef.current?.click();
                    }}
                    disabled={isUploadingPhoto}
                    className="w-full border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-teleforge-primary dark:hover:border-teleforge-primary rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-center transition-colors bg-gray-50/50 dark:bg-gray-800/40 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-12 h-12 rounded-full bg-teleforge-primary/10 text-teleforge-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Upload size={22} />
                    </div>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {selectedFile ? selectedFile.name : 'Click to select photo from local storage'}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Supports JPG, PNG, WEBP or GIF (Max 20MB)
                    </span>
                  </button>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">
                    Direct Image URL
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={photoUrlInput}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      placeholder="https://example.com/profile-picture.jpg"
                      disabled={isUploadingPhoto}
                      className="w-full px-3 py-2 pl-9 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm focus:outline-hidden focus:border-teleforge-primary text-gray-900 dark:text-white disabled:opacity-50"
                    />
                    <LinkIcon size={15} className="absolute left-3 top-2.5 text-gray-400" />
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    TeleForge will download this photo and set it as your Telegram profile photo.
                  </p>
                </div>
              )}

              {/* Preview Circle */}
              {previewPhoto && (
                <div className="flex flex-col items-center justify-center pt-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Photo Preview</span>
                  <div className="relative w-24 h-24 rounded-full overflow-hidden shrink-0 border-2 border-teleforge-primary shadow-md">
                    <img
                      src={previewPhoto}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={() => setPhotoError('Failed to load image preview. Check the URL.')}
                    />
                    {isUploadingPhoto && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-1">
                        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin mb-1" />
                        <span className="text-[10px] font-medium tracking-wide">Uploading...</span>
                      </div>
                    )}
                  </div>
                  {selectedFile && (
                    <span className="text-[11px] text-gray-400 mt-1.5">
                      {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.name}
                    </span>
                  )}
                  {isUploadingPhoto && (
                    <span className="text-xs text-teleforge-primary font-medium mt-1 animate-pulse">
                      Uploading to Telegram MTProto...
                    </span>
                  )}
                </div>
              )}

              {/* Error Banner */}
              {photoError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-600 dark:text-red-300 flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>{photoError}</span>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPhotoModalOpen(false)}
                disabled={isUploadingPhoto}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePhoto}
                disabled={!previewPhoto || isUploadingPhoto}
                className="px-5 py-2 rounded-xl bg-teleforge-primary text-teleforge-cream font-medium text-sm hover:bg-teleforge-hover transition-colors shadow-sm shadow-red-950/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {isUploadingPhoto ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Uploading to Telegram...</span>
                  </>
                ) : (
                  'Set as Profile Photo'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          ACTIVE SESSIONS MODAL
          ========================================================================= */}
      {isActiveSessionsOpen && (
        <div
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) {
              setIsActiveSessionsOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-[#17212b] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/70 dark:bg-gray-800/40">
              <div className="flex items-center gap-2.5">
                <Laptop size={18} className="text-teleforge-primary" />
                <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">
                  Active Sessions & Devices
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsActiveSessionsOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content List */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
              {isLoadingSessions ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                  <Loader2 size={24} className="animate-spin text-teleforge-primary" />
                  <span className="text-xs">Loading active sessions from Telegram...</span>
                </div>
              ) : sessionsList.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">
                  No active sessions found.
                </div>
              ) : (
                <>
                  {/* Terminate All Other Sessions button */}
                  {sessionsList.some((s) => !s.current) && (
                    <div className="pb-1">
                      <button
                        type="button"
                        disabled={isTerminatingAll}
                        onClick={handleTerminateAllOtherSessions}
                        className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isTerminatingAll ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <LogOut size={14} />
                        )}
                        <span>Terminate All Other Sessions</span>
                      </button>
                    </div>
                  )}

                  {/* Sessions List */}
                  {sessionsList.map((session, idx) => {
                    const isMobile =
                      session.platform.toLowerCase().includes('android') ||
                      session.platform.toLowerCase().includes('ios') ||
                      session.deviceModel.toLowerCase().includes('phone');

                    return (
                      <div
                        key={session.hash || idx}
                        className={`p-3.5 rounded-xl border transition-all ${
                          session.current
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/30'
                            : 'bg-gray-50/70 dark:bg-gray-800/40 border-gray-200/80 dark:border-gray-700/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-3">
                            <div
                              className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                                session.current
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                              }`}
                            >
                              {isMobile ? <Smartphone size={18} /> : <Laptop size={18} />}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-white">
                                  {session.deviceModel}
                                </span>
                                {session.current && (
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                    Current Session
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                {session.appName} {session.appVersion} &bull; {session.platform} {session.systemVersion}
                              </div>

                              <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                                <span>{session.ip}</span>
                                {session.country && <span>&bull; {session.country}</span>}
                                {session.dateActive > 0 && (
                                  <span>
                                    &bull; Active {new Date(session.dateActive * 1000).toLocaleDateString()}{' '}
                                    {new Date(session.dateActive * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Terminate Action for non-current sessions */}
                          {!session.current && (
                            <button
                              type="button"
                              disabled={terminatingHash === session.hash}
                              onClick={() => handleTerminateSession(session.hash)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0 cursor-pointer"
                              title="Terminate Session"
                            >
                              {terminatingHash === session.hash ? (
                                <Loader2 size={16} className="animate-spin text-red-500" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 flex justify-end">
              <button
                type="button"
                onClick={() => setIsActiveSessionsOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-xs font-semibold text-gray-800 dark:text-gray-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
