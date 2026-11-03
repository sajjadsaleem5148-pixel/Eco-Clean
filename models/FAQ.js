import mongoose from "mongoose";
import { CONTENT_STATUSES } from "@/lib/contentStatus";

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 200 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 },
    sortOrder: { type: Number, default: 100 },
    status: { type: String, enum: CONTENT_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.FAQ || mongoose.model("FAQ", faqSchema);
