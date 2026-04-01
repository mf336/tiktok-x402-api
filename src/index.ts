import { Hono } from "hono"
import { paymentMiddleware, x402ResourceServer, Network } from "@x402/hono"
import { HTTPFacilitatorClient } from "@x402/core/server"
import { ExactEvmScheme } from "@x402/evm/exact/server"
import { scrapeUser, scrapeHashtag, scrapeVideo, scrapeSearch } from "./apify.js"

const RECIPIENT = process.env.RECIPIENT_ADDRESS
if (!RECIPIENT) {
  console.error("❌  RECIPIENT_ADDRESS env var is not set")
  process.exit(1)
}

const APIFY_TOKEN = process.env.APIFY_TOKEN
if (!APIFY_TOKEN) {
  console.error("❌  APIFY_TOKEN env var is not set")
  process.exit(1)
}

// ── x402 setup (USDC on Base Sepolia testnet) ────────────────────────────────
const facilitator = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" })
const server = new x402ResourceServer(facilitator)
  .register("eip155:84532", new ExactEvmScheme())

const ROUTES = {
  "GET /api/tiktok/user": {
    accepts: [{ scheme: "exact" as const, price: "$0.05", network: "eip155:84532" as Network, payTo: RECIPIENT as `0x${string}` }],
    description: "TikTok user profile scrape",
    mimeType: "application/json",
  },
  "GET /api/tiktok/hashtag": {
    accepts: [{ scheme: "exact" as const, price: "$0.10", network: "eip155:84532" as Network, payTo: RECIPIENT as `0x${string}` }],
    description: "TikTok hashtag scrape",
    mimeType: "application/json",
  },
  "GET /api/tiktok/video": {
    accepts: [{ scheme: "exact" as const, price: "$0.02", network: "eip155:84532" as Network, payTo: RECIPIENT as `0x${string}` }],
    description: "TikTok video metadata",
    mimeType: "application/json",
  },
  "GET /api/tiktok/search": {
    accepts: [{ scheme: "exact" as const, price: "$0.05", network: "eip155:84532" as Network, payTo: RECIPIENT as `0x${string}` }],
    description: "TikTok keyword search",
    mimeType: "application/json",
  },
}

// ── Hono app ─────────────────────────────────────────────────────────────────
const app = new Hono()

// x402 payment middleware — gates all /api/tiktok/* routes
app.use(paymentMiddleware(ROUTES, server))

// ── Discovery endpoint ───────────────────────────────────────────────────────
app.get("/openapi.json", (c) =>
  c.json({
    openapi: "3.1.0",
    info: {
      title: "TikTok x402 API",
      version: "1.0.0",
      description: "Pay-per-request TikTok scraping API. Pay in USDC on Base via x402.",
      "x-guidance": "This API uses x402 payments (USDC on Base Sepolia). Call any endpoint, handle the 402 Payment Required with an x402-compatible client, and retry with the X-PAYMENT header. The /health endpoint is free.",
    },
    "x-discovery": { ownershipProofs: [] },
    servers: [{ url: "https://tiktok-x402-api-production.up.railway.app", description: "Production" }],
    paths: {
      "/api/tiktok/user": {
        get: {
          operationId: "scrapeTikTokUser",
          summary: "Scrape TikTok user profile and videos",
          description: "Returns a user's recent videos and profile info.",
          parameters: [
            { name: "handle", in: "query", required: true,  schema: { type: "string" }, description: "TikTok username e.g. @charlidamelio" },
            { name: "limit",  in: "query", required: false, schema: { type: "integer", default: 10, maximum: 50 } },
          ],
          "x-payment-info": {
            protocols: [{ x402: {} }],
            price: { mode: "fixed", amount: "0.050000", currency: "USD" },
          },
          responses: {
            "200": { description: "User profile and videos" },
            "402": { description: "Payment required — $0.05 USDC on Base" },
          },
        },
      },
      "/api/tiktok/hashtag": {
        get: {
          operationId: "scrapeTikTokHashtag",
          summary: "Scrape TikTok hashtag posts",
          description: "Returns recent posts under a hashtag.",
          parameters: [
            { name: "tag",   in: "query", required: true,  schema: { type: "string" }, description: "Hashtag e.g. fyp or #fyp" },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 10, maximum: 50 } },
          ],
          "x-payment-info": {
            protocols: [{ x402: {} }],
            price: { mode: "fixed", amount: "0.100000", currency: "USD" },
          },
          responses: {
            "200": { description: "Hashtag posts" },
            "402": { description: "Payment required — $0.10 USDC on Base" },
          },
        },
      },
      "/api/tiktok/video": {
        get: {
          operationId: "scrapeTikTokVideo",
          summary: "Scrape single TikTok video metadata",
          description: "Returns full metadata for a TikTok video by URL.",
          parameters: [
            { name: "url", in: "query", required: true, schema: { type: "string", format: "uri" }, description: "Full TikTok video URL" },
          ],
          "x-payment-info": {
            protocols: [{ x402: {} }],
            price: { mode: "fixed", amount: "0.020000", currency: "USD" },
          },
          responses: {
            "200": { description: "Video metadata" },
            "402": { description: "Payment required — $0.02 USDC on Base" },
          },
        },
      },
      "/api/tiktok/search": {
        get: {
          operationId: "searchTikTok",
          summary: "Search TikTok by keyword",
          description: "Returns TikTok videos matching a keyword search query.",
          parameters: [
            { name: "q",     in: "query", required: true,  schema: { type: "string" }, description: "Search query e.g. funny cats" },
            { name: "limit", in: "query", required: false, schema: { type: "integer", default: 10, maximum: 50 } },
          ],
          "x-payment-info": {
            protocols: [{ x402: {} }],
            price: { mode: "fixed", amount: "0.050000", currency: "USD" },
          },
          responses: {
            "200": { description: "Search results" },
            "402": { description: "Payment required — $0.05 USDC on Base" },
          },
        },
      },
    },
  })
)

app.get("/", (c) => c.redirect("/health"))

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "TikTok x402 API",
    version: "1.0.0",
    payments: "USDC on Base Sepolia (x402)",
    endpoints: [
      { path: "/api/tiktok/user",    price: "$0.05 USDC", params: "?handle=@username&limit=10" },
      { path: "/api/tiktok/hashtag", price: "$0.10 USDC", params: "?tag=fyp&limit=10" },
      { path: "/api/tiktok/video",   price: "$0.02 USDC", params: "?url=https://tiktok.com/..." },
      { path: "/api/tiktok/search",  price: "$0.05 USDC", params: "?q=cats&limit=10" },
    ],
  })
)

// ── Paid endpoints ───────────────────────────────────────────────────────────

app.get("/api/tiktok/user", async (c) => {
  const handle = c.req.query("handle")
  if (!handle) return c.json({ error: "Missing required param: ?handle=@username" }, 400)
  const limit = Number(c.req.query("limit") ?? 10)
  const results = await scrapeUser(handle, limit)
  return c.json({ handle, count: results.length, results })
})

app.get("/api/tiktok/hashtag", async (c) => {
  const tag = c.req.query("tag")
  if (!tag) return c.json({ error: "Missing required param: ?tag=fyp" }, 400)
  const limit = Number(c.req.query("limit") ?? 10)
  const results = await scrapeHashtag(tag, limit)
  return c.json({ tag, count: results.length, results })
})

app.get("/api/tiktok/video", async (c) => {
  const url = c.req.query("url")
  if (!url) return c.json({ error: "Missing required param: ?url=https://tiktok.com/..." }, 400)
  const results = await scrapeVideo(url)
  return c.json({ url, results })
})

app.get("/api/tiktok/search", async (c) => {
  const q = c.req.query("q")
  if (!q) return c.json({ error: "Missing required param: ?q=your+keyword" }, 400)
  const limit = Number(c.req.query("limit") ?? 10)
  const results = await scrapeSearch(q, limit)
  return c.json({ query: q, count: results.length, results })
})

// ── Start server ─────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3000)

console.log(`
🎵  TikTok x402 API
    ├─ http://localhost:${port}/health
    ├─ GET /api/tiktok/user    — $0.05 USDC
    ├─ GET /api/tiktok/hashtag — $0.10 USDC
    ├─ GET /api/tiktok/video   — $0.02 USDC
    └─ GET /api/tiktok/search  — $0.05 USDC

    Payments: USDC on Base Sepolia (x402)
    Recipient: ${RECIPIENT}
`)

export default { port, hostname: "0.0.0.0", fetch: app.fetch }
