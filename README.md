# TeamBoard — Collaborative Project Management Tool

TeamBoard is a real-time, kanban-first project management application designed for fast-moving teams. With real-time updates over WebSockets, customizable project columns, drag-and-drop task tickets, comments, and direct user notifications, TeamBoard brings calm and clarity to your team's workflows.

The application has been enhanced to be fully **SEO optimized**, visually **modern and professional (with adaptive dark mode)**, and pre-configured for seamless serverless deployment on **Vercel** with a **Supabase (PostgreSQL)** database.

---

## Key Enhancements

### 1. Visual & Interactive UI/UX
* **System-Adaptive Dark Mode**: Completely stylesheet-based, zero-JavaScript dark mode that adapts dynamically to users' system preferences (`@media (prefers-color-scheme: dark)`).
* **Glassmorphism Header**: Modern, transparent top header with satin blur overlays (`backdrop-filter`) for a premium SaaS feel.
* **Micro-Animations**: Custom hover transformations, smooth button press feedback, and card scaling to improve interactive engagement.
* **Refined Scrollbars & Focus Indicators**: Customized developer-focused scrollbars and glowing blue outline shadows on focus elements.

### 2. SEO & Search Discoverability
* **Structured JSON-LD Metadata**: Embedded structured schema metadata (`SoftwareApplication` type) for search engines to enable rich Google snippets.
* **Open Graph & Twitter Cards**: Native integration of og:tags and Twitter cards for premium look when sharing the link on social media/Slack.
* **Robots Configuration**: Set dashboards and kanban board pages to `noindex, nofollow` to prevent crawling of private user data while indexing public marketing pages like landing page.
* **Descriptive Titles & Headings**: Clean, semantic hierarchy throughout the site.

### 3. Serverless & Database Architecture
* **Prisma with PostgreSQL**: Shifted database provider from SQLite to PostgreSQL to leverage production-grade pooling on Supabase.
* **Modular Server Routing**: Refactored the monolithic Express app into a modular route controller (`src/app.js`) and local startup entrypoint (`src/server.js`).
* **Vercel Serverless Function**: Configured a serverless redirect and proxy via `vercel.json` that redirects root traffic to the static landing page and forwards `/api/*` to the Node.js function (`api/index.js`).

---

## Tech Stack
* **Frontend**: HTML5, Vanilla JavaScript, CSS3 (with Custom Variables & Dark Mode).
* **Backend**: Node.js, Express.js, Socket.io (for real-time updates).
* **Database**: Supabase (PostgreSQL), Prisma ORM.
* **Hosting**: Vercel (Serverless).

---

## Getting Started

### Local Installation
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Update `.env` with your Supabase database pooled connection string (`DATABASE_URL`) and direct connection string (`DIRECT_URL`).
4. Generate the Prisma Client and push the schema to PostgreSQL:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
5. (Optional) Populate the database with development mock data:
   ```bash
   npm run seed
   ```
6. Start the local server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` to interact with your board.

---

## Vercel Deployment
To deploy the application to Vercel:
1. Connect this repository to your **Vercel Dashboard**.
2. Configure the following environment variables:
   * `DATABASE_URL` (Supabase transaction pooler URL - Port 6543)
   * `DIRECT_URL` (Supabase direct session connection URL - Port 5432)
   * `JWT_SECRET` (A strong random secret key for token signature)
3. Deploy! Vercel will automatically trigger the `postinstall` script (`prisma generate`) and build the serverless functions.
