"use server";

import { z } from "zod";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import WebsitePage from "@/models/WebsitePage";
import Announcement from "@/models/Announcement";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  PAGE_KEY_LIST,
  PAGE_KEYS,
  PAGE_OPS,
  PAGE_OP_FROM,
  PAGE_OP_TARGET,
  ANN_STATUSES,
  ANN_STATUS_FROM,
} from "@/lib/pageKeys";

function refreshPages(key) {
  revalidatePath("/admin/pages");
  if (key) revalidatePath(PAGE_KEYS[key].path);
}

function refreshAnnouncements() {
  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
}

const draftSchema = z.object({
  key: z.enum(PAGE_KEY_LIST, { message: "Invalid page" }),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(150),
  body: z.string().trim().min(20, "Text must be at least 20 characters").max(20000, "Text is too long"),
});

export async function savePageDraftAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = draftSchema.safeParse({
    key: formData.get("key"),
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { key, title, body } = parsed.data;

  try {
    await connectDB();
    await WebsitePage.findOneAndUpdate(
      { key },
      {
        $set: { draftTitle: title, draftBody: body, updatedBy: user.id },
        $setOnInsert: { key, status: "DRAFT" },
      },
      { upsert: true, returnDocument: "after" }
    );
    await writeAudit({
      actor: user.id,
      action: "page.draft.save",
      targetType: "WebsitePage",
      targetId: key,
    });
  } catch (err) {
    console.error("Save page draft failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshPages(null);
  return { success: "Draft saved. It is not public until you publish it." };
}

const opSchema = z.object({
  key: z.enum(PAGE_KEY_LIST, { message: "Invalid page" }),
  op: z.enum(PAGE_OPS, { message: "Invalid action" }),
});

export async function pageStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = opSchema.safeParse({
    key: formData.get("key"),
    op: formData.get("op"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { key, op } = parsed.data;

  try {
    await connectDB();
    let updated = null;

    if (op === "publish") {
      const page = await WebsitePage.findOne({ key }).select("status draftTitle draftBody").lean();
      if (!page || !page.draftBody || !page.draftTitle) {
        return { error: "Save a draft first. There is nothing to publish yet." };
      }
      updated = await WebsitePage.findOneAndUpdate(
        {
          key,
          status: { $in: PAGE_OP_FROM.publish },
          draftTitle: page.draftTitle,
          draftBody: page.draftBody,
        },
        {
          $set: {
            title: page.draftTitle,
            body: page.draftBody,
            status: "PUBLISHED",
            publishedBy: new mongoose.Types.ObjectId(user.id),
            publishedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      ).select("_id");
    } else {
      updated = await WebsitePage.findOneAndUpdate(
        { key, status: { $in: PAGE_OP_FROM[op] } },
        { $set: { status: PAGE_OP_TARGET[op] } },
        { returnDocument: "after" }
      ).select("_id");
    }

    if (!updated) return { error: "This action is not available for the page right now. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "page." + op,
      targetType: "WebsitePage",
      targetId: key,
    });
  } catch (err) {
    console.error("Page status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshPages(key);
  return { success: "Done." };
}

const annSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  body: z.string().trim().min(5, "Message must be at least 5 characters").max(300),
});

export async function createAnnouncementAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = annSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await connectDB();
    const created = await Announcement.create({ ...parsed.data, status: "DRAFT", createdBy: user.id });
    await writeAudit({
      actor: user.id,
      action: "announcement.create",
      targetType: "Announcement",
      targetId: created._id.toString(),
    });
  } catch (err) {
    console.error("Create announcement failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAnnouncements();
  return { success: "Announcement created as a draft. Publish it when it is ready." };
}

const annStatusSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid announcement"),
  target: z.enum(ANN_STATUSES, { message: "Invalid status" }),
});

export async function setAnnouncementStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = annStatusSchema.safeParse({
    id: formData.get("id"),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, target } = parsed.data;

  const set = { status: target };
  if (target === "PUBLISHED") {
    set.publishedBy = user.id;
    set.publishedAt = new Date();
  }

  try {
    await connectDB();
    const updated = await Announcement.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: ANN_STATUS_FROM[target] } },
      { $set: set },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This announcement cannot be moved to that status." };

    await writeAudit({
      actor: user.id,
      action: "announcement." + target.toLowerCase(),
      targetType: "Announcement",
      targetId: id,
    });
  } catch (err) {
    console.error("Set announcement status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAnnouncements();
  return { success: "Updated." };
}
