"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import {
  claimOrphanedData,
  countUsers,
  createUser,
  ensureUserProfile,
  getUserByEmail,
} from "@/lib/auth/user";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  full_name: z.string().optional(),
});

export async function signUp(input: {
  email: string;
  password: string;
  full_name?: string;
}) {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const existing = await getUserByEmail(email);
  if (existing) {
    return { ok: false as const, error: "An account with that email already exists." };
  }

  const isFirstUser = (await countUsers()) === 0;
  const passwordHash = await hashPassword(parsed.data.password);
  const user = await createUser({
    email,
    passwordHash,
    fullName: parsed.data.full_name,
  });

  if (isFirstUser) {
    await claimOrphanedData(user.id);
  } else {
    await ensureUserProfile(user.id, parsed.data.full_name);
  }

  await createSession(user.id, {
    email: user.email,
    full_name: user.full_name,
  });
  return { ok: true as const, user };
}

export async function signIn(input: { email: string; password: string }) {
  const parsed = credentialsSchema
    .pick({ email: true, password: true })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const user = await getUserByEmail(parsed.data.email);
  if (!user) {
    return { ok: false as const, error: "Invalid email or password." };
  }

  const valid = await verifyPassword(parsed.data.password, user.password_hash);
  if (!valid) {
    return { ok: false as const, error: "Invalid email or password." };
  }

  await createSession(user.id, {
    email: user.email,
    full_name: user.full_name,
  });
  return {
    ok: true as const,
    user: { id: user.id, email: user.email, full_name: user.full_name },
  };
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
