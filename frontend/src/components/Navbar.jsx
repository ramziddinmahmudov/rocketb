import { motion } from 'framer-motion';
import { Home as HomeIcon, Grid, ClipboardList, ShoppingCart, User, Trophy } from 'lucide-react';

export default function Navbar({ currentTab, setTab }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: HomeIcon, color: '#6366f1' },
    { id: 'rooms', label: 'Rooms', icon: Grid, color: '#a78bfa' },
    { id: 'tasks', label: 'Tasks', icon: ClipboardList, color: '#34d399' },
    { id: 'leaderboard', label: 'Reyting', icon: Trophy, color: '#f59e0b' },
    { id: 'profile', label: 'Profile', icon: User, color: '#38bdf8' }
  ];

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <nav className="bg-[#050A18]/90 backdrop-blur-xl border border-white/10 h-[100px] rounded-3xl py-4 px-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="flex justify-between items-center px-4">
         {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            const Icon = tab.icon;
            
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={`flex flex-col items-center justify-center w-14 gap-1 relative transition-all ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-400'}`}
              >
                {isActive && (
                   <motion.div
                     layoutId="nav-pill"
                     className="absolute inset-0 bg-white/10 rounded-xl -z-10"
                     transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                   />
                )}
                <div className={`p-1.5 rounded-lg ${isActive ? '' : ''}`}>
                  <Icon 
                     size={22} 
                     color={isActive ? tab.color : 'currentColor'} 
                     className={isActive ? `drop-shadow-[0_0_8px_${tab.color}80]` : ''}
                  />
                </div>
                <span className={`text-[10px] font-medium ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                  {tab.label}
                </span>
              </button>
            );
         })}
      </div>
      </nav>
    </div>
  );
}
