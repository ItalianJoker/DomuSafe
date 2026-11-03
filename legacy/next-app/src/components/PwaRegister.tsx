'use client';

/**
 * Registra il service worker lean (shell offline / installabile).
 * Nessun dato Famiglia in cache: solo asset e pagina di base.
 */

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'development') return;

    const onLoad = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* Installazione SW non critica: l’app resta usabile online. */
      });
    };

    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });

    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
