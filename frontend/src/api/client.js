/**
 * API Client — Real backend calls via Axios.
 * Telegram initData is sent via header for authentication.
 */
import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://rocket-bot-production.up.railway.app/api/v1',
  timeout: 15000,
});

// ── Request interceptor: attach Telegram initData ─────
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

// ── Helper: get current user telegram_id ──────────────
const getTelegramId = () => {
  // Use real ID from Telegram if available, fallback to mock ID 123456789 for testing in a normal browser
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 123456789;
};

// ── API Methods ───────────────────────────────────────
export const api = {
  // Expose the raw axios client for direct calls
  client,

  // ── Users / Profile ─────────────────────────────────
  getProfile: () => {
    const tgId = getTelegramId();
    return client.get(`/users/${tgId}`);
  },
  getBalance: () => {
    const tgId = getTelegramId();
    return client.get(`/users/${tgId}/balance`);
  },
  getBattleHistory: () => {
    const tgId = getTelegramId();
    return client.get(`/users/${tgId}/battles`);
  },
  updateVipEmoji: (emoji) =>
    client.post('/users/emoji', { emoji }),

  // ── Battles ─────────────────────────────────────────
  getActiveBattles: () =>
    client.get('/battles'),
  getLobby: () =>
    client.get('/battles/lobby'),
  joinBattle: () => {
    const tgId = getTelegramId();
    return client.post('/battles/lobby/join', { telegram_id: tgId });
  },
  getBattle: (battleId) =>
    client.get(`/battles/${battleId}`),
  vote: (battleId, amount, extra = {}) => {
    const tgId = getTelegramId();
    return client.post(`/battles/${battleId}/vote`, {
      voter_id: tgId,
      amount,
      target_id: extra.target_id || null,
      ...extra,
    });
  },
  getVotes: (battleId) =>
    client.get(`/battles/${battleId}/votes`),

  // ── Rooms (if backend supports — kept for compatibility) ──
  createRoom: (name = 'Battle Room') =>
    client.post('/rooms/create', { name }),
  joinRoom: (inviteCode) =>
    client.post(`/rooms/join/${inviteCode}`),
  getRoom: (roomId) =>
    client.get(`/rooms/${roomId}`),
  listRooms: () =>
    client.get('/rooms/active'),
  deleteRoom: (roomId) =>
    client.delete(`/rooms/${roomId}`),

  // ── Daily Tasks ─────────────────────────────────────
  getDailyTasks: () =>
    client.get('/daily-tasks'),
  claimTask: (taskId) =>
    client.post(`/daily-tasks/${taskId}/claim`),

  // ── Gifts ───────────────────────────────────────────
  sendGift: (receiverId, amount) =>
    client.post('/gift', { receiver_id: receiverId, amount }),
  getGiftLimit: (receiverId) =>
    client.get(`/gift/limit/${receiverId}`),

  // ── Shop ────────────────────────────────────────────
  getPackages: () =>
    client.get('/shop/packages'),
  getVipInfo: () =>
    client.get('/shop/vip-info'),
  buyVipRockets: (data = {}) => {
    const tgId = getTelegramId();
    return client.post('/shop/buy-vip-rockets', { telegram_id: tgId, ...data });
  },

  // ── Payments ────────────────────────────────────────
  createInvoice: (type, items) =>
    client.post('/payments/create-invoice', { type, items }),

  // ── Leaderboard ─────────────────────────────────────
  getLeaderboard: (limit = 50) =>
    client.get('/leaderboard', { params: { limit } }),
};

export default client;
