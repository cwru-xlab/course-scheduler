const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Parent folder has package-lock.json; pin Turbopack root to platform/ (not ~/projects).
  turbopack: {
    root: path.join(__dirname),
  },
};

module.exports = nextConfig;
