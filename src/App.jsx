import React, { useState, useEffect, useRef } from 'react';
import { Home, ClipboardList, User, Rocket, Swords, Trophy, Zap, Clock, Shield, Trash2, Save, ChevronDown, Users, PlayCircle, X, Check } from 'lucide-react';

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

  useEffect(() => {
    if (tg) tg.expand();
  }, []);

  // Auth
  useEffect(() => {
    const auth = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ init_data: INIT_DATA })
        });
        const data = await res.json();
        setToken(data.access_token);
      } catch (e) {
        console.error("Login failed", e);
      }
    };
    auth();
  }, []);

  const fetchUser = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setUser(data);
    } catch (e) {
      console.error("Fetch user failed", e);
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
    
    ws.current = new WebSocket(`${WS_BASE}/battle?token=${token}`);
    
    ws.current.onopen = () => {
      ws.current.send(JSON.stringify({ type: "init", name: user.first_name }));
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === "global_state") {
        setOnlineUsers(data.online_users.filter(u => u.id !== user.id));
        setActiveMatches(data.active_matches);
      } 
      else if (data.type === "challenge_received") {
        setChallengeRequest(data);
      }
      else if (data.type === "match_found") {
        // Only enter battle if user explicitly started searching (via Find Match or Challenge)
        setBattleState(prev => {
          // Ignore match_found if not in searching phase
          if (prev.phase !== 'searching') {
            console.log("Ignoring match_found - not searching");
            return prev;
          }
          return {
            ...prev,
            phase: 'playing',
            matchId: data.match_id,
            opponentId: data.opponent_id,
            opponentName: data.opponent_name || 'Opponent'
          };
        });
        // Only set inBattle if we were actually searching
        setInBattle(prev => prev);
        setIsSpectating(false);
      }
      else if (data.type === "score_update") {
        setBattleState(prev => {
          // If we are playing
          if (!isSpectating) {
            const myScore = data.scores[user.id] || 0;
            const opId = Object.keys(data.scores).find(id => Number(id) !== user.id);
            const opScore = opId ? data.scores[opId] : 0;
            return { ...prev, myScore, opponentScore: opScore };
          } 
          // If spectating, we map scores to player1 and player2 logic
          else {
            // For spectator, "myScore" = player 1, "opponentScore" = player 2 
            // We need to parse who is who based on activeMatches or initial spectator join
            const p1Id = prev.myPlayerId;
            const p2Id = prev.opponentId;
            return {
              ...prev,
              myScore: data.scores[p1Id] || 0,
              opponentScore: data.scores[p2Id] || 0
            };
          }
        });
      }
      else if (data.type === "match_end") {
        setBattleState(prev => ({
          ...prev,
          phase: 'result',
          myScore: data.my_score || prev.myScore,
          opponentScore: data.opponent_score || prev.opponentScore,
          isWin: data.is_win
        }));
      }
    };

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [token, user?.id, isSpectating]);

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
      setChallengeRequest(null);
    }
  };

  const declineChallenge = () => {
    setChallengeRequest(null);
  };

  const handleSpectate = (match) => {
    setBattleState({
      phase: 'playing',
      matchId: match.id,
      myScore: match.s1,
      opponentScore: match.s2,
      myPlayerId: match.players?.[0] || 'p1', // We will fix this in backend global_state later if needed
      opponentId: match.players?.[1] || 'p2',
      myName: match.p1,
      opponentName: match.p2,
      isWin: null
    });
    setInBattle(true);
    setIsSpectating(true);
  };

  if (loading) {
    return <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}><div className="pill-badge">Loading...</div></div>;
  }

  if (inBattle) {
    return (
      <BattleScreen 
        user={user} 
        ws={ws.current}
        battleState={battleState}
        isSpectating={isSpectating}
        onEnd={() => { 
          setInBattle(false); 
          setIsSpectating(false);
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
        return <HomeScreen user={user} onStartBattle={handleStartRandomMatch} onlineUsers={onlineUsers} activeMatches={activeMatches} onChallenge={handleChallengeUser} onSpectate={handleSpectate} onUserClick={setViewingUserId} />;
      case 'tasks': return <TasksScreen token={token} onClaimed={fetchUser} />;
      case 'shop': return <LeaderboardScreen token={token} user={user} onUserClick={setViewingUserId} />;
      case 'profile': return <ProfileScreen user={user} token={token} onAdminClick={() => setActiveTab('admin')} />;
      case 'admin': return <AdminScreen token={token} />;
      default: return <HomeScreen user={user} onStartBattle={handleStartRandomMatch} onlineUsers={onlineUsers} activeMatches={activeMatches} onChallenge={handleChallengeUser} onSpectate={handleSpectate} onUserClick={setViewingUserId} />;
    }
  };

  return (
    <>
      {/* Global Top Bar */}
      <div className="top-bar">
        <h1>Rocket Battle</h1>
        <div className="pill-badge" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', gap: '8px', padding: '10px 18px' }}>
          <Rocket size={18} color="#fff" />
          <span style={{ fontSize: '16px' }}>{user.rockets_balance}</span>
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
          <div className={`nav-item ${activeTab === 'shop' ? 'active' : ''}`} onClick={() => setActiveTab('shop')}>
            <Trophy size={24} strokeWidth={activeTab === 'shop' ? 2.5 : 2} />
            <span>Top</span>
          </div>
        </div>
        <div className="profile-circle-btn" onClick={() => setActiveTab('profile')}>
          <User size={24} color={activeTab === 'profile' ? 'var(--accent-blue)' : 'var(--text-main)'} />
        </div>
      </div>
    </>
  );
}

// 1. Home Screen
const HomeScreen = ({ user, onStartBattle, onlineUsers, activeMatches, onChallenge, onSpectate, onUserClick }) => {
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
          {activeMatches.filter(m => (m.p1||'').toLowerCase().includes(searchMatch.toLowerCase()) || (m.p2||'').toLowerCase().includes(searchMatch.toLowerCase())).map(m => (
            <div key={m.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>{m.p1} <span style={{ color: 'var(--accent-blue)' }}>vs</span> {m.p2}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Score: {m.s1} - {m.s2}</span>
              </div>
              <button className="secondary-btn" style={{ padding: '8px 16px', fontSize: '12px', width: 'auto' }} onClick={() => onSpectate(m)}>Spectate</button>
            </div>
          ))}
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
const BattleScreen = ({ user, ws, battleState, isSpectating, onEnd }) => {
  const { phase, matchId, myScore, opponentScore, opponentName, isWin, myPlayerId, opponentId } = battleState;
  const [rocketsAnim, setRocketsAnim] = useState([]);
  const [localRockets, setLocalRockets] = useState(user.rockets_balance);
  const [timeLeft, setTimeLeft] = useState("03:00");
  
  const timerRef = useRef(null);

  useEffect(() => {
    if (phase === 'playing') {
      let seconds = 180;
      timerRef.current = setInterval(() => {
        seconds--;
        if (seconds <= 0) clearInterval(timerRef.current);
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        setTimeLeft(`0${m}:${s.toString().padStart(2, '0')}`);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const handleTap = (e, isLeft) => {
    if (phase !== 'playing' || localRockets <= 0) return;
    
    // Spectator can't tap if they have no rockets, actually handled above.
    setLocalRockets(r => r - 1);
    
    const id = Date.now() + Math.random();
    const x = e.clientX || window.innerWidth / 2;
    const y = e.clientY || window.innerHeight / 2;
    setRocketsAnim(prev => [...prev, { id, x, y }]);
    setTimeout(() => setRocketsAnim(prev => prev.filter(r => r.id !== id)), 500);

    if (ws?.readyState === WebSocket.OPEN) {
      if (isSpectating) {
        // Send spectator tap to specific player
        const targetPlayer = isLeft ? myPlayerId : opponentId;
        ws.send(JSON.stringify({ type: "spectator_tap", match_id: matchId, target_player: targetPlayer }));
      } else {
        // Normal tap for self
        ws.send(JSON.stringify({ type: "tap", match_id: matchId }));
      }
    }
  };

  if (phase === 'searching') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingBottom: '20px' }}>
        <div className="top-bar">
          <h1>ROCKET BATTLE</h1>
          <div className="pill-badge" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', gap: '8px', padding: '10px 18px' }}>
            <Rocket size={18} color="#fff" />
            <span style={{ fontSize: '16px' }}>{localRockets}</span>
          </div>
        </div>
        
        <div className="screen-container" style={{ paddingBottom: '20px', gap: '20px', justifyContent: 'center' }}>
          {/* Main VS Card in Searching State */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '30px 20px', gap: '20px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
              
              {/* Player 1 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1, zIndex: 2 }}>
                <div className="avatar-circle" style={{ width: '85px', height: '85px', backgroundColor: '#000', border: '2px solid var(--border-color)' }}>
                  <User size={40} color="#fff" />
                </div>
                <span style={{ fontWeight: '700', fontSize: '15px', textAlign: 'center' }}>{user.first_name}</span>
              </div>

              {/* VS Center */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 0.8, marginTop: '10px', zIndex: 2 }}>
                <div className="vs-text" style={{ marginBottom: '12px' }}>VS</div>
                <div className="pill-badge" style={{ backgroundColor: 'var(--bg-card-secondary)', fontSize: '18px', padding: '8px 20px' }}>
                  ? : ?
                </div>
              </div>

              {/* Searching / Waiting */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1, zIndex: 2 }}>
                <div className="avatar-circle" style={{ width: '85px', height: '85px', backgroundColor: 'var(--bg-card-secondary)', border: '1px solid var(--border-color)', animation: 'pulse 1.5s infinite' }}>
                  <User size={40} color="var(--text-muted)" />
                </div>
                <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--accent-blue)', textAlign: 'center' }}>{opponentName}</span>
              </div>
              
            </div>

            <div style={{ position: 'absolute', top: '120px', bottom: '30px', left: '50%', width: '1px', backgroundColor: 'var(--border-color)', transform: 'translateX(-50%)', zIndex: 1 }}></div>
          </div>
          
          <button className="secondary-btn" onClick={onEnd}>Cancel Search</button>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div className="screen-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <h1 style={{ fontSize: '48px', color: isWin ? 'var(--accent-blue)' : 'var(--text-main)', marginBottom: '30px' }}>
            {isWin === null ? 'FINISHED' : (isWin ? 'VICTORY' : 'DEFEAT')}
          </h1>
          <div className="card" style={{ width: '100%', textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px' }}>
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                 <div className="avatar-circle"><User size={30} /></div>
                 <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{myScore}</span>
               </div>
               <div className="vs-text">VS</div>
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                 <div className="avatar-circle"><User size={30} color="var(--text-muted)" /></div>
                 <span style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{opponentScore}</span>
               </div>
            </div>
          </div>
          <button className="primary-btn" onClick={onEnd}>BACK TO HOME</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingBottom: '20px' }}>
      <div className="top-bar">
        <h1>{isSpectating ? 'SPECTATING' : 'ROCKET BATTLE'}</h1>
        <div className="pill-badge" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', gap: '8px', padding: '10px 18px' }}>
          <Rocket size={18} color="#fff" />
          <span style={{ fontSize: '16px' }}>{localRockets}</span>
        </div>
      </div>
      
      <div className="screen-container" style={{ paddingBottom: '20px', gap: '20px' }}>
        {/* Main VS Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '30px 20px', gap: '20px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
            
            {/* Player 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1, zIndex: 2 }}>
              <div className="avatar-circle" style={{ width: '85px', height: '85px', backgroundColor: '#000', border: '2px solid var(--border-color)' }}>
                <User size={40} color="#fff" />
              </div>
              <span style={{ fontWeight: '700', fontSize: '15px', textAlign: 'center' }}>{isSpectating ? battleState.myName : user.first_name}</span>
            </div>

            {/* VS Center */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 0.8, marginTop: '10px', zIndex: 2 }}>
              <div className="vs-text" style={{ marginBottom: '12px' }}>VS</div>
              <div className="pill-badge" style={{ backgroundColor: 'var(--bg-card-secondary)', fontSize: '18px', padding: '8px 20px' }}>
                {myScore} : {opponentScore}
              </div>
            </div>

            {/* Player 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1, zIndex: 2 }}>
              <div className="avatar-circle" style={{ width: '85px', height: '85px', backgroundColor: 'var(--bg-card-secondary)', border: '2px solid var(--border-color)' }}>
                <User size={40} color="var(--text-muted)" />
              </div>
              <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-muted)', textAlign: 'center' }}>{opponentName}</span>
            </div>
            
          </div>

          {/* Vertical Separator Line */}
          <div style={{ position: 'absolute', top: '120px', bottom: '30px', left: '50%', width: '1px', backgroundColor: 'var(--border-color)', transform: 'translateX(-50%)', zIndex: 1 }}></div>
        </div>

        {/* Action Panel (Voting Style) */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h3 style={{ fontSize: '18px' }}>{isSpectating ? 'Assist a Player' : 'Attack'}</h3>
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
               <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Time Left</span>
               <span style={{ fontSize: '16px', fontWeight: '700' }}>{timeLeft}</span>
             </div>
           </div>
           
           <div style={{ flex: 1, display: 'flex', gap: '15px', position: 'relative' }}>
             {/* Left Action Area */}
             <div style={{ flex: 1, backgroundColor: 'var(--bg-card-secondary)', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                 <div className="avatar-circle" style={{ width: '32px', height: '32px', backgroundColor: '#000' }}><User size={16} /></div>
                 <span style={{ fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isSpectating ? battleState.myName : user.first_name}</span>
               </div>
               <button className="primary-btn" style={{ padding: '14px', fontSize: '14px' }} onClick={(e) => handleTap(e, true)}>
                 {isSpectating ? 'Assist' : 'Attack'} <Rocket size={14} />
               </button>
             </div>

             {/* Right Action Area */}
             <div style={{ flex: 1, backgroundColor: 'var(--bg-card-secondary)', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px', opacity: isSpectating ? 1 : 0.5 }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                 <div className="avatar-circle" style={{ width: '32px', height: '32px' }}><User size={16} /></div>
                 <span style={{ fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opponentName}</span>
               </div>
               <button className="primary-btn" style={{ padding: '14px', fontSize: '14px', backgroundColor: isSpectating ? 'var(--accent-blue)' : 'var(--border-color)', color: isSpectating ? '#fff' : 'var(--text-muted)' }} onClick={(e) => handleTap(e, false)} disabled={!isSpectating}>
                 {isSpectating ? 'Assist' : 'Attack'} <Rocket size={14} />
               </button>
             </div>

             {/* Rockets Animation Layer */}
             {rocketsAnim.map(r => (
               <div key={r.id} style={{ position: 'fixed', left: r.x, top: r.y, pointerEvents: 'none', animation: 'rocket-fly 0.5s ease-out forwards', zIndex: 999 }}>
                 <Rocket size={30} color="var(--accent-blue)" />
               </div>
             ))}
           </div>
        </div>
        {isSpectating && <button className="secondary-btn" onClick={onEnd}>Leave Spectator</button>}
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
                <div className="pill-badge" style={{ padding: '4px 10px', fontSize: '12px' }}>{l.wins} 🏆</div>
                <div className="pill-badge" style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--accent-blue)' }}>
                  <Rocket size={12} style={{marginRight: '4px'}}/> {l.rockets_balance}
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
const ProfileScreen = ({ user, token, onAdminClick }) => {
  const [showSettings, setShowSettings] = useState(false);
  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  
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
         <div className="card" style={{ textAlign: 'center', padding: '15px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Followers</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{profile?.followers || 0}</div>
         </div>
         <div className="card" style={{ textAlign: 'center', padding: '15px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Following</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{profile?.following || 0}</div>
         </div>
         <div className="card" style={{ textAlign: 'center', padding: '15px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Total Played</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{user.total_played}</div>
         </div>
         <div className="card" style={{ textAlign: 'center', padding: '15px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Wins</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{user.wins}</div>
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
