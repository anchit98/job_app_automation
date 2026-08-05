function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  appUrl: () => optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  databaseUrl: () => required("DATABASE_URL"),
  /** Used to sign session cookies - generate with: openssl rand -base64 32 */
  authSecret: () => required("AUTH_SECRET"),
  googleClientId: () => required("GOOGLE_OAUTH_CLIENT_ID"),
  googleClientSecret: () => required("GOOGLE_OAUTH_CLIENT_SECRET"),
  googleRedirectUri: () =>
    optional(
      "GOOGLE_OAUTH_REDIRECT_URI",
      `${optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000")}/api/auth/google/callback`,
    ),
  googleTokenEncryptionKey: () => required("GOOGLE_TOKEN_ENCRYPTION_KEY"),
  resumeMasterDocId: () => optional("RESUME_MASTER_DOC_ID"),
  coverLetterMasterDocId: () =>
    optional(
      "COVER_LETTER_MASTER_DOC_ID",
      "1niJmOSYR6oL1rc4aX08oVWc7cCwE8dXtXNrwsmO3nh4",
    ),
  /** Displayed on the billing paywall for manual UPI transfer */
  upiId: () => optional("NEXT_PUBLIC_UPI_ID", optional("UPI_ID")),
  paymentAmountInr: () =>
    optional("NEXT_PUBLIC_PAYMENT_AMOUNT_INR", optional("PAYMENT_AMOUNT_INR", "299")),
  paymentPlanLabel: () =>
    optional(
      "NEXT_PUBLIC_PAYMENT_PLAN_LABEL",
      optional("PAYMENT_PLAN_LABEL", "Launch offer · 60 apps · lifetime access"),
    ),
  /** Optional override for payment-claim alert recipients (comma-separated). */
  adminNotifyEmail: () => optional("ADMIN_NOTIFY_EMAIL"),
  /** Razorpay Key ID (server). Also accepts legacy Razorpay_API_KEY. */
  razorpayKeyId: () =>
    optional("RAZORPAY_KEY_ID", optional("Razorpay_API_KEY")),
  /** Razorpay Key Secret (server only). Also accepts Razorpay_LIVE_KEY_SECRET. */
  razorpayKeySecret: () =>
    optional("RAZORPAY_KEY_SECRET", optional("Razorpay_LIVE_KEY_SECRET")),
  /** Razorpay webhook signing secret (server only). */
  razorpayWebhookSecret: () =>
    optional("RAZORPAY_WEBHOOK_SECRET", optional("Razorpay_Webhook_Secret")),
  /** Public Key ID for Checkout.js */
  razorpayPublicKeyId: () =>
    optional(
      "NEXT_PUBLIC_RAZORPAY_KEY_ID",
      optional("RAZORPAY_KEY_ID", optional("Razorpay_API_KEY")),
    ),
};

export function hasRazorpayConfig(): boolean {
  return Boolean(env.razorpayKeyId() && env.razorpayKeySecret());
}

export function hasGoogleConfig(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  );
}

export function hasCoreConfig(): boolean {
  return hasGoogleConfig() && Boolean(process.env.DATABASE_URL);
}
