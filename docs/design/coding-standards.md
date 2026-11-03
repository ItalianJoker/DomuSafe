# DomuSafe Suite — standard di codice e documentazione

Binding per ogni sessione. Nessuno scostamento senza richiesta esplicita.

## Qualità
- Codice pulito, modulare, fortemente tipizzato. SOLID, DRY, KISS.
- Ottimizzare query, caching e uso risorse. Niente debito: zero placeholder, TODO, stub, librerie inesistenti. Verificare ogni dipendenza prima dell’uso.
- Docstring standard (TSDoc/JSDoc) con scopo, precondizioni, postcondizioni e contratti dati.

## Documentazione dual-target
- Tenere aggiornati `README.md`, `AGENTS.md`, `ARCHITECTURE.md`: schemi chiari per umani e agenti AI.
- README utente in italiano professionale, senza acronimi in etichette; termini inglesi solo se naturali (Watermark, Privacy).

## Workflow (questa ricostruzione)
Quattro fasi, **conferma dell’utente dopo ciascuna** prima di passare alla successiva:
1. Stack e architettura
2. Schema DB e crittografia
3. Contratti API e RBAC
4. Sviluppo modulare e documentazione

Fonte funzionale: [prompt master](master-prompt.md).
