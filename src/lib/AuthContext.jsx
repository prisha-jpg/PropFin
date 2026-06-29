import React, { createContext, useState, useContext, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // Load public settings
      try {
        const response = await fetch(`/api/apps/public/prod/public-settings/by-id/${appParams.appId || 'default'}`);
        const publicSettings = await response.json();
        setAppPublicSettings(publicSettings);
      } catch (appError) {
        console.warn('Public settings could not be fetched:', appError);
      }
      setIsLoadingPublicSettings(false);

      // Verify active user session
      const storedToken = window.localStorage.getItem("propfin_access_token") || window.localStorage.getItem("token");
      if (storedToken) {
        await verifySession();
      } else {
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('App state init failed:', error);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
    }
  };

  const verifySession = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await apiClient.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      console.warn('Session verification failed, logging out:', error);
      window.localStorage.removeItem("propfin_access_token");
      window.localStorage.removeItem("token");
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const login = async (email, password) => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const response = await apiClient.auth.login(email, password);
      if (response && response.token) {
        window.localStorage.setItem("propfin_access_token", response.token);
        window.localStorage.setItem("token", response.token);
        setUser(response.user);
        setIsAuthenticated(true);
        return { success: true };
      } else {
        throw new Error("Invalid response payload from server");
      }
    } catch (error) {
      setAuthError(error.message || "Failed to log in");
      setIsAuthenticated(false);
      throw error;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const signup = async (signupData) => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const response = await apiClient.auth.signup(signupData);
      if (response && response.token) {
        window.localStorage.setItem("propfin_access_token", response.token);
        window.localStorage.setItem("token", response.token);
        setUser(response.user);
        setIsAuthenticated(true);
        return { success: true };
      } else {
        throw new Error("Invalid response payload from server");
      }
    } catch (error) {
      setAuthError(error.message || "Failed to sign up");
      setIsAuthenticated(false);
      throw error;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const googleLogin = async (credential) => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const response = await apiClient.auth.googleLogin(credential);
      if (response && response.token) {
        window.localStorage.setItem("propfin_access_token", response.token);
        window.localStorage.setItem("token", response.token);
        setUser(response.user);
        setIsAuthenticated(true);
        return { success: true };
      } else {
        throw new Error("Google login verification failed");
      }
    } catch (error) {
      setAuthError(error.message || "Google Sign-in failed");
      setIsAuthenticated(false);
      throw error;
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = () => {
    window.localStorage.removeItem("propfin_access_token");
    window.localStorage.removeItem("token");
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      login,
      signup,
      googleLogin,
      logout,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
