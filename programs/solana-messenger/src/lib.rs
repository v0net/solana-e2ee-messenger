use anchor_lang::prelude::*;

declare_id!("EN2XfSXoZWvupiaUsnz86ENiXcs3ETSGAoLrAZ9DtTUQ");

pub const CHAT_ACCOUNT_SPACE: usize = 10240;

#[program]
pub mod solana_messenger {
    use super::*;

    pub fn initialize_chat(ctx: Context<InitializeChat>) -> Result<()> {
        let chat: &mut Account<'_, Chat> = &mut ctx.accounts.chat;
        chat.participant1 = *ctx.accounts.participant1.key;
        chat.participant2 = *ctx.accounts.participant2.key;
        chat.payer = ctx.accounts.payer.key();
        chat.messages = Vec::new();

        emit!(ChatInitialized {
            participant1: chat.participant1,
            participant2: chat.participant2,
        });

        Ok(())
    }
}

#[account]
pub struct Chat {
    pub participant1: Pubkey,
    pub participant2: Pubkey,
    pub payer: Pubkey,
    pub participant1_encryption_key: Option<[u8; 32]>, 
    pub participant2_encryption_key: Option<[u8; 32]>,
    pub messages: Vec<Message>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Message {
    pub sender: u8,
    pub content: Vec<u8>,
    pub nonce: [u8; 24],
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct InitializeChat<'info> {
    #[account(
        init, 
        payer = payer, 
        space = CHAT_ACCOUNT_SPACE,
        seeds = [b"chat", participant1.key().as_ref(), participant2.key().as_ref()], 
        bump,
        constraint = participant1.key() < participant2.key(),
        constraint = payer.key() == participant1.key() || payer.key() == participant2.key(),
    )]
    pub chat: Account<'info, Chat>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK:
    pub participant1: UncheckedAccount<'info>,
    /// CHECK:
    pub participant2: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum ChatError {
    #[msg("You are not a participant in this chat.")]
    Unauthorized,
}

#[event]
pub struct ChatInitialized {
    pub participant1: Pubkey,
    pub participant2: Pubkey,
}
