import mongoose from "mongoose";
import { SCHEDULE_STATUSES } from "@/lib/scheduleStatus";

const scheduleSchema = new mongoose.Schema(
  {
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone", required: true, index: true },
    // 0 = Sunday ... 6 = Saturday. A weekly recurring schedule.
    weekday: { type: Number, required: true, min: 0, max: 6 },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    collector: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    note: { type: String, trim: true, maxlength: 200 },
    status: { type: String, enum: SCHEDULE_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    confirmedAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cancelReason: { type: String, maxlength: 300 },
  },
  { timestamps: true }
);

scheduleSchema.index({ collector: 1, weekday: 1, status: 1 });

export default mongoose.models.CollectionSchedule || mongoose.model("CollectionSchedule", scheduleSchema);
