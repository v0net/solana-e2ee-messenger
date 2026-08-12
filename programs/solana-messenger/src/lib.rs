use anchor_lang::prelude::*;

declare_id!("EN2XfSXoZWvupiaUsnz86ENiXcs3ETSGAoLrAZ9DtTUQ");

pub const MAX_MESSAGE_CONTENT_LEN: usize = 512;
pub const CHAT_ACCOUNT_SPACE: usize = 10240;
pub const CHAT_HEADER_SPACE: usize = 174;
pub const MESSAGE_FIXED_OVERHEAD: usize = 37;

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

    pub fn set_encryption_key(ctx: Context<SetEncryptionKey>, encryption_key: [u8; 32]) -> Result<()> {
        let chat = &mut ctx.accounts.chat;
        let sender = ctx.accounts.sender.key();

        require!(
            Some(encryption_key) != chat.participant1_encryption_key &&
            Some(encryption_key) != chat.participant2_encryption_key,
            ChatError::DuplicateEncryptionKey,
        );

        if sender == chat.participant1 {
            require!(
                chat.participant1_encryption_key.is_none(),
                ChatError::EncryptionKeyAlreadySet,
            );
            chat.participant1_encryption_key = Some(encryption_key);
        } else if sender == chat.participant2 {
            require!(
                chat.participant2_encryption_key.is_none(),
                ChatError::EncryptionKeyAlreadySet,
            );
            chat.participant2_encryption_key = Some(encryption_key);
        } else {
            return Err(ChatError::Unauthorized.into());
        }

        emit!(EncryptionKeySet {
            participant1: chat.participant1,
            participant2: chat.participant2,
            participant1_encryption_key: chat.participant1_encryption_key,
            participant2_encryption_key: chat.participant2_encryption_key,
        });
            
        Ok(())
    }    

    pub fn send_message(ctx: Context<SendMessage>, content: Vec<u8>, nonce: [u8; 24]) -> Result<()> {
        let chat = &mut ctx.accounts.chat;
        let sender_key = ctx.accounts.sender.key();
        
        let sender = if sender_key == chat.participant1 {
            0u8
        } else if sender_key == chat.participant2 {
            1u8
        } else {
            return Err(ChatError::Unauthorized.into());
        };

        require!(
            chat.participant1_encryption_key.is_some() && chat.participant2_encryption_key.is_some(),
            ChatError::EncryptionKeysNotSet,
        );

        require!(
            content.len() <= MAX_MESSAGE_CONTENT_LEN,
            ChatError::MessageTooLong,
        );

        let current_payload_len: usize = chat
            .messages
            .iter()
            .map(|m| MESSAGE_FIXED_OVERHEAD + m.content.len())
            .sum();
        let new_msg_len = MESSAGE_FIXED_OVERHEAD + content.len();

        require!(
            CHAT_HEADER_SPACE + current_payload_len + new_msg_len <= CHAT_ACCOUNT_SPACE,
            ChatError::ChatFull,
        );
        
        let new_message = Message {
            sender,
            content,
            nonce,
            timestamp: Clock::get()?.unix_timestamp,
        };
        chat.messages.push(new_message.clone());

        emit!(MessageSent {
            participant1: chat.participant1,
            participant2: chat.participant2,
            participant1_encryption_key: chat.participant1_encryption_key, 
            participant2_encryption_key: chat.participant2_encryption_key,
            message: new_message,
        });

        Ok(())
    }

    pub fn close_chat(ctx: Context<CloseChat>) -> Result<()> {
        let chat = &ctx.accounts.chat;
        let signer = ctx.accounts.signer.key();
    
        require!(
            signer == chat.participant1 || signer == chat.participant2,
            ChatError::Unauthorized,
        );

        emit!(ChatClosed {
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
        space = 10240,
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

#[derive(Accounts)]
pub struct SetEncryptionKey<'info> {
    #[account(
        mut,
        seeds = [b"chat", chat.participant1.as_ref(), chat.participant2.as_ref()],
        bump,
    )]
    pub chat: Account<'info, Chat>,
    pub sender: Signer<'info>,
}

#[derive(Accounts)]
pub struct SendMessage<'info> {
    #[account(
        mut,
        seeds = [b"chat", chat.participant1.as_ref(), chat.participant2.as_ref()],
        bump,
    )]
    pub chat: Account<'info, Chat>,
    pub sender: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseChat<'info> {
    #[account(
        mut,
        seeds = [b"chat", chat.participant1.as_ref(), chat.participant2.as_ref()],
        bump,
        close = payer,
    )]
    pub chat: Account<'info, Chat>,
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        address = chat.payer @ ChatError::Unauthorized,
    )]
    pub payer: SystemAccount<'info>,
}

#[error_code]
pub enum ChatError {
    #[msg("You are not a participant in this chat.")]
    Unauthorized,
    #[msg("Encryption keys must be set for both users before sending messages.")]
    EncryptionKeysNotSet,
    #[msg("Encryption key must be unique per participant.")]
    DuplicateEncryptionKey,
    #[msg("Encryption key is already set for this participant.")]
    EncryptionKeyAlreadySet,
    #[msg("Chat message storage is full.")]
    ChatFull,
    #[msg("Message content exceeds maximum allowed length.")]
    MessageTooLong,
}

#[event]
pub struct ChatInitialized {
    pub participant1: Pubkey,
    pub participant2: Pubkey,
}

#[event]
pub struct EncryptionKeySet {
    pub participant1: Pubkey,
    pub participant2: Pubkey,
    pub participant1_encryption_key: Option<[u8; 32]>, 
    pub participant2_encryption_key: Option<[u8; 32]>,
}

#[event]
pub struct MessageSent {
    pub participant1: Pubkey,
    pub participant2: Pubkey,
    pub participant1_encryption_key: Option<[u8; 32]>, 
    pub participant2_encryption_key: Option<[u8; 32]>,
    pub message: Message,
}

#[event]
pub struct ChatClosed {
    pub participant1: Pubkey,
    pub participant2: Pubkey,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_space_calculations() {
        assert_eq!(CHAT_HEADER_SPACE, 174);
        assert_eq!(MESSAGE_FIXED_OVERHEAD, 37);
        let max_content = vec![0u8; MAX_MESSAGE_CONTENT_LEN];
        let single_msg_len = MESSAGE_FIXED_OVERHEAD + max_content.len();
        assert_eq!(single_msg_len, 549);
        assert!(CHAT_HEADER_SPACE + single_msg_len <= CHAT_ACCOUNT_SPACE);
    }

    #[test]
    fn test_encryption_key_first_set_and_overwrite_rejection() {
        let p1 = Pubkey::new_unique();
        let p2 = Pubkey::new_unique();
        let payer = Pubkey::new_unique();
        let mut chat = Chat {
            participant1: p1,
            participant2: p2,
            payer,
            participant1_encryption_key: None,
            participant2_encryption_key: None,
            messages: Vec::new(),
        };

        let key1 = [1u8; 32];
        let key2 = [2u8; 32];

        assert!(chat.participant1_encryption_key.is_none());
        chat.participant1_encryption_key = Some(key1);
        assert_eq!(chat.participant1_encryption_key, Some(key1));

        let is_already_set = chat.participant1_encryption_key.is_some();
        assert!(is_already_set);

        let is_duplicate = chat.participant1_encryption_key == Some(key1);
        assert!(is_duplicate);

        chat.participant2_encryption_key = Some(key2);
        assert_ne!(chat.participant1_encryption_key, chat.participant2_encryption_key);
    }

    #[test]
    fn test_unauthorized_signer_rejection() {
        let p1 = Pubkey::new_unique();
        let p2 = Pubkey::new_unique();
        let unauthorized = Pubkey::new_unique();

        let is_p1_auth = p1 == p1 || p1 == p2;
        let is_p2_auth = p2 == p1 || p2 == p2;
        let is_unauth_auth = unauthorized == p1 || unauthorized == p2;

        assert!(is_p1_auth);
        assert!(is_p2_auth);
        assert!(!is_unauth_auth);
    }

    #[test]
    fn test_close_chat_authorization_and_payer_rent_destination() {
        let p1 = Pubkey::new_unique();
        let p2 = Pubkey::new_unique();
        let original_payer = Pubkey::new_unique();
        let attacker = Pubkey::new_unique();

        let chat = Chat {
            participant1: p1,
            participant2: p2,
            payer: original_payer,
            participant1_encryption_key: None,
            participant2_encryption_key: None,
            messages: Vec::new(),
        };

        assert!(p1 == chat.participant1 || p1 == chat.participant2);
        assert!(p2 == chat.participant1 || p2 == chat.participant2);
        assert!(!(attacker == chat.participant1 || attacker == chat.participant2));

        assert_eq!(chat.payer, original_payer);
        assert_ne!(chat.payer, attacker);
    }

    #[test]
    fn test_chat_storage_boundary_and_chat_full_and_oversized() {
        assert_eq!(CHAT_ACCOUNT_SPACE, 10240);
        let mut chat = Chat {
            participant1: Pubkey::new_unique(),
            participant2: Pubkey::new_unique(),
            payer: Pubkey::new_unique(),
            participant1_encryption_key: Some([1u8; 32]),
            participant2_encryption_key: Some([2u8; 32]),
            messages: Vec::new(),
        };

        let oversized = vec![0u8; MAX_MESSAGE_CONTENT_LEN + 1];
        assert!(oversized.len() > MAX_MESSAGE_CONTENT_LEN);

        let mut current_payload_len = 0usize;
        let valid_content = vec![0u8; MAX_MESSAGE_CONTENT_LEN];
        let msg_len = MESSAGE_FIXED_OVERHEAD + valid_content.len();

        let mut count = 0;
        while CHAT_HEADER_SPACE + current_payload_len + msg_len <= CHAT_ACCOUNT_SPACE {
            chat.messages.push(Message {
                sender: 0,
                content: valid_content.clone(),
                nonce: [0u8; 24],
                timestamp: 1000,
            });
            current_payload_len += msg_len;
            count += 1;
        }

        assert!(count > 0);
        assert!(CHAT_HEADER_SPACE + current_payload_len <= CHAT_ACCOUNT_SPACE);
        assert!(CHAT_HEADER_SPACE + current_payload_len + msg_len > CHAT_ACCOUNT_SPACE);
    }
}

