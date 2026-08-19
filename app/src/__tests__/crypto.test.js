const nodeCrypto = require("crypto");

if (!global.crypto) {
  global.crypto = nodeCrypto.webcrypto || {
    getRandomValues: (b) => nodeCrypto.randomFillSync(b),
  };
}
if (typeof window !== "undefined" && !window.crypto) {
  window.crypto = global.crypto;
}

const fs = require("fs");
const path = require("path");
const nacl = require("tweetnacl");
const naclUtil = require("tweetnacl-util");
const idl = require("../solana/solana_messenger.json");
const {
  generateMnemonic,
  isValidMnemonic,
  initializeKeysFromMnemonic,
  encryptWithPassword,
  decryptWithPassword,
  decryptWithSharedKey,
  areKeysInitialized,
  getUserSigningPublicKey,
  clearSession,
} = require("../solana/solana.js");

beforeAll(() => {
  const wasmPath = path.resolve(
    __dirname,
    "../../node_modules/argon2-browser/dist/argon2.wasm",
  );
  if (fs.existsSync(wasmPath)) {
    const wasmBuffer = fs.readFileSync(wasmPath);
    global.fetch = async () =>
      new Response(wasmBuffer, {
        headers: { "Content-Type": "application/wasm" },
      });
  }
});

afterEach(() => {
  if (typeof clearSession === "function") {
    clearSession();
  }
});

describe("Crypto and Anchor IDL suite", () => {
  test("matches canonical program ID in Anchor IDL", () => {
    expect(idl.address).toBe("EN2XfSXoZWvupiaUsnz86ENiXcs3ETSGAoLrAZ9DtTUQ");
  });

  test("generates and validates BIP-39 mnemonic phrases", () => {
    const mnemonic = generateMnemonic();
    expect(Array.isArray(mnemonic)).toBe(true);
    expect(mnemonic.length).toBe(12);
    expect(isValidMnemonic(mnemonic)).toBe(true);
    expect(isValidMnemonic(mnemonic.join(" "))).toBe(true);

    const invalidWords = [...mnemonic];
    invalidWords[0] = "invalidwordxyz";
    expect(isValidMnemonic(invalidWords)).toBe(false);

    expect(isValidMnemonic(mnemonic.slice(0, 11))).toBe(false);
  });

  test("derives Ed25519 signing keypair from mnemonic", () => {
    const mnemonic = generateMnemonic();
    initializeKeysFromMnemonic(mnemonic);
    expect(areKeysInitialized()).toBe(true);

    const pubkey = getUserSigningPublicKey();
    expect(typeof pubkey).toBe("string");
    expect(pubkey.length).toBeGreaterThan(30);
  });

  test("derives X25519 encryption keypair for Diffie-Hellman exchange", () => {
    const mnemonic = generateMnemonic();
    initializeKeysFromMnemonic(mnemonic);
    expect(areKeysInitialized()).toBe(true);
  });

  test("encrypts and decrypts secret data using Argon2id KDF and password", async () => {
    const secretData = JSON.stringify({ mnemonic: "test phrase here" });
    const password = "correct-horse-battery-staple";

    const encrypted = await encryptWithPassword(secretData, password);
    expect(encrypted.encryptedContent).toBeDefined();
    expect(encrypted.salt).toBeDefined();
    expect(encrypted.nonce).toBeDefined();

    const decrypted = await decryptWithPassword(
      encrypted.encryptedContent,
      encrypted.salt,
      encrypted.nonce,
      password,
    );
    expect(decrypted).toBe(secretData);

    const failedDecryption = await decryptWithPassword(
      encrypted.encryptedContent,
      encrypted.salt,
      encrypted.nonce,
      "wrong-password",
    );
    expect(failedDecryption).toBeNull();
  });

  test("computes identical ECDH shared secret for communicating peers", () => {
    const peer1 = nacl.box.keyPair();
    const peer2 = nacl.box.keyPair();

    const shared1 = nacl.box.before(peer2.publicKey, peer1.secretKey);
    const shared2 = nacl.box.before(peer1.publicKey, peer2.secretKey);

    expect(Buffer.from(shared1).equals(Buffer.from(shared2))).toBe(true);
  });

  test("authenticates and decrypts payloads via TweetNaCl box precomputed secret", () => {
    const peer1 = nacl.box.keyPair();
    const peer2 = nacl.box.keyPair();
    const shared = nacl.box.before(peer2.publicKey, peer1.secretKey);

    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const message = "Secret on-chain message payload";
    const msgUint8 = naclUtil.decodeUTF8(message);

    const ciphertext = nacl.box.after(msgUint8, nonce, shared);
    expect(ciphertext).toBeDefined();
    expect(ciphertext.length).toBe(msgUint8.length + 16);

    const decryptedBytes = nacl.box.open.after(ciphertext, nonce, shared);
    expect(decryptedBytes).not.toBeNull();
    expect(naclUtil.encodeUTF8(decryptedBytes)).toBe(message);

    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 1;
    expect(nacl.box.open.after(tampered, nonce, shared)).toBeNull();
  });

  test("encrypts and decrypts messages with authenticated shared key helpers", () => {
    const mnemonic = generateMnemonic();
    initializeKeysFromMnemonic(mnemonic);

    const peer = nacl.box.keyPair();
    const testSharedKey = nacl.box.before(peer.publicKey, peer.secretKey);

    const nonce = nacl.randomBytes(24);
    const plaintext = "Hello authenticated messenger!";
    const encrypted = nacl.box.after(
      naclUtil.decodeUTF8(plaintext),
      nonce,
      testSharedKey,
    );

    const decrypted = decryptWithSharedKey(encrypted, nonce, testSharedKey);
    expect(decrypted).toBe(plaintext);
  });

  test("normalizes Uint8Array, Buffer, and Array cipher formats in decryptWithSharedKey", () => {
    const key = nacl.randomBytes(32);
    const nonce = nacl.randomBytes(24);
    const plaintext = "Normalization test";
    const cipher = nacl.box.after(naclUtil.decodeUTF8(plaintext), nonce, key);

    expect(
      decryptWithSharedKey(new Uint8Array(cipher), new Uint8Array(nonce), key),
    ).toBe(plaintext);

    expect(
      decryptWithSharedKey(
        Buffer.from(cipher),
        Buffer.from(nonce),
        Buffer.from(key),
      ),
    ).toBe(plaintext);

    expect(
      decryptWithSharedKey(Array.from(cipher), Array.from(nonce), key),
    ).toBe(plaintext);
  });

});
