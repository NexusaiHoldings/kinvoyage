// Hotfix 2026-05-28: enables Tailwind utility compilation for agent-built
// pages that used className="..." Tailwind classes (substrate didn't ship
// Tailwind; classes compiled to no CSS).
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
