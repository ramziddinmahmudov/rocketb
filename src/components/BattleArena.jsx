/**
 * BattleArena — Tournament bracket view with 1v1 rounds.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';

export default function BattleArena({
  scores,
  isConnected,
  participants,
  currentRound,
  totalRounds,
  currentMatches,
  battleStatus,
  myUserId,
}) {
  const [roundTimeLeft, setRoundTimeLeft] = useState(60);

  // Find current user's active match
  const myMatch = useMemo(() => {
    if (!currentMatches || !myUserId) return null;
    return currentMatches.find(
      (m) => m.player1_id === myUserId || m.player2_id === myUserId
    );
  }, [currentMatches, myUserId]);

  // Round countdown timer
  useEffect(() => {
    if (battleStatus !== 'active') return;
    const duration = myMatch?.duration_seconds || 60;
    setRoundTimeLeft(duration);
    const interval = setInterval(() => {
      setRoundTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentRound, battleStatus, myMatch]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const roundNames = ['', 'R16', 'Chorak final', 'Yarim final', 'FINAL'];
  const roundName = roundNames[currentRound] || `Raund ${currentRound}`;

  // If battle hasn't started yet
  if (battleStatus === 'waiting') {
    return (
      <div className="arena-waiting">
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="waiting-pulse"
        >
          <span className="waiting-icon">⏳</span>
          <p className="waiting-main">Battle boshlanishi kutilmoqda...</p>
          <p className="waiting-sub">
            {participants?.length || 0} / 16 o'yinchi
          </p>
        </motion.div>
      </div>
    );
  }

  // If battle is finished
  if (battleStatus === 'finished') {
    const winner = participants
      ?.filter((p) => !p.is_eliminated)
      .sort((a, b) => b.score - a.score)[0];

    return (
      <div className="arena-finished">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
        >
          <span className="trophy-icon">🏆</span>
          <h2 className="winner-title">G'olib!</h2>
          <p className="winner-name">{winner?.username || 'Noma\'lum'}</p>
          <p className="winner-score">{winner?.score || 0} 🚀</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="arena-container">
      {/* Connection indicator */}
      <div className="connection-bar">
        <span className={`conn-dot ${isConnected ? 'connected' : 'disconnected'}`} />
        <span className="conn-text">
          {isConnected ? 'Live Battle' : 'Ulanmoqda…'}
        </span>
      </div>

      {/* Round info */}
      <div className="round-info">
        <span className="round-badge">{roundName}</span>
        <span className="round-number">
          Raund {currentRound}/{totalRounds}
        </span>
      </div>

      {/* Timer */}
      <motion.div
        className="round-timer"
        animate={roundTimeLeft <= 10 ? { color: ['#fff', '#ef4444', '#fff'] } : {}}
        transition={{ duration: 1, repeat: roundTimeLeft <= 10 ? Infinity : 0 }}
      >
        ⏱ {formatTime(roundTimeLeft)}
      </motion.div>

      {/* Active Match (user's current 1v1) */}
      {myMatch ? (
        <div className="active-match">
          <MatchCard
            match={myMatch}
            myUserId={myUserId}
            scores={scores}
            isMyMatch={true}
          />
        </div>
      ) : (
        <div className="eliminated-message">
          <p>😔 Siz eliminatsiya qilindingiz</p>
          <p className="sub">Boshqa matchlarni tomosha qiling</p>
        </div>
      )}

      {/* All current matches */}
      {currentMatches && currentMatches.length > 1 && (
        <div className="other-matches">
          <h3 className="matches-title">Boshqa matchlar</h3>
          <div className="matches-grid">
            {currentMatches
              .filter((m) => m !== myMatch)
              .map((match, idx) => (
                <MatchCard key={idx} match={match} myUserId={myUserId} isMyMatch={false} />
              ))}
          </div>
        </div>
      )}

      {/* Bracket Overview */}
      <div className="bracket-overview">
        <h3 className="bracket-title">📊 Bracket</h3>
        <div className="bracket-players">
          {participants
            ?.sort((a, b) => a.bracket_position - b.bracket_position)
            .map((p, idx) => (
              <motion.div
                key={p.user_id}
                className={`bracket-player ${p.is_eliminated ? 'eliminated' : 'active'} ${
                  p.user_id === myUserId ? 'is-me' : ''
                }`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <span className="bp-position">#{idx + 1}</span>
                <span className="bp-name">{p.username}</span>
                <span className="bp-score">{p.score} 🚀</span>
                {p.is_eliminated && <span className="bp-elim">❌</span>}
              </motion.div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ── Match Card ───────────────────────────────────────── */
function MatchCard({ match, myUserId, scores, isMyMatch }) {
  const p1Score = scores?.player1_score ?? match.player1_score ?? 0;
  const p2Score = scores?.player2_score ?? match.player2_score ?? 0;
  const isP1 = match.player1_id === myUserId;

  return (
    <motion.div
      className={`match-card ${isMyMatch ? 'my-match' : 'other-match'}`}
      layout
    >
      <div className="match-players">
        {/* Player 1 */}
        <div className={`match-player p1 ${isP1 && isMyMatch ? 'is-me' : ''}`}>
          <span className="mp-emoji">🔵</span>
          <span className="mp-name">{match.player1_username || `#${match.player1_id}`}</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={p1Score}
              className="mp-score"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
            >
              {p1Score}
            </motion.span>
          </AnimatePresence>
        </div>

        <span className="match-vs">VS</span>

        {/* Player 2 */}
        <div className={`match-player p2 ${!isP1 && isMyMatch ? 'is-me' : ''}`}>
          <span className="mp-emoji">🔴</span>
          <span className="mp-name">{match.player2_username || `#${match.player2_id}`}</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={p2Score}
              className="mp-score"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
            >
              {p2Score}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* Score Bar */}
      {isMyMatch && (
        <div className="match-bar">
          <motion.div
            className="bar-p1"
            animate={{
              width: p1Score + p2Score > 0
                ? `${(p1Score / (p1Score + p2Score)) * 100}%`
                : '50%',
            }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          />
          <motion.div
            className="bar-p2"
            animate={{
              width: p1Score + p2Score > 0
                ? `${(p2Score / (p1Score + p2Score)) * 100}%`
                : '50%',
            }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          />
        </div>
      )}

      {match.winner_id && (
        <div className="match-winner">
          🏆 G'olib: {match.winner_id === match.player1_id ? match.player1_username : match.player2_username}
        </div>
      )}
    </motion.div>
  );
}
