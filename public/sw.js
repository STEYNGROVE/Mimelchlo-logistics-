'use strict';

const cacheName = 'mimelchlo-public-v6';
const shell = ['/', '/af/', '/af/locale.js', '/style.css', '/brand.webp', '/crest-520.webp', '/crest-760.webp', '/quote.js', '/experience.js', '/enquiry.js', '/providers.js', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mimelchlo-public-') && key !== cacheName).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !shell.includes(url.pathname) || url.search) return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(request)) || Response.error();
  }));
});
