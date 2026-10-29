import connectDB from "@/lib/db/connect";
import AuditLog from "@/models/AuditLog";

export async function writeAudit({ actor, action, targetType, targetId, reason, metadata }) {
  try {
    await connectDB();
    await AuditLog.create({ actor, action, targetType, targetId, reason, metadata });
  } catch (err) {
    console.error("Audit log write failed:", err.message);
  }
}
