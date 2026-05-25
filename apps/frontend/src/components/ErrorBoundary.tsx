'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-transparent p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--cromo-danger)]/30 bg-[var(--cromo-surface)] p-8 text-center">
            <h2 className="text-xl font-semibold text-[var(--cromo-danger)] mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-[var(--cromo-fg-muted)] mb-6 break-words">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <button
              onClick={this.handleReset}
              className="rounded-md bg-[var(--cromo-accent)] px-4 py-2 text-sm font-medium text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
