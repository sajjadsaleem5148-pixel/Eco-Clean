const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("components/ui/UnavailableNotice.js", `
import Link from "next/link";

export default function UnavailableNotice({ title, what }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        {what} Business accounts are not available yet, so there is nothing to show here.
      </p>
      <p className="mt-4 text-sm text-gray-800">
        If your organisation would like to work with ECO-CLEAN, please{" "}
        <Link href="/contact" className="font-semibold text-emerald-800 underline">contact us</Link>.
      </p>
      <p className="mt-2 text-sm">
        <Link href="/" className="font-semibold text-emerald-800 underline">Back to the home page</Link>
      </p>
    </section>
  );
}
`);

const pages = [
  ["app/business/page.js", "Business Portal", "The business portal has not been built."],
  ["app/business/dashboard/page.js", "Business Dashboard", "There is no business dashboard."],
  ["app/business/collections/page.js", "Business Collections", "Business collection records are not kept yet."],
  ["app/business/invoices/page.js", "Business Invoices", "There is no invoicing, and no invoice or payment figures exist."],
  ["app/business/locations/page.js", "Business Locations", "Business locations cannot be added yet."],
  ["app/business/reports/page.js", "Business Reports", "There are no business reports."],
];

pages.forEach(function (p) {
  const file = p[0];
  const title = p[1];
  const what = p[2];
  write(
    file,
    [
      'import UnavailableNotice from "@/components/ui/UnavailableNotice";',
      "",
      'export const metadata = { title: "' + title + ' | ECO-CLEAN" };',
      "",
      "export default function Page() {",
      '  return <UnavailableNotice title="' + title + '" what="' + what + '" />;',
      "}",
      "",
    ].join("\n")
  );
});

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

let failed = 0;
console.log("\nVerification:");
written.forEach(function (f) {
  const src = fs.readFileSync(f, "utf8");
  const code = stripComments(src);
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("still a placeholder");
  if (/animate-|hover:scale|transition|gradient|dangerouslySetInnerHTML/.test(code)) problems.push("animation, gradient or raw HTML");
  if (/<form\b|<input\b/.test(code)) problems.push("must not contain a form");
  if (f.indexOf("UnavailableNotice") >= 0 && !code.includes("<h1")) problems.push("needs a main heading");
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked.");