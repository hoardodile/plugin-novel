import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/__tests__/setup.ts"],
		css: false,
		include: ["src/**/*.test.{ts,tsx}"],
		// render.tsx import is heavy; under full-monorepo parallel test runs it
		// can exceed the 5 s default on slower / heavily loaded machines.
		testTimeout: 30_000,
		// Default is cores-1 workers; turbo runs several packages' tests in
		// parallel, so cap each vitest run to keep the machine responsive.
		maxWorkers: 2,
	},
})
