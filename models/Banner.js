import mongoose from "mongoose";
import { BANNER_STATUSES } from "@/lib/bannerRules";

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    text: { type: String, required: true, trim: true, maxlength: 200 },
    linkUrl: { type: String, trim: true, maxlength: 200 },
    linkLabel: { type: String, trim: true, maxlength: 30 },
    startDate: { type: String },
    endDate: { type: String },
    sortOrder: { type: Number, default: 100 },
    status: { type: String, enum: BANNER_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Banner || mongoose.model("Banner", bannerSchema);
