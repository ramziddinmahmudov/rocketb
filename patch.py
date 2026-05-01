import sys

app_content = open("src/App.jsx").read()

# 1. Add viewingUserId to App component
app_content = app_content.replace(
    "const [activeTab, setActiveTab] = useState('home');",
    "const [activeTab, setActiveTab] = useState('home');\n  const [viewingUserId, setViewingUserId] = useState(null);"
)

# 2. Add viewingUserId render condition
render_logic_target = """  const renderScreen = () => {
    switch(activeTab) {"""
render_logic_replacement = """  const renderScreen = () => {
    if (viewingUserId) {
      return <PublicProfileScreen userId={viewingUserId} token={token} onBack={() => setViewingUserId(null)} onChallenge={(id) => { setViewingUserId(null); handleChallengeUser(id); }} />;
    }
    switch(activeTab) {"""
app_content = app_content.replace(render_logic_target, render_logic_replacement)

# 3. Pass onUserClick to screens
app_content = app_content.replace(
    "<HomeScreen user={user} onStartBattle={handleStartRandomMatch} onlineUsers={onlineUsers} activeMatches={activeMatches} onChallenge={handleChallengeUser} onSpectate={handleSpectate} />",
    "<HomeScreen user={user} onStartBattle={handleStartRandomMatch} onlineUsers={onlineUsers} activeMatches={activeMatches} onChallenge={handleChallengeUser} onSpectate={handleSpectate} onUserClick={setViewingUserId} />"
)
app_content = app_content.replace(
    "<LeaderboardScreen token={token} user={user} />",
    "<LeaderboardScreen token={token} user={user} onUserClick={setViewingUserId} />"
)

# 4. Modify HomeScreen signature
app_content = app_content.replace(
    "const HomeScreen = ({ user, onStartBattle, onlineUsers, activeMatches, onChallenge, onSpectate }) => {",
    "const HomeScreen = ({ user, onStartBattle, onlineUsers, activeMatches, onChallenge, onSpectate, onUserClick }) => {"
)

# 5. Modify HomeScreen onlineUsers render to use onUserClick
app_content = app_content.replace(
    """<div className="avatar-circle" style={{ width: '30px', height: '30px' }}><User size={14} /></div>
              <span style={{ fontSize: '14px', fontWeight: '600' }}>{u.name}</span>""",
    """<div className="avatar-circle" style={{ width: '30px', height: '30px' }}><User size={14} /></div>
              <span style={{ fontSize: '14px', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => onUserClick(u.id)}>{u.name}</span>"""
)

# 6. Add PublicProfileScreen before LeaderboardScreen
public_profile_code = """
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
       <button className="secondary-btn" style={{ width: 'auto', marginBottom: '20px' }} onClick={onBack}>← Back</button>
       
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
         {matches.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>No matches played yet.</div> : null}
         {matches.map(m => (
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
"""
app_content = app_content.replace("// 3. Leaderboard", public_profile_code + "\n// 3. Leaderboard")

# 7. Update ProfileScreen
profile_screen_old = """// 5. Profile & Settings
const ProfileScreen = ({ user, onAdminClick }) => {"""

profile_screen_new = """// 5. Profile & Settings
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
"""
app_content = app_content.replace(profile_screen_old, profile_screen_new)

profile_stats_old = """       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
         <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Total Played</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{user.total_played}</div>
         </div>
         <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Wins</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{user.wins}</div>
         </div>
       </div>"""

profile_stats_new = """       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
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
         {matches.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>No matches played yet.</div> : null}
         {matches.map(m => (
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
       </div>"""
app_content = app_content.replace(profile_stats_old, profile_stats_new)

# 8. Update LeaderboardScreen
leader_board_old = """const LeaderboardScreen = ({ token, user }) => {"""
leader_board_new = """const LeaderboardScreen = ({ token, user, onUserClick }) => {"""
app_content = app_content.replace(leader_board_old, leader_board_new)

leader_name_old = """<span style={{ fontWeight: l.id === user.id ? 'bold' : 'normal' }}>
                  {l.id === user.id ? "You" : l.first_name}
                </span>"""
leader_name_new = """<span style={{ fontWeight: l.id === user.id ? 'bold' : 'normal', cursor: 'pointer', textDecoration: l.id !== user.id ? 'underline' : 'none' }} onClick={() => l.id !== user.id && onUserClick(l.id)}>
                  {l.id === user.id ? "You" : l.first_name}
                </span>"""
app_content = app_content.replace(leader_name_old, leader_name_new)

with open("src/App.jsx", "w") as f:
    f.write(app_content)
