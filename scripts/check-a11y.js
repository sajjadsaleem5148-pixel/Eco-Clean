const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder.");
  process.exit(1);
}

const issues = [];

function add(level, file, line, msg) {
  issues.push({ level: level, file: file.replace(/\\/g, "/"), line: line, msg: msg });
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next") walk(p, out);
    } else if (e.name.endsWith(".js") && !e.name.endsWith(".test.js")) {
      out.push(p);
    }
  });
  return out;
}

// Comments are removed but line breaks are kept, so line numbers stay correct.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, function (m) {
      return m.replace(/[^\n]/g, "");
    })
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

function tagSlice(src, start) {
  const rest = src.slice(start, start + 600);
  const ends = [rest.indexOf("/>"), rest.indexOf("</")].filter(function (n) {
    return n >= 0;
  });
  return ends.length ? rest.slice(0, Math.min.apply(null, ends)) : rest;
}

const files = walk("app", []).concat(walk("components", []));

files.forEach(function (file) {
  const raw = fs.readFileSync(file, "utf8");
  const src = stripComments(raw);
  let m;

  // Images need alt text.
  const img = /<img\b/g;
  while ((m = img.exec(src))) {
    if (tagSlice(src, m.index).indexOf("alt=") < 0) add("ERROR", file, lineOf(src, m.index), "image without alt text");
  }

  // Links that open a new tab need rel noopener.
  const blank = /target=["']_blank["']/g;
  while ((m = blank.exec(src))) {
    const around = src.slice(Math.max(0, m.index - 250), m.index + 250);
    if (around.indexOf("noopener") < 0) add("ERROR", file, lineOf(src, m.index), "target _blank without rel noopener");
  }

  // Removing the focus outline hides where the keyboard is.
  const outline = /\boutline-none\b/g;
  while ((m = outline.exec(src))) add("ERROR", file, lineOf(src, m.index), "outline-none hides keyboard focus");

  const raw_html = /dangerouslySetInnerHTML/g;
  while ((m = raw_html.exec(src))) add("ERROR", file, lineOf(src, m.index), "dangerouslySetInnerHTML is used");

  // Form fields compared with labels in the same file.
  let fields = 0;
  let firstField = 0;
  const field = /<(input|select|textarea)\b/g;
  while ((m = field.exec(src))) {
    const t = tagSlice(src, m.index);
    if (/type=["']hidden["']/.test(t)) continue;
    if (!firstField) firstField = lineOf(src, m.index);
    fields++;
  }
  if (fields > 0) {
    const labels =
      (src.match(/htmlFor=/g) || []).length +
      (src.match(/aria-label=/g) || []).length +
      (src.match(/aria-labelledby=/g) || []).length;
    if (labels < fields) {
      add("WARN", file, firstField, fields + " form field(s) but only " + labels + " label(s) in this file");
    }
  }

  // Tables need header cells with a scope.
  if (/<table\b/.test(src)) {
    if (!/<th(\s[^>]*)?>/.test(src)) {
      add("WARN", file, lineOf(src, src.search(/<table\b/)), "table without header cells (th)");
    } else {
      const th = /<th(\s[^>]*)?>/g;
      while ((m = th.exec(src))) {
        if (m[0].indexOf("scope=") < 0) add("WARN", file, lineOf(src, m.index), "th without scope");
      }
    }
  }

  // Clickable div or span cannot be used with a keyboard.
  const click = /<(div|span)\b[^>]*onClick=/g;
  while ((m = click.exec(src))) add("WARN", file, lineOf(src, m.index), "onClick on a div or span (not keyboard friendly)");

  const tab = /tabIndex=\{?["']?([1-9]\d*)/g;
  while ((m = tab.exec(src))) add("WARN", file, lineOf(src, m.index), "positive tabIndex changes the keyboard order");

  // A page should have a main heading, either itself or through a component it uses.
  const name = path.basename(file);
  const norm = file.replace(/\\/g, "/");
  if (name === "page.js" && norm.indexOf("app/api/") !== 0) {
    if (!/<h1\b/.test(src) && !/from ["']@\/components\//.test(src) && !/redirect\(/.test(src)) {
      add("WARN", file, 1, "page has no h1 and uses no shared component");
    }
  }
});

// The page language must be set.
const rootLayout = fs.existsSync("app/layout.js") ? fs.readFileSync("app/layout.js", "utf8") : "";
if (rootLayout.indexOf('lang="en"') < 0) add("ERROR", "app/layout.js", 1, 'the html element has no lang="en"');

const errors = issues.filter(function (i) {
  return i.level === "ERROR";
});
const warns = issues.filter(function (i) {
  return i.level === "WARN";
});

// Full list goes to a file, a short list goes to the screen.
const lines = issues.map(function (i) {
  return i.level + "  " + i.file + ":" + i.line + "  " + i.msg;
});
fs.writeFileSync("a11y-report.txt", lines.join("\n") + "\n", "utf8");

const ignore = fs.existsSync(".gitignore") ? fs.readFileSync(".gitignore", "utf8") : "";
if (ignore.split(/\r?\n/).indexOf("a11y-report.txt") < 0) {
  fs.appendFileSync(".gitignore", (ignore.endsWith("\n") || ignore === "" ? "" : "\n") + "a11y-report.txt\n");
}

// Add the npm command once.
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.scripts = pkg.scripts || {};
if (pkg.scripts["check:a11y"] !== "node scripts/check-a11y.js") {
  pkg.scripts["check:a11y"] = "node scripts/check-a11y.js";
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("Added: npm run check:a11y");
}

const byMessage = {};
issues.forEach(function (i) {
  const key = i.level + "  " + i.msg.replace(/\d+ form field\(s\) but only \d+ label\(s\)/, "fields without enough labels");
  byMessage[key] = (byMessage[key] || 0) + 1;
});

console.log("\n==================== SUMMARY (copy from here) ====================");
console.log("Files checked: " + files.length);
console.log("ERRORS: " + errors.length + "    WARNINGS: " + warns.length);
console.log("");
Object.keys(byMessage)
  .sort()
  .forEach(function (k) {
    console.log(" " + String(byMessage[k]).padStart(4) + "  " + k);
  });
console.log("");
console.log("First items:");
lines.slice(0, 25).forEach(function (l) {
  console.log(" " + l);
});
if (lines.length > 25) console.log(" ... " + (lines.length - 25) + " more in a11y-report.txt");
console.log("==================== END OF SUMMARY ====================");
process.exit(errors.length > 0 ? 1 : 0);