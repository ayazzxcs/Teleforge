import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('TeleForge caught an unexpected UI error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-gray-100 dark:bg-teleforge-darkCanvas text-gray-900 dark:text-teleforge-cream select-none">
          <div className="max-w-md w-full p-6 rounded-2xl bg-white dark:bg-teleforge-darkSurface shadow-xl border border-gray-200 dark:border-teleforge-darkBorder text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-teleforge-primary/10 text-teleforge-primary flex items-center justify-center">
              <AlertTriangle size={28} />
            </div>
            <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              TeleForge encountered an unexpected error while rendering.
            </p>
            {this.state.error && (
              <pre className="p-3 mb-5 text-left text-[11px] font-mono rounded-lg bg-gray-100 dark:bg-black/40 text-gray-600 dark:text-gray-300 overflow-x-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-teleforge-primary text-teleforge-cream hover:brightness-110 flex items-center gap-1.5 shadow-md shadow-teleforge-primary/20 transition-all"
              >
                <RefreshCw size={14} />
                <span>Reload App</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
