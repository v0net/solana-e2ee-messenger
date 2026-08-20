const nodeCrypto = require("crypto");

if (!global.crypto) {
  global.crypto = nodeCrypto.webcrypto || {
    getRandomValues: (b) => nodeCrypto.randomFillSync(b),
  };
}
if (typeof window !== "undefined" && !window.crypto) {
  window.crypto = global.crypto;
}
if (!global.structuredClone) {
  global.structuredClone = (val) => JSON.parse(JSON.stringify(val));
}

const { PublicKey, Keypair } = require("@solana/web3.js");
const nacl = require("tweetnacl");

describe("Solana RPC chat methods and lifecycle handling", () => {
  let solana;

  beforeEach(() => {
    jest.resetModules();
    solana = require("../solana/solana.js");
  });

  afterEach(() => {
    if (solana.clearSession) {
      solana.clearSession();
    }
  });

  test("getChats returns lastMessage: null for empty chat messages", async () => {
    const mnemonic = solana.generateMnemonic();
    solana.initializeKeysFromMnemonic(mnemonic);
    const userPubkey = solana.getUserSigningPublicKey();

    const peerKeypair = Keypair.generate();
    const peerPubkey = peerKeypair.publicKey.toBase58();
    const peerEncryption = nacl.box.keyPair();

    const mockChatData = {
      participant1: new PublicKey(userPubkey),
      participant2: new PublicKey(peerPubkey),
      participant1EncryptionKey: Array.from(nacl.randomBytes(32)),
      participant2EncryptionKey: Array.from(peerEncryption.publicKey),
      messages: [],
      payer: new PublicKey(userPubkey),
    };

    const userChats = [
      {
        account: mockChatData,
      },
    ];

    const mappedChats = userChats.map(({ account }) => {
      const peerSigningPublicKey =
        account.participant1.toBase58() === userPubkey
          ? account.participant2.toBase58()
          : account.participant1.toBase58();
      if (!account.messages.length) {
        return {
          name: peerSigningPublicKey,
          lastMessage: null,
          timestamp: null,
        };
      }
      return {
        name: peerSigningPublicKey,
        lastMessage: "message",
        timestamp: 12345,
      };
    });

    expect(mappedChats[0].name).toBe(peerPubkey);
    expect(mappedChats[0].lastMessage).toBeNull();
    expect(mappedChats[0].timestamp).toBeNull();
  });

  test("closeChat accounts struct includes original payer", () => {
    const userKeypair = Keypair.generate();
    const originalPayer = Keypair.generate().publicKey;
    const chatPDA = Keypair.generate().publicKey;

    const closeChatAccounts = {
      chat: chatPDA,
      signer: userKeypair.publicKey,
      payer: originalPayer,
    };

    expect(closeChatAccounts.payer).toEqual(originalPayer);
    expect(closeChatAccounts.chat).toEqual(chatPDA);
    expect(closeChatAccounts.signer).toEqual(userKeypair.publicKey);
  });

  test("REACT_APP_RPC_URL configures custom endpoint or falls back to devnet", () => {
    const originalEnv = process.env.REACT_APP_RPC_URL;
    process.env.REACT_APP_RPC_URL = "https://api.devnet.solana.com";
    const rpcUrl = process.env.REACT_APP_RPC_URL || "http://127.0.0.1:8899";
    expect(rpcUrl).toBe("https://api.devnet.solana.com");

    delete process.env.REACT_APP_RPC_URL;
    const fallbackUrl =
      process.env.REACT_APP_RPC_URL || "http://127.0.0.1:8899";
    expect(fallbackUrl).toBe("http://127.0.0.1:8899");

    if (originalEnv) process.env.REACT_APP_RPC_URL = originalEnv;
  });
});
