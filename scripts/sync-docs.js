const fs = require("fs");
const path = require("path");

if (!fs.existsSync("README.md") || !fs.existsSync("docs/FEATURES.md")) {
  console.error("FAILED: README.md or docs/FEATURES.md not found. Run scripts/create-docs-files.js first.");
  process.exit(1);
}

const backupDir = "scripts/backup-docs-sync";
fs.mkdirSync(backupDir, { recursive: true });

function patch(file, edits) {
  let src = fs.readFileSync(file, "utf8");
  const backup = path.join(backupDir, file.replace(/[\\/]/g, "__") + ".bak");
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, "utf8");
  console.log(file);
  edits.forEach(function (e) {
    if (src.indexOf(e.to) >= 0) {
      console.log("   already done: " + e.label);
    } else if (src.indexOf(e.from) < 0) {
      console.log("   NOT FOUND (left as it is): " + e.label);
    } else {
      src = src.replace(e.from, e.to);
      console.log("   updated: " + e.label);
    }
  });
  fs.writeFileSync(file, src, "utf8");
  return src;
}

patch("README.md", [
  {
    label: "Playwright status",
    from: "- Playwright is installed, but no browser tests are written yet",
    to: "- Playwright browser tests are written in `tests/e2e`, but have not been run successfully yet. They start MongoDB, the site and Chrome together, which is heavy for a computer with little memory",
  },
  {
    label: "test numbers",
    from: "239 unit tests and 290 integration tests passed, and the",
    to: "the unit and integration tests passed (see `docs/TEST-REPORT.md` for the numbers once it exists), and the",
  },
  {
    label: "e2e command row",
    from: "| `node scripts/verify-all.js` | Checks files",
    to: "| `npm run test:e2e` | Browser tests on a temporary local database (heavy: MongoDB, the site and Chrome run together) |\n| `node scripts/verify-all.js` | Checks files",
  },
]);

const features = patch("docs/FEATURES.md", [
  {
    label: "Playwright row",
    from: "| Browser end-to-end tests (Playwright) | Installed, none written |",
    to: "| Browser end-to-end tests (Playwright) | Written in `tests/e2e`, not run successfully yet |",
  },
  {
    label: "business row",
    from: "| Business portal (`/business/*`, 6 pages) | The business role and workflow are not decided |",
    to: "| Business portal (`/business/*`, 6 pages) | The business role and workflow are not decided. The pages show a plain notice |",
  },
  {
    label: "forgot password row",
    from: "| Forgot or reset password | Not built | Needs an email provider |",
    to: "| Forgot or reset password | Not built | The pages say so plainly. Needs an email provider |",
  },
  {
    label: "MFA row",
    from: "| Multi-factor authentication for administrators | Not designed yet |",
    to: "| Multi-factor authentication for administrators | A one-time-code library exists (`lib/totp.js`, tested with the RFC values) but it is not connected to sign-in |",
  },
]);

if (features.indexOf("## Added later") < 0) {
  const extra = [
    "",
    "## Added later",
    "",
    "| Feature | Status | Notes |",
    "|---|---|---|",
    "| Public Our Impact page (`/impact`) | Built | Live counts only. No recycling or composting figures |",
    "| Public Learn articles (`/learn`) and the content library | Built | Plain text, drafts are never public |",
    "| Honest status pages: forgot password, media, operations map | Built | They state that the feature is not available. No fake forms |",
    "| Accessibility code check (`node scripts/check-a11y.js`) | Built | Reads source files only. It cannot judge colour contrast or screen readers |",
    "| Test report and zip scripts (`scripts/make-release.js`) | Built | The report is made only from a passing full check |",
    "",
  ].join("\n");
  fs.appendFileSync("docs/FEATURES.md", extra);
  console.log("docs/FEATURES.md\n   added: Added later section");
}

if (fs.existsSync("docs/SECURITY.md")) {
  patch("docs/SECURITY.md", [
    {
      label: "MFA note",
      from: "- No multi-factor authentication yet.",
      to: "- No multi-factor authentication yet. A tested one-time-code library exists but it is not connected to sign-in.",
    },
  ]);
}

const SRV = "mongodb" + "+srv://";
let bad = 0;
["README.md", "docs/FEATURES.md", "docs/SECURITY.md"].forEach(function (f) {
  if (fs.existsSync(f) && fs.readFileSync(f, "utf8").indexOf(SRV) >= 0) {
    console.log("FAIL: database address found in " + f);
    bad++;
  }
});
if (bad > 0) process.exit(1);
console.log("\nDone. Backups are in " + backupDir);