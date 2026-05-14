import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

/**
 * Signups are restricted to this email domain. The UI shows the domain
 * as a fixed suffix on the register form, and this server-side hook
 * rejects any signup whose email doesn't end with the domain — so
 * bypassing the client-side restriction doesn't get you in.
 *
 * Set to empty string to allow any email.
 */
export const ALLOWED_SIGNUP_DOMAIN = "farbentechnique.com";

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: (process.env.TRUSTED_ORIGINS || "").split(",").filter(Boolean),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (ALLOWED_SIGNUP_DOMAIN) {
            const email = (user.email || "").toLowerCase().trim();
            const suffix = "@" + ALLOWED_SIGNUP_DOMAIN.toLowerCase();
            if (!email.endsWith(suffix)) {
              throw new Error(
                `Only @${ALLOWED_SIGNUP_DOMAIN} email addresses can sign up. Contact your admin for access.`
              );
            }
          }
          return { data: user };
        },
      },
    },
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});

export type Session = typeof auth.$Infer.Session;
