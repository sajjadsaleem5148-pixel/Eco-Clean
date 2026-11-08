const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder.");
  process.exit(1);
}

function read(f) {
  try {
    return fs.readFileSync(f, "utf8");
  } catch (e) {
    return null;
  }
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next") walk(p, out);
    } else if (e.name.endsWith(".js")) {
      out.push(p);
    }
  });
  return out;
}

let problems = 0;
function report(ok, label, fix) {
  if (ok) {
    console.log(" OK      " + label);
  } else {
    problems++;
    console.log(" MISSING " + label + (fix ? "   -> run: node scripts/" + fix : ""));
  }
}

console.log("1) Required files");
[
  ["Database connection", "lib/db/connect.js", "create-core-files.js"],
  ["Auth", "auth.js", "create-auth-files.js"],
  ["Rate limiting", "lib/security/rateLimit.js", "create-security-files.js"],
  ["Reports model", "models/WasteReport.js", "create-reports-files.js"],
  ["Report review form", "components/forms/ReportReviewForm.js", "create-review-form.js"],
  ["Collector assignment", "actions/assignments.js", "create-collector-files.js"],
  ["Complaints model", "models/Complaint.js", "create-complaints-files.js"],
  ["Points service", "services/points.js", "create-points-files.js"],
  ["Rewards service", "services/rewards.js", "create-rewards-files.js"],
  ["Services and FAQs", "models/Service.js", "create-content-files.js"],
  ["Contact messages", "models/ContactMessage.js", "create-contact-files.js"],
  ["CMS pages", "models/WebsitePage.js", "create-pages-files.js"],
  ["User management", "actions/adminUsers.js", "create-users-files.js"],
  ["Unit tests", "tests/unit/roles.test.js", "create-test-files.js"],
  ["Shared components", "components/ui/StatusBadge.js", "create-components.js"],
  ["Nav links (design system)", "components/layout/NavLinks.js", "create-design-system.js"],
].forEach(function (c) {
  report(fs.existsSync(c[1]), c[0] + " (" + c[1] + ")", c[2]);
});

console.log("\n2) Content checks (was the latest version written?)");
[
  ["Register form is in English", "components/forms/RegisterForm.js", "Create account", "fix-language.js"],
  ["Design tokens in globals.css", "app/globals.css", "--color-brand", "create-design-system.js"],
  ["Admin complaints uses StatusBadge", "app/admin/(panel)/complaints/page.js", "StatusBadge", "create-list-pages.js"],
  ["Admin users uses StatusBadge", "app/admin/(panel)/users/page.js", "StatusBadge", "create-list-pages-2.js"],
  ["Admin FAQs uses StatusBadge", "app/admin/(panel)/faqs/page.js", "StatusBadge", "create-list-pages-2.js"],
  [".gitignore keeps .env.example", ".gitignore", "!.env.example", null],
].forEach(function (c) {
  const src = read(c[1]);
  report(src !== null && src.includes(c[2]), c[0], c[3]);
});

console.log("\n3) Pages that should already be real (not placeholders)");
[
  "app/(public)/services/page.js",
  "app/(public)/services/[slug]/page.js",
  "app/(public)/contact/page.js",
  "app/(public)/about/page.js",
  "app/(public)/privacy/page.js",
  "app/(public)/terms/page.js",
  "app/(public)/complaints/page.js",
  "app/(public)/report-garbage/page.js",
  "app/(public)/rewards/page.js",
  "app/(public)/rewards/[id]/page.js",
  "app/admin/(panel)/page.js",
  "app/admin/(panel)/zones/page.js",
  "app/admin/(panel)/reports/page.js",
  "app/admin/(panel)/collectors/page.js",
  "app/admin/(panel)/complaints/page.js",
  "app/admin/(panel)/contact-messages/page.js",
  "app/admin/(panel)/green-points/page.js",
  "app/admin/(panel)/points-rules/page.js",
  "app/admin/(panel)/rewards/page.js",
  "app/admin/(panel)/inventory/page.js",
  "app/admin/(panel)/orders/page.js",
  "app/admin/(panel)/services/page.js",
  "app/admin/(panel)/faqs/page.js",
  "app/admin/(panel)/pages/page.js",
  "app/admin/(panel)/announcements/page.js",
  "app/admin/(panel)/users/page.js",
  "app/admin/(panel)/admin-staff/page.js",
  "app/dashboard/page.js",
  "app/dashboard/reports/page.js",
  "app/dashboard/complaints/page.js",
  "app/dashboard/green-points/page.js",
  "app/dashboard/rewards/page.js",
  "app/dashboard/orders/page.js",
  "app/dashboard/settings/page.js",
  "app/collector/page.js",
  "app/collector/jobs/page.js",
  "app/collector/profile/page.js",
].forEach(function (f) {
  const src = read(f);
  report(src !== null && !src.includes("PlaceholderPage"), f, "(run the module script for this page)");
});

console.log("\n4) Roman Urdu left in website code");
const roman = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
const romanFiles = [];
["app", "components", "actions", "lib", "models", "services", "auth.js"].forEach(function (d) {
  const list = fs.existsSync(d) && fs.statSync(d).isFile() ? [d] : walk(d, []);
  list.forEach(function (f) {
    const src = read(f);
    if (src && roman.test(src)) romanFiles.push(f);
  });
});
if (romanFiles.length === 0) {
  console.log(" OK      none found");
} else {
  problems++;
  romanFiles.forEach(function (f) {
    console.log(" FOUND   " + f);
  });
}

console.log("\n5) Routes that are still placeholders (not built yet)");
const stillPlaceholder = walk("app", []).filter(function (f) {
  const src = read(f);
  return f.endsWith("page.js") && src && src.includes("PlaceholderPage");
});
stillPlaceholder.forEach(function (f) {
  console.log(" TODO    " + f.replace(/\\/g, "/"));
});
console.log(" Total placeholder pages: " + stillPlaceholder.length);

console.log("\nSUMMARY: " + problems + " problem group(s) found in sections 1-4. Nothing was changed.");