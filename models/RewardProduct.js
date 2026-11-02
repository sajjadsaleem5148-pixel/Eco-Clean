import mongoose from "mongoose";
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from "@/lib/rewardStatus";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    category: { type: String, enum: Object.keys(PRODUCT_CATEGORIES), required: true, index: true },
    environmentalBenefit: { type: String, trim: true, maxlength: 300 },
    pointsPrice: { type: Number, required: true, min: 1, max: 100000 },
    stockAvailable: { type: Number, default: 0, min: 0 },
    stockReserved: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    fulfillment: { type: String, enum: ["PICKUP", "DISPATCH"], required: true },
    status: { type: String, enum: PRODUCT_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.RewardProduct || mongoose.model("RewardProduct", productSchema);
