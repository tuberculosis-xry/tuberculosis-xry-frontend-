'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';

type Props = {
  children: React.ReactNode;
  /** When provided, a "Try again" button is shown to recover by remounting (parent should pass a callback that updates a key). */
  onRetry?: () => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ViewerErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('OHIF Viewer error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background text-foreground">
          <AlertCircle className="w-12 h-12 text-destructive shrink-0" />
          <h1 className="text-lg font-semibold">Something went wrong in the viewer</h1>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {this.props.onRetry && (
              <button
                type="button"
                onClick={this.props.onRetry}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-muted hover:bg-muted/80 text-sm font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
            )}
            <Link
              href="/dashboard/ohif"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to study list
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
