'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * External worklist / hospital system deep link.
 * Open this URL with query params to land in the OHIF viewer for the given study/studies.
 * Example: /dashboard/ohif/launch?StudyInstanceUIDs=1.2.3.4,1.2.3.5
 * If not authenticated, redirects to login with returnUrl so user returns here after login.
 */
export default function OHIFLaunchPage() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;

    const studyInstanceUIDs = searchParams.get('StudyInstanceUIDs') ?? '';
    const params = new URLSearchParams();
    if (studyInstanceUIDs.trim()) params.set('StudyInstanceUIDs', studyInstanceUIDs.trim());
    // Forward any other known params if needed later (e.g. SeriesInstanceUID, AccessionNumber)
    const seriesUid = searchParams.get('SeriesInstanceUID');
    if (seriesUid?.trim()) params.set('SeriesInstanceUID', seriesUid.trim());

    const queryString = params.toString();
    const viewerPath = `/dashboard/ohif/viewer${queryString ? `?${queryString}` : ''}`;

    if (!user) {
      const returnUrl = `/dashboard/ohif/launch${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      return;
    }

    router.replace(viewerPath);
  }, [user, authLoading, searchParams, router]);

  return (
    <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
      {authLoading ? 'Checking authentication…' : 'Opening viewer…'}
    </div>
  );
}
