import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => globalThis.__ecoUser || null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url) => {
    const e = new Error("NEXT_REDIRECT");
    e.url = url;
    throw e;
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { signInAs, signOut, form, run } from "./actionHelpers.js";
import { createVendorAction, updateVendorAction, setVendorStatusAction } from "@/actions/vendors";
import Vendor from "@/models/Vendor";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function vendorForm(overrides) {
  return form(
    Object.assign(
      {
        name: "Green  Gardens Ltd",
        category: "GARDENING",
        contactPerson: "A. Khan",
        email: "Sales@Example.com",
        phone: "+92 21 1234567",
        address: "Industrial Area",
        notes: "",
      },
      overrides || {}
    )
  );
}

async function asRewardsManager() {
  const user = await makeUser({ role: "REWARDS_MANAGER" });
  signInAs(user);
  return user;
}

function makeVendor(overrides) {
  return Vendor.create(
    Object.assign(
      { name: "Eco Supplies", nameKey: "ecosupplies", category: "CLEANING", email: "eco@example.com", status: "PENDING" },
      overrides || {}
    )
  );
}

describe("createVendorAction", () => {
  it("adds a pending vendor with a clean name, lowercase email and an audit entry without contact details", async () => {
    const admin = await asRewardsManager();
    const out = await run(() => createVendorAction(null, vendorForm()));
    expect(out.result.success).toBeTruthy();

    const saved = await Vendor.findOne({}).lean();
    expect(saved.name).toBe("Green Gardens Ltd");
    expect(saved.nameKey).toBe("greengardensltd");
    expect(saved.email).toBe("sales@example.com");
    expect(saved.status).toBe("PENDING");
    expect(String(saved.createdBy)).toBe(String(admin._id));

    const logs = await AuditLog.find({ action: "vendor.create" }).lean();
    expect(logs).toHaveLength(1);
    const text = JSON.stringify(logs[0].metadata);
    expect(text.includes("sales@example.com")).toBe(false);
    expect(text.includes("1234567")).toBe(false);
  });

  it("refuses the same name written in another way", async () => {
    await asRewardsManager();
    await run(() => createVendorAction(null, vendorForm()));
    for (const name of ["green gardens ltd", "GREEN-GARDENS LTD.", "  Green Gardens   Ltd "]) {
      const out = await run(() => createVendorAction(null, vendorForm({ name: name })));
      expect(out.result.error).toMatch(/already exists/i);
    }
    expect(await Vendor.countDocuments({})).toBe(1);
  });

  it("creates only one vendor when the same name arrives twice at the same time", async () => {
    await asRewardsManager();
    const results = await Promise.all([
      run(() => createVendorAction(null, vendorForm())),
      run(() => createVendorAction(null, vendorForm({ name: "green-gardens ltd" }))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await Vendor.countDocuments({})).toBe(1);
  });

  it("refuses a bad email, a bad phone, a symbol-only name and an unknown category", async () => {
    await asRewardsManager();
    const a = await run(() => createVendorAction(null, vendorForm({ email: "not-an-email" })));
    expect(a.result.error).toMatch(/email/i);
    const b = await run(() => createVendorAction(null, vendorForm({ phone: "call me" })));
    expect(b.result.error).toMatch(/phone/i);
    const c = await run(() => createVendorAction(null, vendorForm({ name: "!!!" })));
    expect(c.result.error).toMatch(/letters or numbers/i);
    const d = await run(() => createVendorAction(null, vendorForm({ category: "FRESH_PRODUCE" })));
    expect(d.result.error).toMatch(/category/i);
    expect(await Vendor.countDocuments({})).toBe(0);
  });

  it("refuses every role without rewards.manage, and visitors", async () => {
    for (const role of ["OPERATIONS_MANAGER", "CONTENT_MANAGER", "COMPLAINTS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createVendorAction(null, vendorForm()));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createVendorAction(null, vendorForm()));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await Vendor.countDocuments({})).toBe(0);
  });
});

describe("updateVendorAction", () => {
  function updateForm(id, overrides) {
    return vendorForm(Object.assign({ vendorId: String(id), name: "Eco Supplies Renamed" }, overrides || {}));
  }

  it("updates the details and keeps the status", async () => {
    const v = await makeVendor({ status: "APPROVED" });
    await asRewardsManager();
    const out = await run(() => updateVendorAction(null, updateForm(v._id)));
    expect(out.result.success).toBeTruthy();
    const saved = await Vendor.findById(v._id).lean();
    expect(saved.name).toBe("Eco Supplies Renamed");
    expect(saved.nameKey).toBe("ecosuppliesrenamed");
    expect(saved.status).toBe("APPROVED");
    expect(await AuditLog.countDocuments({ action: "vendor.update" })).toBe(1);
  });

  it("refuses a name that another vendor already uses", async () => {
    await makeVendor({ name: "Taken Name", nameKey: "takenname" });
    const v = await makeVendor();
    await asRewardsManager();
    const out = await run(() => updateVendorAction(null, updateForm(v._id, { name: "taken-name" })));
    expect(out.result.error).toMatch(/already exists/i);
    expect((await Vendor.findById(v._id).lean()).name).toBe("Eco Supplies");
  });

  it("refuses a bad id, an unknown vendor and a role without permission", async () => {
    const v = await makeVendor();
    await asRewardsManager();
    const a = await run(() => updateVendorAction(null, updateForm("nope")));
    expect(a.result.error).toMatch(/invalid/i);
    const b = await run(() => updateVendorAction(null, updateForm("507f1f77bcf86cd799439011")));
    expect(b.result.error).toMatch(/not found/i);

    const other = await makeUser({ role: "CONTENT_MANAGER" });
    signInAs(other);
    const c = await run(() => updateVendorAction(null, updateForm(v._id)));
    expect(c.result.error).toMatch(/permission/i);
  });
});

describe("setVendorStatusAction", () => {
  function statusForm(id, target, reason) {
    return form({ vendorId: String(id), target: target, reason: reason });
  }

  it("approves a vendor that has contact details and records who approved it", async () => {
    const v = await makeVendor();
    const admin = await asRewardsManager();
    const out = await run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED")));
    expect(out.result.success).toBeTruthy();
    const saved = await Vendor.findById(v._id).lean();
    expect(saved.status).toBe("APPROVED");
    expect(String(saved.approvedBy)).toBe(String(admin._id));
    expect(saved.approvedAt).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: "vendor.status.approved" })).toBe(1);
  });

  it("does not approve a vendor without an email or a phone number", async () => {
    const v = await makeVendor({ email: "", phone: "" });
    await asRewardsManager();
    const out = await run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED")));
    expect(out.result.error).toMatch(/email or a phone/i);
    expect((await Vendor.findById(v._id).lean()).status).toBe("PENDING");
  });

  it("needs a real reason to deactivate, then lets the vendor be reactivated", async () => {
    const v = await makeVendor({ status: "APPROVED" });
    await asRewardsManager();

    const none = await run(() => setVendorStatusAction(null, statusForm(v._id, "INACTIVE")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setVendorStatusAction(null, statusForm(v._id, "INACTIVE", "no")));
    expect(short.result.error).toMatch(/at least 10/);
    expect((await Vendor.findById(v._id).lean()).status).toBe("APPROVED");

    const ok = await run(() =>
      setVendorStatusAction(null, statusForm(v._id, "INACTIVE", "Supplier stopped delivering to us"))
    );
    expect(ok.result.success).toBeTruthy();
    let saved = await Vendor.findById(v._id).lean();
    expect(saved.status).toBe("INACTIVE");
    expect(saved.statusReason).toBe("Supplier stopped delivering to us");

    const twice = await run(() =>
      setVendorStatusAction(null, statusForm(v._id, "INACTIVE", "Trying to deactivate it again"))
    );
    expect(twice.result.error).toMatch(/cannot be moved/i);

    const back = await run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED")));
    expect(back.result.success).toBeTruthy();
    saved = await Vendor.findById(v._id).lean();
    expect(saved.status).toBe("APPROVED");
    expect(saved.statusReason).toBeUndefined();
  });

  it("lets only one request win when two approvals arrive at the same time", async () => {
    const v = await makeVendor();
    await asRewardsManager();
    const results = await Promise.all([
      run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED"))),
      run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "vendor.status.approved" })).toBe(1);
  });

  it("refuses a pending status request and roles without permission", async () => {
    const v = await makeVendor();
    await asRewardsManager();
    const pending = await run(() => setVendorStatusAction(null, statusForm(v._id, "PENDING")));
    expect(pending.result.error).toMatch(/cannot be moved/i);

    for (const role of ["RESIDENT", "CONTENT_MANAGER", "OPERATIONS_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED")));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED")));
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await Vendor.findById(v._id).lean()).status).toBe("PENDING");
  });
});
