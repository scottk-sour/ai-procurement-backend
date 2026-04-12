# Client Dashboard Blog Feature — Audit

**Context:** This repo is the **backend API only** — there is no frontend React/Next.js code here. The dashboard UI lives in a separate frontend repo. What follows is the complete backend surface area that the dashboard calls into.

The feature is called **"VendorPost"** internally (not "blog"), but functionally it is a blog system.

---

## 1. Blog creation page component

**Not in this repo.** The dashboard UI that renders the create/edit form is in a separate frontend codebase. To audit the UI itself, open that repo and search for components referencing `/api/vendors/:vendorId/posts` or `/api/vendors/:vendorId/posts/generate`.

---

## 2. API routes handling blog creation

**File:** `routes/vendorPostRoutes.js` (354 lines)

**Mounted in `index.js:295-296`** under **two** prefixes:

```js
app.use('/api/vendors', vendorPostRoutes);  // vendor-scoped endpoints
app.use('/api/posts', vendorPostRoutes);    // public feed + single-post endpoints
```

### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/vendors/:vendorId/posts` | `vendorAuth` | Create a post (tier-gated) |
| `PUT` | `/api/vendors/:vendorId/posts/:postId` | `vendorAuth` | Edit own post |
| `DELETE` | `/api/vendors/:vendorId/posts/:postId` | `vendorAuth` | Delete own post |
| `PUT` | `/api/vendors/:vendorId/posts/:postId/hide` | `vendorAuth` | Hide post |
| **`POST`** | **`/api/vendors/:vendorId/posts/generate`** | **`vendorAuth`** | **AI blog generation (Claude)** |
| `GET` | `/api/posts/feed` | **public** | Paginated feed of all published posts |
| `GET` | `/api/posts/:slug` | **public** | Single post by slug, **with Schema.org JSON-LD** |
| `GET` | `/api/public/vendors/:vendorId/posts` | **public** | List one vendor's published posts (in `publicVendorRoutes.js:1027`) |

### Tier gating (`vendorPostRoutes.js:9-19`)

```js
const POST_LIMITS = {
  free: 0,     listed: 0,
  starter: 2,  visible: 2,  basic: 2,
  pro: Infinity, verified: Infinity,
  managed: Infinity, enterprise: Infinity,
};
```

Free and Listed tiers cannot post at all. AI generation requires starter tier or above (`vendorPostRoutes.js:144-147`).

---

## 3. AI writing assistant — full details

**Route:** `POST /api/vendors/:vendorId/posts/generate` (`vendorPostRoutes.js:128-241`)

**Model:** `claude-sonnet-4-20250514` (hardcoded, line 209)

**Vendor inputs:** `topic` (required), `stats` (optional) — both from the request body.

### System prompt (verbatim, lines 168-187)

```
You are an expert content writer for UK professional services firms.
You write in the Yadav format — a specific blog structure that performs well in AI search results.

Yadav format rules:
- Start with a bold statement or statistic that hooks the reader
- Use short paragraphs of 2-3 sentences maximum
- Include a clear H2 subheading every 150-200 words
- Answer the most likely reader question in the first 100 words
- Include specific numbers, percentages, or named examples where possible
- End with a clear call to action
- Write in plain English — no jargon, no passive voice
- Target length: 600-800 words for the blog post
- UK English spelling throughout

You also write LinkedIn and Facebook versions:
- LinkedIn version: 150-200 words, professional tone, ends with a question to drive comments
- Facebook version: 100-150 words, warmer tone, ends with a call to action

Always write in first person plural ("we", "our firm") as if you are the firm.
Never mention TendorAI in the content.
```

### User prompt template (lines 189-203)

```
Write a blog post for a ${verticalLabel} firm about: ${topic.trim()}

${stats ? `Include these stats or facts: ${stats.trim()}` : ''}

Also write:
1. A LinkedIn post version (150-200 words)
2. A Facebook post version (100-150 words)

Return as JSON only with this exact structure:
{
  "title": "Blog post title",
  "body": "Full blog post in markdown",
  "linkedInText": "LinkedIn version",
  "facebookText": "Facebook version"
}
```

`${verticalLabel}` is resolved from `vendor.vendorType` via this map (lines 159-166):

```js
{
  solicitor: 'solicitor',
  accountant: 'accountant',
  'mortgage-advisor': 'mortgage adviser',
  'estate-agent': 'estate agent',
  'office-equipment': 'office equipment supplier',
}
```

### Request configuration (lines 208-213)

```js
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 2000,
  system: systemPrompt,
  messages: [{ role: 'user', content: userPrompt }],
});
```

### Response handling (lines 215-233)

Response text is regex-scanned for the first `{...}` JSON block, parsed, and returned to the dashboard as `{ title, body, linkedInText, facebookText }`. **The generated content is NOT persisted at this step** — the dashboard receives it, presumably lets the user edit, then posts it back to `POST /api/vendors/:vendorId/posts` to save.

### Observations / issues

1. **Hardcoded Claude model** — uses `claude-sonnet-4-20250514`, which is older than `claude-sonnet-4-6`. Worth updating.
2. **Prompt injection risk** — `topic` and `stats` are pasted raw into the user prompt without sanitisation. A vendor could inject `}` to break the JSON structure or smuggle system-prompt-like instructions. Low severity since the vendor is authenticated and only damages their own output, but worth noting.
3. **"Yadav format"** — this is a named style with no citation in the prompt. If that's a specific methodology, fine; if it's a made-up term the model doesn't recognise, it'll be ignored.
4. **JSON parsing is fragile** — `text.match(/\{[\s\S]*\}/)` grabs from the first `{` to the last `}`. If Claude includes markdown code fences (which Sonnet often does), the parse can fail. No retry logic.
5. **No character/token accounting** — the body stored has a hard 10,000-char limit on the schema but the prompt asks for 600-800 words, so typically safe.
6. **No moderation/safety layer** — AI-generated content is not scanned before being saved as public content indexed by Google.

---

## 4. Storage — Mongoose schema

**File:** `models/VendorPost.js` (48 lines)

```js
{
  vendor:       ObjectId ref 'Vendor'  (required, indexed)
  title:        String (required, max 200)
  body:         String (required, max 10000)
  category:     enum ['news','product','offer','guide','update']  default 'news'
  tags:         [String]  (trimmed, lowercased)
  status:       enum ['draft','published','hidden']  default 'draft'
  slug:         String  (unique, indexed)
  isDemoVendor: Boolean
  aiGenerated:  Boolean   // flagged if created via /generate
  topic:        String    // the original AI prompt topic
  stats:        String    // the original AI prompt stats
  linkedInText: String    // AI-generated LinkedIn version
  facebookText: String    // AI-generated Facebook version
  createdAt, updatedAt
}
```

**Slug generation (pre-validate hook, lines 28-40):**

```js
base = title.toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .substring(0, 80)
slug = `${base}-${vendorId.slice(-6)}`
```

Uses last 6 chars of vendor ID as a uniqueness suffix. **Note:** this is deterministic per (vendor, title) pair — if the same vendor creates two posts with the same title, the second will hit the `unique` index and throw `11000`.

**Indexes:** `{status, createdAt: -1}`, `{vendor, status}`, `{tags}`, plus unique on `slug` and ref index on `vendor`.

---

## 5. Public accessibility & Google/AI indexing

### Yes — these posts are fully public and actively SEO-pushed.

**Public HTTP endpoints serving published posts:**

1. **`GET /api/posts/:slug`** (`vendorPostRoutes.js:314-351`) — returns the post **with full Schema.org `BlogPosting` JSON-LD** attached:

   ```js
   const jsonLd = {
     '@context': 'https://schema.org',
     '@type': 'BlogPosting',
     headline: post.title,
     articleBody: post.body,
     datePublished: post.createdAt,
     dateModified: post.updatedAt,
     author: { '@type': 'Organization', name: vendor.company, url: vendor.website },
     publisher: { '@type': 'Organization', name: 'TendorAI', url: 'https://www.tendorai.com' },
     mainEntityOfPage: `https://www.tendorai.com/posts/${post.slug}`,
     keywords: post.tags?.join(', ') || '',
   };
   ```

2. **`GET /api/posts/feed`** (`vendorPostRoutes.js:285-311`) — paginated public feed of every published post across all vendors, **explicitly commented as "public, for GEO crawling"**.

3. **`GET /api/public/vendors/:vendorId/posts`** (`publicVendorRoutes.js:1027-1051`) — list a vendor's published posts.

**Sitemap inclusion (`routes/sitemap.js:379-395`):** every published post's slug is added to the main sitemap at `/posts/${slug}`, priority `0.6`, `monthly` changefreq, capped at the most recent 500. This sitemap is served at `/sitemap.xml` and referenced from `llms.txt`, so it is discoverable by Google, Bing, and AI crawlers.

**Dashboard-only content:** posts with `status: 'draft'` or `status: 'hidden'` are excluded from all public endpoints and the sitemap. Those stay invisible to the outside world.

### What this means practically

- A vendor writes a post → clicks **Publish** → it immediately:
  1. Becomes fetchable at the public API
  2. Gets indexed in the next sitemap regeneration
  3. Carries Schema.org `BlogPosting` markup, which is exactly the structured-data signal TendorAI positions itself around
  4. Is attributed to the vendor's company via the JSON-LD `author` field (not to TendorAI)
- The dashboard is the creation interface only. The consumption interface is the public-facing website + any AI assistant that crawls it.

This is entirely consistent with TendorAI's positioning (structured data for AI visibility) but does mean AI-generated content goes straight to Google without a human moderation gate. Worth confirming whether that's intentional, because it's the highest-risk item in this surface area.

---

## Summary of files referenced

| Path | Role |
|------|------|
| `models/VendorPost.js` | Mongoose schema |
| `routes/vendorPostRoutes.js` | All CRUD + AI generate + public feed + single post |
| `routes/publicVendorRoutes.js:1023-1051` | Per-vendor public post listing |
| `routes/sitemap.js:379-395` | Sitemap inclusion |
| `index.js:33, 295-296` | Route mounting under `/api/vendors` and `/api/posts` |
| `scripts/seedDemoPosts.js` | Demo data seeding (not part of live flow) |

No frontend component files in this repo. To complete the audit you'll need the dashboard repo.
