import React from 'react';
import { Shield, Folder, Palette, Wrench, ArrowRight, Zap } from 'lucide-react';
import { TeleForgeLogo } from './TeleForgeLogo';

interface TeleForgeWelcomeViewProps {
  onContinue: () => void;
  onExploreDemo?: () => void;
}

export const TeleForgeWelcomeView: React.FC<TeleForgeWelcomeViewProps> = ({
  onContinue,
  onExploreDemo,
}) => {
  return (
    <div className="w-full h-full min-h-[100dvh] flex flex-col items-center justify-center bg-[#F8F4EE] dark:bg-[#0c1017] p-4 sm:p-6 overflow-y-auto select-none">
      <div className="w-full max-w-lg bg-white dark:bg-[#151d27] rounded-3xl shadow-2xl border border-gray-200/80 dark:border-gray-800 p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <TeleForgeLogo size="lg" className="mb-3.5" />
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-teleforge-cream tracking-tight">
            TeleForge
          </h1>
          <p className="text-sm font-semibold text-teleforge-primary dark:text-rose-400 mt-1">
            Your Telegram. Your way.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
            An unofficial third-party client built from the open-source Telegram MTProto project.
          </p>
        </div>

        {/* 4 Core Value Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-[#1c2633]/80 border border-gray-100 dark:border-gray-800/80 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Shield size={16} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Real Telegram Client</h4>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                Connects directly to Telegram MTProto Layer 198 servers with zero intermediary proxy.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-[#1c2633]/80 border border-gray-100 dark:border-gray-800/80 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
              <Folder size={16} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Power Folders</h4>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                Organize chats with advanced filters, unread rules, and instant Telegram cloud sync.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-[#1c2633]/80 border border-gray-100 dark:border-gray-800/80 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
              <Palette size={16} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Theme Studio</h4>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                Design custom color schemes with 24 live tokens, contrast checks, and file export.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-[#1c2633]/80 border border-gray-100 dark:border-gray-800/80 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <Wrench size={16} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Power Tools Hub</h4>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                Per-chat customization, quick reactions, gesture navigation, and unified Command Center.
              </p>
            </div>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="space-y-2">
          <button
            onClick={onContinue}
            className="w-full py-3 px-4 rounded-xl bg-teleforge-primary hover:bg-teleforge-hover active:bg-teleforge-active text-teleforge-cream text-sm font-bold shadow-lg shadow-red-950/20 flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-101 active:scale-99"
          >
            <span>Start Messaging</span>
            <ArrowRight size={16} />
          </button>

          {onExploreDemo && (
            <button
              onClick={onExploreDemo}
              className="w-full py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Zap size={14} className="text-teleforge-primary dark:text-rose-400" />
              <span>Explore Offline Demo</span>
            </button>
          )}
        </div>

        {/* Disclaimer Footer */}
        <p className="text-[10px] text-center text-gray-400 dark:text-gray-500 mt-4 leading-relaxed">
          TeleForge is an independent client and is not affiliated with or endorsed by Telegram FZ-LLC.
        </p>
      </div>
    </div>
  );
};
