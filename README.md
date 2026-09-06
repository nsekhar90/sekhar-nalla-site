# Sekhar Nalla — Personal Site

A fast, flat-design personal site and engineering blog built with [Astro](https://astro.build/),
ready to deploy to [Cloudflare Pages](https://pages.cloudflare.com/) from GitHub.

## What's included

- **Home** (`/`) — positioning statement + selected-impact cards + core stack
- **Resume** (`/resume`) — web-readable résumé with a downloadable PDF
- **About** (`/about`) — professional bio and contact links
- **Writing** (`/blog`) — blog index with Markdown content collections
- **Blog post** (`/blog/[slug]`) — individual article template with reading time
- Light/dark mode toggle, custom SVG logo + favicon, OG image

## Tech

- Astro 5 (static output, CSS inlined for fast first paint)
- Flat design system: no shadows/gradients, color-led hierarchy, `ease` transitions
- Fonts: Cabinet Grotesk + Satoshi (Fontshare), JetBrains Mono (Google)
- Content collections via the Astro `glob` loader — posts are Markdown files in `src/content/blog/`

## Run locally

This project targets **Node 22+** (pinned in `.nvmrc`). If you use nvm:

```bash
nvm use          # reads .nvmrc → Node 22
npm install
npm run dev      # http://localhost:4321
```

Build and preview the production bundle:

```bash
npm run build
npm run preview
```

## Editing content

### Résumé PDF

The downloadable PDF lives at `public/resume/Sekhar_Nalla_Resume.pdf` — replace that
file to update it. The web résumé content (in `src/pages/resume.astro`) and the PDF
are kept in sync manually.

To regenerate the PDF from the print template (requires Playwright):

```bash
npx playwright install chromium   # one-time
node -e "const{chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:712,height:1000}});await p.goto('file://'+process.cwd()+'/print-resume.html',{waitUntil:'networkidle'});await p.emulateMedia({media:'print'});await p.pdf({path:'public/resume/Sekhar_Nalla_Resume.pdf',format:'Letter',printBackground:true,margin:{top:'0.34in',bottom:'0.34in',left:'0.5in',right:'0.5in'},preferCSSPageSize:true});await b.close();})()"
```

The `print-resume.html` source template is the single source of truth for the PDF.

### Blog posts

Create a new Markdown file in `src/content/blog/`, e.g. `my-post.md`:

```md
---
title: "My Post Title"
description: "One-line summary used in the blog index and meta description."
publishedAt: 2026-10-01
tags: ["Android", "CI/CD"]
draft: false
---

Your post content in Markdown.
```

- Set `draft: true` to keep a post out of the published list while you're writing.
- Set `draft: false` to publish. The post appears at `/blog/my-post`.
- The slug is derived from the filename (`my-post.md` → `/blog/my-post`).

## Deploy to Cloudflare Pages

1. Create a public GitHub repository, e.g. `sekhar-nalla-site`, and push this project:

   ```bash
   git init
   git add .
   git commit -m "Initial personal site"
   git branch -M main
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/sekhar-nalla-site.git
   git push -u origin main
   ```

2. In Cloudflare: **Workers & Pages → Create application → Pages → Import an existing Git repository.**

3. Select your GitHub account and the `sekhar-nalla-site` repository.

4. Use these build settings:

   | Field | Value |
   | --- | --- |
   | Framework preset | Astro |
   | Production branch | `main` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

5. Click **Save and Deploy**. Cloudflare gives you a `*.pages.dev` URL. Every push to
   `main` redeploys automatically; branches and PRs get preview URLs.

## Custom domain

After the `*.pages.dev` deploy works, in Cloudflare go to **Workers & Pages → your
project → Custom domains → Set up a custom domain** and follow the DNS instructions
(apex domains require the domain to use Cloudflare nameservers; subdomains use a CNAME
to the Pages hostname).

## Publishing workflow

```
Write post locally → npm run dev → git branch → push / open PR
   → review Cloudflare preview URL → merge to main → Cloudflare publishes
```
