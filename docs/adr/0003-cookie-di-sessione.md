# ADR 0003 — Nome del cookie di sessione

- **Stato:** accettata (fase 4, 3 novembre 2026)
- **Contesto:** la fase 1 indicava un cookie `__Host-`. Better Auth 1.7 antepone sempre `__Secure-` al nome dei cookie quando la connessione è HTTPS e non supporta il prefisso `__Host-`.
- **Decisione:** il cookie è `__Secure-domusafe.session_token` in produzione (`domusafe.session_token` in sviluppo su HTTP), con `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` e senza `Domain`: in pratica le stesse garanzie di `__Host-` (il browser non lo condivide con sottodomini e lo invia solo su HTTPS). La fase 3 riporta il nome aggiornato.
- **Conseguenze:** nessuna configurazione `crossSubDomainCookies`; gli host white-label ricevono un proprio cookie per host.
