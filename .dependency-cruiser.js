/**
 * Architecture rules as a sensor. Each rule carries its own guidance in
 * `comment`, which is what `tools/depcruise-reporter-agent.js` prints and what
 * the native `err-long` reporter prints for a human. One source of truth.
 *
 * See "Sensors for coding agents" (Martin Fowler, 2026) and the design document
 * at docs/plans/2026-07-26-dependency-rules-design.md.
 */
export default {
  forbidden: [
    {
      name: "no-cycles",
      severity: "error",
      comment: `A cycle welds both ends together: neither module can be read, tested or
replaced without the other. Move the shared declaration into the module
that genuinely owns it, so one direction survives and the other dies.`,
      from: {},
      to: { circular: true },
    },
    {
      name: "core-imports-no-infrastructure",
      severity: "error",
      comment: `packages/core/ holds business rules and imports no infrastructure (ADR §6).
The contract belongs to its consumer: declare what you need as a type in
core/contracts.ts and receive the implementation as a parameter.`,
      from: { path: "^packages/core/src/" },
      to: { path: "^packages/(pluggy|storage)/src/|^apps/cli/src/mcp/" },
    },
    {
      name: "core-imports-no-packages",
      severity: "error",
      comment: `packages/core/ is pure. No SDK, no client, no driver — only zod, which the ADR
already promises to core/category.ts. If you need what a package does, put
the type in core/contracts.ts and let bin/ inject the implementation.`,
      from: { path: "^packages/core/src/" },
      to: { dependencyTypes: ["npm"], pathNot: "node_modules/zod/" },
    },
    {
      name: "only-bin-builds-infrastructure",
      severity: "error",
      comment: `Only apps/cli/src/bin/ constructs infrastructure. apps/cli/src/cli/ and
apps/cli/src/mcp/ receive Bank, Store and Logger as parameters, which is
what keeps init and doctor testable and what lets ADR §16.4 forbid
process.exit inside a provider.`,
      from: { path: "^apps/cli/src/(cli|mcp)/" },
      to: { path: "^packages/(pluggy|storage)/src/|^apps/cli/src/logging\\.ts$" },
    },
    {
      name: "src-imports-no-tests",
      severity: "error",
      comment: `Production code reaching into tests/. The fakes live outside packages/ and
apps/ precisely so this cannot happen — if you need this shape in production,
it is not a fake, it is a missing abstraction.`,
      from: { path: "^(packages|apps/cli/src)/" },
      to: { path: "^tests/" },
    },
    {
      name: "no-dev-dependencies-in-src",
      severity: "error",
      comment: `A devDependency imported from production code ships broken: it is absent from
the published package. Move it to dependencies, or move the code that needs it
out of packages/ and apps/cli/src/.`,
      from: { path: "^(packages|apps/cli/src)/" },
      to: { dependencyTypes: ["npm-dev"] },
    },
    {
      name: "no-undeclared-folders",
      severity: "error",
      comment: `A module under packages/ or apps/cli/src/ outside the folders the ADR lists.
No services/, no utils/, no ports/ or adapters/ — the pattern lives in the
direction of dependencies, not in a folder name. Amend the ADR before adding
a folder.`,
      from: {},
      to: {
        path: "^(packages|apps/cli/src)/",
        pathNot: "^packages/(core|pluggy|storage)/src/|^apps/cli/src/(bin|cli|mcp)/|^apps/cli/src/(config|logging)\\.ts$",
      },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: `Nothing imports this module and it imports nothing. Usually dead code left
behind by a refactor. If it is a new module nobody has wired up yet, this
warning disappears the moment something imports it.`,
      from: { orphan: true, pathNot: "\\.d\\.ts$" },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".js", ".mjs", ".json"],
      conditionNames: ["import", "node", "default"],
    },
  },
};
