// Service Worker - オフライン対応とPWAインストール用
const CACHE_NAME = 'kids-app-v1'
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './app-kusanuki/',
  './app-nazori/',
]

// インストール時にコアアセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS)
    })
  )
  self.skipWaiting()
})

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

// フェッチ時にキャッシュを利用（ネットワーク優先）
self.addEventListener('fetch', (event) => {
  // ナビゲーションリクエストはネットワーク優先
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // 成功したらキャッシュに保存
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          return response
        })
        .catch(() => {
          // オフライン時はキャッシュを返す
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('./index.html')
          })
        })
    )
    return
  }

  // その他のリクエストはキャッシュ優先
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        return response
      })
    })
  )
})
