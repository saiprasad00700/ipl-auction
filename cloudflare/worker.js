/**
 * SS AUCTION Cloudflare edge router
 *
 * Deploy as a Cloudflare Worker and attach routes:
 *   ssauction.in/*
 *   www.ssauction.in/*
 *
 * Keep both Render services configured with equivalent application
 * environment variables. Firebase room data remains client-connected
 * directly to the selected Firebase project; this Worker only routes
 * HTTP requests to the Render application.
 */

const ORIGINS = {
  server1: "https://ipl-auction-ootx.onrender.com",
  server2: "https://ss-auction-server-2.onrender.com",
};

const COOKIE_NAME = "ssau_origin";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

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

function makeTargetUrl(requestUrl, origin) {
  const incoming = new URL(requestUrl);
  const target = new URL(origin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  return target;
}

async function sendToOrigin(request, originName) {
  const targetUrl = makeTargetUrl(request.url, ORIGINS[originName]);
  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", new URL(request.url).host);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-SSAuction-Origin", originName);

  // Construct a fresh request for the selected Render origin while
  // preserving method, body, headers, and streaming request semantics.
  const upstreamRequest = new Request(targetUrl.toString(), request);
  const forwardedRequest = new Request(upstreamRequest, { headers });
  return fetch(forwardedRequest, {
    redirect: "manual",
    cf: { cacheEverything: false },
  });
}

function withAffinityCookie(response, originName) {
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${originName}; Path=/; Max-Age=${COOKIE_MAX_AGE}; Secure; HttpOnly; SameSite=Lax`
  );
  headers.set("X-SSAuction-Edge", originName);
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
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/__edge-health") {
      return Response.json({
        ok: true,
        service: "ss-auction-edge-router",
        timestamp: new Date().toISOString(),
      }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (request.method === "OPTIONS") {
      const origin = readCookie(request, COOKIE_NAME) || chooseOrigin();
      try {
        return withAffinityCookie(await sendToOrigin(request, origin), origin);
      } catch {
        return edgeError();
      }
    }

    let selected = readCookie(request, COOKIE_NAME);
    const isNewVisitor = !selected;
    if (!selected) selected = chooseOrigin();

    try {
      let response = await sendToOrigin(request, selected);

      // Only retry safe requests. Never replay POST/PUT/PATCH/DELETE:
      // those may create rooms, submit bids, or mutate auction state.
      const safeToRetry = request.method === "GET" || request.method === "HEAD";
      const retryableStatus = [502, 503, 504].includes(response.status);

      if (safeToRetry && retryableStatus) {
        const alternate = selected === "server1" ? "server2" : "server1";
        try {
          const alternateResponse = await sendToOrigin(request, alternate);
          if (alternateResponse.status < 500) {
            selected = alternate;
            response = alternateResponse;
          }
        } catch {
          // Keep the original upstream response if the alternate is also down.
        }
      }

      return isNewVisitor || selected !== readCookie(request, COOKIE_NAME)
        ? withAffinityCookie(response, selected)
        : new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
    } catch {
      // A network-level failure is safe to retry only for GET/HEAD.
      if (request.method === "GET" || request.method === "HEAD") {
        const alternate = selected === "server1" ? "server2" : "server1";
        try {
          return withAffinityCookie(await sendToOrigin(request, alternate), alternate);
        } catch {
          return edgeError();
        }
      }
      return edgeError();
    }
  },
};
