import type { Config } from "tailwindcss";

// Hotfix 2026-05-28: substrate didn't ship Tailwind; agent-built pages
// (/itinerary/new, etc.) used Tailwind classes that compiled to no CSS,
// rendering as raw HTML. This config makes those classes compile.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
