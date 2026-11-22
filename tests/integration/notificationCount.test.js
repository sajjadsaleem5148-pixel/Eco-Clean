import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { unreadCountFor } from "@/services/notificationCount";
import Notification from "@/models/Notification";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

function note(userId, extra) {
  return Notification.create(
    Object.assign({ user: userId, type: "SYSTEM", title: "Test title", body: "Test body" }, extra || {})
  );
}

describe("unreadCountFor", () => {
  it("returns zero when the user has no notifications", async () => {
    const user = await makeUser();
    expect(await unreadCountFor(user._id)).toBe(0);
  });

  it("counts only unread notifications of that user", async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await note(mine._id);
    await note(mine._id);
    await note(mine._id, { readAt: new Date() });
    await note(theirs._id);
    await note(theirs._id);
    await note(theirs._id);
    expect(await unreadCountFor(mine._id)).toBe(2);
    expect(await unreadCountFor(theirs._id)).toBe(3);
  });

  it("goes down when a notification is read", async () => {
    const user = await makeUser();
    const n = await note(user._id);
    await note(user._id);
    expect(await unreadCountFor(user._id)).toBe(2);
    await Notification.updateOne({ _id: n._id }, { $set: { readAt: new Date() } });
    expect(await unreadCountFor(user._id)).toBe(1);
  });
});
