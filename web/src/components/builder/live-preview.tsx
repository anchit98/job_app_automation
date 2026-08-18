"use client";

/**
 * Live CV preview — ported from ResumeBuilderV2's LivePreview.jsx.
 *
 * Renders an A4 facsimile of what the LaTeX build will produce, so the user
 * sees their CV take shape while typing instead of waiting on a PDF round trip.
 * Section visibility follows the chosen professional field.
 */
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Globe,
  Link as LinkIcon,
  Mail,
  MapPin,
  Maximize,
  Minus,
  Phone,
  Plus,
} from "lucide-react";
import type { BuilderProfile } from "@/lib/builder/types";
import "./live-preview.css";

const ICON = 11;
/** A4 at 96dpi — 210mm x 297mm. */
const PAGE_W = 794;
const PAGE_H = 1122;
const CONTAINER_PADDING = 16;

function clean(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

function filled(values: string[] | undefined): string[] {
  return (values ?? []).filter((v) => v && v.trim());
}

export function LivePreview({
  data,
  activeSections,
}: {
  data: BuilderProfile;
  activeSections: string[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [fitScale, setFitScale] = useState(1);

  // Scale is computed here rather than in CSS: a pure-CSS scale leaves the
  // wrapper at full page width, so the A4 sheet overflows a narrower column and
  // gets clipped on both sides. With the factor in JS the outer box can be
  // sized to the *scaled* result, which always fits.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const available = el.clientWidth - CONTAINER_PADDING * 2;
      setFitScale(Math.min(1, Math.max(0.2, available / PAGE_W)));
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, []);

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

  const show = (name: string) => activeSections.includes(name);

  return (
    <div
      className={`live-preview-container ${manualZoom !== null ? "is-zoomed" : ""}`}
      ref={containerRef}
    >
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

      {/* Outer box is sized to the scaled page so the column never overflows. */}
      <div
        className="live-preview-page-wrapper"
        style={{ width: PAGE_W * scale, height: PAGE_H * scale }}
      >
        <div
          className="live-preview-page"
          style={{ transform: `scale(${scale})` }}
        >
          <div className="lp-header">
            <h1 className="lp-name">{data.name}</h1>
            <div className="lp-contact">
              {data.contact?.email && (
                <span className="lp-contact-item">
                  <Mail size={ICON} /> {data.contact.email}
                </span>
              )}
              {data.contact?.phone && (
                <span className="lp-contact-item">
                  <Phone size={ICON} /> {data.contact.phone}
                </span>
              )}
              {data.contact?.location && (
                <span className="lp-contact-item">
                  <MapPin size={ICON} /> {data.contact.location}
                </span>
              )}
              {data.contact?.linkedin && (
                <span className="lp-contact-item">
                  <LinkIcon size={ICON} /> {clean(data.contact.linkedin)}
                </span>
              )}
              {data.contact?.github && (
                <span className="lp-contact-item">
                  <LinkIcon size={ICON} /> {clean(data.contact.github)}
                </span>
              )}
              {data.contact?.portfolio && (
                <span className="lp-contact-item">
                  <Globe size={ICON} /> {clean(data.contact.portfolio)}
                </span>
              )}
            </div>
          </div>

          {show("summary") && data.professional_summary && (
            <div className="lp-section">
              <h2 className="lp-section-title">Summary</h2>
              <div className="lp-summary-text">{data.professional_summary}</div>
            </div>
          )}

          {show("experience") && data.experience?.some((e) => e.company) && (
            <div className="lp-section">
              <h2 className="lp-section-title">Experience</h2>
              {data.experience.map((exp, i) => (
                <div key={i} className="lp-item">
                  <div className="lp-item-header">
                    <strong>{exp.role || "Role"}</strong>
                    <span>
                      {exp.start_date}
                      {exp.end_date ? ` - ${exp.end_date}` : ""}
                    </span>
                  </div>
                  <div className="lp-item-sub">
                    <i>{exp.company}</i>
                    {exp.location ? `, ${exp.location}` : ""}
                  </div>
                  <ul className="lp-bullets">
                    {filled(exp.description).map((desc, j) => (
                      <li key={j}>{desc}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {show("education") && data.education?.some((e) => e.institution) && (
            <div className="lp-section">
              <h2 className="lp-section-title">Education</h2>
              {data.education.map((edu, i) => (
                <div key={i} className="lp-item">
                  <div className="lp-item-header">
                    <strong>{edu.institution || "Institution"}</strong>
                    <span>{edu.graduation_date}</span>
                  </div>
                  <div className="lp-item-sub">
                    {edu.degree}
                    {edu.gpa ? ` (GPA: ${edu.gpa})` : ""}
                    {edu.location ? `, ${edu.location}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {show("projects") && data.projects?.some((p) => p.name) && (
            <div className="lp-section">
              <h2 className="lp-section-title">Projects</h2>
              {data.projects.map((proj, i) => (
                <div key={i} className="lp-item">
                  <div className="lp-item-header">
                    <strong>{proj.name}</strong>
                    {proj.technologies && <span>{proj.technologies}</span>}
                  </div>
                  {proj.demo_link && (
                    <div className="lp-item-sub">{clean(proj.demo_link)}</div>
                  )}
                  <ul className="lp-bullets">
                    {filled(proj.description).map((desc, j) => (
                      <li key={j}>{desc}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {show("skills") && data.skills?.length > 0 && (
            <div className="lp-section">
              <h2 className="lp-section-title">Skills</h2>
              <div className="lp-skills-list">
                {data.skills
                  .filter(
                    (cat) => cat.category_name || filled(cat.skills).length > 0,
                  )
                  .map((cat, i) => (
                    <div key={i} className="lp-skill-row">
                      {cat.category_name && <strong>{cat.category_name}: </strong>}
                      <span>{filled(cat.skills).join(", ")}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {show("certifications") && filled(data.certifications).length > 0 && (
            <div className="lp-section">
              <h2 className="lp-section-title">Certifications</h2>
              <ul className="lp-bullets">
                {filled(data.certifications).map((cert, i) => (
                  <li key={i}>{cert}</li>
                ))}
              </ul>
            </div>
          )}

          {show("publications") && data.publications?.some((p) => p.title) && (
            <div className="lp-section">
              <h2 className="lp-section-title">Publications</h2>
              {data.publications.map((pub, i) => (
                <div key={i} className="lp-item">
                  <strong>{pub.title}</strong>
                  {pub.publisher && <span> — {pub.publisher}</span>}
                  {pub.date && <span> ({pub.date})</span>}
                  {pub.summary && (
                    <div className="lp-summary-text">{pub.summary}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {show("awards") && data.awards?.some((a) => a.title) && (
            <div className="lp-section">
              <h2 className="lp-section-title">Awards</h2>
              {data.awards.map((award, i) => (
                <div key={i} className="lp-item">
                  <strong>{award.title}</strong>
                  {award.awarder && <span> — {award.awarder}</span>}
                  {award.date && <span> ({award.date})</span>}
                </div>
              ))}
            </div>
          )}

          {show("volunteer") && data.volunteer?.some((v) => v.organization) && (
            <div className="lp-section">
              <h2 className="lp-section-title">Volunteer Experience</h2>
              {data.volunteer.map((vol, i) => (
                <div key={i} className="lp-item">
                  <div className="lp-item-header">
                    <strong>{vol.role || "Role"}</strong>
                    <span>
                      {vol.start_date}
                      {vol.end_date ? ` - ${vol.end_date}` : ""}
                    </span>
                  </div>
                  <div className="lp-item-sub">
                    <i>{vol.organization}</i>
                  </div>
                  <ul className="lp-bullets">
                    {filled(vol.description).map((desc, j) => (
                      <li key={j}>{desc}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {show("languages") && filled(data.languages).length > 0 && (
            <div className="lp-section">
              <h2 className="lp-section-title">Languages</h2>
              <div className="lp-skills-list">
                {filled(data.languages).join(", ")}
              </div>
            </div>
          )}

          {show("coursework") &&
            (filled(data.coursework?.major_coursework).length > 0 ||
              filled(data.coursework?.minor_coursework).length > 0) && (
              <div className="lp-section">
                <h2 className="lp-section-title">Relevant Coursework</h2>
                {filled(data.coursework?.major_coursework).length > 0 && (
                  <div className="lp-skill-row">
                    <strong>Major: </strong>
                    <span>
                      {filled(data.coursework?.major_coursework).join(", ")}
                    </span>
                  </div>
                )}
                {filled(data.coursework?.minor_coursework).length > 0 && (
                  <div className="lp-skill-row">
                    <strong>Minor: </strong>
                    <span>
                      {filled(data.coursework?.minor_coursework).join(", ")}
                    </span>
                  </div>
                )}
              </div>
            )}

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
  );
}
