/**
 * GET /llms.txt
 *
 * The whole API reference as one plain-markdown document, for developers
 * building with an AI assistant: paste the URL into a chat, or let an agent
 * fetch it, and it has everything needed to write a correct integration.
 *
 * Served at the site ROOT rather than under /api/v1 because /llms.txt is the
 * conventional location agents and tools look for.
 *
 * Deliberately NOT wrapped in the {data, meta} envelope and not served as
 * JSON - the whole point is that the response is the document itself. It is
 * still CORS-open and CDN-cached like everything else.
 */

import { renderLlmsTxt } from "@/lib/api/llms-txt";
import { CACHE } from "@/lib/api/respond";

export async function GET(req: Request) {
  // Absolute URLs so a pasted document works from anywhere, and so the same
  // code serves correct links on preview deployments and production alike.
  const origin = new URL(req.url).origin;
  return new Response(renderLlmsTxt(origin), {
    status: 200,
    headers: {
      // text/plain, not text/markdown: it must render inline in a browser tab
      // rather than triggering a download, since "open this URL" is the point.
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": `public, max-age=0, s-maxage=${CACHE.config}, stale-while-revalidate=${CACHE.config * 8}`,
    },
  });
}
