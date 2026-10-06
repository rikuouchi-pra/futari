import { p256 } from '@noble/curves/nist.js';
export function publicKey(key) { return p256.getPublicKey(key, false); }
export function sign(hash,key) { return p256.sign(hash,key,{prehash:false,format:'compact'}); }
export function verify(sig,hash,pub) { return p256.verify(sig,hash,pub,{prehash:false,format:'compact'}); }
