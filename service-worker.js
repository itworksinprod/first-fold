const CACHE_VERSION = "__FIRST_FOLD_BUILD_VERSION__";
const CACHE_PREFIX = "first-fold-";
const SHELL_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}-shell`;
const EDITION_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}-editions`;

const scopeUrl = new URL(self.registration.scope);
const shellUrls = [
  "./",
  "./index.html",
  "./styles.css?v=3",
  "./app.js?v=3",
  "./manifest.webmanifest",
  "./archive/",
  "./archive.js?v=3",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
].map((relativeUrl) => new URL(relativeUrl, scopeUrl).href);
const shellUrlSet = new Set(shellUrls);

function isSameOrigin(requestUrl) {
  return requestUrl.origin === scopeUrl.origin;
}

function pathWithinScope(requestUrl) {
  if (!isSameOrigin(requestUrl)) return false;
  const scopePath = scopeUrl.pathname.endsWith("/") ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
  return requestUrl.pathname.startsWith(scopePath)
    ? requestUrl.pathname.slice(scopePath.length)
    : false;
}

function isEditionRequest(requestUrl) {
  const relativePath = pathWithinScope(requestUrl);
  if (relativePath === false) return false;
  return /^editions\/(?:\d{4}-\d{2}-\d{2}|index)\.json$/.test(relativePath);
}

function isEditorRequest(requestUrl) {
  const relativePath = pathWithinScope(requestUrl);
  return relativePath !== false && /^(?:editor(?:\/|$)|editor\.js$)/.test(relativePath);
}

async function responseWithMetadata(response, metadata = {}) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(metadata)) headers.set(name, value);
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function cacheEditionResponse(cache, request, response) {
  const cachedAt = new Date().toISOString();
  const cacheCopy = await responseWithMetadata(response.clone(), {
    "x-first-fold-cached-at": cachedAt,
  });
  await cache.put(request, cacheCopy);
}

async function networkFirstEdition(request) {
  const cache = await caches.open(EDITION_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        await cacheEditionResponse(cache, request, response);
      } catch {
        // A full or unavailable cache must not hide a valid network edition.
      }
      return response;
    }
    if (response.status < 500) return response;
    throw new Error("Edition service unavailable");
  } catch {
    const cached =
      (await cache.match(request)) ??
      (await cache.match(request, { ignoreSearch: true }));
    if (cached) {
      return responseWithMetadata(cached, {
        "x-first-fold-source": "offline-cache",
      });
    }
    throw new Error("Edition unavailable offline");
  }
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.status < 500) return response;
    throw new Error("Reader shell service unavailable");
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const requestUrl = new URL(request.url);
    const scopePath = scopeUrl.pathname.endsWith("/") ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
    const relativePath = requestUrl.pathname.startsWith(scopePath)
      ? requestUrl.pathname.slice(scopePath.length)
      : "";
    let fallbackPath;
    if (relativePath === "" || relativePath === "index.html") {
      fallbackPath = "./index.html";
    } else if (
      relativePath === "archive" ||
      relativePath === "archive/" ||
      relativePath === "archive/index.html"
    ) {
      fallbackPath = "./archive/";
    } else {
      throw new Error("Navigation unavailable offline");
    }
    const cached = await cache.match(new URL(fallbackPath, scopeUrl).href);
    if (!cached) throw new Error("Reader shell unavailable offline");
    return responseWithMetadata(cached, {
      "x-first-fold-source": "offline-shell",
      "x-first-fold-cached-at": cached.headers.get("x-first-fold-cached-at") ?? "unknown",
    });
  }
}

async function cacheFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  return fetch(request);
}

async function fetchAndCacheShell(cache, url) {
  const response = await fetch(new Request(url, { cache: "reload" }));
  if (!response.ok) throw new Error(`Unable to cache ${url}`);
  const cachedResponse = await responseWithMetadata(response, {
    "x-first-fold-cached-at": new Date().toISOString(),
  });
  await cache.put(url, cachedResponse);
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(shellUrls.map((url) => fetchAndCacheShell(cache, url)));
}

async function precacheLatestEdition() {
  const cache = await caches.open(EDITION_CACHE);
  const manifestUrl = new URL("./editions/index.json", scopeUrl).href;
  const manifestRequest = new Request(manifestUrl, { cache: "reload" });
  const manifestResponse = await fetch(manifestRequest);
  if (!manifestResponse.ok) throw new Error("Archive manifest unavailable");

  const manifest = await manifestResponse.clone().json();
  if (!manifest || !/^\d{4}-\d{2}-\d{2}$/.test(manifest.latest)) {
    throw new Error("Archive manifest has no valid latest edition");
  }
  await cacheEditionResponse(cache, manifestUrl, manifestResponse);

  const editionUrl = new URL(`./editions/${manifest.latest}.json`, scopeUrl).href;
  const editionRequest = new Request(editionUrl, { cache: "reload" });
  const editionResponse = await fetch(editionRequest);
  if (!editionResponse.ok) throw new Error("Latest edition unavailable");
  await cacheEditionResponse(cache, editionUrl, editionResponse);
}

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([precacheShell(), precacheLatestEdition()]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== EDITION_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (isEditorRequest(requestUrl)) return;

  if (isEditionRequest(requestUrl)) {
    event.respondWith(networkFirstEdition(request));
    return;
  }

  if (request.mode === "navigate" && pathWithinScope(requestUrl) !== false) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isSameOrigin(requestUrl) && shellUrlSet.has(requestUrl.href)) {
    event.respondWith(cacheFirstShell(request));
  }
});
