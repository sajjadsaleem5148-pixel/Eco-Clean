import mongoose from "mongoose";

const serviceZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
    targetCollectionEveryDays: { type: Number, default: 3, min: 1 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.ServiceZone || mongoose.model("ServiceZone", serviceZoneSchema);
