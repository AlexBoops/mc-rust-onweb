// sw.js - Service Worker for asset caching & Cross-Origin Isolation
const CACHE = "horizon-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Only intercept GET requests
    if (event.request.method !== "GET") return;

    // Skip dynamic resource directory if required
    if (url.pathname.includes("/fs/res/")) return;

    // Handle cross-origin isolation and caching
    event.respondWith(
        (url.searchParams.has("v") ? hashed(event, url) : fresh(event))
            .then(isolated)
            .catch(() => fetch(event.request))
    );
});

function isolated(response) {
    if (!response || response.status === 0) return response;
    
    // Create cloned headers to inject COOP / COEP
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "credentialless"); // credentialless is safer than require-corp on web CDNs

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

async function hashed(event, url) {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request);
    if (hit) return hit;

    const response = await fetch(event.request);
    if (response.ok) {
        const toCache = response.clone();
        event.waitUntil((async () => {
            await cache.put(event.request, toCache);
            for (const old of await cache.keys()) {
                const at = new URL(old.url);
                if (at.pathname === url.pathname && at.search !== url.search) {
                    await cache.delete(old);
                }
            }
        })());
    }
    return response;
}

async function fresh(event) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(event.request);
        if (response.ok) {
            const toCache = response.clone();
            event.waitUntil(cache.put(event.request, toCache));
        }
        return response;
    } catch (e) {
        const kept = await cache.match(event.request, { ignoreSearch: event.request.mode === "navigate" });
        if (kept) return kept;
        throw e;
    }
}
