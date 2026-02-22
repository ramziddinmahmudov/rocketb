/**
 * App.jsx — Main layout for the Rocket Battle Mini App.
 *
 * Flow:
 *   1. RoomBrowser (main screen — browse, create, join rooms)
 *   2. BattleLobby (waiting for players in a room)
 *   3. BattleArena (active battle with tournament bracket)
 *
 * Bottom Nav: Tasks, Gift, Store
 */
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import RoomBrowser from './components/RoomBrowser';
import BattleArena from './components/BattleArena';
import BattleLobby from './components/BattleLobby';
import ControlPanel from './components/ControlPanel';
import DailyTasks from './components/DailyTasks';
import GiftRockets from './components/GiftRockets';
import StoreModal from './components/StoreModal';
import SplashScreen from './components/SplashScreen';
import useBattleSocket from './hooks/useBattleSocket';
import { api } from './api/client';

// ── Screens ──────────────────────────────────────────
const SCREEN = {
  ROOMS: 'rooms',
  LOBBY: 'lobby',
  ARENA: 'arena',
};

export default function App() {
  // ── State ──────────────────────────────────────────────
  const [balance, setBalance] = useState(10);
  const [isVip, setIsVip] = useState(false);
  const [username, setUsername] = useState('Player');
  const [myUserId, setMyUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [limit, setLimit] = useState(100);
  const [maxLimit, setMaxLimit] = useState(100);
  const [toast, setToast] = useState(null);

  // Screen navigation
  const [screen, setScreen] = useState(SCREEN.ROOMS);
  const [rooms, setRooms] = useState([]);
  const [isRoomsLoading, setIsRoomsLoading] = useState(false);

  // Battle state
  const [battleId, setBattleId] = useState(null);
  const [battleStatus, setBattleStatus] = useState('waiting');
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(4);
  const [participants, setParticipants] = useState([]);
  const [currentMatches, setCurrentMatches] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);

  const [isAuthError, setIsAuthError] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [isGiftOpen, setIsGiftOpen] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);

  // ── WebSocket ──────────────────────────────────────────
  const { scores, isConnected } = useBattleSocket(battleId);

  // ── Toast helper ───────────────────────────────────────
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Handle WS messages for round events
  useEffect(() => {
    if (scores?.type === 'round_started') {
      setCurrentRound(scores.round_number);
      setCurrentMatches([{
        player1_id: scores.player1_id,
        player2_id: scores.player2_id,
        player1_username: scores.player1_username,
        player2_username: scores.player2_username,
        player1_score: 0,
        player2_score: 0,
        duration_seconds: scores.duration_seconds,
        status: 'active',
      }]);
      setScreen(SCREEN.ARENA);
      setBattleStatus('active');
    }
    if (scores?.type === 'battle_finished') {
      setBattleStatus('finished');
    }
    if (scores?.type === 'player_joined') {
      refreshBattle();
    }
  }, [scores]);

  // ── Init Telegram WebApp & Fetch Profile ────────────────
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#050A18');
      tg.setBackgroundColor('#050A18');

      const user = tg.initDataUnsafe?.user;
      if (user?.first_name) setUsername(user.first_name);
      if (user?.id) setMyUserId(user.id);
    }

    const initApp = async () => {
      try {
        // 1. Get Profile
        const profileRes = await api.getProfile();
        setBalance(profileRes.data.balance);
        setIsVip(profileRes.data.is_vip);
        setLimit(profileRes.data.limit_remaining);
        setMaxLimit(profileRes.data.limit_max);
        if (profileRes.data.cooldown_seconds > 0) {
          setCooldown(profileRes.data.cooldown_seconds);
        }
        if (profileRes.data.user_id) setMyUserId(profileRes.data.user_id);

        const { username: uname, first_name } = profileRes.data;
        if (uname) setUsername(uname);
        else if (first_name) setUsername(first_name);

        // 2. Load rooms
        await loadRooms();

        // 3. Check if coming from room invite link
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
          // Auto-join room from invite link
          await handleJoinRoom(roomParam);
        }
      } catch (err) {
        console.error('Init failed:', err);
        if (err.response?.status === 401) {
          setIsAuthError(true);
          showToast('Autentifikatsiya xatosi. Telegramda oching.', 'error');
        } else {
          showToast('Yuklashda xatolik. Qayta yuklang.', 'error');
        }
      } finally {
        setIsAppReady(true);
      }
    };

    initApp();
  }, [showToast]);

  // ── Cooldown timer ─────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // ── Room actions ───────────────────────────────────────
  const loadRooms = async () => {
    setIsRoomsLoading(true);
    try {
      const { data } = await api.listRooms();
      setRooms(data.rooms || data || []);
    } catch (err) {
      console.error('Failed to load rooms:', err);
    } finally {
      setIsRoomsLoading(false);
    }
  };

  const handleCreateRoom = async (name) => {
    try {
      const { data } = await api.createRoom(name);
      showToast('✅ Xona yaratildi!', 'success');
      await loadRooms();
      // Auto-join the created room
      if (data.invite_code) {
        await handleJoinRoom(data.invite_code);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Xona yaratib bo\'lmadi';
      showToast(`❌ ${msg}`, 'error');
      throw err;
    }
  };

  const handleJoinRoom = async (inviteCode) => {
    try {
      const { data } = await api.joinRoom(inviteCode);
      setCurrentRoom(data);
      setBattleId(data.battle_id || null);
      setBattleStatus(data.battle_status || 'waiting');
      setParticipants(data.participants || []);
      setCurrentRound(data.current_round || 0);
      setTotalRounds(data.total_rounds || 4);

      if (data.battle_status === 'active') {
        setScreen(SCREEN.ARENA);
      } else {
        setScreen(SCREEN.LOBBY);
      }

      showToast('✅ Xonaga qo\'shildingiz!', 'success');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Xonaga kirib bo\'lmadi';
      showToast(`❌ ${msg}`, 'error');
    }
  };

  const handleDeleteRoom = async (roomId) => {
    try {
      await api.deleteRoom(roomId);
      showToast('🗑️ Xona o\'chirildi', 'success');
      await loadRooms();
    } catch (err) {
      const msg = err.response?.data?.detail || 'O\'chirib bo\'lmadi';
      showToast(`❌ ${msg}`, 'error');
    }
  };

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
    setBattleId(null);
    setBattleStatus('waiting');
    setParticipants([]);
    setScreen(SCREEN.ROOMS);
    loadRooms();
  };

  const refreshBattle = async () => {
    if (!battleId) return;
    try {
      const { data } = await api.getBattle(battleId);
      setParticipants(data.participants || []);
      setBattleStatus(data.status);
      setCurrentRound(data.current_round);
      setTotalRounds(data.total_rounds);
    } catch (err) {
      console.error('Failed to refresh battle:', err);
    }
  };

  // ── Fire handler ───────────────────────────────────────
  const handleFire = useCallback(
    async (amount) => {
      if (!battleId) {
        showToast('Xatolik: Aktiv battle topilmadi.', 'error');
        return;
      }
      if (battleStatus !== 'active') {
        showToast('Battle hali boshlanmagan!', 'error');
        return;
      }
      setIsLoading(true);
      try {
        const { data } = await api.vote(battleId, amount);
        setBalance(data.new_balance);
        if (data.cooldown_started) setCooldown(data.cooldown_seconds);
        if (data.remaining_limit !== undefined) setLimit(data.remaining_limit);

        if (data.player1_score !== undefined) {
          setCurrentMatches((prev) =>
            prev.map((m) => ({
              ...m,
              player1_score: data.player1_score,
              player2_score: data.player2_score,
            }))
          );
        }

        showToast(`🚀 ${amount} ta raketa otildi!`, 'success');
      } catch (err) {
        const msg = err.response?.data?.detail || 'Xatolik yuz berdi.';
        if (err.response?.status === 429) {
          const match = msg.match(/(\d+)s/);
          if (match) setCooldown(parseInt(match[1], 10));
        }
        showToast(`❌ ${msg}`, 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [battleId, battleStatus, showToast]
  );

  // ── Early returns AFTER all hooks ──────────────────────
  if (!isAppReady) return <SplashScreen />;

  if (isAuthError) {
    return (
      <div className="auth-error-screen">
        <div>
          <h1>❌ Autentifikatsiya xatosi</h1>
          <p>Telegram ma'lumotlarini tekshirib bo'lmadi.</p>
          <p className="sub">Iltimos, /start orqali qayta boshlang</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* Stars background */}
      <div className="stars-bg" />

      {/* Content */}
      <div className="app-content">
        {/* ── Header ────────────────────────────────────── */}
        <header className="app-header">
          <div className="header-left">
            {screen !== SCREEN.ROOMS && (
              <button className="back-btn" onClick={handleLeaveRoom}>
                ←
              </button>
            )}
            <motion.div className="avatar-circle" whileHover={{ scale: 1.1 }}>
              {username.charAt(0).toUpperCase()}
            </motion.div>
            <div>
              <p className="header-username">{username}</p>
              {isVip && <span className="vip-badge-small">👑 VIP</span>}
            </div>
          </div>

          <div className="header-right">
            <motion.div
              className="balance-card"
              whileHover={{ scale: 1.02 }}
              onClick={() => setIsStoreOpen(true)}
            >
              <span className="balance-rocket">🚀</span>
              <div className="balance-info">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={balance}
                    className="balance-number"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    transition={{ duration: 0.2 }}
                  >
                    {balance.toLocaleString()}
                  </motion.span>
                </AnimatePresence>
                <span className="balance-label">raketalar</span>
              </div>
              <div className="balance-plus">+</div>
            </motion.div>
          </div>
        </header>

        {/* ── Main Content ────────────────────────────────── */}
        <div className="main-content">
          {screen === SCREEN.ROOMS && (
            <RoomBrowser
              rooms={rooms}
              onJoinRoom={handleJoinRoom}
              onCreateRoom={handleCreateRoom}
              onDeleteRoom={handleDeleteRoom}
              onRefresh={loadRooms}
              isLoading={isRoomsLoading}
              myUserId={myUserId}
              showToast={showToast}
            />
          )}

          {screen === SCREEN.LOBBY && (
            <BattleLobby
              roomCode={currentRoom?.invite_code}
              roomName={currentRoom?.name || 'Battle Room'}
              participants={participants}
              maxPlayers={currentRoom?.max_players || 16}
              battleStatus={battleStatus}
              onLeave={handleLeaveRoom}
            />
          )}

          {screen === SCREEN.ARENA && (
            <BattleArena
              scores={scores}
              isConnected={isConnected}
              participants={participants}
              currentRound={currentRound}
              totalRounds={totalRounds}
              currentMatches={currentMatches}
              battleStatus={battleStatus}
              myUserId={myUserId}
            />
          )}
        </div>

        {/* ── Control Panel (only during active battle) ──── */}
        {screen === SCREEN.ARENA && battleStatus === 'active' && (
          <ControlPanel
            onFire={handleFire}
            balance={balance}
            limit={limit}
            maxLimit={maxLimit}
            isLoading={isLoading}
            cooldown={cooldown}
          />
        )}

        {/* ── Bottom Navigation ────────────────────────────── */}
        <nav className="bottom-nav">
          <button
            className={`nav-btn ${screen === SCREEN.ROOMS ? 'nav-active' : ''}`}
            onClick={() => { handleLeaveRoom(); }}
          >
            <span className="nav-icon">🏟️</span>
            <span className="nav-label">Xonalar</span>
          </button>
          <button className="nav-btn" onClick={() => setIsTasksOpen(true)}>
            <span className="nav-icon">📋</span>
            <span className="nav-label">Vazifalar</span>
          </button>
          <button className="nav-btn" onClick={() => setIsGiftOpen(true)}>
            <span className="nav-icon">🎁</span>
            <span className="nav-label">Yuborish</span>
          </button>
          <button className="nav-btn" onClick={() => setIsStoreOpen(true)}>
            <span className="nav-icon">🏪</span>
            <span className="nav-label">Do'kon</span>
          </button>
        </nav>
      </div>

      {/* ── Modals ───────────────────────────────────── */}
      <StoreModal
        isOpen={isStoreOpen}
        onClose={() => setIsStoreOpen(false)}
        api={api}
        showToast={showToast}
        isVip={isVip}
      />

      <DailyTasks
        isOpen={isTasksOpen}
        onClose={() => setIsTasksOpen(false)}
        onBalanceUpdate={setBalance}
        showToast={showToast}
      />

      <GiftRockets
        isOpen={isGiftOpen}
        onClose={() => setIsGiftOpen(false)}
        balance={balance}
        onBalanceUpdate={setBalance}
        showToast={showToast}
      />

      {/* ── Toast Notifications ─────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className={`toast ${toast.type}`}
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            transition={{ duration: 0.3 }}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
