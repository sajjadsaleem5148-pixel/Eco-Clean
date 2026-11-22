"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Banner from "@/models/Banner";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { campaignPhase, validateDates } from "@/lib/campaignRules";
import {
  BANNER_STATUSES,
  BANNER_STATUS_FROM,
  DEFAULT_LINK_LABEL,
  MAX_LINK_LABEL,
  safeBannerLink,
} from "@/lib/bannerRules";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid banner");

const shared = {
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(80, "Title is too long (80 characters maximum)"),
  text: z.string().trim().min(10, "Text must be at least 10 characters").max(200, "Text is too long (200 characters maximum)"),
  linkUrl: z.string().trim().max(200, "Link is too long (200 characters maximum)"),
  linkLabel: z.string().trim(),
  startDate: z.string().trim(),
  endDate: z.string().trim(),
  sortOrder: z.coerce.number().int("Use a whole number").min(0, "Minimum order is 0").max(1000, "Maximum order is 1000"),
};

const createSchema = z.object(shared);
const updateSchema = z.object(Object.assign({ bannerId: objectId }, shared));

function readFields(formData) {
  return {
    title: String(formData.get("title") || ""),
    text: String(formData.get("text") || ""),
    linkUrl: String(formData.get("linkUrl") || ""),
    linkLabel: String(formData.get("linkLabel") || ""),
    startDate: String(formData.get("startDate") || ""),
    endDate: String(formData.get("endDate") || ""),
    sortOrder: formData.get("sortOrder"),
  };
}

// Returns { url, label } with safe values, or { error }.
function readLink(url, label) {
  if (!url) return { url: "", label: "" };
  const safe = safeBannerLink(url);
  if (!safe) {
    return { error: "The link must be a path on this site (such as /rewards) or a full https:// address." };
  }
  const finalLabel = label || DEFAULT_LINK_LABEL;
  if (finalLabel.length > MAX_LINK_LABEL) {
    return { error: "The link label is too long (" + MAX_LINK_LABEL + " characters maximum)." };
  }
  return { url: safe, label: finalLabel };
}

function refresh() {
  revalidatePath("/admin/banners");
  revalidatePath("/", "layout");
}

export async function createBannerAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse(readFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const dateError = validateDates(d.startDate, d.endDate);
  if (dateError) return { error: dateError };
  const link = readLink(d.linkUrl, d.linkLabel);
  if (link.error) return { error: link.error };

  try {
    await connectDB();
    const created = await Banner.create({
      title: d.title,
      text: d.text,
      linkUrl: link.url,
      linkLabel: link.label,
      startDate: d.startDate || undefined,
      endDate: d.endDate || undefined,
      sortOrder: d.sortOrder,
      status: "DRAFT",
      createdBy: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "banner.create",
      targetType: "Banner",
      targetId: created._id.toString(),
      metadata: { title: d.title },
    });
  } catch (err) {
    console.error("Create banner failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Banner saved as a draft. It is not public until you publish it." };
}

export async function updateBannerAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse(
    Object.assign({ bannerId: String(formData.get("bannerId") || "") }, readFields(formData))
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const dateError = validateDates(d.startDate, d.endDate);
  if (dateError) return { error: dateError };
  const link = readLink(d.linkUrl, d.linkLabel);
  if (link.error) return { error: link.error };

  try {
    await connectDB();
    // Only a draft can be edited, so live text never changes without going back to draft first.
    const updated = await Banner.findOneAndUpdate(
      { _id: d.bannerId, deletedAt: null, status: "DRAFT" },
      {
        $set: {
          title: d.title,
          text: d.text,
          linkUrl: link.url,
          linkLabel: link.label,
          startDate: d.startDate,
          endDate: d.endDate,
          sortOrder: d.sortOrder,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Only a draft banner can be edited. Move it to draft first." };

    await writeAudit({
      actor: user.id,
      action: "banner.update",
      targetType: "Banner",
      targetId: d.bannerId,
      metadata: { title: d.title },
    });
  } catch (err) {
    console.error("Update banner failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Banner updated." };
}

const statusSchema = z.object({
  bannerId: objectId,
  target: z.enum(BANNER_STATUSES, { message: "Invalid status" }),
});

export async function setBannerStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    bannerId: String(formData.get("bannerId") || ""),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { bannerId: id, target } = parsed.data;

  const set = { status: target };

  try {
    await connectDB();

    if (target === "PUBLISHED") {
      const current = await Banner.findOne({ _id: id, deletedAt: null }).select("startDate endDate").lean();
      if (!current) return { error: "Banner not found." };
      if (campaignPhase(current) === "ENDED") {
        return { error: "This banner has already ended. Change its end date first." };
      }
      set.publishedBy = user.id;
      set.publishedAt = new Date();
    }

    // The old status is part of the filter, so two requests at the same time cannot both succeed.
    const updated = await Banner.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: BANNER_STATUS_FROM[target] } },
      { $set: set },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This banner cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "banner.status." + target.toLowerCase(),
      targetType: "Banner",
      targetId: id,
    });
  } catch (err) {
    console.error("Set banner status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Banner status updated." };
}
