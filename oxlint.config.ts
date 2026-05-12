import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  rules: {
    complexity: "off",
    "func-style": "off",
    "jsdoc/check-tag-names": "off",
    "no-empty-function": "off",
    "no-nested-ternary": "off",
    "no-plusplus": "off",
    "no-shadow": "off",
    "no-use-before-define": "off",
    "prefer-destructuring": "off",
    "promise/avoid-new": "off",
    "promise/prefer-await-to-callbacks": "off",
    "promise/prefer-await-to-then": "off",
    "require-await": "off",
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
