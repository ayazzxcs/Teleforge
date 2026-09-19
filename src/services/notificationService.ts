// Notification and Audio Chime Service for TeleForge
// Handles Web Audio API marimba tone synthesis, browser Notification API,
// Android TeleForgeBridge native status bar notifications, and settings persistence.

export interface NotificationSettings {
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  privateChats: boolean;
  groups: boolean;
  channels: boolean;
}

export interface InAppToast {
  id: string;
  chatId: string;
  title: string;
  body: string;
  avatarUrl?: string;
  timestamp: number;
}

const SETTINGS_KEY = 'teleforge_notification_settings';

const DEFAULT_SETTINGS: NotificationSettings = {
  notificationsEnabled: true,
  soundEnabled: true,
  privateChats: true,
  groups: true,
  channels: true,
};

class NotificationService {
  private settings: NotificationSettings;
  private audioCtx: AudioContext | null = null;
  private toastListeners = new Set<(toast: InAppToast) => void>();
  private settingsListeners = new Set<(settings: NotificationSettings) => void>();

  constructor() {
    this.settings = this.loadSettings();

    // Unlock Web Audio API on first user interaction if suspended
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      };
      window.addEventListener('click', unlockAudio, { once: false, passive: true });
      window.addEventListener('keydown', unlockAudio, { once: false, passive: true });
      window.addEventListener('touchstart', unlockAudio, { once: false, passive: true });
    }
  }

  private loadSettings(): NotificationSettings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {}
    return { ...DEFAULT_SETTINGS };
  }

  public getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<NotificationSettings>): void {
    this.settings = { ...this.settings, ...partial };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {}
    this.settingsListeners.forEach((fn) => {
      try {
        fn(this.settings);
      } catch (err) {}
    });
  }

  public onSettingsChange(listener: (settings: NotificationSettings) => void): () => void {
    this.settingsListeners.add(listener);
    return () => this.settingsListeners.delete(listener);
  }

  public onInAppToast(listener: (toast: InAppToast) => void): () => void {
    this.toastListeners.add(listener);
    return () => this.toastListeners.delete(listener);
  }

  /**
   * Request browser Notification permission
   */
  public async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    try {
      return await Notification.requestPermission();
    } catch (e) {
      return 'denied';
    }
  }

  public getPermissionStatus(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Synthesize Telegram-style dual-tone marimba chime via Web Audio API.
   * D5 (587.33 Hz) -> A5 (880.00 Hz) with warm decay.
   * Zero external MP3/WAV assets, 0ms latency, works offline.
   */
  public playNotificationSound(): void {
    if (!this.settings.soundEnabled) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      const now = this.audioCtx.currentTime;

      // Master output gain
      const masterGain = this.audioCtx.createGain();
      masterGain.gain.setValueAtTime(0.25, now);
      masterGain.connect(this.audioCtx.destination);

      // Note 1: D5 (587.33 Hz)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);

      gain1.gain.setValueAtTime(0.8, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain1);
      gain1.connect(masterGain);

      osc1.start(now);
      osc1.stop(now + 0.3);

      // Note 2: A5 (880.00 Hz) - starts slightly after Note 1 (Telegram marimba delay ~70ms)
      const note2Start = now + 0.07;
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.0, note2Start);

      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.setValueAtTime(0.9, note2Start);
      gain2.gain.exponentialRampToValueAtTime(0.001, note2Start + 0.38);

      osc2.connect(gain2);
      gain2.connect(masterGain);

      osc2.start(note2Start);
      osc2.stop(note2Start + 0.4);
    } catch (e) {
      console.warn('[NotificationService] Audio playback error:', e);
    }
  }

  /**
   * Display system notification (Android native via TeleForgeBridge, or Browser Notification API)
   */
  public showSystemNotification(params: {
    title: string;
    body: string;
    chatId: string;
    icon?: string;
  }): void {
    if (!this.settings.notificationsEnabled) return;

    // 1. Android Native App Bridge
    if (typeof window !== 'undefined' && (window as any).TeleForgeBridge?.showNotification) {
      try {
        (window as any).TeleForgeBridge.showNotification(
          params.title,
          params.body,
          params.chatId
        );
        return;
      } catch (e) {
        console.warn('[NotificationService] Android bridge notification error:', e);
      }
    }

    // 2. Desktop / Web Browser Notification API
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          const notif = new Notification(params.title, {
            body: params.body,
            icon: params.icon || '/favicon.ico',
            tag: `chat-${params.chatId}`,
            silent: true, // Audio chime already handled by Web Audio
          });

          notif.onclick = () => {
            window.focus();
            window.dispatchEvent(
              new CustomEvent('teleforge:openChat', { detail: { chatId: params.chatId } })
            );
            try {
              notif.close();
            } catch (e) {}
          };
        } catch (e) {
          console.warn('[NotificationService] Browser notification display error:', e);
        }
      }
    }
  }

  /**
   * Process incoming Telegram message and trigger appropriate alerts
   */
  public notifyIncomingMessage(params: {
    chatId: string;
    chatTitle: string;
    chatType?: 'private' | 'group' | 'channel';
    chatAvatar?: string;
    messageText: string;
    isOutgoing: boolean;
    isMuted?: boolean;
    isChatActive: boolean;
  }): void {
    const {
      chatId,
      chatTitle,
      chatType = 'private',
      chatAvatar,
      messageText,
      isOutgoing,
      isMuted = false,
      isChatActive,
    } = params;

    // Ignore outgoing messages sent by the user
    if (isOutgoing) return;

    // Ignore muted chats
    if (isMuted) return;

    // Check user preference by chat type
    if (!this.settings.notificationsEnabled) return;
    if (chatType === 'private' && !this.settings.privateChats) return;
    if (chatType === 'group' && !this.settings.groups) return;
    if (chatType === 'channel' && !this.settings.channels) return;

    const isDocumentHidden = typeof document !== 'undefined' && document.hidden;
    const isBackgroundOrOtherChat = isDocumentHidden || !isChatActive;

    // 1. Audio chime
    if (this.settings.soundEnabled) {
      this.playNotificationSound();
    }

    const cleanBody = messageText || 'Sent a media message';

    // 2. System Notification (Desktop banner or Android status bar)
    if (isBackgroundOrOtherChat) {
      this.showSystemNotification({
        title: chatTitle,
        body: cleanBody,
        chatId,
        icon: chatAvatar,
      });
    }

    // 3. In-App Toast Banner (if app is visible but user is currently looking at another chat)
    if (!isDocumentHidden && !isChatActive) {
      const toast: InAppToast = {
        id: `toast-${chatId}-${Date.now()}`,
        chatId,
        title: chatTitle,
        body: cleanBody,
        avatarUrl: chatAvatar,
        timestamp: Date.now(),
      };
      this.toastListeners.forEach((listener) => {
        try {
          listener(toast);
        } catch (e) {}
      });
    }
  }

  /**
   * Update browser document title with unread badge counter
   */
  public updateDocumentTitle(totalUnreadCount: number): void {
    if (typeof document === 'undefined') return;
    if (totalUnreadCount > 0) {
      document.title = `(${totalUnreadCount}) TeleForge`;
    } else {
      document.title = 'TeleForge';
    }
  }
}

export const notificationService = new NotificationService();
