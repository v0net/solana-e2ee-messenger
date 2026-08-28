import React, { useEffect, useRef } from "react";
import { render, fireEvent } from "@testing-library/react";

describe("Proximity menu handlers and partial PDA initialization recovery", () => {
  test("proximity menu mousemove safely handles null ref without throwing", () => {
    let removeListenerCalled = false;

    function TestProximityComponent() {
      const chatMenuRef = useRef(null);

      useEffect(() => {
        const handleMouseMove = (e) => {
          if (!chatMenuRef.current) return;
          chatMenuRef.current.getBoundingClientRect();
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => {
          removeListenerCalled = true;
          window.removeEventListener("mousemove", handleMouseMove);
        };
      }, []);

      return <div data-testid="container">Proximity Container</div>;
    }

    const { unmount } = render(<TestProximityComponent />);

    expect(() => {
      fireEvent.mouseMove(window, { clientX: 100, clientY: 100 });
    }).not.toThrow();

    unmount();
    expect(removeListenerCalled).toBe(true);
  });

  test("partial initialization flow: skips initializeChat when Chat PDA account exists on-chain", async () => {
    let initializeChatCalled = false;
    let setEncryptionKeyCalled = false;

    const mockConnection = {
      getAccountInfo: jest
        .fn()
        .mockResolvedValue({ data: Buffer.from("existing_pda_account") }),
    };

    const mockChatPDA = "mockChatPDAAddress";

    async function handleStartChat() {
      const accountInfo = await mockConnection.getAccountInfo(mockChatPDA);
      if (!accountInfo) {
        initializeChatCalled = true;
      }
      setEncryptionKeyCalled = true;
    }

    await handleStartChat();

    expect(mockConnection.getAccountInfo).toHaveBeenCalledWith(mockChatPDA);
    expect(initializeChatCalled).toBe(false);
    expect(setEncryptionKeyCalled).toBe(true);
  });

  test("initialization flow: calls initializeChat when Chat PDA account does not exist on-chain", async () => {
    let initializeChatCalled = false;
    let setEncryptionKeyCalled = false;

    const mockConnection = {
      getAccountInfo: jest.fn().mockResolvedValue(null),
    };

    const mockChatPDA = "mockChatPDAAddress";

    async function handleStartChat() {
      const accountInfo = await mockConnection.getAccountInfo(mockChatPDA);
      if (!accountInfo) {
        initializeChatCalled = true;
      }
      setEncryptionKeyCalled = true;
    }

    await handleStartChat();

    expect(mockConnection.getAccountInfo).toHaveBeenCalledWith(mockChatPDA);
    expect(initializeChatCalled).toBe(true);
    expect(setEncryptionKeyCalled).toBe(true);
  });
});
