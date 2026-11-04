import mongoose from "mongoose";
import { CONTACT_CATEGORIES, CONTACT_STATUSES } from "@/lib/contactStatus";

const replySchema = new mongoose.Schema(
  {
    body: { type: String, required: true, maxlength: 2000 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const contactSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    category: { type: String, enum: Object.keys(CONTACT_CATEGORIES), required: true, index: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: CONTACT_STATUSES, default: "NEW", index: true },
    replies: [replySchema],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contactSchema.index({ createdAt: -1 });

export default mongoose.models.ContactMessage || mongoose.model("ContactMessage", contactSchema);
