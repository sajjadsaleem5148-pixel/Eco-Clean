const fs = require("fs");
const path = require("path");

const file = "tests/integration/impact.test.js";
if (!fs.existsSync(file)) {
  console.log("FAILED: " + file + " not found.");
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");
if (src.indexOf("withUniques(") >= 0) {
  console.log("Already fixed. Nothing changed.");
  process.exit(0);
}

const backupDir = "scripts/backup-test-fix";
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, "impact.test.js.2.bak");
if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, "utf8");

const helper = [
  "// Fills every unique field of the model with a different value, so raw inserts cannot clash on null.",
  "function withUniques(Model, rows) {",
  "  const fields = new Set();",
  "  Model.schema.indexes().forEach(function (idx) {",
  "    if (idx[1] && idx[1].unique) Object.keys(idx[0]).forEach(function (k) { fields.add(k); });",
  "  });",
  "  Object.keys(Model.schema.paths).forEach(function (p) {",
  "    const o = Model.schema.paths[p].options;",
  "    if (o && o.unique) fields.add(p);",
  "  });",
  "  fields.delete('_id');",
  "  return rows.map(function (row, i) {",
  "    const copy = Object.assign({}, row);",
  "    fields.forEach(function (f) {",
  "      if (copy[f] === undefined) copy[f] = 'U-' + i + '-' + f;",
  "    });",
  "    return copy;",
  "  });",
  "}",
  "",
].join("\n");

const marker = 'describe("getImpactFigures"';
const at = src.indexOf(marker);
if (at < 0) {
  console.log("FAILED: could not find the describe block.");
  process.exit(1);
}
src = src.slice(0, at) + helper + "\n" + src.slice(at);

const call = "GreenPointsTransaction.collection.insertMany([";
const start = src.indexOf(call);
if (start < 0) {
  console.log("FAILED: could not find the insertMany call.");
  process.exit(1);
}
const close = src.indexOf("]);", start);
if (close < 0) {
  console.log("FAILED: could not find the end of the insertMany call.");
  process.exit(1);
}
src =
  src.slice(0, start) +
  "GreenPointsTransaction.collection.insertMany(withUniques(GreenPointsTransaction, [" +
  src.slice(start + call.length, close) +
  "]));" +
  src.slice(close + 3);

fs.writeFileSync(file, src, "utf8");
console.log("FIXED: " + file);