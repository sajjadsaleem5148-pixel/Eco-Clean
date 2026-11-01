import mongoose from "mongoose";
import { REPORT_STATUSES } from "@/lib/reportStatus";

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: REPORT_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const wasteReportSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true, unique: true },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "WasteCategory", required: true },
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone", required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    addressKey: { type: String, index: true },
    status: { type: String, enum: REPORT_STATUSES, default: "SUBMITTED", index: true },
    priority: { type: String, enum: ["LOW", "NORMAL", "HIGH"], default: "NORMAL" },
    possibleDuplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: "WasteReport" },
    idempotencyKey: { type: String },
    assignedCollector: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    assignedAt: { type: Date },
    statusHistory: [statusHistorySchema],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

wasteReportSchema.index(
  { reporter: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);
wasteReportSchema.index({ createdAt: -1 });

export default mongoose.models.WasteReport || mongoose.model("WasteReport", wasteReportSchema);
