/**
 * Write a builder CV straight into a Google Doc, instead of round-tripping it
 * through Drive's PDF importer.
 *
 * The master resume has to be a Doc — Apply copies it and swaps text with
 * replaceAllText — and until now a CV built in the app got there the long way:
 * LaTeX → PDF → Drive PDF import → repair pass. Every step of that lost
 * something. Drive's importer reads only what the page looks like, so the
 * two-column role rows collapsed into one run of words, the FontAwesome
 * contact icons came back as "Æ" and "½", every hyperlink was dropped, and the
 * rebuild inherited the 25pt heading size from the top of the converted page
 * and printed the whole resume at it.
 *
 * None of that is necessary. The builder already holds the CV as data, so the
 * Doc is written from the same profile the PDF is compiled from — same section
 * order (resolveSectionOrder), same headings, real bullets, live links.
 *
 * The slot map is produced here too. Reading the structure back out of a Doc we
 * just wrote would be guessing at something we already know, and a heuristic
 * that guesses wrong costs the user a broken Apply.
 */
import type { DocSlot, StructuredDocLine } from "@/lib/google/docs";
import {
  SECTION_LABELS,
  type SectionName,
  normalizeLinkUrl,
  resolveSectionOrder,
} from "@/lib/builder/latex-engine";
import type {
  BuilderCustomSection,
  BuilderProfile,
} from "@/lib/builder/types";
import { countWords } from "@/lib/resume/bullet-layout";
import type { SyncedMasterResume } from "@/lib/resume/master-sync";

/** Right-hand column separator. Docs has no writable tab stops, so a single
 * tab is what puts dates in their own column — and it is also what
 * master-sync splits a role row on. */
const COL = "\t";

type MasterContent = SyncedMasterResume["content"];

export interface BuiltMasterDoc {
  lines: StructuredDocLine[];
  content: MasterContent;
  slots: DocSlot[];
}

function clean(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function joinParts(parts: Array<string | undefined>, sep = ", "): string {
  return parts.map(clean).filter(Boolean).join(sep);
}

/** "Apr 2024 - Present", or nothing when neither end is filled in. */
function dateRange(start?: string, end?: string): string {
  const from = clean(start);
  const to = clean(end);
  if (from && to) return `${from} - ${to}`;
  return from || to;
}

/**
 * Section titles as the Doc prints them.
 *
 * Upper case: it is how the compiled PDF renders them (\scshape small caps),
 * and master-sync's section markers anchor on the whole line, so a title that
 * reads exactly "WORK EXPERIENCE" can never be mistaken for content when the
 * Doc is synced again later.
 */
function docHeading(name: SectionName): string {
  return SECTION_LABELS[name].toUpperCase();
}

/**
 * The contact row, with the links attached to the labels that carry them.
 *
 * Same items in the same order as the compiled PDF's header, so the two
 * documents read identically — the difference is that here "LinkedIn" is a
 * real hyperlink rather than a glyph the PDF importer could not carry over.
 */
function contactLine(profile: BuilderProfile): StructuredDocLine | null {
  const contact = profile.contact ?? {};
  const parts: Array<{ text: string; url?: string }> = [];

  const phone = clean(contact.phone);
  if (phone) parts.push({ text: phone, url: `tel:${phone.replace(/\s+/g, "")}` });
  const email = clean(contact.email);
  if (email) parts.push({ text: email, url: `mailto:${email}` });
  if (clean(contact.linkedin)) {
    parts.push({ text: "LinkedIn", url: clean(contact.linkedin) });
  }
  if (clean(contact.github)) {
    parts.push({ text: "GitHub", url: clean(contact.github) });
  }
  if (clean(contact.portfolio)) {
    parts.push({ text: "Portfolio", url: clean(contact.portfolio) });
  }
  if (clean(contact.website)) {
    parts.push({ text: "Website", url: clean(contact.website) });
  }
  if (clean(contact.twitter)) {
    parts.push({ text: "Twitter", url: clean(contact.twitter) });
  }
  if (clean(contact.location)) parts.push({ text: clean(contact.location) });

  if (parts.length === 0) return null;

  const separator = " | ";
  let text = "";
  const links: NonNullable<StructuredDocLine["links"]> = [];
  parts.forEach((part, i) => {
    if (i > 0) text += separator;
    const start = text.length;
    text += part.text;
    if (part.url) links.push({ start, end: text.length, url: normalizeLinkUrl(part.url) });
  });

  return { text, kind: "contact", links };
}

/**
 * Build the whole Doc: the lines to write, the structured content to store,
 * and the slots Apply will rewrite per job.
 */
export function buildMasterDoc(profile: BuilderProfile): BuiltMasterDoc {
  const lines: StructuredDocLine[] = [];
  const slots: DocSlot[] = [];
  const content: MasterContent = {
    headline: "",
    contact_line: "",
    links_line: "",
    experience: [],
    projects: [],
    skills: [],
    education: [],
  };

  const name = clean(profile.name);
  if (name) lines.push({ text: name, kind: "title" });

  const contact = contactLine(profile);
  if (contact) {
    lines.push(contact);
    content.contact_line = contact.text;
    content.links_line = contact.text;
  }

  const heading = (section: SectionName) =>
    lines.push({ text: docHeading(section), kind: "heading" });

  for (const section of resolveSectionOrder(profile)) {
    switch (section) {
      case "summary": {
        const summary = clean(profile.professional_summary);
        if (!summary) break;
        heading(section);
        lines.push({ text: summary, kind: "body" });
        content.headline = summary;
        // The one non-bullet slot: a tailored resume opens on a summary
        // written for that job.
        slots.push({ key: "headline", original: summary, section: "headline" });
        break;
      }

      case "education": {
        const entries = profile.education ?? [];
        if (!entries.length) break;
        heading(section);
        for (const edu of entries) {
          const degree = clean(edu.gpa)
            ? `${clean(edu.degree)} (GPA ${clean(edu.gpa)})`
            : clean(edu.degree);
          const left = joinParts([edu.institution, degree]);
          const withPlace = clean(edu.location)
            ? `${left} | ${clean(edu.location)}`
            : left;
          const dates = clean(edu.graduation_date);
          if (!withPlace) continue;
          lines.push({
            text: dates ? `${withPlace}${COL}${dates}` : withPlace,
            kind: "subheading",
          });
          content.education.push({ institution_line: withPlace, dates });
        }
        break;
      }

      case "experience": {
        const entries = profile.experience ?? [];
        if (!entries.length) break;
        heading(section);
        entries.forEach((job) => {
          const left = joinParts([job.company, job.role]);
          const withPlace = clean(job.location)
            ? `${left} | ${clean(job.location)}`
            : left;
          const dates = dateRange(job.start_date, job.end_date);
          if (!withPlace && !dates) return;
          lines.push({
            text: dates ? `${withPlace}${COL}${dates}` : withPlace,
            kind: "subheading",
          });

          const roleIndex = content.experience.length;
          const bullets: string[] = [];
          content.experience.push({
            company: clean(job.company),
            title: clean(job.role),
            location: clean(job.location) || undefined,
            start_date: clean(job.start_date) || undefined,
            end_date: clean(job.end_date) || undefined,
            bullets,
          });

          for (const raw of job.description ?? []) {
            const text = clean(raw);
            if (!text) continue;
            const bulletIndex = bullets.length;
            bullets.push(text);
            lines.push({ text, kind: "bullet" });
            slots.push({
              key: `exp_${roleIndex}_bullet_${bulletIndex}`,
              original: text,
              section: "experience",
              experience_index: roleIndex,
              bullet_index: bulletIndex,
              word_count: countWords(text),
            });
          }
        });
        break;
      }

      case "projects": {
        const entries = profile.projects ?? [];
        if (!entries.length) break;
        heading(section);
        entries.forEach((project) => {
          const title = clean(project.name);
          if (!title) return;
          const subtitle = clean(project.technologies);
          const text = subtitle ? `${title} | ${subtitle}` : title;
          const demo = clean(project.demo_link);
          lines.push({
            text,
            kind: "subheading",
            links: demo
              ? [{ start: 0, end: title.length, url: normalizeLinkUrl(demo) }]
              : undefined,
          });

          const projectIndex = content.projects.length;
          const bullets: string[] = [];
          content.projects.push({
            name: title,
            subtitle: subtitle || undefined,
            website_url: demo ? normalizeLinkUrl(demo) : undefined,
            bullets,
          });

          for (const raw of project.description ?? []) {
            const bulletText = clean(raw);
            if (!bulletText) continue;
            const bulletIndex = bullets.length;
            bullets.push(bulletText);
            lines.push({ text: bulletText, kind: "bullet" });
            slots.push({
              key: `proj_${projectIndex}_bullet_${bulletIndex}`,
              original: bulletText,
              section: "project",
              project_index: projectIndex,
              bullet_index: bulletIndex,
              word_count: countWords(bulletText),
            });
          }
        });
        break;
      }

      case "skills": {
        const categories = (profile.skills ?? []).filter(
          (cat) => clean(cat.category_name) && (cat.skills ?? []).some(clean),
        );
        if (!categories.length) break;
        heading(section);
        for (const category of categories) {
          const label = `${clean(category.category_name)}:`;
          const list = (category.skills ?? []).map(clean).filter(Boolean).join(", ");
          const text = `${label} ${list}`;
          const skillIndex = content.skills.length;
          content.skills.push(text);
          lines.push({ text, kind: "body", bold_prefix: label.length });
          slots.push({
            key: `skill_${skillIndex}`,
            original: text,
            section: "skill",
            skill_index: skillIndex,
          });
        }
        break;
      }

      case "certifications": {
        const items = (profile.certifications ?? []).map(clean).filter(Boolean);
        if (!items.length) break;
        heading(section);
        for (const item of items) lines.push({ text: item, kind: "bullet" });
        break;
      }

      case "publications": {
        const items = profile.publications ?? [];
        if (!items.length) break;
        heading(section);
        for (const pub of items) {
          const title = joinParts([pub.title, pub.publisher]);
          if (!title) continue;
          const date = clean(pub.date);
          lines.push({
            text: date ? `${title}${COL}${date}` : title,
            kind: "subheading",
            links: clean(pub.url)
              ? [{ start: 0, end: clean(pub.title).length, url: normalizeLinkUrl(pub.url!) }]
              : undefined,
          });
          if (clean(pub.summary)) {
            lines.push({ text: clean(pub.summary), kind: "bullet" });
          }
        }
        break;
      }

      case "awards": {
        const items = profile.awards ?? [];
        if (!items.length) break;
        heading(section);
        for (const award of items) {
          const title = joinParts([award.title, award.awarder]);
          if (!title) continue;
          const date = clean(award.date);
          lines.push({
            text: date ? `${title}${COL}${date}` : title,
            kind: "subheading",
          });
          if (clean(award.summary)) {
            lines.push({ text: clean(award.summary), kind: "bullet" });
          }
        }
        break;
      }

      case "volunteer": {
        const items = profile.volunteer ?? [];
        if (!items.length) break;
        heading(section);
        for (const vol of items) {
          const left = joinParts([vol.organization, vol.role]);
          if (!left) continue;
          const dates = dateRange(vol.start_date, vol.end_date);
          lines.push({
            text: dates ? `${left}${COL}${dates}` : left,
            kind: "subheading",
          });
          for (const raw of vol.description ?? []) {
            const text = clean(raw);
            if (text) lines.push({ text, kind: "bullet" });
          }
        }
        break;
      }

      case "languages": {
        const items = (profile.languages ?? []).map(clean).filter(Boolean);
        if (!items.length) break;
        heading(section);
        lines.push({
          text: `Languages: ${items.join(", ")}`,
          kind: "body",
          bold_prefix: "Languages:".length,
        });
        break;
      }

      case "coursework": {
        const major = (profile.coursework?.major_coursework ?? []).map(clean).filter(Boolean);
        const minor = (profile.coursework?.minor_coursework ?? []).map(clean).filter(Boolean);
        if (!major.length && !minor.length) break;
        heading(section);
        if (major.length) {
          lines.push({
            text: `Major coursework: ${major.join(", ")}`,
            kind: "body",
            bold_prefix: "Major coursework:".length,
          });
        }
        if (minor.length) {
          lines.push({
            text: `Minor coursework: ${minor.join(", ")}`,
            kind: "body",
            bold_prefix: "Minor coursework:".length,
          });
        }
        break;
      }
    }
  }

  for (const custom of profile.custom_sections ?? []) {
    appendCustomSection(lines, custom);
  }

  return { lines, content, slots: dedupeSlots(slots) };
}

function appendCustomSection(
  lines: StructuredDocLine[],
  custom: BuilderCustomSection,
): void {
  const title = clean(custom.title);
  const items = (custom.items ?? []).map(clean).filter(Boolean);
  if (!title || !items.length) return;
  lines.push({ text: title.toUpperCase(), kind: "heading" });
  for (const item of items) lines.push({ text: item, kind: "bullet" });
}

/**
 * replaceAllText matches text, not position, so two slots holding the same
 * sentence would both be rewritten by whichever tailored line came first.
 * Duplicates are dropped rather than renamed — the same rule master-sync
 * applies to an imported Doc.
 */
function dedupeSlots(slots: DocSlot[]): DocSlot[] {
  const seen = new Set<string>();
  const out: DocSlot[] = [];
  for (const slot of slots) {
    const key = slot.original.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(slot);
  }
  return out;
}

/**
 * The same shape master-sync returns for an imported Doc, so every caller
 * downstream — the master_resume row, Apply, the word budget — cannot tell
 * where the master came from.
 */
export function builtMasterToSynced(
  built: BuiltMasterDoc,
  docId: string,
): SyncedMasterResume {
  const tailorable = built.slots
    .filter((slot) => slot.section !== "headline")
    .reduce((total, slot) => total + countWords(slot.original), 0);
  const fixedLineWords = built.lines
    .filter((line) => line.kind === "subheading")
    .reduce((total, line) => total + countWords(line.text), 0);

  return {
    content: built.content,
    layout: {
      master_doc_id: docId,
      version: 1,
      mapped_at: new Date().toISOString(),
      slots: built.slots,
      word_budget: {
        work_through_skills_total: fixedLineWords + tailorable,
        fixed_line_words: fixedLineWords,
        tailorable_words: tailorable,
      },
    },
    sync_mode: "heuristic",
  };
}
