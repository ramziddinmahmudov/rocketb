import React, { useState, useEffect, useRef } from 'react';
import { Home, ClipboardList, User, Rocket, Swords, Trophy, Zap, Shield, Trash2, Save, ChevronDown, Users, PlayCircle, X, Check, ShoppingCart } from 'lucide-react';

// Format large numbers: 1000 → 1K, 1200 → 1.2K, 15300 → 15.3K
const formatNum = (n) => {
  if (n === null || n === undefined) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
};

const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Vercel kabi platformalar uchun Environment Variable orqali backendni ko'rsatamiz
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (IS_DEV ? 'http://localhost:8000' : window.location.origin);
const HOST = BACKEND_URL.replace(/\/$/, ""); // oxiridagi slashni olib tashlash
const WS_HOST = HOST.replace(/^http/, 'ws');

const API_BASE = `${HOST}/api`;
const WS_BASE = `${WS_HOST}/ws`;

// Get Telegram WebApp
const tg = window.Telegram?.WebApp;
const INIT_DATA = tg?.initData || "mock_user_1";

// --- MAIN APP COMPONENT ---
function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [viewingUserId, setViewingUserId] = useState(null);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Multiplayer State
  const ws = useRef(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeMatches, setActiveMatches] = useState([]);
  const [challengeRequest, setChallengeRequest] = useState(null);
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };
  
  // Battle State
  const [inBattle, setInBattle] = useState(false);
  const [isSpectating, setIsSpectating] = useState(false);
  const [battleState, setBattleState] = useState({
    phase: 'idle',
    matchId: null,
    myScore: 0,
    opponentScore: 0,
    opponentName: 'Waiting...',
    opponentId: null,
    isWin: null
  });
  const [attackLogs, setAttackLogs] = useState([]);
  const battleStateRef = useRef(battleState);
  useEffect(() => { battleStateRef.current = battleState; }, [battleState]);
  const isSpectatingRef = useRef(isSpectating);
  useEffect(() => { isSpectatingRef.current = isSpectating; }, [isSpectating]);

  useEffect(() => {
    if (tg) tg.expand();
  }, []);

  // Deep Link Support Parsing
  // Source priority: Telegram start_param (Mini App / direct link) → URL ?startapp= (web_app
  // button fallback when MINI_APP_SHORT_NAME isn't configured in the bot).
  const [supportData, setSupportData] = useState(() => {
    let sp = tg?.initDataUnsafe?.start_param;
    if (!sp) {
      try {
        const params = new URLSearchParams(window.location.search);
        sp = params.get('startapp') || params.get('start_param');
      } catch (_) { /* noop */ }
    }
    // format expected: support_{uid}_{match_id} e.g. support_1234_match_5678_9101_12345
    if (sp && sp.startsWith('support_')) {
      const parts = sp.split('_');
      if (parts.length >= 4) {
        return {
          supportId: parseInt(parts[1]),
          matchId: parts.slice(2).join('_')
        };
      }
    }
    return null;
  });
  const supportDataRef = useRef(supportData);
  useEffect(() => { supportDataRef.current = supportData; }, [supportData]);

  const [authError, setAuthError] = useState(null);

  // Auth
  useEffect(() => {
    let cancelled = false;
    const auth = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ init_data: INIT_DATA })
        });
        if (!res.ok) {
          throw new Error(`Login failed (${res.status})`);
        }
        const data = await res.json();
        if (!data.access_token) throw new Error('No access token returned');
        if (!cancelled) setToken(data.access_token);
      } catch (e) {
        console.error("Login failed", e);
        if (!cancelled) {
          setAuthError(e.message || 'Login failed');
          setLoading(false);
        }
      }
    };
    auth();
    return () => { cancelled = true; };
  }, []);

  const fetchUser = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Fetch user failed (${res.status})`);
      const data = await res.json();
      setUser(data);
    } catch (e) {
      console.error("Fetch user failed", e);
      setAuthError(e.message || 'Fetch user failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [token]);

  // WebSocket Connection
  useEffect(() => {
    if (!token || !user) return;

    let cancelled = false;
    let reconnectTimer = null;
    let attempt = 0;

    const handleMessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "global_state") {
        setOnlineUsers(data.online_users.filter(u => u.id !== user.id));
        const now = Date.now();
        setActiveMatches(data.active_matches.map(m => ({ ...m, local_received_at: now })));

        // Deep link support: auto-spectate if we have support data
        if (supportDataRef.current) {
          const m = data.active_matches.find(x => x.id === supportDataRef.current.matchId);
          if (m) {
            handleSpectate(m, supportDataRef.current.supportId);
            setSupportData(null);
          }
        }
      }
      else if (data.type === "attack_log") {
        const currentMatchId = battleStateRef.current?.matchId;
        if (currentMatchId && data.match_id === currentMatchId) {
          const logEntry = {
            id: Date.now() + Math.random(),
            attackerName: data.attacker_name,
            targetName: data.target_name,
            amount: data.amount,
            isSpectator: data.is_spectator,
            timestamp: data.timestamp,
            isChat: false
          };
          setAttackLogs(prev => [logEntry, ...prev].slice(0, 50));
        }
      }
      else if (data.type === "chat_message") {
        const currentMatchId = battleStateRef.current?.matchId;
        if (currentMatchId && data.match_id === currentMatchId) {
          const logEntry = {
            id: Date.now() + Math.random(),
            senderName: data.sender_name,
            text: data.text,
            isChat: true,
            timestamp: data.timestamp
          };
          setAttackLogs(prev => [logEntry, ...prev].slice(0, 50));
        }
      }
      else if (data.type === "challenge_received") {
        setChallengeRequest(data);
        addToast(`⚔️ ${data.challenger_name} sent you a challenge!`, 'warning');
      }
      else if (data.type === "match_found") {
        setBattleState(prev => {
          if (prev.phase !== 'searching') {
            return prev;
          }
          return {
            ...prev,
            phase: 'playing',
            matchId: data.match_id,
            opponentId: data.opponent_id,
            opponentName: data.opponent_name || 'Opponent',
            timeRemaining: 180,
            local_received_at: Date.now()
          };
        });
        setIsSpectating(false);
      }
      else if (data.type === "challenge_declined") {
        addToast(`❌ ${data.target_name} declined your challenge.`, 'error');
        setBattleState(prev => {
          if (prev.phase === 'searching') {
            return { ...prev, phase: 'idle', opponentName: 'Waiting...' };
          }
          return prev;
        });
        setInBattle(false);
      }
      else if (data.type === "balance_update") {
        // Authoritative balance from server (after a tap deduction).
        if (typeof data.rockets_balance === 'number') {
          setUser(prev => prev ? { ...prev, rockets_balance: data.rockets_balance } : prev);
        }
      }
      else if (data.type === "error") {
        if (data.message) addToast(data.message, 'error');
      }
      else if (data.type === "score_update") {
        // Filter to current match only.
        const currentMatchId = battleStateRef.current?.matchId;
        if (currentMatchId && data.match_id && data.match_id !== currentMatchId) return;
        setBattleState(prev => {
          if (!isSpectatingRef.current) {
            // Use known opponentId from state instead of "first non-self" guesswork.
            const myScore = data.scores[user.id] ?? data.scores[String(user.id)] ?? 0;
            let opScore = prev.opponentScore;
            if (prev.opponentId != null) {
              opScore = data.scores[prev.opponentId] ?? data.scores[String(prev.opponentId)] ?? 0;
            } else {
              const opId = Object.keys(data.scores).find(id => Number(id) !== user.id);
              opScore = opId ? data.scores[opId] : 0;
            }
            return { ...prev, myScore, opponentScore: opScore };
          } else {
            const p1Id = prev.myPlayerId;
            const p2Id = prev.opponentId;
            return {
              ...prev,
              myScore: (p1Id != null ? (data.scores[p1Id] ?? data.scores[String(p1Id)]) : 0) || 0,
              opponentScore: (p2Id != null ? (data.scores[p2Id] ?? data.scores[String(p2Id)]) : 0) || 0,
            };
          }
        });
      }
      else if (data.type === "match_end") {
        const currentMatchId = battleStateRef.current?.matchId;
        if (currentMatchId && data.match_id && data.match_id !== currentMatchId) return;
        // Spectators just get notified and dropped back to the home screen.
        if (data.is_spectator) {
          addToast("The battle you were spectating has ended.", "info");
          setInBattle(false);
          setIsSpectating(false);
          setAttackLogs([]);
          setBattleState({
            phase: 'idle', matchId: null, myScore: 0, opponentScore: 0,
            opponentName: 'Waiting...', opponentId: null, isWin: null
          });
          return;
        }
        setBattleState(prev => ({
          ...prev,
          phase: 'result',
          myScore: data.my_score ?? prev.myScore,
          opponentScore: data.opponent_score ?? prev.opponentScore,
          isWin: data.is_win
        }));
        if (data.is_win === true) addToast('🏆 You won the battle!', 'success');
        else if (data.is_win === false) addToast('💀 You lost the battle.', 'error');
        else addToast('🤝 It\'s a draw!', 'info');
      }
    };

    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(`${WS_BASE}/battle?token=${token}`);
      ws.current = socket;

      socket.onopen = () => {
        attempt = 0;
        socket.send(JSON.stringify({ type: "init", name: user.first_name }));
      };

      socket.onmessage = handleMessage;

      socket.onerror = () => {
        // onclose fires next; reconnect happens there.
      };

      socket.onclose = () => {
        if (cancelled) return;
        if (ws.current === socket) ws.current = null;
        // Exponential backoff capped at 10s.
        const delay = Math.min(10000, 500 * Math.pow(2, attempt));
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws.current) {
        try { ws.current.close(); } catch (_) {}
        ws.current = null;
      }
    };
  }, [token, user?.id]);

  useEffect(() => {
    // If we are spectating and the match is no longer active (e.g. timeout ended), auto-leave
    if (inBattle && isSpectating && battleState.matchId && battleState.phase === 'playing') {
       const stillActive = activeMatches.find(m => m.id === battleState.matchId);
       if (!stillActive) {
          addToast("The battle you were spectating has ended.", "info");
          setInBattle(false);
          setIsSpectating(false);
       }
    }
  }, [activeMatches, inBattle, isSpectating, battleState.matchId, battleState.phase]);

  const handleStartRandomMatch = () => {
    setBattleState({ phase: 'searching', matchId: null, myScore: 0, opponentScore: 0, opponentName: 'Waiting...', isWin: null });
    setInBattle(true);
    setIsSpectating(false);
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "find_match" }));
    }
  };

  const handleChallengeUser = (targetId) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "challenge_user", target_id: targetId }));
      // Optimistically wait for match
      setBattleState({ phase: 'searching', matchId: null, myScore: 0, opponentScore: 0, opponentName: 'Waiting for response...', isWin: null });
      setInBattle(true);
      setIsSpectating(false);
    }
  };

  const acceptChallenge = () => {
    if (ws.current?.readyState === WebSocket.OPEN && challengeRequest) {
      ws.current.send(JSON.stringify({ type: "accept_challenge", challenger_id: challengeRequest.challenger_id }));
      setBattleState({ phase: 'searching', matchId: null, myScore: 0, opponentScore: 0, opponentName: challengeRequest.challenger_name, isWin: null });
      setInBattle(true);
      setIsSpectating(false);
      setChallengeRequest(null);
    }
  };

  const declineChallenge = () => {
    if (ws.current?.readyState === WebSocket.OPEN && challengeRequest) {
      ws.current.send(JSON.stringify({ type: "decline_challenge", challenger_id: challengeRequest.challenger_id }));
    }
    setChallengeRequest(null);
  };

  const handleSpectate = (match, targetSupportId = null) => {
    const elapsedSinceState = match.local_received_at ? Math.floor((Date.now() - match.local_received_at) / 1000) : 0;
    const actualTimeRemaining = Math.max(0, (match.time_remaining ?? 180) - elapsedSinceState);

    setBattleState({
      phase: 'playing',
      matchId: match.id,
      myScore: match.s1,
      opponentScore: match.s2,
      myPlayerId: match.p1_id || 'p1',
      opponentId: match.p2_id || 'p2',
      myName: match.p1,
      opponentName: match.p2,
      isWin: null,
      targetSupportId: targetSupportId,
      timeRemaining: actualTimeRemaining,
      local_received_at: Date.now()
    });
    setInBattle(true);
    setIsSpectating(true);
    // Register as spectator on the server so we receive scoped match events.
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "spectate", match_id: match.id }));
    }
  };

  const handleRejoin = (match) => {
    const isP1 = match.p1_id === user.id;
    const elapsedSinceState = match.local_received_at ? Math.floor((Date.now() - match.local_received_at) / 1000) : 0;
    const actualTimeRemaining = Math.max(0, (match.time_remaining ?? 180) - elapsedSinceState);

    setBattleState({
      phase: 'playing',
      matchId: match.id,
      myScore: isP1 ? match.s1 : match.s2,
      opponentScore: isP1 ? match.s2 : match.s1,
      myPlayerId: isP1 ? match.p1_id : match.p2_id,
      opponentId: isP1 ? match.p2_id : match.p1_id,
      myName: isP1 ? match.p1 : match.p2,
      opponentName: isP1 ? match.p2 : match.p1,
      isWin: null,
      // Use ?? so a server-reported 0/low value isn't replaced with 180.
      timeRemaining: actualTimeRemaining,
      local_received_at: Date.now()
    });
    setInBattle(true);
    setIsSpectating(false);
  };

  if (loading) {
    return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}><div className="pill-badge">Loading...</div></div>;
  }

  if (!user) {
    return (
      <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '20px', textAlign: 'center', gap: '12px'}}>
        <div className="pill-badge" style={{ backgroundColor: '#ff453a', color: '#fff' }}>Connection error</div>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          {authError || 'Could not connect to the server. Please try again.'}
        </p>
        <button className="primary-btn" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (inBattle) {
    return (
      <BattleScreen 
        user={user} 
        ws={ws.current}
        battleState={battleState}
        isSpectating={isSpectating}
        attackLogs={attackLogs}
        onSpendRockets={(amount) => {
          // Optimistic local update for both players and spectators; server balance_update reconciles.
          setUser(prev => prev ? { ...prev, rockets_balance: Math.max(0, prev.rockets_balance - amount) } : prev);
        }}
        onGoToShop={() => {
          setInBattle(false);
          // Preserve isSpectating and attackLogs so they restore correctly when returning
          setActiveTab('shop');
        }}
        onEnd={() => {
          // Tell the server we're leaving search/spectate so it can clean up state.
          if (ws.current?.readyState === WebSocket.OPEN) {
            try {
              if (battleState.phase === 'searching') {
                ws.current.send(JSON.stringify({ type: "cancel_find" }));
              } else if (isSpectating && battleState.matchId) {
                ws.current.send(JSON.stringify({ type: "leave_spectate" }));
              }
            } catch (_) {}
          }
          setInBattle(false);
          setIsSpectating(false);
          setAttackLogs([]);
          setBattleState({
            phase: 'idle', matchId: null, myScore: 0, opponentScore: 0,
            opponentName: 'Waiting...', opponentId: null, isWin: null
          });
          fetchUser();
        }}
      />
    );
  }

  const renderScreen = () => {
    if (viewingUserId) {
      return <PublicProfileScreen userId={viewingUserId} token={token} onBack={() => setViewingUserId(null)} onChallenge={(id) => { setViewingUserId(null); handleChallengeUser(id); }} />;
    }
    switch(activeTab) {
      case 'home': 
        return <HomeScreen user={user} onStartBattle={handleStartRandomMatch} onlineUsers={onlineUsers} activeMatches={activeMatches} onChallenge={handleChallengeUser} onSpectate={handleSpectate} onRejoin={handleRejoin} onUserClick={setViewingUserId} />;
      case 'tasks': return <TasksScreen token={token} onClaimed={fetchUser} />;
      case 'shop': return <ShopScreen token={token} user={user} onBuySuccess={fetchUser} onBack={() => {
        if (battleState.matchId && (battleState.phase === 'playing' || battleState.phase === 'result')) {
          setInBattle(true);
        } else {
          setActiveTab('home');
        }
      }} />;
      case 'top': return <LeaderboardScreen token={token} user={user} onUserClick={setViewingUserId} />;
      case 'profile': return <ProfileScreen user={user} token={token} onAdminClick={() => setActiveTab('admin')} onUserClick={setViewingUserId} />;
      case 'admin': return <AdminScreen token={token} />;
      default: return <HomeScreen user={user} onStartBattle={handleStartRandomMatch} onlineUsers={onlineUsers} activeMatches={activeMatches} onChallenge={handleChallengeUser} onSpectate={handleSpectate} onRejoin={handleRejoin} onUserClick={setViewingUserId} />;
    }
  };

  return (
    <>
      {/* Global Top Bar */}
      <div className="top-bar">
        <h1>Rocket Battle</h1>
        <div className="pill-badge" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', gap: '8px', padding: '10px 18px', cursor: 'pointer' }} onClick={() => setActiveTab('shop')}>
          <Rocket size={18} color="#fff" />
          <span style={{ fontSize: '16px' }}>{formatNum(user.rockets_balance)}</span>
          <div style={{ backgroundColor: '#30d158', color: '#000', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', marginLeft: '5px' }}>+</div>
        </div>
      </div>

      {/* Challenge Popup */}
      {challengeRequest && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="card" style={{ width: '80%', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', textAlign: 'center', border: '2px solid var(--accent-blue)' }}>
            <div className="avatar-circle" style={{ width: '80px', height: '80px', animation: 'pulse 1.5s infinite' }}><Swords size={40} color="var(--accent-blue)" /></div>
            <h2>Match Challenge!</h2>
            <p><strong>{challengeRequest.challenger_name}</strong> has challenged you to a battle.</p>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button className="secondary-btn" style={{ flex: 1 }} onClick={declineChallenge}><X size={18} /> Decline</button>
              <button className="primary-btn" style={{ flex: 1 }} onClick={acceptChallenge}><Check size={18} /> Accept</button>
            </div>
          </div>
        </div>
      )}

      {renderScreen()}
      
      {/* Floating Bottom Navigation */}
      <div className="bottom-nav-container">
        <div className="bottom-nav">
          <div className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            <Home size={24} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
            <span>Home</span>
          </div>
          <div className={`nav-item ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>
            <ClipboardList size={24} strokeWidth={activeTab === 'tasks' ? 2.5 : 2} />
            <span>Tasks</span>
          </div>
          <div className={`nav-item ${activeTab === 'top' ? 'active' : ''}`} onClick={() => setActiveTab('top')}>
            <Trophy size={24} strokeWidth={activeTab === 'top' ? 2.5 : 2} />
            <span>Top</span>
          </div>
        </div>
        <div className="profile-circle-btn" onClick={() => setActiveTab('profile')}>
          <User size={24} color={activeTab === 'profile' ? 'var(--accent-blue)' : 'var(--text-main)'} />
        </div>
      </div>

      {/* Toast Notifications */}
      <div style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '8px', width: '90%', maxWidth: '380px', pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '12px 18px', borderRadius: '14px', fontSize: '14px', fontWeight: '600',
            color: '#fff', pointerEvents: 'auto', textAlign: 'center',
            animation: 'toast-slide 0.3s ease-out',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            backgroundColor: t.type === 'success' ? '#30d158' : t.type === 'error' ? '#ff453a' : t.type === 'warning' ? '#ff9f0a' : 'var(--accent-blue)'
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}

// 1. Home Screen
const HomeScreen = ({ user, onStartBattle, onlineUsers, activeMatches, onChallenge, onSpectate, onRejoin, onUserClick }) => {
  const [searchPlayer, setSearchPlayer] = useState('');
  const [searchMatch, setSearchMatch] = useState('');
  const [subScreen, setSubScreen] = useState(null);
  
  if (subScreen === 'players') {
    return (
      <div className="screen-container" style={{ paddingBottom: '140px' }}>
        <button className="secondary-btn btn-small" style={{ marginBottom: '15px' }} onClick={() => setSubScreen(null)}>← Back</button>
        <h2 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}><Users size={20} color="var(--accent-blue)" /> Online Players ({onlineUsers.length})</h2>
        <input className="custom-input" placeholder="Search players..." value={searchPlayer} onChange={e => setSearchPlayer(e.target.value)} style={{ marginBottom: '15px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {onlineUsers.filter(u => (u.name || '').toLowerCase().includes(searchPlayer.toLowerCase())).length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No players found</span>}
          {onlineUsers.filter(u => (u.name || '').toLowerCase().includes(searchPlayer.toLowerCase())).map(u => (
            <div key={u.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => onUserClick(u.id)}>
                <div className="avatar-circle" style={{ width: '36px', height: '36px' }}><User size={16} /></div>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>{u.name}</span>
              </div>
              <button className="primary-btn" style={{ padding: '8px 16px', fontSize: '12px', width: 'auto' }} onClick={() => onChallenge(u.id)}>Challenge</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (subScreen === 'matches') {
    return (
      <div className="screen-container" style={{ paddingBottom: '140px' }}>
        <button className="secondary-btn btn-small" style={{ marginBottom: '15px' }} onClick={() => setSubScreen(null)}>← Back</button>
        <h2 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}><PlayCircle size={20} color="#ff453a" /> Live Matches ({activeMatches.length})</h2>
        <input className="custom-input" placeholder="Search matches..." value={searchMatch} onChange={e => setSearchMatch(e.target.value)} style={{ marginBottom: '15px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {activeMatches.filter(m => (m.p1||'').toLowerCase().includes(searchMatch.toLowerCase()) || (m.p2||'').toLowerCase().includes(searchMatch.toLowerCase())).length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No matches found</span>}
          {activeMatches.filter(m => (m.p1||'').toLowerCase().includes(searchMatch.toLowerCase()) || (m.p2||'').toLowerCase().includes(searchMatch.toLowerCase())).map(m => {
            const isMyMatch = m.p1_id === user.id || m.p2_id === user.id;
            return (
              <div key={m.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>{m.p1} <span style={{ color: 'var(--accent-blue)' }}>vs</span> {m.p2}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Score: {m.s1} - {m.s2}</span>
                </div>
                {isMyMatch ? (
                  <button className="primary-btn" style={{ padding: '8px 16px', fontSize: '12px', width: 'auto' }} onClick={() => onRejoin(m)}>Rejoin</button>
                ) : (
                  <button className="secondary-btn" style={{ padding: '8px 16px', fontSize: '12px', width: 'auto' }} onClick={() => onSpectate(m)}>Spectate</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="screen-container" style={{ paddingBottom: '140px' }}>
      
      {/* VS Card */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '30px 20px', gap: '20px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1, zIndex: 2 }}>
            <div className="avatar-circle" style={{ width: '85px', height: '85px', backgroundColor: '#000', border: '2px solid var(--border-color)' }}>
              <User size={40} color="#fff" />
            </div>
            <span style={{ fontWeight: '700', fontSize: '15px' }}>{user.first_name}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 0.8, marginTop: '10px', zIndex: 2 }}>
            <div className="vs-text" style={{ marginBottom: '12px' }}>VS</div>
            <div className="pill-badge" style={{ backgroundColor: 'var(--bg-card-secondary)', fontSize: '18px', padding: '8px 20px' }}>0 : 0</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1, zIndex: 2 }}>
            <div className="avatar-circle" style={{ width: '85px', height: '85px', backgroundColor: 'var(--bg-card-secondary)', border: '1px solid var(--border-color)' }}>
              <User size={40} color="var(--text-muted)" />
            </div>
            <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-muted)' }}>Waiting...</span>
          </div>
        </div>
        <div style={{ position: 'absolute', top: '120px', bottom: '30px', left: '50%', width: '1px', backgroundColor: 'var(--border-color)', transform: 'translateX(-50%)', zIndex: 1 }}></div>
      </div>

      {/* Action Card */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px' }}>Start Battle</h2>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Ranked Match</span>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
           <div style={{ flex: 1, backgroundColor: 'var(--bg-card-secondary)', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Swords size={20} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Matches</span>
             </div>
             <span style={{ fontSize: '24px', fontWeight: '700' }}>{user.total_played}</span>
           </div>
           <div style={{ flex: 1, backgroundColor: 'var(--bg-card-secondary)', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trophy size={20} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Wins</span>
             </div>
             <span style={{ fontSize: '24px', fontWeight: '700' }}>{user.wins}</span>
           </div>
        </div>
        <button className="primary-btn" style={{ padding: '20px', fontSize: '18px' }} onClick={onStartBattle}>
          <Rocket size={20} /> Find Random Match
        </button>
      </div>

      {/* Compact summary cards */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <div className="card" style={{ flex: 1, cursor: 'pointer', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }} onClick={() => setSubScreen('players')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={22} color="var(--accent-blue)" />
            <span style={{ fontSize: '15px', fontWeight: '600' }}>Online</span>
          </div>
          <span style={{ fontSize: '32px', fontWeight: '800', color: 'var(--accent-blue)' }}>{onlineUsers.length}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tap to view →</span>
        </div>
        <div className="card" style={{ flex: 1, cursor: 'pointer', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }} onClick={() => setSubScreen('matches')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PlayCircle size={22} color="#ff453a" />
            <span style={{ fontSize: '15px', fontWeight: '600' }}>Live</span>
          </div>
          <span style={{ fontSize: '32px', fontWeight: '800', color: '#ff453a' }}>{activeMatches.length}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tap to view →</span>
        </div>
      </div>

    </div>
  );
};

// 2. Battle Screen
const BattleScreen = ({ user, ws, battleState, isSpectating, attackLogs = [], onEnd, onSpendRockets, onGoToShop }) => {
  const { phase, matchId, myScore, opponentScore, opponentName, isWin, myPlayerId, opponentId, targetSupportId } = battleState;
  const [rocketsAnim, setRocketsAnim] = useState([]);
  const [localRockets, setLocalRockets] = useState(user.rockets_balance);
  // Keep local view in sync with authoritative balance (e.g. balance_update from server).
  useEffect(() => {
    setLocalRockets(user.rockets_balance);
  }, [user.rockets_balance]);
  const [timeLeft, setTimeLeft] = useState("03:00");
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(180);
  const [toastMessage, setToastMessage] = useState(null);
  const logContainerRef = useRef(null);
  
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = setInterval(() => {
      if (myScore < opponentScore && !isSpectating) {
        setToastMessage("Siz yutqazyapsiz! Tezroq harakat qiling!");
        setTimeout(() => setToastMessage(null), 4000);
      }
    }, 60000); // Check every 60 seconds
    return () => clearInterval(interval);
  }, [phase, myScore, opponentScore, isSpectating]);

  const handleLeave = () => {
    // Just exit the battle screen — match continues on server
    onEnd();
  };

  const timerRef = useRef(null);

  const fmtTime = (sec) => {
    const s = Math.max(0, sec | 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (phase === 'playing') {
      const elapsed = battleState.local_received_at ? Math.floor((Date.now() - battleState.local_received_at) / 1000) : 0;
      let seconds = Math.max(0, (battleState.timeRemaining ?? 180) - elapsed);
      setTimeLeftSeconds(seconds);
      setTimeLeft(fmtTime(seconds));
      timerRef.current = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
          seconds = 0;
          clearInterval(timerRef.current);
        }
        setTimeLeftSeconds(seconds);
        setTimeLeft(fmtTime(seconds));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase, battleState.timeRemaining, battleState.local_received_at]);

  const [rocketAmount, setRocketAmount] = useState(1);
  const [selectedTarget, setSelectedTarget] = useState(null); // 'left' | 'right' | null
  const [chatInput, setChatInput] = useState("");
  const [floatingTexts, setFloatingTexts] = useState([]);
  const prevLogsLengthRef = useRef(attackLogs.length);

  useEffect(() => {
    if (attackLogs.length > prevLogsLengthRef.current) {
      const newLogs = attackLogs.slice(0, attackLogs.length - prevLogsLengthRef.current);
      newLogs.forEach(log => {
        if (!log.isChat) {
          // Add floating text
          const isLeftAttacker = log.attackerName === (isSpectating ? battleState.myName : user.first_name);
          const newFloat = {
            id: Date.now() + Math.random(),
            amount: log.amount,
            side: isLeftAttacker ? 'left' : 'right',
            color: log.isSpectator ? '#ff9f0a' : isLeftAttacker ? 'var(--accent-blue)' : '#ff3b30'
          };
          setFloatingTexts(prev => [...prev, newFloat]);
          setTimeout(() => {
            setFloatingTexts(prev => prev.filter(f => f.id !== newFloat.id));
          }, 1000);
        }
      });
    }
    prevLogsLengthRef.current = attackLogs.length;
  }, [attackLogs, isSpectating, battleState.myName, user.first_name]);

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || phase !== 'playing') return;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "chat", match_id: matchId, text: chatInput.trim() }));
      setChatInput("");
    }
  };

  const handleTap = (e, isLeft) => {
    if (phase !== 'playing') return;
    if (localRockets < rocketAmount) {
      if (onGoToShop) {
        setToastMessage("Not enough rockets! Going to Shop...");
        setTimeout(() => onGoToShop(), 1000);
      } else {
        setToastMessage("Not enough rockets!");
        setTimeout(() => setToastMessage(null), 2000);
      }
      return;
    }

    // Optimistic local deduction for both players and spectators (server balance_update will reconcile).
    setLocalRockets(r => Math.max(0, r - rocketAmount));
    if (onSpendRockets) {
      onSpendRockets(rocketAmount);
    }
    
    // Create multiple rockets for animation if amount > 1
    const newAnims = [];
    const count = Math.min(rocketAmount, 10); // cap visual rockets at 10 to prevent lag
    for(let i=0; i<count; i++) {
        const id = Date.now() + Math.random() + i;
        const x = (e.clientX || window.innerWidth / 2) + (Math.random() * 40 - 20);
        const y = (e.clientY || window.innerHeight / 2) + (Math.random() * 40 - 20);
        newAnims.push({ id, x, y });
    }
    
    setRocketsAnim(prev => [...prev, ...newAnims]);
    setTimeout(() => setRocketsAnim(prev => prev.filter(r => !newAnims.find(n => n.id === r.id))), 500);

    if (ws?.readyState === WebSocket.OPEN) {
      if (isSpectating) {
        const targetPlayer = isLeft ? myPlayerId : opponentId;
        ws.send(JSON.stringify({ type: "spectator_tap", match_id: matchId, target_player: targetPlayer, amount: rocketAmount }));
      } else {
        ws.send(JSON.stringify({ type: "tap", match_id: matchId, amount: rocketAmount }));
      }
    }
    
    // Muvaffaqiyatli yuborgach sliderni yopamiz
    setSelectedTarget(null);
  };

  if (phase === 'searching') {
    return (
      <div className="screen-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingBottom: '20px' }}>
        <div className="top-bar">
          <h1>ROCKET BATTLE</h1>
          <div className="pill-badge" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', gap: '8px', padding: '10px 18px' }}>
            <Rocket size={18} color="#fff" />
            <span style={{ fontSize: '16px' }}>{formatNum(localRockets)}</span>
          </div>
        </div>
        
        <div className="screen-container" style={{ paddingBottom: '20px', gap: '20px', justifyContent: 'center' }}>
          {/* Main VS Card in Searching State */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '30px 20px', gap: '20px', position: 'relative', overflow: 'hidden' }}>
            
            {/* Floating particles */}
            {[...Array(6)].map((_, i) => (
              <div key={i} className="particle" style={{ 
                left: `${15 + i * 14}%`, 
                bottom: '10px',
                animationDelay: `${i * 0.5}s`,
                animationDuration: `${2.5 + i * 0.3}s`
              }} />
            ))}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
              {/* Player 1 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1, zIndex: 2 }}>
                <div style={{ position: 'relative' }}>
                  <div className="avatar-circle" style={{ width: '65px', height: '65px', backgroundColor: 'var(--accent-blue)', border: '2px solid var(--border-color)' }}>
                    <User size={30} color="#fff" />
                  </div>
                  <div style={{ position: 'absolute', bottom: '-6px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#ff9f0a', color: '#000', fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                    Lv.{user?.level || 1}
                  </div>
                </div>
                <span style={{ fontWeight: '700', fontSize: '13px', textAlign: 'center', color: 'var(--accent-blue)' }}>{user.first_name}</span>
              </div>
              
              {/* VS */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 0.8, marginTop: '10px', zIndex: 2 }}>
                <span className="search-text" style={{ fontWeight: '700', fontSize: '15px', textAlign: 'center' }}>{opponentName}</span>
                <span className="pill-badge" style={{ fontSize: '12px', padding: '2px 8px', backgroundColor: 'var(--bg-card)', opacity: opponentName === 'Searching...' ? 0 : 1 }}>Lvl ?</span>
              </div>
              
            </div>

            <div style={{ position: 'absolute', top: '120px', bottom: '30px', left: '50%', width: '1px', backgroundColor: 'var(--border-color)', transform: 'translateX(-50%)', zIndex: 1 }}></div>
          </div>
          
          {/* Animated searching status */}
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-muted)' }}>
              Raqib qidirilmoqda
              <span className="search-dot"> .</span>
              <span className="search-dot"> .</span>
              <span className="search-dot"> .</span>
            </span>
          </div>
          
          <button className="secondary-btn" onClick={onEnd}>Cancel Search</button>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    const confettiColors = ['#77a8ff', '#ff6b6b', '#ffd93d', '#6bcb77', '#a855f7', '#f97316'];
    return (
      <div className="screen-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Confetti for victories */}
        {isWin && [...Array(20)].map((_, i) => (
          <div key={i} className="confetti-piece" style={{
            left: `${Math.random() * 100}%`,
            top: '-10px',
            backgroundColor: confettiColors[i % confettiColors.length],
            animationDelay: `${Math.random() * 1.5}s`,
            animationDuration: `${2 + Math.random() * 2}s`,
            width: `${6 + Math.random() * 6}px`,
            height: `${6 + Math.random() * 6}px`,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }} />
        ))}
        
        <div className="screen-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <h1 className={`result-title ${isWin ? 'victory-text' : ''}`} style={{ fontSize: '48px', color: isWin ? 'var(--accent-blue)' : (isWin === false ? '#ff453a' : 'var(--text-main)'), marginBottom: '10px' }}>
            {isWin === null ? 'DRAW' : (isWin ? '🏆 VICTORY' : 'DEFEAT')}
          </h1>
          
          {isWin && (
            <div className="trophy-animate" style={{ fontSize: '40px', marginBottom: '15px' }}>🎉</div>
          )}
          
          {/* Rewards display */}
          <div className="reward-badge" style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
            <div className="pill-badge" style={{ padding: '8px 16px', fontSize: '14px', backgroundColor: 'rgba(119, 168, 255, 0.15)', border: '1px solid rgba(119, 168, 255, 0.3)' }}>
              ⚡ +{isWin ? 50 : 10} XP
            </div>
            <div className="pill-badge" style={{ padding: '8px 16px', fontSize: '14px', backgroundColor: 'rgba(255, 217, 61, 0.15)', border: '1px solid rgba(255, 217, 61, 0.3)' }}>
              🪙 +{isWin ? 10 : 2} Coins
            </div>
          </div>
          
          <div className="card result-card" style={{ width: '100%', textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px' }}>
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                 <div className="avatar-circle"><User size={30} /></div>
                 <span style={{ fontSize: '28px', fontWeight: 'bold', color: myScore > opponentScore ? 'var(--accent-blue)' : 'var(--text-main)' }}>{myScore}</span>
               </div>
               <div className="vs-text">VS</div>
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                 <div className="avatar-circle"><User size={30} color="var(--text-muted)" /></div>
                 <span style={{ fontSize: '28px', fontWeight: 'bold', color: opponentScore > myScore ? '#ff453a' : 'var(--text-muted)' }}>{opponentScore}</span>
               </div>
            </div>
          </div>
          <button className="primary-btn result-btn" onClick={handleLeave}>BACK TO HOME</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingBottom: '20px', position: 'relative' }}>
      
      {toastMessage && (
        <div style={{
          position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#ff3b30', color: '#fff', padding: '12px 20px', borderRadius: '25px',
          fontWeight: 'bold', zIndex: 9999, boxShadow: '0 4px 12px rgba(255,59,48,0.4)',
          animation: 'fade-in 0.3s ease-out', display: 'flex', alignItems: 'center', gap: '8px',
          whiteSpace: 'nowrap'
        }}>
          ⚠️ {toastMessage}
        </div>
      )}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={handleLeave} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--bg-card-secondary)', border: 'none', cursor: 'pointer', color: 'var(--text-main)' }}>
            <X size={20} />
          </button>
          <h1 style={{ fontSize: '18px' }}>{isSpectating ? 'SPECTATING' : 'BATTLE'}</h1>
        </div>
        <div className="pill-badge" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', gap: '8px', padding: '10px 18px' }}>
          <Rocket size={18} color="#fff" />
          <span style={{ fontSize: '16px' }}>{formatNum(localRockets)}</span>
        </div>
      </div>
      
      <div className="screen-container" style={{ paddingBottom: '20px', gap: '20px' }}>
        {/* Main VS Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '25px 20px', gap: '15px', position: 'relative' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            {/* Player 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 2 }}>
              <div style={{ position: 'relative' }}>
                <div className="avatar-circle" style={{ width: '60px', height: '60px', backgroundColor: 'var(--accent-blue)', border: '2px solid var(--border-color)' }}>
                  <User size={30} color="#fff" />
                </div>
                <div style={{ position: 'absolute', bottom: '-6px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#ff9f0a', color: '#000', fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                  Lv.{user?.level || 1}
                </div>
              </div>
              <span style={{ fontWeight: '700', fontSize: '13px', textAlign: 'center', color: 'var(--accent-blue)', marginTop: '4px' }}>{isSpectating ? battleState.myName : user.first_name}</span>
            </div>

            {/* VS Center Icon */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
              <div className="vs-text" style={{ fontSize: '24px' }}>VS</div>
            </div>

            {/* Player 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 2 }}>
              <div style={{ position: 'relative' }}>
                <div className="avatar-circle" style={{ width: '60px', height: '60px', backgroundColor: '#ff3b30', border: '2px solid var(--border-color)' }}>
                  <User size={30} color="#fff" />
                </div>
                <div style={{ position: 'absolute', bottom: '-6px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#ff9f0a', color: '#000', fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
                  Lv.?
                </div>
              </div>
              <span style={{ fontWeight: '700', fontSize: '13px', textAlign: 'center', color: '#ff3b30', marginTop: '4px' }}>{opponentName}</span>
            </div>
            </div>

          {/* Tug-of-War Progress Bar */}
          <div style={{ width: '100%', height: '28px', backgroundColor: '#ff3b30', borderRadius: '14px', overflow: 'hidden', display: 'flex', position: 'relative', marginTop: '5px', zIndex: 2, border: '2px solid rgba(255,255,255,0.1)' }}>
            <div style={{ width: `${(myScore + opponentScore) === 0 ? 50 : (myScore / (myScore + opponentScore)) * 100}%`, height: '100%', backgroundColor: 'var(--accent-blue)', transition: 'width 0.3s ease' }}></div>
            
            <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#fff', fontSize: '14px', fontWeight: 'bold', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{myScore}</div>
            <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#fff', fontSize: '14px', fontWeight: 'bold', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{opponentScore}</div>
            
            {/* Center indicator */}
            <div style={{ position: 'absolute', left: '50%', top: '-2px', bottom: '-2px', width: '3px', backgroundColor: '#fff', transform: 'translateX(-50%)', zIndex: 3, boxShadow: '0 0 5px rgba(0,0,0,0.5)' }}></div>
          </div>
        </div>

        {/* Action Panel (Voting Style) */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h3 style={{ fontSize: '18px' }}>{isSpectating ? 'Assist a Player' : 'Attack'}</h3>
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
               <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Time Left</span>
               <span className={timeLeftSeconds <= 30 ? 'timer-warning' : ''} style={{ fontSize: '16px', fontWeight: '700' }}>{timeLeft}</span>
             </div>
           </div>
           
           <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', position: 'relative' }}>
             
             {selectedTarget ? (
               <div className="screen-fade-in" style={{ backgroundColor: 'var(--bg-card-secondary)', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                     <div className="avatar-circle" style={{ width: '32px', height: '32px', backgroundColor: '#000' }}><User size={16} /></div>
                     <span style={{ fontSize: '15px', fontWeight: '700' }}>
                       {selectedTarget === 'left' ? (isSpectating ? battleState.myName : user.first_name) : opponentName}
                     </span>
                   </div>
                   <button className="secondary-btn btn-small" onClick={() => setSelectedTarget(null)}>Cancel</button>
                 </div>
                 
                 <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '15px', padding: '15px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                     <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Amount to send:</span>
                     <div className="pill-badge" style={{ backgroundColor: 'var(--bg-card)', padding: '6px 12px', fontSize: '16px', fontWeight: 'bold' }}>
                       <Rocket size={14} style={{marginRight: '6px'}}/> {rocketAmount}
                     </div>
                   </div>
                   <input 
                     type="range" 
                     min="1" 
                     max={localRockets > 0 ? localRockets : 100} 
                     value={rocketAmount} 
                     onChange={(e) => setRocketAmount(Number(e.target.value))}
                     style={{ width: '100%', accentColor: 'var(--accent-blue)', height: '8px' }}
                   />
                 </div>
                 
                 <button className="primary-btn" style={{ padding: '16px', fontSize: '16px', fontWeight: 'bold' }} onClick={(e) => handleTap(e, selectedTarget === 'left')}>
                   Confirm & Send <Rocket size={16} style={{ marginLeft: '8px' }} />
                 </button>
               </div>
             ) : (
               <div style={{ display: 'flex', gap: '15px', flex: 1 }}>
                 {/* Left Action Area */}
                 {(!isSpectating || !targetSupportId || targetSupportId === myPlayerId) && (
                   <div style={{ flex: 1, backgroundColor: 'var(--bg-card-secondary)', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px', position: 'relative' }}>
                      {floatingTexts.filter(f => f.side === 'left').map(f => (
                        <div key={f.id} style={{ position: 'absolute', top: '-20px', left: '50%', transform: 'translateX(-50%)', fontWeight: '800', fontSize: '18px', color: f.color, animation: 'float-up 1s ease-out forwards', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap' }}>
                          +{f.amount} 🚀
                        </div>
                      ))}
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                       <div className="avatar-circle" style={{ width: '32px', height: '32px', backgroundColor: '#000' }}><User size={16} /></div>
                       <span style={{ fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isSpectating ? battleState.myName : user.first_name}</span>
                     </div>
                     <button className="primary-btn" style={{ padding: '14px', fontSize: '14px' }} onClick={() => setSelectedTarget('left')}>
                       {isSpectating ? 'Support Player' : 'Attack'}
                     </button>
                   </div>
                 )}

                 {/* Right Action Area */}
                 {(!isSpectating || !targetSupportId || targetSupportId === opponentId) && (
                   <div style={{ flex: 1, backgroundColor: 'var(--bg-card-secondary)', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px', opacity: isSpectating ? 1 : 0.5, position: 'relative' }}>
                      {floatingTexts.filter(f => f.side === 'right').map(f => (
                        <div key={f.id} style={{ position: 'absolute', top: '-20px', left: '50%', transform: 'translateX(-50%)', fontWeight: '800', fontSize: '18px', color: f.color, animation: 'float-up 1s ease-out forwards', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap' }}>
                          +{f.amount} 🚀
                        </div>
                      ))}
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                       <div className="avatar-circle" style={{ width: '32px', height: '32px' }}><User size={16} /></div>
                       <span style={{ fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opponentName}</span>
                     </div>
                     <button className="primary-btn" style={{ padding: '14px', fontSize: '14px', backgroundColor: isSpectating ? 'var(--accent-blue)' : 'var(--border-color)', color: isSpectating ? '#fff' : 'var(--text-muted)' }} onClick={() => setSelectedTarget('right')} disabled={!isSpectating}>
                       {isSpectating ? 'Support Player' : 'Attack'}
                     </button>
                   </div>
                 )}
               </div>
             )}

             {/* Rockets Animation Layer */}
             {rocketsAnim.map(r => (
               <div key={r.id} style={{ position: 'fixed', left: r.x, top: r.y, pointerEvents: 'none', animation: 'rocket-fly 0.5s ease-out forwards', zIndex: 999 }}>
                 <Rocket size={30} color="var(--accent-blue)" />
               </div>
             ))}
           </div>
        </div>

        {/* Battle Chat Feed */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '10px 14px', gap: '0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <h4 style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={13} color="#ff9f0a" /> Battle Chat
            </h4>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{attackLogs.length} updates</span>
          </div>
          
          <div ref={logContainerRef} style={{ height: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px' }}>
            {attackLogs.slice(0, 30).map((log) => {
              const isMyAttack = log.isChat ? log.senderName === (isSpectating ? battleState.myName : user.first_name) : log.attackerName === (isSpectating ? battleState.myName : user.first_name);
              
              if (log.isChat) {
                return (
                  <div key={log.id} style={{
                    display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '8px',
                    backgroundColor: 'rgba(255,255,255,0.05)', fontSize: '12px', animation: 'toast-slide 0.2s ease-out'
                  }}>
                    <span style={{ fontWeight: '700', color: isMyAttack ? 'var(--accent-blue)' : '#fff' }}>{log.senderName}:</span>
                    <span style={{ color: 'var(--text-primary)' }}>{log.text}</span>
                  </div>
                );
              }

              return (
                <div key={log.id} style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '8px',
                  backgroundColor: isMyAttack ? 'rgba(119,168,255,0.1)' : 'rgba(255,59,48,0.08)',
                  fontSize: '11px', borderLeft: `3px solid ${log.isSpectator ? '#ff9f0a' : isMyAttack ? 'var(--accent-blue)' : '#ff3b30'}`,
                  animation: 'toast-slide 0.2s ease-out'
                }}>
                  <Rocket size={9} color={log.isSpectator ? '#ff9f0a' : isMyAttack ? 'var(--accent-blue)' : '#ff3b30'} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: '700', color: log.isSpectator ? '#ff9f0a' : isMyAttack ? 'var(--accent-blue)' : '#ff3b30', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70px' }}>
                    {log.attackerName}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>→</span>
                  <span style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70px', fontSize: '11px' }}>
                    {log.targetName}
                  </span>
                  <span style={{ marginLeft: 'auto', fontWeight: '800', color: '#30d158', whiteSpace: 'nowrap', fontSize: '12px' }}>+{log.amount} 🚀</span>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Send a message..." 
              style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '13px' }}
            />
            <button type="submit" style={{ backgroundColor: 'var(--accent-blue)', border: 'none', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontWeight: 'bold' }}>
              Send
            </button>
          </form>
        </div>
        
        {!isSpectating && (
          <button className="secondary-btn" onClick={() => {
            const botUsername = import.meta.env.VITE_BOT_USERNAME || 'rocketbattlebbot';
            const matchId = battleState.matchId;
            // Format must match the parser at the top of App: support_{uid}_{match_id}
            const url = `https://t.me/${botUsername}?start=support_${user.id}_${matchId}`;
            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent("Do'stim, menga yordam ber! Rocket Battle'da yutishim kerak!")}`;
            if (window.Telegram?.WebApp) {
              window.Telegram.WebApp.openTelegramLink(shareUrl);
            } else {
              window.open(shareUrl, '_blank');
            }
          }} style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Users size={18} /> Share Battle for Support
            </div>
          </button>
        )}
      </div>
    </div>
  );
};


// --- Public Profile Screen ---
const PublicProfileScreen = ({ userId, token, onBack, onChallenge }) => {
  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  
  const fetchProfile = () => {
     fetch(`${API_BASE}/users/${userId}/profile`, { headers: { 'Authorization': `Bearer ${token}` }})
       .then(r => r.json()).then(setProfile);
  };

  useEffect(() => {
     fetchProfile();
     fetch(`${API_BASE}/users/${userId}/matches`, { headers: { 'Authorization': `Bearer ${token}` }})
       .then(r => r.json()).then(setMatches);
  }, [userId, token]);

  const toggleFollow = async () => {
     await fetch(`${API_BASE}/users/${userId}/follow`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }});
     fetchProfile();
  };

  if (!profile) return <div className="screen-container">Loading...</div>;

  return (
    <div className="screen-container" style={{ paddingBottom: '100px' }}>
       <button className="secondary-btn btn-small" style={{ marginBottom: '20px' }} onClick={onBack}>← Back</button>
       
       <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', padding: '30px 20px', textAlign: 'center' }}>
         <div className="avatar-circle" style={{ width: '80px', height: '80px' }}><User size={40} /></div>
         <div>
           <h2 style={{ fontSize: '22px', marginBottom: '5px' }}>{profile.first_name} {profile.is_admin ? '👑' : ''}</h2>
           <span className="pill-badge">ID: {profile.id}</span>
         </div>
         
         <div style={{ display: 'flex', gap: '20px', margin: '10px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
               <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{profile.followers}</span>
               <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Followers</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
               <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{profile.following}</span>
               <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Following</span>
            </div>
         </div>
         
         <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <button className={profile.is_following ? "secondary-btn" : "primary-btn"} style={{ flex: 1 }} onClick={toggleFollow}>
              {profile.is_following ? "Unfollow" : "Follow"}
            </button>
            <button className="primary-btn" style={{ flex: 1, backgroundColor: '#ff453a', border: 'none' }} onClick={() => onChallenge(profile.id)}>
              Challenge
            </button>
         </div>
       </div>

       <h3 style={{ marginTop: '20px', marginBottom: '15px' }}>Match History</h3>
       <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
         {(!matches || !Array.isArray(matches) || matches.length === 0) ? <div style={{ color: 'var(--text-muted)' }}>No matches played yet.</div> : null}
         {Array.isArray(matches) && matches.map(m => (
           <div key={m.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderLeft: `4px solid ${m.result === 'win' ? 'var(--accent-blue)' : (m.result === 'loss' ? '#ff453a' : 'gray')}` }}>
             <div>
               <div style={{ fontSize: '14px', fontWeight: '600' }}>vs {m.opponent_name}</div>
               <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(m.created_at).toLocaleString()}</div>
             </div>
             <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
               {m.my_score} - {m.opponent_score}
             </div>
           </div>
         ))}
       </div>
    </div>
  );
};

// --- Shop Screen ---
const ShopScreen = ({ token, user, onBuySuccess, onBack }) => {
  const packages = [10, 50, 100, 300, 500, 1000, 3000];
  const [loadingPkg, setLoadingPkg] = useState(null);

  const handleBuy = async (amount) => {
    setLoadingPkg(amount);
    try {
      const res = await fetch(`${API_BASE}/shop/buy`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      const data = await res.json();
      
      if (data.mock) {
        alert(data.message);
        onBuySuccess();
      } else if (data.invoice_url) {
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.openInvoice(data.invoice_url, (status) => {
            if (status === 'paid') onBuySuccess();
          });
        } else {
          window.open(data.invoice_url, '_blank');
        }
      } else {
        alert("Failed to buy: " + (data.detail || "Unknown error"));
      }
    } catch (e) {
      alert("Error buying package");
    } finally {
      setLoadingPkg(null);
    }
  };

  return (
    <div className="screen-container" style={{ paddingBottom: '100px' }}>

      {onBack && (
        <button className="secondary-btn btn-small" style={{ marginBottom: '15px', alignSelf: 'flex-start' }} onClick={onBack}>← Back</button>
      )}

      <div style={{
        background: 'linear-gradient(135deg, rgba(10, 132, 255, 0.2) 0%, rgba(94, 92, 230, 0.2) 100%)',
        borderRadius: '20px',
        padding: '30px 20px',
        textAlign: 'center',
        marginBottom: '25px',
        border: '1px solid rgba(10, 132, 255, 0.3)',
        boxShadow: '0 8px 32px rgba(10, 132, 255, 0.15)'
      }}>
        <ShoppingCart size={48} color="var(--accent-blue)" style={{ marginBottom: '15px' }} />
        <h2 style={{ fontSize: '26px', marginBottom: '10px', fontWeight: '800' }}>Rocket Store</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px', lineHeight: '1.5' }}>
          Top up your balance with Telegram Stars to gain the ultimate advantage in battle!
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        {packages.map((pkg, idx) => {
          const isPopular = pkg === 500;
          return (
            <div key={pkg} className="card" style={{ 
              position: 'relative',
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '12px', 
              padding: '25px 15px',
              border: isPopular ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
              background: isPopular ? 'linear-gradient(180deg, var(--bg-card) 0%, rgba(10, 132, 255, 0.05) 100%)' : 'var(--bg-card)',
              overflow: 'hidden',
              transform: 'translateY(0)',
              transition: 'transform 0.2s ease',
              cursor: 'pointer'
            }}
            onClick={() => !loadingPkg && handleBuy(pkg)}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {isPopular && (
                <div style={{
                  position: 'absolute', top: '0', right: '0', background: 'var(--accent-blue)', color: '#fff', fontSize: '10px', fontWeight: 'bold', padding: '4px 12px', borderBottomLeftRadius: '10px'
                }}>
                  POPULAR
                </div>
              )}
              
              <div style={{
                background: 'rgba(10, 132, 255, 0.1)',
                borderRadius: '50%',
                width: '60px', height: '60px',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                boxShadow: isPopular ? '0 0 20px rgba(10, 132, 255, 0.3)' : 'none'
              }}>
                <Rocket size={32} color={isPopular ? "#fff" : "var(--accent-blue)"} fill={isPopular ? "var(--accent-blue)" : "none"} />
              </div>
              
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '22px', fontWeight: '900', display: 'block' }}>{formatNum(pkg)}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Rockets</span>
              </div>
              
              <button 
                className={isPopular ? "primary-btn" : "secondary-btn"} 
                style={{ 
                  marginTop: '5px',
                  padding: '10px', 
                  fontSize: '15px', 
                  width: '100%', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  gap: '6px',
                  fontWeight: 'bold',
                  border: isPopular ? 'none' : '1px solid rgba(255,255,255,0.1)'
                }}
                disabled={loadingPkg === pkg}
                onClick={(e) => { e.stopPropagation(); handleBuy(pkg); }}
              >
                {loadingPkg === pkg ? 'Processing...' : (
                  <>
                    <span style={{ color: '#ffd700', textShadow: '0 0 5px rgba(255, 215, 0, 0.5)' }}>⭐️</span> {pkg}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 3. Leaderboard
const LeaderboardScreen = ({ token, user, onUserClick }) => {
  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/leaderboard`, { headers: { 'Authorization': `Bearer ${token}` }})
    .then(res => res.json()).then(data => setLeaders(data));
  }, [token]);

  return (
    <div className="screen-container">
      <div className="card">
        <h3 style={{ marginBottom: '20px' }}>Top Players</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {leaders.map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ width: '20px', fontWeight: 'bold', color: i < 3 ? 'var(--text-main)' : 'var(--text-muted)' }}>{i+1}</span>
                <div className="avatar-circle" style={{ width: '40px', height: '40px' }}><User size={20} /></div>
                <span style={{ fontWeight: l.id === user.id ? 'bold' : 'normal', cursor: 'pointer', textDecoration: l.id !== user.id ? 'underline' : 'none' }} onClick={() => l.id !== user.id && onUserClick(l.id)}>
                  {l.id === user.id ? "You" : l.first_name}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div className="pill-badge" style={{ padding: '4px 10px', fontSize: '12px', backgroundColor: 'var(--accent-blue)', color: '#fff' }}>Lvl {l.level || 1}</div>
                <div className="pill-badge" style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--text-main)' }}>
                   {l.wins} 🏆
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// 4. Tasks
const TasksScreen = ({ token, onClaimed }) => {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/tasks`, { headers: { 'Authorization': `Bearer ${token}` }})
    .then(res => res.json()).then(data => setTasks(data));
  }, [token]);

  const handleClaim = async (taskId) => {
    await fetch(`${API_BASE}/tasks/${taskId}/claim`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }});
    fetch(`${API_BASE}/tasks`, { headers: { 'Authorization': `Bearer ${token}` }}).then(res => res.json()).then(data => setTasks(data));
    onClaimed();
  };

  return (
    <div className="screen-container">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {tasks.map(t => (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="avatar-circle" style={{ width: '45px', height: '45px', backgroundColor: 'rgba(100, 149, 237, 0.1)' }}>
                  <Zap size={24} color="var(--accent-blue)" />
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', marginBottom: '4px' }}>{t.title}</h3>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>+{t.reward} Rockets</span>
                </div>
              </div>
            </div>
            
            {t.target_count > 1 && t.task_type !== 'join_channel' ? (
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                   <span>Progress</span>
                   <span>{t.progress} / {t.target_count}</span>
                </div>
                <div className="progress-bg">
                  <div className="progress-fill" style={{ width: `${Math.min(100, (t.progress / t.target_count) * 100)}%` }}></div>
                </div>
              </div>
            ) : null}
            
            {t.is_completed ? (
              <button className="secondary-btn" disabled style={{ opacity: 0.5 }}>Completed</button>
            ) : t.task_type === 'join_channel' ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="secondary-btn" style={{ flex: 1 }} onClick={() => {
                  if (window.Telegram?.WebApp) {
                    window.Telegram.WebApp.openTelegramLink(t.channel_url);
                  } else {
                    window.open(t.channel_url, '_blank');
                  }
                }}>Join</button>
                <button className="primary-btn" style={{ flex: 1 }} onClick={() => handleClaim(t.id)}>Check</button>
              </div>
            ) : t.task_type === 'invite_friends' ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="secondary-btn" style={{ flex: 1 }} onClick={() => {
                  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'rocketbattlebbot';
                  const tgApp = window.Telegram?.WebApp;
                  const uid = tgApp?.initDataUnsafe?.user?.id || '0';
                  const url = `https://t.me/${botUsername}/app?startapp=ref_${uid}`;
                  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent("Join Rocket Battle and let's play!")}`;
                  if (tgApp) {
                    tgApp.openTelegramLink(shareUrl);
                  } else {
                    window.open(shareUrl, '_blank');
                  }
                }}>Invite</button>
                <button className="primary-btn" style={{ flex: 1 }} onClick={() => handleClaim(t.id)}>Check</button>
              </div>
            ) : (
              <button className="primary-btn" onClick={() => handleClaim(t.id)}>Claim Reward</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// 5. Profile & Settings
const ProfileScreen = ({ user, token, onAdminClick, onUserClick }) => {
  const [showSettings, setShowSettings] = useState(false);
  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [followListType, setFollowListType] = useState(null); // 'followers' | 'following' | null
  const [followList, setFollowList] = useState([]);
  
  useEffect(() => {
     fetch(`${API_BASE}/users/${user.id}/profile`, { headers: { 'Authorization': `Bearer ${token}` }})
       .then(r => r.json()).then(setProfile);
     fetch(`${API_BASE}/users/${user.id}/matches`, { headers: { 'Authorization': `Bearer ${token}` }})
       .then(r => r.json()).then(setMatches);
  }, [user.id, token]);


  
  // Settings states
  const [soundEnabled, setSoundEnabled] = useState(localStorage.getItem('rocket_sound') !== 'false');
  const [hapticEnabled, setHapticEnabled] = useState(localStorage.getItem('rocket_haptic') !== 'false');

  const toggleSound = () => {
    const val = !soundEnabled;
    setSoundEnabled(val);
    localStorage.setItem('rocket_sound', val);
  };

  const toggleHaptic = () => {
    const val = !hapticEnabled;
    setHapticEnabled(val);
    localStorage.setItem('rocket_haptic', val);
    // Trigger Telegram Haptic if available
    if (val && window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
  };

  if (showSettings) {
    return (
      <div className="screen-container">
         <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>Settings</h2>
         
         <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div>
                 <div style={{ fontWeight: '600', fontSize: '16px' }}>Sound Effects</div>
                 <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>In-game sounds</div>
               </div>
               <div 
                 onClick={toggleSound}
                 style={{ 
                   width: '50px', height: '28px', borderRadius: '14px', 
                   backgroundColor: soundEnabled ? 'var(--accent-blue)' : 'var(--bg-card-secondary)',
                   position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s'
                 }}
               >
                 <div style={{
                   width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#fff',
                   position: 'absolute', top: '2px', left: soundEnabled ? '24px' : '2px',
                   transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                 }} />
               </div>
            </div>

            <div style={{ height: '1px', backgroundColor: 'var(--border-color)' }}></div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div>
                 <div style={{ fontWeight: '600', fontSize: '16px' }}>Haptic Feedback</div>
                 <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Vibration on tap</div>
               </div>
               <div 
                 onClick={toggleHaptic}
                 style={{ 
                   width: '50px', height: '28px', borderRadius: '14px', 
                   backgroundColor: hapticEnabled ? 'var(--accent-blue)' : 'var(--bg-card-secondary)',
                   position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s'
                 }}
               >
                 <div style={{
                   width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#fff',
                   position: 'absolute', top: '2px', left: hapticEnabled ? '24px' : '2px',
                   transition: 'left 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                 }} />
               </div>
            </div>
         </div>

         <button className="secondary-btn" style={{ marginTop: '20px' }} onClick={() => setShowSettings(false)}>
           Back to Profile
         </button>
      </div>
    );
  }

  if (followListType) {
    return (
      <div className="screen-container" style={{ paddingBottom: '140px' }}>
        <button className="secondary-btn btn-small" style={{ marginBottom: '15px' }} onClick={() => { setFollowListType(null); setFollowList([]); }}>← Back</button>
        <h2 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
          <Users size={20} color="var(--accent-blue)" />
          {followListType === 'followers' ? 'Followers' : (followListType === 'following' ? 'Following' : 'Referred Friends')} ({followList.length})
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {followList.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No users yet</span>}
          {followList.map(u => (
            <div
              key={u.id}
              className="card"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', cursor: onUserClick ? 'pointer' : 'default' }}
              onClick={() => { if (onUserClick && u.id !== user.id) onUserClick(u.id); }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="avatar-circle" style={{ width: '40px', height: '40px' }}><User size={18} /></div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>{u.first_name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    🚀 {formatNum(u.rockets_balance)} · 🏆 {u.wins}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="screen-container">
       <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '30px 20px' }}>
         <div className="avatar-circle" style={{ width: '80px', height: '80px' }}>
           <User size={40} />
         </div>
         <div>
           <h2 style={{ fontSize: '22px', marginBottom: '5px' }}>{user.first_name}</h2>
           <span className="pill-badge">ID: {user.id}</span>
         </div>
       </div>

       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
         <div className="card" style={{ textAlign: 'center', padding: '15px', cursor: 'pointer' }} onClick={() => {
           setFollowListType('followers');
           fetch(`${API_BASE}/users/${user.id}/followers`, { headers: { 'Authorization': `Bearer ${token}` }})
             .then(r => r.json()).then(setFollowList).catch(() => setFollowList([]));
         }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Followers</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{profile?.followers || 0}</div>
         </div>
         <div className="card" style={{ textAlign: 'center', padding: '15px', cursor: 'pointer' }} onClick={() => {
           setFollowListType('following');
           fetch(`${API_BASE}/users/${user.id}/following`, { headers: { 'Authorization': `Bearer ${token}` }})
             .then(r => r.json()).then(setFollowList).catch(() => setFollowList([]));
         }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Following</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{profile?.following || 0}</div>
         </div>
         <div className="card" style={{ textAlign: 'center', padding: '15px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Level</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{user?.level || 1}</div>
         </div>
         <div className="card" style={{ textAlign: 'center', padding: '15px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Coins</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{user?.coins || 0}</div>
         </div>
         
         {/* Referrals Section */}
         <div className="card" style={{ textAlign: 'center', padding: '15px', cursor: 'pointer', gridColumn: 'span 2', backgroundColor: 'rgba(119, 168, 255, 0.05)' }} onClick={() => {
           setFollowListType('referrals');
           fetch(`${API_BASE}/users/me/referrals`, { headers: { 'Authorization': `Bearer ${token}` }})
             .then(r => r.json()).then(setFollowList).catch(() => setFollowList([]));
         }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Referred Friends</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--accent-blue)' }}>{user?.referrals_count || 0}</div>
         </div>
         
         <button className="primary-btn" style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center' }} onClick={() => {
             const botUsername = "rocketbattlebbot";
             const inviteUrl = `https://t.me/${botUsername}?start=ref_${user.id}`;
             const text = `🚀 Join Rocket Battle and let's play together!`;
             const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(text)}`;
             
             if (window.Telegram?.WebApp) {
                 window.Telegram.WebApp.openTelegramLink(shareUrl);
             } else {
                 window.open(shareUrl, '_blank');
             }
         }}>
            <Users size={20} />
            Invite Friend (+50 Rockets)
         </button>
         
         <div className="card" style={{ textAlign: 'center', padding: '15px', gridColumn: 'span 2' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>XP to Next Level</div>
            <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-main)', borderRadius: '4px', overflow: 'hidden', marginTop: '5px' }}>
              <div style={{ width: `${Math.min(100, ((user?.xp || 0) / ((user?.level || 1) * 100)) * 100)}%`, height: '100%', backgroundColor: 'var(--accent-blue)' }}></div>
            </div>
            <div style={{ fontSize: '12px', marginTop: '5px' }}>{user?.xp || 0} / {(user?.level || 1) * 100} XP</div>
         </div>
       </div>

       <h3 style={{ marginTop: '20px', marginBottom: '15px' }}>Match History</h3>
       <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
         {(!matches || !Array.isArray(matches) || matches.length === 0) ? <div style={{ color: 'var(--text-muted)' }}>No matches played yet.</div> : null}
         {Array.isArray(matches) && matches.map(m => (
           <div key={m.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderLeft: `4px solid ${m.result === 'win' ? 'var(--accent-blue)' : (m.result === 'loss' ? '#ff453a' : 'gray')}` }}>
             <div>
               <div style={{ fontSize: '14px', fontWeight: '600' }}>vs {m.opponent_name}</div>
               <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(m.created_at).toLocaleString()}</div>
             </div>
             <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
               {m.my_score} - {m.opponent_score}
             </div>
           </div>
         ))}
       </div>
       
       <button className="secondary-btn" style={{ marginTop: '20px' }} onClick={() => setShowSettings(true)}>
         Settings
       </button>
       
       {user.is_admin && (
         <button className="primary-btn" style={{ marginTop: '15px', backgroundColor: '#ff453a', border: 'none' }} onClick={onAdminClick}>
           <Shield size={20} style={{ marginRight: '8px' }} />
           Admin Panel
         </button>
       )}
    </div>
  );
};
// 6. Admin Panel
const AdminScreen = ({ token }) => {
  const [tab, setTab] = useState('users'); // users | tasks
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newTask, setNewTask] = useState({ title: '', reward: '', task_type: 'custom', target_count: '1' });
  const [msg, setMsg] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchUsers = () => {
    fetch(`${API_BASE}/admin/users`, { headers }).then(r => r.json()).then(setUsers).catch(() => {});
  };
  const fetchTasks = () => {
    fetch(`${API_BASE}/tasks`, { headers }).then(r => r.json()).then(setTasks).catch(() => {});
  };

  useEffect(() => { fetchUsers(); fetchTasks(); }, []);

  const showMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 2000); };

  const saveUser = async () => {
    await fetch(`${API_BASE}/admin/users/${editingUser.id}`, { method: 'PUT', headers, body: JSON.stringify(editForm) });
    showMsg('User updated!');
    setEditingUser(null);
    fetchUsers();
  };

  const createTask = async () => {
    if (!newTask.title || !newTask.reward) return;
    await fetch(`${API_BASE}/admin/tasks`, { method: 'POST', headers, body: JSON.stringify(newTask) });
    showMsg('Task created!');
    setNewTask({ title: '', reward: '', task_type: 'custom', target_count: '1' });
    fetchTasks();
  };

  const deleteTask = async (id) => {
    await fetch(`${API_BASE}/admin/tasks/${id}`, { method: 'DELETE', headers });
    showMsg('Task deleted!');
    fetchTasks();
  };

  // inputStyle is replaced by .custom-input and .custom-select in index.css

  return (
    <div className="screen-container">
      {/* Feedback message */}
      {msg && (
        <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--accent-blue)', color: '#fff', padding: '10px 24px', borderRadius: '12px',
          zIndex: 999, fontSize: '14px', fontWeight: '600' }}>
          {msg}
        </div>
      )}

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <button className={tab === 'users' ? 'primary-btn' : 'secondary-btn'} onClick={() => setTab('users')}>
          Users ({users.length})
        </button>
        <button className={tab === 'tasks' ? 'primary-btn' : 'secondary-btn'} onClick={() => setTab('tasks')}>
          Tasks ({tasks.length})
        </button>
      </div>

      {/* Clear stuck */}
      <button className="secondary-btn btn-small" style={{ marginBottom: '15px', backgroundColor: '#ff453a', color: '#fff' }} onClick={async () => {
        await fetch(`${API_BASE}/admin/clear-stuck`, { method: 'POST', headers });
        showMsg('Queue & matches cleared!');
      }}>
        🧹 Clear Stuck Players
      </button>

      {/* ---- USERS TAB ---- */}
      {tab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Search Input */}
          <input 
            className="custom-input" 
            placeholder="Search by ID or Name..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {/* Edit modal */}
          {editingUser && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
              <div className="card" style={{ width: '100%', maxWidth: '400px', border: '1px solid var(--accent-blue)', padding: '24px' }}>
                <h3 style={{ marginBottom: '20px', fontSize: '20px' }}>Edit: {editingUser.first_name}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Rockets Balance</label>
                    <input className="custom-input" type="number" value={editForm.rockets_balance ?? ''}
                      onChange={e => setEditForm({...editForm, rockets_balance: e.target.value})} />
                  </div>
                  <div>
                    <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Wins</label>
                    <input className="custom-input" type="number" value={editForm.wins ?? ''}
                      onChange={e => setEditForm({...editForm, wins: e.target.value})} />
                  </div>
                  <div>
                    <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Total Played</label>
                    <input className="custom-input" type="number" value={editForm.total_played ?? ''}
                      onChange={e => setEditForm({...editForm, total_played: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                    <button className="primary-btn" onClick={saveUser}><Save size={18}/> Save</button>
                    <button className="secondary-btn" onClick={() => setEditingUser(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {users.filter(u => 
            (u.first_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
            u.id.toString().includes(searchQuery)
          ).map(u => (
            <div key={u.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                <div className="avatar-circle" style={{ width: '40px', height: '40px', flexShrink: 0 }}>
                  <User size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.first_name} {u.is_admin ? '👑' : ''}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', letterSpacing: '0.5px' }}>
                    🚀 {u.rockets_balance}  ·  🏆 {u.wins}  ·  🎮 {u.total_played}
                  </div>
                </div>
              </div>
              <button className="secondary-btn btn-small" style={{ flexShrink: 0 }}
                onClick={() => { setEditingUser(u); setEditForm({ rockets_balance: u.rockets_balance, wins: u.wins, total_played: u.total_played }); }}>
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---- TASKS TAB ---- */}
      {tab === 'tasks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Create new task form */}
          <div className="card" style={{ border: '1px solid var(--accent-blue)' }}>
            <h3 style={{ marginBottom: '15px' }}>New Task</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Title</label>
                <input className="custom-input" placeholder="e.g. Use 500 Rockets" value={newTask.title}
                  onChange={e => setNewTask({...newTask, title: e.target.value})} />
              </div>
              
              <div style={{ position: 'relative' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Task Type</label>
                <div 
                  className="custom-input" 
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <span>{newTask.task_type === 'join_channel' ? 'Join Channel' : 'Custom (Standard)'}</span>
                  <ChevronDown size={16} color="var(--text-muted)" style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                </div>
                
                {isDropdownOpen && (
                  <div style={{ 
                    position: 'absolute', top: '100%', left: 0, width: '100%', zIndex: 10,
                    marginTop: '8px', backgroundColor: 'var(--bg-card-secondary)',
                    border: '1px solid var(--accent-blue)', borderRadius: '12px', overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                  }}>
                    <div 
                      style={{ padding: '12px 16px', color: '#fff', cursor: 'pointer', transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-blue)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      onClick={() => { setNewTask({...newTask, task_type: 'custom'}); setIsDropdownOpen(false); }}
                    >
                      Custom (Standard)
                    </div>
                    <div 
                      style={{ padding: '12px 16px', color: '#fff', cursor: 'pointer', transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-blue)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      onClick={() => { setNewTask({...newTask, task_type: 'join_channel'}); setIsDropdownOpen(false); }}
                    >
                      Join Channel
                    </div>
                  </div>
                )}
              </div>

              {newTask.task_type === 'join_channel' && (
                <>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Channel ID (e.g. @mychannel or -100...)</label>
                    <input className="custom-input" placeholder="@mychannel" value={newTask.channel_id || ''}
                      onChange={e => setNewTask({...newTask, channel_id: e.target.value})} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Channel URL (e.g. https://t.me/mychannel)</label>
                    <input className="custom-input" placeholder="https://t.me/mychannel" value={newTask.channel_url || ''}
                      onChange={e => setNewTask({...newTask, channel_url: e.target.value})} />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Reward 🚀</label>
                  <input className="custom-input" type="number" placeholder="50" value={newTask.reward}
                    onChange={e => setNewTask({...newTask, reward: e.target.value})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Target Count</label>
                  <input className="custom-input" type="number" placeholder="1" value={newTask.target_count}
                    onChange={e => setNewTask({...newTask, target_count: e.target.value})} />
                </div>
              </div>
              <button className="primary-btn" onClick={createTask}>Create Task</button>
            </div>
          </div>

          {/* Existing tasks list */}
          {tasks.map(t => (
            <div key={t.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>{t.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>+{t.reward}🚀 · Target: {t.target_count}</div>
              </div>
              <button className="secondary-btn" style={{ width: 'auto', padding: '8px 14px', fontSize: '12px', color: '#ff453a' }}
                onClick={() => deleteTask(t.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default App;
