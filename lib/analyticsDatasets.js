// Every dataset is aggregate counts or totals only. No names, emails, phone numbers or addresses.
export const DATASETS = {
  "reports-by-status": {
    label: "Garbage reports by status",
    description: "Number of garbage reports created in the range, grouped by current status.",
    zone: true,
    columns: [
      { key: "status", label: "Status" },
      { key: "count", label: "Reports" },
    ],
  },
  "reports-by-day": {
    label: "Garbage reports per day",
    description: "Number of garbage reports created on each UTC day.",
    zone: true,
    columns: [
      { key: "day", label: "Day" },
      { key: "count", label: "Reports" },
    ],
  },
  "complaints-by-status": {
    label: "Complaints by status",
    description: "Number of complaints created in the range, grouped by current status.",
    zone: true,
    columns: [
      { key: "status", label: "Status" },
      { key: "count", label: "Complaints" },
    ],
  },
  "points-by-type": {
    label: "Green Points by transaction type",
    description: "Number of ledger entries and the total signed points for each type.",
    zone: false,
    columns: [
      { key: "type", label: "Type" },
      { key: "entries", label: "Entries" },
      { key: "points", label: "Points" },
    ],
  },
  "orders-by-status": {
    label: "Reward orders by status",
    description: "Number of reward orders and the points they cost, grouped by current status.",
    zone: false,
    columns: [
      { key: "status", label: "Status" },
      { key: "orders", label: "Orders" },
      { key: "points", label: "Points" },
    ],
  },
};

export const DATASET_KEYS = Object.keys(DATASETS);
