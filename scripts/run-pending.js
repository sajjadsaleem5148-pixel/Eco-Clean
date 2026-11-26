const fs = require("fs");
const { spawnSync } = require("child_process");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder.");
  process.exit(1);
}

const full = process.argv.includes("full");

function read(f) {
  try {
    return fs.readFileSync(f, "utf8");
  } catch (e) {
    return null;
  }
}

function notPlaceholder(f) {
  const src = read(f);
  return src !== null && src.indexOf("PlaceholderPage") < 0;
}

const steps = [
  {
    name: "Docs (README, features, deployment, security)",
    script: "scripts/create-docs-files.js",
    done: function () {
      return fs.existsSync("docs/FEATURES.md");
    },
  },
  {
    name: "Honest status pages (forgot password, media, operations map)",
    script: "scripts/create-honest-pages.js",
    done: function () {
      return notPlaceholder("app/admin/(panel)/media/page.js") && notPlaceholder("app/(auth)/forgot-password/page.js");
    },
  },
  {
    name: "Public impact page",
    script: "scripts/create-impact-files.js",
    done: function () {
      return fs.existsSync("services/impact.js");
    },
  },
  {
    name: "Business pages (plain notices)",
    script: "scripts/create-business-pages.js",
    done: function () {
      return fs.existsSync("components/ui/UnavailableNotice.js") && notPlaceholder("app/business/page.js");
    },
  },
  {
    name: "TOTP core (not wired into login)",
    script: "scripts/create-totp-core.js",
    done: function () {
      return fs.existsSync("lib/totp.js");
    },
  },
];

function tail(text, n) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-n)
    .map(function (l) {
      return "     " + l;
    })
    .join("\n");
}

const results = [];
let stopped = false;

console.log("Checking and running pending scripts...\n");

for (const s of steps) {
  if (stopped) {
    results.push("NOT RUN   " + s.name + " (an earlier step failed)");
    continue;
  }
  if (s.done()) {
    results.push("SKIPPED   " + s.name + " (already done)");
    continue;
  }
  if (!fs.existsSync(s.script)) {
    results.push("MISSING   " + s.name + " (" + s.script + " not found; ask me to send it again)");
    continue;
  }
  console.log("Running " + s.script + " ...");
  const r = spawnSync("node", [s.script], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  const out = (r.stdout || "") + "\n" + (r.stderr || "");
  if (r.status === 0 && out.indexOf("ALL OK") >= 0) {
    results.push("DONE      " + s.name);
  } else {
    results.push("FAILED    " + s.name);
    console.log("\n--- last lines of " + s.script + " ---\n" + tail(out, 25) + "\n");
    stopped = true;
  }
}

console.log("\n==================== SUMMARY (copy from here) ====================");
results.forEach(function (l) {
  console.log(l);
});

if (!stopped) {
  console.log("\nAccessibility check:");
  if (fs.existsSync("scripts/check-a11y.js")) {
    const a = spawnSync("node", ["scripts/check-a11y.js"], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
    const out = (a.stdout || "") + "\n" + (a.stderr || "");
    const start = out.indexOf("Files checked:");
    const end = out.indexOf("==================== END OF SUMMARY");
    console.log(start >= 0 ? out.slice(start, end > start ? end : undefined).trim() : tail(out, 12));
  } else {
    console.log("scripts/check-a11y.js not found.");
  }
}
console.log("==================== END OF SUMMARY ====================");

if (stopped) {
  console.log("\nStopped at a failed step. Send me the lines above. Nothing else was run.");
  process.exit(1);
}

console.log("\nNow running: node scripts/verify-all.js" + (full ? "" : " quick") + "\n");
const v = spawnSync("node", full ? ["scripts/verify-all.js"] : ["scripts/verify-all.js", "quick"], { stdio: "inherit" });
process.exit(v.status === null ? 1 : v.status);