/** Internal IPC channel names (main ↔ preload). Not exposed to renderer directly. */
export const GIT_CHANNELS = {
  status: "git:status",
  stage: "git:stage",
  unstage: "git:unstage",
  commit: "git:commit",
  branches: "git:branches",
  checkout: "git:checkout",
  diff: "git:diff",
  log: "git:log",
  filePair: "git:filePair",
  revertHunk: "git:revertHunk",
  stageAll: "git:stageAll",
  unstageAll: "git:unstageAll",
  discard: "git:discard",
  push: "git:push",
  pull: "git:pull",
  createBranch: "git:createBranch",
  init: "git:init",
  stash: "git:stash",
  stashPop: "git:stashPop",
  clone: "git:clone",
} as const;

export type GitIpcChannel = (typeof GIT_CHANNELS)[keyof typeof GIT_CHANNELS];
