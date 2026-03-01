import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';

export default function BattleLobby({
  roomCode,
  roomName,
  participants,
  maxPlayers,
  battleStatus,
  onShareLink,
  onLeaveRoom
}) {
  const [copied, setCopied] = useState(false);
  const count = participants?.length || 0;

  const handleCopy = () => {
    const link = `https://t.me/rocketbattleebot?start=room_${roomCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    if (onShareLink) onShareLink(roomCode);
  };

  // Math for circular positioning
  const radius = 110; 
  const totalSlots = maxPlayers || 16;
  const cx = 150; 
  const cy = 150;

  return (
    <div className="flex flex-col h-full bg-[#0a0f1c] text-white">
      {/* Header */}
      <div className="flex justify-between items-start p-4">
         <button className="text-gray-400 hover:text-white" onClick={onLeaveRoom}>
            <ChevronLeft size={24} />
         </button>
         <div className="flex flex-col items-center">
             <h2 className="text-lg font-bold">Tournament</h2>
             <span className="text-xs text-gray-400">#{roomCode}</span>
         </div>
         <div className="w-6" /> {/* Spacer */}
      </div>

      {/* Top Stats */}
      <div className="flex justify-between px-6 pb-2 border-b border-white/5 mx-2">
         <div className="flex flex-col text-left">
            <span className="text-[10px] text-gray-500 uppercase">Room ID</span>
            <span className="text-sm font-bold">#{roomCode}</span>
         </div>
         <div className="flex flex-col text-center">
            <span className="text-[10px] text-gray-500 uppercase">Prize Pool</span>
            <span className="text-sm font-bold text-amber-500">2m 15s</span>
         </div>
         <div className="flex flex-col text-right">
            <span className="text-[10px] text-gray-500 uppercase">Players</span>
            <span className="text-sm font-bold">{count}/{maxPlayers}</span>
         </div>
      </div>

      {/* Circular Arena View */}
      <div className="flex-1 flex flex-col items-center justify-center relative mt-8 mb-4">
         
         <div className="relative" style={{ width: 300, height: 300 }}>
             {/* Central Core Animation */}
             <motion.div 
                className="absolute inset-0 m-auto w-32 h-32 rounded-full flex items-center justify-center"
                style={{
                   background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, rgba(0,0,0,0) 70%)',
                   boxShadow: '0 0 50px rgba(139, 92, 246, 0.3)'
                }}
             >
                <motion.div 
                   animate={{ rotate: 360 }}
                   transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                   className="w-24 h-24 rounded-full border border-purple-500/30 border-dashed"
                />
                <motion.div 
                   animate={{ rotate: -360 }}
                   transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
                   className="absolute w-16 h-16 rounded-full border border-pink-500/40"
                />
                <div className="absolute w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-[0_0_20px_#8b5cf6]" />
             </motion.div>

             {/* Player Nodes */}
             {Array.from({ length: totalSlots }).map((_, i) => {
                 const player = participants?.[i];
                 const angle = (i * (360 / totalSlots)) * (Math.PI / 180);
                 const x = cx + radius * Math.cos(angle - Math.PI / 2); // -90deg to start top
                 const y = cy + radius * Math.sin(angle - Math.PI / 2);

                 return (
                     <motion.div 
                        key={i}
                        className="absolute flex items-center justify-center"
                        style={{ left: x - 18, top: y - 18, width: 36, height: 36 }} // Centered relative to 36x36
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 + 0.5, type: 'spring' }}
                     >
                        {player ? (
                           <div className="relative w-full h-full">
                              <div className="w-full h-full rounded-full overflow-hidden border-2 border-purple-500/50 p-0.5 bg-[#0f172a]">
                                 {player.avatar_url ? (
                                    <img src={player.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                                 ) : (
                                    <div className="w-full h-full rounded-full bg-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300">
                                       {(player.username || 'P').charAt(0).toUpperCase()}
                                    </div>
                                 )}
                              </div>
                              {/* Status dot */}
                              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0a0f1c]" />
                           </div>
                        ) : (
                           <div className="w-full h-full rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/30 text-lg font-light">
                              +
                           </div>
                        )}
                     </motion.div>
                 );
             })}
         </div>

         {/* Waiting Status Text */}
         <div className="text-center mt-6 flex flex-col gap-1">
             <h3 className="text-base font-semibold text-white/90">Turnir boshlanishini kutmoqdamiz...</h3>
             <p className="text-sm text-gray-400">O'yinchilar yig'ilmoqda: <span className="text-white font-mono">{count}/{maxPlayers}</span></p>
         </div>

         <div className="text-[10px] text-gray-500 tracking-[0.2em] mt-4 uppercase font-semibold">
             A'zolar to'lishini kuting...
         </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="p-4 grid grid-cols-3 gap-3 pb-6">
          <button className="flex-1 py-3.5 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 text-white/40 text-[10px] font-black tracking-widest hover:bg-white/10 transition-all uppercase shadow-[0_4px_15px_rgba(0,0,0,0.1)]" disabled>
              Enter Match
          </button>
          <button className="flex-1 py-3.5 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 text-white/40 text-[10px] font-black tracking-widest hover:bg-white/10 transition-all uppercase shadow-[0_4px_15px_rgba(0,0,0,0.1)]">
              Watch Live
          </button>
          <button 
             onClick={handleCopy}
             className="flex-1 py-3.5 rounded-2xl text-white text-[10px] font-black tracking-widest uppercase transition-all active:scale-95 flex items-center justify-center gap-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 border border-indigo-500/30 shadow-[0_4px_15px_rgba(99,102,241,0.3)] hover:shadow-[0_4px_25px_rgba(99,102,241,0.5)]"
          >
              {copied ? 'Copied!' : 'Share'}
          </button>
      </div>

    </div>
  );
}
