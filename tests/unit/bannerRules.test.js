import { describe, it, expect } from "vitest";
import {
  BANNER_STATUSES,
  BANNER_STATUS_LABELS,
  BANNER_STATUS_FROM,
  MAX_PUBLIC_BANNERS,
  bannerTargets,
  safeBannerLink,
  isInternalLink,
} from "@/lib/bannerRules";

describe("banner status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    BANNER_STATUSES.forEach((s) => expect(BANNER_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(BANNER_STATUS_FROM).forEach(([to, froms]) => {
      expect(BANNER_STATUSES).toContain(to);
      froms.forEach((f) => expect(BANNER_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(bannerTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(bannerTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(bannerTargets("ARCHIVED")).toEqual(["DRAFT"]);
    expect(bannerTargets("MADE_UP")).toEqual([]);
    expect(MAX_PUBLIC_BANNERS).toBe(3);
  });
});

describe("safeBannerLink", () => {
  it("keeps paths inside the site", () => {
    expect(safeBannerLink("/rewards")).toBe("/rewards");
    expect(safeBannerLink("/admin/orders?status=PENDING")).toBe("/admin/orders?status=PENDING");
    expect(safeBannerLink("  /services  ")).toBe("/services");
    expect(safeBannerLink("/")).toBe("/");
  });

  it("keeps a normal https address", () => {
    expect(safeBannerLink("https://example.org/page")).toBe("https://example.org/page");
  });

  it("drops script links, http links, protocol-relative links and links with a password", () => {
    [
      "javascript:alert(1)",
      "data:text/html,hi",
      "http://example.org",
      "//evil.example",
      "https://user:pw@example.org",
      "https://localhost",
      "example.org",
      "ftp://example.org/file",
    ].forEach((v) => expect(safeBannerLink(v)).toBeUndefined());
  });

  it("drops odd characters, empty, non-text and very long values", () => {
    ["/ok<script>", "/a b", "", "   ", null, undefined, 42, "/" + "a".repeat(300)].forEach((v) => {
      expect(safeBannerLink(v)).toBeUndefined();
    });
  });

  it("tells internal links from external ones", () => {
    expect(isInternalLink("/rewards")).toBe(true);
    expect(isInternalLink("https://example.org")).toBe(false);
    expect(isInternalLink("//evil.example")).toBe(false);
    expect(isInternalLink(undefined)).toBe(false);
  });
});
