/**
 * Assert the pure logic behind the Final Changes list actually behaves.
 *
 * Everything checked here runs without a database or a network call, so it can
 * be re-run after any edit. The parts that need Postgres or OpenAI are checked
 * by check-jobs-search.ts and check-cover-letter-latex.ts instead.
 *
 * Usage: npx tsx scripts/check-final-changes.ts
 */
import {
  COMPOSE_PLATFORMS,
  GMAIL_URL_LIMIT,
  buildComposeLinks,
  buildEmailSendPack,
  isComposePlatform,
} from "../src/lib/emails/manual-send";
import {
  FOLLOW_UP_INTERVAL_DAYS,
  nextFollowUpDueAt,
  parseDbTimestamp,
} from "../src/lib/follow-ups/business-days";
import {
  buildApplicantInstructions,
  buildJdContentWithInstructions,
} from "../src/lib/resume/context";
import {
  APPLICATION_SORTS,
  buildSearchTokens,
  isApplicationSort,
  parseApplicationSearchParams,
} from "../src/lib/tracker/search";
import { enrichJdKeywords } from "../src/lib/resume/jd-keyword-mining";
import { generateCoverLetterLatex } from "../src/lib/builder/cover-letter-latex";
import type { Application } from "../src/lib/db/types";

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ---------------------------------------------------------------------------
section("Apply — JD notes must reach the resume prompt");

const application = {
  id: "app-1",
  company: "Acme",
  role: "Senior PM",
  job_url: null,
  jd_raw: "We need a PM who ships payments.",
  jd_parsed: null,
  status: "draft",
  notes: "Call me Senior Product Manager, and lead with the payments work.",
  notes_html: null,
  language: null,
  company_blurb: null,
  email_instructions: null,
  created_at: "2026-09-01 10:00:00",
  updated_at: "2026-09-01 10:00:00",
} as unknown as Application;

const resumePrompt = buildJdContentWithInstructions(application);
check(
  "notes appear in the resume prompt",
  resumePrompt.includes("lead with the payments work"),
);
check(
  "notes are marked as must-obey",
  /MUST BE OBEYED/.test(resumePrompt),
);
check(
  "notes are delimited so they cannot pose as instructions",
  resumePrompt.includes("<applicant_instructions>") &&
    resumePrompt.includes("</applicant_instructions>"),
);
check(
  "the JD itself is still in the prompt",
  resumePrompt.includes("We need a PM who ships payments."),
);
check(
  "the block is scoped to the resume",
  resumePrompt.includes("them in the resume you return"),
);
check(
  "no notes means no instruction block at all",
  buildApplicantInstructions({ ...application, notes: null }) === "" &&
    buildApplicantInstructions({ ...application, notes: "   " }) === "",
);

// ---------------------------------------------------------------------------
section("Pipeline — compose links per platform");

const pack = buildEmailSendPack({
  email_id: "e1",
  to: "recruiter@acme.com",
  subject: "PM role — quick note",
  body_md: "Hi **Dana**,\n\nSee [my work](https://a.example/x?y=1).",
  signature: {
    full_name: "Aditi Rao",
    phone: "+91 98765 43210",
    linkedin_url: "https://linkedin.com/in/aditi",
    github_url: null,
    portfolio_url: null,
  },
});

const links = buildComposeLinks(pack);

check(
  "every declared platform produces a link",
  COMPOSE_PLATFORMS.every((p) => Boolean(links[p]?.url)),
);
check(
  "gmail opens compose, not the inbox",
  links.gmail.url.startsWith("https://mail.google.com/mail/?view=cm") &&
    !links.gmail.url.includes("/mail/u/0/"),
  links.gmail.url.slice(0, 60),
);
check(
  "gmail uses su= for the subject",
  links.gmail.url.includes("su=PM%20role"),
);
check(
  "outlook work host",
  links.outlook.url.startsWith("https://outlook.office.com/mail/deeplink/compose?"),
);
check(
  "outlook personal host",
  links.outlook_personal.url.startsWith(
    "https://outlook.live.com/mail/0/deeplink/compose?",
  ),
);
check(
  "outlook uses subject=",
  links.outlook.url.includes("subject=PM%20role"),
);
check("mailto scheme", links.mailto.url.startsWith("mailto:recruiter@acme.com?"));
check(
  "the @ is not percent-encoded",
  !links.gmail.url.includes("%40") && !links.mailto.url.includes("%40"),
);
check(
  "body travels in the link for a normal email",
  COMPOSE_PLATFORMS.every((p) => links[p].body_included),
);
check(
  "markdown is flattened and the link URL survives",
  pack.body_text.includes("Hi Dana") &&
    pack.body_text.includes("my work (https://a.example/x?y=1)") &&
    !pack.body_text.includes("**"),
);
check(
  "signature is appended",
  pack.body_text.includes("Aditi Rao") && pack.body_text.includes("98765"),
);

const hugePack = { ...pack, body_text: "x".repeat(GMAIL_URL_LIMIT * 2) };
const hugeLinks = buildComposeLinks(hugePack);
check(
  "an over-long body is dropped rather than silently truncated",
  COMPOSE_PLATFORMS.every((p) => hugeLinks[p].body_included === false) &&
    COMPOSE_PLATFORMS.every((p) => !hugeLinks[p].url.includes("body=")),
);
check(
  "an over-long link still carries recipient and subject",
  hugeLinks.gmail.url.includes("recruiter@acme.com") &&
    hugeLinks.gmail.url.includes("su="),
);
check("platform guard rejects junk", !isComposePlatform("yahoo"));

// ---------------------------------------------------------------------------
section("Follow-ups — every 3 days");

check("interval is 3", FOLLOW_UP_INTERVAL_DAYS === 3);

const from = new Date("2026-09-10T09:00:00Z");
const due = nextFollowUpDueAt(from);
check(
  "due date is exactly 3 calendar days later",
  due.toISOString() === "2026-09-13T09:00:00.000Z",
  due.toISOString(),
);

// Friday + 3 must land on Monday, not skip the weekend into Wednesday.
const friday = new Date("2026-09-11T09:00:00Z");
check(
  "weekends are not skipped (calendar days, as asked)",
  nextFollowUpDueAt(friday).toISOString() === "2026-09-14T09:00:00.000Z",
  nextFollowUpDueAt(friday).toISOString(),
);

check(
  "DB timestamps without a zone marker are read as UTC",
  parseDbTimestamp("2026-09-10 11:20:57.583459")?.toISOString() ===
    "2026-09-10T11:20:57.583Z",
);
check("empty timestamp is null, not Invalid Date", parseDbTimestamp("") === null);

// ---------------------------------------------------------------------------
section("Jobs — search and sort");

check(
  "case is folded",
  buildSearchTokens("GOOGLE")[0] === "google" &&
    buildSearchTokens("Google")[0] === "google",
);
check("partial words survive", buildSearchTokens("goog")[0] === "goog");
check(
  "LIKE wildcards cannot be injected through the box",
  buildSearchTokens("50% off").every((t) => !t.includes("%")),
);
check("single characters are dropped", buildSearchTokens("a").length === 0);
check("language names keep their punctuation", buildSearchTokens("c++")[0] === "c++");
check(
  "token count is capped",
  buildSearchTokens("a1 b2 c3 d4 e5 f6 g7 h8 i9 j10 k11").length === 8,
);
check(
  "sort defaults to recent activity",
  parseApplicationSearchParams({}).sort === "recent",
);
check(
  "a bogus sort falls back rather than reaching SQL",
  parseApplicationSearchParams({ sort: "; DROP TABLE" }).sort === "recent",
);
check(
  "all three sorts asked for are offered",
  APPLICATION_SORTS.length === 3 &&
    ["recent", "applied", "name"].every((s) => isApplicationSort(s)),
);

// ---------------------------------------------------------------------------
section("Apply — JD keyword extraction");

const thinModelResult = {
  must_have_keywords: ["Python"],
  nice_to_have_keywords: [],
  tech_stack: [],
};
const jd = `Requirements
- Strong Python and SQL, building ETL pipelines
- Airflow, dbt, Snowflake
- CI/CD and Kubernetes

Nice to have
- Terraform

What we offer
- ESOPs and a great LTIP
`;
const enriched = enrichJdKeywords(thinModelResult, jd);
const musts = enriched.must_have_keywords ?? [];

check("the model's own keywords come first and survive", musts[0] === "Python");
check("SQL recovered", musts.includes("SQL"));
check("acronyms recovered", musts.includes("ETL") && musts.includes("CI/CD"));
check("named tools recovered", musts.includes("Airflow") && musts.includes("dbt"));
check(
  "nice-to-have stays separate",
  (enriched.nice_to_have_keywords ?? []).includes("Terraform") &&
    !musts.includes("Terraform"),
);
check(
  "benefits section is not mined for keywords",
  !musts.includes("ESOPS") && !musts.includes("LTIP"),
  musts.join(", "),
);
check(
  "no duplicates",
  new Set(musts.map((k) => k.toLowerCase())).size === musts.length,
);

// ---------------------------------------------------------------------------
section("Cover letter — LaTeX escaping");

const latex = generateCoverLetterLatex({
  content: {
    opening_hook: "hook",
    why_this_role: "role",
    evidence_points: ["a", "b"],
    why_this_company: "company",
    cta: "cta",
    body:
      "Cut costs by 30% at R&D while owning a $4M P&L and 100% of the {roadmap}; " +
      "details at https://a.example/x?y=1&z=2. That is the shape of the last two years " +
      "and why this role is the obvious next one for me.",
  },
  profile: {
    full_name: "Aditi Rao",
    email: "a@b.com",
    phone: "+91 1",
    location: "Bengaluru",
    linkedin_url: "linkedin.com/in/aditi",
    portfolio_url: null,
  },
  company: "Acme & Co.",
  role: "Senior PM",
  date: new Date("2026-09-10T00:00:00Z"),
});

check("percent is escaped", latex.includes("30\\%"));
check("ampersand is escaped", latex.includes("R\\&D"));
check("dollar is escaped", latex.includes("\\$4M"));
check("braces are escaped", latex.includes("\\{roadmap\\}"));
check("company ampersand is escaped in the greeting", latex.includes("Acme \\& Co."));
check(
  "no raw special chars leak into the body",
  !/(^|[^\\])%/m.test(latex.split("\\begin{document}")[1] ?? ""),
);
check("document is complete", latex.includes("\\end{document}"));
check(
  "letterhead carries name and contact",
  latex.includes("Aditi Rao") && latex.includes("mailto:a@b.com"),
);
check("no placeholder survived", !latex.includes("PLACEHOLDER"));

// ---------------------------------------------------------------------------
console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
