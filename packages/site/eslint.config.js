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
  { files: ["*.config.{js,ts}"], extends: [tseslint.configs.disableTypeChecked] },
  // The one browser script the site ships: linted without type information, with the browser's document.
  { files: ["assets/*.js"], extends: [tseslint.configs.disableTypeChecked], languageOptions: { globals: { document: "readonly" } } },
);
