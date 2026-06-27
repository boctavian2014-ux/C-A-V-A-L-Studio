const tseslint = require("typescript-eslint");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  {
    ignores: [
      "dist/**",
      "**/node_modules/**",
      ".caval/**",
      "coverage/**",
      "build-icons/**",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
    },
  },
];
