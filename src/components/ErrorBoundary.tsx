import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f6f5] p-6">
          <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
            <h2 className="font-[var(--font-display)] text-2xl font-extrabold uppercase text-[#0b141a]">
              Something went wrong
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#090d11] px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
