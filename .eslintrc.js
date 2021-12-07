module.exports = {
  env: {
    browser: false,
    es2021: true,
    mocha: true,
    node: true,
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "standard-with-typescript",
    "plugin:prettier/recommended",
    "plugin:node/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 12,
    project: "./tsconfig.json",
  },
  rules: {
    "node/no-unsupported-features/es-syntax": [
      "error",
      { ignores: ["modules"] },
    ],
  },
  overrides: [
    {
      files: ["test/**.ts"],
      rules: {
        "@typescript-eslint/no-unused-expressions": "off",
      },
    },
  ],
};
