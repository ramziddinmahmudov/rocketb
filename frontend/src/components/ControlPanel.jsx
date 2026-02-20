/**
 * ControlPanel — Fire button, rocket amount input, and status feedback.
 */
import { motion } from 'framer-motion';
import { useCallback, useState, useRef } from 'react';

export default function ControlPanel({ onFire, balance, isLoading, cooldown, limit, maxLimit }) {
  const [amount, setAmount] = useState(1);
  const [isShaking, setIsShaking] = useState(false);
  const [particles, setParticles] = useState([]);
  const particleIdRef = useRef(0);

  const presets = [1, 5, 10, 25];

  const handleFire = useCallback(() => {
    if (isLoading || amount <= 0 || amount > balance || cooldown > 0 || limit <= 0) return;

    // Haptic feedback
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('heavy');
    } catch (e) {
      // not in Telegram environment
    }

    // Shake effect
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);

    // Spawn rocket particles
    const newParticles = Array.from({ length: 5 }, (_, i) => ({
      id: ++particleIdRef.current,
      x: Math.random() * 40 - 20,
      delay: i * 0.05,
    }));
    setParticles((prev) => [...prev, ...newParticles]);
    setTimeout(
      () => setParticles((prev) => prev.filter((p) => !newParticles.includes(p))),
      1000
    );

    onFire(amount);
  }, [amount, balance, isLoading, cooldown, limit, onFire]);

  const handleAmountChange = (e) => {
    const val = parseInt(e.target.value, 10);
    // Limit input to min(balance, limit)
    const effectiveMax = Math.min(balance, limit);
    setAmount(isNaN(val) ? 0 : Math.max(0, Math.min(val, effectiveMax)));
  };

  const isCooldownActive = cooldown > 0;
  const isLimitReached = limit <= 0;
  const isDisabled = isLoading || amount <= 0 || amount > balance || isCooldownActive || isLimitReached;

  // Calculate progress percentage (inverse, because limit goes down)
  const progressPercent = Math.max(0, Math.min(100, (limit / maxLimit) * 100));

  return (
    <div className="w-full px-4 pb-6 space-y-4">
      {/* Limit & Cooldown Status */}
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
        <span>Daily Limit</span>
        <span className={isLimitReached ? "text-red-400" : "text-white"}>
            {limit} / {maxLimit}
        </span>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-4">
        <motion.div 
            className={`h-full ${isLimitReached ? 'bg-red-500' : 'bg-gradient-to-r from-blue-400 to-cyan-400'}`}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.5 }}
        />
      </div>

      {/* Cooldown warning */}
      {isCooldownActive && (
        <motion.div
          className="glass-card p-3 border border-amber-400/20 bg-amber-500/5 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="text-amber-300 text-sm font-medium">
            ⏳ Cooldown: {formatTime(cooldown)}
          </span>
        </motion.div>
      )}

      {/* Amount selector */}
      <div className="glass-card p-4 space-y-3">
        <label className="text-xs text-gray-400 uppercase tracking-wider font-medium block">
          Rockets to Launch
        </label>

        {/* Preset buttons */}
        <div className="flex gap-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(Math.min(p, balance, limit))}
              disabled={p > balance || p > limit}
              className={`
                flex-1 py-2 rounded-xl text-sm font-bold transition-all
                ${amount === p
                  ? 'bg-purple-500/30 text-purple-200 border border-purple-400/30 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                  : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'
                }
                disabled:opacity-30 disabled:cursor-not-allowed
              `}
            >
              {p} 🚀
            </button>
          ))}
        </div>

        {/* Manual input */}
        <div className="relative">
          <input
            type="number"
            min="1"
            max={Math.min(balance, limit)}
            value={amount}
            onChange={handleAmountChange}
            disabled={isLimitReached || isCooldownActive}
            className="
              w-full bg-white/5 border border-white/10 rounded-xl
              px-4 py-3 text-white/90 text-lg font-mono
              focus:outline-none focus:border-purple-400/50 focus:bg-white/8
              transition-all placeholder:text-gray-600
              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
              [&::-webkit-inner-spin-button]:appearance-none
              disabled:opacity-50
            "
            placeholder="Amount"
          />
          <button
            onClick={() => setAmount(Math.min(balance, limit))}
            disabled={isLimitReached || isCooldownActive}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1
                       text-xs text-purple-300 bg-purple-500/20 rounded-lg
                       hover:bg-purple-500/30 transition-colors font-semibold disabled:opacity-30"
          >
            MAX
          </button>
        </div>
      </div>

      {/* Fire button */}
      <div className="relative flex justify-center">
        {/* Rocket particles */}
        {particles.map((p) => (
          <span
            key={p.id}
            className="rocket-particle text-xl"
            style={{
              left: `calc(50% + ${p.x}px)`,
              bottom: '60px',
              animationDelay: `${p.delay}s`,
            }}
          >
            🚀
          </span>
        ))}

        <motion.button
          onClick={handleFire}
          disabled={isDisabled}
          className={`
            fire-btn w-full py-4 rounded-2xl
            text-white font-black text-lg tracking-wider uppercase
            disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none
            ${isShaking ? 'animate-shake' : ''}
          `}
          whileTap={!isDisabled ? { scale: 0.95 } : {}}
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner /> Launching...
            </span>
          ) : isCooldownActive ? (
            `⏳ ${formatTime(cooldown)}`
          ) : isLimitReached ? (
             "Daily Limit Reached"
          ) : (
            `🚀 Fire ${amount} Rocket${amount !== 1 ? 's' : ''}!`
          )}
        </motion.button>
      </div>

      {/* Balance reminder */}
      <p className="text-center text-xs text-gray-500">
        Tap to launch • Costs <span className="text-white/70">{amount}</span> from your balance of{' '}
        <span className="text-cyan-300">{balance} 🚀</span>
      </p>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────── */

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
