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

export type AuthenticatedFailed = {
  success: boolean;
  error: string;
}

export async function requestOtp(phone: string): Promise<RequestOTP> {
  return client.post('/user/request-otp', {phone}).then(res => res.data);
}

export async function verifyOtp(transactionId: string, code: string): Promise<AuthenticatedUser | AuthenticatedFailed> {
  return client.post('/user/verify-otp', {transaction_id: transactionId, code}).then(res => res.data);
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
