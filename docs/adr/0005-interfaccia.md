# ADR 0005 — Linguaggio visivo e componenti dell'interfaccia

- **Stato:** accettata (3 novembre 2026)
- **Contesto:** la fase 1 aveva scelto React Aria per i componenti. L'interfaccia del prodotto deve invece essere densa, calma e precisa, con il tema scuro progettato come tavolozza di base e i temi chiaro e automatico altrettanto completi. Ogni modulo successivo deve ereditare lo stesso telaio, gli stessi token e lo stesso insieme di componenti.
- **Decisione:** l'interfaccia vive in `apps/web`. I token stanno in `apps/web/src/styles/app.css`. I componenti sono copiati in `apps/web/src/components/ui` secondo il modello shadcn/ui (primitive Radix e Tailwind), senza una libreria di componenti caricata a runtime. La shell (`AppShell`) e l'elenco in `apps/web/src/lib/navigation.ts` sono l'unico menu. I controlli ordinari restano compatti; le azioni di soccorso usano la misura `emergency` (almeno 48 pixel).
- **Conseguenze:** un modulo nuovo non introduce un secondo sistema visivo. React Aria non è il kit del prodotto. Il dettaglio operativo è in [`ARCHITECTURE.md`](../../ARCHITECTURE.md).
