---
layout: null
---
// Service worker: keeps every recipe available without a connection.
// Pages are fetched from the network first (so edits show up), falling back to the
// saved copy when the network is down or too slow. Each build gets a new cache.

const CACHE = 'recetario-{{ site.time | date: "%s" }}';
const NETWORK_TIMEOUT_MS = 3000;

const PRECACHE = [
  '{{ "/" | relative_url }}',
  '{{ "/404.html" | relative_url }}',
  '{{ "/assets/css/style.css" | relative_url }}',
  '{{ "/assets/icons/icon.svg" | relative_url }}',
  {%- assign recipes = site.pages | where: "layout", "libdoc/page-recipe" %}
  {%- for recipe in recipes %}
  '{{ recipe.url | relative_url }}',
  {%- endfor %}
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // no-cache: always revalidate with the server instead of reusing the browser's HTTP cache
    const response = await withTimeout(fetch(request, { cache: 'no-cache' }), NETWORK_TIMEOUT_MS);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const notFound = await cache.match('{{ "/404.html" | relative_url }}');
      if (notFound) return notFound;
    }
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}
