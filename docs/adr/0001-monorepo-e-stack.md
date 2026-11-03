# ADR 0001 — Monorepo TypeScript e stack della Suite

- **Stato:** accettata (fase 1, 3 novembre 2026)
- **Contesto:** il prompt master chiede una ricostruzione da zero con stack moderno, tipizzato, REST con OpenAPI, database relazionale e storage S3.
- **Decisione:** monorepo pnpm 12 + Turborepo con Node.js 26, TypeScript 6.0, Fastify 5 + Zod 4 (contratto unico per validazione, tipi e OpenAPI 3.1), PostgreSQL 18 con Row-Level Security, Drizzle ORM 0.45, Better Auth 1.7, Valkey 9, cifratura client con Web Crypto e Argon2id. Dettaglio e alternative scartate in [fase 1](../design/phase-1-stack-architecture.md).
- **Conseguenze:** l'applicazione Next.js precedente passa in `legacy/next-app/` e resta disponibile finché la Suite non ne raggiunge le funzioni; il flusso di pubblicazione GHCR costruisce quella cartella.
