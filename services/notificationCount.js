import connectDB from "@/lib/db/connect";
import Notification from "@/models/Notification";

// Only a number is returned. It never throws: a database problem gives null and the bell is shown without a count.
export async function unreadCountFor(userId) {
  try {
    await connectDB();
    return await Notification.countDocuments({ user: userId, readAt: null });
  } catch (err) {
    console.error("Unread count failed:", err.message);
    return null;
  }
}
