import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  { files: ["design-tests/*.mjs", "browser-tests/*.mjs"], extends: [tseslint.configs.disableTypeChecked], languageOptions: { globals: { process: "readonly" } } },
  { files: ["scripts/*.mjs"], extends: [tseslint.configs.disableTypeChecked], languageOptions: { globals: { process: "readonly", console: "readonly" } } },
  { files: ["*.config.{js,ts}"], extends: [tseslint.configs.disableTypeChecked] },
);
