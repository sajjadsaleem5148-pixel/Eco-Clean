import mongoose from "mongoose";
import { CONTENT_STATUSES, SERVICE_CATEGORIES } from "@/lib/contentStatus";

const serviceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String, enum: Object.keys(SERVICE_CATEGORIES), required: true, index: true },
    eligibleCustomer: { type: String, enum: ["RESIDENT", "COMMERCIAL", "ALL"], default: "ALL" },
    availability: { type: String, trim: true, maxlength: 300 },
    collectionInstructions: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: CONTENT_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Service || mongoose.model("Service", serviceSchema);
