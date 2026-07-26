import { Component } from 'react';

export default class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[RootErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/home';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="text-5xl mb-4">💥</div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-neutral-100 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-gray-500 dark:text-neutral-400 mb-6">
              The app encountered an unexpected error. You can try going back to the home page.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-5 py-2 bg-orange-500 text-white text-sm font-semibold rounded-full hover:bg-orange-600 transition"
              >
                Go Home
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2 border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-neutral-300 text-sm font-semibold rounded-full hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
              >
                Reload
              </button>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <pre className="mt-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400 text-left overflow-auto max-h-48">
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
