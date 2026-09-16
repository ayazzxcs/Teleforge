import React, { useState } from 'react';
import { Shield, Key, Phone, Lock, ArrowRight, RefreshCw, AlertCircle, CheckCircle, Info, ChevronLeft, Sparkles } from 'lucide-react';
import { telegramApi, TelegramUser } from '../services/telegramApi';
import { TeleForgeLogo } from './TeleForgeLogo';
import { TeleForgeWelcomeView } from './TeleForgeWelcomeView';

interface TelegramAuthViewProps {
  onSuccess: (user: TelegramUser) => void;
  isConfigured: boolean;
  configuredApiId?: number;
  onExploreDemo?: () => void;
}

function formatAuthError(err: any): string {
  const msg = (err?.message || '').toUpperCase();
  if (msg.includes('PHONE_NUMBER_INVALID')) {
    return 'Invalid phone number format. Please include your country code (e.g. +1 234 567 8900).';
  }
  if (msg.includes('PHONE_NUMBER_UNREGISTERED')) {
    return 'This phone number is not registered on Telegram. Please sign up using the official Telegram app first.';
  }
  if (msg.includes('PHONE_NUMBER_FLOOD') || msg.includes('FLOOD_WAIT')) {
    return 'Too many login attempts. Please wait a few moments and try again.';
  }
  if (msg.includes('PHONE_NUMBER_BANNED')) {
    return 'This phone number has been banned from Telegram.';
  }
  if (msg.includes('PHONE_CODE_INVALID')) {
    return 'The verification code is incorrect. Check the code sent to your Telegram app.';
  }
  if (msg.includes('PHONE_CODE_EXPIRED')) {
    return 'This verification code has expired. Please go back and request a new code.';
  }
  if (msg.includes('PASSWORD_HASH_INVALID') || msg.includes('PASSWORD_INVALID')) {
    return 'Incorrect cloud password. Please check your password and try again.';
  }
  if (msg.includes('NETWORK') || msg.includes('FAILED TO FETCH') || msg.includes('ECONNREFUSED') || msg.includes('TIMEOUT')) {
    return 'Could not connect to Telegram servers. Check your internet connection and try again.';
  }
  return err?.message || 'Authentication error. Please try again.';
}

export const TelegramAuthView: React.FC<TelegramAuthViewProps> = ({
  onSuccess,
  isConfigured,
  configuredApiId,
  onExploreDemo,
}) => {
  const [step, setStep] = useState<'welcome' | 'phone' | 'code' | '2fa'>(() => {
    try {
      if (localStorage.getItem('teleforge_welcome_seen') !== 'true') {
        return 'welcome';
      }
    } catch (e) {}
    return 'phone';
  });
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password2FA, setPassword2FA] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [isCodeViaApp, setIsCodeViaApp] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const handleDismissWelcome = () => {
    try {
      localStorage.setItem('teleforge_welcome_seen', 'true');
    } catch (e) {}
    setStep('phone');
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setErrorMessage('Please enter your phone number with country code (e.g. +1 234 567 8900)');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setStatusNote(null);

    try {
      const res = await telegramApi.sendCode(phoneNumber.trim());
      setPhoneCodeHash(res.phoneCodeHash);
      setIsCodeViaApp(res.isCodeViaApp);
      setStatusNote(
        res.isCodeViaApp
          ? 'An official Telegram login code was sent to your Telegram app on your other devices.'
          : 'An SMS containing your Telegram verification code was sent to your phone.'
      );
      setStep('code');
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneCode.trim()) {
      setErrorMessage('Please enter the verification code you received.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await telegramApi.signIn(phoneNumber.trim(), phoneCode.trim(), phoneCodeHash);
      if (res.requires2FA) {
        setStep('2fa');
        setStatusNote('Your Telegram account is protected by Two-Step Verification (Cloud Password).');
      } else if (res.user) {
        onSuccess(res.user);
      }
    } catch (err: any) {
      if (err.message && err.message.includes('SESSION_PASSWORD_NEEDED')) {
        setStep('2fa');
        setStatusNote('Your Telegram account has 2FA enabled. Please enter your cloud password.');
      } else {
        setErrorMessage(formatAuthError(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password2FA) {
      setErrorMessage('Please enter your Two-Step Verification password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await telegramApi.submit2FA(password2FA);
      if (res.user) {
        onSuccess(res.user);
      }
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'welcome') {
    return (
      <TeleForgeWelcomeView
        onContinue={handleDismissWelcome}
        onExploreDemo={onExploreDemo}
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#F8F4EE] dark:bg-[#0c1017] p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-[#151d27] rounded-3xl shadow-xl border border-gray-200/80 dark:border-gray-800 p-6 sm:p-8 relative">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <TeleForgeLogo size="lg" className="mb-3.5" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-teleforge-cream tracking-tight">TeleForge</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
            Unofficial Telegram Client • Powered by MTProto 2.0
          </p>

          {/* MTProto Status Chip */}
          <div className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Direct MTProto 2.0 Connection</span>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 space-y-2.5">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Informational Status Note */}
        {statusNote && (
          <div className="mb-4 p-3.5 rounded-xl bg-amber-50/70 dark:bg-[#201815] border border-amber-200/80 dark:border-amber-900/40 flex items-start gap-2.5 text-xs text-amber-900 dark:text-teleforge-cream">
            <Info size={16} className="shrink-0 mt-0.5 text-teleforge-primary dark:text-amber-400" />
            <div className="flex-1">{statusNote}</div>
          </div>
        )}

        {/* STEP 1: Phone Number */}
        {step === 'phone' && (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Phone Number
              </label>
              <div className="relative flex items-center">
                <Phone size={18} className="absolute left-3.5 text-gray-400" />
                <input
                  type="tel"
                  placeholder="+1 234 567 8900"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isLoading}
                  autoFocus
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#1c2633] border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-hidden focus:border-teleforge-primary focus:ring-1 focus:ring-teleforge-primary/30 transition-colors"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                Include country code (e.g., +1 for US, +44 for UK).
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || !phoneNumber.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-teleforge-primary hover:bg-teleforge-hover active:bg-teleforge-active disabled:opacity-50 text-teleforge-cream text-sm font-semibold shadow-md shadow-red-950/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin text-teleforge-cream" />
                  <span>Connecting to Telegram MTProto...</span>
                </>
              ) : (
                <>
                  <span>Next</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {onExploreDemo && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onExploreDemo}
                  className="w-full py-2.5 px-4 rounded-xl border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <span>⚡ Explore Offline Preview (Skip Login)</span>
                </button>
              </div>
            )}

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setStep('welcome')}
                className="text-[11px] text-teleforge-primary dark:text-rose-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Sparkles size={12} />
                <span>What is TeleForge? View Features</span>
              </button>
            </div>

            {/* MTProto Status Footer */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center text-xs text-gray-400">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle size={14} />
                <span>Encrypted MTProto 2.0 Protocol</span>
              </div>
            </div>
          </form>
        )}

        {/* STEP 2: Verification Code */}
        {step === 'code' && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Telegram Verification Code
                </label>
                <span className="text-xs text-gray-400">{phoneNumber}</span>
              </div>
              <div className="relative flex items-center">
                <Key size={18} className="absolute left-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="12345"
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value.trim())}
                  disabled={isLoading}
                  autoFocus
                  maxLength={10}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#1c2633] border border-gray-200 dark:border-gray-700 rounded-xl text-center tracking-widest text-lg font-mono text-gray-900 dark:text-white placeholder-gray-400 focus:outline-hidden focus:border-teleforge-primary focus:ring-1 focus:ring-teleforge-primary/30 transition-colors"
                />
              </div>
              <div className="mt-2.5 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                  <Info size={14} />
                  <span>Where is your code?</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Telegram sends the 5-digit code directly to your <strong>official Telegram app</strong> on your phone or PC (in the chat named <strong>Telegram</strong>), NOT as an SMS text message.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !phoneCode.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-teleforge-primary hover:bg-teleforge-hover active:bg-teleforge-active disabled:opacity-50 text-teleforge-cream text-sm font-semibold shadow-md shadow-red-950/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin text-teleforge-cream" />
                  <span>Verifying with MTProto...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <CheckCircle size={16} />
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setStep('phone');
                setPhoneCode('');
                setErrorMessage(null);
              }}
              className="w-full py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-teleforge-primary transition-colors"
            >
              Wrong number? Go back
            </button>
          </form>
        )}

        {/* STEP 3: 2FA Password */}
        {step === '2fa' && (
          <form onSubmit={handleVerify2FA} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Two-Step Verification Password
              </label>
              <div className="relative flex items-center">
                <Lock size={18} className="absolute left-3.5 text-gray-400" />
                <input
                  type="password"
                  placeholder="Enter your Telegram cloud password"
                  value={password2FA}
                  onChange={(e) => setPassword2FA(e.target.value)}
                  disabled={isLoading}
                  autoFocus
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#1c2633] border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-hidden focus:border-teleforge-primary focus:ring-1 focus:ring-teleforge-primary/30 transition-colors"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                Your account is protected with a personal Telegram cloud password (SRP protocol).
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || !password2FA}
              className="w-full py-2.5 px-4 rounded-xl bg-teleforge-primary hover:bg-teleforge-hover active:bg-teleforge-active disabled:opacity-50 text-teleforge-cream text-sm font-semibold shadow-md shadow-red-950/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={16} className="animate-spin text-teleforge-cream" />
                  <span>Checking Password...</span>
                </>
              ) : (
                <>
                  <span>Unlock Account</span>
                  <CheckCircle size={16} />
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setStep('code');
                setPassword2FA('');
                setErrorMessage(null);
              }}
              className="w-full py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-teleforge-primary transition-colors"
            >
              Back to code verification
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
