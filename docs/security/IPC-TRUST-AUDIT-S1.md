# IPC Trust Audit S1 (Pasul 3) — read-only

**Date:** Aug 2026  
**Scope:** read-only inventory of IPC handlers — no remediations applied.

## Scale Critic / Mare / Medie / Scăzut

Severity scale from `AUDIT-CAVALLO-COMPLET.md`: **Critic** / **Mare** / **Medie** / **Scăzut**.

`assertTrustedSender`: **yes** if called directly or via a wrapper that always calls it (`cad-handlers`, `git-handlers`, `robotics-library-handlers`).

Paths below are under `src/main/`.

### Full table (severity DESC)

| Canal | Fișier:linie | assertTrustedSender | Parametru periculos | Acțiune | Severitate |
|-------|--------------|---------------------|---------------------|---------|------------|
| terminal:create | `src/main/terminal-handlers.ts:23` | yes | `options.cwd` (unbound) | spawn PTY / shell | Critic |
| terminal:write | `src/main/terminal-handlers.ts:53` | yes | — (writes to existing PTY) | command input to shell | Critic |
| caval:terminal-write | `src/main/electron-main.ts:845` | yes | — | stdin to shell process | Critic |
| caval:sandbox-run | `src/main/electron-main.ts:1068` | **no** | tool `input` | tool sandbox exec | Critic |
| caval:tool-replay | `src/main/electron-main.ts:1015` | **no** | tool `input` | tool sandbox exec | Critic |
| caval:tool-execute | `src/main/mcp-handlers.ts:44` | **no** | `arguments` (may include paths) | tool/MCP execute (incl. write_file) | Critic |
| caval:apply-fix-rerun | `src/main/electron-main.ts:1097` | **no** | `commands[]` | shell fix command | Critic |
| caval:mobile-build-fix | `src/main/electron-main.ts:1153` | **no** | `command` | shell fix command | Critic |
| debug:launch | `src/main/debug-handlers.ts:43` | **no** | `cwd` / `program` (workspace-asserted) | spawn Node inspect | Critic |
| git:commit | `src/main/git-handlers.ts:387` | yes | `projectPath` (unbound) | git commit | Mare |
| git:push | `src/main/git-handlers.ts:404` | yes | `projectPath` | git push | Mare |
| git:pull | `src/main/git-handlers.ts:418` | yes | `projectPath` | git pull | Mare |
| git:discard | `src/main/git-handlers.ts:373` | yes | `projectPath` | git restore (destructive) | Mare |
| git:revertHunk | `src/main/git-handlers.ts:286` | yes | `projectPath` | file write | Mare |
| git:checkout | `src/main/git-handlers.ts:452` | yes | `projectPath` | git checkout | Mare |
| git:createBranch | `src/main/git-handlers.ts:466` | yes | `projectPath` | git branch | Mare |
| git:init | `src/main/git-handlers.ts:480` | yes | `projectPath` | git init | Mare |
| git:stage | `src/main/git-handlers.ts:310` | yes | `projectPath` | git add | Mare |
| git:unstage | `src/main/git-handlers.ts:325` | yes | `projectPath` | git restore --staged | Mare |
| git:stageAll | `src/main/git-handlers.ts:346` | yes | `projectPath` | git add -A | Mare |
| git:unstageAll | `src/main/git-handlers.ts:359` | yes | `projectPath` | git reset | Mare |
| git:stash | `src/main/git-handlers.ts:493` | yes | `projectPath` | git stash | Mare |
| git:stashPop | `src/main/git-handlers.ts:507` | yes | `projectPath` | git stash pop | Mare |
| git:clone | `src/main/git-handlers.ts:520` | yes | `url`, `parentDir` | git clone + FS | Mare |
| git:status | `src/main/git-handlers.ts:174` | yes | `projectPath` | git status (exec) | Mare |
| git:diff | `src/main/git-handlers.ts:221` | yes | `projectPath` | git diff (exec) | Mare |
| git:filePair | `src/main/git-handlers.ts:247` | yes | `projectPath` | git show + readFile | Mare |
| git:log | `src/main/git-handlers.ts:432` | yes | `projectPath` | git log | Mare |
| git:branches | `src/main/git-handlers.ts:443` | yes | `projectPath` | git branch | Mare |
| cad:downloadStl | `src/main/cad-handlers.ts:524` | yes | `url` (no allowlist) | external fetch + file write | Mare |
| cad:fetchStl | `src/main/cad-handlers.ts:593` | yes | `url` (no allowlist) | external fetch (SSRF) | Mare |
| cad:createJob | `src/main/cad-handlers.ts:394` | yes | — | external fetch + secrets in body | Mare |
| cad:plan | `src/main/cad-handlers.ts:299` | yes | — | external fetch + secrets in body | Mare |
| roboticsLibrary:saveStlToProject | `src/main/robotics-library-handlers.ts:47` | yes | `projectPath` (unbound) | file write | Mare |
| roboticsLibrary:exportZip | `src/main/robotics-library-handlers.ts:71` | yes | `projectPath` (optional unbound) | file write | Mare |
| engineering:saveFile | `src/main/engineering-handlers.ts:111` | **no** | `projectPath` (workspace-bound) | file write | Mare |
| engineering:saveAll | `src/main/engineering-handlers.ts:133` | **no** | `projectPath` (workspace-bound) | file write | Mare |
| fs:writeFile | `src/main/ipc-handlers.ts:101` | yes (via `trustedWorkspacePath`) | `filePath` | file write | Mare |
| fs:createFile | `src/main/ipc-handlers.ts:118` | yes | `filePath` | file write | Mare |
| fs:createDir | `src/main/ipc-handlers.ts:131` | yes | `dirPath` | mkdir | Mare |
| fs:rename | `src/main/ipc-handlers.ts:144` | yes | `oldPath`/`newPath` | rename | Mare |
| fs:delete | `src/main/ipc-handlers.ts:158` | yes | `targetPath` | delete | Mare |
| caval:save-file | `src/main/electron-main.ts:584` | yes | `path` (workspace-bound unless saveAs) | file write | Mare |
| caval:workspace-verify | `src/main/model-handlers.ts:937` | **no** | `workspaceRoot` (unbound) | verify / autoInstall | Mare |
| caval:ai-chat-stream | `src/main/model-handlers.ts:1028` | **no** | `workspaceRoot` in request | AI + tools/network | Mare |
| caval:pipeline-resume | `src/main/model-handlers.ts:1045` | **no** | `workspaceRoot` | AI pipeline resume | Mare |
| caval:composer-run | `src/main/electron-main.ts:865` | **no** | — (uses bound workspace) | composer write/build/test | Mare |
| caval:review-apply | `src/main/electron-main.ts:967` | **no** | — | apply patches | Mare |
| caval:suggestions-proceed | `src/main/electron-main.ts:914` | **no** | — | composer proceed | Mare |
| caval:agent-execute-step | `src/main/electron-main.ts:1039` | **no** | — | agent step (tools) | Mare |
| caval:agent-create-plan | `src/main/electron-main.ts:1029` | **no** | — | agent plan | Mare |
| caval:mcp-start | `src/main/mcp-handlers.ts:31` | **no** | — | spawn MCP server | Mare |
| caval:mcp-ensure | `src/main/mcp-handlers.ts:13` | **no** | — | start MCP servers | Mare |
| extensions:install | `src/main/extension-handlers.ts:80` | **no** | `baseUrl` | remote fetch + write under workspace | Mare |
| openvsx:install | `src/main/extension-handlers.ts:155` | **no** | — | remote VSIX download + extract | Mare |
| schematic:generateCode | `src/main/schematic-handlers.ts:59` | **no** | `workspaceRoot` | AI + patch pipeline | Mare |
| schematic:submitPatches | `src/main/schematic-handlers.ts:114` | **no** | `workspaceRoot` | patch apply pipeline | Mare |
| schematic:generateFromCode | `src/main/schematic-handlers.ts:46` | **no** | `workspaceRoot` | AI / FS read | Mare |
| lsp:start | `src/main/lsp-handlers.ts:39` | **no** | — (cwd = bound root) | spawn language server | Mare |
| caval:mobile-build-start | `src/main/electron-main.ts:1130` | **no** | — | spawn build | Mare |
| caval:secrets-set | `src/main/electron-main.ts:1530` | yes | secrets map | secrets write | Mare |
| cad:cancelJob | `src/main/cad-handlers.ts:481` | yes | — | external DELETE | Medie |
| cad:getJob | `src/main/cad-handlers.ts:459` | yes | — | external GET | Medie |
| cad:getJobLogs | `src/main/cad-handlers.ts:504` | yes | — | external GET | Medie |
| cad:saveStlBase64 | `src/main/cad-handlers.ts:559` | yes | — (dialog path) | file write (user-picked) | Medie |
| cad:downloadScad | `src/main/cad-handlers.ts:621` | yes | — (dialog path) | file write (user-picked) | Medie |
| cad:health | `src/main/cad-handlers.ts:369` | yes | — | external fetch | Medie |
| cad:installOpenScad | `src/main/cad-handlers.ts:650` | yes | — | local install attempt | Medie |
| cad:isCloudOnly | `src/main/cad-handlers.ts:252` | yes | — | config read | Scăzut |
| engineering:exportCart | `src/main/engineering-handlers.ts:158` | yes | `projectPath` (bound if set) | file write | Medie |
| engineering:openExternal | `src/main/engineering-handlers.ts:198` | yes | `url` | openExternal (+ confirm) | Medie |
| fs:readFile | `src/main/ipc-handlers.ts:86` | yes | `filePath` | file read | Medie |
| fs:readTree | `src/main/ipc-handlers.ts:80` | yes | `dirPath` | FS tree read | Medie |
| fs:reveal | `src/main/ipc-handlers.ts:171` | yes | `filePath` | shell reveal | Medie |
| fs:pickFiles | `src/main/ipc-handlers.ts:36` | yes | — | dialog | Scăzut |
| fs:openFolder | `src/main/ipc-handlers.ts:69` | yes | — | dialog | Scăzut |
| caval:terminal-start | `src/main/electron-main.ts:815` | yes | — (cwd = bound workspace) | spawn shell | Medie |
| caval:terminal-stop | `src/main/electron-main.ts:855` | yes | — | kill process | Medie |
| terminal:destroy | `src/main/terminal-handlers.ts:72` | yes | — | kill PTY | Medie |
| terminal:resize | `src/main/terminal-handlers.ts:61` | yes | — | PTY resize | Scăzut |
| terminal:ensurePowerShell | `src/main/terminal-handlers.ts:82` | yes | — | winget/install PS | Medie |
| caval:workspace-open | `src/main/electron-main.ts:1177` | **no** | `folderPath` | bind workspace | Medie |
| caval:workspace-sync | `src/main/electron-main.ts:1217` | **no** | `folderPath` | rebind workspace | Medie |
| caval:workspace-bootstrap | `src/main/model-handlers.ts:927` | **no** | `workspaceRoot` | FS/bootstrap read | Medie |
| multiagent:reasoning-config | `src/main/model-handlers.ts:932` | **no** | `workspaceRoot` | config read | Medie |
| caval:pipeline-recent-completion | `src/main/model-handlers.ts:1023` | **no** | `workspaceRoot` | FS read completion | Medie |
| caval:project-health-check | `src/main/model-handlers.ts:957` | yes | — (bound root) | health / optional execute | Medie |
| caval:ai-complete | `src/main/model-handlers.ts:1065` | yes | `workspaceRoot` | AI complete (+ tools) | Medie |
| caval:ai-chat | `src/main/electron-main.ts:732` | yes | — | AI / cloud / ollama | Medie |
| caval:ai-stream-abort | `src/main/model-handlers.ts:1034` | **no** | — | abort stream | Scăzut |
| caval:workspace-session-reset | `src/main/model-handlers.ts:1039` | **no** | — | abort streams | Scăzut |
| caval:mcp-list | `src/main/mcp-handlers.ts:23` | **no** | — | list MCP | Medie |
| caval:mcp-stop | `src/main/mcp-handlers.ts:38` | **no** | — | stop MCP | Medie |
| caval:autocomplete | `src/main/mcp-handlers.ts:54` | **no** | `filePath` | AI complete | Medie |
| caval:search-text | `src/main/search-handlers.ts:134` | **no** | `workspaceRoot` (fallback) | ripgrep | Medie |
| caval:symbol-index | `src/main/search-handlers.ts:166` | **no** | `workspaceRoot` | index FS | Medie |
| caval:goto-definition | `src/main/search-handlers.ts:179` | **no** | `workspaceRoot` | symbol lookup | Medie |
| caval:find-references | `src/main/search-handlers.ts:197` | **no** | `workspaceRoot` | symbol/text search | Medie |
| caval:context-index | `src/main/electron-main.ts:1171` | **no** | — | index workspace | Medie |
| caval:context-search | `src/main/electron-main.ts:1224` | **no** | — | search index | Medie |
| caval:agent-save-audit | `src/main/electron-main.ts:1054` | **no** | — | write audit JSON | Medie |
| caval:review-action | `src/main/electron-main.ts:936` | **no** | — | review state / revise | Medie |
| caval:suggestions-approve | `src/main/electron-main.ts:910` | **no** | — | session approve | Scăzut |
| caval:logicflow-explain-node | `src/main/electron-main.ts:984` | **no** | `workspaceRoot` in context | AI explain | Medie |
| caval:debug-suggest-fix | `src/main/electron-main.ts:994` | **no** | — | AI suggest commands | Medie |
| caval:agent-abort | `src/main/electron-main.ts:1049` | **no** | — | abort agent | Scăzut |
| caval:mobile-build-cancel | `src/main/electron-main.ts:1148` | **no** | — | cancel build | Scăzut |
| caval:zl-prepare | `src/main/zl-handlers.ts:39` | **no** | `signals.workspaceRoot` | ZL prepare | Medie |
| caval:chat-prepare | `src/main/zl-handlers.ts:45` | **no** | `workspaceRoot` | ZL + model warm | Medie |
| caval:zl-panel-open | `src/main/zl-handlers.ts:122` | **no** | `workspaceRoot` | ZL panel | Medie |
| caval:zl-snapshot | `src/main/zl-handlers.ts:131` | **no** | `workspaceRoot` | ZL snapshot | Medie |
| caval:zl-complete-chat | `src/main/zl-handlers.ts:142` | **no** | `workspaceRoot` | ZL complete | Medie |
| caval:zl-cancel | `src/main/zl-handlers.ts:116` | **no** | — | cancel token | Scăzut |
| caval:preload-notify | `src/main/preload-handlers.ts:37` | **no** | — | preload actions | Medie |
| caval:preload-warm | `src/main/preload-handlers.ts:25` | **no** | — | warm model | Medie |
| caval:preload-status | `src/main/preload-handlers.ts:21` | **no** | — | status | Scăzut |
| caval:preload-invalidate | `src/main/preload-handlers.ts:30` | **no** | — | invalidate cache | Scăzut |
| caval:preload-subscribe | `src/main/preload-handlers.ts:75` | **no** (`on`) | — | event subscribe | Scăzut |
| caval:preload-unsubscribe | `src/main/preload-handlers.ts:80` | **no** (`on`) | — | unsubscribe | Scăzut |
| caval:renderer-ready | `src/main/electron-main.ts:625` | **no** (`on`) | — | push workspace | Scăzut |
| roboticsLibrary:ensureCached | `src/main/robotics-library-handlers.ts:36` | yes | `relPath` | CDN fetch + cache | Medie |
| roboticsLibrary:resolve | `src/main/robotics-library-handlers.ts:41` | yes | — | CDN resolve | Medie |
| roboticsLibrary:getCatalog | `src/main/robotics-library-handlers.ts:34` | yes | — | CDN catalog | Medie |
| roboticsLibrary:cdnBase | `src/main/robotics-library-handlers.ts:29` | yes | — | config | Scăzut |
| extensions:list | `src/main/extension-handlers.ts:67` | **no** | — | list + disk load | Medie |
| extensions:register | `src/main/extension-handlers.ts:73` | **no** | — | register manifest | Medie |
| openvsx:search | `src/main/extension-handlers.ts:134` | **no** | — | remote search | Medie |
| openvsx:popular | `src/main/extension-handlers.ts:144` | **no** | — | remote list | Medie |
| marketplace:health | `src/main/marketplace-handlers.ts:20` | **no** | — | local marketplace fetch | Scăzut |
| marketplace:search | `src/main/marketplace-handlers.ts:36` | **no** | — | local marketplace fetch | Scăzut |
| marketplace:autocomplete | `src/main/marketplace-handlers.ts:47` | **no** | — | local marketplace fetch | Scăzut |
| marketplace:categories | `src/main/marketplace-handlers.ts:56` | **no** | — | local marketplace fetch | Scăzut |
| schematic:explain | `src/main/schematic-handlers.ts:88` | **no** | — | AI explain | Medie |
| schematic:analyze | `src/main/schematic-handlers.ts:93` | **no** | — | analyze graph | Scăzut |
| schematic:autoLayout | `src/main/schematic-handlers.ts:98` | **no** | — | layout | Scăzut |
| schematic:computeDelta | `src/main/schematic-handlers.ts:104` | **no** | — | pure compute | Scăzut |
| debug:stop | `src/main/debug-handlers.ts:112` | **no** | — | kill debug session | Medie |
| debug:list | `src/main/debug-handlers.ts:120` | **no** | — | list sessions | Scăzut |
| debug:launch-config | `src/main/debug-handlers.ts:127` | **no** | — | read launch.json | Medie |
| lsp:stop | `src/main/lsp-handlers.ts:85` | **no** | — | kill LSP | Medie |
| lsp:status | `src/main/lsp-handlers.ts:94` | **no** | — | status | Scăzut |
| lsp:resolve-definition | `src/main/lsp-handlers.ts:107` | **no** | `filePath` | stub resolve | Scăzut |
| caval:models-list | `src/main/model-handlers.ts:985` | **no** | — | catalog | Scăzut |
| caval:models-refresh | `src/main/model-handlers.ts:995` | **no** | — | catalog refresh (network) | Medie |
| caval:models-health | `src/main/model-handlers.ts:1007` | **no** | — | health probe | Medie |
| caval:resolve-model | `src/main/model-handlers.ts:1093` | **no** | — | model resolve | Scăzut |
| workspace:list-recent | `src/main/electron-main.ts:1192` | yes | — | list recent | Scăzut |
| workspace:createOnDesktop | `src/main/electron-main.ts:1197` | yes | `name` | create dir on Desktop | Medie |
| workspace:remove-recent | `src/main/electron-main.ts:1208` | yes | `folderPath` | list mutate | Scăzut |
| caval:settings-save | `src/main/electron-main.ts:1368` | yes | settings (keys rejected) | persist settings | Medie |
| caval:settings-load | `src/main/electron-main.ts:1409` | **no** | — | load settings + configured flags | Medie |
| caval:secrets-get | `src/main/electron-main.ts:1512` | yes | — | secrets metadata (not plaintext) | Medie |
| caval:billing-user-id | `src/main/electron-main.ts:1448` | **no** | — | read user id | Scăzut |
| caval:billing-entitlements | `src/main/electron-main.ts:1453` | **no** | — | billing fetch (server key) | Medie |
| caval:billing-checkout | `src/main/electron-main.ts:1477` | **no** | `email` | billing + openExternal | Medie |
| window:minimize | `src/main/ipc-handlers.ts:181` | **no** | — | window | Scăzut |
| window:maximize | `src/main/ipc-handlers.ts:185` | **no** | — | window | Scăzut |
| window:close | `src/main/ipc-handlers.ts:195` | **no** | — | window | Scăzut |

**Count:** 144 channels (handles + `on` listeners listed).

## Loturi de remediere A–D

Grouping only — no code solutions.

### Lot A — filesystem

`caval:save-file`, `engineering:saveFile`, `engineering:saveAll`, `engineering:exportCart`, `fs:writeFile` / `createFile` / `createDir` / `rename` / `delete` / `readFile` / `readTree` / `reveal`, `roboticsLibrary:saveStlToProject`, `roboticsLibrary:exportZip`, `cad:saveStlBase64`, `cad:downloadScad`, `cad:downloadStl` (write half), `caval:agent-save-audit`, `extensions:install`, `openvsx:install`.

**Lot A residual risk (symlink/junction):** `resolveSandboxedWorkspacePath` uses realpath to block escapes through links that point outside the workspace. Live link coverage in `tests/security/lot-a-filesystem-ipc.test.ts` follows two policies only:

- **Policy A:** Platform supports symlink/junction; creation fails for a reason *other than* insufficient privileges → test **fails** (never skip).
- **Policy B:** Insufficient privileges (typical Windows without admin/Developer Mode) → test **may skip** the live-link assertion, but **must** emit  
  `[COVERAGE-GAP] symlink/junction test skipped: insufficient privileges`  
  via `console.error` (never silent `catch { return }`). Simulated `..` escape is still asserted.

**CI treatment:** Prefer runners that can create junctions/symlinks so Policy B does not fire. If Policy B appears in logs, treat it as a **visible coverage-gap warning** (search logs for `[COVERAGE-GAP]`), not as full symlink-escape proof. Policy A failures must fail the job. Silent skip is rejected.

### Lot B — command execution

`terminal:create` / `write` / `destroy` / `ensurePowerShell`, `caval:terminal-start` / `write` / `stop`, all `git:*`, `debug:launch` / `stop`, `lsp:start` / `stop`, `caval:sandbox-run`, `caval:tool-replay`, `caval:tool-execute`, `caval:apply-fix-rerun`, `caval:mobile-build-start` / `fix` / `cancel`, `caval:mcp-start` / `ensure` / `stop`, `caval:workspace-verify`, `caval:composer-run` / agent / review apply paths that shell out.

### Lot C — network

`cad:plan` / `createJob` / `getJob` / `cancelJob` / `getJobLogs` / `health` / `downloadStl` / `fetchStl`, `roboticsLibrary:ensureCached` / catalog / resolve, `openvsx:*`, `extensions:install`, `marketplace:*`, `caval:billing-*`, `caval:models-refresh` / `models-health`, `caval:ai-chat` / `ai-chat-stream` / `ai-complete` / `pipeline-resume`, `engineering:openExternal`.

### Lot D — rest

Window controls, preload subscribe/status, ZL cancel/snapshot (non-exec), schematic analyze/autoLayout/computeDelta, models-list/resolve-model, workspace list/remove-recent, renderer-ready, suggestions-approve, agent-abort, settings-load flags, cad:isCloudOnly.

## Pattern-uri bune (fs:*, save-file, project-health-check)

- **`fs:*` path ops** — `trustedWorkspacePath` → `assertTrustedSender` + `requireWorkspacePath` (`ipc-handlers.ts:30–33`, used by read/write/delete/…).
- **`caval:save-file`** — assert + `assertPathInWorkspace` when not save-as (`electron-main.ts:584–601`).
- **`caval:project-health-check`** — assert + **bound** workspace only (`model-handlers.ts:957–971`).
- **`caval:ai-complete`** — assert; strips renderer `apiKeys`; uses workspace (`:1065–1085`).
- **`engineering:exportCart` / `openExternal`** — assert; projectPath checked with `assertProjectPath` / URL confirm (`engineering-handlers.ts:158–221`).
- **CAD / git / roboticsLibrary wrappers** — always call `assertTrustedSender`, but **git `projectPath` / terminal `cwd` / robotics `projectPath` / CAD `url` still lack workspace/URL binding** (trust alone ≠ safe).

## Note vs AUDIT-CAVALLO-COMPLET.md

`AUDIT-CAVALLO-COMPLET.md` S1/D4 claimed CAD/git/terminal had zero `assertTrustedSender`. Current code **does** wrap those with assert; residual risk is mainly **unbound `projectPath` / `cwd` / `url`** and many **electron-main / model / MCP** handlers still without assert.
