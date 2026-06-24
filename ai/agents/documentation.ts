import { AIClient } from "../ai-client";

export interface DocumentationRequest {
  target: "readme" | "comments" | "api-docs" | "architecture";
  files: string[];
  audience: "internal" | "external" | "education";
  language: "ro" | "en";
}

export class DocumentationAgent {
  constructor(private readonly ai = new AIClient()) {}

  async generate(request: DocumentationRequest): Promise<string> {
    const response = await this.ai.complete({
      capability: "documentation",
      intent: "documentation",
      system: "Esti Caval Documentation. Genereaza documentatie clara, mentenabila si potrivita audientei.",
      prompt: `Generate ${request.target} documentation in ${request.language}.`,
      context: { ...request }
    });

    return response.content;
  }

  generateReadme(files: string[], language: "ro" | "en" = "ro"): Promise<string> {
    return this.generate({
      target: "readme",
      files,
      audience: "external",
      language
    });
  }

  generateComments(files: string[], language: "ro" | "en" = "en"): Promise<string> {
    return this.generate({
      target: "comments",
      files,
      audience: "internal",
      language
    });
  }
}
