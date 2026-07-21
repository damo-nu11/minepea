import type { NextConfig } from "next";

// Matches the main PEA app: no dev badge / "Compiling" toast.
// NOTE: do NOT pin turbopack.root here like the root app does — with the
// sub-app's own lockfile it trips an RSC client-manifest bug in this Next
// version (verified 2026-07-17: global-error.js missing from the manifest,
// dev 500s). The multi-lockfile warning it would silence is cosmetic.
const nextConfig: NextConfig = {
  devIndicators: false,
};

export default nextConfig;
