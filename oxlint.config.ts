import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  rules: {
    complexity: "warn",
    "func-style": "off",
    "jsdoc/check-tag-names": "off",
    "no-empty-function": "off",
    "no-nested-ternary": "error",
    "no-plusplus": "off",
    "no-shadow": "error",
    "no-use-before-define": "error",
    "prefer-destructuring": "error",
    "promise/avoid-new": "off",
    "promise/prefer-await-to-callbacks": "error",
    "promise/prefer-await-to-then": "error",
    "require-await": "error",
    "require-unicode-regexp": "off",
    "unicorn/no-array-reduce": "off",
    "unicorn/no-useless-error-capture-stack-trace": "off",
    "unicorn/no-useless-switch-case": "off",
    "unicorn/prefer-array-find": "off",
    "unicorn/prefer-module": "off",
    "unicorn/prefer-response-static-json": "off",
    "unicorn/prefer-ternary": "off",
  },
});
