"use client";

import { useState } from "react";

type PickerTokenResponse = {
  accessToken: string;
  clientId: string;
  apiKey: string | null;
  appId: string | null;
  error?: string;
};

export type PickerDoc = {
  id: string;
  name: string;
  url: string;
};

type PickerCallbackData = {
  action: string;
  docs?: Array<{
    id: string;
    name: string;
    url?: string;
    mimeType?: string;
  }>;
};

declare global {
  interface Window {
    gapi?: { load: (api: string, cb: () => void) => void };
    // Google Picker global — typed loosely; surface changes often.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: { picker: any };
  }
}

const PICKER_KEY_HINT =
  "Google Picker rejected the API key. In the same Cloud project as OAuth: (1) enable Google Picker API, (2) edit the Browser API key → Application restrictions = None (for local test) or allow http://localhost:3000/* and https://docs.google.com/*, (3) API restrictions must include Google Picker API + Google Drive API (or Don’t restrict key). Then restart npm run dev.";

let gapiPromise: Promise<void> | null = null;

function loadGapiPicker(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Picker only runs in the browser."));
  }
  if (window.google?.picker) return Promise.resolve();
  if (gapiPromise) return gapiPromise;

  gapiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-jobapp-gapi="1"]',
    );
    const onReady = () => {
      if (!window.gapi?.load) {
        reject(new Error("Google API script loaded but gapi is missing."));
        return;
      }
      window.gapi.load("picker", () => resolve());
    };
    if (existing) {
      if (window.gapi) onReady();
      else existing.addEventListener("load", onReady);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.dataset.jobappGapi = "1";
    script.onload = onReady;
    script.onerror = () =>
      reject(new Error("Failed to load Google Picker script."));
    document.body.appendChild(script);
  });

  return gapiPromise;
}

function clientEnvApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY?.trim();
  return key || null;
}

function clientEnvAppId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_APP_ID?.trim();
  return id || null;
}

async function fetchPickerAuth(): Promise<PickerTokenResponse> {
  const res = await fetch("/api/google/access-token", {
    credentials: "same-origin",
  });
  const data = (await res.json()) as PickerTokenResponse;
  if (!res.ok) {
    throw new Error(data.error || "Could not get Google access token.");
  }
  // Prefer live server key; fall back to build-time public env.
  const apiKey = data.apiKey?.trim() || clientEnvApiKey();
  if (!apiKey) {
    throw new Error(
      "Google Picker API key is not configured. Add NEXT_PUBLIC_GOOGLE_API_KEY to web/.env.local and restart the dev server.",
    );
  }
  return {
    ...data,
    apiKey,
    appId: data.appId?.trim() || clientEnvAppId(),
  };
}

/**
 * Open Google Picker for a single Google Doc. Grants drive.file access to the
 * chosen file so sync works without drive.readonly.
 *
 * Builder matches Google's web-picker sample (ViewId + setAppId + developer key).
 * We intentionally do not call setOrigin — on localhost it often surfaces as
 * “The API developer key is invalid” even when the key is fine.
 */
export async function pickGoogleDoc(
  title = "Choose a Google Doc",
): Promise<PickerDoc | null> {
  const auth = await fetchPickerAuth();
  await loadGapiPicker();
  const pickerApi = window.google?.picker;
  if (!pickerApi) {
    throw new Error("Google Picker failed to initialize.");
  }

  return new Promise((resolve, reject) => {
    try {
      // Official sample uses ViewId.DOCS / DOCUMENTS — DocsView+mime filters
      // are fine, but keep close to Google's reference for fewer key quirks.
      const view = new pickerApi.DocsView(pickerApi.ViewId.DOCUMENTS)
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let builder: any = new pickerApi.PickerBuilder()
        .addView(view)
        .setOAuthToken(auth.accessToken)
        .setDeveloperKey(auth.apiKey)
        .setTitle(title)
        .setMaxItems(1)
        .setCallback((data: PickerCallbackData) => {
          if (data.action === pickerApi.Action.CANCEL) {
            resolve(null);
            return;
          }
          if (data.action === pickerApi.Action.ERROR) {
            reject(new Error(PICKER_KEY_HINT));
            return;
          }
          if (data.action === pickerApi.Action.PICKED) {
            const doc = data.docs?.[0];
            if (!doc?.id) {
              reject(new Error("No document selected."));
              return;
            }
            if (
              doc.mimeType &&
              doc.mimeType !== "application/vnd.google-apps.document"
            ) {
              reject(
                new Error(
                  "Please choose a Google Doc (not Word/PDF). In Drive: right-click → Open with → Google Docs, then pick that Doc.",
                ),
              );
              return;
            }
            resolve({
              id: doc.id,
              name: doc.name || "Google Doc",
              url:
                doc.url ||
                `https://docs.google.com/document/d/${doc.id}/edit`,
            });
          }
        });

      // App ID = Cloud project number (same project as OAuth + API key).
      if (auth.appId) {
        builder = builder.setAppId(String(auth.appId));
      }

      const picker = builder.build();
      picker.setVisible(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Picker failed.";
      if (/developer key|api key|invalid/i.test(msg)) {
        reject(new Error(PICKER_KEY_HINT));
        return;
      }
      reject(e instanceof Error ? e : new Error("Picker failed."));
    }
  });
}

export function GoogleDocPickerButton({
  label = "Choose from Drive",
  title = "Choose a Google Doc",
  disabled,
  onPicked,
  onError,
}: {
  label?: string;
  title?: string;
  disabled?: boolean;
  onPicked: (doc: PickerDoc) => void;
  onError?: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);

  async function open() {
    setPending(true);
    try {
      const doc = await pickGoogleDoc(title);
      if (doc) onPicked(doc);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Picker failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => void open()}
      className="inline-flex items-center gap-1.5 li-btn-secondary text-[13px] disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[16px]" aria-hidden>
        folder_open
      </span>
      {pending ? "Opening…" : label}
    </button>
  );
}
