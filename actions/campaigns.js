"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Campaign from "@/models/Campaign";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_FROM,
  campaignPhase,
  validateDates,
} from "@/lib/campaignRules";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid campaign");

const shared = {
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120, "Title is too long (120 characters maximum)"),
  summary: z.string().trim().min(10, "Summary must be at least 10 characters").max(200, "Summary is too long (200 characters maximum)"),
  body: z.string().trim().max(2000, "Details are too long (2000 characters maximum)"),
  startDate: z.string().trim(),
  endDate: z.string().trim(),
};

const createSchema = z.object(shared);
const updateSchema = z.object(Object.assign({ campaignId: objectId }, shared));

function readFields(formData) {
  return {
    title: String(formData.get("title") || ""),
    summary: String(formData.get("summary") || ""),
    body: String(formData.get("body") || ""),
    startDate: String(formData.get("startDate") || ""),
    endDate: String(formData.get("endDate") || ""),
  };
}

function refresh() {
  revalidatePath("/admin/campaigns");
  revalidatePath("/campaigns");
}

export async function createCampaignAction(prevState, formData) {
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

  try {
    await connectDB();
    const created = await Campaign.create({
      title: d.title,
      summary: d.summary,
      body: d.body,
      startDate: d.startDate || undefined,
      endDate: d.endDate || undefined,
      status: "DRAFT",
      createdBy: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "campaign.create",
      targetType: "Campaign",
      targetId: created._id.toString(),
      metadata: { title: d.title },
    });
  } catch (err) {
    console.error("Create campaign failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Campaign saved as a draft. It is not public until you publish it." };
}

export async function updateCampaignAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse(
    Object.assign({ campaignId: String(formData.get("campaignId") || "") }, readFields(formData))
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const dateError = validateDates(d.startDate, d.endDate);
  if (dateError) return { error: dateError };

  try {
    await connectDB();
    // Only a draft can be edited, so live text never changes without going back to draft first.
    const updated = await Campaign.findOneAndUpdate(
      { _id: d.campaignId, deletedAt: null, status: "DRAFT" },
      { $set: { title: d.title, summary: d.summary, body: d.body, startDate: d.startDate, endDate: d.endDate } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Only a draft campaign can be edited. Move it to draft first." };

    await writeAudit({
      actor: user.id,
      action: "campaign.update",
      targetType: "Campaign",
      targetId: d.campaignId,
      metadata: { title: d.title },
    });
  } catch (err) {
    console.error("Update campaign failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Campaign updated." };
}

const statusSchema = z.object({
  campaignId: objectId,
  target: z.enum(CAMPAIGN_STATUSES, { message: "Invalid status" }),
});

export async function setCampaignStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    campaignId: String(formData.get("campaignId") || ""),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { campaignId: id, target } = parsed.data;

  const set = { status: target };

  try {
    await connectDB();

    if (target === "PUBLISHED") {
      const current = await Campaign.findOne({ _id: id, deletedAt: null }).select("startDate endDate").lean();
      if (!current) return { error: "Campaign not found." };
      if (campaignPhase(current) === "ENDED") {
        return { error: "This campaign has already ended. Change its end date first." };
      }
      set.publishedBy = user.id;
      set.publishedAt = new Date();
    }

    // The old status is part of the filter, so two requests at the same time cannot both succeed.
    const updated = await Campaign.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: CAMPAIGN_STATUS_FROM[target] } },
      { $set: set },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This campaign cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "campaign.status." + target.toLowerCase(),
      targetType: "Campaign",
      targetId: id,
    });
  } catch (err) {
    console.error("Set campaign status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Campaign status updated." };
}
