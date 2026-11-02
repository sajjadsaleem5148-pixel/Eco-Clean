import mongoose from "mongoose";

const movementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "RewardProduct", required: true, index: true },
    type: { type: String, enum: ["RESTOCK", "ADJUST", "RESERVE", "RELEASE", "FULFILL"], required: true },
    quantity: { type: Number, required: true },
    stockAfter: { type: Number, required: true },
    reservedAfter: { type: Number, required: true },
    reason: { type: String, required: true, maxlength: 300 },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "RewardOrder" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

movementSchema.index({ createdAt: -1 });

export default mongoose.models.InventoryMovement || mongoose.model("InventoryMovement", movementSchema);
