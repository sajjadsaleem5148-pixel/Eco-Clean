import connectDB from "@/lib/db/connect";
import Notification from "@/models/Notification";
import User from "@/models/User";
import WasteReport from "@/models/WasteReport";
import Complaint from "@/models/Complaint";
import RewardOrder from "@/models/RewardOrder";
import { ADMIN_ROLES, hasPermission } from "@/lib/permissions/roles";
import { NOTIFICATION_TYPES, safeLink, clip } from "@/lib/notificationTypes";

const MAX_STAFF_RECIPIENTS = 50;

// Creating a notification must never break the real action, so this function never throws.
export async function notifyUser(input) {
  try {
    const data = input || {};
    if (!data.userId || !NOTIFICATION_TYPES.includes(data.type)) return false;
    await connectDB();
    await Notification.create({
      user: data.userId,
      type: data.type,
      title: clip(data.title, 120),
      body: clip(data.body, 300),
      link: safeLink(data.link),
      dedupeKey: data.dedupeKey || undefined,
    });
    return true;
  } catch (err) {
    // 11000 means the same notification already exists, which is fine.
    if (!(err && err.code === 11000)) console.error("Create notification failed:", err.message);
    return false;
  }
}

// Staff who hold a permission, for example reports.verify. Only active accounts.
export async function notifyRoleStaff(permission, payload) {
  try {
    const roles = ADMIN_ROLES.filter((r) => hasPermission(r, permission));
    if (roles.length === 0) return 0;
    await connectDB();
    const staff = await User.find({ role: { $in: roles }, status: "ACTIVE", deletedAt: null })
      .select("_id")
      .limit(MAX_STAFF_RECIPIENTS)
      .lean();
    let sent = 0;
    for (const s of staff) {
      const ok = await notifyUser(Object.assign({}, payload, { userId: s._id }));
      if (ok) sent += 1;
    }
    return sent;
  } catch (err) {
    console.error("Notify staff failed:", err.message);
    return 0;
  }
}

export async function notifyReportOwner(reportId, payload) {
  try {
    await connectDB();
    const report = await WasteReport.findOne({ reportId, deletedAt: null }).select("reporter").lean();
    if (!report) return false;
    return await notifyUser(Object.assign({}, payload, { userId: report.reporter }));
  } catch (err) {
    console.error("Notify report owner failed:", err.message);
    return false;
  }
}

export async function notifyComplaintOwner(ticketNumber, payload) {
  try {
    await connectDB();
    const complaint = await Complaint.findOne({ ticketNumber, deletedAt: null }).select("reporter").lean();
    if (!complaint) return false;
    return await notifyUser(Object.assign({}, payload, { userId: complaint.reporter }));
  } catch (err) {
    console.error("Notify complaint owner failed:", err.message);
    return false;
  }
}

export async function notifyOrderOwner(orderNumber, payload) {
  try {
    await connectDB();
    const order = await RewardOrder.findOne({ orderNumber }).select("user").lean();
    if (!order) return false;
    return await notifyUser(Object.assign({}, payload, { userId: order.user }));
  } catch (err) {
    console.error("Notify order owner failed:", err.message);
    return false;
  }
}

// Always limited to one user's own notifications.
export async function listFor(userId, options) {
  const opts = options || {};
  const pageSize = opts.pageSize || 20;
  const page = Math.max(1, opts.page || 1);
  await connectDB();

  const filter = { user: userId };
  if (opts.unreadOnly) filter.readAt = null;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: userId, readAt: null }),
  ]);

  return {
    total,
    unread,
    items: items.map((n) => ({
      id: n._id.toString(),
      type: n.type,
      title: n.title,
      body: n.body,
      link: safeLink(n.link),
      read: Boolean(n.readAt),
      createdAt: n.createdAt,
    })),
  };
}
