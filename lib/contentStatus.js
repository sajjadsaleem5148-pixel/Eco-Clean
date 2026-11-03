export const CONTENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const CONTENT_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const CONTENT_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const CONTENT_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export function contentTargets(status) {
  return CONTENT_STATUSES.filter((t) => CONTENT_STATUS_FROM[t].includes(status));
}

export const SERVICE_CATEGORIES = {
  RESIDENTIAL: "Residential waste collection",
  COMMUNITY: "Community waste collection",
  COMMERCIAL: "Commercial waste collection",
  OFFICE: "Office waste management",
  EVENT_CLEANUP: "Event cleanup",
  EDUCATION: "Waste segregation education",
  RECYCLING: "Recycling coordination",
  COMPOSTING: "Organic waste and composting",
  CAMPAIGNS: "Community cleanliness campaigns",
  BAG_DISTRIBUTION: "Bag and container distribution",
};

export const ELIGIBLE_LABELS = {
  RESIDENT: "Residents",
  COMMERCIAL: "Businesses and institutions",
  ALL: "Residents and businesses",
};
