import mongoose from "mongoose";
import { TESTIMONIAL_STATUSES } from "@/lib/testimonialRules";

const testimonialSchema = new mongoose.Schema(
  {
    quote: { type: String, required: true, trim: true, maxlength: 400 },
    authorName: { type: String, required: true, trim: true, maxlength: 80 },
    authorDetail: { type: String, trim: true, maxlength: 80 },
    // Only a record that the person agreed. The app cannot verify it.
    consentConfirmed: { type: Boolean, default: false },
    consentNote: { type: String, trim: true, maxlength: 200 },
    sortOrder: { type: Number, default: 100 },
    status: { type: String, enum: TESTIMONIAL_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Testimonial || mongoose.model("Testimonial", testimonialSchema);
