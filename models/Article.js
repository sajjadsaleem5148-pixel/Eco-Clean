import mongoose from "mongoose";
import { ARTICLE_STATUSES, ARTICLE_CATEGORIES } from "@/lib/articleRules";

const articleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true },
    summary: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 8000 },
    category: { type: String, enum: Object.keys(ARTICLE_CATEGORIES), required: true, index: true },
    status: { type: String, enum: ARTICLE_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Article || mongoose.model("Article", articleSchema);
