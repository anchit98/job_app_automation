/**
 * Verify the compose links the manual send flow hands the user.
 *
 * Everything here is a URL the browser will hand to Gmail or to an OS mail
 * handler, so the failure mode is silent: a stray "&" ends the body early, an
 * over-long link is truncated without an error, and the user sends half an
 * email without noticing. Each check decodes the URL back and compares it with
 * what went in.
 *
 *   npx tsx scripts/check-manual-send.ts
 */
import {
  GMAIL_URL_LIMIT,
  MAILTO_URL_LIMIT,
  buildComposeLinks,
  buildEmailSendPack,
  emailBodyToPlainText,
} from "@/lib/emails/manual-send";

const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

/** Read one query parameter back out of a compose URL. */
function param(url: string, name: string): string | null {
  const query = url.slice(url.indexOf("?") + 1);
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    if (pair.slice(0, eq) === name) {
      return decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return null;
}

const signature = {
  full_name: "Anchit Boruuah",
  phone: "9910980793",
  linkedin_url: "https://linkedin.com/in/anchitboruah",
  github_url: null,
  portfolio_url: "https://anchit.dev",
};

function checkPlainText() {
  console.log("\n== markdown flattening ==");
  const markdown = [
    "## Hi Priya,",
    "",
    "I saw **Acme** is hiring for the *Product Manager* role.",
    "",
    "- Cut intake-to-handoff time by 70% at R&D scale",
    "* Held 88% CSAT across `six` products",
    "",
    "Portfolio: [anchit.dev](https://anchit.dev)",
    "Docs: [https://example.com](https://example.com)",
    "",
    "---",
    "",
    "> Happy to share more.",
  ].join("\n");

  const text = emailBodyToPlainText(markdown);
  console.log(text.split("\n").map((l) => `    ${l}`).join("\n"));

  check("heading marker removed", text.startsWith("Hi Priya,"));
  check("bold markers removed", !text.includes("**") && text.includes("Acme"));
  check("italic markers removed", text.includes("Product Manager") && !text.includes("*Product"));
  check("code ticks removed", !text.includes("`") && text.includes("six"));
  check("both bullet styles normalise to -", text.split("\n").filter((l) => l.startsWith("- ")).length === 2);
  check("link keeps its url", text.includes("anchit.dev (https://anchit.dev)"));
  check(
    "a link whose label is its url is not doubled",
    text.includes("Docs: https://example.com") && !text.includes("https://example.com (https"),
  );
  check("horizontal rule dropped", !text.includes("---"));
  check("quote marker dropped", text.includes("Happy to share more."));
  check("no run of blank lines", !/\n{3,}/.test(text));
}

function checkRoundTrip() {
  console.log("\n== compose links round-trip ==");
  const pack = buildEmailSendPack({
    email_id: "e1",
    to: "priya@acme.com",
    // Every character that ends a URL early if it is not encoded.
    subject: "R&D role — 70% faster #hiring?",
    body_md: "Hi Priya,\n\nSaw the R&D opening.\n\nBest,",
    signature,
  });

  const links = buildComposeLinks(pack);
  console.log(`    gmail : ${links.gmail.url.slice(0, 110)}…`);
  console.log(`    mailto: ${links.mailto.url.slice(0, 110)}…`);

  check("gmail carries the body", links.gmail.body_included);
  check("mailto carries the body", links.mailto.body_included);
  check(
    "gmail subject survives & and #",
    param(links.gmail.url, "su") === pack.subject,
    param(links.gmail.url, "su") ?? "null",
  );
  check("gmail body survives verbatim", param(links.gmail.url, "body") === pack.body_text);
  check("gmail recipient is readable", links.gmail.url.includes("to=priya@acme.com"));
  check("mailto subject survives", param(links.mailto.url, "subject") === pack.subject);
  check(
    "mailto body survives with CRLF line breaks",
    param(links.mailto.url, "body") === pack.body_text.replace(/\n/g, "\r\n"),
  );
  check(
    "mailto addresses the contact directly",
    links.mailto.url.startsWith("mailto:priya@acme.com?"),
  );
  check(
    "gmail link does not pin an account",
    !links.gmail.url.includes("/mail/u/0/"),
    links.gmail.url.slice(0, 40),
  );

  check("signature is appended", pack.body_text.includes("Contact Number: 9910980793"));
  check(
    "empty signature fields are dropped",
    !pack.body_text.includes("GitHub") && pack.body_text.includes("Online Portfolio"),
  );
}

function checkLengthGuard() {
  console.log("\n== length guard ==");
  const long = "This paragraph exists only to make the email long. ".repeat(60);
  const pack = buildEmailSendPack({
    email_id: "e2",
    to: "priya@acme.com",
    subject: "A very long note",
    body_md: long,
    signature,
  });
  const links = buildComposeLinks(pack);
  console.log(
    `    body ${pack.body_text.length} chars → gmail url ${links.gmail.url.length}, mailto url ${links.mailto.url.length}`,
  );

  check("mailto drops the body rather than truncating", !links.mailto.body_included);
  check("mailto stays under its limit", links.mailto.url.length <= MAILTO_URL_LIMIT);
  check("mailto still carries the subject", param(links.mailto.url, "subject") === pack.subject);
  check("mailto carries no partial body", param(links.mailto.url, "body") === null);
  check(
    "gmail still carries this one",
    links.gmail.body_included && links.gmail.url.length <= GMAIL_URL_LIMIT,
  );

  const huge = buildEmailSendPack({
    email_id: "e3",
    to: "priya@acme.com",
    subject: "Enormous",
    body_md: "Padding sentence for the length guard. ".repeat(400),
    signature,
  });
  const hugeLinks = buildComposeLinks(huge);
  check("gmail drops the body past its own limit", !hugeLinks.gmail.body_included);
  check("gmail stays under its limit", hugeLinks.gmail.url.length <= GMAIL_URL_LIMIT);
}

checkPlainText();
checkRoundTrip();
checkLengthGuard();

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nall checks passed");
