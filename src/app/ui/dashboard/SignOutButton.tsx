'use client';

import { PowerIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useState } from 'react';
import { Button } from "@/components/ui/button";

export default function SignOutLink() {
    const [error, setError] = useState('');

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch {
            setError('Failed to sign out. Please try again.');
        }
    };

    return (
        <>
            <Link
                href="#"
                onClick={(e) => {
                    e.preventDefault(); // Prevent default link behavior
                    handleSignOut();
                }}
                className="flex h-[48px] items-center justify-center gap-2 text-sm font-medium md:justify-center w-full"
            >
                <Button variant="secondary" size="lg" asChild>
                    <span className="flex items-center gap-2 w-full">
                        <PowerIcon className="text-muted-foreground" />
                        <span className="hidden md:block text-foreground">Sign Out</span>
                    </span>
                </Button>
            </Link>
            {error.length > 0 && (
                <p className="text-destructive mt-2 text-sm">
                    {error}
                </p>
            )}
        </>
    );
}
