"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import {
  claimOrphanedData,
  countAdmins,
  countUsers,
  createUser,
  deleteAllUserSessions,
  deleteUserAccount,
  ensureUserProfile,
  getUserByEmail,
  getUserById,
  requireUser,
  setUserPassword,
} from "@/lib/auth/user";
import {
  consumePasswordResetToken,
  markAllPasswordResetTokensUsed,
} from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset-email";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  full_name: z.string().optional(),
});

function authFailureMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (/AUTH_SECRET|Missing required environment variable/i.test(msg)) {
    return "Server misconfigured: set AUTH_SECRET in Vercel Environment Variables, then redeploy.";
  }
  if (/DATABASE_URL|ECONNREFUSED|connect/i.test(msg)) {
    return "Could not reach the database. Check DATABASE_URL on Vercel.";
  }
  if (/relation .* does not exist|sessions|users/i.test(msg)) {
    return "Auth tables are missing. Run the Supabase schema migration (users/sessions).";
  }
  if (/password recovery email|gmail\.send|Reconnect Google from the admin account/i.test(msg)) {
    return msg;
  }
  console.error("[auth]", error);
  return "Something went wrong. Please try again.";
}

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

  try {
    const email = parsed.data.email.trim().toLowerCase();
    const existing = await getUserByEmail(email);
    if (existing) {
      return {
        ok: false as const,
        error: "An account with that email already exists.",
      };
    }

    const isFirstUser = (await countUsers()) === 0;
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await createUser({
      email,
      passwordHash,
      fullName: parsed.data.full_name,
      isAdmin: isFirstUser,
    });

    if (isFirstUser) {
      await claimOrphanedData(user.id);
    } else {
      await ensureUserProfile(user.id, parsed.data.full_name);
    }

    await createSession(user.id, {
      email: user.email,
      full_name: user.full_name,
      is_admin: user.is_admin,
      must_reset_password: user.must_reset_password,
    });
    return { ok: true as const, user };
  } catch (error) {
    return { ok: false as const, error: authFailureMessage(error) };
  }
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

  try {
    const user = await getUserByEmail(parsed.data.email);
    if (!user) {
      return {
        ok: false as const,
        error: "No account was found for this email. Create an account to log in.",
      };
    }

    const valid = await verifyPassword(
      parsed.data.password,
      user.password_hash,
    );
    if (!valid) {
      return { ok: false as const, error: "Invalid email or password." };
    }

    await createSession(user.id, {
      email: user.email,
      full_name: user.full_name,
      is_admin: user.is_admin,
      must_reset_password: user.must_reset_password,
    });
    return {
      ok: true as const,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        is_admin: Boolean(user.is_admin),
        must_reset_password: Boolean(user.must_reset_password),
        is_paid: Boolean(user.is_admin) || Boolean(user.is_paid),
      },
    };
  } catch (error) {
    return { ok: false as const, error: authFailureMessage(error) };
  }
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email."),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function requestPasswordReset(input: { email: string }) {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const user = await getUserByEmail(parsed.data.email.trim().toLowerCase());
    if (user) {
      await sendPasswordResetEmail({
        userId: user.id,
        email: user.email,
        fullName: user.full_name,
      });
    }
    return {
      ok: true as const,
      message:
        "If that email exists, a password reset link has been emailed.",
    };
  } catch (error) {
    return { ok: false as const, error: authFailureMessage(error) };
  }
}

export async function resetPasswordWithToken(input: {
  token: string;
  password: string;
}) {
  const parsed = resetPasswordSchema.safeParse({ password: input.password });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const tokenRow = await consumePasswordResetToken(input.token);
    if (!tokenRow) {
      return {
        ok: false as const,
        error: "This recovery link is invalid or has expired.",
      };
    }

    const user = await getUserByEmail(tokenRow.email);
    if (!user) {
      return { ok: false as const, error: "Account not found." };
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await setUserPassword(user.id, {
      passwordHash,
      mustResetPassword: false,
    });
    await markAllPasswordResetTokensUsed(user.id);
    await deleteAllUserSessions(user.id);
    await createSession(user.id, {
      email: user.email,
      full_name: user.full_name,
      is_admin: user.is_admin,
      must_reset_password: false,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: authFailureMessage(error) };
  }
}

export async function changePasswordAfterFirstLogin(input: { password: string }) {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const user = await requireUser();
    const passwordHash = await hashPassword(parsed.data.password);
    await setUserPassword(user.id, {
      passwordHash,
      mustResetPassword: false,
    });
    await markAllPasswordResetTokensUsed(user.id);
    await deleteAllUserSessions(user.id);
    await createSession(user.id, {
      email: user.email,
      full_name: user.full_name,
      is_admin: user.is_admin,
      must_reset_password: false,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: authFailureMessage(error) };
  }
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
});

export async function updatePassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const sessionUser = await requireUser();
    const user = await getUserByEmail(sessionUser.email);
    if (!user) {
      return { ok: false as const, error: "Account not found." };
    }

    const valid = await verifyPassword(
      parsed.data.currentPassword,
      user.password_hash,
    );
    if (!valid) {
      return { ok: false as const, error: "Current password is incorrect." };
    }

    if (parsed.data.currentPassword === parsed.data.newPassword) {
      return {
        ok: false as const,
        error: "New password must be different from your current password.",
      };
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await setUserPassword(user.id, {
      passwordHash,
      mustResetPassword: false,
    });
    await markAllPasswordResetTokensUsed(user.id);
    await deleteAllUserSessions(user.id);
    await createSession(user.id, {
      email: user.email,
      full_name: user.full_name,
      is_admin: user.is_admin,
      must_reset_password: false,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: authFailureMessage(error) };
  }
}

const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm."),
  confirmEmail: z.string().email("Enter your account email to confirm."),
});

export async function deleteMyAccount(input: {
  password: string;
  confirmEmail: string;
}) {
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const sessionUser = await requireUser();
    const user = await getUserById(sessionUser.id);
    if (!user) {
      return { ok: false as const, error: "Account not found." };
    }

    const confirmEmail = parsed.data.confirmEmail.trim().toLowerCase();
    if (confirmEmail !== user.email) {
      return {
        ok: false as const,
        error: "Confirmation email does not match your account.",
      };
    }

    const valid = await verifyPassword(parsed.data.password, user.password_hash);
    if (!valid) {
      return { ok: false as const, error: "Password is incorrect." };
    }

    if (user.is_admin && (await countAdmins()) <= 1) {
      return {
        ok: false as const,
        error:
          "You are the only admin. Add another admin before deleting your account.",
      };
    }

    const { writeAuditLog } = await import("@/lib/audit");
    await writeAuditLog("account.deleted", "users", user.id, {
      email: user.email,
      self_delete: true,
    });
    await deleteUserAccount(user.id);
    await destroySession();
    redirect("/login");
  } catch (error) {
    return { ok: false as const, error: authFailureMessage(error) };
  }
}
