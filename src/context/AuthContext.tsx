import React, { createContext, useContext, useEffect, useState } from "react";
import {
  type User,
  type AuthResponse,
  getCurrentUser,
  loginUser,
  registerUser,
  logoutUser,
} from "@/lib/auth";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: { email: string; password: string }) => Promise<AuthResponse>;
  register: (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword?: string;
  }) => Promise<AuthResponse>;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = () => {
    try {
      const current = getCurrentUser();
      setUser(current);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const handleLogin = async (credentials: { email: string; password: string }): Promise<AuthResponse> => {
    const res = await loginUser(credentials);
    if (res.success && res.user) {
      setUser(res.user);
    }
    return res;
  };

  const handleRegister = async (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword?: string;
  }): Promise<AuthResponse> => {
    const res = await registerUser(data);
    if (res.success && res.user) {
      setUser(res.user);
    }
    return res;
  };

  const handleLogout = () => {
    logoutUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login: handleLogin,
        register: handleRegister,
        logout: handleLogout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
