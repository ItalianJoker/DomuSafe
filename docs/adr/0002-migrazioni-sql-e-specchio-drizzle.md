# ADR 0002 — Migrazioni SQL scritte a mano e specchio Drizzle

- **Stato:** accettata (fase 4, 3 novembre 2026)
- **Contesto:** la fase 1 prevedeva drizzle-kit 0.31 per le migrazioni. Lo schema della fase 2 richiede policy RLS restrittive, funzioni `security definer`, tabelle partizionate, trigger di vincolo differiti, configurazioni di ricerca testuale e vincoli `unique nulls not distinct`, che drizzle-kit non esprime o esprime solo in parte.
- **Decisione:** lo schema è definito da file SQL in `packages/db/migrations/`, applicati in ordine da `domusafe-db migrate` come `domusafe_owner`, con checksum e lock consultivo. Le definizioni Drizzle in `packages/db/src/schema/` servono solo alle query tipizzate; un test di integrazione verifica che ogni tabella SQL abbia lo specchio Drizzle con le stesse colonne, tipi e obbligatorietà. drizzle-kit non è una dipendenza.
- **Conseguenze:** ogni modifica allo schema è un nuovo file SQL più l'aggiornamento dello specchio; una divergenza fa fallire i test. Il comportamento di sicurezza (RLS, privilegi) è leggibile in un unico posto e testato su PostgreSQL reale.
