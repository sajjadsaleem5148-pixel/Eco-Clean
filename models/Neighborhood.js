import mongoose from "mongoose";
import { NEIGHBORHOOD_STATUSES } from "@/lib/neighborhoodRules";

const neighborhoodSchema = new mongoose.Schema(
  {
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    nameKey: { type: String, required: true },
    description: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: NEIGHBORHOOD_STATUSES, default: "ACTIVE", index: true },
    statusReason: { type: String, maxlength: 300 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The same name may exist in different zones, but only once inside one zone.
neighborhoodSchema.index({ serviceZone: 1, nameKey: 1 }, { unique: true });

export default mongoose.models.Neighborhood || mongoose.model("Neighborhood", neighborhoodSchema);
