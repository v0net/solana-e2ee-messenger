import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Home from "./pages/Home.jsx";

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
