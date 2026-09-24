/* Firebase の接続設定（公開されても問題ない情報です。データはアクセス制限ルールで守られます） */
window.FUTARI_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAvS4V-_qLGF1Al25Q5A5X5-YradL3UV8Y",
  authDomain: "futari-list-17396.firebaseapp.com",
  projectId: "futari-list-17396",
  storageBucket: "futari-list-17396.firebasestorage.app",
  messagingSenderId: "1054283093719",
  appId: "1:1054283093719:web:a65ffb5a291fbda01fc292"
};
/* 使えるのはこの2人だけ（1人目が夫＝持ち主） */
window.FUTARI_OWNER_EMAIL = "rikurussel14@gmail.com";
window.FUTARI_ALLOWED_EMAILS = ["rikurussel14@gmail.com", "a1lic3h2dak1@gmail.com"];
/* Googleカレンダー連携：それぞれが自分のGoogleアカウントで Apps Script をデプロイしたURL（…/exec）を入れる。空ならその人は連携なし */
window.FUTARI_GAS_URLS = {
  "rikurussel14@gmail.com": "https://script.google.com/macros/library/d/1Zl8_i1eLEiqKUVol8ea1au8TxBi7rGFhR46splNbZNrjgJp1nSl0Gxye/1",
  "a1lic3h2dak1@gmail.com": ""
};
