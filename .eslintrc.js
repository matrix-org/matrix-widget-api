module.exports = {
    plugins: ["matrix-org"],
    extends: ["plugin:matrix-org/babel"],
    parserOptions: {
        project: ["./tsconfig-dev.json"],
    },
    env: {
        browser: true,
    },
    rules: {
        "no-var": ["warn"],
        "prefer-rest-params": ["warn"],
        "prefer-spread": ["warn"],
        "one-var": ["warn"],
        "padded-blocks": ["warn"],
        "no-extend-native": ["warn"],
        "camelcase": ["warn"],
        "no-multi-spaces": ["error", { ignoreEOLComments: true }],
        "space-before-function-paren": [
            "error",
            {
                anonymous: "never",
                named: "never",
                asyncArrow: "always",
            },
        ],
        "@typescript-eslint/prefer-readonly": ["error"],
        "arrow-parens": "off",
        "prefer-promise-reject-errors": "off",
        "quotes": "off",
        "indent": "off",
        "no-constant-condition": "off",
        "no-async-promise-executor": "off",
    },
    overrides: [
        {
            files: ["src/**/*.ts", "test/**/*.ts"],
            extends: ["plugin:matrix-org/typescript"],
            rules: {
                // TypeScript has its own version of this
                "babel/no-invalid-this": "off",

                "quotes": "off",
            },
        },
        {
            files: ["src/interfaces/**/*.ts"],
            rules: {
                "@typescript-eslint/no-empty-object-type": "off",
            },
        },
    ],
};
