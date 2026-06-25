import type { PreloadContext } from "./model-types";

const TS_EXT = new Set(["ts", "tsx", "js", "jsx"]);
const MOBILE_MARKERS = ["react-native", "expo", "flutter", "android", "ios"];
const BACKEND_MARKERS = ["express", "fastify", "nestjs", "django", "fastapi", "spring"];

/** Infer preload context from project root and sample file paths. */
export function inferPreloadContext(
  workspaceRoot: string,
  filePaths: string[] = []
): PreloadContext {
  const rootLower = workspaceRoot.toLowerCase();
  const extensions = filePaths
    .map((f) => f.split(".").pop()?.toLowerCase())
    .filter((e): e is string => Boolean(e));

  const lang =
    extensions.find((e) => TS_EXT.has(e)) ??
    extensions[0] ??
    "ts";

  let projectType = "general";

  const joined = `${rootLower} ${filePaths.join(" ").toLowerCase()}`;

  if (MOBILE_MARKERS.some((m) => joined.includes(m))) {
    projectType = "mobile";
  } else if (BACKEND_MARKERS.some((m) => joined.includes(m)) || joined.includes("server")) {
    projectType = "backend";
  } else if (joined.includes("frontend") || joined.includes("renderer") || joined.includes(".tsx")) {
    projectType = "frontend";
  }

  return { language: lang, projectType };
}
