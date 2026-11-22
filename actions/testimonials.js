"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Testimonial from "@/models/Testimonial";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  TESTIMONIAL_STATUSES,
  TESTIMONIAL_STATUS_FROM,
  QUOTE_MIN,
  QUOTE_MAX,
  NAME_MIN,
  NAME_MAX,
  DETAIL_MAX,
  CONSENT_NOTE_MIN,
  CONSENT_NOTE_MAX,
  normalizeText,
  isValidQuote,
  isValidPersonName,
  isValidDetail,
} from "@/lib/testimonialRules";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid testimonial");

const shared = {
  quote: z.string().trim().min(QUOTE_MIN, "The quote must be at least " + QUOTE_MIN + " characters").max(QUOTE_MAX, "The quote is too long (" + QUOTE_MAX + " characters maximum)"),
  authorName: z.string().trim().min(NAME_MIN, "Name must be at least " + NAME_MIN + " characters").max(NAME_MAX, "Name is too long (" + NAME_MAX + " characters maximum)"),
  authorDetail: z.string().trim().max(DETAIL_MAX, "The role or place is too long (" + DETAIL_MAX + " characters maximum)"),
  consentNote: z.string().trim().min(CONSENT_NOTE_MIN, "Write how consent was given (at least " + CONSENT_NOTE_MIN + " characters)").max(CONSENT_NOTE_MAX, "The consent note is too long (" + CONSENT_NOTE_MAX + " characters maximum)"),
  sortOrder: z.coerce.number().int("Use a whole number").min(0, "Minimum order is 0").max(1000, "Maximum order is 1000"),
};

const createSchema = z.object(shared);
const updateSchema = z.object(Object.assign({ testimonialId: objectId }, shared));

function readFields(formData) {
  return {
    quote: String(formData.get("quote") || ""),
    authorName: String(formData.get("authorName") || ""),
    authorDetail: String(formData.get("authorDetail") || ""),
    consentNote: String(formData.get("consentNote") || ""),
    sortOrder: formData.get("sortOrder"),
  };
}

// Returns an error message, or null when the text is fine.
function checkText(d, consent) {
  if (!consent) return "Confirm that the person agreed to be quoted.";
  if (!isValidQuote(d.quote)) return "The quote must not contain < or > characters.";
  if (!isValidPersonName(d.authorName)) return "Enter a valid name. It needs a letter or number and no < or > characters.";
  if (!isValidDetail(d.authorDetail)) return "The role or place must not contain < or > characters.";
  return null;
}

function refresh() {
  revalidatePath("/admin/testimonials");
  revalidatePath("/testimonials");
}

export async function createTestimonialAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse(readFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const consent = formData.get("consent") === "yes";
  const textError = checkText(d, consent);
  if (textError) return { error: textError };

  try {
    await connectDB();
    const created = await Testimonial.create({
      quote: normalizeText(d.quote),
      authorName: normalizeText(d.authorName),
      authorDetail: normalizeText(d.authorDetail),
      consentConfirmed: true,
      consentNote: normalizeText(d.consentNote),
      sortOrder: d.sortOrder,
      status: "DRAFT",
      createdBy: user.id,
    });
    // The audit entry never contains the quote or the name.
    await writeAudit({
      actor: user.id,
      action: "testimonial.create",
      targetType: "Testimonial",
      targetId: created._id.toString(),
    });
  } catch (err) {
    console.error("Create testimonial failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Testimonial saved as a draft. It is not public until you publish it." };
}

export async function updateTestimonialAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse(
    Object.assign({ testimonialId: String(formData.get("testimonialId") || "") }, readFields(formData))
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const consent = formData.get("consent") === "yes";
  const textError = checkText(d, consent);
  if (textError) return { error: textError };

  try {
    await connectDB();
    // Only a draft can be edited, so live text never changes without going back to draft first.
    const updated = await Testimonial.findOneAndUpdate(
      { _id: d.testimonialId, deletedAt: null, status: "DRAFT" },
      {
        $set: {
          quote: normalizeText(d.quote),
          authorName: normalizeText(d.authorName),
          authorDetail: normalizeText(d.authorDetail),
          consentConfirmed: true,
          consentNote: normalizeText(d.consentNote),
          sortOrder: d.sortOrder,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Only a draft testimonial can be edited. Move it to draft first." };

    await writeAudit({
      actor: user.id,
      action: "testimonial.update",
      targetType: "Testimonial",
      targetId: d.testimonialId,
    });
  } catch (err) {
    console.error("Update testimonial failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Testimonial updated." };
}

const statusSchema = z.object({
  testimonialId: objectId,
  target: z.enum(TESTIMONIAL_STATUSES, { message: "Invalid status" }),
});

export async function setTestimonialStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    testimonialId: String(formData.get("testimonialId") || ""),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { testimonialId: id, target } = parsed.data;

  const filter = { _id: id, deletedAt: null, status: { $in: TESTIMONIAL_STATUS_FROM[target] } };
  const set = { status: target };

  try {
    await connectDB();

    if (target === "PUBLISHED") {
      const current = await Testimonial.findOne({ _id: id, deletedAt: null }).select("consentConfirmed").lean();
      if (!current) return { error: "Testimonial not found." };
      if (!current.consentConfirmed) {
        return { error: "Consent is not recorded for this testimonial, so it cannot be published." };
      }
      // The consent rule is part of the update filter too, so a race cannot skip it.
      filter.consentConfirmed = true;
      set.publishedBy = user.id;
      set.publishedAt = new Date();
    }

    // The old status is part of the filter, so two requests at the same time cannot both succeed.
    const updated = await Testimonial.findOneAndUpdate(filter, { $set: set }, { returnDocument: "after" }).select("_id");
    if (!updated) return { error: "This testimonial cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "testimonial.status." + target.toLowerCase(),
      targetType: "Testimonial",
      targetId: id,
    });
  } catch (err) {
    console.error("Set testimonial status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Testimonial status updated." };
}
