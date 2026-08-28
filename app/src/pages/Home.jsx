import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./css/Home.module.css";
import {
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
  verifyPassword,
  subscribeToChatInitialized,
  subscribeToEncryptionKeySet,
  subscribeToMessageSent,
  subscribeToChatDeleted,
  unsubscribeFromAll,
  clearSession,
  areKeysInitialized,
  checkChatExists,
} from "../solana/solana.js";

const Home = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState(() => (areKeysInitialized() ? 2 : 1));
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [isNotificationVisible, setIsNotificationVisible] = useState(false);
  const [notificationText, setNotificationText] = useState("");
  const [isChatMenuVisible, setIsChatMenuVisible] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [hasEncryptionKeys, setHasEncryptionKeys] = useState([false, false]);

  const messagesContainerRef = useRef(null);
  const chatMenuRef = useRef(null);
  const menuRef = useRef(null);
  const activeChatRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isChatMenuVisible || !chatMenuRef.current) return;

      const menuRect = chatMenuRef.current.getBoundingClientRect();
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      const distanceX = Math.max(
        menuRect.left - mouseX,
        0,
        mouseX - menuRect.right,
      );
      const distanceY = Math.max(
        menuRect.top - mouseY,
        0,
        mouseY - menuRect.bottom,
      );
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

      if (distance > 100) {
        setIsChatMenuVisible(false);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isChatMenuVisible]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isMenuVisible || !menuRef.current) return;

      const menuRect = menuRef.current.getBoundingClientRect();
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      const distanceX = Math.max(
        menuRect.left - mouseX,
        0,
        mouseX - menuRect.right,
      );
      const distanceY = Math.max(
        menuRect.top - mouseY,
        0,
        mouseY - menuRect.bottom,
      );
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

      if (distance > 100) {
        setIsMenuVisible(false);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isMenuVisible]);

  useEffect(() => {
    if (step !== 2) return;

    let isMounted = true;

    const fetchData = async () => {
      try {
        initializeData();
        setChats(await getChats());

        if (!isMounted) return;

        subscribeToChatInitialized((name) =>
          setChats((prevChats) =>
            prevChats.some((chat) => chat.name === name)
              ? prevChats
              : [
                  {
                    name: name,
                    lastMessage: null,
                    timestamp: null,
                  },
                  ...prevChats,
                ],
          ),
        );

        subscribeToEncryptionKeySet((encryptionKeys) =>
          setHasEncryptionKeys(encryptionKeys),
        );

        subscribeToMessageSent((name, sender, lastMessage, timestamp) => {
          setChats((prevChats) => {
            const existingChat = prevChats.find((chat) => chat.name === name);
            const chatToMove = existingChat
              ? {
                  ...existingChat,
                  lastMessage: lastMessage,
                  timestamp: timestamp,
                }
              : {
                  name: name,
                  lastMessage: lastMessage,
                  timestamp: timestamp,
                };
            const otherChats = prevChats.filter((chat) => chat.name !== name);
            return [chatToMove, ...otherChats];
          });
          if (activeChatRef.current && activeChatRef.current.name === name) {
            setMessages((prevMessages) => [
              ...prevMessages,
              {
                content: lastMessage,
                timestamp: timestamp,
                type: sender === name ? "incoming" : "outgoing",
              },
            ]);
          }
        });

        subscribeToChatDeleted((name) => {
          setChats((prevChats) =>
            prevChats.filter((chat) => chat.name !== name),
          );
          if (activeChatRef.current && activeChatRef.current.name === name) {
            activeChatRef.current = null;
            setActiveChat(null);
            setMessages([]);
          }
        });
      } catch (error) {
        setNotificationText(error.message);
        setIsNotificationVisible(true);
      }
    };

    fetchData().catch((error) => {
      setNotificationText(error.message);
      setIsNotificationVisible(true);
    });

    return () => {
      try {
        isMounted = false;
        unsubscribeFromAll();
      } catch (error) {
        setNotificationText(error.message);
        setIsNotificationVisible(true);
      }
    };
  }, [step]);

  useEffect(() => {
    let timeoutId;

    if (isNotificationVisible) {
      timeoutId = setTimeout(() => setIsNotificationVisible(false), 5000);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isNotificationVisible]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const handleSearchSubmit = (event) => {
    try {
      if (event.key !== "Enter" || !searchValue.trim()) return;
      if (!isValidPublicKey(searchValue)) {
        setNotificationText("Invalid public key");
        setIsNotificationVisible(true);
        return;
      }
      if (chats.some((chat) => chat.name === searchValue.trim())) {
        setNotificationText("A chat with this user already exists");
        setIsNotificationVisible(true);
        return;
      }
      if (getUserSigningPublicKey() === searchValue.trim()) {
        setNotificationText("You cannot add yourself");
        setIsNotificationVisible(true);
        return;
      }
      const newChat = {
        name: searchValue,
        lastMessage: null,
        time: null,
      };
      initializeChatData(searchValue);
      setActiveChat(newChat);
      setSearchValue("");
    } catch (error) {
      setNotificationText(error.message);
      setIsNotificationVisible(true);
    }
  };

  const handleChatClick = async (chat) => {
    try {
      setMessageInput("");
      initializeChatData(chat.name);
      setHasEncryptionKeys(await checkEncryptionKeys());
      setMessages(
        (await getMessages()).map(({ content, timestamp, sender }) => ({
          content,
          timestamp,
          type: sender === chat.name ? "incoming" : "outgoing",
        })),
      );
      setActiveChat(chat);
    } catch (error) {
      setNotificationText(error.message);
      setIsNotificationVisible(true);
    }
  };

  const handleSendMessage = async () => {
    try {
      if (!messageInput.trim()) return;
      setMessageInput("");
      await sendMessage(messageInput);
    } catch (error) {
      setNotificationText(error.message);
      setIsNotificationVisible(true);
    }
  };

  const handleDeleteChat = async () => {
    try {
      setIsChatMenuVisible(false);
      setActiveChat(null);
      await closeChat();
    } catch (error) {
      setNotificationText(error.message);
      setIsNotificationVisible(true);
    }
  };

  const handleLogout = () => {
    clearSession();
    localStorage.clear();
    navigate("/login");
  };

  const handleSendInvite = async () => {
    try {
      const chatExists = await checkChatExists();
      if (!chatExists) {
        await initializeChat();
      }
      await setEncryptionKey();
      const [hasUserKey, hasPeerKey] = await checkEncryptionKeys();
      setHasEncryptionKeys([hasUserKey, hasPeerKey]);
    } catch (error) {
      setNotificationText(error.message);
      setIsNotificationVisible(true);
    }
  };

  const handleAcceptInvite = async () => {
    try {
      await setEncryptionKey();
      const [hasUserKey, hasPeerKey] = await checkEncryptionKeys();
      setHasEncryptionKeys([hasUserKey, hasPeerKey]);
    } catch (error) {
      setNotificationText(error.message);
      setIsNotificationVisible(true);
    }
  };

  const handleSubmitPassword = async () => {
    try {
      if (password.length < 8) {
        setPasswordError(true);
        return;
      }
      if (!(await verifyPassword(password))) {
        setPasswordError(true);
        return;
      }
      setPassword("");
      setStep(2);
    } catch (error) {
      setNotificationText(error.message);
      setIsNotificationVisible(true);
    }
  };

  return (
    <div className={styles.pageWrapper}>
      {isNotificationVisible && (
        <div className={styles.notification}>{notificationText}</div>
      )}
      {step === 1 ? (
        <div className={styles.loginContainer}>
          <div key={step} className={styles.formCard}>
            <h2 className={styles.title}>Enter Password</h2>
            <div className={styles.passwordInputWrapper}>
              <label className={styles.passwordInputLabel}>Password</label>
              <div className={styles.passwordFieldContainer}>
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  className={`${styles.passwordInput} ${passwordError ? styles.error : ""}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  onFocus={() => setPasswordError(false)}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                >
                  <span className="material-icons">
                    {isPasswordVisible ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>
            <div className={styles.buttonContainer}>
              <button
                className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonPassword}`}
                type="submit"
                onClick={handleSubmitPassword}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.chatContainer}>
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <div
                className={styles.menuToggle}
                onClick={() => {
                  setIsMenuVisible((prev) => !prev);
                }}
              >
                <i className="material-icons">menu</i>
              </div>
              <div className={styles.searchBar}>
                <i className={`material-icons ${styles.searchBarIcon}`}>
                  search
                </i>
                <input
                  type="text"
                  placeholder="Search"
                  className={styles.searchBarInput}
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  onKeyDown={handleSearchSubmit}
                />
              </div>
              <ul
                ref={menuRef}
                className={`${styles.menu} ${isMenuVisible ? styles.active : ""}`}
              >
                <li onClick={handleLogout}>
                  <i className="material-icons">logout</i>Logout
                </li>
              </ul>
            </div>
            <div className={styles.chatsList}>
              {chats.map((chat, index) => (
                <div
                  key={index}
                  className={`${styles.chatItem} ${chat.name === activeChat?.name ? styles.active : ""}`}
                  onClick={() => handleChatClick(chat)}
                >
                  <div className={styles.chatAvatar}>
                    {chat.name[0].toUpperCase()}
                  </div>
                  <div className={styles.chatInfo}>
                    <div className={styles.chatTopLine}>
                      <span className={styles.chatName}>{chat.name}</span>
                      <span className={styles.chatTime}>
                        {chat.timestamp
                          ? new Date(chat.timestamp)
                              .toLocaleTimeString()
                              .slice(0, 5)
                          : "Now"}
                      </span>
                    </div>
                    <div className={styles.chatBottomLine}>
                      <span className={styles.chatLastMessage}>
                        {chat.lastMessage || "New chat"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.chatArea}>
            {activeChat ? (
              <>
                <div className={styles.chatHeader}>
                  <div className={styles.chatHeaderInfo}>
                    <div className={styles.chatAvatar}>
                      {activeChat.name[0].toUpperCase()}
                    </div>
                    <div className={styles.chatName}>{activeChat.name}</div>
                  </div>
                  <div
                    className={styles.chatMenuToggle}
                    onClick={() => {
                      setIsChatMenuVisible((prev) => !prev);
                    }}
                  >
                    <i className="material-icons">more_vert</i>
                  </div>
                  <ul
                    ref={chatMenuRef}
                    className={`${styles.chatMenu} ${isChatMenuVisible ? styles.active : ""}`}
                  >
                    <li onClick={handleDeleteChat}>
                      <i className="material-icons">delete</i>Delete chat
                    </li>
                  </ul>
                </div>
                <div className={styles.chatBody}>
                  <div
                    className={styles.messagesContainer}
                    ref={messagesContainerRef}
                  >
                    {messages.map((message, index) => {
                      const currentDate = new Date(
                        message.timestamp,
                      ).toLocaleDateString();
                      const prevDate =
                        index > 0
                          ? new Date(
                              messages[index - 1].timestamp,
                            ).toLocaleDateString()
                          : null;
                      const showDateHeader = currentDate !== prevDate;

                      return (
                        <React.Fragment key={index}>
                          {showDateHeader && (
                            <div className={styles.dateHeader}>
                              {currentDate}
                            </div>
                          )}
                          <div
                            className={`${styles.message} ${styles[message.type]}`}
                          >
                            <div className={styles.messageContent}>
                              <div className={styles.messageText}>
                                {message.content}
                              </div>
                              <div className={styles.messageTime}>
                                {new Date(message.timestamp)
                                  .toLocaleTimeString()
                                  .slice(0, 5)}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                  {hasEncryptionKeys[0] && hasEncryptionKeys[1] ? (
                    <div className={styles.chatInputContainer}>
                      <div className={styles.chatInputWrapper}>
                        <input
                          type="text"
                          placeholder="Message"
                          className={styles.messageInput}
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleSendMessage()
                          }
                        />
                      </div>
                      <div className={styles.sendButtonContainer}>
                        <button
                          className={styles.sendButton}
                          onClick={handleSendMessage}
                        >
                          <i className="material-icons">send</i>
                        </button>
                      </div>
                    </div>
                  ) : !hasEncryptionKeys[0] && !hasEncryptionKeys[1] ? (
                    <div className={styles.buttonContainer}>
                      <button
                        className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonStart}`}
                        onClick={handleSendInvite}
                      >
                        Invite to chat
                      </button>
                    </div>
                  ) : hasEncryptionKeys[0] && !hasEncryptionKeys[1] ? (
                    <div className={styles.buttonContainer}>
                      <button
                        className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonStart}`}
                        disabled
                      >
                        Waiting
                      </button>
                    </div>
                  ) : (
                    <div className={styles.buttonContainer}>
                      <button
                        className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonStart}`}
                        onClick={handleAcceptInvite}
                      >
                        Accept
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
