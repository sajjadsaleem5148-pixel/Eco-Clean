import mongoose from "mongoose";

const ruleSchema = new mongoose.Schema(
  {
    category: { type: mongoose.Schema.Types.ObjectId, ref: "WasteCategory", required: true, unique: true },
    points: { type: Number, required: true, min: 1, max: 1000 },
    active: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.PointsEarningRule || mongoose.model("PointsEarningRule", ruleSchema);
