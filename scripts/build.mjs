import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEditionArtifacts } from "./edition-content.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "dist");
const clientRoot = path.join(outputRoot, "client");
const serverRoot = path.join(outputRoot, "server");

const sourceFiles = [
  ["index.html", "text/html; charset=utf-8", "/index.html"],
  ["styles.css", "text/css; charset=utf-8", "/styles.css"],
  ["app.js", "text/javascript; charset=utf-8", "/app.js"],
  ["manifest.webmanifest", "application/manifest+json; charset=utf-8", "/manifest.webmanifest"],
  ["service-worker.js", "text/javascript; charset=utf-8", "/service-worker.js"],
  ["archive/index.html", "text/html; charset=utf-8", "/archive/index.html"],
  ["archive.js", "text/javascript; charset=utf-8", "/archive.js"],
  ["editor/index.html", "text/html; charset=utf-8", "/editor/index.html"],
  ["editor.js", "text/javascript; charset=utf-8", "/editor.js"],
  ["public/og.png", "image/png", "/og.png"],
  ["public/icons/icon-192.png", "image/png", "/icons/icon-192.png"],
  ["public/icons/icon-512.png", "image/png", "/icons/icon-512.png"],
  ["public/icons/icon-maskable-512.png", "image/png", "/icons/icon-maskable-512.png"],
  ["public/icons/apple-touch-icon.png", "image/png", "/icons/apple-touch-icon.png"],
];

const editionArtifacts = await loadEditionArtifacts(projectRoot);
const versionHash = createHash("sha256");
for (const [relativePath] of sourceFiles) {
  if (relativePath === "service-worker.js") continue;
  versionHash.update(relativePath);
  versionHash.update(await readFile(path.join(projectRoot, relativePath)));
}
for (const [publicPath, source] of [...editionArtifacts].sort(([left], [right]) => left.localeCompare(right))) {
  versionHash.update(publicPath);
  versionHash.update(source);
}
const buildVersion = versionHash.digest("hex").slice(0, 12);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(clientRoot, { recursive: true });
await mkdir(serverRoot, { recursive: true });
await writeFile(path.join(clientRoot, ".nojekyll"), "");

const routeTable = {};

for (const [relativePath, contentType, publicPath] of sourceFiles) {
  const source = path.join(projectRoot, relativePath);
  const destination = path.join(clientRoot, publicPath.slice(1));
  await mkdir(path.dirname(destination), { recursive: true });
  let data = await readFile(source);
  if (relativePath === "service-worker.js") {
    data = Buffer.from(
      data.toString("utf8").replaceAll("__FIRST_FOLD_BUILD_VERSION__", buildVersion),
    );
  }
  await writeFile(destination, data);
  routeTable[publicPath] = {
    contentType,
    base64: data.toString("base64"),
  };
}

for (const [publicPath, source] of editionArtifacts) {
  const destination = path.join(clientRoot, publicPath.slice(1));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, source);
  routeTable[publicPath] = {
    contentType: "application/json; charset=utf-8",
    base64: Buffer.from(source).toString("base64"),
  };
}

const workerSource = `
const files = ${JSON.stringify(routeTable)};
const securityHeaders = {
  "content-security-policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; manifest-src 'self'; style-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function decode(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function resolveRoute(pathname) {
  if (pathname === "/") return "/index.html";
  if (pathname === "/archive" || pathname === "/archive/") return "/archive/index.html";
  if (pathname === "/editor" || pathname === "/editor/") return "/editor/index.html";
  return pathname;
}

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { ...securityHeaders, allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    const publicPath = resolveRoute(url.pathname);
    const file = files[publicPath];
    if (!file) return new Response("Not found", { status: 404, headers: securityHeaders });

    let body = decode(file.base64);
    if (file.contentType.startsWith("text/html")) {
      const html = new TextDecoder().decode(body).replace(
        /content="\\/?og\\.png"/,
        'content="' + new URL("/og.png", request.url).href + '"',
      );
      body = new TextEncoder().encode(html);
    }

    const headers = new Headers(securityHeaders);
    headers.set("content-type", file.contentType);
    const isMutableIndex =
      publicPath.endsWith(".html") ||
      publicPath === "/editions/index.json" ||
      publicPath === "/manifest.webmanifest" ||
      publicPath === "/service-worker.js";
    headers.set("cache-control", isMutableIndex ? "no-cache" : "public, max-age=86400");
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  },
};
`;

await writeFile(path.join(serverRoot, "index.js"), workerSource);
console.log(`Built ${sourceFiles.length + editionArtifacts.size} assets and the First Fold worker.`);
