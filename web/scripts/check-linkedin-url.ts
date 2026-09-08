/**
 * PARKED - covers src/lib/contacts/linkedin-url.ts, which nothing imports yet.
 *
 * What a LinkedIn profile URL gives us, and what it does not.
 *
 * The name feeds the email pattern generator, so a wrong split is worse than
 * no split — "srish.tihanda@acme.com" looks right, gets sent, and bounces.
 * These cases fix where the line sits.
 *
 *   npx tsx scripts/check-linkedin-url.ts
 */
import { parseLinkedInProfile } from "@/lib/contacts/linkedin-url";
import {
  generateEmailPatterns,
  parseNameParts,
} from "@/lib/contacts/pattern-generator";

const cases: Array<[string, string | null]> = [
  ["https://www.linkedin.com/in/srishtihanda/", null],
  ["https://www.linkedin.com/in/priya-sharma-8a2b1c/", "Priya Sharma"],
  ["https://www.linkedin.com/in/john-smith", "John Smith"],
  ["linkedin.com/in/anchit-boruah-123456789", "Anchit Boruah"],
  ["https://in.linkedin.com/in/rahul-verma-b4a91230/", "Rahul Verma"],
  [
    "https://www.linkedin.com/in/nirpendra-nath-mishra-4a2b1c/?originalSubdomain=in",
    "Nirpendra Nath Mishra",
  ],
  ["https://www.linkedin.com/in/maria-de-la-cruz/", "Maria De La Cruz"],
  ["https://www.linkedin.com/in/robert-fox-jr-77a12/", "Robert Fox JR"],
  ["https://www.linkedin.com/in/o'brien-kelly/", "O'Brien Kelly"],
  ["priya-sharma-8a2b1c", "Priya Sharma"],
  ["https://www.linkedin.com/company/acme/", null],
  ["https://example.com/in/john-smith", null],
  ["not a url at all", null],
];

let failures = 0;
let named = 0;

console.log("url → name\n");
for (const [input, expected] of cases) {
  const parsed = parseLinkedInProfile(input);
  const actual = parsed?.name ?? null;
  const isProfile = parsed !== null;
  // A non-profile URL must not parse at all; a profile URL may still yield no
  // name, and that is a legitimate answer.
  const ok = expected === null ? actual === null : actual === expected;
  if (!ok) failures += 1;
  if (actual) named += 1;

  console.log(
    `${ok ? "  ok  " : " FAIL "} ${input.slice(0, 62).padEnd(64)} ${
      isProfile ? (actual ?? "(ask the user)") : "(not a profile url)"
    }`,
  );
}

console.log("\nwhat the pattern generator does with one of them:\n");
const parsed = parseLinkedInProfile(
  "https://www.linkedin.com/in/priya-sharma-8a2b1c/",
);
const parts = parseNameParts(parsed!.name!);
for (const email of generateEmailPatterns(parts!, "acme.com")) {
  console.log(`    ${email}`);
}

const profiles = cases.filter(([, expected]) => expected !== null).length;
console.log(
  `\nname recovered for ${named} of ${profiles} real profile urls; the rest need one field typed`,
);
if (failures) {
  console.error(`${failures} case(s) failed`);
  process.exit(1);
}
console.log("all cases behave as intended");
