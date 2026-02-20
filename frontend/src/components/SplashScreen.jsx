export default function SplashScreen() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050A18]">
            <img 
                src="/splash.jpg" 
                alt="Loading..." 
                className="w-full h-full object-cover"
            />
        </div>
    );
}
