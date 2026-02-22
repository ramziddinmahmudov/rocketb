/**
 * BattleLobby — Room lobby with player list, invite link, and auto-start.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Swords, Link2, Check, Clock, Rocket } from 'lucide-react';

export default function BattleLobby({
  roomCode,
  roomName,
  participants,
  maxPlayers,
  battleStatus,
  onShareLink,
}) {
  const [copied, setCopied] = useState(false);
  const count = participants?.length || 0;
  const progress = (count / maxPlayers) * 100;

  const handleCopy = () => {
    const link = `https://t.me/rocketbattleebot?start=room_${roomCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    onShareLink?.(roomCode);
  };

  return (
    <div className="lobby-container">
      {/* Room Header */}
      <div className="lobby-header">
        <motion.h2
          className="lobby-title"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Swords size={20} color="#a78bfa" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />{roomName || 'Battle Room'}
        </motion.h2>
        <div className="lobby-code">
          Kod: <span className="code-text">{roomCode}</span>
        </div>
      </div>

      {/* Player Count */}
      <div className="player-count-section">
        <div className="count-display">
          <motion.span
            className="count-number"
            key={count}
            initial={{ scale: 1.3, color: '#4ade80' }}
            animate={{ scale: 1, color: '#ffffff' }}
            transition={{ duration: 0.3 }}
          >
            {count}
          </motion.span>
          <span className="count-separator">/</span>
          <span className="count-max">{maxPlayers}</span>
        </div>
        <span className="count-label">O'yinchilar</span>

        {/* Progress Bar */}
        <div className="lobby-progress-bar">
          <motion.div
            className="lobby-progress-fill"
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 80, damping: 15 }}
          />
        </div>

        {count < maxPlayers && (
          <motion.p
            className="waiting-text"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Clock size={16} color="#facc15" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {maxPlayers - count} ta o'yinchi kutilmoqda...
          </motion.p>
        )}
      </div>

      {/* Invite Button */}
      <motion.button
        className="invite-button"
        onClick={handleCopy}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {copied ? <><Check size={16} color="#34d399" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Nusxalandi!</> : <><Link2 size={16} color="#38bdf8" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Havola nusxalash</>}
      </motion.button>

      {/* Player Grid */}
      <div className="player-grid">
        {Array.from({ length: maxPlayers }).map((_, idx) => {
          const player = participants?.[idx];
          return (
            <motion.div
              key={idx}
              className={`player-slot ${player ? 'filled' : 'empty'}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
            >
              {player ? (
                <>
                  <div className="player-avatar">
                    {player.avatar_url ? (
                      <img src={player.avatar_url} alt="" />
                    ) : (
                      <span className="avatar-letter">
                        {(player.username || 'P').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="player-name">{player.username || `#${idx + 1}`}</span>
                </>
              ) : (
                <>
                  <div className="player-avatar empty-avatar">
                    <span>?</span>
                  </div>
                  <span className="player-name empty-name">Bo'sh</span>
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Auto-start message */}
      {count >= maxPlayers && battleStatus === 'waiting' && (
        <motion.div
          className="autostart-banner"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Rocket size={20} color="#f97316" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Battle boshlanmoqda...
        </motion.div>
      )}
    </div>
  );
}
