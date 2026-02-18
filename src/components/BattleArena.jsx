/**
 * BattleArena — the main game display with two animated team counters.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function BattleArena({ scores, isConnected }) {
  return (
    <div className="relative w-full px-4 py-6">
      {/* Connection indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <span
          className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]'
          }`}
        />
        <span className="text-xs text-gray-400 uppercase tracking-widest font-medium">
          {isConnected ? 'Live Battle' : 'Reconnecting…'}
        </span>
      </div>

      {/* VS Banner */}
      <div className="flex items-center justify-center mb-2">
        <motion.span
          className="text-xs font-bold tracking-[0.3em] text-gray-500 uppercase"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          ⚔️ Battle Arena ⚔️
        </motion.span>
      </div>

      {/* Score Panels */}
      <div className="flex items-stretch gap-3 w-full">
        <TeamPanel
          team="blue"
          label="Blue Team"
          score={scores.blue}
          emoji="🔵"
          color="from-cyan-500/20 to-blue-600/20"
          borderColor="border-cyan-400/20"
          textColor="text-cyan-300"
          glowClass="glow-blue"
        />

        {/* VS divider */}
        <div className="flex flex-col items-center justify-center flex-shrink-0">
          <motion.div
            className="text-2xl font-black text-white/30"
            style={{ fontFamily: 'Outfit, sans-serif' }}
            animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            VS
          </motion.div>
        </div>

        <TeamPanel
          team="red"
          label="Red Team"
          score={scores.red}
          emoji="🔴"
          color="from-pink-500/20 to-red-600/20"
          borderColor="border-pink-400/20"
          textColor="text-pink-300"
          glowClass="glow-red"
        />
      </div>

      {/* Progress bar */}
      <div className="mt-6 px-1">
        <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden flex">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-400 to-cyan-500 rounded-l-full"
            animate={{
              width: scores.blue + scores.red > 0
                ? `${(scores.blue / (scores.blue + scores.red)) * 100}%`
                : '50%',
            }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          />
          <motion.div
            className="h-full bg-gradient-to-r from-pink-500 to-red-500 rounded-r-full"
            animate={{
              width: scores.blue + scores.red > 0
                ? `${(scores.red / (scores.blue + scores.red)) * 100}%`
                : '50%',
            }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-cyan-400/60 font-mono">
            {scores.blue + scores.red > 0
              ? `${Math.round((scores.blue / (scores.blue + scores.red)) * 100)}%`
              : '50%'}
          </span>
          <span className="text-[10px] text-pink-400/60 font-mono">
            {scores.blue + scores.red > 0
              ? `${Math.round((scores.red / (scores.blue + scores.red)) * 100)}%`
              : '50%'}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Team Score Panel ───────────────────────────────── */
function TeamPanel({ team, label, score, emoji, color, borderColor, textColor, glowClass }) {
  const [prevScore, setPrevScore] = useState(score);
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (score !== prevScore) {
      setIsPulsing(true);
      setPrevScore(score);
      const timeout = setTimeout(() => setIsPulsing(false), 400);
      return () => clearTimeout(timeout);
    }
  }, [score, prevScore]);

  return (
    <motion.div
      className={`
        flex-1 glass-card p-4 flex flex-col items-center justify-center
        bg-gradient-to-b ${color} ${borderColor} border
        ${isPulsing ? glowClass : ''}
      `}
      animate={isPulsing ? { scale: [1, 1.03, 1] } : {}}
      transition={{ duration: 0.3 }}
    >
      <span className="text-2xl mb-1">{emoji}</span>
      <span className={`text-xs font-semibold uppercase tracking-wider ${textColor} opacity-70 mb-2`}>
        {label}
      </span>

      <AnimatePresence mode="wait">
        <motion.span
          key={score}
          className={`text-4xl font-black ${textColor} tabular-nums`}
          style={{ fontFamily: 'Outfit, sans-serif' }}
          initial={{ opacity: 0, y: 10, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.8 }}
          transition={{ duration: 0.25 }}
        >
          {score.toLocaleString()}
        </motion.span>
      </AnimatePresence>

      <span className="text-[10px] text-gray-500 mt-1">rockets</span>
    </motion.div>
  );
}
