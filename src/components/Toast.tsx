import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'info' | 'error';

export interface ToastMessage {
  id: string;
  text: string;
  type?: ToastType;
}

// Global lightweight event dispatcher for toasts
type ToastListener = (toast: ToastMessage) => void;
const listeners = new Set<ToastListener>();

export const showToast = (text: string, type: ToastType = 'info') => {
  const message: ToastMessage = {
    id: `${Date.now()}-${Math.random()}`,
    text,
    type,
  };
  listeners.forEach((listener) => listener(message));
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast: ToastListener = (newToast) => {
      setToasts((prev) => [...prev.slice(-3), newToast]); // keep max 4 toasts

      // Auto dismiss after 2.8s
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 2800);
    };

    listeners.add(handleToast);
    return () => {
      listeners.delete(handleToast);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none select-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-2.5 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-medium backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150 transition-all ${
              isSuccess
                ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
                : isError
                ? 'bg-red-950/90 border-red-800 text-rose-200'
                : 'bg-[#151d27]/95 border-gray-700/80 text-[#FFF8EE]'
            }`}
          >
            {isSuccess ? (
              <Check size={15} className="text-emerald-400 shrink-0" />
            ) : isError ? (
              <AlertCircle size={15} className="text-rose-400 shrink-0" />
            ) : (
              <Info size={15} className="text-[#8B1E22] dark:text-rose-400 shrink-0" />
            )}

            <span>{toast.text}</span>

            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="ml-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
