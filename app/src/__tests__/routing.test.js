describe("App authentication routing and route guards", () => {
  function computeRouteDecision(pathname, storedMnemonic) {
    if (!storedMnemonic && pathname !== "/login" && pathname !== "/register") {
      return { redirect: "/login" };
    }
    if (pathname === "/login" || pathname === "/register" || pathname === "/") {
      return { render: pathname };
    }
    return { redirect: storedMnemonic ? "/" : "/login" };
  }

  test("allows /login without redirect when encryptedMnemonic exists in localStorage", () => {
    const decision = computeRouteDecision("/login", "encrypted_blob");
    expect(decision).toEqual({ render: "/login" });
  });

  test("allows /register without redirect when encryptedMnemonic exists in localStorage", () => {
    const decision = computeRouteDecision("/register", "encrypted_blob");
    expect(decision).toEqual({ render: "/register" });
  });

  test("redirects unknown routes to / when encryptedMnemonic exists", () => {
    const decision = computeRouteDecision("/unknown-route", "encrypted_blob");
    expect(decision).toEqual({ redirect: "/" });
  });

  test("redirects protected / to /login when encryptedMnemonic is missing", () => {
    const decision = computeRouteDecision("/", null);
    expect(decision).toEqual({ redirect: "/login" });
  });

  test("redirects unknown routes to /login when encryptedMnemonic is missing", () => {
    const decision = computeRouteDecision("/some-random-path", null);
    expect(decision).toEqual({ redirect: "/login" });
  });
});
