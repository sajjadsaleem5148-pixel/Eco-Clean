import mongoose from "mongoose";
import { VEHICLE_TYPES, VEHICLE_STATUSES } from "@/lib/vehicleRules";

const vehicleSchema = new mongoose.Schema(
  {
    plate: { type: String, required: true, trim: true, maxlength: 15 },
    plateKey: { type: String, required: true, unique: true },
    type: { type: String, enum: Object.keys(VEHICLE_TYPES), required: true },
    capacityKg: { type: Number, required: true, min: 1, max: 50000 },
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone", index: true },
    status: { type: String, enum: VEHICLE_STATUSES, default: "ACTIVE", index: true },
    statusReason: { type: String, maxlength: 300 },
    notes: { type: String, trim: true, maxlength: 300 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Vehicle || mongoose.model("Vehicle", vehicleSchema);
