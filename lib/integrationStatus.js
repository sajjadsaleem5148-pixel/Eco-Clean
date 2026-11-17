// Describes each integration and which environment variables it needs.
// Only the NAMES of variables are used. Their values are never returned or shown.
export const INTEGRATIONS = [
  {
    key: "database",
    name: "Database (MongoDB)",
    purpose: "Stores every record. It must be a replica set, because points and rewards use transactions.",
    env: ["MONGODB_URI"],
    mode: "all",
    required: true,
    usedByApp: true,
  },
  {
    key: "auth",
    name: "Sign-in sessions",
    purpose: "Signs and protects login sessions.",
    env: ["AUTH_SECRET"],
    mode: "all",
    minLength: 32,
    required: true,
    usedByApp: true,
  },
  {
    key: "maps",
    name: "Maps and geocoding",
    purpose: "Pickup location on a map. Either provider is enough.",
    env: ["GOOGLE_MAPS_API_KEY", "MAPBOX_ACCESS_TOKEN"],
    mode: "any",
    required: false,
    usedByApp: false,
  },
  {
    key: "storage",
    name: "Private file storage",
    purpose: "Private photographs and documents.",
    env: ["STORAGE_ENDPOINT", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY", "STORAGE_BUCKET"],
    mode: "all",
    required: false,
    usedByApp: false,
  },
  {
    key: "email",
    name: "Email provider",
    purpose: "Password reset and email notifications.",
    env: ["EMAIL_PROVIDER_API_KEY"],
    mode: "all",
    required: false,
    usedByApp: false,
  },
  {
    key: "sms",
    name: "SMS provider",
    purpose: "Optional text message notifications.",
    env: ["SMS_PROVIDER_API_KEY"],
    mode: "all",
    required: false,
    usedByApp: false,
  },
];

export function envStatus(integration, env) {
  const source = env || {};
  const min = Math.max(1, integration.minLength || 0);
  const present = integration.env.filter((name) => {
    const value = source[name];
    return typeof value === "string" && value.trim().length >= min;
  });
  const configured =
    integration.mode === "any" ? present.length > 0 : present.length === integration.env.length;
  const missing = configured ? [] : integration.env.filter((name) => !present.includes(name));
  return { configured: configured, missing: missing };
}

export const STATE_LABELS = {
  CONNECTED: "Connected (live check passed)",
  CONFIGURED: "Configured, not verified",
  NOT_CONFIGURED: "Not configured",
  FAILED: "Check failed",
};

// Reuses the existing status colours: green, amber, grey and red.
export const STATE_BADGE_STATUS = {
  CONNECTED: "ACTIVE",
  CONFIGURED: "PENDING",
  NOT_CONFIGURED: "DRAFT",
  FAILED: "REJECTED",
};

// Only the database has a real health check. Every other state is based on settings alone.
export function stateFor(integration, env, health) {
  if (integration.key === "database") {
    return health && health.ok ? "CONNECTED" : "FAILED";
  }
  return envStatus(integration, env).configured ? "CONFIGURED" : "NOT_CONFIGURED";
}
