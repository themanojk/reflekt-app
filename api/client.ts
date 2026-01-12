import axios from "axios";
import { getToken } from "../utils/storage";

const client = axios.create({
  baseURL: "https://reflekt.onrender.com", // your API base
  timeout: 10000,
});

client.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  console.log(config);
  return config;
});

export default client;
