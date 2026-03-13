'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
    User,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut as firebaseSignOut,
    updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { invalidateCacheForUser } from '@/hooks/useCachedApi';

/** Session cookie max-age in seconds (1 year — keep user logged in). */
const SESSION_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string, displayName?: string) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Handle return from Google sign-in redirect (user picked account on Google, then came back here)
        getRedirectResult(auth).then((result) => {
            if (result?.user) {
                document.cookie = `auth-session=true; path=/; max-age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax`;
                router.push('/dashboard');
            }
        }).catch(() => { /* ignore; user may have cancelled */ });

        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setLoading(false);

            if (firebaseUser) {
                document.cookie = `auth-session=true; path=/; max-age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax`;
            } else {
                document.cookie = "auth-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            }
        });
        return () => unsubscribe();
    }, [router]);

    const redirectToDashboard = useCallback(() => {
        document.cookie = `auth-session=true; path=/; max-age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax`;
        router.push('/dashboard');
    }, [router]);

    const login = useCallback(async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
        redirectToDashboard();
    }, [redirectToDashboard]);

    const signup = useCallback(async (email: string, password: string, displayName?: string) => {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
            await updateProfile(credential.user, { displayName });
        }
        redirectToDashboard();
    }, [redirectToDashboard]);

    const loginWithGoogle = useCallback(async () => {
        try {
            // Prefer popup: opens Google's "Choose an account" in a dialog so user can pick any Gmail.
            await signInWithPopup(auth, googleProvider);
            redirectToDashboard();
        } catch (err: unknown) {
            const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
            // Popup blocked, closed, or failed → use redirect flow (full page goes to Google, then back).
            if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
                await signInWithRedirect(auth, googleProvider);
            } else {
                throw err;
            }
        }
    }, [redirectToDashboard]);

    const logout = useCallback(async () => {
        const uid = auth.currentUser?.uid;
        if (uid) invalidateCacheForUser(uid);
        await firebaseSignOut(auth);
        router.push('/');
    }, [router]);

    return (
        <AuthContext.Provider value={{ user, loading, login, signup, loginWithGoogle, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
