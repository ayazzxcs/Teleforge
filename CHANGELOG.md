# Changelog

All notable changes to the **TeleForge** client are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.4] - 2026-09-21

### 🚀 TeleForge 1.0.4 (Chat Management, Admin/Owner Suite, Forum Topics & Live Username Availability)

#### Full Admin & Owner Suite
- **Complete Chat Management Modal (`ManageChatModal`)**: Built Telegram-grade administration suite with 7 dedicated tabs: General, Permissions, Administrators, Members, Removed Users, Invite Links, and Recent Actions (Admin Log).
- **Owner & Admin Privilege Detection**: Automatic detection of creator/owner status and specific granular admin rights (`changeInfo`, `postMessages`, `editMessages`, `deleteMessages`, `banUsers`, `inviteUsers`, `pinMessages`, `addAdmins`, `manageTopics`).
- **Member Permissions & Slow Mode**: Live configuration of default banned rights (Send Messages, Media, Stickers, Links, Polls, Pin, Add Users) and slow mode delays (0s to 1 hour).
- **Dual-Method Chat Avatar Customizer**: Added support to update group and channel photos via local storage file upload (PNG, JPG, WebP) or direct image URL, with live preview and photo deletion.
- **Live MTProto Username Check**: Real-time debounced MTProto availability verification with visual indicators (`available`, `occupied`, `invalid`, `current`).
- **Owner-Exclusive Protections**: Clear indicators and read-only protection for non-owner administrators attempting to change public links, adhering to Telegram's security policies.
- **Graceful MTProto Error Handling**: Safe handling of `CHAT_NOT_MODIFIED` and user-friendly error feedback for title, bio, and username updates.

#### Forum Topics Bar & Navigation
- **Dynamic Topic Filtering**: Implemented `ForumTopicsBar` to fetch and display channel/supergroup forum topics via `channels.GetForumTopics`.
- **Direct Topic Switching**: Allows users to filter and switch between active forum topics or view all discussions seamlessly.

#### Direct Chat Discovery & Unified Tabs
- **Unified All Chats Feed**: Enhanced sidebar and folder filters so group channels, supergroups, and DMs appear reliably in the "All" chats view and respective category filters.

---

## [1.0.3] - 2026-09-20

### 🚀 TeleForge 1.0.3 (Reactions & Message Forwarding)

#### Real-Time Reactions & Reactor Identities
- **Other People's Reactions**: Upgraded `ReactionDetailsModal` to fetch and display the exact list of users who reacted to any message (`messages.getMessageReactionsList`), including reactor avatars, display names, @usernames, reaction emojis, and timestamps.
- **Direct Chat Navigation**: Tap any reactor in the reaction list to view their user profile or open a direct chat immediately.
- **Live MTProto Reaction Updates**: Implemented real-time `UpdateMessageReactions` event handling across both direct MTProto and backend SSE connections so incoming reactions from other people appear instantaneously without page refreshes.
- **Expanded Reaction Palette**: Added "More reactions" expand button in message action bar containing popular Telegram reactions (🔥, 🥰, 👏, 🤩, 😱, 💩, 🙏, 👌, 💯, 🤣, etc.) and quick `+` reaction trigger directly on message reaction pills.

#### Message Forwarding & Attribution
- **Native MTProto Forwarding**: Enabled forwarding messages to any destination chat, group, channel, or Saved Messages via `messages.forwardMessages`.
- **Forwarded From Header**: Styled attribution banner showing forward source (channel or user) with clickable navigation to the original source.

#### Media & Video Streaming Improvements
- **Accurate Video Duration**: Enhanced `TeleForgeVideoPlayer` and backend audio/video stream probing to discover and display full video durations reliably during progressive playback.

---

## [1.0.0] - 2026-09-15

### 🚀 Official Public Release: TeleForge 1.0.0

#### Core MTProto 2.0 Engine & Cloud Sync
- **Direct MTProto Connection**: Built on Layer 198 Telegram MTProto protocol via GramJS over secure TCP sockets.
- **Production Session Persistence**: Encrypted session string storage in .telegram_session for instant session recovery across restarts.
- **Complete Auth Pipeline**: Phone number login, SMS/App login code verification, and Telegram 2FA Cloud Password support.
- **Profile Bio & Info Sync**: Real-time cloud synchronization for user bio (`about`), display name, and username via `Api.account.UpdateProfile` and `Api.account.UpdateUsername`.
- **Profile Photo Management**: Native local storage file picker and direct image URL fetching with MTProto cloud upload (`Api.photos.UploadProfilePhoto`).
- **Dialog & Peer Resolution**: Integrated caching of peer entities (peerEntityCache) to accelerate message queries and prevent redundant network round-trips.
- **Inline Photo Thumbnail Decoding**: Automated extraction and conversion of stripped JPEG photos into inline data URIs (< 200ms chat list load).
- **Live MTProto Actions**: Server-side cloud synchronization for message editing, revocation/deletion, pinning, and reaction syncing.
- **Server Mark-as-Read**: Automated invocation of client.markAsRead upon chat selection to accurately synchronize unread counts with Telegram's datacenters.
- **Real Member Count**: Querying channels.GetFullChannel and messages.GetFullChat for live member counts.
- **Security & Privacy Hardening**: Strict credential protection with no plaintext logging of tokens or passwords, removal of unused third-party APIs, and hardened backup/transfer rules.

#### Android Native Client Container (`org.teleforge.client`)
- **Native WebView Container**: Embedded production TeleForge client in hardware-accelerated Android `WebView` (`MainActivity.kt`).
- **Asset Loader**: Configured `WebViewAssetLoader` with local HTTPS origin mapping for zero-latency asset loading.
- **Deep Linking Integration**: Full `tg://` and `https://t.me/` URL routing with runtime intent evaluation.
- **Native File Chooser**: Standard Android document/media picker bridge (`WebChromeClient.onShowFileChooser`) for local avatar and media uploads.
- **System Theme & Hardware Back**: Edge-to-edge system bar coloring and native `OnBackPressedCallback` history traversal.

#### TeleForge Brand & Visual Identity
- **Signature Palette**: Deep TeleForge Red (#8B1E22) paired with Warm Cream (#FFF8EE) and dark canvas (#0c1017).
- **Responsive Web & Mobile Layout**: Fluid chat sidebar, sticky header, adaptive drawer navigation, and touch-optimized action targets.
- **Toast Notification Engine**: Non-blocking toast notifications replacing disruptive browser lert() and confirm() dialogs.
- **Universal Modal Dismissal**: Standardized Escape key listeners and outside backdrop dismissal across all 10 modal dialogs with nested hierarchy awareness.
- **Accessibility & Motion Standards**: Full support for prefers-reduced-motion: reduce and high-contrast :focus-visible outlines.

#### Power Folders
- **Cloud Dialog Filter Sync**: Bidirectional sync with Telegram cloud dialog filters (messages.GetDialogFilters, messages.UpdateDialogFilter).
- **Live Filter Rules**: Filter by contacts, non-contacts, groups, channels, bots, and unread status.
- **Drag-and-Drop Reordering**: Client-side reordering persisted to Telegram cloud via messages.UpdateDialogFiltersOrder.
- **Live Preview Matrix**: Instant client-side chat calculation while configuring rules.

#### Theme Studio
- **Live Color Customizer**: Dynamic adjustment of 10+ theme tokens with instantaneous UI and message bubble preview.
- **WCAG Contrast Calculator**: Built-in luminance contrast checker alerting on non-compliant foreground/background pairs.
- **Theme Presets**: TeleForge Forge Dark, Telegram Classic Dark, Crimson Flame, and Nordic Night presets.
- **Import / Export**: JSON-based theme sharing with schema validation and sanitization.

#### Power Tools
- **Chat Presentation**: Per-chat custom accent colors, font size adjustments (compact, normal, relaxed), and bubble corner radius options (sharp, rounded, pill).
- **Quick Reaction Tray**: Configurable emoji sets with animated feedback upon tapping.
- **Timestamp Formatting**: 12-hour, 24-hour, and relative time representations.

#### Command Center
- **Unified Control Hub**: Quick toggles for theme, night shift, gestures, and power tools.
- **Global Search Index**: Search across all TeleForge settings and actions.
- **Favorites & Recents**: Fast access to frequently used client features.
- **Storage Management**: Inspector for localStorage usage and cached session data.
