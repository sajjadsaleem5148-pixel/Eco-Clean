import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import ContactMessage from "@/models/ContactMessage";
import { OPEN_STATUSES } from "@/lib/complaintStatus";
import { waitingHours } from "@/lib/supportOverview";

// Counts only. No name, email, message text or id of any person is selected or returned.
export async function getSupportOverview(now) {
  await connectDB();
  const open = { deletedAt: null, status: { $in: OPEN_STATUSES } };

  const [openComplaints, escalated, highPriority, unassigned, newMessages, activeMessages, oldestNew] =
    await Promise.all([
      Complaint.countDocuments(open),
      Complaint.countDocuments({ deletedAt: null, status: "ESCALATED" }),
      Complaint.countDocuments(Object.assign({}, open, { priority: "HIGH" })),
      Complaint.countDocuments(Object.assign({}, open, { assignedTo: null })),
      ContactMessage.countDocuments({ deletedAt: null, status: "NEW" }),
      ContactMessage.countDocuments({ deletedAt: null, status: "IN_PROGRESS" }),
      ContactMessage.findOne({ deletedAt: null, status: "NEW" }).sort({ createdAt: 1 }).select("createdAt").lean(),
    ]);

  return {
    openComplaints: openComplaints,
    escalated: escalated,
    highPriority: highPriority,
    unassigned: unassigned,
    newMessages: newMessages,
    messagesInProgress: activeMessages,
    oldestNewMessageHours: oldestNew ? waitingHours(oldestNew.createdAt, now) : null,
  };
}
