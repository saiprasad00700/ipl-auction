import { HttpsError } from "firebase-functions/v2/https";

export function requireAuth(request) {
  const uid = request?.auth?.uid;
  if (typeof uid !== "string" || !uid.trim()) {
    throw new HttpsError("unauthenticated", "Sign in before using this auction action.");
  }
  return uid;
}

export function requireRoomId(roomId) {
  if (typeof roomId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(roomId)) {
    throw new HttpsError("invalid-argument", "Invalid auction room code.");
  }
  return roomId;
}

export function reject(message) {
  throw new HttpsError("failed-precondition", String(message || "The auction action could not be completed."));
}
