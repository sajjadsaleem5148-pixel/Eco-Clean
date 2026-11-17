import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";
import { ADMIN_ROLES } from "@/lib/permissions/roles";

// Never throws. A failed check is reported as ok: false.
export async function getDatabaseHealth() {
  try {
    await connectDB();
    const admin = mongoose.connection.db.admin();
    const started = Date.now();
    await admin.ping();
    const ms = Date.now() - started;
    const hello = await admin.command({ hello: 1 });
    return { ok: true, ms: ms, replicaSet: Boolean(hello && hello.setName) };
  } catch (err) {
    console.error("Database health check failed:", err.message);
    return { ok: false, ms: null, replicaSet: false };
  }
}

// Counts only. No personal data. Throws on database errors so the page can show an error.
export async function getSecuritySnapshot() {
  await connectDB();
  const [root, staff, suspended, audits, latest] = await Promise.all([
    User.exists({ isRootAdmin: true, status: "ACTIVE", deletedAt: null }),
    User.countDocuments({ role: { $in: ADMIN_ROLES }, status: "ACTIVE", deletedAt: null }),
    User.countDocuments({ status: "SUSPENDED", deletedAt: null }),
    AuditLog.countDocuments({}),
    AuditLog.findOne({}).sort({ createdAt: -1 }).select("createdAt").lean(),
  ]);
  return {
    rootAdminActive: Boolean(root),
    activeStaff: staff,
    suspendedAccounts: suspended,
    auditEntries: audits,
    latestAuditAt: latest ? latest.createdAt : null,
  };
}
