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

import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport } from "./helpers.js";
import { signInAs, signOut, form, run } from "./actionHelpers.js";
import { createCategoryAction, updateCategoryAction, setCategoryStatusAction } from "@/actions/categories";
import WasteCategory from "@/models/WasteCategory";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function categoryForm(overrides) {
  return form(
    Object.assign(
      {
        name: "Garden waste",
        description: "Leaves and grass",
        color: "#047857",
        sortOrder: "5",
        acceptedMaterials: "Leaves\nGrass cuttings\nleaves",
        prohibitedMaterials: "Batteries",
      },
      overrides || {}
    )
  );
}

async function asContentManager() {
  const user = await makeUser({ role: "CONTENT_MANAGER" });
  signInAs(user);
  return user;
}

async function asOperations() {
  const user = await makeUser({ role: "OPERATIONS_MANAGER" });
  signInAs(user);
  return user;
}

function makeCategory(overrides) {
  return WasteCategory.create(
    Object.assign({ key: "green", name: "Green bag", color: "#047857", status: "ACTIVE" }, overrides || {})
  );
}

describe("createCategoryAction", () => {
  it("creates an active category with a key, clean materials and an audit entry", async () => {
    await asContentManager();
    const out = await run(() => createCategoryAction(null, categoryForm()));
    expect(out.result.success).toBeTruthy();

    const saved = await WasteCategory.findOne({ key: "garden-waste" }).lean();
    expect(saved.name).toBe("Garden waste");
    expect(saved.status).toBe("ACTIVE");
    expect(saved.acceptedMaterials).toEqual(["Leaves", "Grass cuttings"]);
    expect(saved.prohibitedMaterials).toEqual(["Batteries"]);
    expect(await AuditLog.countDocuments({ action: "category.create" })).toBe(1);
  });

  it("refuses a second category with the same name", async () => {
    await asContentManager();
    await run(() => createCategoryAction(null, categoryForm()));
    const again = await run(() => createCategoryAction(null, categoryForm()));
    expect(again.result.error).toMatch(/already exists/i);
    expect(await WasteCategory.countDocuments({})).toBe(1);
  });

  it("refuses unsafe colours, too many items and a name without letters", async () => {
    await asContentManager();
    for (const bad of ["red", "#12345", "javascript:alert(1)", "url(x)"]) {
      const out = await run(() => createCategoryAction(null, categoryForm({ color: bad })));
      expect(out.result.error).toMatch(/colour/i);
    }
    const many = Array.from({ length: 31 }, (_, i) => "Item " + i).join("\n");
    const tooMany = await run(() => createCategoryAction(null, categoryForm({ acceptedMaterials: many })));
    expect(tooMany.result.error).toMatch(/30/);
    const noLetters = await run(() => createCategoryAction(null, categoryForm({ name: "!!!" })));
    expect(noLetters.result.error).toBeTruthy();
    expect(await WasteCategory.countDocuments({})).toBe(0);
  });

  it("refuses everyone without content.publish, and visitors", async () => {
    for (const role of ["OPERATIONS_MANAGER", "COMPLAINTS_MANAGER", "REWARDS_MANAGER", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createCategoryAction(null, categoryForm()));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createCategoryAction(null, categoryForm()));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await WasteCategory.countDocuments({})).toBe(0);
  });
});

describe("updateCategoryAction", () => {
  function updateForm(id, overrides) {
    return categoryForm(Object.assign({ categoryId: String(id), name: "Green bag renamed" }, overrides || {}));
  }

  it("updates the text and colour but never the key", async () => {
    const cat = await makeCategory();
    await asContentManager();
    const out = await run(() => updateCategoryAction(null, updateForm(cat._id, { color: "#1d4ed8" })));
    expect(out.result.success).toBeTruthy();
    const saved = await WasteCategory.findById(cat._id).lean();
    expect(saved.name).toBe("Green bag renamed");
    expect(saved.color).toBe("#1d4ed8");
    expect(saved.key).toBe("green");
    expect(await AuditLog.countDocuments({ action: "category.update" })).toBe(1);
  });

  it("refuses an operations manager, a bad colour, a bad id and an unknown category", async () => {
    const cat = await makeCategory();
    await asOperations();
    const a = await run(() => updateCategoryAction(null, updateForm(cat._id)));
    expect(a.result.error).toMatch(/permission/i);

    await asContentManager();
    const b = await run(() => updateCategoryAction(null, updateForm(cat._id, { color: "blue" })));
    expect(b.result.error).toMatch(/colour/i);
    const c = await run(() => updateCategoryAction(null, updateForm("not-an-id")));
    expect(c.result.error).toMatch(/invalid/i);
    const d = await run(() => updateCategoryAction(null, updateForm("507f1f77bcf86cd799439011")));
    expect(d.result.error).toMatch(/not found/i);
    expect((await WasteCategory.findById(cat._id).lean()).name).toBe("Green bag");
  });
});

describe("setCategoryStatusAction", () => {
  function statusForm(id, target, reason) {
    return form({ categoryId: String(id), target: target, reason: reason });
  }

  it("deactivates with a reason and reactivates", async () => {
    const cat = await makeCategory();
    await asOperations();

    const none = await run(() => setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "no")));
    expect(short.result.error).toMatch(/at least 10/);
    expect((await WasteCategory.findById(cat._id).lean()).status).toBe("ACTIVE");

    const ok = await run(() =>
      setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "This bag colour is being replaced"))
    );
    expect(ok.result.success).toBeTruthy();
    expect((await WasteCategory.findById(cat._id).lean()).status).toBe("INACTIVE");

    const twice = await run(() =>
      setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "Trying to deactivate it again"))
    );
    expect(twice.result.error).toMatch(/cannot be moved/i);

    const back = await run(() => setCategoryStatusAction(null, statusForm(cat._id, "ACTIVE")));
    expect(back.result.success).toBeTruthy();
    expect((await WasteCategory.findById(cat._id).lean()).status).toBe("ACTIVE");
    expect(await AuditLog.countDocuments({ action: "category.status.inactive" })).toBe(1);
  });

  it("does not deactivate a category that open reports still use", async () => {
    const cat = await makeCategory();
    const resident = await makeUser();
    await makeReport(resident._id, cat._id, "SUBMITTED");
    await asOperations();
    const out = await run(() =>
      setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "Trying to retire this category"))
    );
    expect(out.result.error).toMatch(/open report/i);
    expect((await WasteCategory.findById(cat._id).lean()).status).toBe("ACTIVE");
  });

  it("allows deactivating when every report is closed", async () => {
    const cat = await makeCategory();
    const resident = await makeUser();
    await makeReport(resident._id, cat._id, "COLLECTED");
    await asOperations();
    const out = await run(() =>
      setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "All pickups are finished already"))
    );
    expect(out.result.success).toBeTruthy();
  });

  it("refuses a content manager, a resident and a visitor", async () => {
    const cat = await makeCategory();
    for (const role of ["CONTENT_MANAGER", "RESIDENT", "COMPLAINTS_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() =>
        setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "I should not be allowed to do this"))
      );
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() =>
      setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "Nobody is logged in here"))
    );
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await WasteCategory.findById(cat._id).lean()).status).toBe("ACTIVE");
  });
});
