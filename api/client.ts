import axios from "axios";
import { getToken } from "../utils/storage";

const client = axios.create({
  baseURL: "https://reflekt.onrender.com", // your API base
  timeout: 10000,
});

client.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default client;
