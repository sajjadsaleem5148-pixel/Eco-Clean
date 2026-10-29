import mongoose from "mongoose";

const wasteCategorySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, required: true },
    description: { type: String },
    acceptedMaterials: [{ type: String, trim: true }],
    prohibitedMaterials: [{ type: String, trim: true }],
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.WasteCategory || mongoose.model("WasteCategory", wasteCategorySchema);
