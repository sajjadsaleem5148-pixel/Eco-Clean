import { describe, it, expect } from "vitest";
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_FROM,
  SERVICE_CATEGORIES,
  contentTargets,
} from "@/lib/contentStatus";
import {
  CONTACT_STATUSES,
  CONTACT_CATEGORIES,
  STATUS_FROM as CONTACT_FROM,
  REPLYABLE,
  decisionsFor as contactDecisions,
} from "@/lib/contactStatus";
import {
  PAGE_KEYS,
  PAGE_KEY_LIST,
  PAGE_OP_FROM,
  PAGE_OP_TARGET,
  annTargets,
} from "@/lib/pageKeys";

describe("content status", () => {
  it("only refers to real statuses", () => {
    Object.entries(CONTENT_STATUS_FROM).forEach(([to, froms]) => {
      expect(CONTENT_STATUSES).toContain(to);
      froms.forEach((f) => expect(CONTENT_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(contentTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(contentTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(contentTargets("ARCHIVED")).toEqual(["DRAFT"]);
  });

  it("has ten service categories", () => {
    expect(Object.keys(SERVICE_CATEGORIES)).toHaveLength(10);
  });
});

describe("contact messages", () => {
  it("only refers to real statuses", () => {
    Object.entries(CONTACT_FROM).forEach(([to, froms]) => {
      expect(CONTACT_STATUSES).toContain(to);
      froms.forEach((f) => expect(CONTACT_STATUSES).toContain(f));
    });
  });

  it("lets staff close or reopen a message", () => {
    expect(contactDecisions("NEW")).toEqual(["IN_PROGRESS", "CLOSED"]);
    expect(contactDecisions("IN_PROGRESS")).toEqual(["CLOSED"]);
    expect(contactDecisions("RESPONDED")).toEqual(["IN_PROGRESS", "CLOSED"]);
    expect(contactDecisions("CLOSED")).toEqual(["IN_PROGRESS"]);
  });

  it("does not allow replies on a closed message", () => {
    expect(REPLYABLE).not.toContain("CLOSED");
    expect(REPLYABLE).toContain("NEW");
  });

  it("has a general category", () => {
    expect(CONTACT_CATEGORIES.GENERAL).toBeTruthy();
  });
});

describe("website pages", () => {
  it("manages exactly About, Privacy and Terms", () => {
    expect(PAGE_KEY_LIST).toEqual(["ABOUT", "PRIVACY", "TERMS"]);
    PAGE_KEY_LIST.forEach((k) => expect(PAGE_KEYS[k].path.startsWith("/")).toBe(true));
  });

  it("only unpublishes a published page", () => {
    expect(PAGE_OP_FROM.unpublish).toEqual(["PUBLISHED"]);
  });

  it("maps each operation to a target status", () => {
    expect(PAGE_OP_TARGET).toEqual({ publish: "PUBLISHED", unpublish: "DRAFT", archive: "ARCHIVED" });
  });

  it("uses the same announcement steps as other content", () => {
    expect(annTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(annTargets("ARCHIVED")).toEqual(["DRAFT"]);
  });
});
