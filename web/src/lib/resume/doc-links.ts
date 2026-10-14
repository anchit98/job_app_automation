/**
 * The hyperlinks a resume Doc carries, recovered as data rather than styling.
 *
 * A resume almost never spells its links out. "LinkedIn", "GitHub" and a
 * project's own name are the visible text; the address lives in the run's
 * `textStyle.link`. Everything downstream — the tailored PDF's contact row, the
 * "Link" beside a project — used to be derived by reading the *text* back, so a
 * master imported from a file arrived with every link dead: the words were
 * still there, the addresses were not.
 *
 * So the links are harvested once, at sync time, and travel with the master's
 * content. Two consumers:
 *
 *   - `attachProjectWebsites` fills in `projects[].website_url`, which is what
 *     `generateTailoredResumeLatex` renders as the project's Link.
 *   - `collectResumeLinks` hands the whole set to signature extraction, where a
 *     real href beats guessing a domain out of the contact row.
 *
 * Both work the same whether the master was parsed by the heuristic or by the
 * smart agent, because they run on the paragraphs rather than on either
 * parser's output.
 */
import type { docs_v1 } from "googleapis";

export interface DocTextLink {
  /** The visible text carrying the link — "LinkedIn", a project name, a URL. */
  text: string;
  url: string;
}

/** One paragraph reduced to what link recovery needs. */
export interface LinkedParagraph {
  text: string;
  links: DocTextLink[];
}

/**
 * Schemes that are never a project's website.
 *
 * A contact row's phone and email are links too, and a project paragraph that
 * happens to sit next to one must not adopt it.
 */
const NON_WEB_SCHEME_RE = /^(mailto|tel|callto|sms):/i;

/** Every link in one paragraph, in reading order. */
export function paragraphLinks(
  paragraph: docs_v1.Schema$Paragraph,
): DocTextLink[] {
  const links: DocTextLink[] = [];
  for (const el of paragraph.elements ?? []) {
    const url = el.textRun?.textStyle?.link?.url?.trim();
    if (!url) continue;
    const text = (el.textRun?.content ?? "").trim();
    // Consecutive runs often split one link across several elements (a bold
    // word inside it, a spell-check boundary). Same URL in a row is one link.
    const previous = links.at(-1);
    if (previous?.url === url) {
      previous.text = `${previous.text}${text}`.trim();
      continue;
    }
    links.push({ text, url });
  }
  return links;
}

/** The first web link on a paragraph — phone and email links do not count. */
export function firstWebLink(links: DocTextLink[]): string | undefined {
  return links.find((l) => !NON_WEB_SCHEME_RE.test(l.url))?.url;
}

/** Whitespace-insensitive, case-insensitive comparison key. */
function compareKey(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A line short enough to be a project's link row rather than a bullet.
 *
 * Plenty of resumes put the title on one line and "Demo" / "Live site" /
 * the bare URL on the next. Anything longer than this is prose, and prose that
 * happens to cite a URL is not the project's home page.
 */
const LINK_ROW_MAX_CHARS = 60;

/**
 * Fill in `website_url` for projects that do not have one yet.
 *
 * Matching is by the project's name against the start of a paragraph: the
 * parsers strip a title line down to its name (dropping the " | tech stack"
 * tail), so the stored name is a prefix of the line it came from. Projects
 * already carrying a URL are left alone — the heuristic parser reads the link
 * off the title paragraph directly and is more precise than this.
 */
export function attachProjectWebsites(
  projects: Array<{ name: string; website_url?: string }>,
  paragraphs: LinkedParagraph[],
): void {
  if (projects.length === 0) return;

  for (const project of projects) {
    if (project.website_url?.trim()) continue;
    const name = compareKey(project.name);
    if (!name) continue;

    const at = paragraphs.findIndex((p) => compareKey(p.text).startsWith(name));
    if (at < 0) continue;

    const onTitle = firstWebLink(paragraphs[at].links);
    if (onTitle) {
      project.website_url = onTitle;
      continue;
    }

    const next = paragraphs[at + 1];
    if (next && next.text.trim().length <= LINK_ROW_MAX_CHARS) {
      const onLinkRow = firstWebLink(next.links);
      if (onLinkRow) project.website_url = onLinkRow;
    }
  }
}

/**
 * Every distinct web link in the document, nearest the top first.
 *
 * Stored on the master's content so signature extraction can resolve a bare
 * "LinkedIn" label without re-reading the Doc — and so it still resolves after
 * Drive access is gone.
 */
export function collectResumeLinks(
  paragraphs: LinkedParagraph[],
): DocTextLink[] {
  const seen = new Set<string>();
  const out: DocTextLink[] = [];
  for (const paragraph of paragraphs) {
    for (const link of paragraph.links) {
      if (NON_WEB_SCHEME_RE.test(link.url)) continue;
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      out.push(link);
    }
  }
  return out;
}
