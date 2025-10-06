import { RequestOTP, requestOtp, verifyOtp } from '@/api/auth';
import { clearWifi } from '@/utils/wifiCreds';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { clearAuth, getToken, getUser, setToken, setUser } from '../utils/storage';

interface AuthContextValue {
  user: any;
  loading: boolean;
  logout: () => Promise<void>;
  signInWithPhone: (phone: string) => Promise<string>;
  verifyOTP: (phone: string, token: string) => Promise<{ error: any }> | Promise<any>;
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

  const verifyOTP = async (transactionId: string, otp: string) => {
    if(!otp) {
      return { error: { message: 'Invalid OTP' }};
    }

    try {
      const response = await verifyOtp(transactionId, otp);
      if("error" in response) {
        return {error: response.error};
      }

      if("jwtToken" in response) {
        const { jwtToken, user } = response
        setToken(jwtToken);
        setUser(user);
        setUserState(user);
      }
    } catch(err) {
      console.log("error in verify otp", err)
    }
  }

  const logout = async () => {
    await clearAuth();
    await clearWifi();
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, signInWithPhone, verifyOTP }}>
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