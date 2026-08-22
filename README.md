# 🛡️ ArchSentry

> **Enforce your team's architectural contracts on every pull request — deterministically, at zero scan token cost, with instant AI remediation.**

[![npm version](https://img.shields.io/npm/v/archsentry.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/archsentry)
[![CI Status](https://img.shields.io/github/actions/workflow/status/comerade2134/archsentry/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/comerade2134/archsentry/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?style=flat-square)](https://nodejs.org)
[![Zero Config Token Cost](https://img.shields.io/badge/Scan%20Cost-%240%20Deterministic-success.svg?style=flat-square)](https://github.com/comerade2134/archsentry)
[![Semgrep Engine Compatible](https://img.shields.io/badge/Engine-Pattern%20%7C%20Semgrep%20AST-orange.svg?style=flat-square)](https://semgrep.dev)

---

## ⚡ Terminal Demo

```bash
$ npx archsentry scan --config archsentry.yml --path src --explain

❌ ArchSentry found 1 violation(s) (1 error, 0 warnings):

  • [error] no-direct-sql  src/controllers/user.controller.ts:7
    All database writes must go through the repository layer.
    > await db.query("INSERT INTO users (email, name) VALUES ($1, $2)", [payload.email, payload.name]);
    💡 Remediation: All database writes must go through the repository layer. Move this call
       behind the appropriate service or repository layer so the access path is centralized
       and reviewable, rather than issued directly from `src/controllers/user.controller.ts`.

$ echo $?
1
```

---

## 💡 Why ArchSentry?

AI coding assistants (Cursor, Copilot, Claude Code) generate thousands of lines of code per day. While standard linters catch syntax errors and SAST tools detect known CVE vulnerabilities, **neither understands your system's architecture**. 

LLM review bots burn hundreds of dollars per repo summarizing diffs without guaranteeing architectural compliance.

**ArchSentry solves this with a two-phase architecture:**
1. **Deterministic Phase (Zero Cost & Blazing Fast):** Code is matched against your YAML contracts via sub-millisecond regex or AST/Semgrep patterns. No tokens are spent finding violations.
2. **Explanation Phase (Optional & Free-Tier Compatible):** When a violation is flagged, an LLM generates a concise, contextual remediation hint directly on the offending code snippet.

---

## 📊 Comparison Matrix

| Feature | Legacy SAST (SonarQube, Snyk) | Linters (ESLint, Biome) | AI Review Bots (Codium, Copilot PR) | 🛡️ **ArchSentry** |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Focus** | Known CVEs & security vulnerabilities | Code style, syntax, and formatting | Generic natural language commentary | **Custom architectural boundaries & contracts** |
| **Scan Cost** | Heavy license fees | Free | $0.05–$0.50+ per PR diff in LLM tokens | **$0 (Deterministic AST & Pattern Engine)** |
| **Scan Latency** | 20s – 5 mins | < 1s | 15s – 60s (LLM API queue) | **< 100ms** |
| **Deterministic Guarantee** | ✅ Yes | ✅ Yes | ❌ No (LLM hallucinations & flakiness) | **✅ 100% Deterministic** |
| **Architectural Scope** | ❌ None (generic rules) | ⚠️ Limited (complex plugin ASTs) | ⚠️ Probabilistic (misses subtle invariants) | **✅ Declarative YAML Contracts** |
| **Actionable AI Fix Hints** | ❌ Generic docs link | ❌ Static message | ⚠️ Verbose noise | **✅ Targeted, contextual fix explanations** |

---

## 🚀 30-Second Quickstart

### 1. Local CLI Execution (`npx`)

No installation required. Run directly in any repository:

```bash
# Scan a path against your contract
npx archsentry scan --config archsentry.yml --path .

# With optional AI remediation hints:
npx archsentry scan --config archsentry.yml --path . --explain

# Filter findings to modified lines in a git diff:
git diff main...HEAD | npx archsentry scan --config archsentry.yml --diff -
```

#### Exit Codes (CI Standardized)
* `0`: Clean scan. All architectural invariants satisfied.
* `1`: Architectural violations detected (severity: `error`).
* `2`: Runtime error (missing configuration file, malformed YAML, or invalid path).

---

### 2. Native GitHub Action Integration (Zero Infra)

Add `.github/workflows/archsentry.yml` to your repository:

```yaml
name: ArchSentry Architectural Gate

on:
  pull_request:
    branches: [main, master, develop]
  push:
    branches: [main, master]

jobs:
  archsentry-scan:
    name: Architectural Integrity Gate
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run ArchSentry Gate
        run: npx --yes archsentry scan --config archsentry.yml --path .
        env:
          # Optional: provides instant AI remediation hints on violations
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

---

### 3. GitHub App Deployment (Automated PR Comments)

ArchSentry can also run as a dedicated Probot-powered GitHub App that automatically reviews PRs, posts inline architectural remediation comments, and cleans up stale comments upon push.

```bash
# Clone & install dependencies
pnpm install

# Configure credentials
cp .env.example .env
# Set APP_ID, WEBHOOK_SECRET, PRIVATE_KEY_PATH, and OPENROUTER_API_KEY

# Start Probot webhook listener
pnpm start
```

---

## 📜 Rule Schema Reference

Architectural contracts are declared in `archsentry.yml` at the root of your project:

```yaml
version: 1

rules:
  # 1. Zero-dependency Pattern Matcher
  - id: no-direct-db-in-controllers
    type: pattern
    severity: error
    description: "Controllers must route data queries through the repository layer."
    match:
      patterns:
        - "db.query("
        - "connection.query("
        - "INSERT INTO"
        - "UPDATE "
        - "DELETE FROM"
      paths:
        - "src/controllers/**"
        - "apps/api/controllers/**"
      exclude:
        - "src/repositories/**"
        - "**/tests/**"

  # 2. AST-Aware Semgrep Matcher (Auto-upgrades when semgrep CLI is available)
  - id: no-raw-eval
    type: semgrep
    severity: error
    description: "Do not call eval() or new Function() in application code."
    semgrep:
      languages: ["typescript", "javascript"]
      pattern-either:
        - pattern: eval(...)
        - pattern: new Function(...)
      paths:
        include:
          - "src/**"
        exclude:
          - "**/*.spec.ts"

  # 3. Warning Severity Rule
  - id: avoid-console-log-in-production
    type: pattern
    severity: warn
    description: "Use structured logger (logger.info / logger.error) instead of console.log."
    match:
      patterns:
        - "console.log("
      paths:
        - "src/**"
      exclude:
        - "src/scripts/**"
```

### Schema Attributes

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `version` | `number` | **Yes** | Contract schema version (must be `1`). |
| `rules[].id` | `string` | **Yes** | Unique identifier (`[a-zA-Z0-9_-]`). |
| `rules[].type` | `"pattern"` \| `"semgrep"` | **Yes** | Rule engine backend. `pattern` requires 0 external tools; `semgrep` runs AST queries. |
| `rules[].description` | `string` | **Yes** | Plain-English rationale for the rule. |
| `rules[].severity` | `"error"` \| `"warn"` | No | Default `error`. `error` exits `1`; `warn` informs without breaking the build. |
| `rules[].match.patterns` | `string[]` | **Yes (pattern)** | Substrings / tokens that trigger violations. |
| `rules[].match.paths` | `string[]` | No | Globs specifying which file paths are subject to enforcement. |
| `rules[].match.exclude` | `string[]` | No | Globs specifying paths exempt from this rule. |
| `rules[].semgrep` | `object` | **Yes (semgrep)** | Native Semgrep rule definition object (`pattern`, `pattern-either`, `languages`). |

---

## 🧠 Supported AI Explainer Providers

When `--explain` is enabled (or running via PR comment bot), ArchSentry derives remediation hints using whichever provider key is detected in the environment:

| Provider | Environment Variable | Default Model | Notes |
| :--- | :--- | :--- | :--- |
| **OpenRouter** | `OPENROUTER_API_KEY` | `nvidia/nemotron-3-ultra-550b-a55b:free` | **100% Free Tiers Available** (no card required) |
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o-mini` | High-speed, commercial grade |
| **Ollama** | `OLLAMA_MODEL` | Set by env (e.g. `llama3`) | **100% Local & Air-gapped** (`localhost:11434`) |
| **Offline Fallback** | *(None)* | Built-in Template Engine | **Zero-cost, zero-network deterministic hints** |

---

## 🛠️ Development & Testing

```bash
# Clone the repository
git clone https://github.com/comerade2134/archsentry.git
cd archsentry

# Install dependencies
pnpm install

# Run unit & integration test suites
pnpm test

# Typecheck and build standalone binary
pnpm typecheck
pnpm run build
```

---

## 📄 License

MIT © [comerade2134](https://github.com/comerade2134)
