import mongoose from "mongoose";
import { CAMPAIGN_STATUSES } from "@/lib/campaignRules";

const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    summary: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, trim: true, maxlength: 2000 },
    startDate: { type: String },
    endDate: { type: String },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Campaign || mongoose.model("Campaign", campaignSchema);
