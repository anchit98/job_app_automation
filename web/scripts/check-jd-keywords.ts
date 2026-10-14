/**
 * Show what the deterministic keyword pass adds to a JD parse.
 *
 * Feeds a realistic job description through enrichJdKeywords with a
 * deliberately thin "model" result — the shape v1 of the prompt actually
 * returned — and prints what the second pass recovered.
 *
 * Usage: npx tsx scripts/check-jd-keywords.ts [path/to/jd.txt]
 */
import fs from "fs";
import {
  enrichJdKeywords,
  splitJdSections,
} from "../src/lib/resume/jd-keyword-mining";

const SAMPLE_JD = `Senior Data Engineer — Northwind Labs

About the team
We run a modern lakehouse on Snowflake and dbt, orchestrated with Airflow.

What you'll need
- 5+ years building ETL/ELT pipelines in Python and SQL
- Hands-on experience with Airflow, dbt and Snowflake
- Strong grasp of data modeling and warehouse design
- Comfortable with Docker, Kubernetes and CI/CD
- Familiarity with AWS (S3, Lambda, Redshift)
- Track record of owning SLAs for production pipelines

Nice to have
- Exposure to Kafka or Spark streaming
- Experience with Terraform
- dbt Cloud administration

What we offer
- Competitive salary, ESOPs, and a remote-first culture
- Equal opportunity employer
`;

const path = process.argv[2];
const jd = path ? fs.readFileSync(path, "utf8") : SAMPLE_JD;

// What the old prompt typically came back with: a handful of terms, no acronyms.
const modelResult = {
  company: "Northwind Labs",
  role: "Senior Data Engineer",
  seniority: "Senior",
  must_have_keywords: ["Python", "SQL", "data pipelines"],
  nice_to_have_keywords: ["Kafka"],
  responsibilities: [],
  requirements: ["5+ years experience"],
  tech_stack: ["Snowflake"],
  location: "",
  remote_policy: "Remote",
};

const sections = splitJdSections(jd);
console.log(
  `Required section: ${sections.required.split("\n").length} lines; ` +
    `preferred section: ${sections.preferred.trim() ? sections.preferred.split("\n").length : 0} lines\n`,
);

const enriched = enrichJdKeywords(modelResult, jd);

function diff(label: string, before: string[], after: string[]) {
  const added = after.filter((k) => !before.includes(k));
  console.log(`${label}: ${before.length} -> ${after.length}`);
  console.log(`  model : ${before.join(", ") || "(none)"}`);
  console.log(`  added : ${added.join(", ") || "(none)"}\n`);
}

diff(
  "must_have_keywords",
  modelResult.must_have_keywords,
  enriched.must_have_keywords ?? [],
);
diff(
  "nice_to_have_keywords",
  modelResult.nice_to_have_keywords,
  enriched.nice_to_have_keywords ?? [],
);
diff("tech_stack", modelResult.tech_stack, enriched.tech_stack ?? []);
