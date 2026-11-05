const fs = require("fs");
const path = require("path");

// ---- Check 1: sahi folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("NAKAAM: Yeh script project ke root folder (Eco-Clean) se chalayen. Kuch nahi likha gaya.");
  process.exit(1);
}

// ---- Check 2: zaroori files aur vitest maujood hain? ----
const required = [
  "lib/permissions/roles.js",
  "lib/reportStatus.js",
  "lib/reportTransitions.js",
  "lib/rewardStatus.js",
  "lib/complaintStatus.js",
  "lib/contentStatus.js",
  "lib/contactStatus.js",
  "lib/pageKeys.js",
  "lib/points/labels.js",
  "node_modules/vitest",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("NAKAAM: Yeh cheezein nahi mili, pehle unki scripts chalayen (ya npm install):");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Kuch nahi likha gaya.");
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Bani:", file);
}

write("vitest.config.mjs", `
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.js"],
  },
});
`);

write("tests/unit/roles.test.js", `
import { describe, it, expect } from "vitest";
import { ROLES, ADMIN_ROLES, PERMISSIONS, hasPermission } from "@/lib/permissions/roles";

const others = Object.values(ROLES).filter((r) => r !== "SUPER_ADMIN");

describe("hasPermission", () => {
  it("denies when the role or permission is missing", () => {
    expect(hasPermission(null, "users.read")).toBe(false);
    expect(hasPermission(undefined, "users.read")).toBe(false);
    expect(hasPermission("", "users.read")).toBe(false);
    expect(hasPermission("SUPER_ADMIN", undefined)).toBe(false);
    expect(hasPermission("SUPER_ADMIN", "")).toBe(false);
  });

  it("denies an unknown role", () => {
    expect(hasPermission("HACKER", "users.read")).toBe(false);
    expect(hasPermission("super_admin", "users.read")).toBe(false);
  });

  it("denies an unknown permission, even for the Super Admin", () => {
    expect(hasPermission("SUPER_ADMIN", "nothing.here")).toBe(false);
  });

  it("gives the Super Admin every permission", () => {
    PERMISSIONS.forEach((p) => expect(hasPermission("SUPER_ADMIN", p)).toBe(true));
  });

  it("gives residents and collectors no admin permission", () => {
    PERMISSIONS.forEach((p) => {
      expect(hasPermission("RESIDENT", p)).toBe(false);
      expect(hasPermission("COLLECTOR", p)).toBe(false);
    });
  });

  it("keeps sensitive permissions for the Super Admin only", () => {
    const sensitive = [
      "points.adjust",
      "users.suspend",
      "admins.manage",
      "settings.manage",
      "security.manage",
      "audit.read",
      "analytics.export",
    ];
    sensitive.forEach((p) => {
      others.forEach((r) => expect(hasPermission(r, p)).toBe(false));
    });
  });

  it("gives each staff role only its own job", () => {
    expect(hasPermission("OPERATIONS_MANAGER", "reports.verify")).toBe(true);
    expect(hasPermission("OPERATIONS_MANAGER", "reports.assign")).toBe(true);
    expect(hasPermission("OPERATIONS_MANAGER", "points.adjust")).toBe(false);

    expect(hasPermission("COMPLAINTS_MANAGER", "complaints.resolve")).toBe(true);
    expect(hasPermission("COMPLAINTS_MANAGER", "reports.verify")).toBe(false);

    expect(hasPermission("REWARDS_MANAGER", "rewards.manage")).toBe(true);
    expect(hasPermission("REWARDS_MANAGER", "inventory.manage")).toBe(true);
    expect(hasPermission("REWARDS_MANAGER", "content.publish")).toBe(false);

    expect(hasPermission("CONTENT_MANAGER", "content.publish")).toBe(true);
    expect(hasPermission("CONTENT_MANAGER", "users.read")).toBe(false);

    expect(hasPermission("SUPPORT_AGENT", "complaints.resolve")).toBe(true);
    expect(hasPermission("SUPPORT_AGENT", "rewards.manage")).toBe(false);

    expect(hasPermission("COLLECTOR_SUPERVISOR", "collections.manage")).toBe(true);
    expect(hasPermission("COLLECTOR_SUPERVISOR", "reports.verify")).toBe(false);

    expect(hasPermission("READ_ONLY_ANALYST", "analytics.read")).toBe(true);
    expect(hasPermission("READ_ONLY_ANALYST", "reports.verify")).toBe(false);
    expect(hasPermission("READ_ONLY_ANALYST", "points.adjust")).toBe(false);
  });
});

describe("role lists", () => {
  it("has ten roles whose values match their keys", () => {
    expect(Object.keys(ROLES)).toHaveLength(10);
    Object.entries(ROLES).forEach(([k, v]) => expect(v).toBe(k));
  });

  it("does not treat residents or collectors as admin roles", () => {
    expect(ADMIN_ROLES).toHaveLength(8);
    expect(ADMIN_ROLES).toContain("SUPER_ADMIN");
    expect(ADMIN_ROLES).not.toContain("RESIDENT");
    expect(ADMIN_ROLES).not.toContain("COLLECTOR");
  });

  it("only lists real roles as admin roles", () => {
    ADMIN_ROLES.forEach((r) => expect(Object.values(ROLES)).toContain(r));
  });
});
`);

write("tests/unit/reportFlow.test.js", `
import { describe, it, expect } from "vitest";
import {
  REPORT_STATUSES,
  CLOSED_STATUSES,
  STATUS_LABELS,
  formatDateTime,
} from "@/lib/reportStatus";
import {
  REVIEW_FROM,
  COLLECTOR_FROM,
  ASSIGNABLE_FROM,
  NOTE_REQUIRED,
  decisionsFor,
  collectorStepsFor,
} from "@/lib/reportTransitions";

describe("report statuses", () => {
  it("has eleven statuses, each with a label", () => {
    expect(REPORT_STATUSES).toHaveLength(11);
    REPORT_STATUSES.forEach((s) => expect(STATUS_LABELS[s]).toBeTruthy());
  });

  it("only refers to real statuses in the transition tables", () => {
    Object.entries(REVIEW_FROM).forEach(([to, froms]) => {
      expect(REPORT_STATUSES).toContain(to);
      froms.forEach((f) => expect(REPORT_STATUSES).toContain(f));
    });
    Object.entries(COLLECTOR_FROM).forEach(([to, froms]) => {
      expect(REPORT_STATUSES).toContain(to);
      froms.forEach((f) => expect(REPORT_STATUSES).toContain(f));
    });
    ASSIGNABLE_FROM.forEach((s) => expect(REPORT_STATUSES).toContain(s));
  });

  it("formats dates in UTC", () => {
    expect(formatDateTime(new Date("2026-11-05T10:30:00Z"))).toBe("2026-11-05 10:30 UTC");
  });
});

describe("staff review decisions", () => {
  it("offers all three decisions on a new report", () => {
    expect(decisionsFor("SUBMITTED")).toEqual(["UNDER_REVIEW", "VERIFIED", "REJECTED"]);
  });

  it("does not offer Under Review twice", () => {
    expect(decisionsFor("UNDER_REVIEW")).toEqual(["VERIFIED", "REJECTED"]);
  });

  it("offers no review decision once a report is verified", () => {
    expect(decisionsFor("VERIFIED")).toEqual([]);
    expect(decisionsFor("ASSIGNED")).toEqual([]);
  });

  it("offers nothing on closed reports", () => {
    CLOSED_STATUSES.forEach((s) => expect(decisionsFor(s)).toEqual([]));
  });
});

describe("collector steps", () => {
  it("only allows accepting a newly assigned job", () => {
    expect(collectorStepsFor("ASSIGNED")).toEqual(["ACCEPTED"]);
  });

  it("moves one step at a time", () => {
    expect(collectorStepsFor("ACCEPTED")).toEqual(["ON_THE_WAY", "UNABLE_TO_COLLECT"]);
    expect(collectorStepsFor("ON_THE_WAY")).toEqual(["ARRIVED", "UNABLE_TO_COLLECT"]);
    expect(collectorStepsFor("ARRIVED")).toEqual(["COLLECTED", "UNABLE_TO_COLLECT"]);
  });

  it("never allows Collected before Arrived", () => {
    ["ASSIGNED", "ACCEPTED", "ON_THE_WAY"].forEach((s) => {
      expect(collectorStepsFor(s)).not.toContain("COLLECTED");
    });
  });

  it("offers nothing on closed reports", () => {
    CLOSED_STATUSES.forEach((s) => expect(collectorStepsFor(s)).toEqual([]));
  });

  it("requires a note for Collected and Unable to Collect", () => {
    expect(NOTE_REQUIRED).toEqual(["COLLECTED", "UNABLE_TO_COLLECT"]);
  });

  it("allows assigning only verified or already assigned reports", () => {
    expect(ASSIGNABLE_FROM).toEqual(["VERIFIED", "ASSIGNED"]);
  });
});
`);

write("tests/unit/rewardFlow.test.js", `
import { describe, it, expect } from "vitest";
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  ORDER_STATUS_LABELS,
  STAFF_ORDER_STATUSES,
  REASON_REQUIRED_ORDER,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_FROM,
  nextOrderStatuses,
  productTargets,
} from "@/lib/rewardStatus";

describe("order statuses", () => {
  it("has eight statuses, each with a label", () => {
    expect(ORDER_STATUSES).toHaveLength(8);
    ORDER_STATUSES.forEach((s) => expect(ORDER_STATUS_LABELS[s]).toBeTruthy());
  });

  it("only refers to real statuses in the transition table", () => {
    Object.entries(ORDER_TRANSITIONS).forEach(([from, targets]) => {
      expect(ORDER_STATUSES).toContain(from);
      targets.forEach((t) => expect(ORDER_STATUSES).toContain(t));
    });
  });

  it("has no way out of a finished order", () => {
    ["COMPLETED", "REJECTED", "CANCELLED"].forEach((s) => {
      expect(ORDER_TRANSITIONS[s]).toBeUndefined();
      expect(nextOrderStatuses(s, "PICKUP")).toEqual([]);
      expect(nextOrderStatuses(s, "DISPATCH")).toEqual([]);
    });
  });

  it("never lets staff set Pending", () => {
    expect(STAFF_ORDER_STATUSES).not.toContain("PENDING");
  });

  it("requires a reason for Rejected and Cancelled", () => {
    expect(REASON_REQUIRED_ORDER).toEqual(["REJECTED", "CANCELLED"]);
  });
});

describe("nextOrderStatuses", () => {
  it("lets a pending order be approved, rejected or cancelled", () => {
    expect(nextOrderStatuses("PENDING", "PICKUP")).toEqual(["APPROVED", "REJECTED", "CANCELLED"]);
  });

  it("does not let a pending order jump to Completed", () => {
    expect(nextOrderStatuses("PENDING", "PICKUP")).not.toContain("COMPLETED");
    expect(nextOrderStatuses("PENDING", "DISPATCH")).not.toContain("COMPLETED");
  });

  it("uses Ready for Collection only for pickup orders", () => {
    expect(nextOrderStatuses("PREPARING", "PICKUP")).toEqual(["READY_FOR_COLLECTION", "CANCELLED"]);
  });

  it("uses Dispatched only for dispatch orders", () => {
    expect(nextOrderStatuses("PREPARING", "DISPATCH")).toEqual(["DISPATCHED", "CANCELLED"]);
  });

  it("cannot cancel an order that was already dispatched", () => {
    expect(nextOrderStatuses("DISPATCHED", "DISPATCH")).toEqual(["COMPLETED"]);
  });

  it("completes a ready pickup order", () => {
    expect(nextOrderStatuses("READY_FOR_COLLECTION", "PICKUP")).toEqual(["COMPLETED", "CANCELLED"]);
  });

  it("returns nothing for an unknown status", () => {
    expect(nextOrderStatuses("MADE_UP", "PICKUP")).toEqual([]);
  });
});

describe("product status", () => {
  it("only refers to real statuses", () => {
    Object.entries(PRODUCT_STATUS_FROM).forEach(([to, froms]) => {
      expect(PRODUCT_STATUSES).toContain(to);
      froms.forEach((f) => expect(PRODUCT_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(productTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(productTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(productTargets("ARCHIVED")).toEqual(["DRAFT"]);
  });
});
`);

write("tests/unit/complaintFlow.test.js", `
import { describe, it, expect } from "vitest";
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_STAFF_ROLES,
  OPEN_STATUSES,
  STATUS_FROM,
  REASON_REQUIRED,
  REOPEN_WINDOW_DAYS,
  MAX_REOPENS,
  decisionsFor,
} from "@/lib/complaintStatus";

describe("complaint statuses", () => {
  it("has seven statuses, each with a label", () => {
    expect(COMPLAINT_STATUSES).toHaveLength(7);
    COMPLAINT_STATUSES.forEach((s) => expect(COMPLAINT_STATUS_LABELS[s]).toBeTruthy());
  });

  it("has ten categories", () => {
    expect(Object.keys(COMPLAINT_CATEGORIES)).toHaveLength(10);
    expect(COMPLAINT_CATEGORIES.HAZARDOUS_WASTE).toBeTruthy();
  });

  it("only refers to real statuses in the transition table", () => {
    Object.entries(STATUS_FROM).forEach(([to, froms]) => {
      expect(COMPLAINT_STATUSES).toContain(to);
      froms.forEach((f) => expect(COMPLAINT_STATUSES).toContain(f));
    });
    OPEN_STATUSES.forEach((s) => expect(COMPLAINT_STATUSES).toContain(s));
  });

  it("does not count resolved or rejected complaints as open", () => {
    expect(OPEN_STATUSES).not.toContain("RESOLVED");
    expect(OPEN_STATUSES).not.toContain("REJECTED");
  });
});

describe("staff decisions", () => {
  it("offers sensible choices on a new complaint", () => {
    expect(decisionsFor("SUBMITTED")).toEqual(["UNDER_REVIEW", "REJECTED", "ESCALATED"]);
  });

  it("offers progress choices on an assigned complaint", () => {
    expect(decisionsFor("ASSIGNED")).toEqual(["IN_PROGRESS", "RESOLVED", "REJECTED", "ESCALATED"]);
  });

  it("cannot escalate an escalated complaint again", () => {
    expect(decisionsFor("ESCALATED")).toEqual(["UNDER_REVIEW", "REJECTED"]);
  });

  it("offers nothing on resolved or rejected complaints", () => {
    expect(decisionsFor("RESOLVED")).toEqual([]);
    expect(decisionsFor("REJECTED")).toEqual([]);
  });

  it("requires a reason to resolve, reject or escalate", () => {
    expect(REASON_REQUIRED).toEqual(["RESOLVED", "REJECTED", "ESCALATED"]);
  });
});

describe("policies", () => {
  it("allows one reopen within seven days", () => {
    expect(REOPEN_WINDOW_DAYS).toBe(7);
    expect(MAX_REOPENS).toBe(1);
  });

  it("never lets residents or collectors be complaint staff", () => {
    expect(COMPLAINT_STAFF_ROLES).not.toContain("RESIDENT");
    expect(COMPLAINT_STAFF_ROLES).not.toContain("COLLECTOR");
    expect(COMPLAINT_STAFF_ROLES).toContain("SUPER_ADMIN");
  });
});
`);

write("tests/unit/contentFlow.test.js", `
import { describe, it, expect } from "vitest";
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_FROM,
  SERVICE_CATEGORIES,
  contentTargets,
} from "@/lib/contentStatus";
import {
  CONTACT_STATUSES,
  CONTACT_CATEGORIES,
  STATUS_FROM as CONTACT_FROM,
  REPLYABLE,
  decisionsFor as contactDecisions,
} from "@/lib/contactStatus";
import {
  PAGE_KEYS,
  PAGE_KEY_LIST,
  PAGE_OP_FROM,
  PAGE_OP_TARGET,
  annTargets,
} from "@/lib/pageKeys";

describe("content status", () => {
  it("only refers to real statuses", () => {
    Object.entries(CONTENT_STATUS_FROM).forEach(([to, froms]) => {
      expect(CONTENT_STATUSES).toContain(to);
      froms.forEach((f) => expect(CONTENT_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(contentTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(contentTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(contentTargets("ARCHIVED")).toEqual(["DRAFT"]);
  });

  it("has ten service categories", () => {
    expect(Object.keys(SERVICE_CATEGORIES)).toHaveLength(10);
  });
});

describe("contact messages", () => {
  it("only refers to real statuses", () => {
    Object.entries(CONTACT_FROM).forEach(([to, froms]) => {
      expect(CONTACT_STATUSES).toContain(to);
      froms.forEach((f) => expect(CONTACT_STATUSES).toContain(f));
    });
  });

  it("lets staff close or reopen a message", () => {
    expect(contactDecisions("NEW")).toEqual(["IN_PROGRESS", "CLOSED"]);
    expect(contactDecisions("IN_PROGRESS")).toEqual(["CLOSED"]);
    expect(contactDecisions("RESPONDED")).toEqual(["IN_PROGRESS", "CLOSED"]);
    expect(contactDecisions("CLOSED")).toEqual(["IN_PROGRESS"]);
  });

  it("does not allow replies on a closed message", () => {
    expect(REPLYABLE).not.toContain("CLOSED");
    expect(REPLYABLE).toContain("NEW");
  });

  it("has a general category", () => {
    expect(CONTACT_CATEGORIES.GENERAL).toBeTruthy();
  });
});

describe("website pages", () => {
  it("manages exactly About, Privacy and Terms", () => {
    expect(PAGE_KEY_LIST).toEqual(["ABOUT", "PRIVACY", "TERMS"]);
    PAGE_KEY_LIST.forEach((k) => expect(PAGE_KEYS[k].path.startsWith("/")).toBe(true));
  });

  it("only unpublishes a published page", () => {
    expect(PAGE_OP_FROM.unpublish).toEqual(["PUBLISHED"]);
  });

  it("maps each operation to a target status", () => {
    expect(PAGE_OP_TARGET).toEqual({ publish: "PUBLISHED", unpublish: "DRAFT", archive: "ARCHIVED" });
  });

  it("uses the same announcement steps as other content", () => {
    expect(annTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(annTargets("ARCHIVED")).toEqual(["DRAFT"]);
  });
});
`);

write("tests/unit/pointsLabels.test.js", `
import { describe, it, expect } from "vitest";
import { TYPE_LABELS, MAX_POINTS_PER_ENTRY, formatPoints } from "@/lib/points/labels";

describe("formatPoints", () => {
  it("shows a plus sign for gains", () => {
    expect(formatPoints(5)).toBe("+5");
  });

  it("shows a minus sign for deductions", () => {
    expect(formatPoints(-5)).toBe("-5");
  });

  it("shows zero without a sign", () => {
    expect(formatPoints(0)).toBe("0");
  });
});

describe("points settings", () => {
  it("has a label for every transaction type", () => {
    ["EARN", "REDEEM", "REFUND", "ADJUST", "REVERSAL"].forEach((t) => {
      expect(TYPE_LABELS[t]).toBeTruthy();
    });
  });

  it("limits one entry to 1000 points", () => {
    expect(MAX_POINTS_PER_ENTRY).toBe(1000);
  });
});
`);

// ---- package.json mein "test" script jodna ----
const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.scripts = pkg.scripts || {};
if (pkg.scripts.test !== "vitest run") {
  pkg.scripts.test = "vitest run";
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("Patched: package.json (npm test jodi)");
}

// ---- Check 3: likhne ke baad jaanch ----
let failed = 0;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  if (!src.trim()) {
    console.log(" FAIL (khali): " + f);
    failed++;
  } else if (f.endsWith(".test.js") && !src.includes("describe(")) {
    console.log(" FAIL (test nahi mile): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});
const checked = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (checked.scripts && checked.scripts.test === "vitest run") {
  console.log(" OK: package.json (test script maujood)");
} else {
  console.log(" FAIL: package.json mein test script nahi");
  failed++;
}

if (failed > 0) {
  console.error("\nNAKAAM: " + failed + " cheez(en) theek nahi likhi gayin.");
  process.exit(1);
}
console.log("\nSAB THEEK: " + written.length + " files likhi aur check hui. Ab chalayen: npm test");