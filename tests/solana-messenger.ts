import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { SolanaMessenger } from "../target/types/solana_messenger";

describe("solana-messenger", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.solanaMessenger as Program<SolanaMessenger>;

  it("derives deterministic chat PDA address", () => {
    const user1 = anchor.web3.Keypair.generate().publicKey;
    const user2 = anchor.web3.Keypair.generate().publicKey;

    const [participant1, participant2] =
      Buffer.compare(user1.toBuffer(), user2.toBuffer()) < 0
        ? [user1, user2]
        : [user2, user1];

    const [chatPda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("chat"), participant1.toBuffer(), participant2.toBuffer()],
      program.programId,
    );

    expect(chatPda).to.be.an.instanceOf(anchor.web3.PublicKey);
    expect(bump).to.be.a("number");
  });
});
