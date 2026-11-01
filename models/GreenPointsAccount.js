import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    lifetimeEarned: { type: Number, default: 0 },
    lifetimeRedeemed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.GreenPointsAccount || mongoose.model("GreenPointsAccount", accountSchema);
