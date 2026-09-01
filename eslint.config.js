import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["dist/", "coverage/", "tmp/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain scripts are checked without the TypeScript program, so the Node
    // globals they rely on have to be declared here.
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  prettier,
];
