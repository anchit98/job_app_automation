"use client";

/**
 * Live CV preview — ported from ResumeBuilderV2's LivePreview.jsx.
 *
 * Renders an A4 facsimile of what the LaTeX build will produce, so the user
 * sees their CV take shape while typing instead of waiting on a PDF round trip.
 *
 * Everything here is driven by the same helpers the PDF uses:
 * `resolveSectionOrder` for the sequence and `SECTION_LABELS` for the headings.
 * The old version hard-coded its own order and its own titles, so a tech CV
 * previewed as Experience-then-Education while the PDF printed
 * Education-then-Experience, and the header showed raw URLs where the PDF
 * prints labelled links. Anything shown here must be derived, never restated.
 */
import { useEffect, useLayoutEffect, useState } from "react";
import { FileText, Maximize, Minus, Plus } from "lucide-react";
import {
  SECTION_LABELS,
  resolveSectionOrder,
  type SectionName,
} from "@/lib/builder/latex-engine";
import type { BuilderProfile } from "@/lib/builder/types";
import "./live-preview.css";

/** A4 at 96dpi — 210mm x 297mm. */
const PAGE_W = 794;
const PAGE_H = 1122;
const CONTAINER_PADDING = 10;

function filled(values: string[] | undefined): string[] {
  return (values ?? []).filter((v) => v && v.trim());
}

/** Same rule as the LaTeX header: a link prints as its label, not its URL. */
function ContactLink({ href, label }: { href: string; label: string }) {
  return (
    <span className="lp-contact-item">
      <a href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    </span>
  );
}

/** Bold left / plain right, the shape of every \resumeSubheading row. */
function ItemRow({
  left,
  right,
  italic = false,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  italic?: boolean;
}) {
  if (!left && !right) return null;
  return (
    <div className={`lp-item-header ${italic ? "lp-item-sub-row" : ""}`}>
      <span className="lp-item-left">{left}</span>
      <span className="lp-item-right">{right}</span>
    </div>
  );
}

function dateRange(start?: string, end?: string): string {
  const from = start?.trim();
  const to = end?.trim();
  if (from && to) return `${from} – ${to}`;
  return from || to || "";
}

/**
 * One renderer per section, keyed exactly like the LaTeX generators.
 * Returning null is how a section drops out — same condition the engine uses,
 * so the preview never shows a heading the PDF will omit.
 */
const SECTION_RENDERERS: Record<
  SectionName,
  (data: BuilderProfile) => React.ReactNode | null
> = {
  summary: (data) =>
    data.professional_summary?.trim() ? (
      <div className="lp-summary-text">{data.professional_summary}</div>
    ) : null,

  education: (data) =>
    data.education?.some((e) => e.institution) ? (
      <>
        {data.education.map((edu, i) => (
          <div key={i} className="lp-item">
            <ItemRow left={<strong>{edu.institution}</strong>} right={edu.location} />
            <ItemRow
              italic
              left={<i>{edu.degree}</i>}
              right={<i>{edu.graduation_date}</i>}
            />
            {edu.gpa ? (
              <ul className="lp-bullets">
                <li>GPA: {edu.gpa}</li>
              </ul>
            ) : null}
          </div>
        ))}
      </>
    ) : null,

  experience: (data) =>
    data.experience?.some((e) => e.company) ? (
      <>
        {data.experience.map((exp, i) => (
          <div key={i} className="lp-item">
            <ItemRow left={<strong>{exp.company}</strong>} right={exp.location} />
            <ItemRow
              italic
              left={<i>{exp.role}</i>}
              right={<i>{dateRange(exp.start_date, exp.end_date)}</i>}
            />
            <ul className="lp-bullets">
              {filled(exp.description).map((desc, j) => (
                <li key={j}>{desc}</li>
              ))}
            </ul>
          </div>
        ))}
      </>
    ) : null,

  projects: (data) =>
    data.projects?.some((p) => p.name) ? (
      <>
        {data.projects.map((proj, i) => (
          <div key={i} className="lp-item">
            <ItemRow
              left={<strong>{proj.name}</strong>}
              right={
                <>
                  {proj.demo_link ? (
                    <a
                      className="lp-demo-link"
                      href={proj.demo_link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Demo
                    </a>
                  ) : null}
                  {proj.technologies ? <i>{proj.technologies}</i> : null}
                </>
              }
            />
            <ul className="lp-bullets">
              {filled(proj.description).map((desc, j) => (
                <li key={j}>{desc}</li>
              ))}
            </ul>
          </div>
        ))}
      </>
    ) : null,

  skills: (data) =>
    data.skills?.length ? (
      <div className="lp-skills-list">
        {data.skills
          .filter((cat) => cat.category_name || filled(cat.skills).length > 0)
          .map((cat, i) => (
            <div key={i} className="lp-skill-row">
              {cat.category_name && <strong>{cat.category_name}: </strong>}
              <span>{filled(cat.skills).join(", ")}</span>
            </div>
          ))}
      </div>
    ) : null,

  certifications: (data) =>
    filled(data.certifications).length ? (
      <ul className="lp-bullets">
        {filled(data.certifications).map((cert, i) => (
          <li key={i}>{cert}</li>
        ))}
      </ul>
    ) : null,

  publications: (data) =>
    data.publications?.some((p) => p.title) ? (
      <>
        {data.publications.map((pub, i) => (
          <div key={i} className="lp-item">
            <ItemRow left={<strong>{pub.title}</strong>} right={<i>{pub.date}</i>} />
            {pub.publisher ? (
              <div className="lp-item-sub">
                <i>{pub.publisher}</i>
              </div>
            ) : null}
            {pub.summary ? (
              <ul className="lp-bullets">
                <li>{pub.summary}</li>
              </ul>
            ) : null}
          </div>
        ))}
      </>
    ) : null,

  awards: (data) =>
    data.awards?.some((a) => a.title) ? (
      <>
        {data.awards.map((award, i) => (
          <div key={i} className="lp-item">
            <ItemRow left={<strong>{award.title}</strong>} right={<i>{award.date}</i>} />
            {award.awarder ? (
              <div className="lp-item-sub">
                <i>{award.awarder}</i>
              </div>
            ) : null}
            {award.summary ? (
              <ul className="lp-bullets">
                <li>{award.summary}</li>
              </ul>
            ) : null}
          </div>
        ))}
      </>
    ) : null,

  volunteer: (data) =>
    data.volunteer?.some((v) => v.organization) ? (
      <>
        {data.volunteer.map((vol, i) => (
          <div key={i} className="lp-item">
            <ItemRow left={<strong>{vol.organization}</strong>} />
            <ItemRow
              italic
              left={<i>{vol.role}</i>}
              right={<i>{dateRange(vol.start_date, vol.end_date)}</i>}
            />
            <ul className="lp-bullets">
              {filled(vol.description).map((desc, j) => (
                <li key={j}>{desc}</li>
              ))}
            </ul>
          </div>
        ))}
      </>
    ) : null,

  languages: (data) =>
    filled(data.languages).length ? (
      <div className="lp-skill-row">
        <strong>Languages: </strong>
        <span>{filled(data.languages).join(", ")}</span>
      </div>
    ) : null,

  coursework: (data) => {
    const major = filled(data.coursework?.major_coursework);
    const minor = filled(data.coursework?.minor_coursework);
    if (!major.length && !minor.length) return null;
    return (
      <div className="lp-skills-list">
        {major.length > 0 && (
          <div className="lp-skill-row">
            <strong>Major coursework: </strong>
            <span>{major.join(", ")}</span>
          </div>
        )}
        {minor.length > 0 && (
          <div className="lp-skill-row">
            <strong>Minor coursework: </strong>
            <span>{minor.join(", ")}</span>
          </div>
        )}
      </div>
    );
  },
};

export function LivePreview({ data }: { data: BuilderProfile }) {
  // Callback refs, not useRef: the empty state returns before these nodes
  // exist, so an effect keyed on a ref object would run once against null and
  // never re-attach once the user starts typing.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [fitScale, setFitScale] = useState(1);
  /** Unscaled height of the sheet — grows past A4 as content is added. */
  const [pageHeight, setPageHeight] = useState(PAGE_H);

  // Scale is computed here rather than in CSS: a pure-CSS scale leaves the
  // wrapper at full page width, so the A4 sheet overflows a narrower column and
  // gets clipped on both sides. With the factor in JS the outer box can be
  // sized to the *scaled* result, which always fits.
  useEffect(() => {
    if (!scrollEl) return;
    const update = () => {
      const available = scrollEl.clientWidth - CONTAINER_PADDING * 2;
      const next = Math.min(1, Math.max(0.2, available / PAGE_W));
      // Quantised, and only committed when it actually moves: belt and braces
      // against the observer re-entering on a sub-pixel width change.
      setFitScale((current) =>
        Math.abs(current - next) < 0.002 ? current : Math.round(next * 500) / 500,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(scrollEl);
    update();
    return () => observer.disconnect();
  }, [scrollEl]);

  // A transformed element still reports its untransformed height, so the
  // wrapper (which is what the scroll container actually sees) has to be told
  // how tall the scaled sheet is. Without this the wrapper stayed one page
  // tall and everything below the fold was unreachable.
  useLayoutEffect(() => {
    if (!pageEl) return;
    const update = () => {
      const next = Math.max(PAGE_H, pageEl.scrollHeight);
      setPageHeight((current) => (current === next ? current : next));
    };
    const observer = new ResizeObserver(update);
    observer.observe(pageEl);
    update();
    return () => observer.disconnect();
  }, [pageEl]);

  const scale = manualZoom ?? fitScale;

  if (!data.name && !data.contact?.email) {
    return (
      <div className="live-preview-empty">
        <FileText size={48} aria-hidden />
        <h3>Your CV will appear here</h3>
        <p>Start typing your details to see the live preview.</p>
      </div>
    );
  }

  const contact = data.contact ?? {};
  const order = resolveSectionOrder(data);
  const sections = order
    .map((name) => ({ name, body: SECTION_RENDERERS[name](data) }))
    .filter((s) => s.body !== null);

  return (
    <div className="live-preview-shell">
      <div className="live-preview-scroll" ref={setScrollEl}>
        {/* Outer box is sized to the scaled page so the column never overflows
            sideways, while its height lets the scroller reach the last line. */}
        <div
          className="live-preview-page-wrapper"
          style={{ width: PAGE_W * scale, height: pageHeight * scale }}
        >
          <div
            className="live-preview-page"
            ref={setPageEl}
            style={{ transform: `scale(${scale})` }}
          >
            <div className="lp-header">
              <h1 className="lp-name">{data.name}</h1>
              {/* Same items, same order, same labels and the same "|"
                  separators as headerSection(). The icons that used to sit in
                  front of each item are gone from both: in the PDF they were
                  an icon font that no text extractor could read, so a resume
                  arrived at the ATS with "Æ" where its phone number should be. */}
              <div className="lp-contact">
                {contact.phone && (
                  <span className="lp-contact-item">{contact.phone}</span>
                )}
                {contact.email && (
                  <span className="lp-contact-item">{contact.email}</span>
                )}
                {contact.linkedin && (
                  <ContactLink href={contact.linkedin} label="LinkedIn" />
                )}
                {contact.github && (
                  <ContactLink href={contact.github} label="GitHub" />
                )}
                {contact.portfolio && (
                  <ContactLink href={contact.portfolio} label="Portfolio" />
                )}
                {contact.website && (
                  <ContactLink href={contact.website} label="Website" />
                )}
                {contact.twitter && (
                  <ContactLink href={contact.twitter} label="Twitter" />
                )}
                {contact.location && (
                  <span className="lp-contact-item">{contact.location}</span>
                )}
              </div>
            </div>

            {sections.map(({ name, body }) => (
              <div key={name} className="lp-section">
                <h2 className="lp-section-title">{SECTION_LABELS[name]}</h2>
                {body}
              </div>
            ))}

            {/* Custom sections print after everything else, as in the engine. */}
            {(data.custom_sections ?? []).map((cs, i) => {
              const items = filled(cs.items);
              if (!cs.title || items.length === 0) return null;
              return (
                <div key={`custom-${i}`} className="lp-section">
                  <h2 className="lp-section-title">{cs.title}</h2>
                  <ul className="lp-bullets">
                    {items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Outside the scroller so the controls stay put while the CV scrolls. */}
      <div className="live-preview-controls">
        <button
          type="button"
          title="Zoom out"
          onClick={() => setManualZoom((z) => Math.max(0.4, (z ?? 0.9) - 0.1))}
        >
          <Minus size={16} />
        </button>
        <span className="live-preview-zoom-level">
          {manualZoom ? `${Math.round(manualZoom * 100)}%` : "Fit"}
        </span>
        <button
          type="button"
          title="Zoom in"
          onClick={() => setManualZoom((z) => Math.min(2, (z ?? 1.1) + 0.1))}
        >
          <Plus size={16} />
        </button>
        {manualZoom !== null && (
          <button
            type="button"
            title="Fit to screen"
            onClick={() => setManualZoom(null)}
          >
            <Maximize size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
