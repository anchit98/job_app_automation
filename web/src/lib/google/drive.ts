import { Readable } from "stream";
import { google } from "googleapis";
import { getProfileRow, setDriveRootId } from "@/lib/db/queries";
import { DRIVE_ROOT_FOLDER_NAME } from "@/lib/db/types";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const MASTER_FOLDER_NAME = "_Master";
const MASTER_TEMPLATE_NAME = "Master_Resume_Template";
const COVER_LETTER_TEMPLATE_NAME = "Master_Cover_Letter_Template";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type GoogleAuthClient = InstanceType<typeof google.auth.OAuth2>;

function isDriveAccessDenied(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "");
  const status =
    typeof error === "object" &&
    error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "number"
      ? (error as { code: number }).code
      : null;
  if (status === 403 || status === 404) return true;
  return /not found|file not found|insufficient|permission|forbidden|403|404/i.test(
    message,
  );
}

export class DriveClient {
  private rootFolderId: string | null = null;
  private folderCache = new Map<string, string>();

  constructor(private auth: GoogleAuthClient) {}

  private drive() {
    return google.drive({ version: "v3", auth: this.auth });
  }

  private docs() {
    return google.docs({ version: "v1", auth: this.auth });
  }

  private async bearerToken(): Promise<string> {
    const result = await this.auth.getAccessToken();
    const token =
      typeof result === "string"
        ? result
        : result && typeof result === "object" && "token" in result
          ? (result as { token?: string | null }).token
          : null;
    if (!token) {
      throw new Error("Google access token unavailable. Reconnect Google.");
    }
    return token;
  }

  private folderCacheKey(name: string, parentId?: string): string {
    return `${parentId ?? "root"}::${name}`;
  }

  async ensureFolder(name: string, parentId?: string): Promise<string> {
    const cacheKey = this.folderCacheKey(name, parentId);
    const cached = this.folderCache.get(cacheKey);
    if (cached) return cached;

    const drive = this.drive();
    const q = [
      `mimeType='${FOLDER_MIME}'`,
      `name='${name.replace(/'/g, "\\'")}'`,
      "trashed=false",
      parentId ? `'${parentId}' in parents` : undefined,
    ]
      .filter(Boolean)
      .join(" and ");

    const existing = await drive.files.list({
      q,
      fields: "files(id,name)",
      spaces: "drive",
      pageSize: 1,
    });

    const found = existing.data.files?.[0]?.id;
    if (found) {
      this.folderCache.set(cacheKey, found);
      return found;
    }

    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: FOLDER_MIME,
        parents: parentId ? [parentId] : undefined,
      },
      fields: "id",
    });

    if (!created.data.id) {
      throw new Error(`Failed to create Drive folder: ${name}`);
    }
    this.folderCache.set(cacheKey, created.data.id);
    return created.data.id;
  }

  async ensureRootFolder(): Promise<string> {
    if (this.rootFolderId) return this.rootFolderId;

    const profile = await getProfileRow();
    if (profile?.drive_root_id) {
      this.rootFolderId = profile.drive_root_id;
      return this.rootFolderId;
    }

    const rootId = await this.ensureFolder(DRIVE_ROOT_FOLDER_NAME);
    await setDriveRootId(rootId);
    this.rootFolderId = rootId;
    return rootId;
  }

  async ensureApplicationFolder(application: {
    company: string | null;
    role: string | null;
  }): Promise<string> {
    const rootId = await this.ensureRootFolder();
    const company = application.company?.trim() || "Unknown Company";
    const role = application.role?.trim() || "Unknown Role";
    const folderName = `${company} - ${role}`.replace(/[\\/:*?"<>|]/g, "-");
    return this.ensureFolder(folderName, rootId);
  }

  async uploadFile(
    buffer: Buffer,
    name: string,
    mimeType: string,
    parentId: string,
  ): Promise<string> {
    const drive = this.drive();
    const created = await drive.files.create({
      requestBody: {
        name,
        parents: [parentId],
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: "id,webViewLink",
    });

    if (!created.data.id) {
      throw new Error(`Failed to upload file: ${name}`);
    }
    return created.data.id;
  }

  async getFile(fileId: string): Promise<Buffer> {
    const drive = this.drive();
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );
    return Buffer.from(res.data as ArrayBuffer);
  }

  async getWebViewLink(fileId: string): Promise<string | null> {
    const drive = this.drive();
    const res = await drive.files.get({
      fileId,
      fields: "webViewLink",
    });
    return res.data.webViewLink ?? null;
  }

  /**
   * Metadata probe before Docs sync — distinguishes Word uploads vs
   * drive.file access denied on a pasted Doc URL.
   */
  async getFileMetadata(fileId: string): Promise<{
    id: string;
    name: string | null;
    mimeType: string | null;
  }> {
    const drive = this.drive();
    const res = await drive.files.get({
      fileId,
      fields: "id,name,mimeType",
      supportsAllDrives: true,
    });
    return {
      id: res.data.id ?? fileId,
      name: res.data.name ?? null,
      mimeType: res.data.mimeType ?? null,
    };
  }

  /**
   * Confirm the file is a Google Doc the user can open.
   * With drive.file, Drive metadata often 404s for Docs the app did not create
   * or Picker-grant; Docs API still works — accept that as readable.
   */
  async assertReadableGoogleDoc(fileId: string): Promise<void> {
    try {
      const meta = await this.getFileMetadata(fileId);
      const mime = meta.mimeType ?? "";
      if (mime === GOOGLE_DOC_MIME) return;
      if (
        /officedocument\.wordprocessingml|msword|application\/octet-stream/i.test(
          mime,
        ) ||
        /\.docx?$/i.test(meta.name ?? "")
      ) {
        throw new Error(
          "Word (.doc/.docx) files on Drive are not supported. In Google Drive, right-click the file → Open with → Google Docs, then use Choose from Drive on the new Google Doc.",
        );
      }
      throw new Error(
        `That Drive file is not a Google Doc (type: ${mime || "unknown"}). Open it with Google Docs first, then use Choose from Drive.`,
      );
    } catch (error) {
      if (!isDriveAccessDenied(error)) throw error;
      try {
        await this.docs().documents.get({
          documentId: fileId,
          fields: "documentId,title",
        });
        return;
      } catch {
        throw error;
      }
    }
  }

  async listInFolder(parentId: string) {
    const drive = this.drive();
    const res = await drive.files.list({
      q: `'${parentId}' in parents and trashed=false`,
      fields: "files(id,name,mimeType,webViewLink,createdTime)",
      pageSize: 100,
    });
    return res.data.files ?? [];
  }

  /**
   * When drive.file cannot Drive-copy an arbitrary source Doc, export via the
   * Docs export URL (works with documents scope) and re-import as a new Doc
   * the app owns under drive.file.
   */
  private async importGoogleDocViaDocsExport(
    sourceDocId: string,
    name: string,
    parentId: string,
  ): Promise<string> {
    const token = await this.bearerToken();
    const exportRes = await fetch(
      `https://docs.google.com/document/d/${sourceDocId}/export?format=docx`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!exportRes.ok) {
      const detail = await exportRes.text().catch(() => "");
      throw new Error(
        `Could not export Google Doc for template copy (${exportRes.status}). ${detail.slice(0, 180)}`,
      );
    }
    const contentType = exportRes.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await exportRes.arrayBuffer());
    if (
      buffer.length < 64 ||
      /text\/html/i.test(contentType) ||
      buffer.subarray(0, 15).toString("utf8").includes("<!DOCTYPE")
    ) {
      throw new Error(
        "Could not export that Google Doc. Open it in Docs, confirm you own it, then try Choose from Drive again.",
      );
    }

    const drive = this.drive();
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: GOOGLE_DOC_MIME,
        parents: [parentId],
      },
      media: {
        mimeType: DOCX_MIME,
        body: Readable.from(buffer),
      },
      fields: "id",
      supportsAllDrives: true,
    });
    if (!created.data.id) {
      throw new Error(`Failed to import Google Doc template: ${name}`);
    }
    return created.data.id;
  }

  /**
   * Prefer native Drive copy (works after Picker / app-owned files). Fall back
   * to Docs export → Drive import so pasted Doc URLs still sync under drive.file.
   */
  private async copyOrImportGoogleDoc(
    sourceDocId: string,
    name: string,
    parentId: string,
  ): Promise<string> {
    try {
      return await this.copyFile(sourceDocId, name, parentId);
    } catch (error) {
      if (!isDriveAccessDenied(error)) throw error;
      return this.importGoogleDocViaDocsExport(sourceDocId, name, parentId);
    }
  }

  /**
   * Copy the user's master Google Doc into the app-owned Drive folder so
   * later copies/exports work with the narrower drive.file scope.
   */
  async ensureMasterTemplateCopy(sourceDocId: string): Promise<string> {
    const rootId = await this.ensureRootFolder();
    const masterFolderId = await this.ensureFolder(MASTER_FOLDER_NAME, rootId);
    const existing = await this.listInFolder(masterFolderId);
    const oldTemplate = existing.find(
      (file) =>
        file.name === MASTER_TEMPLATE_NAME &&
        file.mimeType === GOOGLE_DOC_MIME,
    );
    if (oldTemplate?.id) {
      await this.deleteFile(oldTemplate.id);
    }
    return this.copyOrImportGoogleDoc(
      sourceDocId,
      MASTER_TEMPLATE_NAME,
      masterFolderId,
    );
  }

  async ensureCoverLetterTemplateCopy(sourceDocId: string): Promise<string> {
    const rootId = await this.ensureRootFolder();
    const masterFolderId = await this.ensureFolder(MASTER_FOLDER_NAME, rootId);
    const existing = await this.listInFolder(masterFolderId);
    const oldTemplate = existing.find(
      (file) =>
        file.name === COVER_LETTER_TEMPLATE_NAME &&
        file.mimeType === GOOGLE_DOC_MIME,
    );
    if (oldTemplate?.id) {
      await this.deleteFile(oldTemplate.id);
    }
    return this.copyOrImportGoogleDoc(
      sourceDocId,
      COVER_LETTER_TEMPLATE_NAME,
      masterFolderId,
    );
  }

  async copyFile(
    sourceId: string,
    name: string,
    parentId?: string,
  ): Promise<string> {
    const drive = this.drive();
    const created = await drive.files.copy({
      fileId: sourceId,
      requestBody: {
        name,
        parents: parentId ? [parentId] : undefined,
      },
      fields: "id",
      supportsAllDrives: true,
    });
    if (!created.data.id) {
      throw new Error(`Failed to copy file ${sourceId} to ${name}`);
    }
    return created.data.id;
  }

  async exportAsPdf(fileId: string): Promise<Buffer> {
    const drive = this.drive();
    const res = await drive.files.export(
      { fileId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" },
    );
    return Buffer.from(res.data as ArrayBuffer);
  }

  async exportAsDocx(fileId: string): Promise<Buffer> {
    const drive = this.drive();
    const res = await drive.files.export(
      {
        fileId,
        mimeType: DOCX_MIME,
      },
      { responseType: "arraybuffer" },
    );
    return Buffer.from(res.data as ArrayBuffer);
  }

  async createGoogleDoc(name: string, parentId: string): Promise<string> {
    const drive = this.drive();
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: GOOGLE_DOC_MIME,
        parents: [parentId],
      },
      fields: "id",
    });
    if (!created.data.id) {
      throw new Error(`Failed to create Google Doc: ${name}`);
    }
    return created.data.id;
  }

  async deleteFile(fileId: string): Promise<void> {
    const drive = this.drive();
    await drive.files.delete({ fileId });
  }

  async renameFile(fileId: string, name: string): Promise<void> {
    const drive = this.drive();
    await drive.files.update({
      fileId,
      requestBody: { name },
    });
  }
}
