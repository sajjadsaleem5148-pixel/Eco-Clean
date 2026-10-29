export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  OPERATIONS_MANAGER: "OPERATIONS_MANAGER",
  COMPLAINTS_MANAGER: "COMPLAINTS_MANAGER",
  COLLECTOR_SUPERVISOR: "COLLECTOR_SUPERVISOR",
  REWARDS_MANAGER: "REWARDS_MANAGER",
  CONTENT_MANAGER: "CONTENT_MANAGER",
  SUPPORT_AGENT: "SUPPORT_AGENT",
  READ_ONLY_ANALYST: "READ_ONLY_ANALYST",
  COLLECTOR: "COLLECTOR",
  RESIDENT: "RESIDENT",
};

export const ADMIN_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.OPERATIONS_MANAGER,
  ROLES.COMPLAINTS_MANAGER,
  ROLES.COLLECTOR_SUPERVISOR,
  ROLES.REWARDS_MANAGER,
  ROLES.CONTENT_MANAGER,
  ROLES.SUPPORT_AGENT,
  ROLES.READ_ONLY_ANALYST,
];

export const PERMISSIONS = [
  "users.read", "users.update", "users.suspend",
  "reports.read", "reports.verify", "reports.assign",
  "collections.manage", "complaints.resolve",
  "points.read", "points.adjust",
  "rewards.manage", "inventory.manage",
  "content.publish",
  "analytics.read", "analytics.export",
  "settings.manage", "admins.manage",
  "audit.read", "security.manage",
];

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: PERMISSIONS,
  OPERATIONS_MANAGER: [
    "users.read", "reports.read", "reports.verify", "reports.assign",
    "collections.manage", "analytics.read",
  ],
  COMPLAINTS_MANAGER: ["users.read", "reports.read", "complaints.resolve", "analytics.read"],
  COLLECTOR_SUPERVISOR: ["users.read", "reports.read", "reports.assign", "collections.manage"],
  REWARDS_MANAGER: ["users.read", "points.read", "rewards.manage", "inventory.manage", "analytics.read"],
  CONTENT_MANAGER: ["content.publish"],
  SUPPORT_AGENT: ["users.read", "reports.read", "complaints.resolve"],
  READ_ONLY_ANALYST: ["analytics.read", "reports.read", "points.read"],
  COLLECTOR: [],
  RESIDENT: [],
};

export function hasPermission(role, permission) {
  if (!role || !permission) return false;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}
