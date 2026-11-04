/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// App shell only. API responses are not precached: the server stays the source of truth.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
