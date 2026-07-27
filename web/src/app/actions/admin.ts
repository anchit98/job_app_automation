"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { markAllPasswordResetTokensUsed } from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset-email";
import {
  createUser,
  deleteAllUserSessions,
  deleteUserAccount,
  ensureUserProfile,
  getUserByEmail,
  getUserById,
  requireAdmin,
  setUserPassword,
  countAdmins,
} from "@/lib/auth/user";
import { dbGet } from "@/lib/db";

const DEFAULT_PASSWORD = "abc12345";

const createUserSchema = z.object({
  email: z.string().email("Enter a valid email."),
  full_name: z.string().trim().min(1, "Enter the user's name."),
});

const userIdSchema = z.object({
  userId: z.string().min(1, "Missing user id."),
});

function adminFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export async function adminCreateUser(input: {
  email: string;
  full_name: string;
}) {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const admin = await requireAdmin();
    const email = parsed.data.email.trim().toLowerCase();
    const existing = await getUserByEmail(email);
    if (existing) {
      return { ok: false as const, error: "An account with that email already exists." };
    }

    const passwordHash = await hashPassword(DEFAULT_PASSWORD);
    const user = await createUser({
      email,
      passwordHash,
      fullName: parsed.data.full_name,
      mustResetPassword: true,
    });
    await ensureUserProfile(user.id, parsed.data.full_name);
    await writeAuditLog("admin.user_create", "users", user.id, {
      admin_user_id: admin.id,
      default_password: DEFAULT_PASSWORD,
    });
    revalidatePath("/admin-center");
    return { ok: true as const, user, defaultPassword: DEFAULT_PASSWORD };
  } catch (error) {
    return { ok: false as const, error: adminFailureMessage(error) };
  }
}

export async function adminResetUserPassword(input: { userId: string }) {
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const admin = await requireAdmin();
    const passwordHash = await hashPassword(DEFAULT_PASSWORD);
    await setUserPassword(parsed.data.userId, {
      passwordHash,
      mustResetPassword: true,
    });
    await markAllPasswordResetTokensUsed(parsed.data.userId);
    await deleteAllUserSessions(parsed.data.userId);
    await writeAuditLog("admin.password_reset_default", "users", parsed.data.userId, {
      admin_user_id: admin.id,
    });
    revalidatePath("/admin-center");
    return { ok: true as const, defaultPassword: DEFAULT_PASSWORD };
  } catch (error) {
    return { ok: false as const, error: adminFailureMessage(error) };
  }
}

export async function adminCreateRecoveryLink(input: { userId: string }) {
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const admin = await requireAdmin();
    const user = (await dbGet(
      `SELECT id, email, full_name FROM users WHERE id = ?`,
      parsed.data.userId,
    )) as { id: string; email: string; full_name: string | null } | undefined;
    if (!user) {
      return { ok: false as const, error: "User not found." };
    }

    const token = await sendPasswordResetEmail({
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
      preferredAdminId: admin.id,
      kind: "admin_reset",
    });
    await writeAuditLog("admin.password_reset_email", "users", parsed.data.userId, {
      admin_user_id: admin.id,
      expires_at: token.expires_at,
    });
    revalidatePath("/admin-center");
    return {
      ok: true as const,
      emailedTo: user.email,
      expires_at: token.expires_at,
    };
  } catch (error) {
    return { ok: false as const, error: adminFailureMessage(error) };
  }
}

export async function adminDeleteUser(input: { userId: string }) {
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const admin = await requireAdmin();
    const targetId = parsed.data.userId;

    if (targetId === admin.id) {
      return {
        ok: false as const,
        error: "Delete your own account from Privacy & Settings.",
      };
    }

    const user = await getUserById(targetId);
    if (!user) {
      return { ok: false as const, error: "User not found." };
    }

    if (user.is_admin && (await countAdmins()) <= 1) {
      return {
        ok: false as const,
        error: "Cannot delete the only admin account.",
      };
    }

    await writeAuditLog("admin.user_delete", "users", targetId, {
      admin_user_id: admin.id,
      email: user.email,
    });
    await deleteUserAccount(targetId);
    revalidatePath("/admin-center");
    return { ok: true as const, email: user.email };
  } catch (error) {
    return { ok: false as const, error: adminFailureMessage(error) };
  }
}
