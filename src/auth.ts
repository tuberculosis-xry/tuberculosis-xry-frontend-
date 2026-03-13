import type {User} from '@/app/lib/definitions';
// import bcrypt from 'bcrypt';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import prisma from '@/app/lib/prisma';
import {authConfig} from './auth.config';
import {z} from 'zod';

async function getUser(email: string): Promise<User | null> {
    try {
        const user = await prisma.user.findUnique({
            where: {email},
        });
        if (!user) return null;
        else {
            return {
                id: user.id,
                name: user.name!,
                email: user.email!,
                emailVerified: user.emailVerified!,
                image: user.image!,
                password: user.password!,
            };
        }
    } catch {
        throw new Error('Failed to fetch user.');
    }
}

// Export NextAuth configuration
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;

          const user = await getUser(email);
          if (!user) return null;

          // TODO enable bcrypt check
          // const passwordsMatch = await bcrypt.compare(password, user.password);
          const passwordsMatch = (password === user.password);
          if (passwordsMatch) return user;
        }

        return null;
      },
    }),
  ],
});
