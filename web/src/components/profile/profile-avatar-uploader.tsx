"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeProfileAvatar,
  uploadProfileAvatar,
} from "@/app/actions/profile";
import { UserAvatar } from "@/components/ui/user-avatar";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 256;
const OUTPUT_TYPE = "image/jpeg";
const OUTPUT_QUALITY = 0.88;

async function resizeImageFile(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (JPEG, PNG, or WebP).");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Image must be under 8 MB.");
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");

  const scale = Math.max(
    OUTPUT_SIZE / bitmap.width,
    OUTPUT_SIZE / bitmap.height,
  );
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.drawImage(bitmap, (OUTPUT_SIZE - w) / 2, (OUTPUT_SIZE - h) / 2, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, OUTPUT_TYPE, OUTPUT_QUALITY),
  );
  if (!blob) throw new Error("Could not encode image.");
  return blob;
}

export function ProfileAvatarUploader({
  avatarSrc,
  name,
  size = 56,
}: {
  avatarSrc?: string | null;
  name?: string | null;
  size?: 56 | 64;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const displaySrc = preview ?? avatarSrc;

  function onPick() {
    inputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const blob = await resizeImageFile(file);
        const localUrl = URL.createObjectURL(blob);
        setPreview(localUrl);

        const fd = new FormData();
        fd.set("avatar", new File([blob], "avatar.jpg", { type: OUTPUT_TYPE }));
        const result = await uploadProfileAvatar(fd);
        if (!result.ok) {
          setPreview(null);
          setError(result.error);
          return;
        }
        setMessage("Profile photo updated.");
        router.refresh();
      } catch (err) {
        setPreview(null);
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  function onRemove() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await removeProfileAvatar();
      if (!result.ok) {
        setError("Could not remove photo.");
        return;
      }
      setPreview(null);
      setMessage("Profile photo removed.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPick}
          disabled={pending}
          className="relative group rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
          aria-label="Change profile photo"
          title="Change photo"
        >
          <UserAvatar src={displaySrc} name={name} size={size} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="material-symbols-outlined text-white text-[22px]">
              photo_camera
            </span>
          </span>
        </button>
        <div className="min-w-0 space-y-1">
          <p className="text-[13px] font-semibold text-on-surface">
            Profile photo
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPick}
              disabled={pending}
              className="text-[13px] font-semibold text-primary hover:underline disabled:opacity-50"
            >
              {pending ? "Uploading…" : "Upload photo"}
            </button>
            {displaySrc ? (
              <button
                type="button"
                onClick={onRemove}
                disabled={pending}
                className="text-[13px] font-semibold text-on-surface-variant hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onFileChange}
      />
      {error ? (
        <p className="text-[12px] text-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-[12px] text-success" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
