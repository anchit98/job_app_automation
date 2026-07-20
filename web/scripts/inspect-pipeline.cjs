const Database = require("better-sqlite3");
const db = new Database("data/app.db");

console.log(
  "pipelines",
  db
    .prepare(
      "SELECT id, status, current_stage, substr(COALESCE(error,''),1,100) AS err, updated_at FROM pipeline_runs ORDER BY created_at DESC LIMIT 5",
    )
    .all(),
);

console.log(
  "pending_ext",
  db
    .prepare(
      "SELECT prompt_run_id, kind, status, substr(COALESCE(error,''),1,80) AS e, created_at FROM pending_extension_runs ORDER BY created_at DESC LIMIT 8",
    )
    .all(),
);

console.log(
  "resume_runs",
  db
    .prepare(
      "SELECT id, kind, status, created_at FROM prompt_runs WHERE kind = 'resume' ORDER BY created_at DESC LIMIT 5",
    )
    .all(),
);

console.log(
  "ext_token",
  db.prepare("SELECT token_prefix, revoked_at, created_at FROM extension_tokens").all(),
);

const latest = db
  .prepare(
    "SELECT id, stages_json FROM pipeline_runs ORDER BY created_at DESC LIMIT 1",
  )
  .get();
if (latest) {
  const stages = JSON.parse(latest.stages_json);
  console.log(
    "latest stages",
    stages.map((s) => ({ id: s.id, status: s.status, pr: s.prompt_run_id?.slice?.(0, 8) })),
  );
}

db.close();
