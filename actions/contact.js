"use server";

import crypto from "node:crypto";
import { z } from "zod";
import connectDB from "@/lib/db/connect";
import ContactMessage from "@/models/ContactMessage";
import { hit, makeKey, getClientIp } from "@/lib/security/rateLimit";
import { CONTACT_CATEGORIES } from "@/lib/contactStatus";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email").max(200),
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(150),
  category: z.enum(Object.keys(CONTACT_CATEGORIES), { message: "Please choose a category" }),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000),
});

function makeReference() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return "CM-" + d + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

const SUCCESS =
  "Thank you. Your message was recorded. A staff member will review it. This confirmation is not an email.";

export async function createContactMessageAction(prevState, formData) {
  // Honeypot: insaan yeh field nahi bharta. Bot ko jhoota success dikha dete hain.
  if (String(formData.get("website") || "").length > 0) {
    return { success: SUCCESS };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    category: formData.get("category"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const ip = await getClientIp();
    const [byIp, byEmail] = await Promise.all([
      hit(makeKey("contact-ip", ip), 5, 60 * 60),
      hit(makeKey("contact-email", d.email), 3, 60 * 60),
    ]);
    if (!byIp.ok || !byEmail.ok) {
      return { error: "Too many messages were sent recently. Please try again later." };
    }

    await connectDB();
    const created = await ContactMessage.create({ ...d, reference: makeReference() });
    return { success: SUCCESS + " Reference: " + created.reference };
  } catch (err) {
    console.error("Contact message failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }
}
