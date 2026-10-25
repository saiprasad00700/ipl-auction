import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backendSource = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../../src/contexts/AuctionContext.jsx", import.meta.url), "utf8");

test("every callable referenced by the auction client is exported by Cloud Functions", () => {
  const backendCallables = new Set(
    [...backendSource.matchAll(/export const (\w+) = onCall/g)].map((match) => match[1])
  );
  const clientCallables = new Set(
    [...clientSource.matchAll(/httpsCallable\(getFunctions\(app\),\s*['"]([^'"]+)['"]\)/g)]
      .map((match) => match[1])
  );

  assert.ok(clientCallables.size > 0, "expected to find client callable references");
  const missing = [...clientCallables].filter((name) => !backendCallables.has(name));
  assert.deepEqual(missing, [], `Client references missing backend callables: ${missing.join(", ")}`);
});

test("every callable export uses a unique name", () => {
  const names = [...backendSource.matchAll(/export const (\w+) = onCall/g)].map((match) => match[1]);
  assert.equal(new Set(names).size, names.length, "duplicate callable export name detected");
});

test("protected room, team and chat state is not written directly by the client", () => {
  assert.doesNotMatch(clientSource, /\bupdateRtdb\b/);
  assert.doesNotMatch(clientSource, /update\(ref\(rtdb,\s*`auctions\/\$\{[^}]+\}\/room`/);
  assert.doesNotMatch(clientSource, /update\(ref\(rtdb,\s*`auctions\/\$\{[^}]+\}\/teams`/);
  assert.match(clientSource, /httpsCallable\(getFunctions\(app\),\s*['"]endAuction['"]\)/);
  assert.match(clientSource, /httpsCallable\(getFunctions\(app\),\s*['"]sendAuctionChatMessage['"]\)/);
});

test("bid validation, live-state mutation and room activity use one root transaction", () => {
  const start = backendSource.indexOf("export const placeBid = onCall(");
  const end = backendSource.indexOf("export const decideRetention = onCall(", start);
  assert.ok(start >= 0 && end > start, "placeBid callable should exist");
  const source = backendSource.slice(start, end);
  assert.ok(source.includes("rootRef.transaction("));
  assert.ok(source.includes("current.teams?.["));
  assert.ok(source.includes("room: { ...room, lastActivityAt: now }"));
  assert.ok(!source.includes("liveRef.transaction("));
  assert.ok(!source.includes('room/lastActivityAt').includes('set('));
});
