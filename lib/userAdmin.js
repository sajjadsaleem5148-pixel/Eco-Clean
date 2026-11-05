// Staff roles jo UI se banaye ja sakte hain. SUPER_ADMIN jaan boojh kar shamil nahi.
export const STAFF_ROLES = [
  "OPERATIONS_MANAGER",
  "COMPLAINTS_MANAGER",
  "COLLECTOR_SUPERVISOR",
  "REWARDS_MANAGER",
  "CONTENT_MANAGER",
  "SUPPORT_AGENT",
  "READ_ONLY_ANALYST",
];

export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  OPERATIONS_MANAGER: "Operations Manager",
  COMPLAINTS_MANAGER: "Complaints Manager",
  COLLECTOR_SUPERVISOR: "Collector Supervisor",
  REWARDS_MANAGER: "Rewards Manager",
  CONTENT_MANAGER: "Content Manager",
  SUPPORT_AGENT: "Support Agent",
  READ_ONLY_ANALYST: "Read-only Analyst",
  COLLECTOR: "Collector",
  RESIDENT: "Resident",
};

// /admin/users par yeh do roles nazar aate hain.
export const MANAGEABLE_ROLES = ["RESIDENT", "COLLECTOR"];

export const USER_STATUSES = ["ACTIVE", "SUSPENDED"];

export const USER_STATUS_LABELS = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  PENDING: "Pending",
};
