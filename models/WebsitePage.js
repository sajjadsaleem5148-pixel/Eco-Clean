import mongoose from "mongoose";
import { PAGE_KEY_LIST } from "@/lib/pageKeys";

const pageSchema = new mongoose.Schema(
  {
    key: { type: String, enum: PAGE_KEY_LIST, required: true, unique: true },
    title: { type: String, trim: true, maxlength: 150 },
    body: { type: String, maxlength: 20000 },
    draftTitle: { type: String, trim: true, maxlength: 150 },
    draftBody: { type: String, maxlength: 20000 },
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT", index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.WebsitePage || mongoose.model("WebsitePage", pageSchema);
