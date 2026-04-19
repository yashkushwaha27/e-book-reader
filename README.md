# Digital Shelf — Mobile E-Book Reader

A mobile-first progressive web app (PWA) for reading classic literature with a realistic 3D page-flip animation. Built with React, TypeScript, and Vite. Optimized exclusively for mobile portrait and landscape viewports.

---

## Features

- **3D Page-Flip Animation** — powered by the `page-flip` library with corner-drag and button controls
- **Smart HTML Pagination** — converts arbitrary HTML into perfectly sized book pages using off-screen measurement
- **Reading Progress** — persists last-read page per book via `localStorage`
- **Bookmarks** — add/remove bookmarks on any page; jump directly from the toolbar
- **Resume Prompt** — on re-open, asks "Continue" or "Start from beginning"
- **Offline Reading** — save any book to `IndexedDB` for reading without network
- **Three Reader Skins** — Classic (cream), Sepia (golden), High Contrast (dark)
- **Full-Text Search** — filters the book catalog by title or description in real time
- **Progressive Web App** — installable, offline-capable service worker via `vite-plugin-pwa`
- **Multi-Source Books** — supports Project Gutenberg URLs and Google Drive hosted HTML files
- **Mobile-Only** — desktop viewports (≥ 768 px) are blocked with a clear message

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript 6 |
| Build | Vite 8 |
| Routing | React Router 7 |
| Page Animation | page-flip 2.0.7 |
| PWA | vite-plugin-pwa + Workbox |
| Date Formatting | moment.js 2.30 |
| Storage | localStorage (progress, bookmarks) + IndexedDB (offline HTML) |
| Styling | Pure CSS with CSS custom properties |
| Fonts | DM Sans (UI), Source Serif 4 (book body) via Google Fonts |
| Deployment | GitHub Pages |

---

## Folder Structure

```
e-book-reader/
├── public/                        # Static files served as-is
│   ├── background.avif            # App background image
│   ├── favicon.svg
│   ├── icons.svg                  # SVG sprite for UI icons
│   └── books/                     # Demo/fallback book HTML files
│       ├── demo-tale.html
│       └── second-sketch.html
│
├── src/
│   ├── main.tsx                   # React entry point — mounts <App /> at #root
│   ├── App.tsx                    # Root component — desktop block + router outlet
│   ├── index.css                  # Global design tokens and base styles
│   ├── vite-env.d.ts              # Vite environment type declarations
│   │
│   ├── assets/                    # Bundled static assets (images, SVGs)
│   │   ├── hero.png
│   │   ├── react.svg
│   │   └── vite.svg
│   │
│   ├── components/
│   │   ├── appLayout/             # Persistent chrome around all pages
│   │   │   ├── AppLayout.tsx      # Sticky header with "Digital shelf" brand
│   │   │   ├── AppLayout.css
│   │   │   └── index.ts           # Re-export
│   │   └── desktopBlock/
│   │       ├── DesktopBlockPage.tsx  # Shown when viewport ≥ 768 px
│   │       └── DesktopBlockPage.css
│   │
│   ├── data/
│   │   └── books.ts               # Book catalog — titles, sources, Drive IDs
│   │
│   ├── hooks/
│   │   └── useDesktopWebBlock.ts  # Returns true when viewport is desktop-width
│   │
│   ├── lib/                       # Pure utility modules (no React)
│   │   ├── fetchBookHtml.ts       # Fetch HTML with CORS proxy fallback chain
│   │   ├── htmlToPages.ts         # Paginate HTML into fixed-height .book-page divs
│   │   ├── offlineBookStorage.ts  # IndexedDB read/write for offline books
│   │   ├── readerBookmarks.ts     # Bookmark list per book (localStorage)
│   │   ├── readerProgress.ts      # Last-read page index per book (localStorage)
│   │   ├── readerResume.ts        # Resume-prompt decision logic
│   │   ├── recentlyRead.ts        # Recently read list with timestamps (localStorage)
│   │   ├── formatRecentReadTime.ts # Human-readable "2 hours ago" strings
│   │   └── drive.ts               # Google Drive URL parsing and download URL builder
│   │
│   ├── pages/
│   │   ├── landing/
│   │   │   └── LandingPage.tsx    # Hero section + recently read list
│   │   ├── library/
│   │   │   ├── LibraryPage.tsx    # Searchable book grid + description modal
│   │   │   └── LibraryPage.css
│   │   ├── reader/
│   │   │   ├── BookReaderPage.tsx # Full-featured page-flip reader (~955 lines)
│   │   │   └── BookReaderPage.css
│   │   └── templates/
│   │       ├── TemplatesPage.tsx  # Reader skin previews + Drive setup guide
│   │       └── TemplatesPage.css
│   │
│   ├── routes/
│   │   ├── Router.tsx             # React Router v7 route definitions
│   │   ├── routes.constants.ts    # Route path string constants
│   │   └── index.ts               # Re-export
│   │
│   └── types/
│       └── page-flip.d.ts         # TypeScript declarations for page-flip library
│
├── index.html                     # HTML shell — loads Google Fonts, mounts #root
├── vite.config.ts                 # Vite config — proxies, PWA, aliases, base path
├── tsconfig.json                  # TypeScript project references root
├── tsconfig.app.json              # App compiler options (ES2023, strict)
├── tsconfig.node.json             # Build-tool compiler options
├── eslint.config.js               # ESLint flat config
├── package.json                   # Dependencies and scripts
└── yarn.lock                      # Dependency lock file
```

---

## Application Routes

| Path | Component | Description |
|---|---|---|
| `/` | `LandingPage` | Hero + recently read books |
| `/library` | `LibraryPage` | Full book catalog with search |
| `/read/:bookId` | `BookReaderPage` | Page-flip reader for a specific book |
| `/templates` | `TemplatesPage` | Reader skin gallery + Google Drive guide |

---

## Core Modules Explained

### `src/main.tsx`

The React entry point. Calls `ReactDOM.createRoot` on `#root` and renders `<App />` inside `<StrictMode>`.

---

### `src/App.tsx`

Root component. Uses `useDesktopWebBlock` to detect viewport width. If the device is desktop-width (≥ 768 px), renders `<DesktopBlockPage />`. Otherwise, renders the router outlet inside `<AppLayout />`.

---

### `src/routes/Router.tsx`

Defines the React Router v7 router using `createBrowserRouter`. Maps each path to its page component and wraps them in `<AppLayout>`.

---

### `src/data/books.ts`

The book catalog. Each entry has:

```ts
{
  id: string;
  title: string;
  author: string;
  description: string;
  gutenbergUrl: string;       // Project Gutenberg direct URL
  driveFileId?: string;       // Optional Google Drive file ID
  coverColor: string;         // CSS color for the book spine
}
```

Key exported functions:

| Function | Purpose |
|---|---|
| `getBookById(id)` | Look up a book by its ID |
| `resolveBookFetchUrl(book)` | Returns the correct URL for the current environment (dev vs. prod, Drive vs. Gutenberg) |
| `bookNeedsDriveProxyNote(book)` | Returns `true` if the book uses Drive and is in production (CORS limitation warning) |

Current catalog:
- *Crime and Punishment* — Fyodor Dostoevsky
- *The Green Mummy* — Fergus Hume
- *The Strange Case of Dr. Jekyll and Mr. Hyde* — Robert Louis Stevenson

---

### `src/lib/fetchBookHtml.ts`

Fetches a book's HTML with a cascading fallback strategy:

```
1. Dev mode + Google Drive book  → /api/gdrive-html?fileId=... (Vite proxy)
2. Dev mode + Gutenberg book     → direct fetch (no CORS in dev)
3. Production                    → direct fetch attempt
4. Fail                          → Codetabs CORS proxy
5. Fail                          → AllOrigins CORS proxy
6. Fail                          → custom VITE_GUTENBERG_PROXY_PREFIX env var
7. Any network failure           → IndexedDB offline cache
```

This ensures books load across different hosting environments and network conditions.

---

### `src/lib/htmlToPages.ts`

The most complex module (~630 lines). Converts a raw HTML string into an array of `HTMLDivElement` elements, each representing exactly one book page.

**Algorithm:**
1. Parse HTML with `DOMParser`
2. Strip Project Gutenberg header/footer boilerplate
3. Extract table of contents (Gutenberg `<div class="chapter">` or blockquote TOC)
4. Detect document structure: chapters, generic sections, or flat body paragraphs
5. Create an off-screen `.reader-measure-host` element matching live `.book-page` typography
6. Greedily fill each page with blocks until they overflow the page height
7. For blocks too large to fit on a single page, use binary search + character-level splitting
8. Yield to the JS scheduler periodically to avoid UI jank during long paginations
9. Return the completed array of `.book-page` divs for the page-flip library

---

### `src/lib/offlineBookStorage.ts`

Wraps the browser's `IndexedDB` API with promise-based helpers. Uses database `e-book-reader-offline`, object store `books`.

| Function | Description |
|---|---|
| `saveOfflineBook(bookId, title, html)` | Persist HTML to IndexedDB |
| `getOfflineBookHtml(bookId)` | Retrieve saved HTML or `null` |
| `isBookSavedOffline(bookId)` | Boolean check without fetching full HTML |
| `listOfflineBookIds()` | Array of all saved book IDs |

---

### `src/lib/readerProgress.ts`

Stores and retrieves reading position (page index) per book using `localStorage` key `reading-position.v1`.

| Function | Description |
|---|---|
| `getReadingPosition(bookId)` | Returns 0-based page index or `null` |
| `setReadingPosition(bookId, page)` | Saves current page |
| `flushSaveReadingPosition()` | Immediate save (called on visibility change) |

---

### `src/lib/readerBookmarks.ts`

Manages an array of bookmarked page indices per book under `localStorage` key `bookmarks.v1`.

| Function | Description |
|---|---|
| `getBookmarks(bookId)` | Returns sorted array of bookmarked page indices |
| `addBookmark(bookId, page)` | Add a page to bookmarks |
| `removeBookmark(bookId, page)` | Remove a page from bookmarks |
| `toggleBookmark(bookId, page)` | Add or remove depending on current state |
| `isBookmarked(bookId, page)` | Boolean check |

---

### `src/lib/recentlyRead.ts`

Tracks the last 8 books opened with timestamps in `localStorage`. Includes a migration from v1 (plain array) to v2 (timestamped objects).

---

### `src/lib/drive.ts`

Utilities for Google Drive integration:

| Function | Description |
|---|---|
| `extractGoogleDriveFileId(input)` | Parses a Drive share URL or raw file ID |
| `buildDriveDownloadUrl(fileId)` | Returns `drive.google.com/uc?export=download&id=...` |

---

### `src/pages/reader/BookReaderPage.tsx`

The main reader component (~955 lines). Orchestrates the entire reading experience.

**Lifecycle:**
1. Extracts `bookId` from the URL param
2. Fetches book HTML via `fetchBookHtml()`
3. On fetch complete, calls `htmlToPages()` to paginate
4. Mounts the `PageFlip` instance onto a canvas element
5. Adds all page divs as children of the flip mount
6. Registers `ResizeObserver` on the shell container; repaginates if dimensions change by > 10 px (epsilon filter prevents feedback loops)
7. Restores reading position, checks for resume prompt if position > 0
8. On every page turn, persists position to localStorage; syncs bookmark state

**Reader Skins:**

Activated via query param `?skin=sepia` or `?skin=contrast`. Default is classic.

```
/read/crime-and-punishment?skin=sepia
/read/crime-and-punishment?skin=contrast
```

**Key state variables:**

| State | Purpose |
|---|---|
| `pages` | Array of paginated `HTMLDivElement` |
| `currentPage` | 0-based page index currently shown |
| `bookmarks` | Array of bookmarked page indices |
| `isOffline` | Network status from `navigator.onLine` |
| `isBookSaved` | Whether the current book is in IndexedDB |
| `showResumePrompt` | Whether to show Continue/Restart dialog |
| `skin` | Active reader skin name |

---

### `src/pages/library/LibraryPage.tsx`

Renders the book catalog as a responsive card grid. Filters `BOOK_CATALOG` in real time as the user types.

Features:
- Live search filtering by title and description text
- "Read more" button expands truncated descriptions into a modal
- "Offline" badge on cards for saved books
- "Recently read" quick-access section at the top (pulls from `recentlyRead.ts`)

---

### `src/pages/landing/LandingPage.tsx`

Minimal landing page with a hero section and a list of recently read books. Each recently read book shows a relative timestamp ("3 hours ago") via `formatRecentReadTime.ts`.

---

### `src/pages/templates/TemplatesPage.tsx`

Gallery of the three reader skins (Classic, Sepia, High Contrast) rendered as preview cards. Also contains a step-by-step guide for hosting custom books on Google Drive and adding them to the catalog.

---

### `src/components/appLayout/AppLayout.tsx`

Persistent layout shell. Renders a sticky top header containing the "Digital shelf" brand name, which also acts as a back-navigation button to the landing page. The header is hidden on the landing page itself.

---

### `src/components/desktopBlock/DesktopBlockPage.tsx`

Full-screen page shown on desktop viewports. Displays an icon and message indicating the app is mobile-only. Rendered by `App.tsx` when the viewport width exceeds 767 px.

---

### `src/hooks/useDesktopWebBlock.ts`

Custom React hook. Subscribes to `window.matchMedia('(min-width: 768px)')` and returns a boolean that tracks whether the current viewport is desktop-width. Used by `App.tsx` to decide whether to render the block page.

---

## Styling Architecture

### Design Tokens (`src/index.css`)

All colors, spacing, and shadows are defined as CSS custom properties on `:root`:

```css
--text:      #f0eee9   /* Primary text */
--bg:        #0c0a09   /* App background */
--surface:   #1c1a18   /* Card/panel background */
--accent:    #c4b5fd   /* Purple accent (links, highlights) */
--border:    #2e2b27   /* Subtle borders */
--radius-sm: 6px
--radius-md: 12px
--radius-lg: 20px
```

### Reader Skins (`src/pages/reader/BookReaderPage.css`)

Each skin overrides `--reader-paper` (page background) and `--reader-ink` (text color):

| Skin | Paper | Ink |
|---|---|---|
| Classic | `#f5efe0` warm cream | `#2c1810` dark brown |
| Sepia | `#f0e6c8` golden | `#3d2b1f` warm brown |
| Contrast | `#1a1a1a` near-black | `#f0f0f0` near-white |

---

## Vite Configuration (`vite.config.ts`)

### Base Path
Automatically detects `GITHUB_REPOSITORY` environment variable to set the correct base path for GitHub Pages deployment.

### Dev Proxies

| Proxy Path | Target | Purpose |
|---|---|---|
| `/api/gdrive-html` | Google Drive | Bypass CORS for Drive-hosted books in dev |
| `/gutenberg-proxy` | `aleph.gutenberg.org` | Mirror Gutenberg URLs locally in dev |

### PWA (via `vite-plugin-pwa`)

- Service worker auto-registered
- Caches all JS, CSS, HTML, SVG, WOFF2 assets
- Font caching strategy: `CacheFirst` with 1-year TTL
- Navigation fallback to `index.html` for client-side routing
- `/api/*` routes excluded from offline navigation

---

## Data Flow Diagram

```
User opens /read/:bookId
        │
        ▼
BookReaderPage mounts
        │
        ▼
fetchBookHtml(url)
  ├─ Dev: direct fetch or /api/gdrive-html proxy
  └─ Prod: direct → Codetabs proxy → AllOrigins proxy → IndexedDB
        │
        ▼
htmlToPages(html, pageWidth, pageHeight)
  ├─ Strip Gutenberg boilerplate
  ├─ Detect chapters / sections / flat body
  ├─ Off-screen measurement loop
  └─ Return HTMLDivElement[]
        │
        ▼
PageFlip.loadFromHTML(pages[])
        │
        ▼
Render 3D flip book
        │
        ▼
On flip → setReadingPosition(bookId, page)
       → syncBookmarkState()
       → updateRecentlyRead(bookId)
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- Yarn

### Install

```bash
yarn install
```

### Development

```bash
yarn dev
```

Opens a Vite dev server at `http://localhost:5173` with HMR. The Gutenberg and Google Drive proxies are active in dev mode.

### Build

```bash
yarn build
```

Runs TypeScript compiler, then Vite production build, then copies `dist/index.html` → `dist/404.html` for GitHub Pages SPA fallback routing.

### Preview Production Build

```bash
yarn preview
```

### Lint

```bash
yarn lint
```

---

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `VITE_GUTENBERG_PROXY_PREFIX` | Custom CORS proxy URL prefix for Gutenberg | (none) |
| `GITHUB_REPOSITORY` | Set by GitHub Actions; used to derive base path | (none) |

---

## Adding a New Book

1. Find the Project Gutenberg HTML page URL for the book.
2. Open `src/data/books.ts`.
3. Add an entry to the `BOOK_CATALOG` array:

```ts
{
  id: 'my-book-id',
  title: 'My Book Title',
  author: 'Author Name',
  description: 'A short description shown in the library.',
  gutenbergUrl: 'https://www.gutenberg.org/files/XXXXX/XXXXX-h/XXXXX-h.htm',
  coverColor: '#7c3aed',   // any CSS color for the book spine
}
```

4. The book immediately appears in the library. No other changes needed.

### Using a Google Drive-Hosted Book

Upload your HTML file to Google Drive and make it publicly accessible. Then add `driveFileId` to the catalog entry:

```ts
{
  ...
  driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
}
```

> **Note:** Google Drive HTML fetching works in development via the Vite proxy. In production it requires a backend proxy (browser CORS policy blocks direct Drive downloads).

---

## Deployment

The app is deployed to GitHub Pages. The GitHub Actions workflow (`.github/`) runs `yarn build` and pushes the `dist/` directory to the `gh-pages` branch.

The `404.html` copy ensures that direct deep links (e.g., `/read/crime-and-punishment`) are handled by the SPA router instead of returning a 404.

---

## Known Limitations

- **Desktop blocked** — viewport ≥ 768 px shows a "Mobile only" screen by design.
- **Google Drive in production** — CORS prevents direct Drive HTML fetching without a backend proxy.
- **Gutenberg rate limits** — heavy usage may trigger Gutenberg's rate limiter; CORS proxies are used as fallback.
- **Pagination on resize** — repagination on window resize can take 1–3 seconds for long books.

---

## License

This project is open source. Book content is sourced from [Project Gutenberg](https://www.gutenberg.org) and is in the public domain.
