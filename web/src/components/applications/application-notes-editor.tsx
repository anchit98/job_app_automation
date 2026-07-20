"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState, useTransition } from "react";
import { updateApplicationNotes } from "@/app/actions/tracker";

function plainTextToHtml(text: string): string {
  if (!text.trim()) return "<p></p>";
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

interface ApplicationNotesEditorProps {
  applicationId: string;
  initialNotes: string | null;
  initialHtml?: string | null;
}

export function ApplicationNotesEditor({
  applicationId,
  initialNotes,
  initialHtml,
}: ApplicationNotesEditorProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialHtml || plainTextToHtml(initialNotes ?? ""),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[160px] w-full rounded-lg border border-outline-variant bg-surface-container-high p-4 text-[14px] leading-relaxed focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const html = initialHtml || plainTextToHtml(initialNotes ?? "");
    if (editor.getHTML() !== html) {
      editor.commands.setContent(html, { emitUpdate: false });
    }
  }, [editor, initialHtml, initialNotes]);

  function save() {
    if (!editor) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateApplicationNotes(applicationId, editor.getHTML());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Notes saved.");
    });
  }

  if (!editor) {
    return (
      <div className="min-h-[160px] animate-pulse rounded-lg border border-outline-variant bg-surface-container-high" />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="Bold"
        />
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          label="Bullets"
        />
      </div>
      <EditorContent editor={editor} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="px-4 py-2 rounded-full bg-primary text-on-primary text-[13px] font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save notes"}
        </button>
        {message && <span className="text-[12px] text-success-container">{message}</span>}
        {error && <span className="text-[12px] text-error">{error}</span>}
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] font-medium border ${
        active
          ? "bg-primary text-on-primary border-primary"
          : "bg-surface-container-high text-on-surface-variant border-outline-variant"
      }`}
    >
      {label}
    </button>
  );
}
