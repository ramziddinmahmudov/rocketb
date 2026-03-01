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
import { Swords, ClipboardList, Store, Link2, ArrowLeft, BadgeCheck, Rocket } from 'lucide-react';

import Home from './components/Home';
import Profile from './components/Profile';
import Navbar from './components/Navbar';
import RoomBrowser from './components/RoomBrowser';
import BattleArena from './components/BattleArena';
import BattleLobby from './components/BattleLobby';
import ControlPanel from './components/ControlPanel';
import DailyTasks from './components/DailyTasks';
import StoreModal from './components/StoreModal';
import Leaderboard from './components/Leaderboard';
import SplashScreen from './components/SplashScreen';
import useBattleSocket from './hooks/useBattleSocket';
import { api } from './api/client';

// ── Screens ──────────────────────────────────────────
const SCREEN = {
  TABS: 'tabs',
  LOBBY: 'lobby',
  ARENA: 'arena',
};

export default function App() {
  // ── State ──────────────────────────────────────────────
  const [balance, setBalance] = useState(10);
  const [isVip, setIsVip] = useState(false);
  const [vipEmoji, setVipEmoji] = useState('');
  const [username, setUsername] = useState('Player');
  const [myUserId, setMyUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [limit, setLimit] = useState(100);
  const [maxLimit, setMaxLimit] = useState(100);
  const [toast, setToast] = useState(null);

  // Screen navigation
  const [screen, setScreen] = useState(SCREEN.TABS);
  const [currentTab, setCurrentTab] = useState('home');
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
  const [isAppReady, setIsAppReady] = useState(false);
  const [isReferralOpen, setIsReferralOpen] = useState(false);
  const [referralLink, setReferralLink] = useState('');
  const [voteTarget, setVoteTarget] = useState(null);

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

  // Transition from Lobby to Arena dynamically if battle starts
  useEffect(() => {
    if (battleStatus === 'active' && screen === SCREEN.LOBBY) {
      setScreen(SCREEN.ARENA);
    }
  }, [battleStatus, screen]);

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
        setVipEmoji(profileRes.data.vip_emoji || '');
        setLimit(profileRes.data.limit_remaining);
        setMaxLimit(profileRes.data.limit_max);
        if (profileRes.data.cooldown_seconds > 0) {
          setCooldown(profileRes.data.cooldown_seconds);
        }
        if (profileRes.data.user_id) setMyUserId(profileRes.data.user_id);

        // Build referral link
        const tg = window.Telegram?.WebApp;
        const userId = tg?.initDataUnsafe?.user?.id;
        if (userId) {
          setReferralLink(`https://t.me/rocketbattleebot?start=${userId}`);
        }

        const { username: uname, first_name } = profileRes.data;
        if (uname) setUsername(uname);
        else if (first_name) setUsername(first_name);

        // 2. Load rooms
        await loadRooms();

        // 3. Check if coming from room invite link
        // 3. Check if coming from room invite link or vote referral
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param || urlParams.get('start');
        
        if (roomParam) {
          // Auto-join room from invite link
          await handleJoinRoom(roomParam);
        } else if (startParam && startParam.startsWith('vote_')) {
          const parts = startParam.split('_');
          if (parts.length >= 3) {
            const bId = parts[1];
            const targetId = parseInt(parts[2], 10);
            await handleVoteDeepLink(bId, targetId);
          }
        }

        // Wait an extra 2.5s so the splash screen doesn't instantly vanish on fast networks
        await new Promise(resolve => setTimeout(resolve, 2500));

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

  const handleJoinRandom = async () => {
    setIsRoomsLoading(true);
    try {
      const { data } = await api.joinBattle();
      setCurrentRoom(null); // No specific room
      setBattleId(data.battle_id || null);
      setBattleStatus(data.status || 'waiting');
      setParticipants(data.participants || []);
      setCurrentRound(data.current_round || 0);
      setTotalRounds(data.total_rounds || 4);

      if (data.status === 'active') {
        setScreen(SCREEN.ARENA);
      } else {
        setScreen(SCREEN.LOBBY);
      }

      showToast('🎲 Tasodifiy o\'yinga tayyor', 'success');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Tasodifiy o\'yinga kiritib bo\'lmadi';
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsRoomsLoading(false);
    }
  };

  const handleVoteDeepLink = async (targetBattleId, targetPlayerId) => {
    try {
      // First, get the battle details
      setIsRoomsLoading(true);
      const { data } = await api.getBattle(targetBattleId);
      
      setCurrentRoom(null);
      setBattleId(data.battle_id);
      setBattleStatus(data.status);
      setParticipants(data.participants || []);
      setCurrentRound(data.current_round || 0);
      setTotalRounds(data.total_rounds || 4);
      
      setVoteTarget(targetPlayerId);
      setScreen(SCREEN.ARENA);
      
      // Auto-open control panel (if not participating, they can still vote)
      // Since they are spectating/voting, they might not be part of `participants`
      // We will handle passing targetId to ControlPanel when clicking
    } catch (err) {
      const msg = err.response?.data?.detail || 'O\'yinga kirib bo\'lmadi';
      showToast(`❌ ${msg}`, 'error');
    } finally {
      setIsRoomsLoading(false);
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
    setScreen(SCREEN.TABS);
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
    async (amount, customTargetId = null) => {
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
        const payload = customTargetId ? { target_id: customTargetId } : {};
        const { data } = await api.vote(battleId, amount, payload);
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
  if (!isAppReady) {
    return (
      <AnimatePresence>
        <SplashScreen />
      </AnimatePresence>
    );
  }

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
      {/* Background image layer */}
      <div className="bg-image-layer">
        <img src="/space-bg.png" alt="" />
      </div>

      {/* Aurora / Nebula layer */}
      <div className="aurora-layer" />

      {/* Stars background */}
      <div className="stars-bg" />

      {/* Floating orbs */}
      <div className="floating-orbs">
        <div className="orb" />
        <div className="orb" />
        <div className="orb" />
        <div className="orb" />
        <div className="orb" />
        <div className="orb" />
      </div>

      {/* Meteor trails */}
      <div className="meteor-container">
        <div className="meteor" />
        <div className="meteor" />
        <div className="meteor" />
      </div>

      {/* Content */}
      <div className="app-content">
        {/* ── Header ────────────────────────────────────── */}
        <header className="app-header">
          <div className="header-left">
            {screen !== SCREEN.TABS && (
              <button className="back-btn" onClick={handleLeaveRoom}>
                <ArrowLeft size={20} color="#a78bfa" />
              </button>
            )}
            <motion.div className="avatar-circle" whileHover={{ scale: 1.1 }}>
              {username.charAt(0).toUpperCase()}
            </motion.div>
            <div>
              <div className="header-username-row flex items-center gap-1">
                <p className="header-username">{username}</p>
                {isVip && vipEmoji && <span className="text-xl ml-1">{vipEmoji}</span>}
              </div>
              {isVip && !vipEmoji && <span className="vip-badge-small mt-1">👑 VIP</span>}
            </div>
          </div>

          <div className="header-right">
            <motion.div
              className="balance-card"
              whileHover={{ scale: 1.02 }}
              onClick={() => setCurrentTab('store')}
            >
              <span className="balance-rocket"><Rocket size={20} color="#f97316" /></span>
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
          {screen === SCREEN.TABS && currentTab === 'home' && (
             <Home balance={balance} isVip={isVip} vipEmoji={vipEmoji} />
          )}

          {screen === SCREEN.TABS && currentTab === 'rooms' && (
            <RoomBrowser
              rooms={rooms}
              onJoinRoom={handleJoinRoom}
              onCreateRoom={handleCreateRoom}
              onDeleteRoom={handleDeleteRoom}
              onRefresh={loadRooms}
              isLoading={isRoomsLoading}
              myUserId={myUserId}
              showToast={showToast}
              onJoinRandom={handleJoinRandom}
            />
          )}

          {screen === SCREEN.TABS && currentTab === 'tasks' && (
            <DailyTasks
              onBalanceUpdate={setBalance}
              showToast={showToast}
            />
          )}

          {screen === SCREEN.TABS && currentTab === 'leaderboard' && (
            <Leaderboard
              myUserId={myUserId}
              showToast={showToast}
            />
          )}

          {screen === SCREEN.TABS && currentTab === 'profile' && (
            <Profile
              username={username}
              isVip={isVip}
              vipEmoji={vipEmoji}
              userId={myUserId}
              referralLink={referralLink}
              showToast={showToast}
            />
          )}

          {screen === SCREEN.LOBBY && (
            <BattleLobby
              roomCode={currentRoom?.invite_code}
              roomName={currentRoom?.name || 'Battle Room'}
              participants={participants}
              maxPlayers={currentRoom?.max_players || 4}
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
              onSelectTarget={setVoteTarget}
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
            voteTarget={voteTarget}
            participants={participants}
          />
        )}

        {/* ── Bottom Navigation ────────────────────────────── */}
        {screen === SCREEN.TABS && (
          <Navbar currentTab={currentTab} setTab={setCurrentTab} />
        )}
      </div>

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
