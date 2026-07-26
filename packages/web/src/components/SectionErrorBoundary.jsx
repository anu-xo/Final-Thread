import { Component } from 'react';

let captureException;
if (typeof window !== 'undefined') {
  import('@sentry/react').then((mod) => {
    captureException = mod.captureException;
  }).catch(() => {});
}

export default class SectionErrorBoundary extends Component {
  state = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (captureException) {
      captureException(error, { contexts: { react: { componentStack: info.componentStack } } });
    }
  }

  handleReload = () => {
    this.setState((prev) => ({ error: null, resetKey: prev.resetKey + 1 }));
  };

  render() {
    const { error, resetKey } = this.state;
    const { children, sectionName } = this.props;

    if (error) {
      const isDev = import.meta.env?.DEV ?? false;
      return (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-4 text-sm">
          <p className="font-medium text-red-700 dark:text-red-400">Something went wrong</p>
          {isDev && (
            <p className="mt-1 font-mono text-xs text-red-500 dark:text-red-400/70 break-all">
              {error.message}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-3 rounded-lg bg-red-100 dark:bg-red-900/20 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 transition hover:bg-red-200 dark:hover:bg-red-900/40"
          >
            Reload {sectionName ?? 'section'}
          </button>
        </div>
      );
    }

    return <div key={resetKey}>{children}</div>;
  }
}
