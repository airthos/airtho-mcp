import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", {
      tsconfig: { moduleResolution: "node" },
    }],
  },
  // Strip .js extensions so Jest resolves .ts source files
  moduleNameMapper: {
    "^(.*)\\.js$": "$1",
  },
};

export default config;
