"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserSession } from "amazon-cognito-identity-js";

const pool = typeof window !== "undefined" && process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID && process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
  ? new CognitoUserPool({
      UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
      ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
    })
  : null;

interface AuthCtx {
  user: CognitoUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthCtx>({
  user: null, loading: true, login: async () => {}, logout: () => {}, getToken: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CognitoUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pool) { setLoading(false); return; }
    const currentUser = pool.getCurrentUser();
    if (currentUser) {
      currentUser.getSession((err: any) => {
        if (!err) setUser(currentUser);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    if (!pool) throw new Error("Cognito 未配置");
    return new Promise<void>((resolve, reject) => {
      const cognitoUser = new CognitoUser({ Username: username, Pool: pool });
      cognitoUser.authenticateUser(new AuthenticationDetails({ Username: username, Password: password }), {
        onSuccess: () => { setUser(cognitoUser); resolve(); },
        onFailure: (err) => reject(err),
        newPasswordRequired: () => reject(new Error("需要重置密码")),
      });
    });
  }, []);

  const logout = useCallback(() => {
    user?.signOut();
    setUser(null);
  }, [user]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    return new Promise((resolve) => {
      user.getSession((err: any, session: CognitoUserSession | null) => {
        resolve(err ? null : session?.getIdToken().getJwtToken() || null);
      });
    });
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}
