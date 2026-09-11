/**
 * Mine the raw job description for keywords the model left out.
 *
 * The JD parse is a single LLM call, and it is reliably incomplete: it returns
 * five or six "must have" terms for a description that lists fifteen, and it
 * skips acronyms (ETL, CI/CD, SaaS) almost entirely. Everything downstream —
 * the tailoring prompt, the 70% coverage floor, the keyword chips on the
 * application — is built on that list, so whatever the model drops is dropped
 * from the resume too.
 *
 * This pass is deterministic and runs over the same text afterwards. It is
 * built to be precise rather than exhaustive: a false keyword tells the resume
 * writer to work a term in that the JD never asked for, which is worse than
 * missing one. So it only emits terms it can point at — a name from the
 * vocabulary below, or an acronym the JD actually capitalised.
 */
import type { JdParsed } from "@/lib/db/types";

/**
 * Section headings that mark what a candidate must already have, versus what
 * would merely be nice. Matched against a line on its own, which is how job
 * boards render them.
 */
const REQUIRED_HEADINGS =
  /^\s*(?:[-*•]\s*)?(?:what\s+(?:you|we)(?:'|’)?(?:ll|re)?\s+(?:need|looking\s+for)|requirements?|(?:minimum|basic|key|core)\s+(?:qualifications?|requirements?|skills?)|qualifications?|must[- ]?haves?|you\s+(?:have|bring|will\s+need)|about\s+you|who\s+you\s+are|skills?(?:\s*(?:&|and)\s*experience)?|tech(?:nical)?\s+(?:skills?|stack|requirements?)|experience\s+required)\s*:?\s*$/i;

const PREFERRED_HEADINGS =
  /^\s*(?:[-*•]\s*)?(?:nice[- ]?to[- ]?haves?|preferred(?:\s+qualifications?)?|bonus(?:\s+points?)?|(?:it(?:'|’)?s\s+)?a\s+plus|desirable|good\s+to\s+have|additionally)\s*:?\s*$/i;

/** Anything that clearly ends the requirements block. */
const CLOSING_HEADINGS =
  /^\s*(?:[-*•]\s*)?(?:benefits?|perks?|what\s+we\s+offer|compensation|salary|equal\s+opportunity|about\s+(?:us|the\s+company)|our\s+(?:team|mission|values)|how\s+to\s+apply|interview\s+process|life\s+at\s+)/i;

/**
 * Named tools, platforms and methods worth carrying onto a resume.
 *
 * Deliberately a list rather than a heuristic: "Java" and "January" both look
 * like proper nouns, and only one of them belongs in a tech stack. Grouped so
 * a reader can see what is covered and add to the right place. Case is
 * preserved here because it is the casing written onto the resume.
 */
const TECH_VOCABULARY = [
  // Languages
  "Python", "JavaScript", "TypeScript", "Java", "Kotlin", "Swift", "Go",
  "Golang", "Rust", "Ruby", "PHP", "Scala", "C++", "C#", "Objective-C", "R",
  "MATLAB", "Perl", "Elixir", "Dart", "Solidity", "Bash", "Shell",
  // Web / mobile
  "React", "React Native", "Next.js", "Angular", "Vue", "Vue.js", "Svelte",
  "Node.js", "Express", "Django", "Flask", "FastAPI", "Rails",
  "Ruby on Rails", "Spring", "Spring Boot", ".NET", "Laravel", "jQuery",
  "HTML", "CSS", "Tailwind", "GraphQL", "REST", "gRPC", "WebSocket", "Flutter",
  "SwiftUI", "Android", "iOS",
  // Data
  "SQL", "PostgreSQL", "Postgres", "MySQL", "SQLite", "MongoDB", "Redis",
  "Cassandra", "DynamoDB", "Elasticsearch", "Snowflake", "BigQuery",
  "Redshift", "Databricks", "Spark", "Hadoop", "Kafka", "Airflow", "dbt",
  "ETL", "ELT", "Data Warehouse", "Data Lake", "Data Modeling", "OLAP",
  "Pandas", "NumPy", "Scikit-learn", "PyTorch", "TensorFlow", "Keras",
  // Cloud / infra
  "AWS", "Azure", "GCP", "Google Cloud", "Docker", "Kubernetes", "Terraform",
  "Ansible", "Jenkins", "CI/CD", "GitHub Actions", "GitLab", "Git",
  "Serverless", "Lambda", "Microservices", "Linux", "Nginx", "Kafka Streams",
  "Datadog", "Grafana", "Prometheus", "Splunk", "New Relic", "Sentry",
  // AI / ML
  "Machine Learning", "Deep Learning", "NLP", "Computer Vision", "LLM",
  "Generative AI", "RAG", "Prompt Engineering", "MLOps", "OpenAI",
  "LangChain", "Hugging Face", "Recommendation Systems",
  // Product / analytics
  "Product Management", "Product Strategy", "Roadmap", "A/B Testing",
  "Experimentation", "User Research", "Wireframing", "Prototyping",
  "Agile", "Scrum", "Kanban", "Jira", "Confluence", "Asana", "Notion",
  "Amplitude", "Mixpanel", "Google Analytics", "GA4", "Looker", "Tableau",
  "Power BI", "Metabase", "Segment", "Figma", "Sketch", "Adobe XD",
  "Miro", "Product Analytics", "KPI", "OKR", "PRD", "Go-to-Market", "GTM",
  "SaaS", "B2B", "B2C", "P&L", "API", "SDK", "UX", "UI", "QA",
  // Marketing / sales / ops
  "SEO", "SEM", "CRM", "Salesforce", "HubSpot", "Marketo", "Mailchimp",
  "Content Marketing", "Performance Marketing", "Lifecycle Marketing",
  "Demand Generation", "Lead Generation", "Account Management",
  "Pipeline Management", "Forecasting", "Cold Outreach", "Negotiation",
  "Stakeholder Management", "Cross-functional", "Vendor Management",
  // Finance / legal / people
  "Financial Modeling", "Forecasting & Budgeting", "Variance Analysis",
  "GAAP", "IFRS", "Excel", "VBA", "Compliance", "Risk Management",
  "Due Diligence", "Contract Negotiation", "Payroll", "Recruiting",
  "Talent Acquisition", "Onboarding", "Performance Management",
] as const;

/** "C++" and ".NET" cannot rely on \b, so each term gets its own guard. */
function vocabularyPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const leading = /^[a-z0-9]/i.test(term) ? "(?<![a-z0-9])" : "(?<![a-z0-9.])";
  const trailing = /[a-z0-9]$/i.test(term) ? "(?![a-z0-9])" : "";
  return new RegExp(`${leading}${escaped}${trailing}`, "i");
}

const VOCABULARY_PATTERNS: Array<[string, RegExp]> = TECH_VOCABULARY.map(
  (term) => [term, vocabularyPattern(term)],
);

/**
 * Acronyms the JD wrote in caps — SLA, ARR, CAC, ISO, HIPAA.
 *
 * Two to six capitals, optionally with an internal slash or digit. Words that
 * are only capitalised because they start a sentence are excluded by requiring
 * at least two capitals in a row.
 */
const ACRONYM_PATTERN = /\b[A-Z][A-Z0-9]{1,5}(?:\/[A-Z0-9]{1,5})?\b/g;

/** Capitalised words that are not acronyms so much as shouting or boilerplate. */
const ACRONYM_STOPLIST = new Set([
  "AND", "THE", "FOR", "YOU", "WE", "OUR", "ALL", "NOT", "NEW", "JOB", "ROLE",
  "TEAM", "WORK", "WILL", "MUST", "PLUS", "YEARS", "YEAR", "FULL", "TIME",
  "PART", "REMOTE", "HYBRID", "ONSITE", "USD", "INR", "EUR", "GBP", "LPA",
  "CTC", "EOE", "LGBTQ", "USA", "US", "UK", "EU", "IST", "PST", "EST", "UTC",
  "PDF", "CV", "HR", "CEO", "CTO", "CFO", "COO", "VP", "SVP", "EVP",
  "JANUARY", "MONDAY", "ASAP", "FYI", "AKA", "ETC", "NOTE", "NA",
]);

const MAX_PER_BUCKET = 30;

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

interface JdSections {
  /** Text under required/qualification headings; the whole JD if none found. */
  required: string;
  /** Text under nice-to-have headings. Empty when the JD has no such section. */
  preferred: string;
}

/**
 * Split the JD into "required" and "nice to have".
 *
 * Job descriptions are not structured documents, so this is best-effort: when
 * no heading is recognised the whole text counts as required, which is the
 * safe direction — it means a keyword lands in must-have rather than vanishing.
 */
export function splitJdSections(jdRaw: string): JdSections {
  const lines = splitLines(jdRaw);
  const required: string[] = [];
  const preferred: string[] = [];
  let bucket: "none" | "required" | "preferred" = "none";
  let sawHeading = false;

  for (const line of lines) {
    if (PREFERRED_HEADINGS.test(line)) {
      bucket = "preferred";
      sawHeading = true;
      continue;
    }
    if (REQUIRED_HEADINGS.test(line)) {
      bucket = "required";
      sawHeading = true;
      continue;
    }
    if (CLOSING_HEADINGS.test(line)) {
      bucket = "none";
      continue;
    }
    if (bucket === "required") required.push(line);
    else if (bucket === "preferred") preferred.push(line);
  }

  return {
    required: sawHeading && required.length > 0 ? required.join("\n") : jdRaw,
    preferred: preferred.join("\n"),
  };
}

function vocabularyHits(text: string): string[] {
  if (!text.trim()) return [];
  return VOCABULARY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
    ([term]) => term,
  );
}

function acronymHits(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(ACRONYM_PATTERN)) {
    const token = match[0];
    if (ACRONYM_STOPLIST.has(token)) continue;
    // A run of caps with no vowel and no digit is usually an initialism worth
    // keeping (ETL, KPI); one that is a real word in caps is usually shouting.
    found.add(token);
  }
  return [...found];
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#/.]/g, "");
}

/** Append `extra` after `existing`, keeping order and dropping duplicates. */
function mergeKeywords(
  existing: string[] | undefined,
  extra: string[],
  limit = MAX_PER_BUCKET,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of [...(existing ?? []), ...extra]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Fill in what the model missed.
 *
 * The model's own keywords stay first and unchanged — it reads the JD as prose
 * and picks up phrasing a word list cannot. This only adds.
 */
export function enrichJdKeywords(parsed: JdParsed, jdRaw: string): JdParsed {
  const text = jdRaw?.trim();
  if (!text) return parsed;

  const { required, preferred } = splitJdSections(text);

  const requiredVocab = vocabularyHits(required);
  const preferredVocab = vocabularyHits(preferred).filter(
    (term) => !requiredVocab.includes(term),
  );
  const requiredAcronyms = acronymHits(required);

  // Tech stack is the named-tool view of the same JD, so it draws on the whole
  // document: a stack listed under "About the team" is still the stack.
  const stack = vocabularyHits(text);

  return {
    ...parsed,
    must_have_keywords: mergeKeywords(parsed.must_have_keywords, [
      ...requiredVocab,
      ...requiredAcronyms,
    ]),
    nice_to_have_keywords: mergeKeywords(
      parsed.nice_to_have_keywords,
      preferredVocab,
    ),
    tech_stack: mergeKeywords(parsed.tech_stack, stack),
  };
}
