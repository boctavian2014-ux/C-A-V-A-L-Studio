# Arhitectura Caval Studio

Caval Studio este organizat in 6 straturi independente, inspirate de robustetea VS Code, ergonomia Cursor si fluxurile agentice moderne.

## 1. Core Editor Layer

Responsabil pentru shell Electron, workbench, editor services, file explorer, command palette, settings, keybindings si baza de extension host. Pe termen lung, acest strat se conecteaza la fork-ul VS Code si pastreaza compatibilitatea cu API-urile stabile.

## 2. AI Layer

Include chat, composer, agenti, model router si provideri frontier. Routerul selecteaza modele dupa capabilitati: chat, code, reasoning, planning si patching.

## 3. Context Engine

Scaneaza proiectul, genereaza chunks, produce embeddings, mentine cache local, construieste vector DB si dependency graph. Expune API pentru AI Layer.

## 4. Extensions Layer

Ruleaza extensii Caval native si extensii VS Code compatibile. Include validare de manifest, extension host si integrare cu Marketplace.

## 5. Cloud Services Layer

Gestioneaza conturi, sync, telemetry si viitoare servicii remote pentru AI/context. Telemetria trebuie sa fie privacy-first si configurabila.

## 6. Romania Layer

Adauga localizare RO, fluxuri ANAF, eFactura, ONRC si Education Mode. Acest strat transforma IDE-ul intr-un produs local util pentru firme, contabili tehnici, studenti si startup-uri romanesti.
