// packages/web/src/context/AuthContext.jsx
import { createContext } from "react";
import { useAuthStore } from "../store/authStore.js";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const auth = useAuthStore();
  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
};