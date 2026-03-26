/**
 * Serves the server favicon at GET /favicon.ico.
 *
 * Two purposes:
 *  1. Claude.ai connector tab icon — Claude fetches via Google's favicon service:
 *     https://www.google.com/s2/favicons?domain=<your-azure-functions-domain>&sz=64
 *  2. Standard path — MCP clients and browsers that check /favicon.ico directly.
 *
 * To update the icon: replace src/assets/favicon.png with your own PNG (64×64 or larger
 * recommended), then redeploy. The image is read once at module load and cached in memory.
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { readFileSync } from "fs";
import { join } from "path";

// Read once at module load — avoids disk I/O on every request.
const faviconPath = join(__dirname, "assets", "favicon.png");
let _favicon: Buffer | null = null;

function getFavicon(): Buffer | null {
  if (_favicon) return _favicon;
  try {
    _favicon = readFileSync(faviconPath);
    return _favicon;
  } catch {
    return null;
  }
}

app.http("favicon", {
  methods: ["GET"],
  route: "favicon.ico",
  authLevel: "anonymous",
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    const icon = getFavicon();
    if (!icon) {
      return { status: 404, body: "favicon not found" };
    }
    return {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
      body: icon,
    };
  },
});
