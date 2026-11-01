import mongoose from "mongoose";
import { COMPLAINT_STATUSES, COMPLAINT_CATEGORIES } from "@/lib/complaintStatus";

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: COMPLAINT_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, required: true, unique: true },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: String, enum: Object.keys(COMPLAINT_CATEGORIES), required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 1500 },
    location: { type: String, trim: true, maxlength: 300 },
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone" },
    priority: { type: String, enum: ["LOW", "NORMAL", "HIGH"], default: "NORMAL" },
    status: { type: String, enum: COMPLAINT_STATUSES, default: "SUBMITTED", index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    resolutionSummary: { type: String, maxlength: 500 },
    resolvedAt: { type: Date },
    reopenCount: { type: Number, default: 0 },
    idempotencyKey: { type: String },
    statusHistory: [historySchema],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

complaintSchema.index(
  { reporter: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);
complaintSchema.index({ createdAt: -1 });

export default mongoose.models.Complaint || mongoose.model("Complaint", complaintSchema);
