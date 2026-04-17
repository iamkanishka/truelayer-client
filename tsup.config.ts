import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "auth/index": "src/auth/index.ts",
    "payments/index": "src/payments/index.ts",
    "payouts/index": "src/payouts/index.ts",
    "merchant/index": "src/merchant/index.ts",
    "mandates/index": "src/mandates/index.ts",
    "data/index": "src/data/index.ts",
    "verification/index": "src/verification/index.ts",
    "signup-plus/index": "src/signup-plus/index.ts",
    "tracking/index": "src/tracking/index.ts",
    "webhooks/index": "src/webhooks/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "node18",
  outDir: "dist",
  external: [],
});
