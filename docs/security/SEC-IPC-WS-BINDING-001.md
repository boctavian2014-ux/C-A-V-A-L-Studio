# Remediation backlog — Workspace binding IPC security

## OPEN: `caval:workspace-open` / `caval:workspace-sync` bind without sender trust

| Field | Value |
|-------|--------|
| **ID** | SEC-IPC-WS-BINDING-001 |
| **Severitate** | **Critic** |
| **Status** | **Deschis** (nu blochează merge-ul Project Health) |
| **Componente afectate** | `caval:workspace-open`, `caval:workspace-sync` (`src/main/electron-main.ts`) |
| **Risc** | Aceste canale populează `getBoundWorkspaceRoot` prin `bindWorkspace(event.sender.id, folderPath)` **fără** `assertTrustedSender`. Un sender IPC netrusted poate lega un `folderPath` arbitrar pe `senderId`. Orice feature care tratează root-ul legat ca „de încredere” (inclusiv **Project Health**, verify, tool runners, indexare context) **moștenește** acest risc: controalele downstream pe bound root nu protejează dacă binding-ul însuși e compromis. |
| **Remediere propusă** | 1) `assertTrustedSender(event)` pe **ambele** handlere. 2) Validează că `folderPath` e string non-gol, există pe disc și e accesibil (directory) **înainte** de `bindWorkspace`. 3) Opțional: `normalizeWorkspaceRoot` + respingere path-uri invalide / non-directory. |
| **Motiv non-blocking pe PH** | Project Health folosește corect bound root + trust pe canalul propriu; remedierea binding-ului e hardening de infrastructură IPC, cu impact pe open-folder / sync-on-chat și necesită teste de regresie separate. Project Health nu introduce vulnerabilitatea — o moștenește de la canale preexistente; a bloca merge-ul PH nu reduce riscul. |
| **Prioritate** | **Următorul sprint / următoarea sesiune de remediere de securitate** |
| **Blochează** | Orice feature viitor care citește `getBoundWorkspaceRoot` pentru acțiuni sensibile (execute de comenzi, git, terminal, CAD, save-file) — până la închiderea acestui ticket, astfel de feature-uri trebuie să documenteze explicit dependența de SEC-IPC-WS-BINDING-001 sau să aștepte remedierea |
| **Criteriu de închidere** | 1) `assertTrustedSender` adăugat pe `caval:workspace-open` și `caval:workspace-sync`. 2) Validare că `folderPath` există și e accesibil înainte de `bindWorkspace`. 3) Test de regresie care simulează sender netrusted pe **ambele** canale (IPC respinge, fără bind). |
| **Dependențe** | Orice feature care citește `getBoundWorkspaceRoot` / `workspaceRoots` |
| **Owner** | Main IPC / security follow-up |
| **Related** | SEC-IPC-WS-VERIFY-001 (Mare) — verify acceptă încă `workspaceRoot` din renderer |
