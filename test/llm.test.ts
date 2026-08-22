import { describe, it, expect, vi } from "vitest";
import { OpenAIExplainer, OllamaExplainer, TemplateExplainer, selectExplainer } from "../src/explain/llm";
import type { Violation } from "../src/engine/types";

const mockViolation: Violation = {
  ruleId: "no-direct-sql",
  severity: "error",
  file: "src/controllers/user.ts",
  line: 10,
  snippet: 'db.query("INSERT INTO users");',
  message: "All database writes must go through repository layer.",
};

describe("LLM Explainers & Resilience", () => {
  it("TemplateExplainer returns deterministic explanation without network call", async () => {
    const explainer = new TemplateExplainer();
    const res = await explainer.explain(mockViolation);
    expect(res).toContain("All database writes must go through repository layer.");
    expect(res).toContain("src/controllers/user.ts");
  });

  it("OpenAIExplainer handles API error response gracefully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const explainer = new OpenAIExplainer("invalid-key");
    await expect(explainer.explain(mockViolation, mockViolation.snippet)).rejects.toThrow(
      /LLM HTTP 401/,
    );
  });

  it("OpenAIExplainer handles network fetch failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network connection failed"));

    const explainer = new OpenAIExplainer("key");
    await expect(explainer.explain(mockViolation, mockViolation.snippet)).rejects.toThrow(
      /Network connection failed/,
    );
  });

  it("OllamaExplainer handles offline service gracefully", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:11434"));

    const explainer = new OllamaExplainer("llama3");
    await expect(explainer.explain(mockViolation, mockViolation.snippet)).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });

  it("selectExplainer defaults to TemplateExplainer when no env vars are set", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("OLLAMA_MODEL", "");

    const explainer = selectExplainer();
    expect(explainer).toBeInstanceOf(TemplateExplainer);
  });
});
