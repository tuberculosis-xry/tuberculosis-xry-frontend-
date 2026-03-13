'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type StorageStatusProps = {
  onSyncComplete?: () => void;
};

/** App DICOM storage (DB) status. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- prop kept for API compatibility with dashboard
export function StorageStatus(props: StorageStatusProps) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [studyCount, setStudyCount] = useState<number | null>(null);

  const checkHealth = useCallback(async () => {
    setMessage(null);
    setStudyCount(null);
    try {
      const res = await fetch('/api/ohif/dicom-health');
      const data = await res.json().catch(() => ({}));
      setOk(data.ok === true);
      if (data.ok) setStudyCount(typeof data.studyCount === 'number' ? data.studyCount : null);
      if (!data.ok) setMessage(data.message ?? 'Storage error');
    } catch {
      setOk(false);
      setMessage('Could not reach storage');
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  if (ok === null) {
    return (
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/50 animate-pulse" />
        Checking…
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" title="Storage" />
          {studyCount !== null ? `${studyCount} studies` : 'Storage'}
        </span>
      ) : (
        <span className="text-xs text-destructive flex items-center gap-1.5" title={message ?? undefined}>
          <AlertCircle className="w-3.5 h-3.5" />
          {message ?? 'Storage error'}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={checkHealth}
        title="Refresh status"
      >
        <RefreshCw className="w-4 h-4" />
      </Button>
    </div>
  );
}
