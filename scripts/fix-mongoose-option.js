const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was changed.");
  process.exit(1);
}

const roots = ["actions", "services", "lib", "app", "models", "components", "auth.js"];
const skip = ["node_modules", ".next"];
const pattern = /\bnew:\s*true\b/g;
const replacement = 'returnDocument: "after"';
const backupDir = "scripts/backup-mongoose-option";

function collect(p, out) {
  if (!fs.existsSync(p)) return out;
  const stat = fs.statSync(p);
  if (stat.isFile()) {
    if (p.endsWith(".js")) out.push(p);
    return out;
  }
  fs.readdirSync(p).forEach(function (name) {
    if (skip.indexOf(name) === -1) collect(path.join(p, name), out);
  });
  return out;
}

const files = [];
roots.forEach(function (r) {
  collect(r, files);
});

const targets = [];
files.forEach(function (f) {
  const src = fs.readFileSync(f, "utf8");
  const matches = src.match(pattern);
  if (matches) targets.push({ file: f, count: matches.length, src: src });
});

if (targets.length === 0) {
  console.log("Nothing to change: no 'new: true' found. All files already use returnDocument.");
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });

let total = 0;
targets.forEach(function (t) {
  const backupName = t.file.replace(/[\\/]/g, "__") + ".bak";
  const dest = path.join(backupDir, backupName);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, t.src, "utf8");
  fs.writeFileSync(t.file, t.src.replace(pattern, replacement), "utf8");
  total += t.count;
  console.log("Changed (" + t.count + "): " + t.file.replace(/\\/g, "/"));
});

// Verify: nothing left, and every changed file still has the new option.
let failed = 0;
console.log("\nVerification:");
targets.forEach(function (t) {
  const after = fs.readFileSync(t.file, "utf8");
  if (pattern.test(after)) {
    console.log(" FAIL (new: true still present): " + t.file);
    failed++;
  } else if (!after.includes(replacement)) {
    console.log(" FAIL (replacement missing): " + t.file);
    failed++;
  } else {
    console.log(" OK: " + t.file.replace(/\\/g, "/"));
  }
  pattern.lastIndex = 0;
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention. Backups are in " + backupDir);
  process.exit(1);
}
console.log("\nALL OK: " + total + " replacement(s) in " + targets.length + " file(s). Backups: " + backupDir);
console.log("Now run: npm run test:integration, then npm test, then npm run build.");