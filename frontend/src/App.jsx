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

export default function App() {
  // ── State ──────────────────────────────────────────────
  const [balance, setBalance] = useState(10);
  const [isVip, setIsVip] = useState(false);
  const [username, setUsername] = useState('Player');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [toast, setToast] = useState(null);
  
  const [battleId, setBattleId] = useState(null);

  const [isAuthError, setIsAuthError] = useState(false);

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
        // 1. Get Profile
        const profileRes = await api.getProfile();
        setBalance(profileRes.data.balance);
        setIsVip(profileRes.data.is_vip);
        
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

      } catch (err) {
        console.error('Init failed:', err);
        if (err.response?.status === 401) {
            setIsAuthError(true);
            showToast('Authentication failed. Please open in Telegram.', 'error');
        } else {
            showToast('Failed to join battle. Please reload.', 'error');
        }
      }
    };

    initApp();
  }, []);

  if (isAuthError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white p-4 text-center">
            <div>
                <h1 className="text-2xl font-bold text-red-500 mb-2">Authentication Failed</h1>
                <p className="text-gray-400">Could not verify Telegram credentials.</p>
                <p className="text-sm mt-4">Please restart the bot via /start</p>
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
    []
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
              <p className="text-sm font-semibold text-white/90">{username}</p>
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

          {/* Balance */}
          <motion.div
            className="glass-card px-4 py-2 flex items-center gap-2"
            whileHover={{ scale: 1.02 }}
          >
            <span className="text-lg">🚀</span>
            <div className="text-right">
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
          </motion.div>
        </header>

        {/* ── Battle Arena ──────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <BattleArena scores={scores} isConnected={isConnected} />
        </div>

        {/* ── Control Panel ─────────────────────────────── */}
        <ControlPanel
          onFire={handleFire}
          balance={balance}
          isLoading={isLoading}
          cooldown={cooldown}
        />
      </div>

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
