import test from "node:test";
import assert from "node:assert/strict";
import { requireAuth, requireRoomId, reject } from "../callableGuards.js";

test("requireAuth returns the authenticated UID", () => {
  assert.equal(requireAuth({ auth: { uid: "user_123" } }), "user_123");
});

test("requireAuth rejects unauthenticated and empty identities", () => {
  assert.throws(() => requireAuth({}), (error) => error.code === "unauthenticated");
  assert.throws(() => requireAuth({ auth: { uid: " " } }), (error) => error.code === "unauthenticated");
});

test("requireRoomId accepts safe room codes and rejects Firebase key characters", () => {
  assert.equal(requireRoomId("AB12_cd-34"), "AB12_cd-34");
  for (const invalid of ["", "../room", "a.b", "a#b", "a$b", "a[b]", "a/b", "x".repeat(129), 123]) {
    assert.throws(() => requireRoomId(invalid), (error) => error.code === "invalid-argument");
  }
});

test("reject always throws a callable error", () => {
  assert.throws(() => reject("Room is closed"), (error) =>
    error.code === "failed-precondition" && error.message === "Room is closed"
  );
});
