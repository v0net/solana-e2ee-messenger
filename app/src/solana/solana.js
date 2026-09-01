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

function initializeData() {
  const rpcUrl = process.env.REACT_APP_RPC_URL || "http://127.0.0.1:8899";
  const connection = new Connection(rpcUrl, "confirmed");

  const wallet = new Wallet(userSigningKeyPair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  program = new anchor.Program(idl);

  if (rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost")) {
    connection
      .getBalance(userSigningKeyPair.publicKey)
      .then((balance) => {
        if (balance < 1e9) {
          connection
            .requestAirdrop(userSigningKeyPair.publicKey, 10e9)
            .catch((err) => {
              console.warn("Local development airdrop failed:", err.message);
            });
        }
      })
      .catch(() => {});
  }
}

function initializeChatData(peerPublicKeyString) {
  if (!userSigningKeyPair || !program) throw new Error("An error occurred");
  peerSigningPublicKey = new PublicKey(peerPublicKeyString);
  const [participant1, participant2] =
    Buffer.compare(
      userSigningKeyPair.publicKey.toBuffer(),
      peerSigningPublicKey.toBuffer(),
    ) < 0
      ? [userSigningKeyPair.publicKey, peerSigningPublicKey]
      : [peerSigningPublicKey, userSigningKeyPair.publicKey];
  [chatPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("chat"), participant1.toBuffer(), participant2.toBuffer()],
    program.programId,
  );
}

async function initializeChat() {
  if (!userSigningKeyPair || !peerSigningPublicKey || !chatPDA || !program)
    throw new Error("An error occurred");
  const [participant1, participant2] =
    Buffer.compare(
      userSigningKeyPair.publicKey.toBuffer(),
      peerSigningPublicKey.toBuffer(),
    ) < 0
      ? [userSigningKeyPair.publicKey, peerSigningPublicKey]
      : [peerSigningPublicKey, userSigningKeyPair.publicKey];
  await program.methods
    .initializeChat()
    .accounts({
      chat: chatPDA,
      payer: userSigningKeyPair.publicKey,
      participant1: participant1,
      participant2: participant2,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([userSigningKeyPair])
    .rpc();
}

async function setEncryptionKey() {
  if (!userSigningKeyPair || !chatPDA || !program || !userEncryptionKeyPair)
    throw new Error("An error occurred");
  await program.methods
    .setEncryptionKey(userEncryptionKeyPair.publicKey)
    .accounts({
      chat: chatPDA,
      sender: userSigningKeyPair.publicKey,
    })
    .signers([userSigningKeyPair])
    .rpc();
}

async function sendMessage(content) {
  if (!userSigningKeyPair || !chatPDA || !program || !chatSharedKey)
    throw new Error("An error occurred");
  const { encryptedContent, nonce } = encryptWithSharedKey(content);
  await program.methods
    .sendMessage(Buffer.from(encryptedContent), nonce)
    .accounts({
      chat: chatPDA,
      sender: userSigningKeyPair.publicKey,
    })
    .signers([userSigningKeyPair])
    .rpc();
}

async function closeChat() {
  if (!userSigningKeyPair || !chatPDA || !program)
    throw new Error("An error occurred");
  const chatData = await program.account.chat.fetch(chatPDA);
  await program.methods
    .closeChat()
    .accounts({
      chat: chatPDA,
      signer: userSigningKeyPair.publicKey,
      payer: chatData.payer,
    })
    .signers([userSigningKeyPair])
    .rpc();
}

async function getMessages() {
  if (!chatPDA || !program || !chatSharedKey)
    throw new Error("An error occurred");
  try {
    const chatData = await program.account.chat.fetch(chatPDA);
    return chatData.messages.map((message) => ({
      sender: message.sender
        ? chatData.participant2.toBase58()
        : chatData.participant1.toBase58(),
      content: decryptWithSharedKey(
        message.content,
        new Uint8Array(message.nonce),
      ),
      timestamp: parseInt(message.timestamp) * 1000,
    }));
  } catch (error) {
    return [];
  }
}

async function getChats() {
  if (!userSigningKeyPair || !program || !userEncryptionKeyPair)
    throw new Error("An error occurred");
  const chats = await program.account.chat.all();
  const userChats = chats.filter(
    ({ account }) =>
      account.participant1.toBase58() ===
        userSigningKeyPair.publicKey.toBase58() ||
      account.participant2.toBase58() ===
        userSigningKeyPair.publicKey.toBase58(),
  );

  return userChats.map(({ account }) => {
    const peerSigningPublicKey =
      account.participant1.toBase58() ===
      userSigningKeyPair.publicKey.toBase58()
        ? account.participant2.toBase58()
        : account.participant1.toBase58();
    if (!account.messages.length)
      return {
        name: peerSigningPublicKey,
        lastMessage: null,
        timestamp: null,
      };
    const peerEncryptionPublicKey =
      account.participant1.toBase58() ===
      userSigningKeyPair.publicKey.toBase58()
        ? new Uint8Array(account.participant2EncryptionKey)
        : new Uint8Array(account.participant1EncryptionKey);
    const sharedKey = nacl.box.before(
      peerEncryptionPublicKey,
      userEncryptionKeyPair.secretKey,
    );
    return {
      name: peerSigningPublicKey,
      lastMessage: decryptWithSharedKey(
        account.messages.at(-1).content,
        new Uint8Array(account.messages.at(-1).nonce),
        sharedKey,
      ),
      timestamp: parseInt(account.messages.at(-1).timestamp) * 1000,
    };
  });
}

function subscribeToChatInitialized(onChatInitialized) {
  if (!program) throw new Error("An error occurred");
  if (
    chatInitializedSubscription !== null &&
    chatInitializedSubscription !== undefined
  ) {
    program.removeEventListener(chatInitializedSubscription).catch(() => {});
    chatInitializedSubscription = null;
  }
  chatInitializedSubscription = program.addEventListener(
    "chatInitialized",
    (event) => {
      if (!userSigningKeyPair) throw new Error("An error occurred");
      if (
        ![
          event.participant1.toBase58(),
          event.participant2.toBase58(),
        ].includes(userSigningKeyPair.publicKey.toBase58())
      )
        return;
      onChatInitialized(
        event.participant1.toBase58() ===
          userSigningKeyPair.publicKey.toBase58()
          ? event.participant2.toBase58()
          : event.participant1.toBase58(),
      );
    },
  );
}

function subscribeToEncryptionKeySet(onEncryptionKeySet) {
  if (!program) throw new Error("An error occurred");
  if (
    encryptionKeySetSubscription !== null &&
    encryptionKeySetSubscription !== undefined
  ) {
    program.removeEventListener(encryptionKeySetSubscription).catch(() => {});
    encryptionKeySetSubscription = null;
  }
  encryptionKeySetSubscription = program.addEventListener(
    "encryptionKeySet",
    (event) => {
      if (!userSigningKeyPair || !userEncryptionKeyPair)
        throw new Error("An error occurred");
      if (
        ![
          event.participant1.toBase58(),
          event.participant2.toBase58(),
        ].includes(userSigningKeyPair.publicKey.toBase58()) ||
        (peerSigningPublicKey &&
          ![
            event.participant1.toBase58(),
            event.participant2.toBase58(),
          ].includes(peerSigningPublicKey.toBase58()))
      )
        return;
      if (
        event.participant1.toBase58() ===
        userSigningKeyPair.publicKey.toBase58()
          ? event.participant1EncryptionKey !== null &&
            event.participant2EncryptionKey !== null
          : event.participant2EncryptionKey !== null &&
            event.participant1EncryptionKey !== null
      ) {
        const peerEncryptionPublicKey =
          event.participant1.toBase58() ===
          userSigningKeyPair.publicKey.toBase58()
            ? new Uint8Array(event.participant2EncryptionKey)
            : new Uint8Array(event.participant1EncryptionKey);
        chatSharedKey = peerEncryptionPublicKey
          ? nacl.box.before(
              peerEncryptionPublicKey,
              userEncryptionKeyPair.secretKey,
            )
          : null;
      }
      onEncryptionKeySet(
        event.participant1.toBase58() ===
          userSigningKeyPair.publicKey.toBase58()
          ? [
              event.participant1EncryptionKey !== null,
              event.participant2EncryptionKey !== null,
            ]
          : [
              event.participant2EncryptionKey !== null,
              event.participant1EncryptionKey !== null,
            ],
      );
    },
  );
}

function subscribeToMessageSent(onMessageSent) {
  if (!program) throw new Error("An error occurred");
  if (
    messageSentSubscription !== null &&
    messageSentSubscription !== undefined
  ) {
    program.removeEventListener(messageSentSubscription).catch(() => {});
    messageSentSubscription = null;
  }
  messageSentSubscription = program.addEventListener("messageSent", (event) => {
    if (!userSigningKeyPair || !userEncryptionKeyPair)
      throw new Error("An error occurred");
    if (
      ![event.participant1.toBase58(), event.participant2.toBase58()].includes(
        userSigningKeyPair.publicKey.toBase58(),
      )
    )
      return;
    const sharedKey = nacl.box.before(
      event.participant1.toBase58() === userSigningKeyPair.publicKey.toBase58()
        ? new Uint8Array(event.participant2EncryptionKey)
        : new Uint8Array(event.participant1EncryptionKey),
      userEncryptionKeyPair.secretKey,
    );
    onMessageSent(
      event.participant1.toBase58() === userSigningKeyPair.publicKey.toBase58()
        ? event.participant2.toBase58()
        : event.participant1.toBase58(),
      event.message.sender
        ? event.participant2.toBase58()
        : event.participant1.toBase58(),
      decryptWithSharedKey(
        event.message.content,
        new Uint8Array(event.message.nonce),
        sharedKey,
      ),
      parseInt(event.message.timestamp) * 1000,
    );
  });
}

function subscribeToChatDeleted(onChatDeleted) {
  if (!program) throw new Error("An error occurred");
  if (
    chatDeletedSubscription !== null &&
    chatDeletedSubscription !== undefined
  ) {
    program.removeEventListener(chatDeletedSubscription).catch(() => {});
    chatDeletedSubscription = null;
  }
  chatDeletedSubscription = program.addEventListener("chatClosed", (event) => {
    if (!userSigningKeyPair) throw new Error("An error occurred");
    if (
      ![event.participant1.toBase58(), event.participant2.toBase58()].includes(
        userSigningKeyPair.publicKey.toBase58(),
      )
    )
      return;
    onChatDeleted(
      event.participant1.toBase58() === userSigningKeyPair.publicKey.toBase58()
        ? event.participant2.toBase58()
        : event.participant1.toBase58(),
    );
  });
}

function unsubscribeFromAll() {
  if (!program) throw new Error("An error occurred");
  if (
    chatInitializedSubscription !== null &&
    chatInitializedSubscription !== undefined
  ) {
    program.removeEventListener(chatInitializedSubscription);
    chatInitializedSubscription = null;
  }
  if (
    encryptionKeySetSubscription !== null &&
    encryptionKeySetSubscription !== undefined
  ) {
    program.removeEventListener(encryptionKeySetSubscription);
    encryptionKeySetSubscription = null;
  }
  if (
    messageSentSubscription !== null &&
    messageSentSubscription !== undefined
  ) {
    program.removeEventListener(messageSentSubscription);
    messageSentSubscription = null;
  }
  if (
    chatDeletedSubscription !== null &&
    chatDeletedSubscription !== undefined
  ) {
    program.removeEventListener(chatDeletedSubscription);
    chatDeletedSubscription = null;
  }
}

function clearSession() {
  try {
    unsubscribeFromAll();
  } catch (error) {}
  userSigningKeyPair?.secretKey?.fill(0);
  userEncryptionKeyPair?.secretKey?.fill(0);
  userSigningKeyPair = null;
  peerSigningPublicKey = null;
  userEncryptionKeyPair = null;
  chatSharedKey = null;
  chatPDA = null;
}

function getUserSigningPublicKey() {
  if (!userSigningKeyPair) throw new Error("An error occurred");
  return userSigningKeyPair.publicKey.toBase58();
}

async function checkEncryptionKeys() {
  if (!program || !userSigningKeyPair || !userEncryptionKeyPair)
    throw new Error("An error occurred");
  try {
    const chatData = await program.account.chat.fetch(chatPDA);
    const hasUserEncryptionKey =
      chatData.participant1.toBase58() ===
      userSigningKeyPair.publicKey.toBase58()
        ? chatData.participant1EncryptionKey !== null
        : chatData.participant2EncryptionKey !== null;
    const peerEncryptionPublicKey =
      chatData.participant1.toBase58() ===
      userSigningKeyPair.publicKey.toBase58()
        ? chatData.participant2EncryptionKey
          ? new Uint8Array(chatData.participant2EncryptionKey)
          : null
        : chatData.participant1EncryptionKey
          ? new Uint8Array(chatData.participant1EncryptionKey)
          : null;
    chatSharedKey = peerEncryptionPublicKey
      ? nacl.box.before(
          peerEncryptionPublicKey,
          userEncryptionKeyPair.secretKey,
        )
      : null;
    return [hasUserEncryptionKey, peerEncryptionPublicKey !== null];
  } catch (error) {
    return [false, false];
  }
}

function encryptWithSharedKey(content) {
  if (!chatSharedKey) throw new Error("An error occurred");
  const contentUint8 = naclUtil.decodeUTF8(content);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const encryptedContent = nacl.box.after(contentUint8, nonce, chatSharedKey);
  return {
    encryptedContent: encryptedContent,
    nonce: nonce,
  };
}

function decryptWithSharedKey(encryptedContent, nonce, sharedKey = null) {
  if (!chatSharedKey && !sharedKey) throw new Error("An error occurred");
  const key = sharedKey || chatSharedKey;
  const contentUint8 =
    encryptedContent instanceof Uint8Array
      ? encryptedContent
      : new Uint8Array(encryptedContent);
  const nonceUint8 =
    nonce instanceof Uint8Array ? nonce : new Uint8Array(nonce);
  const keyUint8 = key instanceof Uint8Array ? key : new Uint8Array(key);
  const decryptedContentUint8 = nacl.box.open.after(
    contentUint8,
    nonceUint8,
    keyUint8,
  );
  return decryptedContentUint8
    ? naclUtil.encodeUTF8(decryptedContentUint8)
    : null;
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

async function checkChatExists() {
  if (!program || !chatPDA) throw new Error("An error occurred");
  try {
    const provider = anchor.getProvider();
    const accountInfo = await provider.connection.getAccountInfo(chatPDA);
    return accountInfo !== null;
  } catch (error) {
    return false;
  }
}

export {
  generateMnemonic,
  isValidMnemonic,
  isValidPublicKey,
  initializeChat,
  sendMessage,
  closeChat,
  getMessages,
  initializeChatData,
  initializeData,
  getChats,
  getUserSigningPublicKey,
  checkEncryptionKeys,
  setEncryptionKey,
  encryptWithPassword,
  decryptWithPassword,
  encryptWithSharedKey,
  decryptWithSharedKey,
  initializeKeysFromMnemonic,
  verifyPassword,
  subscribeToChatInitialized,
  subscribeToEncryptionKeySet,
  subscribeToMessageSent,
  subscribeToChatDeleted,
  unsubscribeFromAll,
  clearSession,
  areKeysInitialized,
  checkChatExists,
};
