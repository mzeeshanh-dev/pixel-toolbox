<div align="center">

# 🧰 Pixel Toolbox

### Your everyday media tools, in one workspace.

A personal, browser-first utility app for creating QR codes, converting videos to GIFs, and converting or compressing images — without switching between websites or running one-off scripts.

<br />

![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

</div>

---

## ✨ Tools at a glance

| Tool | What you can do | Processing model |
| --- | --- | --- |
| **QR Code Generator** | Customize colors and transparency, save QR codes in folders, manage versions, and export PNG/SVG, ZIP, or JSON backups | Browser + IndexedDB |
| **Video to GIF** | Trim clips, tune frame rate and width, preview output, and optimize against a target file size | Browser + FFmpeg WebAssembly in a Web Worker |
| **Image Converter & Compressor** | Convert supported image formats, adjust quality and dimensions, and reduce file size | Browser first; Next.js/Sharp for selected operations |

The goal is a focused tool for personal use: no accounts, no separate database, and no external media-processing API.

## 🧭 Contents

- [Features](#-features)
- [Privacy and processing](#-privacy-and-processing)
- [Getting started](#-getting-started)
- [Environment variables](#-environment-variables)
- [Available scripts](#-available-scripts)
- [Routes](#-routes)
- [Architecture](#-architecture)
- [Implementation notes](#-implementation-notes)
- [Image API](#-image-api)
- [Deploy to Vercel](#-deploy-to-vercel)
- [Known limitations](#-known-limitations)

## 🚀 Features

### QR Code Generator

- Generate QR codes from URLs or plain text, individually or in batches.
- Customize foreground and background colors, including genuine transparent PNG backgrounds.
- Adjust error correction and quiet-zone settings.
- Save QR codes locally and organize them with nested folders.
- Search, rename, duplicate, move, and delete saved QR codes.
- Maintain version history and restore previous configurations without rewriting history.
- Download PNG/SVG files, export selected items as ZIP, and back up or restore the library with versioned JSON.

### Video to GIF

- Select a clip and adjust its start/end time, frame rate, width, and quality.
- Encode GIFs using FFmpeg palette generation and palette-based encoding.
- Optimize against a target output size by measuring each result and trying bounded adjustments.
- Choose **Quality Priority** or **Strict Size Limit** behavior.
- View real processing progress and cancel a conversion.
- Keep processing in the browser; video files are not sent to the image API.

### Image Converter & Compressor

- Convert supported images between formats such as JPEG, PNG, WebP, AVIF, TIFF, and GIF, according to the active processing path.
- Adjust quality, dimensions, and format-specific options where supported.
- Compress with **Quality Priority**, **Strict Size Target**, or **Lossless Where Possible** modes.
- View actual input/output sizes, dimensions, and size reduction.
- Preserve animation for supported GIF/WebP output paths. For other output formats, explicitly choose first-frame-only behavior when required.
- Receive a clear message when a format, file size, or target cannot be supported.

### Shared experience

- Responsive interface for desktop, tablet, and mobile.
- File picker, drag-and-drop, and clipboard paste for media intake.
- Centralized limits and consistent validation/error messages.
- Recent-job metadata without automatically storing large media files.

## 🔒 Privacy and processing

Pixel Toolbox is designed to avoid unnecessary uploads, but not every operation runs in the same place.

| Operation | Where it runs | What is stored |
| --- | --- | --- |
| QR generation and library | Your browser | QR settings, folders, and version history in IndexedDB |
| Video-to-GIF conversion | Your browser | Media is processed locally; output files are not persisted by default |
| Supported image conversions | Your browser | Output is downloaded; media is not added to the QR library |
| Selected image operations using Sharp | This app's Next.js API route | The image is sent to the app's serverless function for processing and is not intentionally cached |
| Recent-job history | Your browser | Lightweight metadata only, up to 50 entries |

There is no account system or cloud sync. Browser data can be cleared by the user or browser, so export a QR-library backup if you want a separate copy. Image operations that use Sharp are processed by the application's server route; do not use them for content you are unwilling to send to that server.

## 🛠️ Getting started

### Requirements

- **Node.js 20.9 or newer**
- npm
- A modern browser for local media processing

### Install and run

```bash
# Install dependencies and copy the FFmpeg runtime into public/vendor/ffmpeg
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The `postinstall` script copies the versioned FFmpeg runtime into `public/vendor/ffmpeg/`. The production build also copies these assets before building.

No environment variables are required for the core application.

## ⚙️ Environment variables

All variables are optional.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Absolute site URL used for canonical/Open Graph URLs and sitemap generation. Set this when using a custom domain. |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Google Search Console verification token using the HTML-tag method. |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Bing Webmaster Tools verification token. |
| `NEXT_PUBLIC_FFMPEG_BASE_URL` | Alternate same-origin base path for FFmpeg assets. Defaults to `/vendor/ffmpeg/<version>`. |

Create a `.env.local` file in the project root if you need to set any of these values.

## 📦 Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run typecheck` | Generate route types and run TypeScript checks (`tsc --noEmit`) |
| `npm run lint` | Run ESLint with Next.js Core Web Vitals and TypeScript rules |
| `npm test` | Run Vitest unit, service, route-handler, and component tests |
| `npm run build` | Copy FFmpeg assets and create a production build |
| `npm run test:e2e` | Run Playwright against the production build; build first and install Chromium once with `npx playwright install chromium` |
| `npm run check` | Run type checking, linting, unit tests, and the production build |

Before deploying, run:

```bash
npm run check
```

## 🗺️ Routes

| Route | Description |
| --- | --- |
| `/` | Tool selector, usage overview, privacy information, and FAQ |
| `/qr-generator` | QR generation, local library, folders, versions, and backups |
| `/video-to-gif` | Video trimming, GIF settings, and target-size optimization |
| `/image-tools` | Image conversion and compression |
| `/privacy` | Processing and storage details |

## 🏗️ Architecture

```text
src/
├── app/
│   ├── api/
│   │   ├── image/convert/    # POST: Sharp image conversion
│   │   ├── image/compress/   # POST: Sharp target-size compression
│   │   └── health/           # GET: basic liveness check
│   └── ...                   # App Router pages and metadata
├── config/                   # Site settings, limits, and FFmpeg paths
├── components/               # Shared UI, site shell, and tool components
├── features/
│   ├── qr/                   # QR UI and library logic
│   ├── video/                # FFmpeg conversion pipeline
│   └── image/                # Image conversion and compression
├── server/image/             # Server-only Sharp services and HTTP helpers
└── lib/                      # Errors, file detection, Dexie, job history, downloads

scripts/                      # FFmpeg asset preparation
 tests/
├── unit/
└── e2e/
```

The exact module contents may evolve; the main separation is between tool features, shared browser utilities, and server-only image processing.

## 🔍 Implementation notes

### Resource limits

Limits are centralized in `src/config/limits.ts` so the UI and validators can use the same values.

| Operation | Current limit or behavior |
| --- | --- |
| Video input | Up to 2 GB, 1 hour, and 4K source resolution |
| GIF output | Up to 12,000 frames per conversion, plus a total output-pixel budget |
| Image processing in browser | Up to 40 MB input |
| Server-side image processing | Up to 4 MB input |
| Image decode | 50-megapixel cap |
| Recent-job history | Up to 50 metadata entries; clearable |

These are configured ceilings, not performance guarantees. Browser, device memory, source codec, clip length, and output dimensions can affect whether a conversion completes successfully.

### File intake and validation

- Media tools support file browsing, drag-and-drop, and clipboard paste (`src/components/tool/file-intake.tsx`).
- Text paste into normal text inputs is not intercepted.
- File type detection checks magic bytes in `src/lib/file-sniff.ts`; filename extensions and MIME types are treated as hints.
- Server-side requests are validated again with Zod.
- Errors use a shared vocabulary from `src/lib/errors.ts`. API errors follow `{ "error": { "code", "message", "field?" } }` and do not expose stack traces.

### Video processing

- FFmpeg uses `@ffmpeg/ffmpeg` and the single-threaded `@ffmpeg/core`, so cross-origin isolation headers are not required.
- FFmpeg assets are copied to `public/vendor/ffmpeg/<version>/` during installation and before production builds. The runtime is loaded only when a valid video is selected; it is not included in the initial homepage bundle.
- Where supported, the input is mounted read-only via `WORKERFS` to avoid copying multi-gigabyte input files into WebAssembly memory. A copy-based fallback is used for browsers without `WORKERFS`.
- Conversion is capped by output-frame, pixel, and time budgets. Clips that exceed the configured output budget are limited to the longest clip that fits.
- Each attempt uses two-pass palette encoding (`palettegen` → `paletteuse`). The quality setting affects the actual encoding parameters.
- Target-size optimization measures output after each attempt. It lowers frame rate first, then width; Strict mode can also reduce the color count. The search stops after six attempts or when the time budget is reached.
- Progress is based on FFmpeg progress events. Cancellation terminates the worker, and temporary files/object URLs are released.

A development measurement recorded a 75-second clip converting to a 1,124-frame GIF in 39 seconds in Chromium. Treat this as an example result, not a benchmark or performance guarantee for other devices and files.

### Image processing

- **Browser path:** produces JPEG, PNG, or WebP for inputs the browser can decode. The resulting MIME type is verified to prevent silent format fallback.
- **Sharp path:** supports the configured AVIF/TIFF/GIF output options, TIFF input, animation handling, and advanced encoder settings. This path is restricted to small files due to serverless request/response limits.
- **Animation:** animation is retained for GIF/WebP output where supported. Other output formats require an explicit first-frame-only choice.
- **Target size:** browser and server paths use a bounded quality search and optional resize steps. If the result is larger than the original, the UI reports that instead of claiming a successful reduction.

### QR library and version history

The Dexie database in `src/lib/db/index.ts` contains `folders`, `qrCodes`, `versions`, and `jobs` tables.

- Stores configurations and version history rather than duplicating rendered images.
- Creates a version only when saved content or styling actually changes.
- Restoring an older version creates a new version; history is not rewritten.
- Enforces unique folder names among siblings and prevents moving a folder into itself or a descendant.
- When deleting a folder, lets the user move its contents up or delete them.
- Validates versioned JSON backups with Zod. Import preview shows conflicts and offers **Merge** (does not overwrite existing records) or **Import as copies** (creates new IDs). Import runs in a transaction.

QR tags can be stored and searched, but the current UI does not provide tag editing.

### Caching strategy

Caching is intentionally limited because the app has no server-side user data to refresh.

- Pages are statically prerendered where appropriate.
- No `use cache`, revalidation, `revalidatePath`, or `revalidateTag` is used; there is no server data requiring refresh.
- Image API responses use `Cache-Control: no-store`.
- Uploaded/generated media is not publicly cached or persisted as job history.
- Versioned assets under `/vendor/ffmpeg/<version>/` are served with immutable caching.
- QR previews use a bounded in-memory cache.

### Security

- Same-origin Content Security Policy with `'wasm-unsafe-eval'` for FFmpeg.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a strict referrer policy, and a restrictive Permissions Policy.
- Uploaded SVG files are rejected.
- QR SVG is generated from validated data and displayed through an image element rather than injected into the DOM.
- API request sizes and options are validated on the server.

## 🔌 Image API

The image API is used for formats and options that require Sharp.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/image/convert` | `POST` | Convert an image using Sharp |
| `/api/image/compress` | `POST` | Compress an image toward a target size |
| `/api/health` | `GET` | Basic liveness check |

### Request and response behavior

- Requests use `multipart/form-data` with a `file` part and an `options` part containing JSON validated against the same Zod schema used by the UI.
- `Content-Length` is checked before reading; the body is hard-capped at 4 MB + 64 KB.
- Successful responses return image bytes with the actual `Content-Type`, `Content-Disposition: attachment`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`.
- `X-Image-*` headers report result details such as format, dimensions, quality, attempts, whether the target was met, and an explanation.
- Outputs larger than 4.4 MB return `413 OUTPUT_TOO_LARGE`.
- The route uses a 30-second `maxDuration`.

The server-side size limit is deliberate: Vercel Functions have request/response payload limits, so larger image inputs should use the browser-side path when the required format and operation are supported.

## ☁️ Deploy to Vercel

1. Push the repository to GitHub (or another supported Git provider).
2. Import the repository into Vercel and keep the **Next.js** framework preset and default install/build commands.
3. If using a custom domain, set `NEXT_PUBLIC_SITE_URL`. Add search-console verification tokens only if needed.
4. Deploy and test all three tools with representative files. Confirm that FFmpeg assets load on the deployed site.
5. Enable Vercel Web Analytics only if you want page-view analytics. It is rendered only in Vercel builds; setup is available in the [Vercel Analytics documentation](https://vercel.com/docs/analytics).
6. If you intend to index the site, submit `/sitemap.xml` to Google Search Console and Bing Webmaster Tools.

The install step runs `postinstall`, and the build runs `prebuild` to publish the FFmpeg runtime as a versioned static asset (approximately 31 MB of WebAssembly assets). No separate database, storage bucket, paid media API, or application server is required. Sharp runs in the Node.js runtime of the image route handlers.

## ⚠️ Known limitations

- HEIC/HEIF (other than AVIF), SVG, and animated AVIF are not supported.
- Server-side image jobs show an indeterminate progress indicator; there is no streamed progress response.
- Browser storage can be cleared. Export a QR-library backup if you need to preserve it separately.
- Long GIF conversions can be slow and output files can be very large (often 50–300 MB for several minutes of video). GIF is limited to 256 colors per frame.
- Videos longer than one hour or with source resolution above 4K are rejected. The configured frame, pixel, and time budgets may impose a lower practical limit.
- QR tags can be searched but do not yet have a UI for editing.

---

<div align="center">

**Built for a simpler everyday workflow.**

</div>
