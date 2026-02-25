/**
 * BattleArena — Tournament bracket view with 1v1 rounds.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import { Clock, Trophy, Timer, BarChart3, XCircle, Rocket, Frown, CircleDot, Share2, Check } from 'lucide-react';

export default function BattleArena({
  scores,
  isConnected,
  participants,
  currentRound,
  totalRounds,
  currentMatches,
  battleStatus,
  myUserId,
  onSelectTarget,
}) {
  const [roundTimeLeft, setRoundTimeLeft] = useState(60);
  const [copiedVote, setCopiedVote] = useState(false);

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

  const roundNames = ['', 'Yarim final', 'FINAL'];
  const roundName = roundNames[currentRound] || `Raund ${currentRound}`;

  const handleShareVote = () => {
    if (!myUserId || !scores?.battle_id && !currentMatches?.[0]?.battle_id) return;
    const bid = scores?.battle_id || currentMatches?.[0]?.battle_id || 'unknown';
    const link = `https://t.me/rocketbattleebot?start=vote_${bid}_${myUserId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedVote(true);
      setTimeout(() => setCopiedVote(false), 2000);
    });
  };

  // If battle hasn't started yet
  if (battleStatus === 'waiting') {
    return (
      <div className="arena-waiting">
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="waiting-pulse"
        >
          <span className="waiting-icon"><Clock size={28} color="#facc15" /></span>
          <p className="waiting-main">Battle boshlanishi kutilmoqda...</p>
          <p className="waiting-sub">
            {participants?.length || 0} / 4 o'yinchi
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
          <span className="trophy-icon"><Trophy size={48} color="#facc15" /></span>
          <h2 className="winner-title">G'olib!</h2>
          <p className="winner-name">{winner?.username || 'Noma\'lum'}</p>
          <p className="winner-score">{winner?.score || 0} <Rocket size={16} color="#f97316" style={{ display: 'inline', verticalAlign: 'middle' }} /></p>
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
        <Timer size={16} color="#38bdf8" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {formatTime(roundTimeLeft)}
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
          <p><Frown size={20} color="#f87171" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Siz eliminatsiya qilindingiz</p>
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
                <MatchCard key={idx} match={match} myUserId={myUserId} isMyMatch={false} onSelectTarget={onSelectTarget} />
              ))}
          </div>
        </div>
      )}

      {/* Bracket Overview */}
      <div className="bracket-overview">
        <div className="flex items-center justify-between mb-4">
            <h3 className="bracket-title !mb-0"><BarChart3 size={18} color="#a78bfa" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> Bracket</h3>
            {myUserId && !participants?.find(p => p.user_id === myUserId)?.is_eliminated && (
                <button
                    onClick={handleShareVote}
                    className="flex items-center gap-1.5 text-xs bg-purple-500/20 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-500/30 transition-colors"
                >
                    {copiedVote ? <Check size={14} /> : <Share2 size={14} />} 
                    {copiedVote ? "Nusxalandi" : "Ovoz Yig'ish"}
                </button>
            )}
        </div>
        <div className="bracket-players">
          {participants
            ?.sort((a, b) => a.bracket_position - b.bracket_position)
            .map((p, idx) => (
              <motion.div
                key={p.user_id}
                onClick={() => onSelectTarget && onSelectTarget(p.user_id)}
                className={`bracket-player cursor-pointer hover:bg-white/10 transition-colors ${p.is_eliminated ? 'eliminated' : 'active'} ${
                  p.user_id === myUserId ? 'is-me' : ''
                }`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <span className="bp-position">#{idx + 1}</span>
                <span className="bp-name truncate">{p.username}</span>
                {p.is_vip && p.vip_emoji && <span className="bp-emoji text-xs shrink-0">{p.vip_emoji}</span>}
                {p.is_vip && !p.vip_emoji && <span className="text-[8px] bg-amber-500/20 text-amber-500 rounded px-1 font-bold shrink-0">VIP</span>}
                <span className="bp-score">{p.score} <Rocket size={12} color="#f97316" style={{ display: 'inline', verticalAlign: 'middle' }} /></span>
                {p.is_eliminated && <span className="bp-elim"><XCircle size={14} color="#f87171" /></span>}
              </motion.div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ── Match Card ───────────────────────────────────────── */
function MatchCard({ match, myUserId, scores, isMyMatch, onSelectTarget }) {
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
        <div 
            className={`match-player p1 cursor-pointer hover:bg-white/5 transition-colors ${isP1 && isMyMatch ? 'is-me' : ''}`}
            onClick={() => onSelectTarget && onSelectTarget(match.player1_id)}
        >
          <span className="mp-emoji"><CircleDot size={16} color="#3b82f6" /></span>
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
        <div 
            className={`match-player p2 cursor-pointer hover:bg-white/5 transition-colors ${!isP1 && isMyMatch ? 'is-me' : ''}`}
            onClick={() => onSelectTarget && onSelectTarget(match.player2_id)}
        >
          <span className="mp-emoji"><CircleDot size={16} color="#ef4444" /></span>
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
          <Trophy size={16} color="#facc15" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> G'olib: {match.winner_id === match.player1_id ? match.player1_username : match.player2_username}
        </div>
      )}
    </motion.div>
  );
}
