import { Role } from '@/constants/types';
import client from './client';

export interface RequestOTP {
  transaction_id: string;
}

export interface User {
  id: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  role: Role
}

export type AuthenticatedUser = {
  success: boolean;
  jwtToken: string;
  user: User;
}

export type AuthStatus =
  | 'authenticated'
  | 'change_passcode_required'
  | 'email_required';

export type PasscodeAuthenticated = {
  success: true;
  status: 'authenticated';
  jwtToken: string;
  user: User & {
    passcodeChangeRequired?: boolean;
    emailRequired?: boolean;
  };
};

export type PasscodeOnboarding = {
  success: true;
  status: 'change_passcode_required' | 'email_required';
  challengeToken: string;
  user: Partial<User> & Pick<User, 'id' | 'phone' | 'role'>;
};

export type PasscodeAuthResponse =
  | PasscodeAuthenticated
  | PasscodeOnboarding
  | AuthenticatedFailed;

export type AuthenticatedFailed = {
  success: false;
  error: string;
  message?: string;
}

export async function requestOtp(phone: string): Promise<RequestOTP> {
  return client.post('/user/request-otp', {phone}).then(res => res.data);
}

export async function verifyOtp(transactionId: string, code: string): Promise<AuthenticatedUser | AuthenticatedFailed> {
  return client.post('/user/verify-otp', {transaction_id: transactionId, code}).then(res => res.data);
}

export async function loginWithPasscode(
  phone: string,
  passcode: string,
): Promise<PasscodeAuthResponse> {
  return client.post('/user/login', { phone, passcode }).then(res => res.data);
}

export async function changePasscode(
  payload: {
    currentPasscode: string;
    newPasscode: string;
    confirmPasscode: string;
  },
  token: string,
): Promise<PasscodeAuthResponse> {
  return client
    .post('/user/change-passcode', payload, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .then(res => res.data);
}

export async function completeMandatoryEmail(
  email: string,
  token: string,
): Promise<PasscodeAuthResponse> {
  return client
    .post('/user/complete-email', { email }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    .then(res => res.data);
}

export async function getProfile() : Promise<User> {
  return client.get('/user').then(res => res.data.user);
}

export async function updateProfile(payload: {
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
}) : Promise<User> {
  return client.patch('/user', payload).then(res => res.data.user);
}

export async function deactivateAccount(
  userId: string,
) : Promise<{ success: boolean; message?: string }> {
  const safeId = encodeURIComponent(String(userId || "").trim());
  return client
    .patch(`/user/${safeId}/deactivate`)
    .then((res) => res.data);
}
