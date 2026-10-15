import type { MetadataRoute } from "next";

// Internal tool: keep every crawler out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
