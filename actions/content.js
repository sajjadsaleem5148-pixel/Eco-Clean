"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Service from "@/models/Service";
import FAQ from "@/models/FAQ";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { CONTENT_STATUSES, CONTENT_STATUS_FROM, SERVICE_CATEGORIES } from "@/lib/contentStatus";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid item");

function makeSlug(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return base || "service";
}

function refresh() {
  revalidatePath("/services");
  revalidatePath("/admin/services");
  revalidatePath("/admin/faqs");
}

const serviceSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  description: z.string().trim().min(20, "Description must be at least 20 characters").max(2000),
  category: z.enum(Object.keys(SERVICE_CATEGORIES), { message: "Please choose a category" }),
  eligibleCustomer: z.enum(["RESIDENT", "COMMERCIAL", "ALL"], { message: "Please choose who is eligible" }),
  availability: z.string().trim().max(300).optional(),
  collectionInstructions: z.string().trim().max(1000).optional(),
});

export async function createServiceAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = serviceSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    eligibleCustomer: formData.get("eligibleCustomer"),
    availability: formData.get("availability") || undefined,
    collectionInstructions: formData.get("collectionInstructions") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    let slug = makeSlug(d.title);
    if (await Service.exists({ slug })) {
      slug = slug + "-" + crypto.randomBytes(2).toString("hex");
    }
    const created = await Service.create({ ...d, slug, status: "DRAFT", createdBy: user.id });
    await writeAudit({
      actor: user.id,
      action: "service.create",
      targetType: "Service",
      targetId: created._id.toString(),
      metadata: { title: d.title },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "A service with this title already exists." };
    console.error("Create service failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Service created as a draft. Publish it when it is ready." };
}

const statusSchema = z.object({
  kind: z.enum(["service", "faq"]),
  id: objectId,
  target: z.enum(CONTENT_STATUSES, { message: "Invalid status" }),
});

export async function setContentStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    kind: formData.get("kind"),
    id: formData.get("id"),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { kind, id, target } = parsed.data;

  const Model = kind === "service" ? Service : FAQ;
  const set = { status: target };
  if (target === "PUBLISHED") {
    set.publishedBy = user.id;
    set.publishedAt = new Date();
  }

  try {
    await connectDB();
    const updated = await Model.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: CONTENT_STATUS_FROM[target] } },
      { $set: set },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This item cannot be moved to that status." };

    await writeAudit({
      actor: user.id,
      action: kind + "." + target.toLowerCase(),
      targetType: kind === "service" ? "Service" : "FAQ",
      targetId: id,
    });
  } catch (err) {
    console.error("Set content status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Updated." };
}

const faqSchema = z.object({
  question: z.string().trim().min(5, "Question must be at least 5 characters").max(200),
  answer: z.string().trim().min(10, "Answer must be at least 10 characters").max(2000),
  sortOrder: z.coerce.number().int("Use a whole number").min(0).max(100000),
});

export async function createFaqAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = faqSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
    sortOrder: formData.get("sortOrder"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await connectDB();
    const created = await FAQ.create({ ...parsed.data, status: "DRAFT", createdBy: user.id });
    await writeAudit({
      actor: user.id,
      action: "faq.create",
      targetType: "FAQ",
      targetId: created._id.toString(),
    });
  } catch (err) {
    console.error("Create FAQ failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "FAQ created as a draft. Publish it when it is ready." };
}
