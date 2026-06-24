export interface CavalAIExtensionContribution {
  commands: string[];
  views: string[];
  contextKeys: string[];
}

export const cavalAIExtensionContribution: CavalAIExtensionContribution = {
  commands: ["caval.ai.chat", "caval.ai.compose", "caval.ai.refactor", "caval.context.search"],
  views: ["caval-ai-chat", "caval-composer", "caval-context"],
  contextKeys: ["caval.ai.enabled", "caval.context.indexReady"]
};
