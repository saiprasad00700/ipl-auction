/**
 * SS AUCTION Cloudflare edge router
 *
 * Routes browser HTTP traffic across two Render origins.
 * Firebase realtime connections remain direct to Firebase; this Worker
 * only proxies requests addressed to ssauction.in / www.ssauction.in.
 */

const ORIGINS = {
  server1: "https://ipl-auction-ootx.onrender.com",
  server2: "https://ss-auction-server-2.onrender.com",
};

const COOKIE_NAME = "ssau_origin";
const COOKIE_MAX_AGE = 60 * 60 * 24;
const HEALTH_TIMEOUT_MS = 4000;

function readCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      if (value === "server1" || value === "server2") return value;
    }
  }
  return null;
}

function chooseOrigin() {
  return Math.random() < 0.5 ? "server1" : "server2";
}

function alternateOrigin(origin) {
  return origin === "server1" ? "server2" : "server1";
}

function makeTargetUrl(requestUrl, origin) {
  const incoming = new URL(requestUrl);
  const target = new URL(origin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  return target;
}

async function probeOrigin(originName) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(ORIGINS[originName] + "/health", {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal,
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function chooseHealthyOrigin() {
  const [server1Healthy, server2Healthy] = await Promise.all([
    probeOrigin("server1"),
    probeOrigin("server2"),
  ]);

  if (server1Healthy && server2Healthy) {
    return chooseOrigin();
  }
  if (server1Healthy) return "server1";
  if (server2Healthy) return "server2";

  // Do not block the website if both probes time out or fail transiently.
  // The request itself will still be attempted and safe GET/HEAD can fail over.
  return chooseOrigin();
}

async function sendToOrigin(request, originName) {
  const targetUrl = makeTargetUrl(request.url, ORIGINS[originName]);
  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", new URL(request.url).host);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-SSAuction-Origin", originName);

  const upstreamRequest = new Request(targetUrl.toString(), request);
  const forwardedRequest = new Request(upstreamRequest, { headers });
  return fetch(forwardedRequest, {
    redirect: "manual",
    cf: { cacheEverything: false },
  });
}

function withRoutingHeaders(response, originName, setCookie = false) {
  const headers = new Headers(response.headers);
  headers.set("X-SSAuction-Edge", originName);
  if (setCookie) {
    headers.append(
      "Set-Cookie",
      `${COOKIE_NAME}=${originName}; Path=/; Max-Age=${COOKIE_MAX_AGE}; Secure; HttpOnly; SameSite=Lax`
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function edgeError() {
  return new Response("SS AUCTION is temporarily unavailable. Please refresh in a moment.", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "10",
      "X-SSAuction-Edge": "unavailable",
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/__edge-health") {
      const [server1Healthy, server2Healthy] = await Promise.all([
        probeOrigin("server1"),
        probeOrigin("server2"),
      ]);
      return Response.json({
        ok: true,
        service: "ss-auction-edge-router",
        origins: {
          server1: server1Healthy ? "healthy" : "unhealthy",
          server2: server2Healthy ? "healthy" : "unhealthy",
        },
        timestamp: new Date().toISOString(),
      }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const cookieOrigin = readCookie(request, COOKIE_NAME);
    const isNewVisitor = !cookieOrigin;
    let selected = cookieOrigin;

    if (request.method === "OPTIONS") {
      selected = selected || await chooseHealthyOrigin();
      try {
        return withRoutingHeaders(await sendToOrigin(request, selected), selected, isNewVisitor);
      } catch {
        return edgeError();
      }
    }

    if (!selected) selected = await chooseHealthyOrigin();

    try {
      let response = await sendToOrigin(request, selected);
      const safeToRetry = request.method === "GET" || request.method === "HEAD";
      const retryableStatus = [502, 503, 504].includes(response.status);

      // Never replay state-changing requests such as bids, room creation,
      // or auction submissions. Only retry safe GET/HEAD requests.
      if (safeToRetry && retryableStatus) {
        const alternate = alternateOrigin(selected);
        try {
          const alternateResponse = await sendToOrigin(request, alternate);
          if (alternateResponse.status < 500) {
            selected = alternate;
            response = alternateResponse;
          }
        } catch {
          // Preserve the original upstream response if alternate also fails.
        }
      }

      return withRoutingHeaders(
        response,
        selected,
        isNewVisitor || selected !== cookieOrigin
      );
    } catch {
      if (request.method === "GET" || request.method === "HEAD") {
        const alternate = alternateOrigin(selected);
        try {
          return withRoutingHeaders(await sendToOrigin(request, alternate), alternate, true);
        } catch {
          return edgeError();
        }
      }
      return edgeError();
    }
  },
};
