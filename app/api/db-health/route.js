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
