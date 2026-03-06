import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import axios from 'axios';

const handler = NextAuth({
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
    ],
    callbacks: {
        async signIn({ user, account }) {
            if (account?.provider === 'google') {
                try {
                    // Exchange Google profile for our own JWT from the backend
                    const res = await axios.post(
                        `${process.env.NEXT_PUBLIC_API_URL}/auth/google-login`,
                        {
                            googleId: account.providerAccountId,
                            email: user.email,
                            name: user.name,
                        }
                    );
                    // Store our custom JWT + user in the token
                    (user as any).customToken = res.data.token;
                    (user as any).customUser = res.data.user;
                    return true;
                } catch {
                    return false;
                }
            }
            return true;
        },
        async jwt({ token, user }) {
            if (user) {
                token.customToken = (user as any).customToken;
                token.customUser = (user as any).customUser;
            }
            return token;
        },
        async session({ session, token }) {
            (session as any).customToken = token.customToken;
            (session as any).customUser = token.customUser;
            return session;
        },
    },
    pages: {
        signIn: '/auth/login',
    },
    secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
