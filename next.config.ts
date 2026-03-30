import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
    reactCompiler: true,
    serverExternalPackages: ["microsoft-cognitiveservices-speech-sdk"],
    // experimental: {
    //   turbopackFileSystemCacheForDev: false,
    // },
  };

export default nextConfig;
