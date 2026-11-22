import mongoose from "mongoose";
import { ROUTE_STATUSES } from "@/lib/routeRules";

const routeSchema = new mongoose.Schema(
  {
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    nameKey: { type: String, required: true },
    collector: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    stops: { type: [String], default: [] },
    status: { type: String, enum: ROUTE_STATUSES, default: "DRAFT", index: true },
    statusReason: { type: String, maxlength: 300 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The same name may exist in different zones, but only once inside one zone.
routeSchema.index({ serviceZone: 1, nameKey: 1 }, { unique: true });

export default mongoose.models.CollectionRoute || mongoose.model("CollectionRoute", routeSchema);
