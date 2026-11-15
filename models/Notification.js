import mongoose from "mongoose";
import { NOTIFICATION_TYPES } from "@/lib/notificationTypes";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 300 },
    link: { type: String, maxlength: 200 },
    readAt: { type: Date, default: null },
    // Stops the same event from creating the same notification twice for one person.
    dedupeKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index(
  { user: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);

export default mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
