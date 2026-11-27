// Gamers Masr push service worker (FCM background messages).
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAAXic-35km1xhfM8PUtvk__RwJIHfkB8M',
  authDomain: 'gamers-masr-app.firebaseapp.com',
  projectId: 'gamers-masr-app',
  messagingSenderId: '998355810935',
  appId: '1:998355810935:web:b78b86f011f5abdeeaa472'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = (payload && payload.notification) || {};
  self.registration.showNotification(n.title || 'Gamers Masr', {
    body: n.body || '',
    icon: 'icon-192.png',
    dir: 'rtl',
    lang: 'ar'
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./'));
});
// PWA installability: a fetch listener is required for the desktop install prompt.
self.addEventListener('fetch', (event) => {});
