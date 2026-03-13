'use server';

/**
 * NextAuth server actions (Credentials provider).
 * Not used by the current UI — login/signup use Firebase via AuthContext.
 * Reserved for future use if switching to NextAuth or hybrid auth.
 */
import {signIn, signOut} from '@/auth';
import {AuthError} from 'next-auth';


export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  formData.set('redirectTo', '/dashboard');
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: '/', redirect: true });
}