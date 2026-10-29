const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("lib/db/connect.js", `
import mongoose from "mongoose";

let cached = globalThis._mongoose;
if (!cached) cached = globalThis._mongoose = { conn: null, promise: null };

export default async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI .env.local mein set nahi hai");
  }
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, { bufferCommands: false })
      .catch((err) => {
        cached.promise = null;
        throw err;
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
`);

write("lib/permissions/roles.js", `
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  OPERATIONS_MANAGER: "OPERATIONS_MANAGER",
  COMPLAINTS_MANAGER: "COMPLAINTS_MANAGER",
  COLLECTOR_SUPERVISOR: "COLLECTOR_SUPERVISOR",
  REWARDS_MANAGER: "REWARDS_MANAGER",
  CONTENT_MANAGER: "CONTENT_MANAGER",
  SUPPORT_AGENT: "SUPPORT_AGENT",
  READ_ONLY_ANALYST: "READ_ONLY_ANALYST",
  COLLECTOR: "COLLECTOR",
  RESIDENT: "RESIDENT",
};

export const ADMIN_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.OPERATIONS_MANAGER,
  ROLES.COMPLAINTS_MANAGER,
  ROLES.COLLECTOR_SUPERVISOR,
  ROLES.REWARDS_MANAGER,
  ROLES.CONTENT_MANAGER,
  ROLES.SUPPORT_AGENT,
  ROLES.READ_ONLY_ANALYST,
];

export const PERMISSIONS = [
  "users.read", "users.update", "users.suspend",
  "reports.read", "reports.verify", "reports.assign",
  "collections.manage", "complaints.resolve",
  "points.read", "points.adjust",
  "rewards.manage", "inventory.manage",
  "content.publish",
  "analytics.read", "analytics.export",
  "settings.manage", "admins.manage",
  "audit.read", "security.manage",
];

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: PERMISSIONS,
  OPERATIONS_MANAGER: [
    "users.read", "reports.read", "reports.verify", "reports.assign",
    "collections.manage", "analytics.read",
  ],
  COMPLAINTS_MANAGER: ["users.read", "reports.read", "complaints.resolve", "analytics.read"],
  COLLECTOR_SUPERVISOR: ["users.read", "reports.read", "reports.assign", "collections.manage"],
  REWARDS_MANAGER: ["users.read", "points.read", "rewards.manage", "inventory.manage", "analytics.read"],
  CONTENT_MANAGER: ["content.publish"],
  SUPPORT_AGENT: ["users.read", "reports.read", "complaints.resolve"],
  READ_ONLY_ANALYST: ["analytics.read", "reports.read", "points.read"],
  COLLECTOR: [],
  RESIDENT: [],
};

export function hasPermission(role, permission) {
  if (!role || !permission) return false;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}
`);

write("models/User.js", `
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
`);

write("models/ServiceZone.js", `
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
`);

write("models/WasteCategory.js", `
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
`);

write("models/AuditLog.js", `
import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String },
    targetId: { type: String },
    reason: { type: String },
    outcome: { type: String, enum: ["SUCCESS", "FAILURE"], default: "SUCCESS" },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const BLOCKED = [
  "updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace",
  "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete",
];
BLOCKED.forEach((op) => {
  auditLogSchema.pre(op, function () {
    throw new Error("AuditLog append-only hai: " + op + " allowed nahi");
  });
});

export default mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
`);

write("app/api/db-health/route.js", `
import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import "@/models/User";
import "@/models/ServiceZone";
import "@/models/WasteCategory";
import "@/models/AuditLog";

export async function GET() {
  try {
    await connectDB();
    return Response.json({
      status: "ok",
      database: mongoose.connection.name,
      models: mongoose.modelNames(),
    });
  } catch (err) {
    console.error("DB health check failed:", err.message);
    return Response.json(
      { status: "error", message: "Database se connect nahi ho saka" },
      { status: 503 }
    );
  }
}
`);

console.log("\nSab files ban gayin.");