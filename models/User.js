import mongoose from "mongoose";
import { ROLES } from "@/lib/permissions/roles";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.RESIDENT, index: true },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED", "PENDING"], default: "ACTIVE", index: true },
    suspensionReason: { type: String },
    emailVerified: { type: Boolean, default: false },
    sessionVersion: { type: Number, default: 0 },
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone" },
    isRootAdmin: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", userSchema);
