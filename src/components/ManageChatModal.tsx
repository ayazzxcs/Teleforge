import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Crown,
  Edit3,
  Trash2,
  Check,
  AlertTriangle,
  Users,
  Link2,
  Copy,
  CheckCheck,
  Loader2,
  UserPlus,
  UserX,
  Clock,
  Settings,
  FileText,
  Search,
  History,
  Eye,
  EyeOff,
  ExternalLink,
  Plus,
  ArrowRight,
  KeyRound,
  Radio,
  Camera,
  Upload,
  Image,
} from 'lucide-react';
import {
  Chat,
  TelegramAdminFullInfo,
  TelegramAdminParticipant,
  TelegramMemberParticipant,
  TelegramBannedParticipant,
  TelegramInviteLinkItem,
  TelegramAdminLogItem,
} from '../types';
import { telegramApi } from '../services/telegramApi';
import { Avatar } from './Avatar';

interface ManageChatModalProps {
  isOpen: boolean;
  chat: Chat | null;
  onClose: () => void;
  onUpdateChatInfo: (chatId: string, details: { title?: string; about?: string }) => Promise<void>;
  onDeleteChat: (chatId: string) => Promise<void>;
}

type ManageTab = 'general' | 'permissions' | 'admins' | 'members' | 'banned' | 'invites' | 'log' | 'danger';

export const ManageChatModal: React.FC<ManageChatModalProps> = ({
  isOpen,
  chat,
  onClose,
  onUpdateChatInfo,
  onDeleteChat,
}) => {
  const [activeTab, setActiveTab] = useState<ManageTab>('general');
  const [fullInfo, setFullInfo] = useState<TelegramAdminFullInfo | null>(null);
  const [isLoadingFull, setIsLoadingFull] = useState(false);

  // General Tab State
  const [title, setTitle] = useState('');
  const [about, setAbout] = useState('');
  const [username, setUsername] = useState('');
  const [hiddenPrehistory, setHiddenPrehistory] = useState(false);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  // Live Username Check State
  const [usernameInput, setUsernameInput] = useState('');
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<{
    checked: boolean;
    available?: boolean;
    error?: string;
    isCurrent?: boolean;
  }>({ checked: false });

  // Chat Photo Management State
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoMethod, setPhotoMethod] = useState<'upload' | 'url'>('upload');
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFileBase64, setPhotoFileBase64] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [currentChatAvatar, setCurrentChatAvatar] = useState<string | undefined>(chat?.avatar);

  // Permissions Tab State
  const [permissions, setPermissions] = useState({
    sendMessages: true,
    sendMedia: true,
    sendStickers: true,
    embedLinks: true,
    sendPolls: true,
    inviteUsers: true,
    pinMessages: true,
    changeInfo: false,
  });
  const [slowmodeSeconds, setSlowmodeSeconds] = useState<number>(0);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  // Admins Tab State
  const [admins, setAdmins] = useState<TelegramAdminParticipant[]>([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(false);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [adminTargetUserId, setAdminTargetUserId] = useState('');
  const [adminCustomRank, setAdminCustomRank] = useState('');
  const [adminRightsInput, setAdminRightsInput] = useState({
    changeInfo: true,
    postMessages: true,
    editMessages: true,
    deleteMessages: true,
    banUsers: true,
    inviteUsers: true,
    pinMessages: true,
    addAdmins: false,
    anonymous: false,
    manageTopics: true,
  });
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);

  // Transfer Ownership State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const [transferPassword, setTransferPassword] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Members Tab State
  const [members, setMembers] = useState<TelegramMemberParticipant[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [showInviteMemberModal, setShowInviteMemberModal] = useState(false);
  const [inviteUserInput, setInviteUserInput] = useState('');
  const [isInvitingMember, setIsInvitingMember] = useState(false);

  // Restrict Member State
  const [restrictingMember, setRestrictingMember] = useState<TelegramMemberParticipant | null>(null);
  const [restrictDuration, setRestrictDuration] = useState<number>(0); // 0 = forever, 86400 = 1 day, 604800 = 7 days
  const [restrictRights, setRestrictRights] = useState({
    viewMessages: false,
    sendMessages: true,
    sendMedia: true,
    sendStickers: true,
    embedLinks: true,
    sendPolls: true,
    inviteUsers: true,
    pinMessages: true,
  });
  const [isSavingRestrict, setIsSavingRestrict] = useState(false);

  // Banned / Restricted Tab State
  const [bannedList, setBannedList] = useState<TelegramBannedParticipant[]>([]);
  const [isLoadingBanned, setIsLoadingBanned] = useState(false);

  // Invite Links Tab State
  const [inviteLinks, setInviteLinks] = useState<TelegramInviteLinkItem[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [showCreateLinkModal, setShowCreateLinkModal] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUsageLimit, setNewLinkUsageLimit] = useState<string>('');
  const [newLinkRequestNeeded, setNewLinkRequestNeeded] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);

  // Admin Log Tab State
  const [adminLogs, setAdminLogs] = useState<TelegramAdminLogItem[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Global Alerts & Danger Zone
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isOwner = Boolean(chat?.isOwner || chat?.isCreator || fullInfo?.isOwner);
  const isAdmin = Boolean(chat?.isAdmin || isOwner || fullInfo?.isAdmin);

  // Load chat full admin info on open
  useEffect(() => {
    if (chat && isOpen) {
      setTitle(chat.name || '');
      setAbout(chat.description || chat.bio || '');
      const rawUser = chat.username ? chat.username.replace(/^@/, '') : '';
      setUsername(rawUser ? `@${rawUser}` : '');
      setUsernameInput(rawUser);
      setUsernameStatus({ checked: Boolean(rawUser), isCurrent: true, available: true });
      setCurrentChatAvatar(chat.avatar);
      setPhotoPreview(null);
      setPhotoFileBase64(null);
      setPhotoUrlInput('');
      setShowPhotoModal(false);
      setActiveTab('general');
      setShowDeleteConfirm(false);
      setErrorMessage(null);
      setSaveSuccessMessage(null);
      loadFullAdminInfo();
    }
  }, [chat?.id, isOpen]);

  const loadFullAdminInfo = async () => {
    if (!chat) return;
    setIsLoadingFull(true);
    try {
      const data = await telegramApi.getChatAdminFull(chat.id);
      setFullInfo(data);
      if (data.title) setTitle(data.title);
      if (data.about !== undefined) setAbout(data.about);
      if (data.username) {
        const rawU = data.username.replace(/^@/, '');
        setUsername(`@${rawU}`);
        setUsernameInput(rawU);
        setUsernameStatus({ checked: true, isCurrent: true, available: true });
      }
      setHiddenPrehistory(data.hiddenPrehistory);
      if (data.permissions) setPermissions(data.permissions);
      setSlowmodeSeconds(data.slowmodeSeconds || 0);
    } catch (err: any) {
      console.warn('Failed to load full admin info:', err.message);
    } finally {
      setIsLoadingFull(false);
    }
  };

  // Live Debounced Username Availability Check
  useEffect(() => {
    if (!isOpen) return;
    const raw = usernameInput.trim().replace(/^@/, '');
    const current = (chat?.username || fullInfo?.username || '').replace(/^@/, '').trim();

    if (!raw) {
      setUsernameStatus({ checked: false });
      setIsCheckingUsername(false);
      return;
    }

    if (raw.toLowerCase() === current.toLowerCase()) {
      setUsernameStatus({ checked: true, isCurrent: true, available: true });
      setIsCheckingUsername(false);
      return;
    }

    if (raw.length < 5) {
      setUsernameStatus({ checked: true, available: false, error: 'Must be at least 5 characters' });
      setIsCheckingUsername(false);
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(raw)) {
      setUsernameStatus({ checked: true, available: false, error: 'Only letters, numbers, and underscores allowed' });
      setIsCheckingUsername(false);
      return;
    }

    setIsCheckingUsername(true);
    const timer = setTimeout(async () => {
      try {
        const res = await telegramApi.checkChatUsernameAvailability(chat!.id, raw);
        setUsernameStatus({
          checked: true,
          available: res.available,
          error: res.error,
        });
      } catch (err: any) {
        setUsernameStatus({
          checked: true,
          available: false,
          error: err.message || 'Check failed',
        });
      } finally {
        setIsCheckingUsername(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [usernameInput, chat?.id, chat?.username, fullInfo?.username, isOpen]);

  // Photo Upload & Removal Handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WebP)');
      return;
    }
    setPhotoFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setPhotoFileBase64(b64);
      setPhotoPreview(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleSavePhoto = async () => {
    if (!chat) return;
    setIsUploadingPhoto(true);
    setErrorMessage(null);
    try {
      if (photoMethod === 'upload') {
        if (!photoFileBase64) throw new Error('Please select an image file first');
        await telegramApi.uploadChatPhoto(chat.id, {
          fileBase64: photoFileBase64,
          filename: photoFileName || 'avatar.jpg',
        });
        setCurrentChatAvatar(photoPreview || undefined);
      } else {
        if (!photoUrlInput.trim()) throw new Error('Please enter a valid image URL');
        await telegramApi.uploadChatPhoto(chat.id, {
          url: photoUrlInput.trim(),
        });
        setCurrentChatAvatar(photoUrlInput.trim());
      }
      setShowPhotoModal(false);
      triggerToast('Chat photo updated successfully!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update chat photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!chat) return;
    if (!confirm('Are you sure you want to remove the chat photo?')) return;
    setIsUploadingPhoto(true);
    setErrorMessage(null);
    try {
      await telegramApi.removeChatPhoto(chat.id);
      setCurrentChatAvatar(undefined);
      setPhotoPreview(null);
      setShowPhotoModal(false);
      triggerToast('Chat photo removed.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove chat photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Switch tabs & trigger data fetch
  const handleTabChange = (tab: ManageTab) => {
    setActiveTab(tab);
    setErrorMessage(null);
    setSaveSuccessMessage(null);
    if (!chat) return;

    if (tab === 'admins') loadAdmins();
    else if (tab === 'members') loadMembers();
    else if (tab === 'banned') loadBanned();
    else if (tab === 'invites') loadInviteLinks();
    else if (tab === 'log') loadAdminLogs();
  };

  const loadAdmins = async () => {
    if (!chat) return;
    setIsLoadingAdmins(true);
    try {
      const list = await telegramApi.getChatAdministrators(chat.id);
      setAdmins(list);
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to fetch administrators');
    } finally {
      setIsLoadingAdmins(false);
    }
  };

  const loadMembers = async (q = memberSearchQuery) => {
    if (!chat) return;
    setIsLoadingMembers(true);
    try {
      const res = await telegramApi.getChatMembers(chat.id, q);
      setMembers(res.members || []);
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to fetch members');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const loadBanned = async () => {
    if (!chat) return;
    setIsLoadingBanned(true);
    try {
      const list = await telegramApi.getBannedMembers(chat.id);
      setBannedList(list);
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to fetch banned members');
    } finally {
      setIsLoadingBanned(false);
    }
  };

  const loadInviteLinks = async () => {
    if (!chat) return;
    setIsLoadingLinks(true);
    try {
      const links = await telegramApi.getChatInviteLinks(chat.id);
      setInviteLinks(links);
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to fetch invite links');
    } finally {
      setIsLoadingLinks(false);
    }
  };

  const loadAdminLogs = async () => {
    if (!chat) return;
    setIsLoadingLogs(true);
    try {
      const logs = await telegramApi.getChatAdminLog(chat.id);
      setAdminLogs(logs);
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to fetch admin log');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const triggerToast = (msg: string) => {
    setSaveSuccessMessage(msg);
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  // Save General Settings
  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chat) return;
    if (!title.trim()) {
      setErrorMessage('Chat title cannot be empty.');
      return;
    }

    const cleanUser = usernameInput.trim().replace(/^@/, '');
    if (usernameStatus.checked && !usernameStatus.available && !usernameStatus.isCurrent) {
      setErrorMessage(usernameStatus.error || 'Please choose a valid and available username.');
      return;
    }

    setIsSavingGeneral(true);
    setErrorMessage(null);
    try {
      await telegramApi.updateChatGeneralSettings(chat.id, {
        title: title.trim(),
        about: about.trim(),
        username: cleanUser,
        hiddenPrehistory,
      });
      await onUpdateChatInfo(chat.id, { title: title.trim(), about: about.trim() });
      setUsername(cleanUser ? `@${cleanUser}` : '');
      setUsernameInput(cleanUser);
      setUsernameStatus({ checked: Boolean(cleanUser), isCurrent: true, available: true });
      triggerToast('Chat general settings saved successfully!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save chat settings');
    } finally {
      setIsSavingGeneral(false);
    }
  };

  // Save Permissions & Slowmode
  const handleSavePermissions = async () => {
    if (!chat) return;
    setIsSavingPermissions(true);
    setErrorMessage(null);
    try {
      await telegramApi.updateChatPermissions(chat.id, {
        permissions,
        slowmodeSeconds,
      });
      triggerToast('Member permissions & slow mode updated!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update member permissions');
    } finally {
      setIsSavingPermissions(false);
    }
  };

  // Save Administrator (Promote or Edit)
  const handleSaveAdministrator = async () => {
    if (!chat || !adminTargetUserId.trim()) return;
    setIsSavingAdmin(true);
    setErrorMessage(null);
    try {
      await telegramApi.editChatAdministrator(chat.id, {
        userId: adminTargetUserId.trim(),
        adminRights: adminRightsInput,
        rank: adminCustomRank.trim(),
      });
      setShowAddAdminModal(false);
      setAdminTargetUserId('');
      setAdminCustomRank('');
      triggerToast('Administrator rights saved successfully!');
      loadAdmins();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update administrator');
    } finally {
      setIsSavingAdmin(false);
    }
  };

  // Demote Administrator
  const handleDismissAdmin = async (userId: string) => {
    if (!chat) return;
    if (!confirm('Are you sure you want to dismiss this administrator?')) return;
    try {
      await telegramApi.editChatAdministrator(chat.id, {
        userId,
        adminRights: null, // null demotes
      });
      triggerToast('Administrator demoted to regular member.');
      loadAdmins();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to dismiss administrator');
    }
  };

  // Transfer Ownership
  const handleTransferOwnership = async () => {
    if (!chat || !transferTargetUserId) return;
    if (!confirm('Are you sure you want to transfer group ownership? You will no longer be the owner!')) return;
    setIsTransferring(true);
    setErrorMessage(null);
    try {
      await telegramApi.transferChatOwnership(chat.id, {
        userId: transferTargetUserId,
        password: transferPassword.trim() || undefined,
      });
      setShowTransferModal(false);
      triggerToast('Ownership transferred successfully!');
      loadFullAdminInfo();
      loadAdmins();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to transfer ownership');
    } finally {
      setIsTransferring(false);
    }
  };

  // Kick Member
  const handleKickMember = async (userId: string, name: string) => {
    if (!chat) return;
    if (!confirm(`Are you sure you want to remove "${name}" from the group?`)) return;
    try {
      await telegramApi.kickChatMember(chat.id, userId);
      triggerToast(`${name} removed from the group.`);
      loadMembers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to kick member');
    }
  };

  // Restrict Member
  const handleSaveRestrict = async () => {
    if (!chat || !restrictingMember) return;
    setIsSavingRestrict(true);
    setErrorMessage(null);
    try {
      const untilDate = restrictDuration > 0 ? Math.floor(Date.now() / 1000) + restrictDuration : 0;
      await telegramApi.restrictChatMember(chat.id, {
        userId: restrictingMember.userId,
        bannedRights: restrictRights,
        untilDate,
      });
      setRestrictingMember(null);
      triggerToast(`Restrictions applied to ${restrictingMember.firstName}`);
      loadMembers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to restrict member');
    } finally {
      setIsSavingRestrict(false);
    }
  };

  // Unban Member
  const handleUnbanMember = async (userId: string, name: string) => {
    if (!chat) return;
    try {
      await telegramApi.unbanChatMember(chat.id, userId);
      triggerToast(`Restrictions removed for ${name || 'User'}`);
      loadBanned();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to unban member');
    }
  };

  // Invite Member
  const handleInviteMember = async () => {
    if (!chat || !inviteUserInput.trim()) return;
    setIsInvitingMember(true);
    setErrorMessage(null);
    try {
      await telegramApi.inviteMemberToChat(chat.id, inviteUserInput.trim());
      setShowInviteMemberModal(false);
      setInviteUserInput('');
      triggerToast('User added to chat successfully!');
      loadMembers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to invite user');
    } finally {
      setIsInvitingMember(false);
    }
  };

  // Create Invite Link
  const handleCreateInviteLink = async () => {
    if (!chat) return;
    setIsCreatingLink(true);
    setErrorMessage(null);
    try {
      await telegramApi.createChatInviteLink(chat.id, {
        title: newLinkTitle.trim() || undefined,
        usageLimit: newLinkUsageLimit ? parseInt(newLinkUsageLimit, 10) : undefined,
        requestNeeded: newLinkRequestNeeded,
      });
      setShowCreateLinkModal(false);
      setNewLinkTitle('');
      setNewLinkUsageLimit('');
      setNewLinkRequestNeeded(false);
      triggerToast('Invite link generated successfully!');
      loadInviteLinks();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create invite link');
    } finally {
      setIsCreatingLink(false);
    }
  };

  // Revoke Invite Link
  const handleRevokeInviteLink = async (link: string) => {
    if (!chat) return;
    if (!confirm('Are you sure you want to revoke this invite link? Users with this link will no longer be able to join.')) return;
    try {
      await telegramApi.revokeChatInviteLink(chat.id, link);
      triggerToast('Invite link revoked.');
      loadInviteLinks();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to revoke link');
    }
  };

  // Confirm Delete Chat Permanently
  const handleConfirmDelete = async () => {
    if (!chat) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await onDeleteChat(chat.id);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete chat');
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text: string, type: 'id' | 'link') => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedLink(text);
      setTimeout(() => setCopiedLink(null), 2000);
    }
  };

  if (!isOpen || !chat) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-teleforge-surface rounded-2xl w-full max-w-4xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col h-[88vh] max-h-[850px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-teleforge-darkCanvas/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar
                src={chat.avatar}
                previewSrc={chat.thumbUrl}
                peerId={chat.id}
                name={chat.name}
                size="md"
                className="w-10 h-10 rounded-full"
              />
              <span className="absolute -bottom-1 -right-1 text-xs">
                {isOwner ? '👑' : '🛡️'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900 dark:text-teleforge-cream line-clamp-1">
                  {chat.name}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isOwner
                      ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                      : 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-400 border border-purple-300 dark:border-purple-800'
                  }`}
                >
                  {isOwner ? '👑 Owner' : '🛡️ Admin'}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {chat.type === 'channel' ? 'Channel Management' : 'Group Management'} • {chat.memberCount || fullInfo?.participantsCount || 0} members
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Global Toast / Error Banners */}
        {errorMessage && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-300 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
            <button type="button" onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-600">
              <X size={14} />
            </button>
          </div>
        )}

        {saveSuccessMessage && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-600 dark:text-emerald-300 flex items-center gap-2 shrink-0">
            <Check size={16} className="shrink-0 text-emerald-500" />
            <span>{saveSuccessMessage}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-none gap-1 py-1.5 shrink-0 bg-white dark:bg-teleforge-surface">
          <button
            type="button"
            onClick={() => handleTabChange('general')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'general'
                ? 'bg-teleforge-primary text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Settings size={14} />
            <span>General</span>
          </button>

          {chat.type !== 'channel' && (
            <button
              type="button"
              onClick={() => handleTabChange('permissions')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'permissions'
                  ? 'bg-teleforge-primary text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <KeyRound size={14} />
              <span>Permissions</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleTabChange('admins')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'admins'
                ? 'bg-teleforge-primary text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Shield size={14} />
            <span>Administrators</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('members')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'members'
                ? 'bg-teleforge-primary text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Users size={14} />
            <span>{chat.type === 'channel' ? 'Subscribers' : 'Members'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('banned')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'banned'
                ? 'bg-teleforge-primary text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <UserX size={14} />
            <span>Removed Users</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('invites')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'invites'
                ? 'bg-teleforge-primary text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Link2 size={14} />
            <span>Invite Links</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('log')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'log'
                ? 'bg-teleforge-primary text-white shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <History size={14} />
            <span>Recent Actions</span>
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={() => handleTabChange('danger')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'danger'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
              }`}
            >
              <AlertTriangle size={14} />
              <span>Danger Zone</span>
            </button>
          )}
        </div>

        {/* Scrollable Tab Content Container */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ================= TAB 1: GENERAL ================= */}
          {activeTab === 'general' && (
            <div className="max-w-2xl space-y-6">
              {/* Chat Profile / Avatar Banner */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative group shrink-0">
                    <Avatar
                      src={photoPreview || currentChatAvatar || chat.avatar}
                      previewSrc={chat.thumbUrl}
                      peerId={chat.id}
                      name={chat.name}
                      size="lg"
                      className="w-16 h-16 rounded-2xl ring-2 ring-teleforge-primary/30 shadow-md"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoPreview(null);
                        setPhotoFileBase64(null);
                        setPhotoUrlInput('');
                        setShowPhotoModal(true);
                      }}
                      className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-semibold cursor-pointer"
                    >
                      <Camera size={18} />
                      <span>Change</span>
                    </button>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                      {title || chat.name}
                    </h3>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {usernameInput ? `@${usernameInput.replace(/^@/, '')}` : (chat.type === 'channel' ? 'Private Channel' : 'Private Group')}
                    </p>
                    <span className="inline-block mt-1 text-[11px] text-teleforge-primary dark:text-rose-400 font-medium">
                      Upload from local storage or paste an image URL
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPhotoPreview(null);
                    setPhotoFileBase64(null);
                    setPhotoUrlInput('');
                    setShowPhotoModal(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-750 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                >
                  <Camera size={15} />
                  <span>Change Photo</span>
                </button>
              </div>

              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 text-center">
                  <div className="text-[11px] text-gray-500 font-medium">Total Members</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                    {fullInfo?.participantsCount || chat.memberCount || 0}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 text-center">
                  <div className="text-[11px] text-gray-500 font-medium">Admins</div>
                  <div className="text-lg font-bold text-purple-600 dark:text-purple-400 mt-0.5">
                    {fullInfo?.adminsCount || (chat.isAdmin ? 1 : 0)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 text-center">
                  <div className="text-[11px] text-gray-500 font-medium">Banned</div>
                  <div className="text-lg font-bold text-red-600 dark:text-red-400 mt-0.5">
                    {fullInfo?.bannedCount || 0}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 text-center">
                  <div className="text-[11px] text-gray-500 font-medium">Slow Mode</div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {slowmodeSeconds > 0 ? `${slowmodeSeconds}s` : 'Off'}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveGeneral} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    {chat.type === 'channel' ? 'Channel Name' : 'Group Name'}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={128}
                    placeholder="Enter chat title..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-teleforge-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Description / About
                  </label>
                  <textarea
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    maxLength={255}
                    rows={3}
                    placeholder="Provide a description of your community or channel..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-teleforge-primary resize-none"
                  />
                  <div className="text-[11px] text-gray-400 text-right mt-1">
                    {about.length} / 255
                  </div>
                </div>

                {fullInfo && fullInfo.canSetUsername === false ? (
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-gray-800 space-y-1">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Public Link (@username)
                    </label>
                    <div className="flex items-center gap-1 text-sm font-mono text-gray-800 dark:text-gray-200">
                      <span className="text-gray-400 select-none">@</span>
                      <span>{chat.username ? chat.username.replace(/^@/, '') : 'No public link assigned'}</span>
                    </div>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1 font-medium">
                      <AlertTriangle size={12} />
                      <span>Only the chat owner can change or assign a public link.</span>
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Public Link (@username)
                      </label>
                      {isCheckingUsername ? (
                        <span className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Loader2 size={12} className="animate-spin" />
                          <span>Checking availability...</span>
                        </span>
                      ) : usernameStatus.checked ? (
                        usernameStatus.isCurrent ? (
                          <span className="text-[11px] text-teleforge-primary font-semibold flex items-center gap-1">
                            <Check size={12} />
                            <span>Current username</span>
                          </span>
                        ) : usernameStatus.available ? (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <Check size={12} />
                            <span>@{usernameInput.replace(/^@/, '')} is available!</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                            <AlertTriangle size={12} />
                            <span>{usernameStatus.error || 'Username not available'}</span>
                          </span>
                        )
                      ) : null}
                    </div>

                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-sm font-semibold text-gray-400 select-none">@</span>
                      <input
                        type="text"
                        value={usernameInput.replace(/^@/, '')}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                          setUsernameInput(val);
                          setUsername(val ? `@${val}` : '');
                        }}
                        placeholder="yourpubliclink"
                        maxLength={32}
                        className={`w-full pl-8 pr-10 py-2.5 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-hidden focus:ring-2 ${
                          usernameStatus.checked && !usernameStatus.isCurrent
                            ? usernameStatus.available
                              ? 'border-emerald-500 focus:ring-emerald-500'
                              : 'border-red-500 focus:ring-red-500'
                            : 'border-gray-200 dark:border-gray-700 focus:ring-teleforge-primary'
                        }`}
                      />
                      <div className="absolute right-3 top-2.5">
                        {isCheckingUsername && <Loader2 size={16} className="animate-spin text-gray-400" />}
                        {!isCheckingUsername && usernameStatus.checked && (
                          usernameStatus.available ? (
                            <Check size={16} className="text-emerald-500" />
                          ) : (
                            <X size={16} className="text-red-500" />
                          )
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Anyone can find and join your chat at <strong>t.me/{usernameInput.replace(/^@/, '') || 'link'}</strong>. Minimum 5 characters (letters, numbers, and underscores).
                    </p>
                  </div>
                )}

                {chat.type !== 'channel' && (
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                        {hiddenPrehistory ? <EyeOff size={15} /> : <Eye size={15} />}
                        <span>Chat History for New Members</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {hiddenPrehistory
                          ? 'Hidden: New members only see messages sent after they join.'
                          : 'Visible: New members can view the entire message history.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHiddenPrehistory(!hiddenPrehistory)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        hiddenPrehistory
                          ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 border border-amber-300'
                          : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-300'
                      }`}
                    >
                      {hiddenPrehistory ? 'Hidden' : 'Visible'}
                    </button>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSavingGeneral}
                    className="px-5 py-2.5 rounded-xl bg-teleforge-primary hover:bg-teleforge-primaryHover text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingGeneral ? <Loader2 size={15} className="animate-spin" /> : <Edit3 size={15} />}
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>

              {/* Technical Details Card */}
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas/60 border border-gray-100 dark:border-gray-800 space-y-2">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Technical Identifiers
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Telegram Peer ID:</span>
                  <div className="flex items-center gap-1.5">
                    <code className="px-2 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 font-mono text-[11px]">
                      {chat.id}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(chat.id, 'id')}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      {copiedId ? <CheckCheck size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
                {fullInfo?.exportedInvite && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Primary Invite Link:</span>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={fullInfo.exportedInvite}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teleforge-primary dark:text-rose-400 hover:underline max-w-[200px] truncate"
                      >
                        {fullInfo.exportedInvite}
                      </a>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(fullInfo.exportedInvite, 'link')}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        {copiedLink === fullInfo.exportedInvite ? <CheckCheck size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 2: PERMISSIONS & SLOWMODE ================= */}
          {activeTab === 'permissions' && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Default Member Permissions
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure what regular chat participants are permitted to do in this group.
                </p>
              </div>

              {/* Permission Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: 'sendMessages', label: 'Send Messages', icon: '💬' },
                  { key: 'sendMedia', label: 'Send Media (Photos, Videos)', icon: '🖼️' },
                  { key: 'sendStickers', label: 'Send Stickers & GIFs', icon: '🎭' },
                  { key: 'embedLinks', label: 'Embed Links', icon: '🔗' },
                  { key: 'sendPolls', label: 'Send Polls', icon: '📊' },
                  { key: 'inviteUsers', label: 'Add Other Members', icon: '👥' },
                  { key: 'pinMessages', label: 'Pin Messages', icon: '📌' },
                  { key: 'changeInfo', label: 'Change Chat Info', icon: '✏️' },
                ].map((item) => {
                  const isAllowed = (permissions as any)[item.key] !== false;
                  return (
                    <div
                      key={item.key}
                      onClick={() =>
                        setPermissions({
                          ...permissions,
                          [item.key]: !isAllowed,
                        })
                      }
                      className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isAllowed
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
                          : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 opacity-75'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{item.icon}</span>
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {item.label}
                        </span>
                      </div>
                      <div
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                          isAllowed ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            isAllowed ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Slow Mode Selector */}
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-teleforge-primary" />
                    <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                      Slow Mode Delay
                    </span>
                  </div>
                  <span className="text-xs font-bold text-teleforge-primary">
                    {slowmodeSeconds === 0 ? 'Off (No Delay)' : `${slowmodeSeconds >= 60 ? slowmodeSeconds / 60 + ' min' : slowmodeSeconds + ' sec'}`}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Members will be limited to sending one message per the specified time interval.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    { label: 'Off', sec: 0 },
                    { label: '10s', sec: 10 },
                    { label: '30s', sec: 30 },
                    { label: '1 min', sec: 60 },
                    { label: '5 min', sec: 300 },
                    { label: '15 min', sec: 900 },
                    { label: '1 hr', sec: 3600 },
                  ].map((option) => (
                    <button
                      key={option.sec}
                      type="button"
                      onClick={() => setSlowmodeSeconds(option.sec)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        slowmodeSeconds === option.sec
                          ? 'bg-teleforge-primary text-white shadow-xs'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={isSavingPermissions}
                  className="px-5 py-2.5 rounded-xl bg-teleforge-primary hover:bg-teleforge-primaryHover text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingPermissions ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  <span>Apply Member Permissions</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= TAB 3: ADMINISTRATORS ================= */}
          {activeTab === 'admins' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Group Administrators
                  </h3>
                  <p className="text-xs text-gray-500">
                    You can promote active community members and assign customized administrative privileges.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddAdminModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-teleforge-primary hover:bg-teleforge-primaryHover text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus size={14} />
                  <span>Add Administrator</span>
                </button>
              </div>

              {isLoadingAdmins ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                  <Loader2 size={24} className="animate-spin mb-2" />
                  <span className="text-xs">Loading administrators...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {admins.map((adm) => (
                    <div
                      key={adm.userId}
                      className="p-3.5 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={`${adm.firstName} ${adm.lastName}`} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                              {adm.firstName} {adm.lastName}
                            </span>
                            {adm.isSelf && (
                              <span className="px-1.5 py-0.2 rounded bg-gray-200 dark:bg-gray-700 text-[10px] text-gray-600 dark:text-gray-300">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 flex items-center gap-2">
                            {adm.username ? `@${adm.username}` : `ID: ${adm.userId}`}
                            <span>•</span>
                            <span className="text-teleforge-primary dark:text-rose-400 font-semibold">
                              {adm.rank || (adm.isOwner ? 'Owner' : 'Admin')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {adm.isOwner ? (
                          <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center gap-1">
                            <Crown size={13} />
                            <span>Owner</span>
                          </span>
                        ) : (
                          <>
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTransferTargetUserId(adm.userId);
                                  setShowTransferModal(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-pointer"
                              >
                                Transfer Ownership
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDismissAdmin(adm.userId)}
                              className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-300 text-xs font-semibold cursor-pointer"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add / Edit Admin Modal */}
              {showAddAdminModal && (
                <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                  <div className="bg-white dark:bg-teleforge-surface rounded-2xl w-full max-w-md p-5 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-2">
                        <Shield size={18} className="text-purple-600" />
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          Add Administrator
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddAdminModal(false)}
                        className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Telegram User ID or Username
                      </label>
                      <input
                        type="text"
                        value={adminTargetUserId}
                        onChange={(e) => setAdminTargetUserId(e.target.value)}
                        placeholder="e.g. 123456789 or @username"
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-gray-700 text-xs focus:ring-2 focus:ring-teleforge-primary focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Custom Title / Rank (Optional)
                      </label>
                      <input
                        type="text"
                        value={adminCustomRank}
                        onChange={(e) => setAdminCustomRank(e.target.value)}
                        placeholder="e.g. Lead Moderator, Support"
                        maxLength={16}
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-gray-700 text-xs focus:ring-2 focus:ring-teleforge-primary focus:outline-hidden"
                      />
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                        Admin Privileges
                      </span>
                      {[
                        { key: 'changeInfo', label: 'Change Group Info' },
                        { key: 'deleteMessages', label: 'Delete Messages of Others' },
                        { key: 'banUsers', label: 'Ban Users' },
                        { key: 'inviteUsers', label: 'Invite Users via Link' },
                        { key: 'pinMessages', label: 'Pin Messages' },
                        { key: 'manageTopics', label: 'Manage Forum Topics' },
                        { key: 'addAdmins', label: 'Add New Admins' },
                        { key: 'anonymous', label: 'Remain Anonymous' },
                      ].map((right) => (
                        <label
                          key={right.key}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-teleforge-darkCanvas cursor-pointer"
                        >
                          <span className="text-gray-700 dark:text-gray-300">{right.label}</span>
                          <input
                            type="checkbox"
                            checked={(adminRightsInput as any)[right.key]}
                            onChange={(e) =>
                              setAdminRightsInput({
                                ...adminRightsInput,
                                [right.key]: e.target.checked,
                              })
                            }
                            className="rounded accent-teleforge-primary"
                          />
                        </label>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAddAdminModal(false)}
                        className="px-3.5 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-semibold hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAdministrator}
                        disabled={isSavingAdmin || !adminTargetUserId.trim()}
                        className="px-4 py-1.5 rounded-xl bg-teleforge-primary hover:bg-teleforge-primaryHover text-white text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        {isSavingAdmin ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        <span>Save Admin</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Transfer Ownership Modal */}
              {showTransferModal && (
                <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                  <div className="bg-white dark:bg-teleforge-surface rounded-2xl w-full max-w-md p-5 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4">
                    <div className="flex items-center gap-2 text-amber-600">
                      <Crown size={20} />
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        Transfer Group Ownership
                      </h3>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      This will transfer full ownership of <strong>{chat.name}</strong> to the selected administrator. You will lose creator rights and become an ordinary administrator.
                    </p>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Two-Step Verification Password (if enabled)
                      </label>
                      <input
                        type="password"
                        value={transferPassword}
                        onChange={(e) => setTransferPassword(e.target.value)}
                        placeholder="Enter your 2FA password..."
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-gray-700 text-xs focus:ring-2 focus:ring-teleforge-primary focus:outline-hidden"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowTransferModal(false)}
                        className="px-3.5 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleTransferOwnership}
                        disabled={isTransferring}
                        className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        {isTransferring ? <Loader2 size={13} className="animate-spin" /> : <Crown size={13} />}
                        <span>Confirm Transfer</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 4: MEMBERS & SUBSCRIBERS ================= */}
          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={memberSearchQuery}
                    onChange={(e) => {
                      setMemberSearchQuery(e.target.value);
                      loadMembers(e.target.value);
                    }}
                    placeholder="Search participants..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-gray-700 text-xs focus:ring-2 focus:ring-teleforge-primary focus:outline-hidden"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowInviteMemberModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-teleforge-primary hover:bg-teleforge-primaryHover text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <UserPlus size={14} />
                  <span>Add Member</span>
                </button>
              </div>

              {isLoadingMembers ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                  <Loader2 size={24} className="animate-spin mb-2" />
                  <span className="text-xs">Loading participants...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div
                      key={m.userId}
                      className="p-3 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={`${m.firstName} ${m.lastName}`} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                              {m.firstName} {m.lastName}
                            </span>
                            {m.isOwner && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                                👑 Owner
                              </span>
                            )}
                            {m.isAdmin && !m.isOwner && (
                              <span className="px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-[10px] font-bold text-purple-700 dark:text-purple-400">
                                🛡️ Admin
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {m.username ? `@${m.username}` : `ID: ${m.userId}`}
                          </div>
                        </div>
                      </div>

                      {!m.isOwner && (
                        <div className="flex items-center gap-1.5">
                          {!m.isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setAdminTargetUserId(m.userId);
                                setShowAddAdminModal(true);
                              }}
                              className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-[11px] font-semibold cursor-pointer"
                            >
                              Promote
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setRestrictingMember(m);
                              setRestrictDuration(0);
                            }}
                            className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-semibold cursor-pointer"
                          >
                            Restrict
                          </button>
                          <button
                            type="button"
                            onClick={() => handleKickMember(m.userId, m.firstName || 'User')}
                            className="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-300 text-[11px] font-semibold cursor-pointer"
                          >
                            Kick
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add Member Modal */}
              {showInviteMemberModal && (
                <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                  <div className="bg-white dark:bg-teleforge-surface rounded-2xl w-full max-w-md p-5 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        Add Member to {chat.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowInviteMemberModal(false)}
                        className="p-1 rounded-lg hover:bg-gray-100"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Telegram Username or Phone
                      </label>
                      <input
                        type="text"
                        value={inviteUserInput}
                        onChange={(e) => setInviteUserInput(e.target.value)}
                        placeholder="e.g. @username or phone"
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-gray-700 text-xs focus:ring-2 focus:ring-teleforge-primary focus:outline-hidden"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowInviteMemberModal(false)}
                        className="px-3.5 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleInviteMember}
                        disabled={isInvitingMember || !inviteUserInput.trim()}
                        className="px-4 py-1.5 rounded-xl bg-teleforge-primary text-white text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        {isInvitingMember ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                        <span>Add Member</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Restrict Member Modal */}
              {restrictingMember && (
                <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                  <div className="bg-white dark:bg-teleforge-surface rounded-2xl w-full max-w-md p-5 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        Restrict {restrictingMember.firstName}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setRestrictingMember(null)}
                        className="p-1 rounded-lg hover:bg-gray-100"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Restriction Duration
                      </label>
                      <div className="flex gap-2">
                        {[
                          { label: '1 Day', sec: 86400 },
                          { label: '7 Days', sec: 604800 },
                          { label: '1 Month', sec: 2592000 },
                          { label: 'Forever', sec: 0 },
                        ].map((d) => (
                          <button
                            key={d.sec}
                            type="button"
                            onClick={() => setRestrictDuration(d.sec)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${
                              restrictDuration === d.sec
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                        Forbidden Actions
                      </span>
                      {[
                        { key: 'sendMessages', label: 'Cannot Send Messages' },
                        { key: 'sendMedia', label: 'Cannot Send Media' },
                        { key: 'sendStickers', label: 'Cannot Send Stickers & GIFs' },
                        { key: 'embedLinks', label: 'Cannot Embed Links' },
                        { key: 'sendPolls', label: 'Cannot Send Polls' },
                        { key: 'inviteUsers', label: 'Cannot Add Members' },
                        { key: 'pinMessages', label: 'Cannot Pin Messages' },
                      ].map((item) => (
                        <label
                          key={item.key}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-teleforge-darkCanvas cursor-pointer"
                        >
                          <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
                          <input
                            type="checkbox"
                            checked={(restrictRights as any)[item.key]}
                            onChange={(e) =>
                              setRestrictRights({
                                ...restrictRights,
                                [item.key]: e.target.checked,
                              })
                            }
                            className="rounded accent-amber-500"
                          />
                        </label>
                      ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setRestrictingMember(null)}
                        className="px-3.5 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveRestrict}
                        disabled={isSavingRestrict}
                        className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        {isSavingRestrict ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        <span>Apply Restriction</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 5: REMOVED / BANNED USERS ================= */}
          {activeTab === 'banned' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Removed & Restricted Users
                </h3>
                <p className="text-xs text-gray-500">
                  Users who have been expelled from the chat or placed under specific restrictions.
                </p>
              </div>

              {isLoadingBanned ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                  <Loader2 size={24} className="animate-spin mb-2" />
                  <span className="text-xs">Loading banned members...</span>
                </div>
              ) : bannedList.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-xs">
                  No banned or restricted users found in this chat.
                </div>
              ) : (
                <div className="space-y-2">
                  {bannedList.map((b) => (
                    <div
                      key={b.userId}
                      className="p-3.5 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={`${b.firstName} ${b.lastName}`} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                              {b.firstName} {b.lastName}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                                b.type === 'kicked'
                                  ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                              }`}
                            >
                              {b.type === 'kicked' ? 'Banned' : 'Restricted'}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {b.username ? `@${b.username}` : `ID: ${b.userId}`}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUnbanMember(b.userId, b.firstName)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-300 text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Unban / Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 6: INVITE LINKS ================= */}
          {activeTab === 'invites' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Invite Links & Join Requests
                  </h3>
                  <p className="text-xs text-gray-500">
                    Manage entry links with optional expiration times, member limits, and admin approvals.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateLinkModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-teleforge-primary hover:bg-teleforge-primaryHover text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Create New Link</span>
                </button>
              </div>

              {isLoadingLinks ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                  <Loader2 size={24} className="animate-spin mb-2" />
                  <span className="text-xs">Loading invite links...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {fullInfo?.exportedInvite && (
                    <div className="p-4 rounded-xl border border-teleforge-primary/30 bg-teleforge-primary/5 dark:bg-teleforge-primary/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-teleforge-primary">
                          Primary Permanent Link
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-teleforge-primary/20 text-teleforge-primary font-bold">
                          Permanent
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 bg-white dark:bg-teleforge-darkCanvas p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                        <code className="text-xs text-gray-800 dark:text-gray-200 font-mono truncate">
                          {fullInfo.exportedInvite}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(fullInfo.exportedInvite, 'link')}
                          className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-600 dark:text-gray-300"
                        >
                          {copiedLink === fullInfo.exportedInvite ? <CheckCheck size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {inviteLinks.map((lnk) => (
                    <div
                      key={lnk.link}
                      className="p-3.5 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                            {lnk.title || 'Invite Link'}
                          </span>
                          {lnk.usageLimit > 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                              {lnk.usage} / {lnk.usageLimit} joined
                            </span>
                          )}
                          {lnk.requestNeeded && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
                              Approval Required
                            </span>
                          )}
                        </div>
                        <code className="text-xs text-teleforge-primary dark:text-rose-400 font-mono truncate block mt-0.5">
                          {lnk.link}
                        </code>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(lnk.link, 'link')}
                          className="p-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 text-gray-700 dark:text-gray-300"
                        >
                          {copiedLink === lnk.link ? <CheckCheck size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevokeInviteLink(lnk.link)}
                          className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-300 text-xs font-semibold cursor-pointer"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Create Link Modal */}
              {showCreateLinkModal && (
                <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                  <div className="bg-white dark:bg-teleforge-surface rounded-2xl w-full max-w-md p-5 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        Create Custom Invite Link
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowCreateLinkModal(false)}
                        className="p-1 rounded-lg hover:bg-gray-100"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Link Name / Title (Optional)
                      </label>
                      <input
                        type="text"
                        value={newLinkTitle}
                        onChange={(e) => setNewLinkTitle(e.target.value)}
                        placeholder="e.g. Campaign Alpha"
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-gray-700 text-xs focus:ring-2 focus:ring-teleforge-primary focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Limit by Number of Users (Optional)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={99999}
                        value={newLinkUsageLimit}
                        onChange={(e) => setNewLinkUsageLimit(e.target.value)}
                        placeholder="No limit"
                        className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-gray-700 text-xs focus:ring-2 focus:ring-teleforge-primary focus:outline-hidden"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={newLinkRequestNeeded}
                        onChange={(e) => setNewLinkRequestNeeded(e.target.checked)}
                        className="rounded accent-teleforge-primary"
                      />
                      <span>Require Admin Approval (Join Requests)</span>
                    </label>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowCreateLinkModal(false)}
                        className="px-3.5 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateInviteLink}
                        disabled={isCreatingLink}
                        className="px-4 py-1.5 rounded-xl bg-teleforge-primary text-white text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        {isCreatingLink ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        <span>Generate Link</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 7: RECENT ACTIONS (ADMIN LOG) ================= */}
          {activeTab === 'log' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Recent Actions (Admin Audit Log)
                </h3>
                <p className="text-xs text-gray-500">
                  Real-time event stream of administrative actions, member restrictions, and setting updates.
                </p>
              </div>

              {isLoadingLogs ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                  <Loader2 size={24} className="animate-spin mb-2" />
                  <span className="text-xs">Loading audit log events...</span>
                </div>
              ) : adminLogs.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-xs">
                  No recent administrative actions recorded in this chat.
                </div>
              ) : (
                <div className="space-y-2">
                  {adminLogs.map((log) => (
                    <div
                      key={log.id || log.date}
                      className="p-3 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 text-xs flex items-start justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            {log.adminName}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-gray-200 dark:bg-gray-700 text-[10px] font-mono">
                            {log.action}
                          </span>
                        </div>
                        {log.details && (
                          <div className="text-[11px] text-gray-500 font-mono line-clamp-1 max-w-xl">
                            {log.details}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {new Date(log.date).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 8: DANGER ZONE (OWNER ONLY) ================= */}
          {activeTab === 'danger' && isOwner && (
            <div className="max-w-2xl space-y-5">
              <div className="p-4 rounded-xl border border-red-200/80 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 space-y-3">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider">
                  <AlertTriangle size={16} />
                  <span>Permanent Deletion (Owner Privilege)</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  Deleting <strong>"{chat.name}"</strong> is permanent and irreversible. All message histories, shared media, subscriber associations, and bot connections will be deleted from Telegram cloud servers for everyone.
                </p>

                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2.5 px-3 rounded-xl border border-red-300 dark:border-red-800 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100/60 dark:hover:bg-red-900/40 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={15} />
                    <span>Delete {chat.type === 'channel' ? 'Channel' : 'Group'} Permanently</span>
                  </button>
                ) : (
                  <div className="p-4 rounded-xl bg-red-100/70 dark:bg-red-950/80 border border-red-300 dark:border-red-700 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                    <p className="text-xs font-bold text-red-700 dark:text-red-300 text-center">
                      Are you 100% sure? This will permanently destroy the {chat.type === 'channel' ? 'channel' : 'group'} on Telegram for all members!
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isDeleting}
                        className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-semibold hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDelete}
                        disabled={isDeleting}
                        className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        <span>Yes, Delete Permanently</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Change Photo Modal (Local Storage & URL) */}
        {showPhotoModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white dark:bg-teleforge-surface rounded-2xl w-full max-w-md p-5 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <Camera size={18} className="text-teleforge-primary" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Change Chat Photo
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPhotoModal(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Method Selector Tabs */}
              <div className="flex p-1 bg-gray-100 dark:bg-teleforge-darkCanvas rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setPhotoMethod('upload');
                    setPhotoPreview(photoFileBase64);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    photoMethod === 'upload'
                      ? 'bg-white dark:bg-teleforge-surface text-gray-900 dark:text-gray-100 shadow-xs'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Upload size={14} />
                  <span>Upload from Device</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoMethod('url');
                    setPhotoPreview(photoUrlInput ? photoUrlInput : null);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    photoMethod === 'url'
                      ? 'bg-white dark:bg-teleforge-surface text-gray-900 dark:text-gray-100 shadow-xs'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Link2 size={14} />
                  <span>From Image URL</span>
                </button>
              </div>

              {/* Method 1: Local File Upload */}
              {photoMethod === 'upload' && (
                <div className="space-y-3">
                  <label className="border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-teleforge-primary rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors bg-gray-50/50 dark:bg-teleforge-darkCanvas/40">
                    <Upload size={28} className="text-teleforge-primary mb-1" />
                    <div className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      {photoFileName ? photoFileName : 'Click to select photo from device'}
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Supports JPG, PNG, WebP or GIF (Up to 10MB)
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {/* Method 2: Image URL */}
              {photoMethod === 'url' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Image Web Address
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={photoUrlInput}
                      onChange={(e) => {
                        setPhotoUrlInput(e.target.value);
                        setPhotoPreview(e.target.value);
                      }}
                      placeholder="https://example.com/photo.jpg"
                      className="flex-1 px-3 py-2 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-gray-700 text-xs focus:ring-2 focus:ring-teleforge-primary focus:outline-hidden"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Paste a direct link to any public image on the web.
                  </p>
                </div>
              )}

              {/* Image Preview Box */}
              {photoPreview && (
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-teleforge-darkCanvas border border-gray-100 dark:border-gray-800 flex items-center gap-3">
                  <img
                    src={photoPreview}
                    alt="Preview"
                    onError={() => {
                      if (photoMethod === 'url') {
                        setErrorMessage('Invalid image URL or image could not be loaded.');
                        setPhotoPreview(null);
                      }
                    }}
                    className="w-14 h-14 rounded-xl object-cover ring-1 ring-gray-200 dark:ring-gray-700"
                  />
                  <div className="text-xs min-w-0 flex-1">
                    <div className="font-bold text-gray-900 dark:text-gray-100">
                      Photo Preview
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {photoMethod === 'upload' ? photoFileName || 'Local file selected' : photoUrlInput}
                    </div>
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
                {currentChatAvatar ? (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={isUploadingPhoto}
                    className="text-xs text-red-600 hover:text-red-700 font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Remove Photo
                  </button>
                ) : <div />}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPhotoModal(false)}
                    className="px-3.5 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-semibold hover:bg-gray-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePhoto}
                    disabled={isUploadingPhoto || (!photoFileBase64 && !photoUrlInput.trim())}
                    className="px-4 py-1.5 rounded-xl bg-teleforge-primary hover:bg-teleforge-primaryHover text-white text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    {isUploadingPhoto ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    <span>Set Photo</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-teleforge-darkCanvas/60 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-gray-400">
            {isOwner ? '👑 Chat Owner Access' : '🛡️ Administrator Access'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
