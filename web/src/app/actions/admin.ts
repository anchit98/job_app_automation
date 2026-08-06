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
  setUserPaid,
  setUserAdmin,
  countAdmins,
} from "@/lib/auth/user";
import {
  getPaymentClaimById,
  reviewPaymentClaim,
} from "@/lib/billing/payment-claims";
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
    revalidatePath("/admin-center", "page");
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

const claimIdSchema = z.object({
  claimId: z.string().min(1, "Missing claim id."),
});

export async function adminApprovePaymentClaim(input: { claimId: string }) {
  const parsed = claimIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const admin = await requireAdmin();
    const claim = await getPaymentClaimById(parsed.data.claimId);
    if (!claim) {
      return { ok: false as const, error: "Payment claim not found." };
    }
    if (claim.status !== "pending") {
      return { ok: false as const, error: "This claim was already reviewed." };
    }

    await reviewPaymentClaim({
      claimId: claim.id,
      status: "approved",
      adminId: admin.id,
    });
    await setUserPaid(claim.user_id, true);
    await writeAuditLog("admin.payment_approved", "payment_claims", claim.id, {
      admin_user_id: admin.id,
      user_id: claim.user_id,
      upi_reference: claim.upi_reference,
    });
    revalidatePath("/admin-center");
    revalidatePath("/billing");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: adminFailureMessage(error) };
  }
}

export async function adminRejectPaymentClaim(input: { claimId: string }) {
  const parsed = claimIdSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const admin = await requireAdmin();
    const claim = await getPaymentClaimById(parsed.data.claimId);
    if (!claim) {
      return { ok: false as const, error: "Payment claim not found." };
    }
    if (claim.status !== "pending") {
      return { ok: false as const, error: "This claim was already reviewed." };
    }

    await reviewPaymentClaim({
      claimId: claim.id,
      status: "rejected",
      adminId: admin.id,
    });
    await writeAuditLog("admin.payment_rejected", "payment_claims", claim.id, {
      admin_user_id: admin.id,
      user_id: claim.user_id,
      upi_reference: claim.upi_reference,
    });
    revalidatePath("/admin-center");
    revalidatePath("/billing");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: adminFailureMessage(error) };
  }
}

export async function adminSetUserPaid(input: {
  userId: string;
  paid: boolean;
}) {
  const parsed = z
    .object({
      userId: z.string().min(1),
      paid: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const admin = await requireAdmin();
    const user = await getUserById(parsed.data.userId);
    if (!user) {
      return { ok: false as const, error: "User not found." };
    }

    await setUserPaid(parsed.data.userId, parsed.data.paid);
    await writeAuditLog(
      parsed.data.paid ? "admin.user_marked_paid" : "admin.user_access_revoked",
      "users",
      parsed.data.userId,
      { admin_user_id: admin.id, email: user.email },
    );
    revalidatePath("/admin-center", "page");
    revalidatePath("/billing");
    return { ok: true as const, email: user.email, paid: parsed.data.paid };
  } catch (error) {
    return { ok: false as const, error: adminFailureMessage(error) };
  }
}

export async function adminSetUserAdmin(input: {
  userId: string;
  isAdmin: boolean;
}) {
  const parsed = z
    .object({
      userId: z.string().min(1),
      isAdmin: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  try {
    const admin = await requireAdmin();
    const user = await getUserById(parsed.data.userId);
    if (!user) {
      return { ok: false as const, error: "User not found." };
    }

    if (!parsed.data.isAdmin) {
      if (parsed.data.userId === admin.id) {
        return {
          ok: false as const,
          error: "You cannot remove your own admin role here.",
        };
      }
      if (user.is_admin && (await countAdmins()) <= 1) {
        return {
          ok: false as const,
          error: "Cannot remove the only admin.",
        };
      }
    }

    await setUserAdmin(parsed.data.userId, parsed.data.isAdmin);
    await writeAuditLog(
      parsed.data.isAdmin ? "admin.user_promoted" : "admin.user_demoted",
      "users",
      parsed.data.userId,
      { admin_user_id: admin.id, email: user.email },
    );
    revalidatePath("/admin-center");
    return {
      ok: true as const,
      email: user.email,
      isAdmin: parsed.data.isAdmin,
    };
  } catch (error) {
    return { ok: false as const, error: adminFailureMessage(error) };
  }
}
