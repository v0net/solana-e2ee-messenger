import Wallet from "@coral-xyz/anchor/dist/cjs/nodewallet.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as bip39 from "bip39";
import * as argon2 from "argon2-browser";
import { derivePath } from "ed25519-hd-key";
import idl from "./solana_messenger.json";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { Buffer } from "buffer";

window.Buffer = Buffer;

let program;
let chatPDA;
let userSigningKeyPair;
let peerSigningPublicKey;
let userEncryptionKeyPair;
let chatSharedKey;
let chatInitializedSubscription;
let encryptionKeySetSubscription;
let messageSentSubscription;
let chatDeletedSubscription;

function generateMnemonic() {
  return bip39.generateMnemonic().split(" ");
}
function isValidMnemonic(mnemonic) {
  try {
    if (Array.isArray(mnemonic)) {
      mnemonic = mnemonic.join(" ").trim();
    }
    return bip39.validateMnemonic(mnemonic);
  } catch (error) {
    return false;
  }
}

function isValidPublicKey(publicKeyString) {
  try {
    const publicKey = new PublicKey(publicKeyString);
    return PublicKey.isOnCurve(publicKey);
  } catch (error) {
    return false;
  }
}

function getUserSigningPublicKey() {
  if (!userSigningKeyPair) throw new Error("An error occurred");
  return userSigningKeyPair.publicKey.toBase58();
}

async function encryptWithPassword(content, password) {
  const salt = nacl.randomBytes(16);
  const derivedKey = await argon2.hash({
    pass: password,
    salt: salt,
    time: 3,
    mem: 65536,
    hashLen: nacl.secretbox.keyLength,
    parallelism: 4,
    type: argon2.ArgonType.Argon2id,
  });
  const contentUint8 = naclUtil.decodeUTF8(content);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encryptedContent = nacl.secretbox(contentUint8, nonce, derivedKey.hash);

  return {
    encryptedContent: naclUtil.encodeBase64(encryptedContent),
    salt: naclUtil.encodeBase64(salt),
    nonce: naclUtil.encodeBase64(nonce),
  };
}

async function decryptWithPassword(encryptedContent, salt, nonce, password) {
  const saltUint8 = naclUtil.decodeBase64(salt);
  const derivedKey = await argon2.hash({
    pass: password,
    salt: saltUint8,
    time: 3,
    mem: 65536,
    hashLen: nacl.secretbox.keyLength,
    parallelism: 4,
    type: argon2.ArgonType.Argon2id,
  });
  const encryptedContentUint8 = naclUtil.decodeBase64(encryptedContent);
  const nonceUint8 = naclUtil.decodeBase64(nonce);

  const decryptedContentUint8 = nacl.secretbox.open(
    encryptedContentUint8,
    nonceUint8,
    derivedKey.hash,
  );
  return decryptedContentUint8
    ? naclUtil.encodeUTF8(decryptedContentUint8)
    : null;
}

function initializeKeysFromMnemonic(mnemonic) {
  const seed = bip39.mnemonicToSeedSync(mnemonic.join(" "));
  const derivedSigningKey = derivePath(
    "m/44'/501'/0'/0'",
    seed.toString("hex"),
  ).key;
  const derivedEncryptionKey = derivePath(
    "m/44'/501'/0'/1'",
    seed.toString("hex"),
  ).key;
  userSigningKeyPair = Keypair.fromSeed(new Uint8Array(derivedSigningKey));
  userEncryptionKeyPair = nacl.box.keyPair.fromSecretKey(
    new Uint8Array(derivedEncryptionKey),
  );
}

async function verifyPassword(password) {
  const { encryptedContent, salt, nonce } = JSON.parse(
    localStorage.getItem("encryptedMnemonic"),
  );
  const mnemonic = await decryptWithPassword(
    encryptedContent,
    salt,
    nonce,
    password,
  );
  if (!mnemonic) return false;
  initializeKeysFromMnemonic(JSON.parse(mnemonic));
  return true;
}

function areKeysInitialized() {
  return Boolean(userSigningKeyPair && userEncryptionKeyPair);
}

export {
  generateMnemonic,
  isValidMnemonic,
  isValidPublicKey,
  getUserSigningPublicKey,
  encryptWithPassword,
  decryptWithPassword,
  initializeKeysFromMnemonic,
  verifyPassword,
  areKeysInitialized,
};
