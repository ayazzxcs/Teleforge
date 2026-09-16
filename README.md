# TeleForge — Unofficial Telegram Client (1.0.0)

<div align="center">
  <img width="160" height="160" alt="TeleForge Logo" src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'><circle cx='120' cy='120' r='120' fill='%238B1E22'/><path fill='%23FFF8EE' d='M54 120c38-16 63-27 75-32 36-15 44-18 48-18 1 0 3 0 4 1s2 2 2 3c0 2-1 9-2 20-5 31-15 72-18 87-1 5-3 7-5 7-4 0-8-3-12-6-8-5-18-12-25-17-2-2-4-3-3-6 1-2 4-5 13-13 13-12 17-17 17-19 0-1-1-2-3-1-3 1-13 7-28 17-5 4-10 7-14 7-5 0-9-2-15-4-8-3-14-5-14-8 0-3 5-6 17-11z'/></svg>" />
  <h3>Forged for Power, Speed, and Precision.</h3>
  <p><strong>Unofficial Third-Party Telegram Client powered by MTProto 2.0 Layer 198</strong></p>
</div>

---

## ⚠️ Important Legal Disclosure
**TeleForge is an independent, unofficial third-party client** connecting to the Telegram messaging network. It is **not** endorsed by, directly affiliated with, maintained, authorized, or sponsored by Telegram FZ-LLC or Telegram Messenger Inc. All Telegram trademarks, service marks, trade names, and product names are property of their respective owners.

TeleForge strictly adheres to Telegram's official MTProto protocols, using direct encrypted TCP connections to Telegram's production cloud infrastructure. It does **not** create shadow databases, fake messages, or secondary communication networks.

---

## ✨ Major Feature Suite

### 1. 🛡️ Native MTProto 2.0 Layer 198 Foundation
- **Production Session Persistence**: Seamless session restoration across restarts.
- **Full Authentication**: Phone number verification, secure login code, 2FA cloud password support.
- **Live MTProto Operations**: Direct cloud message editing, message revocation/deletion, message pinning, and real-time reactions.
- **Optimized Caching**: Inline JPEG stripped photo thumbnail decoding with background high-res profile photo caching.
- **Profile & Bio Synchronization**: Direct cloud bio, name, and username editing via `Api.account.UpdateProfile` and `Api.account.UpdateUsername`.
- **Profile Photo Management**: Upload new profile photos directly from local device storage or web image URLs via `Api.photos.UploadProfilePhoto`.

### 2. 📁 Power Folders (Cloud Synchronized)
- Full synchronization with Telegram's cloud dialog filters via MTProto RPCs.
- Custom folder creation, editing, drag-and-drop reordering, and deletion.
- Comprehensive inclusion/exclusion rules: Contacts, Non-Contacts, Groups, Channels, and Bots.
- Live client-side preview calculation before committing updates to the cloud.

### 3. 🎨 Theme Studio
- TeleForge signature visual identity: #8B1E22 Deep Red + #FFF8EE Warm Cream.
- Real-time token matrix editor with instant preview.
- Built-in WCAG AAA/AA Contrast Compliance checker.
- Full JSON theme import and export with cryptographic token validation.
- Per-component styling for message bubbles, sidebar, toolbars, and background surfaces.

### 4. ⚡ Power Tools & Chat Customization
- Per-chat custom styling: custom accent colors, corner radii (sharp, rounded, pill), text scaling, and timestamp formats (12h/24h/relative).
- Customizable quick reaction tray with animated feedback.
- Configurable chat gestures (double-tap to react, swipe-to-reply).

### 5. 🎛️ Command Center
- Control hub for TeleForge power features.
- Quick toggles for Theme Mode, Power Tools, Gesture Mode, and Night Shift.
- Global searchable action index with keyboard shortcuts.
- Persistent favorite actions and recently accessed controls.
- Cache and storage inspector with safe cleanup actions.

---

## 🏗️ Architecture & Layout

`
+-------------------------------------------------------------+
| TeleForge UI (React 18 + TypeScript + Tailwind CSS)         |
+-------------------------------------------------------------+
| TeleForge State Manager & Power Tools Services (App.tsx)   |
+-------------------------------------------------------------+
| REST / JSON Middleware API (server/telegramMiddleware.js)   |
+-------------------------------------------------------------+
| MTProto Layer 198 Engine & Entity Cache (telegramBackend.js)|
+-------------------------------------------------------------+
| Encrypted MTProto 2.0 TCP Transport (GramJS)                |
+-------------------------------------------------------------+
| Telegram Cloud Datacenters (DC4 / DC2 / DC1 / DC3 / DC5)   |
+-------------------------------------------------------------+
`

---

## 🚀 Build & Development Instructions

### Prerequisites
- **Node.js**: v18.0.0 or higher (v24.x recommended)
- **npm**: v9.0.0 or higher
- **Telegram API Credentials**: Obtained from [my.telegram.org](https://my.telegram.org)

### 1. Configure Telegram API Credentials
Set your credentials in .telegram_config.json or as environment variables:
`json
{
  "apiId": YOUR_TELEGRAM_API_ID,
  "apiHash": "YOUR_TELEGRAM_API_HASH"
}
`
*Note: Never share or commit your piHash or .telegram_session.*

### 2. Install Dependencies
`ash
npm install
`

### 3. Start Development Server
`ash
npm run dev
`
Access the application at http://localhost:3000.

### 4. Production Release Build
`ash
npm run build
`
Generates an optimized, minified production distribution in dist/.

### 5. Preview Production Build
`ash
npm run preview
`

---

## 🔒 Security & Privacy

- **Direct MTProto Encryption**: All user data flows encrypted directly between your client and Telegram's servers.
- **Zero Third-Party Telemetry**: No tracking scripts, no third-party analytics, no tracking cookies.
- **Safe Credential Handling**: Auth codes, passwords, and sessions are never logged to console or disk in plaintext.
- **Strict .gitignore**: Keystores, session files, and API secrets are strictly excluded from source control.

---

## 📄 License & Attribution

- TeleForge source code and modifications are licensed under the **GNU General Public License v2.0 (GPL-2.0)**.
- Telegram is a registered trademark of Telegram FZ-LLC.
- Built with [GramJS](https://github.com/gram-js/gramjs) (MIT License).
