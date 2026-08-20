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


async function checkChatExists() {
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
  getUserSigningPublicKey,
  encryptWithPassword,
  decryptWithPassword,
  encryptWithSharedKey,
  decryptWithSharedKey,
  initializeKeysFromMnemonic,
  verifyPassword,
  areKeysInitialized,
  initializeData,
  initializeChatData,
  checkChatExists,
};
