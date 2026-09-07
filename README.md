# SCAR Golf

A private golf championship scoring, pairings, leaderboard, and handicap
tracking web app for the SCAR club.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Drizzle ORM
- PostgreSQL (Railway)
- Better Auth (passkey authentication)
- Vercel (planned for hosting)

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in your own local values
   (database URL, auth secret, etc.):
   ```bash
   cp .env.example .env.local
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) to view the app.
