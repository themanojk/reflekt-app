import axios from 'axios';
import { getToken } from '../utils/storage';

const client = axios.create({
  baseURL: 'http://192.168.0.249:3100', // your API base
  timeout: 10000,
});

client.interceptors.request.use(async config => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;
