'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DicomPage() {
    useAuth();
    const router = useRouter();

    useEffect(() => {
        router.replace('/dashboard/ohif');
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-[200px]">
            <div className="animate-pulse text-muted-foreground text-sm">Redirecting to OHIF Viewer...</div>
        </div>
    );
}
