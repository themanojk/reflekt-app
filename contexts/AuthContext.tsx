import {
  changePasscode,
  completeMandatoryEmail,
  loginWithPasscode,
  PasscodeAuthResponse,
  PasscodeAuthenticated,
  RequestOTP,
  requestOtp,
  verifyOtp,
} from '@/api/auth';
import { fetchServiceIds } from '@/api/service';
import { unregisterCurrentPushToken } from '@/services/pushNotifications';
import { clearWidgetData } from '@/utils/widgetSync';
import { clearWifi } from '@/utils/wifiCreds';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { clearAuth, getToken, getUser, setESPServiceIds, setToken, setUser } from '../utils/storage';

interface AuthContextValue {
  user: any;
  loading: boolean;
  logout: () => Promise<void>;
  signInWithPhone: (phone: string) => Promise<string>;
  verifyOTP: (phone: string, token: string) => Promise<{ error: any }> | Promise<any>;
  loginPasscode: (phone: string, passcode: string) => Promise<PasscodeAuthResponse>;
  changeUserPasscode: (
    payload: {
      currentPasscode: string;
      newPasscode: string;
      confirmPasscode: string;
    },
    token: string,
  ) => Promise<PasscodeAuthResponse>;
  completeEmail: (email: string, token: string) => Promise<PasscodeAuthResponse>;
}
export const AuthContext = createContext<AuthContextValue>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // on mount, load token + user
    (async () => {
      const token = await getToken();
      const user = await getUser();
      if (token && user) setUserState(user);
      setLoading(false);
    })();
  }, []);

  const signInWithPhone = async (phone: string) => {
    const data: RequestOTP = await requestOtp(phone);
    return data.transaction_id;
  };

  const persistAuthenticatedUser = async (response: PasscodeAuthenticated) => {
    const { jwtToken, user } = response;
    await setToken(jwtToken);
    const services = await fetchServiceIds();
    await setESPServiceIds(services);
    await setUser(user);
    setUserState(user);
  };

  const loginPasscode = async (phone: string, passcode: string) => {
    const response = await loginWithPasscode(phone, passcode);
    if (response.success && response.status === 'authenticated') {
      await persistAuthenticatedUser(response);
    }
    return response;
  };

  const changeUserPasscode = async (
    payload: {
      currentPasscode: string;
      newPasscode: string;
      confirmPasscode: string;
    },
    token: string,
  ) => {
    const response = await changePasscode(payload, token);
    if (response.success && response.status === 'authenticated') {
      await persistAuthenticatedUser(response);
    }
    return response;
  };

  const completeEmail = async (email: string, token: string) => {
    const response = await completeMandatoryEmail(email, token);
    if (response.success && response.status === 'authenticated') {
      await persistAuthenticatedUser(response);
    }
    return response;
  };

  const verifyOTP = async (transactionId: string, otp: string) => {
    if (!otp) {
      return { error: { message: "Invalid OTP" } };
    }

    try {
      const response = await verifyOtp(transactionId, otp);
      if ("error" in response) {
        return { error: response.error };
      }

      if ("jwtToken" in response) {
        await persistAuthenticatedUser({
          success: true,
          status: 'authenticated',
          jwtToken: response.jwtToken,
          user: response.user,
        });
        return { error: null };
      }
      return { error: { message: "Unexpected login response" } };
    } catch (err: any) {
      const apiMessage =
        err?.response?.data?.err ||
        err?.response?.data?.error ||
        err?.message ||
        "Login failed";
      return { error: { message: apiMessage } };
    }
  };

  const logout = async () => {
    try {
      await unregisterCurrentPushToken();
    } catch (error) {
      console.warn("Push unregister failed", error);
    }
    await clearWidgetData();
    await clearAuth();
    await clearWifi();
    setUserState(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        logout,
        signInWithPhone,
        verifyOTP,
        loginPasscode,
        changeUserPasscode,
        completeEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
