/**
 * Axios client with Telegram WebApp auth interceptor.
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
  } else {
    console.warn('[API] No Telegram initData found.');
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
  // Expose the raw axios client for direct calls
  client,

  // Profile
  getProfile: () => client.get('/api/profile'),

  // Battle
  joinBattle: () => client.post('/api/battle/join'),
  getBattle: (battleId) => client.get(`/api/battle/${battleId}`),
  advanceRound: (battleId) => client.post(`/api/battle/${battleId}/advance`),

  // Voting
  vote: (battleId, amount) =>
    client.post('/api/vote', { battle_id: battleId, amount }),

  // Rooms
  createRoom: (name = 'Battle Room') =>
    client.post('/api/room/create', { name }),
  joinRoom: (inviteCode) =>
    client.post(`/api/room/join/${inviteCode}`),
  getRoom: (roomId) =>
    client.get(`/api/room/${roomId}`),
  listRooms: () =>
    client.get('/api/rooms/active'),
  deleteRoom: (roomId) =>
    client.delete(`/api/room/${roomId}`),

  // Daily Tasks
  getDailyTasks: () =>
    client.get('/api/daily-tasks'),
  claimTask: (taskId) =>
    client.post(`/api/daily-tasks/${taskId}/claim`),

  // Gifts
  sendGift: (receiverId, amount) =>
    client.post('/api/gift', { receiver_id: receiverId, amount }),
  getGiftLimit: (receiverId) =>
    client.get(`/api/gift/limit/${receiverId}`),

  // Payment / Invoice
  createInvoice: (type, items) =>
    client.post('/api/payment/create-invoice', { type, items }),
};

export default client;
