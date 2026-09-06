// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://sekhar-nalla.dev",
  trailingSlash: "ignore",
  build: {
    // Inline all CSS into the HTML. Works on Cloudflare Pages (root) and in
    // preview environments where the site is not served from the domain root.
    inlineStylesheets: "always",
  },
});
