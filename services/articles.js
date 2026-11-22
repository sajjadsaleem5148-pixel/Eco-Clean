import connectDB from "@/lib/db/connect";
import Article from "@/models/Article";
import { isValidSlug } from "@/lib/articleRules";

// For public pages. Only published articles are read, and only the public fields are selected.
export async function listPublicArticles() {
  await connectDB();
  const list = await Article.find({ status: "PUBLISHED", deletedAt: null })
    .sort({ publishedAt: -1 })
    .limit(100)
    .select("title slug summary category publishedAt")
    .lean();
  return list.map((a) => ({
    id: a._id.toString(),
    title: a.title,
    slug: a.slug,
    summary: a.summary,
    category: a.category,
    publishedAt: a.publishedAt || null,
  }));
}

// Returns null when the article does not exist, is not published, or the address is malformed.
export async function getPublicArticle(slug) {
  if (!isValidSlug(slug)) return null;
  await connectDB();
  const a = await Article.findOne({ slug: slug, status: "PUBLISHED", deletedAt: null })
    .select("title slug summary body category publishedAt")
    .lean();
  if (!a) return null;
  return {
    id: a._id.toString(),
    title: a.title,
    slug: a.slug,
    summary: a.summary,
    body: a.body,
    category: a.category,
    publishedAt: a.publishedAt || null,
  };
}
