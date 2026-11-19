import mongoose from "mongoose";
import { VENDOR_CATEGORIES, VENDOR_STATUSES } from "@/lib/vendorRules";

const vendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    nameKey: { type: String, required: true, unique: true },
    category: { type: String, enum: Object.keys(VENDOR_CATEGORIES), required: true, index: true },
    contactPerson: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, trim: true, maxlength: 25 },
    address: { type: String, trim: true, maxlength: 300 },
    notes: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: VENDOR_STATUSES, default: "PENDING", index: true },
    statusReason: { type: String, maxlength: 300 },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Vendor || mongoose.model("Vendor", vendorSchema);
