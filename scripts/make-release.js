const fs = require("fs");
const { spawnSync } = require("child_process");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder.");
  process.exit(1);
}

const mode = process.argv[2];
const SRV = "mongodb" + "+srv://";
const PLAIN_WITH_USER = "mongodb" + "://Eco-Clean";
const ZIP_NAME = "eco-clean-snapshot.zip";

function stop(message) {
  console.error("STOPPED: " + message);
  process.exit(1);
}

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function ensureIgnored(line) {
  const current = fs.existsSync(".gitignore") ? fs.readFileSync(".gitignore", "utf8") : "";
  if (current.split(/\r?\n/).indexOf(line) < 0) {
    fs.appendFileSync(".gitignore", (current.endsWith("\n") || current === "" ? "" : "\n") + line + "\n");
  }
}

if (mode === "report") {
  if (!fs.existsSync("verify-report.txt")) stop("verify-report.txt not found. Run: node scripts/verify-all.js");
  const text = fs.readFileSync("verify-report.txt", "utf8");
  const at = text.lastIndexOf("1) Module files");
  if (at < 0) stop("No summary found in verify-report.txt. Run: node scripts/verify-all.js");
  const summary = text.slice(at).trim();
  if (/skipped \(quick mode\)/.test(summary)) stop("That run was in quick mode. Run the full check: node scripts/verify-all.js");
  if (summary.indexOf("RESULT: ALL CHECKS PASSED") < 0) stop("The last check did not pass. A report is made only from a passing run.");
  if (summary.indexOf(SRV) >= 0) stop("The summary contains a database address.");

  const ranAt = fs.statSync("verify-report.txt").mtime;
  const ageHours = Math.round((Date.now() - ranAt.getTime()) / 3600000);
  if (ageHours > 24) console.log("WARNING: the check ran " + ageHours + " hours ago. Run it again if code has changed since.");

  const lines = [
    "# Test report",
    "",
    "Made by `node scripts/make-release.js report` from the output of `node scripts/verify-all.js`.",
    "The check ran at: " + ranAt.toISOString(),
    "Report written on: " + new Date().toISOString().slice(0, 10),
    "",
    "## Result of the last full check",
    "",
    "```",
    summary,
    "```",
    "",
    "## What this report does not show",
    "",
    "- Browser tests. Playwright test files exist in `tests/e2e`, but they have not been run on the author's computer.",
    "- Sign-in through Auth.js. It has no automated test.",
    "- How pages look. Design, colours and layout were not reviewed by an automated test.",
    "- Accessibility beyond the code checks of `node scripts/check-a11y.js`. Colour contrast, screen readers and keyboard order need a person.",
    "- Security. The code was not audited by a security professional. See `docs/SECURITY.md`.",
    "- A live deployment. Nothing was run on a production server. See `docs/DEPLOYMENT.md`.",
    "",
    "## What is not built",
    "",
    "See `docs/FEATURES.md`. The pages listed above as placeholders show a plain message and do not work yet.",
    "",
  ];
  fs.writeFileSync("docs/TEST-REPORT.md", lines.join("\n"), "utf8");
  ensureIgnored(ZIP_NAME);
  console.log("Written: docs/TEST-REPORT.md");
  console.log("Next: commit everything, then run: node scripts/make-release.js zip");
} else if (mode === "zip") {
  if (git(["rev-parse", "--is-inside-work-tree"]).out !== "true") stop("This folder is not a git repository.");

  const dirty = git(["status", "--porcelain"]).out;
  if (dirty) stop("There are uncommitted changes. Commit them first, because the zip contains only committed files.\n" + dirty.split("\n").slice(0, 10).join("\n"));

  const tracked = git(["ls-files"]).out.split("\n").filter(Boolean);
  const envFiles = tracked.filter((f) => /(^|\/)\.env/.test(f) && !/\.env\.example$/.test(f));
  if (envFiles.length > 0) stop("An environment file is tracked by git: " + envFiles.join(", "));
  if (tracked.some((f) => f.indexOf("node_modules/") === 0 || f.indexOf(".next/") === 0)) {
    stop("node_modules or .next is tracked by git.");
  }
  if (tracked.indexOf("docs/TEST-REPORT.md") < 0) stop("docs/TEST-REPORT.md is not committed. Run the report step and commit it.");

  [SRV, PLAIN_WITH_USER].forEach(function (pattern) {
    const found = git(["grep", "-l", "-e", pattern, "HEAD", "--", ".", ":(exclude)package-lock.json"]);
    if (found.out) stop("A database address was found in committed files:\n" + found.out);
  });

  const made = git(["archive", "--format=zip", "--prefix=eco-clean/", "-o", ZIP_NAME, "HEAD"]);
  if (made.code !== 0 || !fs.existsSync(ZIP_NAME)) stop("git archive failed: " + made.err);

  const mb = (fs.statSync(ZIP_NAME).size / (1024 * 1024)).toFixed(1);
  const commit = git(["rev-parse", "--short", "HEAD"]).out;
  console.log("Created: " + ZIP_NAME + " (" + mb + " MB) from commit " + commit);
  console.log(tracked.length + " files. Secrets, node_modules and .next are not inside.");
  console.log("This is a work-in-progress snapshot. docs/FEATURES.md lists what is missing.");
} else {
  stop("Use: node scripts/make-release.js report    or    node scripts/make-release.js zip");
}