import { motion } from 'framer-motion';

export default function SplashScreen() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050A18] overflow-hidden">
            {/* Fullscreen Image */}
            <motion.img 
                src="/splash.png" 
                alt="Rocket Battle Splash"
                className="absolute inset-0 w-full h-full object-contain"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
            />
        </div>
    );
}
