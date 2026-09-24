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
  "rikurussel14@gmail.com": "https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnResgIlCNREINNYo5wkEblJCfQKIfXyRvDGyBajdIJopTVY8lxAJgv4ZgRF9aL9JF7XWEvMxsVOoPLEerkmVn6Hb3OJVlnLjrslIwxu7AV_OSNekgMk0ScBRP-YJ-n7NIPKWXMcd3ea0UQNUVjMoL9lRl2oiaRgLZPEQjoxSEIBPMeV3MsDs-6V5PNDhq1zOF67YfBa_XoPlZ4hLIx4vNcYjnOFKCSmx1r818t6NGFvpcUVov1pgiK0QngrZstQKS7-nOBlAEA3WxVf2ba2FBXR7asT6Q&lib=M9bMT0AG7HORQy52EYUjQz0mlWQrMnQWP",
  "a1lic3h2dak1@gmail.com": "https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnResgIlCNREINNYo5wkEblJCfQKIfXyRvDGyBajdIJopTVY8lxAJgv4ZgRF9aL9JF7XWEvMxsVOoPLEerkmVn6Hb3OJVlnLjrslIwxu7AV_OSNekgMk0ScBRP-YJ-n7NIPKWXMcd3ea0UQNUVjMoL9lRl2oiaRgLZPEQjoxSEIBPMeV3MsDs-6V5PNDhq1zOF67YfBa_XoPlZ4hLIx4vNcYjnOFKCSmx1r818t6NGFvpcUVov1pgiK0QngrZstQKS7-nOBlAEA3WxVf2ba2FBXR7asT6Q&lib=M9bMT0AG7HORQy52EYUjQz0mlWQrMnQWP"
};
