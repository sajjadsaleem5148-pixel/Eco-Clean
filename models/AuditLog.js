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
