"use client";

import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  generateCv,
  loadCvVersionForEdit,
  saveBuilderProfile,
  setCvAsMasterResume,
} from "@/app/actions/builder";
import { FieldPicker } from "@/components/builder/field-picker";
import { LivePreview } from "@/components/builder/live-preview";
import { StringListEditor } from "@/components/builder/string-list-editor";
import type { BuilderCvVersion } from "@/lib/builder/queries";
import {
  SECTION_LABELS,
  resolveSectionOrder,
  type SectionName,
} from "@/lib/builder/latex-engine";
import type { MasterResumeSource } from "@/lib/db/types";
import { describeMasterSource } from "@/lib/resume/master-source";
import {
  FIELD_CONFIG,
  LINK_LABELS,
  secondaryLinks,
  type ContactLinkKey,
} from "@/lib/builder/field-config";
import {
  FIELD_LABELS,
  type BuilderEducation,
  type BuilderExperience,
  type BuilderProfile,
  type BuilderProject,
  type BuilderSkillCategory,
} from "@/lib/builder/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAppDateTime } from "@/lib/datetime/india";

const FIELD_CLASS =
  "w-full rounded-lg border border-border-hairline bg-surface px-3 py-2 text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary";

export function BuilderWorkspace({
  initialProfile,
  initialVersions,
  hasChosenField,
  googleConnected,
  initialMasterSource,
  initialMasterSourceRef,
}: {
  initialProfile: BuilderProfile;
  initialVersions: BuilderCvVersion[];
  /** False on first visit — the industry step is shown before the form. */
  hasChosenField: boolean;
  /** Drive actions need Google; downloads and editing do not. */
  googleConnected: boolean;
  /** Which route produced the master resume Apply uses right now. */
  initialMasterSource: MasterResumeSource | null;
  /** Builder version id when the master came from here — else null. */
  initialMasterSourceRef: string | null;
}) {
  const [profile, setProfile] = useState<BuilderProfile>(initialProfile);
  const [versions, setVersions] = useState(initialVersions);
  const [pickingField, setPickingField] = useState(!hasChosenField);
  /** Secondary links the user opened by hand (e.g. GitHub on a design CV). */
  const [extraLinks, setExtraLinks] = useState<ContactLinkKey[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Only one resume can be the master, and it is not always this page's — a
  // later Drive pick or device upload replaces it. Tracking the live source
  // here is what stops an old built CV from claiming "In use" forever.
  const [masterSource, setMasterSource] = useState(initialMasterSource);
  const [masterSourceRef, setMasterSourceRef] = useState(initialMasterSourceRef);
  /**
   * One editor section open at a time.
   *
   * Fully expanded the form ran several screens long, so reaching a later
   * section meant scrolling past everything above it. An accordion keeps the
   * column short enough that any section stays one click away.
   */
  const [openSection, setOpenSection] = useState<string>("basics");
  function toggleSection(id: string) {
    setOpenSection((current) => (current === id ? "" : id));
  }

  /**
   * Height of the two-column area, measured rather than hard-coded.
   *
   * A `calc(100vh - 10.5rem)` guess has to assume how tall the header above is,
   * and that header wraps differently per industry and window width — leaving
   * the page scrolling by whatever the guess was off by. Measuring where the
   * grid actually starts pins its bottom edge to the window every time.
   */
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [gridHeight, setGridHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!gridEl) return;
    const update = () => {
      // Below `lg` the columns stack and the page scrolls normally.
      if (!window.matchMedia("(min-width: 64rem)").matches) {
        setGridHeight(null);
        return;
      }
      const top = gridEl.getBoundingClientRect().top + window.scrollY;
      const next = Math.max(420, Math.round(window.innerHeight - top - 16));
      setGridHeight((current) => (current === next ? current : next));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [gridEl]);

  // The single source of truth for what this CV contains and in what order —
  // the same call the PDF makes, so form, preview and PDF cannot disagree.
  const activeSections = useMemo(
    () => resolveSectionOrder(profile),
    [profile],
  );
  const fieldConfig = FIELD_CONFIG[profile.professional_field];
  const unusedSkillSuggestions = useMemo(() => {
    const taken = new Set(
      (profile.skills ?? []).map((s) => s.category_name.trim().toLowerCase()),
    );
    return fieldConfig.skillSuggestions.filter(
      (name) => !taken.has(name.toLowerCase()),
    );
  }, [fieldConfig, profile.skills]);
  const hiddenLinks = useMemo(
    () =>
      secondaryLinks(profile.professional_field).filter(
        // Keep a link visible once it is opened or already has a value, so
        // switching industry never silently drops something the user typed.
        (key) => !extraLinks.includes(key) && !profile.contact[key],
      ),
    [profile.professional_field, profile.contact, extraLinks],
  );

  function patch(next: Partial<BuilderProfile>) {
    setProfile((prev) => ({ ...prev, ...next }));
  }

  function patchContact(next: Partial<BuilderProfile["contact"]>) {
    setProfile((prev) => ({ ...prev, contact: { ...prev.contact, ...next } }));
  }

  function runSave() {
    setError(null);
    setMessage(null);
    start(async () => {
      const res = await saveBuilderProfile(profile);
      if (!res.ok) setError(res.error);
      else setMessage("Saved.");
    });
  }

  function runGenerate() {
    setError(null);
    setMessage(null);
    setBusy("Building your CV — rendering LaTeX and compiling the PDF…");
    start(async () => {
      try {
        const res = await generateCv(profile);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setMessage(
          res.pdf_url
            ? "CV generated and saved to your Drive."
            : "CV generated. Drive upload failed, but the version is saved.",
        );
        setVersions((prev) => [
          {
            id: res.version_id,
            cv_type: "original",
            professional_field: profile.professional_field,
            drive_file_id: null,
            drive_pdf_url: res.pdf_url,
            synced_to_master_at: null,
            parent_version_id: null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      } finally {
        setBusy(null);
      }
    });
  }

  function runEditVersion(versionId: string) {
    setError(null);
    setMessage(null);
    start(async () => {
      const res = await loadCvVersionForEdit(versionId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setProfile(res.profile);
      setMessage(
        "Loaded into the editor. Change what you need, then Generate PDF to make a new version.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function runUseAsMaster(versionId: string) {
    setError(null);
    setMessage(null);
    setBusy("Converting this CV into your master resume Doc…");
    start(async () => {
      try {
        const res = await setCvAsMasterResume(versionId);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setMessage(
          `Master resume updated — ${res.slots} editable slots. Apply is ready.`,
        );
        setMasterSource("builder");
        setMasterSourceRef(res.version_id);
        setVersions((prev) =>
          prev.map((v) =>
            v.id === versionId
              ? { ...v, synced_to_master_at: new Date().toISOString() }
              : v,
          ),
        );
      } finally {
        setBusy(null);
      }
    });
  }

  if (pickingField) {
    return (
      <div className="max-w-3xl mx-auto li-card p-5">
        <FieldPicker
          selected={profile.professional_field}
          onSelect={(field) => {
            patch({ professional_field: field });
            setPickingField(false);
          }}
        />
        <Toasts busy={busy} message={message} error={error} />
      </div>
    );
  }

  // Editor cards keyed exactly like the preview's sections. Rendering them in
  // `activeSections` order is what stops the form from asking for Skills before
  // Projects while the CV prints Projects before Skills.
  const sectionEditors: Partial<Record<SectionName, React.ReactNode>> = {
    experience: (
      <RepeatableSection<BuilderExperience>
        title="Work experience"
        open={openSection === "experience"}
        onToggle={() => toggleSection("experience")}
        items={profile.experience ?? []}
        onChange={(experience) => patch({ experience })}
        blank={{
          company: "",
          role: "",
          start_date: "",
          end_date: "",
          location: "",
          description: [""],
        }}
        render={(item, update) => (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Company"
                value={item.company}
                onChange={(e) => update({ company: e.target.value })}
              />
              <Input
                placeholder="Role"
                value={item.role}
                onChange={(e) => update({ role: e.target.value })}
              />
              <Input
                placeholder="Location"
                value={item.location ?? ""}
                onChange={(e) => update({ location: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Start"
                  value={item.start_date ?? ""}
                  onChange={(e) => update({ start_date: e.target.value })}
                />
                <Input
                  placeholder="End"
                  value={item.end_date ?? ""}
                  onChange={(e) => update({ end_date: e.target.value })}
                />
              </div>
            </div>
            <StringListEditor
              label="Description / bullet points"
              values={item.description ?? []}
              onChange={(description) => update({ description })}
              placeholder="Led a team of 5 engineers to..."
              addLabel="Add bullet"
            />
          </>
        )}
      />
    ),
    education: (
      <RepeatableSection<BuilderEducation>
        title="Education"
        open={openSection === "education"}
        onToggle={() => toggleSection("education")}
        items={profile.education ?? []}
        onChange={(education) => patch({ education })}
        blank={{
          institution: "",
          degree: "",
          location: "",
          graduation_date: "",
        }}
        render={(item, update) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Institution"
              value={item.institution}
              onChange={(e) => update({ institution: e.target.value })}
            />
            <Input
              placeholder="Degree"
              value={item.degree}
              onChange={(e) => update({ degree: e.target.value })}
            />
            <Input
              placeholder="Location"
              value={item.location ?? ""}
              onChange={(e) => update({ location: e.target.value })}
            />
            <Input
              placeholder="Graduation date"
              value={item.graduation_date ?? ""}
              onChange={(e) => update({ graduation_date: e.target.value })}
            />
          </div>
        )}
      />
    ),
    skills: (
      <RepeatableSection<BuilderSkillCategory>
        title="Skills"
        open={openSection === "skills"}
        onToggle={() => toggleSection("skills")}
        items={profile.skills ?? []}
        onChange={(skills) => patch({ skills })}
        blank={{ category_name: "", skills: [""] }}
        /* Category names that matter in this profession — one tap adds one. */
        footer={
          unusedSkillSuggestions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-on-surface-variant">
                Suggested for {fieldConfig.label}:
              </span>
              {unusedSkillSuggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() =>
                    patch({
                      skills: [
                        ...(profile.skills ?? []),
                        { category_name: name, skills: [] },
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-outline-variant px-2.5 py-1 text-[12px] font-semibold text-on-surface-variant hover:text-on-surface hover:bg-[var(--ghost-hover)]"
                >
                  <span
                    className="material-symbols-outlined text-[14px]"
                    aria-hidden
                  >
                    add
                  </span>
                  {name}
                </button>
              ))}
            </div>
          ) : null
        }
        render={(item, update) => (
          <div className="grid gap-2">
            <Input
              placeholder="Category (e.g. Languages)"
              value={item.category_name}
              onChange={(e) => update({ category_name: e.target.value })}
            />
            <StringListEditor
              values={item.skills ?? []}
              onChange={(skills) => update({ skills })}
              placeholder="Skill..."
              addLabel="Add"
              variant="tag"
            />
          </div>
        )}
      />
    ),
    projects: (
      <RepeatableSection<BuilderProject>
        title="Projects"
        open={openSection === "projects"}
        onToggle={() => toggleSection("projects")}
        items={profile.projects ?? []}
        onChange={(projects) => patch({ projects })}
        blank={{
          name: "",
          demo_link: "",
          technologies: "",
          description: [""],
        }}
        render={(item, update) => (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Project name"
                value={item.name}
                onChange={(e) => update({ name: e.target.value })}
              />
              <Input
                placeholder="Demo link"
                value={item.demo_link ?? ""}
                onChange={(e) => update({ demo_link: e.target.value })}
              />
            </div>
            <Input
              placeholder="Technologies"
              value={item.technologies ?? ""}
              onChange={(e) => update({ technologies: e.target.value })}
            />
            <StringListEditor
              label="Description / bullet points"
              values={item.description ?? []}
              onChange={(description) => update({ description })}
              placeholder="Built an AI agent that..."
              addLabel="Add bullet"
            />
          </>
        )}
      />
    ),
    certifications: (
      <CollapsibleCard
        title="Certifications"
        summary={countSummary(filledCount(profile.certifications), "certification")}
        open={openSection === "certifications"}
        onToggle={() => toggleSection("certifications")}
      >
              <StringListEditor
                values={profile.certifications ?? []}
                onChange={(certifications) => patch({ certifications })}
                placeholder="AWS Solutions Architect - Associate"
                addLabel="Add certification"
              />

      </CollapsibleCard>
    ),
  };

  return (
    <div className="space-y-4">
      <div className="li-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="li-section-title">CV Builder</h1>
          <p className="text-[13px] text-on-surface-variant mt-0.5">
            {FIELD_LABELS[profile.professional_field]} · edits show in the
            preview instantly
          </p>
          {/* "What does picking an industry even do?" — this is the answer,
              stated as the concrete section sequence it produces. */}
          <p className="text-[12px] text-on-surface-variant mt-1">
            <span className="font-semibold">Section order on your CV:</span>{" "}
            {activeSections.map((name) => SECTION_LABELS[name]).join(" → ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPickingField(true)}
            className="inline-flex items-center gap-1.5 li-btn-secondary text-[13px]"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden>
              category
            </span>
            Change industry
          </button>
          <button
            type="button"
            onClick={runGenerate}
            disabled={pending}
            className="inline-flex items-center gap-1.5 li-btn-secondary text-[13px] disabled:opacity-50"
          >
            <span
              className={`material-symbols-outlined text-[16px] ${busy ? "animate-spin" : ""}`}
              aria-hidden
            >
              {busy ? "progress_activity" : "picture_as_pdf"}
            </span>
            {busy ? "Working…" : "Generate PDF"}
          </button>
          <Button type="button" onClick={runSave} disabled={pending}>
            {pending && !busy ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </div>

      {/* On a wide screen the two columns own the rest of the window and scroll
          independently, so the CV is always on screen while you edit.
          `position: sticky` cannot do this here: the app shell sets
          `overflow-x: hidden` on <body>, which makes body a scroll container
          and stops a sticky child from ever pinning to the viewport. */}
      <div
        className="grid gap-4 lg:grid-cols-12"
        ref={setGridEl}
        style={gridHeight ? { height: gridHeight } : undefined}
      >
        {/* Editor — narrower than the preview now: the form is a series of
            short fields, the CV is the thing worth looking at. */}
        <div className="lg:col-span-5 space-y-2 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <CollapsibleCard
            title="Basics"
            summary={profile.name || "Name, summary and contact links"}
            open={openSection === "basics"}
            onToggle={() => toggleSection("basics")}
          >
            <div>
              <Label htmlFor="b-name">Full name *</Label>
              <Input
                id="b-name"
                value={profile.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="b-summary">Professional summary</Label>
              <textarea
                id="b-summary"
                rows={3}
                value={profile.professional_summary ?? ""}
                onChange={(e) => patch({ professional_summary: e.target.value })}
                className={FIELD_CLASS}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["email", "Email"],
                  ["phone", "Phone"],
                  ["location", "Location"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label htmlFor={`b-${key}`}>{label}</Label>
                  <Input
                    id={`b-${key}`}
                    value={profile.contact[key] ?? ""}
                    onChange={(e) => patchContact({ [key]: e.target.value })}
                  />
                </div>
              ))}
              {/* Links this profession is actually judged on. */}
              {fieldConfig.primaryLinks.map((key) => (
                <div key={key}>
                  <Label htmlFor={`b-${key}`}>{LINK_LABELS[key]}</Label>
                  <Input
                    id={`b-${key}`}
                    value={profile.contact[key] ?? ""}
                    onChange={(e) => patchContact({ [key]: e.target.value })}
                  />
                </div>
              ))}
              {extraLinks.map((key) => (
                <div key={key}>
                  <Label htmlFor={`b-${key}`}>{LINK_LABELS[key]}</Label>
                  <Input
                    id={`b-${key}`}
                    value={profile.contact[key] ?? ""}
                    onChange={(e) => patchContact({ [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            {hiddenLinks.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[12px] text-on-surface-variant">
                  More links:
                </span>
                {hiddenLinks.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setExtraLinks((prev) => [...prev, key])}
                    className="inline-flex items-center gap-1 rounded-full border border-outline-variant px-2.5 py-1 text-[12px] font-semibold text-on-surface-variant hover:text-on-surface hover:bg-[var(--ghost-hover)]"
                  >
                    <span
                      className="material-symbols-outlined text-[14px]"
                      aria-hidden
                    >
                      add
                    </span>
                    {LINK_LABELS[key]}
                  </button>
                ))}
              </div>
            ) : null}
          </CollapsibleCard>

          {/* Printed order drives the form order. */}
          {activeSections.map((name) =>
            sectionEditors[name] ? (
              <Fragment key={name}>{sectionEditors[name]}</Fragment>
            ) : null,
          )}

          <CollapsibleCard
            title="Your CVs"
            summary={`Master in use: ${describeMasterSource(masterSource, null)}`}
            open={openSection === "cvs"}
            onToggle={() => toggleSection("cvs")}
          >
            
            {versions.length === 0 ? (
              <p className="text-[13px] text-on-surface-variant">
                Nothing generated yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-lg border border-outline-variant p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-on-surface">
                        {v.professional_field ?? "general"}
                        {v.cv_type === "tailored" ? " · tailored" : ""}
                      </span>
                      <span className="li-meta">
                        {formatAppDateTime(v.created_at)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Always available — rebuilt from stored LaTeX when
                          there is no Drive copy, so Google is never required
                          just to get your own CV. */}
                      <a
                        href={`/api/builder/cv/${v.id}/pdf`}
                        className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                      >
                        <span
                          className="material-symbols-outlined text-[16px]"
                          aria-hidden
                        >
                          download
                        </span>
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={() => runEditVersion(v.id)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline disabled:opacity-50"
                      >
                        <span
                          className="material-symbols-outlined text-[16px]"
                          aria-hidden
                        >
                          edit
                        </span>
                        Edit
                      </button>
                      {v.drive_pdf_url ? (
                        <a
                          href={v.drive_pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[13px] font-semibold text-on-surface-variant hover:underline"
                        >
                          Open in Drive
                        </a>
                      ) : null}
                      {masterSource === "builder" && masterSourceRef === v.id ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-on-success-container bg-success-container rounded-full px-2 py-0.5">
                          <span
                            className="material-symbols-outlined text-[14px]"
                            aria-hidden
                          >
                            check
                          </span>
                          Master resume
                        </span>
                      ) : googleConnected ? (
                        <button
                          type="button"
                          onClick={() => runUseAsMaster(v.id)}
                          disabled={pending}
                          className="text-[13px] font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                        >
                          {v.synced_to_master_at
                            ? "Use as master again"
                            : "Use as master resume"}
                        </button>
                      ) : (
                        // Offer the unblocking step rather than a dead control.
                        <button
                          type="button"
                          onClick={() => {
                            window.location.href = "/api/auth/google/start";
                          }}
                          className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                        >
                          <span
                            className="material-symbols-outlined text-[16px]"
                            aria-hidden
                          >
                            link
                          </span>
                          Connect Google to use as master
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          
          </CollapsibleCard>
        </div>

        {/* Live preview — the wider of the two columns, and the one worth the
            space. It owns its full column height, so scrolling the form beside
            it never moves the CV. */}
        <div className="lg:col-span-7 lg:h-full lg:min-h-0">
          <LivePreview data={profile} />
        </div>
      </div>

      <Toasts busy={busy} message={message} error={error} />
    </div>
  );
}

function Toasts({
  busy,
  message,
  error,
}: {
  busy: string | null;
  message: string | null;
  error: string | null;
}) {
  return (
    <>
      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 max-w-sm flex items-start gap-2 bg-surface-container-high text-on-surface border border-outline-variant px-4 py-3 rounded-lg shadow-[var(--shadow-card)] text-sm"
        >
          <span
            className="material-symbols-outlined animate-spin text-[18px] text-primary shrink-0"
            aria-hidden
          >
            progress_activity
          </span>
          <span>
            {busy}
            <span className="block text-[12px] text-on-surface-variant mt-0.5">
              This can take up to a minute — keep this tab open.
            </span>
          </span>
        </div>
      )}
      {!busy && message && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-success-container text-on-success-container border border-success/20 px-4 py-3 rounded-lg shadow-[var(--shadow-card)] text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-error-container text-on-error-container border border-error/20 px-4 py-3 rounded-lg shadow-[var(--shadow-card)] text-sm whitespace-pre-line">
          {error}
        </div>
      )}
    </>
  );
}

function filledCount(values: string[] | undefined): number {
  return (values ?? []).filter((v) => v && v.trim()).length;
}

/** "3 entries" / "1 certification" / "Nothing added yet" for a collapsed header. */
function countSummary(count: number, noun = "entry"): string {
  if (count === 0) return "Nothing added yet";
  const plural = noun === "entry" ? "entries" : `${noun}s`;
  return `${count} ${count === 1 ? noun : plural}`;
}

/**
 * One editor section, collapsed unless it is the open one.
 *
 * The collapsed header still says how much is in there, so folding a section
 * away never hides whether it has been filled in.
 */
function CollapsibleCard({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="li-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-3.5 text-left hover:bg-[var(--ghost-hover)]"
      >
        <span className="min-w-0">
          <span className="block li-section-title">{title}</span>
          {summary ? (
            <span className="mt-0.5 block li-meta truncate">{summary}</span>
          ) : null}
        </span>
        <span
          className={`material-symbols-outlined shrink-0 text-[22px] text-on-surface-variant transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          expand_more
        </span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-outline-variant p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** Add / remove / edit a list of structured entries. */
function RepeatableSection<T>({
  title,
  items,
  blank,
  onChange,
  render,
  footer,
  open,
  onToggle,
}: {
  title: string;
  items: T[];
  blank: T;
  onChange: (items: T[]) => void;
  render: (item: T, update: (patch: Partial<T>) => void) => React.ReactNode;
  /** Extra controls under the list — e.g. per-field suggestion chips. */
  footer?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <CollapsibleCard
      title={title}
      summary={countSummary(items.length)}
      open={open}
      onToggle={onToggle}
    >
      {items.length === 0 ? (
        <p className="text-[13px] text-on-surface-variant">Nothing added yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li
              key={index}
              className="relative rounded-lg border border-outline-variant p-3 pt-9 space-y-2"
            >
              {/* Numbered header keeps entries distinguishable, and the delete
                  control sits in the corner instead of as a stray text link. */}
              <div className="absolute inset-x-3 top-2 flex items-center justify-between">
                <span className="li-meta uppercase tracking-wide">
                  {title} {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                  aria-label={`Remove ${title} ${index + 1}`}
                  title="Remove"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                >
                  <span
                    className="material-symbols-outlined text-[16px]"
                    aria-hidden
                  >
                    close
                  </span>
                </button>
              </div>
              {render(item, (patch) =>
                onChange(
                  items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
                ),
              )}
            </li>
          ))}
        </ul>
      )}
      {/* Add sits under the list now — the card header is one big toggle
          button, and a button cannot be nested inside another button. */}
      <button
        type="button"
        onClick={() => onChange([...items, { ...blank }])}
        className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          add
        </span>
        Add {title.toLowerCase()}
      </button>
      {footer}
    </CollapsibleCard>
  );
}
