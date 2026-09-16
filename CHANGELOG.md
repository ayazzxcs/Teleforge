# Changelog

All notable changes to the **TeleForge** client are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

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
