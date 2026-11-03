# ADR 0004 — Test di integrazione su un PostgreSQL 18 condiviso

- **Stato:** accettata (fase 4, 3 novembre 2026)
- **Contesto:** la fase 1 indicava Testcontainers per avviare PostgreSQL nei test. Non tutti gli ambienti di sviluppo e di esecuzione degli agenti dispongono di Docker; GitHub Actions offre container di servizio nativi.
- **Decisione:** i test di integrazione richiedono `DATABASE_ADMIN_URL` (superutente di un PostgreSQL 18). Una configurazione globale di Vitest crea i ruoli, un database modello migrato e, per ogni file di test, un database clonato dal modello (`CREATE DATABASE … TEMPLATE`), eliminato alla fine. In locale il server arriva da `infra/compose.dev.yml` o da un'installazione nativa; in CI da un servizio `postgres:18.6`.
- **Conseguenze:** nessuna dipendenza da Docker per eseguire i test; ogni file è isolato e i test girano in parallelo; RLS, privilegi e migrazioni sono verificati sullo stesso motore usato in produzione.
