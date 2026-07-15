// 🔥 v2: naikkan versi cache supaya device yang masih pegang service worker
// lama otomatis ke-upgrade ke versi yang sudah dibenerin ini (browser akan
// install SW baru di background lalu dipakai begitu semua tab lama ditutup/
// direfresh, berkat self.clients.claim() di bawah).
const CACHE_NAME = "traininghub-shell-v2";

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
    caches.open(CACHE_NAME).then((cache) =>
      // 🔥 FIX: sebelumnya pakai cache.addAll(), yang artinya kalau SATU AJA
      // dari file di SHELL_FILES gagal di-fetch (mis. lagi offline / koneksi
      // putus di tengah), instalasi service worker GAGAL TOTAL — jadi SW gak
      // pernah aktif dan app kembali ke perilaku "tanpa cache" tiap dibuka
      // (kerasa lemot/berat, kadang kayak ada yang gagal loading). Sekarang
      // tiap file dicoba SATU-SATU dan gagalnya salah satu file gak bikin
      // yang lain ikut gagal.
      Promise.allSettled(
        SHELL_FILES.map((file) =>
          cache.add(file).catch((err) => {
            console.warn("Gagal precache shell file:", file, err);
          })
        )
      )
    )
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

  // Jangan cache/intercept request ke data real-time Firebase (Firestore, Auth,
  // Storage) atau API eksternal lain — itu semua HARUS selalu fresh dari network.
  // 🔥 FIX: "gstatic.com" DIHAPUS dari daftar ini. Sebelumnya semua request ke
  // gstatic.com ikut di-skip dari cache, padahal domain itu juga dipakai buat
  // load file statis SDK Firebase (firebasejs/10.12.2/firebase-*.js) yang
  // isinya gak pernah berubah untuk versi yang sama — jadi selama ini SDK itu
  // didownload ulang dari network di SETIAP kali app dibuka, padahal harusnya
  // bisa di-cache seperti library statis lainnya.
  const isDynamic =
    url.includes("firestore.googleapis.com") ||
    url.includes("firebaseio.com") ||
    url.includes("googleapis.com") ||
    url.includes("firebasestorage") ||
    event.request.method !== "GET";

  if (isDynamic) {
    return; // biarkan browser handle langsung ke network, gak lewat SW
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          // 🔥 FIX PALING PENTING: sebelumnya kondisinya cuma
          // "response.status === 200", TAPI response dari domain lain
          // (CDN Tailwind/FontAwesome/Chart.js/unpkg/jsdelivr, font Google,
          // gambar dari raw.githubusercontent.com, dst) yang di-load lewat
          // <script src>/<link>/<img> itu "opaque response" — statusnya
          // SELALU 0 walau sukses (browser sengaja sembunyikan detailnya demi
          // keamanan cross-origin). Karena syaratnya "=== 200", response
          // opaque ini TIDAK PERNAH lolos dan TIDAK PERNAH disimpan ke cache
          // — akibatnya semua library CDN & gambar itu didownload ULANG dari
          // internet di SETIAP kali app dibuka (ini penyebab utama loading
          // awal kerasa berat/lama, apalagi di koneksi HP yang lemot).
          // Sekarang response opaque (type "opaque") ikut disimpan, supaya
          // kunjungan berikutnya bisa langsung dilayani dari cache duluan.
          const isCacheable =
            response &&
            (response.status === 200 || response.type === "opaque");

          if (isCacheable) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      // Cache-first (kalau ada) sambil tetap update cache di background;
      // kalau belum ada di cache, baru tunggu network.
      return cached || network;
    })
  );
});
