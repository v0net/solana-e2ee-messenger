# Solace

[English](#english) | [Русский](#русский)

---

## English

Decentralized, end-to-end encrypted 1-on-1 direct messaging dApp on Solana, built with Anchor, TweetNaCl, and React 19.

Features client-side authenticated encryption, deterministic on-chain addressing (PDAs), non-custodial key derivation from a single seed phrase, and real-time updates via Anchor event subscriptions.

### Key Features

* **End-to-End Encryption** — messages are encrypted in the browser with TweetNaCl (X25519 + XSalsa20-Poly1305); the Solana program only ever stores ciphertext.
* **Non-Custodial Key Derivation** — a single 12-word BIP-39 mnemonic deterministically derives both the Ed25519 signing key and the X25519 encryption key via separate SLIP-0010 paths.
* **Password-Protected Local Storage** — the mnemonic is encrypted with Argon2id + `nacl.secretbox` (XSalsa20-Poly1305) before being written to `localStorage`; it is never stored in plaintext.
* **Deterministic Chat PDA** — each pair of wallets resolves to exactly one canonical chat account, derived from sorted participant public keys, regardless of who initiates.
* **Transactional Key Exchange** — participants publish X25519 public keys on-chain; both sides independently compute the same shared secret via ECDH.
* **Real-Time Updates** — chat invitations, key registrations, and new messages are pushed via Anchor event subscriptions (WebSocket), no polling required.
* **Chat Deletion & Rent Reclamation** — `close_chat` zeroes the account and refunds the rent-exempt lamports directly to the original chat funder (chat.payer).

### Tech Stack

| Category | Technology |
| :--- | :--- |
| **Blockchain** | Solana |
| **Smart Contract Framework** | Anchor 0.31.0 |
| **Contract Language** | Rust (2021 edition) |
| **Frontend** | React 19, React Router 7 |
| **Build Tooling** | Create React App + CRACO |
| **Web3 Client** | `@solana/web3.js` ^1.98.0, `@coral-xyz/anchor` ^0.31.1 |
| **Cryptography** | TweetNaCl (X25519, XSalsa20-Poly1305) |
| **Key Derivation** | BIP-39, `ed25519-hd-key` (SLIP-0010) |
| **Password KDF** | Argon2id (`argon2-browser`, WASM) |
| **Styling** | CSS Modules |
| **Testing** | TypeScript, Mocha, ts-mocha, Chai |
| **Formatting** | Prettier |

### Architecture

The application separates client-side cryptography, the Anchor RPC layer, and on-chain program logic:

```text
React (UI & local state)
        │
        ▼
Client crypto layer (key derivation, TweetNaCl box)
        │
        ▼
Anchor client (RPC, serialization, event subscriptions)
        │
        ▼
Solana program (on-chain instructions)
        │
        ▼
Solana ledger (localnet / devnet / mainnet)
```

```text
solana-messenger/
├── Anchor.toml                 # Anchor workspace config & Program ID
├── Cargo.toml                  # Rust workspace manifest
├── package.json                # Root scripts & test dependencies
├── programs/
│   └── solana-messenger/
│       └── src/
│           └── lib.rs           # Program logic: instructions, accounts, events
├── migrations/
│   └── deploy.ts
├── tests/
│   └── solana-messenger.ts     # PDA derivation test
└── app/                         # React frontend
    ├── craco.config.js          # Webpack polyfills & WASM support
    └── src/
        ├── App.js               # Routing & auth guard
        ├── pages/
        │   ├── Register.jsx     # Mnemonic generation & password setup
        │   ├── Login.jsx        # Mnemonic import & unlock
        │   └── Home.jsx         # Chat list, invites, conversation view
        └── solana/
            ├── solana.js        # Web3/Anchor bindings & crypto glue
            └── solana_messenger.json # Anchor IDL
```

Frontend pages delegate wallet, crypto, and RPC operations to `solana/solana.js`, keeping React components focused on UI state.

### Encryption & Key Exchange Flow

Message confidentiality is established client-side, before any data reaches the chain:

1. Both participants derive an X25519 keypair from their own BIP-39 mnemonic (path `m/44'/501'/0'/1'`) and publish the **public** half via `set_encryption_key`.
2. Once both public keys are on-chain, each client independently computes the same shared secret: `nacl.box.before(peerPublicKey, ownSecretKey)`.
3. Each outgoing message is encrypted with a fresh random 24-byte nonce: `nacl.box.after(plaintext, nonce, sharedSecret)`.
4. The resulting ciphertext, nonce, sender index, and timestamp are submitted via `send_message` — plaintext never leaves the browser.
5. Recipients decrypt incoming ciphertext client-side with `nacl.box.open.after()` upon receiving the `MessageSent` event.

This keeps the Solana program fully opaque to message content: it validates accounts and stores bytes, and never performs decryption itself.

### On-Chain Data Model

Each chat account allocates a **fixed 10,240-byte buffer**:

```rust
#[account]
pub struct Chat {
    pub participant1: Pubkey,                            // 32 bytes
    pub participant2: Pubkey,                            // 32 bytes
    pub payer: Pubkey,                                   // 32 bytes
    pub participant1_encryption_key: Option<[u8; 32]>,   // 33 bytes
    pub participant2_encryption_key: Option<[u8; 32]>,   // 33 bytes
    pub messages: Vec<Message>,                          // 4 + N bytes
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Message {
    pub sender: u8,        // 0 = participant1, 1 = participant2
    pub content: Vec<u8>,  // ciphertext (includes 16-byte Poly1305 tag)
    pub nonce: [u8; 24],
    pub timestamp: i64,    // Clock::get()?.unix_timestamp
}
```

Fixed on-chain overhead is `1 + 4 + 24 + 8 = 37` bytes plus ciphertext length (53 bytes total overhead over plaintext including the 16-byte Poly1305 tag).

### Program Instructions

Base program: `solana_messenger`

* **`initialize_chat`** — creates the deterministic chat PDA (`[b"chat", min(pubkey1, pubkey2), max(pubkey1, pubkey2)]`), enforcing `participant1 < participant2`. Emits `ChatInitialized`.
* **`set_encryption_key(encryption_key: [u8; 32])`** — registers the caller's X25519 public key (one-time write; rejects subsequent overwrites or duplicate keys). Emits `EncryptionKeySet`.
* **`send_message(content: Vec<u8>, nonce: [u8; 24])`** — requires both encryption keys to be set, validates message payload and storage constraints, then appends the message. Emits `MessageSent`.
* **`close_chat`** — zeroes the account and refunds all rent lamports to the original chat creator (`chat.payer`). Emits `ChatClosed`.

### Quick Start

**Prerequisites:** Node.js 18+, Yarn 1.22+, Rust & Cargo, Solana CLI 1.18+, Anchor CLI 0.31.0

```bash
git clone https://github.com/v0net/solana-e2ee-messenger.git
cd solana-e2ee-messenger

yarn install
cd app && yarn install && cd ..
```

Start a local validator and deploy the program:

```bash
# Terminal 1
solana-test-validator

# Terminal 2
anchor build
anchor deploy
```

Ensure your Program ID matches across:
1. `declare_id!(...)` in `programs/solana-messenger/src/lib.rs`
2. `[programs.localnet]` in `Anchor.toml`
3. `"address"` in `app/src/solana/solana_messenger.json`

Run the frontend:

```bash
cd app
yarn start
```

* **App:** http://localhost:3000
* **RPC:** defaults to localnet `http://127.0.0.1:8899` (configurable via `REACT_APP_RPC_URL`), with an automatic test airdrop on session start

### Testing

```bash
# Client-side cryptographic and IDL test suite
cd app && npm test -- --watchAll=false
cd ..

# Anchor on-chain test suite
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

Must be run **after** `anchor build`, since the test imports generated types from `target/types/solana_messenger`.

```bash
# formatting check
npx prettier --check "app/src/**/*.{js,jsx,css,json}" "tests/**/*.ts"
```

### Security Model

**Never leaves the client:** Ed25519 private key, X25519 private key, message plaintext.

**Publicly visible on-chain:** wallet addresses, chat existence, X25519 public keys, message count/direction/timestamps, ciphertext length.

### License

MIT

---

## Русский

Децентрализованное приложение для end-to-end зашифрованного обмена сообщениями «1-на-1» на блокчейне Solana, построенное на Anchor, TweetNaCl и React 19.

Поддерживает клиентское аутентифицированное шифрование, детерминированную ончейн-адресацию (PDA), некастодиальную деривацию ключей из одной seed-фразы и обновления в реальном времени через события Anchor.

### Ключевые возможности

* **Сквозное шифрование** — сообщения шифруются в браузере через TweetNaCl (X25519 + XSalsa20-Poly1305); смарт-контракт хранит только шифротекст.
* **Некастодиальная деривация ключей** — единая 12-словная BIP-39 мнемоника детерминированно порождает и Ed25519-ключ подписи, и X25519-ключ шифрования через разные пути SLIP-0010.
* **Защищённое локальное хранилище** — мнемоника шифруется через Argon2id + `nacl.secretbox` (XSalsa20-Poly1305) перед записью в `localStorage`; в открытом виде не хранится никогда.
* **Детерминированный chat PDA** — для каждой пары кошельков существует ровно один канонический chat-аккаунт, вычисляемый из отсортированных публичных ключей, независимо от инициатора.
* **Транзакционный обмен ключами** — участники публикуют X25519 публичные ключи ончейн; обе стороны независимо вычисляют один и тот же общий секрет по ECDH.
* **Обновления в реальном времени** — приглашения, регистрация ключей и новые сообщения доставляются через события Anchor (WebSocket), без polling.
* **Удаление чата и возврат ренты** — `close_chat` обнуляет аккаунт и гарантированно возвращает депонированную ренту первоначальному создателю чата (chat.payer).

### Технологический стек

| Категория | Технология |
| :--- | :--- |
| **Блокчейн** | Solana |
| **Фреймворк смарт-контракта** | Anchor 0.31.0 |
| **Язык контракта** | Rust (edition 2021) |
| **Фронтенд** | React 19, React Router 7 |
| **Сборка** | Create React App + CRACO |
| **Web3-клиент** | `@solana/web3.js` ^1.98.0, `@coral-xyz/anchor` ^0.31.1 |
| **Криптография** | TweetNaCl (X25519, XSalsa20-Poly1305) |
| **Деривация ключей** | BIP-39, `ed25519-hd-key` (SLIP-0010) |
| **Password KDF** | Argon2id (`argon2-browser`, WASM) |
| **Стили** | CSS Modules |
| **Тестирование** | TypeScript, Mocha, ts-mocha, Chai |
| **Форматирование** | Prettier |

### Архитектура

Приложение разделяет клиентскую криптографию, слой Anchor RPC и ончейн-логику программы:

```text
React (UI и локальное состояние)
        │
        ▼
Клиентский крипто-слой (деривация ключей, TweetNaCl box)
        │
        ▼
Anchor-клиент (RPC, сериализация, подписка на события)
        │
        ▼
Solana-программа (ончейн-инструкции)
        │
        ▼
Solana ledger (localnet / devnet / mainnet)
```

```text
solana-messenger/
├── Anchor.toml                 # Конфигурация Anchor workspace и Program ID
├── Cargo.toml                  # Манифест Rust workspace
├── package.json                # Корневые скрипты и тестовые зависимости
├── programs/
│   └── solana-messenger/
│       └── src/
│           └── lib.rs           # Логика программы: инструкции, аккаунты, события
├── migrations/
│   └── deploy.ts
├── tests/
│   └── solana-messenger.ts     # Тест деривации PDA
└── app/                         # Фронтенд React
    ├── craco.config.js          # Полифилы Webpack и поддержка WASM
    └── src/
        ├── App.js               # Маршрутизация и auth guard
        ├── pages/
        │   ├── Register.jsx     # Генерация мнемоники и установка пароля
        │   ├── Login.jsx        # Импорт мнемоники и разблокировка
        │   └── Home.jsx         # Список чатов, приглашения, переписка
        └── solana/
            ├── solana.js        # Web3/Anchor-обвязка и криптография
            └── solana_messenger.json # Anchor IDL
```

Страницы фронтенда делегируют работу с кошельком, криптографией и RPC модулю `solana/solana.js`, оставляя React-компоненты сфокусированными на UI-состоянии.

### Шифрование и обмен ключами

Конфиденциальность сообщений устанавливается на клиенте, до того как данные попадают в блокчейн:

1. Оба участника выводят X25519-пару из своей BIP-39 мнемоники (путь `m/44'/501'/0'/1'`) и публикуют **публичную** часть через `set_encryption_key`.
2. После публикации обоих ключей каждый клиент независимо вычисляет один и тот же общий секрет: `nacl.box.before(peerPublicKey, ownSecretKey)`.
3. Каждое исходящее сообщение шифруется со свежим случайным 24-байтным nonce: `nacl.box.after(plaintext, nonce, sharedSecret)`.
4. Получившийся шифротекст, nonce, индекс отправителя и timestamp отправляются через `send_message` — plaintext никогда не покидает браузер.
5. Получатель расшифровывает входящий шифротекст на клиенте через `nacl.box.open.after()` при получении события `MessageSent`.

Таким образом смарт-контракт остаётся полностью «слепым» к содержимому сообщений: он валидирует аккаунты и хранит байты, но никогда не расшифровывает данные сам.

### Ончейн-модель данных

Каждый chat-аккаунт выделяет **фиксированный буфер в 10 240 байт**:

```rust
#[account]
pub struct Chat {
    pub participant1: Pubkey,                            // 32 байта
    pub participant2: Pubkey,                            // 32 байта
    pub payer: Pubkey,                                   // 32 байта
    pub participant1_encryption_key: Option<[u8; 32]>,   // 33 байта
    pub participant2_encryption_key: Option<[u8; 32]>,   // 33 байта
    pub messages: Vec<Message>,                          // 4 + N байт
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Message {
    pub sender: u8,        // 0 = participant1, 1 = participant2
    pub content: Vec<u8>,  // шифротекст (включает 16-байтный тег Poly1305)
    pub nonce: [u8; 24],
    pub timestamp: i64,    // Clock::get()?.unix_timestamp
}
```

Фиксированный ончейн-оверхед составляет `1 + 4 + 24 + 8 = 37` байт плюс длина шифротекста (53 байта суммарного оверхеда над исходным сообщением с учётом 16-байтного тега Poly1305).

### Инструкции программы

Программа: `solana_messenger`

* **`initialize_chat`** — создаёт детерминированный chat PDA (`[b"chat", min(pubkey1, pubkey2), max(pubkey1, pubkey2)]`), требуя `participant1 < participant2`. Эмитирует `ChatInitialized`.
* **`set_encryption_key(encryption_key: [u8; 32])`** — регистрирует X25519 публичный ключ вызывающего (однократная запись; отклоняет повторные перезаписи и дубликаты). Эмитирует `EncryptionKeySet`.
* **`send_message(content: Vec<u8>, nonce: [u8; 24])`** — требует наличия обоих encryption keys, проверяет валидность данных и параметры хранилища, затем добавляет сообщение. Эмитирует `MessageSent`.
* **`close_chat`** — обнуляет аккаунт и возвращает всю ренту создателю чата (`chat.payer`). Эмитирует `ChatClosed`.

### Быстрый старт

**Требования:** Node.js 18+, Yarn 1.22+, Rust и Cargo, Solana CLI 1.18+, Anchor CLI 0.31.0

```bash
git clone https://github.com/v0net/solana-e2ee-messenger.git
cd solana-e2ee-messenger

yarn install
cd app && yarn install && cd ..
```

Запуск локального валидатора и деплой программы:

```bash
# Терминал 1
solana-test-validator

# Терминал 2
anchor build
anchor deploy
```

Убедитесь, что Program ID совпадает в:
1. `declare_id!(...)` в `programs/solana-messenger/src/lib.rs`
2. `[programs.localnet]` в `Anchor.toml`
3. `"address"` в `app/src/solana/solana_messenger.json`

Запуск фронтенда:

```bash
cd app
yarn start
```

* **Приложение:** http://localhost:3000
* **RPC:** по умолчанию localnet `http://127.0.0.1:8899` (настраивается через `REACT_APP_RPC_URL`), с автоматическим тестовым airdrop при старте сессии

### Тестирование

```bash
# Набор тестов клиентской криптографии и IDL
cd app && npm test -- --watchAll=false
cd ..

# Набор тестов смарт-контракта Anchor
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

Должно выполняться **после** `anchor build`, поскольку тест импортирует сгенерированные типы из `target/types/solana_messenger`.

```bash
# проверка форматирования
npx prettier --check "app/src/**/*.{js,jsx,css,json}" "tests/**/*.ts"
```

### Модель безопасности

**Никогда не покидает клиент:** приватный Ed25519-ключ, приватный X25519-ключ, plaintext сообщений.

**Публично видно ончейн:** адреса кошельков, факт существования чата, X25519 публичные ключи, количество/направление/время сообщений, длина шифротекста.

### Лицензия

MIT
