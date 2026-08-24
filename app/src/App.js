import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";

// Temporary route placeholders during initial layout wiring
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
