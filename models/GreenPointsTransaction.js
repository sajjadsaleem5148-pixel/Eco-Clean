import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["EARN", "REDEEM", "REFUND", "ADJUST", "REVERSAL"], required: true },
    points: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    relatedReport: { type: mongoose.Schema.Types.ObjectId, ref: "WasteReport", index: true },
    verificationStatus: { type: String, enum: ["VERIFIED"], default: "VERIFIED" },
    reason: { type: String, required: true, maxlength: 300 },
    authorizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    idempotencyKey: { type: String, required: true, unique: true },
    reverses: { type: mongoose.Schema.Types.ObjectId, ref: "GreenPointsTransaction" },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "GreenPointsTransaction" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

transactionSchema.index({ createdAt: -1 });

export default mongoose.models.GreenPointsTransaction || mongoose.model("GreenPointsTransaction", transactionSchema);
