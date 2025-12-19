
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Avatar, EnglishLevel, PracticeType, ChatTurn } from './types';
import { AVATARS, LEVELS, PRACTICE_MODES } from './constants';
import { AvatarCard } from './components/AvatarCard';
import { GeminiLiveService } from './services/geminiLiveService';

const App: React.FC = () => {
  const [step, setStep] = useState(1);
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<EnglishLevel>('Intermediate');
  const [selectedMode, setSelectedMode] = useState<PracticeType>('General English Speaking');
  const [isCalling, setIsCalling] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [currentSpeech, setCurrentSpeech] = useState<{ role: string, text: string }>({ role: '', text: '' });
  const [isKeyMissing, setIsKeyMissing] = useState(false);
  
  const geminiService = useRef<GeminiLiveService | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<ChatTurn[]>([]);

  // Keep historyRef in sync for the service to use during auto-reconnect
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    const checkKey = async () => {
      const envKey = process.env.API_KEY;
      const hasSelected = window.aistudio && await window.aistudio.hasSelectedApiKey();
      if (!envKey && !hasSelected) {
        setIsKeyMissing(true);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, currentSpeech]);

  const handleOpenKeySelector = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setIsKeyMissing(false);
    } else {
      setErrorMessage("Key selector not available. Please set API_KEY in your environment variables.");
    }
  };

  const handleStartCall = async (isReconnect = false) => {
    if (!selectedAvatar) return;
    
    // Check key again before starting
    const envKey = process.env.API_KEY;
    const hasSelected = window.aistudio && await window.aistudio.hasSelectedApiKey();
    if (!envKey && !hasSelected) {
      await handleOpenKeySelector();
    }

    setIsCalling(true);
    setCallStatus(isReconnect ? 'reconnecting' : 'connecting');
    setErrorMessage(null);
    
    if (geminiService.current) {
      geminiService.current.stopAll();
    }
    
    geminiService.current = new GeminiLiveService();
    
    if (!isReconnect) {
      setHistory([]);
    }
    
    await geminiService.current.connect(
      selectedAvatar, 
      selectedLevel, 
      selectedMode,
      historyRef.current, // Pass history for continuity
      {
        onTranscriptionUpdate: (role, text, isComplete) => {
          if (isComplete) {
            setHistory(prev => [...prev, { role, text, timestamp: Date.now() }]);
            setCurrentSpeech({ role: '', text: '' });
          } else {
            setCurrentSpeech({ role, text });
          }
        },
        onStatusChange: (status, msg) => {
          setCallStatus(status);
          if (status === 'error') {
            setErrorMessage(msg || 'Connection lost.');
          } else if (status === 'reconnecting') {
            // UNLIMITED MODE: Automatically trigger reconnection
            console.log("Session limit reached. Automatically reconnecting...");
            setTimeout(() => handleStartCall(true), 500); 
          }
        }
      }
    );
  };

  const handleEndCall = () => {
    geminiService.current?.stopAll();
    setIsCalling(false);
    setCallStatus('idle');
    setErrorMessage(null);
    setHistory([]);
    historyRef.current = [];
    setCurrentSpeech({ role: '', text: '' });
  };

  if (isCalling) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col z-50">
        <header className="p-4 md:p-6 flex justify-between items-center border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-blue-500 phone-glow">
              <img src={selectedAvatar?.image} className="w-full h-full object-cover" alt="" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{selectedAvatar?.name}</h2>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${callStatus === 'open' ? 'bg-green-500 animate-pulse' : (callStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500')}`}></span>
                <span className="text-xs text-slate-400 capitalize">{callStatus}</span>
              </div>
            </div>
          </div>
          <button onClick={handleEndCall} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold">End Call</button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6 flex flex-col items-center">
          <div className="w-full max-w-2xl space-y-6">
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 py-1.5 px-3 rounded-full text-[10px] uppercase tracking-widest font-bold mx-auto w-fit">
              Unlimited Mode Active
            </div>

            {history.map((turn, i) => (
              <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-300`}>
                <div className={`max-w-[85%] rounded-2xl px-5 py-3 ${turn.role === 'user' ? 'bg-blue-600 shadow-lg' : 'bg-slate-800 border border-slate-700'}`}>
                  <p className="text-sm md:text-base leading-relaxed">{turn.text}</p>
                </div>
              </div>
            ))}
            {currentSpeech.text && (
              <div className={`flex ${currentSpeech.role === 'user' ? 'justify-end' : 'justify-start'} animate-pulse`}>
                <div className={`max-w-[85%] rounded-2xl px-5 py-3 ${currentSpeech.role === 'user' ? 'bg-blue-900/50 border border-blue-500' : 'bg-slate-700/50'}`}>
                  <p className="text-sm md:text-base">{currentSpeech.text}</p>
                </div>
              </div>
            )}
            {callStatus === 'reconnecting' && (
              <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-xl text-center animate-pulse">
                <p className="text-blue-400 text-sm font-bold flex items-center justify-center gap-2">
                  <span className="animate-spin">🔄</span> Refreshing Unlimited Pipeline...
                </p>
              </div>
            )}
            {errorMessage && (
              <div className="bg-slate-900 border border-red-500/50 p-6 rounded-2xl text-center space-y-4 shadow-2xl">
                <p className="text-red-400 font-medium">{errorMessage}</p>
                <div className="flex flex-col gap-2">
                  <button onClick={() => handleStartCall(true)} className="bg-blue-600 px-6 py-2 rounded-xl font-bold shadow-lg">Retry Connection</button>
                  <button onClick={handleOpenKeySelector} className="text-blue-400 text-xs underline">Fix API Key</button>
                </div>
              </div>
            )}
            <div ref={historyEndRef} className="h-4" />
          </div>
        </div>

        <div className="h-32 bg-slate-900/80 border-t border-slate-800 flex flex-col items-center justify-center p-4 backdrop-blur-md">
           {callStatus === 'open' ? (
             <div className="flex items-center gap-1.5 h-10">
               {[...Array(12)].map((_, i) => (
                 <div key={i} className="w-1.5 bg-blue-500 rounded-full animate-bounce" style={{ height: `${30 + Math.random() * 70}%`, animationDelay: `${i * 0.08}s` }}></div>
               ))}
               <span className="ml-4 text-blue-400 text-sm font-bold animate-pulse tracking-widest uppercase">Listening</span>
             </div>
           ) : (
             <div className="flex items-center gap-3">
               <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-slate-400 text-sm font-medium tracking-wide">Syncing Voice Data...</p>
             </div>
           )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-6xl mx-auto">
      <header className="text-center mb-10">
        <div className="inline-block bg-blue-500/10 border border-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-[10px] font-bold mb-4">
          ✨ MULTILINGUAL + UNLIMITED VOICE
        </div>
        <h1 className="text-5xl md:text-7xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-500 bg-clip-text text-transparent mb-2 tracking-tighter">
          SpeakFlow AI
        </h1>
        <p className="text-slate-400 text-lg">Master English through unlimited real-time conversation.</p>
      </header>

      {isKeyMissing && (
        <div className="w-full max-w-lg mb-8 bg-blue-900/20 border border-blue-500/30 p-8 rounded-3xl text-center animate-in fade-in zoom-in duration-500 shadow-2xl">
           <div className="text-4xl mb-4">🔑</div>
           <h3 className="text-xl font-bold text-blue-200 mb-2">Connect Your Voice API</h3>
           <p className="text-sm text-slate-300 mb-6 leading-relaxed">To allow <b>unlimited speaking</b>, we use your own Gemini API key. It's secure and handled locally in your browser.</p>
           <button onClick={handleOpenKeySelector} className="w-full bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-black shadow-xl transition-all active:scale-95 text-lg">
             Setup My API Key
           </button>
           <div className="mt-6 flex justify-center gap-4 text-[10px] text-slate-500 uppercase tracking-widest">
             <span>End-to-End Secure</span>
             <span>•</span>
             <span>Direct to Google</span>
           </div>
        </div>
      )}

      <div className="w-full bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
        <div className="flex justify-center gap-12 mb-12 relative">
          <div className="absolute top-1/2 left-1/4 right-1/4 h-px bg-slate-800 -z-0"></div>
          {[1, 2, 3].map(n => (
            <div key={n} className="flex flex-col items-center gap-2 relative z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm transition-all ${step >= n ? 'bg-blue-600 text-white shadow-lg ring-4 ring-blue-500/20' : 'bg-slate-800 text-slate-600 border border-slate-700'}`}>
                {n}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-tighter ${step >= n ? 'text-blue-400' : 'text-slate-600'}`}>
                {n === 1 ? 'Coach' : n === 2 ? 'Level' : 'Mode'}
              </span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-black text-center mb-8">Choose Your Personal Coach</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {AVATARS.map(a => <AvatarCard key={a.id} avatar={a} isSelected={selectedAvatar?.id === a.id} onSelect={setSelectedAvatar} />)}
            </div>
            <div className="mt-12 flex justify-center">
              <button 
                disabled={!selectedAvatar} 
                onClick={() => setStep(2)} 
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-20 text-white px-16 py-4 rounded-full font-black text-xl shadow-xl transition-all active:scale-95"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col items-center">
            <h2 className="text-3xl font-black mb-8">What is your level?</h2>
            <div className="grid grid-cols-1 gap-4 w-full max-w-sm">
              {LEVELS.map(l => (
                <button 
                  key={l} 
                  onClick={() => setSelectedLevel(l as EnglishLevel)} 
                  className={`py-6 rounded-2xl border-2 font-bold text-xl transition-all ${selectedLevel === l ? 'border-blue-500 bg-blue-900/20 shadow-lg text-white' : 'border-slate-800 text-slate-500 hover:border-slate-600'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex gap-6 mt-12">
              <button onClick={() => setStep(1)} className="text-slate-500 font-bold hover:text-white transition-colors">Back</button>
              <button onClick={() => setStep(3)} className="bg-blue-600 text-white px-12 py-4 rounded-full font-black text-xl shadow-xl active:scale-95">Next</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col items-center">
            <h2 className="text-3xl font-black mb-8">Practice Focus</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl">
              {PRACTICE_MODES.map(m => (
                <button 
                  key={m} 
                  onClick={() => setSelectedMode(m as PracticeType)} 
                  className={`py-5 px-8 rounded-2xl border-2 text-left font-bold transition-all ${selectedMode === m ? 'border-blue-500 bg-blue-900/20 text-white' : 'border-slate-800 text-slate-500 hover:border-slate-600'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="mt-12 flex flex-col items-center gap-8">
               <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-2xl max-w-md text-center">
                 <p className="text-sm text-blue-400 font-medium leading-relaxed">
                   🚀 <b>Auto-Continuity Enabled:</b> If the connection pauses after 2 minutes, we'll automatically refresh it so you can keep speaking forever.
                 </p>
               </div>
               <div className="flex gap-6">
                <button onClick={() => setStep(2)} className="text-slate-500 font-bold hover:text-white transition-colors">Back</button>
                <button 
                  onClick={() => handleStartCall(false)} 
                  className="bg-green-600 hover:bg-green-500 text-white px-16 py-5 rounded-full text-2xl font-black shadow-2xl flex items-center gap-4 animate-bounce active:scale-95"
                >
                  <span>📞</span> Start Speaking
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
