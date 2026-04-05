# Nivane Niveema

Astro-based public site for a citation-first digital edition of **Nibbāna – The Mind Stilled**.

## Stack
- Astro
- Pagefind search
- Cloudflare Pages
- Cloudflare Worker for thin AI layer

## Current status
- Site scaffolded
- Sermon listing works
- Individual sermon pages work
- Placeholder ask page added
- Worker placeholder added

## Content
Add sermon markdown files to:

```text
content/sermons/
```

## Commands

```bash
npm install
npm run dev
npm run build
```

## Notes
- `scripts/build-passages.mjs` prepares a simple JSON file for retrieval.
- `worker/api.ts` is the starting point for the AI endpoint.
