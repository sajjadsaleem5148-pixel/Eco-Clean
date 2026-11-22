"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Article from "@/models/Article";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  ARTICLE_STATUSES,
  ARTICLE_STATUS_FROM,
  normalizeText,
  normalizeBody,
  makeSlug,
  validateArticleFields,
} from "@/lib/articleRules";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid article");

function readFields(formData) {
  return {
    title: String(formData.get("title") || ""),
    summary: String(formData.get("summary") || ""),
    body: String(formData.get("body") || ""),
    category: String(formData.get("category") || ""),
  };
}

function refresh(slug) {
  revalidatePath("/admin/content");
  revalidatePath("/learn");
  if (slug) revalidatePath("/learn/" + slug);
}

export async function createArticleAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const d = readFields(formData);
  const problem = validateArticleFields(d);
  if (problem) return { error: problem };
  const slug = makeSlug(normalizeText(d.title));
  if (!slug) return { error: "The title needs letters (a to z) or numbers to make a web address." };

  try {
    await connectDB();
    const created = await Article.create({
      title: normalizeText(d.title),
      slug: slug,
      summary: normalizeText(d.summary),
      body: normalizeBody(d.body),
      category: d.category,
      status: "DRAFT",
      createdBy: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "article.create",
      targetType: "Article",
      targetId: created._id.toString(),
      metadata: { slug: slug },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "An article with this web address already exists. Change the title." };
    console.error("Create article failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Article saved as a draft. It is not public until you publish it." };
}

export async function updateArticleAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const idCheck = objectId.safeParse(String(formData.get("articleId") || ""));
  if (!idCheck.success) return { error: idCheck.error.issues[0].message };
  const d = readFields(formData);
  const problem = validateArticleFields(d);
  if (problem) return { error: problem };

  try {
    await connectDB();
    // Only a draft can be edited, and the web address never changes, so links keep working.
    const updated = await Article.findOneAndUpdate(
      { _id: idCheck.data, deletedAt: null, status: "DRAFT" },
      {
        $set: {
          title: normalizeText(d.title),
          summary: normalizeText(d.summary),
          body: normalizeBody(d.body),
          category: d.category,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Only a draft article can be edited. Move it to draft first." };

    await writeAudit({
      actor: user.id,
      action: "article.update",
      targetType: "Article",
      targetId: idCheck.data,
    });
  } catch (err) {
    console.error("Update article failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Article updated." };
}

const statusSchema = z.object({
  articleId: objectId,
  target: z.enum(ARTICLE_STATUSES, { message: "Invalid status" }),
});

export async function setArticleStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    articleId: String(formData.get("articleId") || ""),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { articleId: id, target } = parsed.data;

  const set = { status: target };
  if (target === "PUBLISHED") {
    set.publishedBy = user.id;
    set.publishedAt = new Date();
  }

  let slug = "";
  try {
    await connectDB();
    // The old status is part of the filter, so two requests at the same time cannot both succeed.
    const updated = await Article.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: ARTICLE_STATUS_FROM[target] } },
      { $set: set },
      { returnDocument: "after" }
    ).select("slug");
    if (!updated) return { error: "This article cannot be moved to that status. Please reload." };
    slug = updated.slug;

    await writeAudit({
      actor: user.id,
      action: "article.status." + target.toLowerCase(),
      targetType: "Article",
      targetId: id,
    });
  } catch (err) {
    console.error("Set article status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh(slug);
  return { success: "Article status updated." };
}
