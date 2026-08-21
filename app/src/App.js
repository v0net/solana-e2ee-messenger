import { Routes, Route, Navigate, useLocation } from "react-router-dom";

// Temporary route placeholders during initial layout wiring
const Login = () => (
  <div className="auth-placeholder">
    <h2>Solana Messenger - Login</h2>
    <p>Please enter your seed phrase or password to unlock wallet.</p>
  </div>
);
const Register = () => (
  <div className="auth-placeholder">
    <h2>Solana Messenger - Register</h2>
    <p>Generate new keypair and write down your mnemonic words.</p>
  </div>
);
const Home = () => (
  <div className="home-placeholder">
    <h2>Messenger Dashboard</h2>
    <p>Connect wallet to start decentralized messaging.</p>
  </div>
);

function App() {
  const location = useLocation();

  const storedMnemonic = localStorage.getItem("encryptedMnemonic");

  if (
    !storedMnemonic &&
    location.pathname !== "/login" &&
    location.pathname !== "/register"
  ) {
    return <Navigate to="/login" />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<Home />} />
      <Route
        path="*"
        element={<Navigate to={storedMnemonic ? "/" : "/login"} />}
      />
    </Routes>
  );
}

export default App;
