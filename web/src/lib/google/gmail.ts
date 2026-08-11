import { google } from "googleapis";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleAuthClient = any;

export interface DraftAttachment {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface DraftDriveLink {
  label: string;
  url: string;
}

export class GmailScopeMissingError extends Error {
  constructor(message = "Gmail compose scope missing - reconnect Google.") {
    super(message);
    this.name = "GmailScopeMissingError";
  }
}

function isMissingScopeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /insufficient.*(scope|permission)|403.*gmail|Request had insufficient authentication scopes/i.test(
    message,
  );
}

function encodeBase64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeQuotedPrintableHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function foldBase64(buffer: Buffer): string {
  return buffer.toString("base64").replace(/(.{76})/g, "$1\r\n");
}

export interface CreateDraftInput {
  to: string;
  subject: string;
  bodyHtml: string;
  attachments?: DraftAttachment[];
  driveLinks?: DraftDriveLink[];
  /** When set, draft is created as a reply in an existing Gmail thread. */
  replyTo?: {
    threadId: string;
    rfcMessageId: string;
  };
}

export interface CreateDraftResult {
  draftId: string;
  messageId: string | null;
  threadId: string | null;
  rfcMessageId: string | null;
  attachedFilenames: string[];
  driveLinkLabels: string[];
}

export interface DraftMessageMetadata {
  threadId: string | null;
  rfcMessageId: string | null;
}

function headerValue(
  headers: { name?: string | null; value?: string | null }[] | undefined,
  name: string,
): string | null {
  const found = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return found?.value?.trim() || null;
}

function buildRawMime(input: CreateDraftInput): string {
  let bodyHtml = input.bodyHtml?.trim() || "<p></p>";
  const driveLinks = input.driveLinks ?? [];

  if (driveLinks.length) {
    const linksHtml = driveLinks
      .map(
        (link) =>
          `<p style="margin:12px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;">${link.label}: <a href="${link.url}">${link.url}</a></p>`,
      )
      .join("");
    bodyHtml += linksHtml;
  }

  const boundary = `jobapp_${Date.now().toString(36)}`;
  const attachments = input.attachments ?? [];
  const htmlBase64 = foldBase64(Buffer.from(bodyHtml, "utf8"));

  const lines: string[] = [
    `To: ${input.to}`,
    `Subject: ${encodeQuotedPrintableHeader(input.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (input.replyTo?.rfcMessageId) {
    const messageId = input.replyTo.rfcMessageId.trim();
    lines.splice(2, 0, `In-Reply-To: ${messageId}`, `References: ${messageId}`);
  }

  if (attachments.length === 0) {
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(htmlBase64);
  } else {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(htmlBase64);

    for (const attachment of attachments) {
      lines.push(`--${boundary}`);
      lines.push(
        `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      );
      lines.push("Content-Transfer-Encoding: base64");
      lines.push(
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
      );
      lines.push("");
      lines.push(foldBase64(attachment.buffer));
    }

    lines.push(`--${boundary}--`);
  }

  return lines.join("\r\n");
}

export class GmailClient {
  constructor(private auth: GoogleAuthClient) {}

  private gmail() {
    return google.gmail({ version: "v1", auth: this.auth });
  }

  async createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
    const attachments = (input.attachments ?? []).filter((a) => a.buffer?.length);
    const rawMime = buildRawMime({
      ...input,
      attachments,
      driveLinks: input.driveLinks ?? [],
    });
    const raw = encodeBase64Url(rawMime);

    try {
      const res = await this.gmail().users.drafts.create({
        userId: "me",
        requestBody: {
          message: {
            raw,
            ...(input.replyTo?.threadId
              ? { threadId: input.replyTo.threadId }
              : {}),
          },
        },
      });

      const draftId = res.data.id;
      if (!draftId) {
        throw new Error("Gmail drafts.create returned no draft id.");
      }

      const metadata = await this.getDraftMessageMetadata(draftId);

      return {
        draftId,
        messageId: res.data.message?.id ?? null,
        threadId: metadata.threadId ?? input.replyTo?.threadId ?? null,
        rfcMessageId: metadata.rfcMessageId,
        attachedFilenames: attachments.map((a) => a.filename),
        driveLinkLabels: (input.driveLinks ?? []).map((l) => l.label),
      };
    } catch (error) {
      if (isMissingScopeError(error)) {
        throw new GmailScopeMissingError();
      }
      throw error;
    }
  }

  async getDraftMessageMetadata(draftId: string): Promise<DraftMessageMetadata> {
    try {
      // Prefer drafts.get so we don't require gmail.readonly (messages.get).
      const draftRes = await this.gmail().users.drafts.get({
        userId: "me",
        id: draftId,
        format: "full",
      });
      const threadId = draftRes.data.message?.threadId ?? null;
      const rfcFromDraft = headerValue(
        draftRes.data.message?.payload?.headers,
        "Message-ID",
      );
      if (rfcFromDraft) {
        return { threadId, rfcMessageId: rfcFromDraft };
      }

      const messageId = draftRes.data.message?.id;
      if (!messageId) {
        return { threadId, rfcMessageId: null };
      }

      try {
        const msgRes = await this.gmail().users.messages.get({
          userId: "me",
          id: messageId,
          format: "metadata",
          metadataHeaders: ["Message-ID"],
        });
        return {
          threadId: msgRes.data.threadId ?? threadId,
          rfcMessageId: headerValue(msgRes.data.payload?.headers, "Message-ID"),
        };
      } catch (error) {
        // Missing gmail.readonly — draft metadata alone is enough for most flows.
        if (isMissingScopeError(error)) {
          return { threadId, rfcMessageId: null };
        }
        throw error;
      }
    } catch (error) {
      if (isMissingScopeError(error)) {
        throw new GmailScopeMissingError();
      }
      throw error;
    }
  }

  /** Find a sent message thread by recipient + subject (after draft was sent). */
  async findSentThreadByRecipientAndSubject(
    to: string,
    subject: string,
  ): Promise<DraftMessageMetadata | null> {
    const normalized = subject.replace(/^(Re:\s*)+/i, "").trim();
    const q = `to:${to} subject:"${normalized.replace(/"/g, "")}" in:sent`;

    try {
      const listRes = await this.gmail().users.messages.list({
        userId: "me",
        q,
        maxResults: 5,
      });
      const hit = listRes.data.messages?.[0];
      if (!hit?.id) return null;

      const msgRes = await this.gmail().users.messages.get({
        userId: "me",
        id: hit.id,
        format: "metadata",
        metadataHeaders: ["Message-ID"],
      });

      return {
        threadId: msgRes.data.threadId ?? null,
        rfcMessageId: headerValue(msgRes.data.payload?.headers, "Message-ID"),
      };
    } catch (error) {
      if (isMissingScopeError(error)) {
        return null;
      }
      throw error;
    }
  }

  async sendMessage(input: CreateDraftInput): Promise<{ messageId: string | null }> {
    const attachments = (input.attachments ?? []).filter((a) => a.buffer?.length);
    const rawMime = buildRawMime({
      ...input,
      attachments,
      driveLinks: input.driveLinks ?? [],
    });
    const raw = encodeBase64Url(rawMime);

    try {
      const res = await this.gmail().users.messages.send({
        userId: "me",
        requestBody: { raw },
      });
      return { messageId: res.data.id ?? null };
    } catch (error) {
      if (isMissingScopeError(error)) {
        throw new GmailScopeMissingError(
          "Gmail compose scope missing - reconnect Google.",
        );
      }
      throw error;
    }
  }

  async getDraft(draftId: string): Promise<boolean> {
    try {
      await this.gmail().users.drafts.get({
        userId: "me",
        id: draftId,
        format: "minimal",
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/404|notFound|Requested entity was not found/i.test(message)) {
        return false;
      }
      if (isMissingScopeError(error)) {
        throw new GmailScopeMissingError();
      }
      throw error;
    }
  }
}
