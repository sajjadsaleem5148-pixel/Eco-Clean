import crypto from "node:crypto";
import { headers } from "next/headers";
import connectDB from "@/lib/db/connect";
import RateLimit from "@/models/RateLimit";

export async function getClientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

export function makeKey(prefix, value) {
  return prefix + ":" + crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
}

export async function hit(key, limit, windowSeconds) {
  await connectDB();
  const ms = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / ms) * ms);
  const expiresAt = new Date(windowStart.getTime() + ms * 2);

  async function bump() {
    return RateLimit.findOneAndUpdate(
      { key, windowStart },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true }
    );
  }

  let doc;
  try {
    doc = await bump();
  } catch (err) {
    if (err && err.code === 11000) doc = await bump();
    else throw err;
  }
  return { ok: doc.count <= limit, count: doc.count };
}
