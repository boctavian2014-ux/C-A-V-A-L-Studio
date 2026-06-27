import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "**/*.{test,spec}.ts"],
    exclude: ["dist/**", "**/node_modules/**", "coverage/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: [
        "ai/**/*.ts",
        "billing/**/*.ts",
        "context-engine/**/*.ts",
        "marketplace/**/*.ts",
        "mobile/**/*.ts",
        "mobile-app/**/*.ts",
        "src/**/*.ts",
        "romania/**/*.ts",
        "installer/**/*.ts",
        ".cicd/**/*.ts"
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.tsx",
        "**/types.ts",
        "**/index.ts",
        "src/renderer/**",
        "src/main/electron-main.ts",
        "src/main/preload.ts",
        "installer/**",
        "ai/composer/composer.ts"
      ],
      thresholds: {
        lines: 25,
        functions: 25,
        branches: 20,
        statements: 25
      }
    },
    testTimeout: 15_000
  }
});
