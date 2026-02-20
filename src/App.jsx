/**
 * App.jsx — Main layout for the Rocket Battle Mini App.
 *
 * Structure:
 *   Header (balance + VIP badge)
 *   BattleArena (live scores)
 *   ControlPanel (fire button)
 */
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import BattleArena from './components/BattleArena';
import ControlPanel from './components/ControlPanel';
import useBattleSocket from './hooks/useBattleSocket';
import { api } from './api/client';
import StoreModal from './components/StoreModal';
import SplashScreen from './components/SplashScreen';

export default function App() {
  // ── State ──────────────────────────────────────────────
  const [balance, setBalance] = useState(10);
  const [isVip, setIsVip] = useState(false);
  const [username, setUsername] = useState('Player');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [limit, setLimit] = useState(100);
  const [maxLimit, setMaxLimit] = useState(100);
  const [toast, setToast] = useState(null);
  
  const [battleId, setBattleId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [endTime, setEndTime] = useState(null);

  const [isAuthError, setIsAuthError] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);

  // ── WebSocket ──────────────────────────────────────────
  // Only connect when we have a valid battleId
  const { scores, isConnected } = useBattleSocket(battleId);

  // ── Init Telegram WebApp & Fetch Profile ────────────────
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#050A18');
      tg.setBackgroundColor('#050A18');

      const user = tg.initDataUnsafe?.user;
      if (user?.first_name) {
        setUsername(user.first_name);
      }
    }

    // Fetch profile and join battle
    const initApp = async () => {
      try {
        console.log("Init started");
        // 1. Get Profile
        const profileRes = await api.getProfile();
        console.log("Profile loaded", profileRes.data);
        setBalance(profileRes.data.balance);
        setIsVip(profileRes.data.is_vip);
        
        // Limits & Cooldown
        setLimit(profileRes.data.limit_remaining);
        setMaxLimit(profileRes.data.limit_max);
        if (profileRes.data.cooldown_seconds > 0) {
            setCooldown(profileRes.data.cooldown_seconds);
        }
        
        // Use first_name if username is missing/empty
        const { username, first_name } = profileRes.data;
        if (username) {
          setUsername(username);
        } else if (first_name) {
          setUsername(first_name);
        }

        // 2. Join Battle
        const joinRes = await api.joinBattle();
        console.log('Joined battle:', joinRes.data);
        setBattleId(joinRes.data.battle_id);
        
        if (joinRes.data.participants) {
            setParticipants(joinRes.data.participants);
        }
        if (joinRes.data.end_time) {
            setEndTime(new Date(joinRes.data.end_time));
        }

      } catch (err) {
        console.error('Init failed:', err);
        // Show visible error to user
        alert(`Init Error: ${err.message || JSON.stringify(err)}`);
        
        if (err.response?.status === 401) {
            setIsAuthError(true);
            showToast('Authentication failed. Please open in Telegram.', 'error');
        } else {
            showToast('Failed to join battle. Please reload.', 'error');
        }
      } finally {
        // App is ready (even if error, we show UI or error screen)
        console.log("Setting app ready");
        setIsAppReady(true);
      }
    };

    initApp();
  }, []);

  if (!isAppReady) {
      return <SplashScreen />;
  }

  if (isAuthError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white p-4 text-center">
            <div>
                <h1 className="text-2xl font-bold text-red-500 mb-2">Authentication Failed</h1>
                <div className="text-gray-400">Could not verify Telegram credentials.</div>
                <div className="text-sm mt-4">Please restart the bot via /start</div>
            </div>
        </div>
      );
  }

  // ── Cooldown timer ─────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // ── Fire handler ───────────────────────────────────────
  const handleFire = useCallback(
    async (amount) => {
      console.log('Fire clicked. Amount:', amount, 'BattleID:', battleId);
      if (!battleId) {
        showToast('Error: No active battle found. Please reload.', 'error');
        return;
      }
      setIsLoading(true);
      try {
        const { data } = await api.vote(battleId, amount);
        setBalance(data.new_balance);

        if (data.cooldown_started) {
          setCooldown(data.cooldown_seconds);
        }
        
        // Update limit from response (VoteResult knows remaining_limit)
        if (data.remaining_limit !== undefined) {
            setLimit(data.remaining_limit);
        }

        showToast(`🚀 Launched ${amount} rocket${amount > 1 ? 's' : ''}!`, 'success');
      } catch (err) {
        const msg =
          err.response?.data?.detail || 'Something went wrong. Try again.';

        if (err.response?.status === 429) {
          // Extract cooldown TTL from message
          const match = msg.match(/(\d+)s/);
          if (match) setCooldown(parseInt(match[1], 10));
        }

        showToast(`❌ ${msg}`, 'error');

        // Error haptic
        try {
          window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
        } catch (e) { /* silent */ }
      } finally {
        setIsLoading(false);
      }
    },
    [battleId]
  );

  // ── Toast helper ───────────────────────────────────────
  const showToast = (message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Stars background */}
      <div className="stars-bg" />

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* ── Header ────────────────────────────────────── */}
        <header className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500
                          flex items-center justify-center text-lg font-bold shadow-lg"
              whileHover={{ scale: 1.1 }}
            >
              {username.charAt(0).toUpperCase()}
            </motion.div>
            <div>
              <div className="text-sm font-semibold text-white/90">{username}</div>
              <div className="flex items-center gap-1.5">
                {isVip && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gradient-to-r
                                   from-amber-400/20 to-yellow-500/20 text-amber-300
                                   font-bold border border-amber-400/20">
                    👑 VIP
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Balance & Store Button */}
          <div className="flex items-center gap-2">
              <motion.div
                className="glass-card pl-4 pr-2 py-2 flex items-center gap-2 cursor-pointer hover:bg-white/5 active:scale-95 transition-all"
                whileHover={{ scale: 1.02 }}
                onClick={() => setIsStoreOpen(true)}
              >
                <span className="text-lg">🚀</span>
                <div className="text-right mr-2">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={balance}
                      className="text-lg font-black text-white tabular-nums block leading-tight"
                      style={{ fontFamily: 'Outfit, sans-serif' }}
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      {balance.toLocaleString()}
                    </motion.span>
                  </AnimatePresence>
                  <span className="text-[10px] text-gray-400 leading-none">rockets</span>
                </div>
                
                {/* Plus Button */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg text-white font-bold text-lg">
                    +
                </div>
              </motion.div>
          </div>
        </header>

        {/* ── Battle Arena ──────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <BattleArena 
            scores={scores} 
            isConnected={isConnected} 
            participants={participants}
            endTime={endTime}
          />
        </div>

        {/* ── Control Panel ─────────────────────────────── */}
        <ControlPanel
          onFire={handleFire}
          balance={balance}
          limit={limit}
          maxLimit={maxLimit}
          isLoading={isLoading}
          cooldown={cooldown}
        />
      </div>

        {/* ── Store Modal ───────────────────────────────── */}
        <StoreModal
            isOpen={isStoreOpen}
            onClose={() => setIsStoreOpen(false)}
            api={api}
            showToast={showToast}
            isVip={isVip}
        />

        {/* ── Toast Notifications ─────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className={`
              fixed top-4 left-1/2 z-50 -translate-x-1/2
              glass-card px-5 py-3 max-w-[90vw]
              text-sm font-medium text-center
              ${toast.type === 'success'
                ? 'border-green-400/30 text-green-200'
                : toast.type === 'error'
                ? 'border-red-400/30 text-red-200'
                : 'border-white/10 text-white/80'
              }
            `}
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
