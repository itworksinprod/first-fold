import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEditionArtifacts } from "./edition-content.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const editionArtifacts = await loadEditionArtifacts(projectRoot);
const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/archive", "archive/index.html"],
  ["/archive/", "archive/index.html"],
  ["/archive/index.html", "archive/index.html"],
  ["/archive.js", "archive.js"],
  ["/editor", "editor/index.html"],
  ["/editor/", "editor/index.html"],
  ["/editor/index.html", "editor/index.html"],
  ["/editor.js", "editor.js"],
  ["/og.png", "public/og.png"],
]);
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
]);
const securityHeaders = {
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { ...securityHeaders, allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }

    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (editionArtifacts.has(pathname)) {
      const body = editionArtifacts.get(pathname);
      response.writeHead(200, {
        ...securityHeaders,
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body),
        "cache-control": pathname === "/editions/index.json" ? "no-cache" : "public, max-age=3600",
      });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }

    const relativePath = publicFiles.get(pathname);
    if (!relativePath) {
      response.writeHead(404, securityHeaders).end("Not found");
      return;
    }

    const absolutePath = path.join(projectRoot, relativePath);
    const extension = path.extname(absolutePath);
    const file = await stat(absolutePath);
    response.writeHead(200, {
      ...securityHeaders,
      "content-type": contentTypes.get(extension),
      "content-length": file.size,
      "cache-control": extension === ".html" ? "no-cache" : "public, max-age=3600",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(absolutePath).pipe(response);
  } catch {
    response.writeHead(404, securityHeaders).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`First Fold: http://127.0.0.1:${port}/`);
});
