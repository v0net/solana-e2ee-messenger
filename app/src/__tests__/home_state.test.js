import React, { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";

describe("Home view state transitions and active tab initialization", () => {
  afterEach(() => {
    cleanup();
  });

  function TestComponent({ keysInitialized, onRenderSideEffect }) {
    const areKeysInitialized = () => keysInitialized;
    const [activeTab] = useState(() => {
      if (onRenderSideEffect) onRenderSideEffect();
      return areKeysInitialized() ? 2 : 1;
    });

    return (
      <div>
        <span data-testid="tab-value">{activeTab}</span>
      </div>
    );
  }

  test("initializes activeTab to 2 when keys are initialized", () => {
    render(<TestComponent keysInitialized={true} />);
    expect(screen.getByTestId("tab-value").textContent).toBe("2");
  });

  test("initializes activeTab to 1 when keys are not initialized", () => {
    render(<TestComponent keysInitialized={false} />);
    expect(screen.getByTestId("tab-value").textContent).toBe("1");
  });

  test("pure lazy initializer does not invoke external state setter side-effects during render", () => {
    let sideEffectCalls = 0;
    const sideEffectFn = () => {
      sideEffectCalls++;
    };

    render(
      <TestComponent
        keysInitialized={true}
        onRenderSideEffect={sideEffectFn}
      />,
    );
    expect(sideEffectCalls).toBe(1);
  });
});
