import mongoose from "mongoose";

const complaintMessageSchema = new mongoose.Schema(
  {
    complaint: { type: mongoose.Schema.Types.ObjectId, ref: "Complaint", required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    authorRole: { type: String, required: true },
    // INTERNAL messages residents ko kabhi nahi dikhte.
    visibility: { type: String, enum: ["PUBLIC", "INTERNAL"], default: "PUBLIC", index: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.models.ComplaintMessage || mongoose.model("ComplaintMessage", complaintMessageSchema);
