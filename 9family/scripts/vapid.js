// Sinh một cặp khóa VAPID cho Web Push: node scripts/vapid.js
import webpush from 'web-push';
const k = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:ban@example.com`);
