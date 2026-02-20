import { motion } from 'framer-motion';

export default function SplashScreen() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050A18] overflow-hidden">
            {/* Blurred Background Layer (fills screen) */}
            <div className="absolute inset-0 z-0">
                 <img 
                    src="/splash.png" 
                    alt="Background" 
                    className="w-full h-full object-cover opacity-30 blur-xl scale-110"
                />
                <div className="absolute inset-0 bg-black/40" /> {/* Dark overlay */}
            </div>

            {/* Main Image Layer (centered, contained) */}
            <div className="relative z-10 w-full max-w-md px-4 flex flex-col items-center">
                <motion.img 
                    src="/splash.png" 
                    alt="Rocket Battle"
                    className="w-full h-auto object-contain rounded-xl shadow-2xl border border-white/10"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                />
                {/* a */}
                {/* Loader */}
                <div className="mt-8 flex flex-col items-center gap-2">
                    <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                    <span className="text-cyan-400 font-mono text-sm tracking-widest animate-pulse">
                        LOADING...
                    </span>
                </div>
            </div>
        </div>
    );
}
