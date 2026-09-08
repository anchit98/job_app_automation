/**
 * Verify the Docs API requests the master Doc writer produces.
 *
 * Every range in a batchUpdate is a character offset into text that does not
 * exist yet, so the arithmetic is the part that breaks silently: a style lands
 * on the wrong paragraph, or a link covers half a word. This runs the real
 * DocsClient against a stub transport and checks each range back against the
 * text that gets inserted.
 *
 *   npx tsx scripts/check-doc-requests.ts
 */
import type { docs_v1 } from "googleapis";
import { DocsClient } from "@/lib/google/docs";
import { buildMasterDoc } from "@/lib/builder/master-doc";
import type { BuilderProfile } from "@/lib/builder/types";

type Requests = docs_v1.Schema$Request[];

/** A DocsClient whose transport records requests instead of sending them. */
function stubClient(doc: docs_v1.Schema$Document): {
  client: DocsClient;
  sent: Requests[];
} {
  const sent: Requests[] = [];
  const client = new DocsClient({} as never);
  (client as unknown as { docs: () => unknown }).docs = () => ({
    documents: {
      get: async () => ({ data: doc }),
      batchUpdate: async (args: { requestBody: { requests: Requests } }) => {
        sent.push(args.requestBody.requests);
        return { data: {} };
      },
    },
  });
  return { client, sent };
}

function emptyDoc(): docs_v1.Schema$Document {
  return { body: { content: [{ endIndex: 2, paragraph: { elements: [] } }] } };
}

const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

const profile: BuilderProfile = {
  name: "Anchit Boruuah",
  professional_field: "tech",
  professional_summary: "Product manager with six years shipping data products.",
  contact: {
    phone: "9910980793",
    email: "jobs@example.com",
    linkedin: "linkedin.com/in/anchitboruah",
    github: "github.com/anchitb",
    location: "Bengaluru, India",
  },
  education: [
    {
      institution: "UPES",
      location: "Dehradun",
      degree: "BTech Petroleum Engineering",
      graduation_date: "2020",
    },
  ],
  experience: [
    {
      company: "WPP Media",
      role: "Senior Product Manager",
      location: "Bengaluru, India",
      start_date: "Apr 2024",
      end_date: "Present",
      description: ["Cut intake-to-handoff time by 70%.", "Held 88% CSAT."],
    },
  ],
  skills: [{ category_name: "Data", skills: ["SQL", "Python"] }],
  projects: [
    {
      name: "Panel Health Monitor",
      demo_link: "https://example.com/panel",
      technologies: "React, Node.js",
      description: ["Surfaced attrition early."],
    },
  ],
};

async function checkStructuredWrite() {
  console.log("\n== writeStructuredBody ==");
  const built = buildMasterDoc(profile);
  const { client, sent } = stubClient(emptyDoc());
  await client.writeStructuredBody("doc", built.lines, { tightMargins: true });

  check("one round trip", sent.length === 1, `${sent.length} batchUpdate call(s)`);
  const requests = sent[0];
  const insert = requests.find((r) => r.insertText);
  const body = insert?.insertText?.text ?? "";
  check("inserts at index 1", insert?.insertText?.location?.index === 1);

  /** The text a range covers, mapped back onto the inserted body. */
  const slice = (start?: number | null, end?: number | null) =>
    body.slice((start ?? 0) - 1, (end ?? 0) - 1);

  // Every line must be recoverable from its own paragraph range.
  let cursor = 1;
  const lineRanges = built.lines.map((line) => {
    const range = { start: cursor, end: cursor + line.text.length + 1 };
    cursor = range.end;
    return { line, range };
  });
  check(
    "body length matches the lines",
    cursor === 1 + body.length,
    `${cursor} vs ${1 + body.length}`,
  );
  check(
    "every paragraph range holds its line",
    lineRanges.every(({ line, range }) => slice(range.start, range.end) === `${line.text}\n`),
  );

  const reset = requests.filter(
    (r) =>
      r.updateTextStyle?.range?.startIndex === 1 &&
      r.updateTextStyle.range.endIndex === 1 + body.length,
  );
  check(
    "body font size is written explicitly",
    reset.some((r) => r.updateTextStyle?.textStyle?.fontSize?.magnitude === 10.5),
    `${reset.length} whole-body text reset(s)`,
  );
  check(
    "the reset clears inherited links",
    reset.some((r) => (r.updateTextStyle?.fields ?? "").includes("link")),
  );

  const bulletRequests = requests.filter((r) => r.createParagraphBullets);
  const bulletLines = built.lines.filter((l) => l.kind === "bullet").length;
  const bulletedText = bulletRequests.flatMap((r) =>
    slice(
      r.createParagraphBullets?.range?.startIndex,
      r.createParagraphBullets?.range?.endIndex,
    )
      .split("\n")
      .filter(Boolean),
  );
  check(
    "bullets cover exactly the bullet lines",
    bulletedText.length === bulletLines &&
      bulletedText.every((text) =>
        built.lines.some((l) => l.kind === "bullet" && l.text === text),
      ),
    `${bulletedText.length} of ${bulletLines}`,
  );
  check(
    "bullet runs are applied back to front",
    bulletRequests.every(
      (r, i) =>
        i === 0 ||
        (r.createParagraphBullets?.range?.startIndex ?? 0) <
          (bulletRequests[i - 1].createParagraphBullets?.range?.startIndex ?? 0),
    ),
  );

  const linkRequests = requests.filter((r) => r.updateTextStyle?.textStyle?.link?.url);
  console.log("\n  link ranges as Docs will see them:");
  for (const request of linkRequests) {
    const range = request.updateTextStyle!.range!;
    console.log(
      `    ${JSON.stringify(slice(range.startIndex, range.endIndex)).padEnd(34)} -> ${request.updateTextStyle!.textStyle!.link!.url}`,
    );
  }
  const expected = [
    ["9910980793", "tel:9910980793"],
    ["jobs@example.com", "mailto:jobs@example.com"],
    ["LinkedIn", "https://linkedin.com/in/anchitboruah"],
    ["GitHub", "https://github.com/anchitb"],
    ["Panel Health Monitor", "https://example.com/panel"],
  ];
  check(
    "each link covers exactly its label",
    expected.every(([text, url]) =>
      linkRequests.some(
        (r) =>
          slice(r.updateTextStyle!.range!.startIndex, r.updateTextStyle!.range!.endIndex) === text &&
          r.updateTextStyle!.textStyle!.link!.url === url,
      ),
    ),
  );

  const headings = requests.filter(
    (r) => r.updateParagraphStyle?.paragraphStyle?.namedStyleType === "HEADING_2",
  );
  check(
    "headings land on heading lines",
    headings.length > 0 &&
      headings.every(({ updateParagraphStyle }) =>
        built.lines.some(
          (l) =>
            l.kind === "heading" &&
            `${l.text}\n` ===
              slice(
                updateParagraphStyle!.range!.startIndex,
                updateParagraphStyle!.range!.endIndex,
              ),
        ),
      ),
    `${headings.length} headings`,
  );

  const skillLine = built.lines.find((l) => l.bold_prefix);
  const boldPrefix = requests.find(
    (r) =>
      r.updateTextStyle?.textStyle?.bold === true &&
      slice(r.updateTextStyle.range?.startIndex, r.updateTextStyle.range?.endIndex) ===
        skillLine!.text.slice(0, skillLine!.bold_prefix),
  );
  check("skill category prefix is bolded on its own", Boolean(boldPrefix));

  const margins = requests.find((r) => r.updateDocumentStyle);
  check(
    "resume margins are set",
    margins?.updateDocumentStyle?.documentStyle?.marginLeft?.magnitude === 40,
  );
}

async function checkIconStrip() {
  console.log("\n== removeIconGlyphs ==");
  const dirty =
    "Æ 9910980793 | [ jobs@example.com | ° LinkedIn |  GitHub | ½ Bengaluru, India";
  const doc: docs_v1.Schema$Document = {
    body: {
      content: [
        {
          paragraph: {
            elements: [{ startIndex: 1, textRun: { content: `${dirty}\n` } }],
          },
        },
      ],
    },
  };
  const { client, sent } = stubClient(doc);
  const changed = await client.removeIconGlyphs("doc");
  check("reports a change", changed);

  // Apply the deletions to the text the same way Docs would.
  let text = dirty;
  for (const request of sent[0]) {
    const range = request.deleteContentRange!.range!;
    text =
      text.slice(0, range.startIndex! - 1) + text.slice(range.endIndex! - 1);
  }
  console.log(`  before: ${dirty}`);
  console.log(`  after : ${text}`);
  check(
    "the contact row survives without the icons",
    text === "9910980793 | jobs@example.com | LinkedIn | GitHub | Bengaluru, India",
    JSON.stringify(text),
  );
}

async function checkKnownLinks() {
  console.log("\n== applyKnownLinks ==");
  const line = "9910980793 | jobs@example.com | LinkedIn | github.com/anchitb";
  const doc: docs_v1.Schema$Document = {
    body: {
      content: [
        {
          paragraph: {
            elements: [{ startIndex: 1, textRun: { content: `${line}\n` } }],
          },
        },
      ],
    },
  };
  const { client, sent } = stubClient(doc);
  await client.applyKnownLinks("doc", [
    { text: "LinkedIn", url: "https://linkedin.com/in/anchitboruah" },
  ]);
  const applied = (sent[0] ?? []).map((r) => ({
    text: line.slice(
      r.updateTextStyle!.range!.startIndex! - 1,
      r.updateTextStyle!.range!.endIndex! - 1,
    ),
    url: r.updateTextStyle!.textStyle!.link!.url,
  }));
  for (const a of applied) console.log(`  ${a.text.padEnd(22)} -> ${a.url}`);
  check(
    "the known label is linked",
    applied.some(
      (a) => a.text === "LinkedIn" && a.url === "https://linkedin.com/in/anchitboruah",
    ),
  );
  check(
    "a bare address becomes a mailto",
    applied.some((a) => a.text === "jobs@example.com" && a.url === "mailto:jobs@example.com"),
  );
  check(
    "a bare profile URL becomes a link",
    applied.some(
      (a) => a.text === "github.com/anchitb" && a.url === "https://github.com/anchitb",
    ),
  );
}

async function main() {
  await checkStructuredWrite();
  await checkIconStrip();
  await checkKnownLinks();
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\nall checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
