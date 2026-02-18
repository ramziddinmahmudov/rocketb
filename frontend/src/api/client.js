/**
 * Axios client with Telegram WebApp auth interceptor.
 *
 * Every request automatically carries the `X-Telegram-Auth` header
 * containing the raw `initData` string from the Telegram Mini App SDK.
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Auth Interceptor ──────────────────────────────────
client.interceptors.request.use((config) => {
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) {
    config.headers['X-Telegram-Init-Data'] = tg.initData;
  }
  return config;
});

// ── Response error logging ────────────────────────────
client.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[API Error]', error.response?.status, error.response?.data);
    return Promise.reject(error);
  }
);

// ── API Methods ───────────────────────────────────────
export const api = {
  /**
   * Send a vote (fire rockets).
   * @param {string} battleId - UUID of the active battle
   * @param {number} amount   - rockets to spend
   */
  vote: (battleId, amount) =>
    client.post('/api/vote', { battle_id: battleId, amount }),

  /**
   * Get user profile / balance.
   */
  getProfile: () => client.get('/api/profile'),
};

export default client;
