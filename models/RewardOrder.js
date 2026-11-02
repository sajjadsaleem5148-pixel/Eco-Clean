import mongoose from "mongoose";
import { ORDER_STATUSES } from "@/lib/rewardStatus";

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 300 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "RewardProduct", required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    pointsCost: { type: Number, required: true, min: 1 },
    fulfillment: { type: String, enum: ["PICKUP", "DISPATCH"], required: true },
    note: { type: String, trim: true, maxlength: 200 },
    status: { type: String, enum: ORDER_STATUSES, default: "PENDING", index: true },
    statusHistory: [historySchema],
    pointsTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "GreenPointsTransaction" },
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);
orderSchema.index({ createdAt: -1 });

export default mongoose.models.RewardOrder || mongoose.model("RewardOrder", orderSchema);
