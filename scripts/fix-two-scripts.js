const fs = require("fs");
const path = require("path");

const backupDir = "scripts/backup-script-fix";
fs.mkdirSync(backupDir, { recursive: true });

function fix(file, steps) {
  if (!fs.existsSync(file)) {
    console.log("FAILED: " + file + " not found.");
    process.exit(1);
  }
  let src = fs.readFileSync(file, "utf8");
  const backup = path.join(backupDir, path.basename(file) + ".bak");
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, "utf8");
  console.log(file);
  steps.forEach(function (s) {
    const n = src.split(s.from).length - 1;
    if (n === 0) {
      console.log("   not found (already fixed?): " + s.label);
      return;
    }
    src = src.split(s.from).join(s.to);
    console.log("   FIXED (" + n + "): " + s.label);
  });
  fs.writeFileSync(file, src, "utf8");
}

// Two backslashes before a bracket become one.
const BAD = "\\\\(";
const GOOD = "\\(";

fix("scripts/create-household-files.js", [
  { from: BAD, to: GOOD, label: "regex syntax" },
  {
    from: "/collector/i.test(src.replace(/collector's|collection/gi, \"\"))",
    to: "/assignedCollector|populate\\(\"collector/.test(src)",
    label: "resident page check",
  },
]);

fix("scripts/create-overdue-files.js", [
  { from: BAD, to: GOOD, label: "regex syntax" },
  {
    from: "/reporter/.test(src)",
    to: "/reporter/.test(src.replace(/\\/\\/.*$/gm, \"\"))",
    label: "service check ignores comments",
  },
]);

console.log("\nDone. Now run the two scripts.");