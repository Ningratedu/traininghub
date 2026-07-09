const CACHE_NAME = "traininghub-shell-v1";

// File utama yang di-cache biar app tetap kebuka (shell) walau koneksi lemot.
// Data pesanan/login tetap butuh internet karena pakai Firebase realtime.
const SHELL_FILES = [
  "/traininghub/",
  "/traininghub/index.html",
  "/traininghub/manifest.json"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Jangan cache/intercept request ke Firebase, Firestore, Auth, Storage,
  // atau API eksternal lain — itu semua HARUS selalu fresh dari network.
  const isDynamic =
    url.includes("firestore.googleapis.com") ||
    url.includes("firebaseio.com") ||
    url.includes("googleapis.com") ||
    url.includes("gstatic.com") ||
    url.includes("firebasestorage") ||
    event.request.method !== "GET";

  if (isDynamic) {
    return; // biarkan browser handle langsung ke network, gak lewat SW
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
