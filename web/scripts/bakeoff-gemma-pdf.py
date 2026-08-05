import json
import html
from pathlib import Path

root = Path(r"c:\Users\Anchit.Boruah\OneDrive - insidemedia.net\Desktop\Job Application Automation")
raw = root / "bakeoff-out" / "raw"
out_html = root / "bakeoff-out" / "gemma-outputs.html"
out_pdf = root / "bakeoff-out" / "Gemma-Outputs-MiQ-Govpreneurs.pdf"

ORDER = [
    ("miq", "MiQ", "Product Manager, Intelligence", "jd_parse", "JD Parse"),
    ("miq", "MiQ", "Product Manager, Intelligence", "resume", "Resume"),
    ("miq", "MiQ", "Product Manager, Intelligence", "cover_letter", "Cover Letter"),
    ("miq", "MiQ", "Product Manager, Intelligence", "cold_email", "Cold Email"),
    ("govpreneurs", "Govpreneurs", "Product Manager", "jd_parse", "JD Parse"),
    ("govpreneurs", "Govpreneurs", "Product Manager", "resume", "Resume"),
    ("govpreneurs", "Govpreneurs", "Product Manager", "cover_letter", "Cover Letter"),
    ("govpreneurs", "Govpreneurs", "Product Manager", "cold_email", "Cold Email"),
]


def load(app: str, kind: str):
    path = raw / f"{app}__{kind}__google_gemma-4-31b-it.json"
    return json.loads(path.read_text(encoding="utf-8-sig"))


def render_jd(obj: dict) -> str:
    rows = []
    for k in [
        "company",
        "role",
        "seniority",
        "location",
        "remote_policy",
    ]:
        rows.append(f"<tr><th>{html.escape(k)}</th><td>{html.escape(str(obj.get(k, '')))}</td></tr>")
    for k in [
        "must_have_keywords",
        "nice_to_have_keywords",
        "responsibilities",
        "requirements",
        "tech_stack",
    ]:
        items = obj.get(k) or []
        lis = "".join(f"<li>{html.escape(str(x))}</li>" for x in items)
        rows.append(f"<tr><th>{html.escape(k)}</th><td><ul>{lis}</ul></td></tr>")
    return f"<table class='kv'>{''.join(rows)}</table>"


def render_resume(obj: dict) -> str:
    parts = [
        f"<p class='headline'><strong>{html.escape(obj.get('headline') or '')}</strong></p>",
        f"<p class='meta'>{html.escape(obj.get('contact_line') or '')}</p>",
        f"<p class='meta'>{html.escape(obj.get('links_line') or '')}</p>",
        "<h3>Experience</h3>",
    ]
    for exp in obj.get("experience") or []:
        title = f"{exp.get('title', '')} — {exp.get('company', '')}"
        dates = f"{exp.get('start_date', '')} – {exp.get('end_date', '')}"
        loc = exp.get("location") or ""
        parts.append(f"<h4>{html.escape(title)}</h4>")
        parts.append(f"<p class='meta'>{html.escape(dates)}" + (f" · {html.escape(loc)}" if loc else "") + "</p>")
        parts.append("<ul>" + "".join(f"<li>{html.escape(b)}</li>" for b in (exp.get("bullets") or [])) + "</ul>")
    parts.append("<h3>Projects</h3>")
    for proj in obj.get("projects") or []:
        name = proj.get("name") or ""
        sub = proj.get("subtitle") or ""
        parts.append(f"<h4>{html.escape(name)}</h4>")
        if sub:
            parts.append(f"<p class='meta'>{html.escape(sub)}</p>")
        if proj.get("website_url"):
            parts.append(f"<p class='meta'>{html.escape(proj['website_url'])}</p>")
        parts.append("<ul>" + "".join(f"<li>{html.escape(b)}</li>" for b in (proj.get("bullets") or [])) + "</ul>")
    parts.append("<h3>Skills</h3><ul>")
    for s in obj.get("skills") or []:
        parts.append(f"<li>{html.escape(s)}</li>")
    parts.append("</ul>")
    return "".join(parts)


def render_cover(obj: dict) -> str:
    fields = [
        ("Opening hook", "opening_hook"),
        ("Why this role", "why_this_role"),
        ("Why this company", "why_this_company"),
        ("CTA", "cta"),
    ]
    parts = []
    for label, key in fields:
        parts.append(f"<h4>{label}</h4><p>{html.escape(str(obj.get(key) or ''))}</p>")
    ev = obj.get("evidence_points") or []
    parts.append("<h4>Evidence points</h4><ul>" + "".join(f"<li>{html.escape(x)}</li>" for x in ev) + "</ul>")
    parts.append(f"<h4>Full body</h4><p class='body'>{html.escape(str(obj.get('body') or '')).replace(chr(10), '<br>')}</p>")
    return "".join(parts)


def render_email(obj: dict) -> str:
    parts = []
    for i, email in enumerate(obj.get("emails") or [], 1):
        parts.append(f"<div class='email'><h4>Email {i}</h4>")
        parts.append(f"<p><strong>To contact_id:</strong> {html.escape(str(email.get('contact_id') or ''))}</p>")
        parts.append(f"<p><strong>Subject:</strong> {html.escape(str(email.get('subject') or ''))}</p>")
        body = html.escape(str(email.get("body_md") or "")).replace("\n", "<br>")
        parts.append(f"<p class='body'>{body}</p></div>")
    return "".join(parts) or "<p>No emails</p>"


RENDERERS = {
    "jd_parse": render_jd,
    "resume": render_resume,
    "cover_letter": render_cover,
    "cold_email": render_email,
}

sections = []
for app, company, role, kind, label in ORDER:
    obj = load(app, kind)
    body = RENDERERS[kind](obj)
    sections.append(
        f"""
        <section class="stage">
          <h2>{html.escape(company)} — {html.escape(label)}</h2>
          <p class="sub">{html.escape(role)} · model: google/gemma-4-31b-it</p>
          {body}
          <details>
            <summary>Raw JSON</summary>
            <pre>{html.escape(json.dumps(obj, indent=2, ensure_ascii=False))}</pre>
          </details>
        </section>
        """
    )

doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Gemma 4 31B IT Outputs — MiQ &amp; Govpreneurs</title>
<style>
  @page {{ size: A4; margin: 16mm 14mm; }}
  body {{
    font-family: "Segoe UI", Calibri, Arial, sans-serif;
    color: #1a1a1a;
    line-height: 1.45;
    font-size: 10.5pt;
  }}
  h1 {{ font-size: 20pt; margin: 0 0 6px; }}
  .lede {{ color: #444; margin-bottom: 24px; }}
  h2 {{
    font-size: 14pt;
    margin: 0 0 4px;
    padding-bottom: 4px;
    border-bottom: 2px solid #222;
    page-break-after: avoid;
  }}
  h3 {{ font-size: 12pt; margin: 14px 0 6px; }}
  h4 {{ font-size: 11pt; margin: 10px 0 4px; }}
  .sub {{ color: #555; margin: 0 0 12px; font-size: 9.5pt; }}
  .stage {{ page-break-before: always; }}
  .stage:first-of-type {{ page-break-before: auto; }}
  table.kv {{ width: 100%; border-collapse: collapse; margin-bottom: 8px; }}
  table.kv th {{
    text-align: left; vertical-align: top; width: 28%;
    padding: 4px 8px 4px 0; color: #333; font-weight: 600;
  }}
  table.kv td {{ padding: 4px 0; vertical-align: top; }}
  ul {{ margin: 4px 0 8px 18px; padding: 0; }}
  li {{ margin-bottom: 3px; }}
  .meta {{ color: #555; font-size: 9.5pt; margin: 2px 0 8px; }}
  .headline {{ font-size: 12pt; margin-bottom: 4px; }}
  .body {{ white-space: normal; }}
  .email {{
    border-left: 3px solid #333;
    padding-left: 10px;
    margin: 12px 0;
  }}
  details {{ margin-top: 14px; }}
  summary {{ cursor: pointer; font-weight: 600; }}
  pre {{
    font-size: 7.5pt;
    background: #f5f5f5;
    padding: 8px;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    border: 1px solid #ddd;
  }}
  .toc a {{ color: #111; text-decoration: none; }}
  .toc li {{ margin-bottom: 4px; }}
</style>
</head>
<body>
  <h1>Gemma 4 31B IT — Bakeoff Outputs</h1>
  <p class="lede">
    NVIDIA model <code>google/gemma-4-31b-it</code> on real JobApp OS pipeline prompts
    for <strong>MiQ</strong> (Product Manager, Intelligence) and <strong>Govpreneurs</strong>
    (Product Manager). Generated 2026-07-30. Live app setup unchanged.
  </p>
  <ol class="toc">
    {''.join(f'<li>{html.escape(c)} — {html.escape(l)}</li>' for _, c, _, _, l in ORDER)}
  </ol>
  {''.join(sections)}
</body>
</html>
"""

out_html.write_text(doc, encoding="utf-8")
print("Wrote", out_html)
print("PDF_TARGET", out_pdf)
