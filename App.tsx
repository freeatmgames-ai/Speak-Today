
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
  const retryCount = useRef(0);
  const isUserEndingCall = useRef(false);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    const checkKey = async () => {
      const envKey = process.env.API_KEY;
      const hasSelected = window.aistudio && await window.aistudio.hasSelectedApiKey();
      if (!envKey && !hasSelected) setIsKeyMissing(true);
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
      setErrorMessage("Please set API_KEY in your environment.");
    }
  };

  const handleStartCall = async (isReconnect = false) => {
    if (!selectedAvatar) return;
    
    isUserEndingCall.current = false;
    setIsCalling(true);
    setCallStatus(isReconnect ? 'reconnecting' : 'connecting');
    setErrorMessage(null);
    
    if (geminiService.current) geminiService.current.stopAll();
    geminiService.current = new GeminiLiveService();
    
    if (!isReconnect) {
      setHistory([]);
      retryCount.current = 0;
    }
    
    try {
      await geminiService.current.connect(
        selectedAvatar, 
        selectedLevel, 
        selectedMode,
        historyRef.current,
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
            // If the user manually ended the call, ignore status changes
            if (isUserEndingCall.current) return;

            setCallStatus(status);
            
            if (status === 'error') {
              if (retryCount.current < 3) {
                retryCount.current++;
                setTimeout(() => handleStartCall(true), 1500);
              } else {
                setErrorMessage(msg || 'Connection lost.');
              }
            } else if (status === 'reconnecting') {
              // Server-side timeout or platform limit
              // Auto-reconnect immediately because isUserEndingCall is false
              retryCount.current = 0;
              handleStartCall(true);
            } else if (status === 'open') {
              retryCount.current = 0;
            }
          }
        }
      );
    } catch (err: any) {
      if (!isUserEndingCall.current && retryCount.current < 3) {
        retryCount.current++;
        setTimeout(() => handleStartCall(true), 1500);
      } else {
        setCallStatus('error');
        setErrorMessage(err.message || "Failed to start conversation.");
      }
    }
  };

  const handleEndCall = () => {
    isUserEndingCall.current = true; // Block auto-reconnect
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
      <div className="fixed inset-0 bg-slate-950 flex flex-col z-50 selection:bg-blue-500/20">
        <header className="p-4 md:p-6 flex justify-between items-center border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              <img src={selectedAvatar?.image} className="w-full h-full object-cover" alt="" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{selectedAvatar?.name}</h2>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${callStatus === 'open' ? 'bg-green-500 animate-pulse' : (callStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500')}`}></span>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest">
                  {callStatus === 'reconnecting' ? 'Unlimited Mode Active' : callStatus}
                </span>
              </div>
            </div>
          </div>
          <button 
            onClick={handleEndCall} 
            className="bg-red-500 hover:bg-red-600 text-white px-6 py-2.5 rounded-full text-xs font-black shadow-lg shadow-red-500/20 active:scale-95 transition-all"
          >
            End Call
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6 flex flex-col items-center">
          <div className="w-full max-w-2xl space-y-6">
            <div className="flex justify-center">
              <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 py-1.5 px-4 rounded-full text-[10px] uppercase tracking-[0.2em] font-black mx-auto">
                {callStatus === 'reconnecting' ? 'Refreshing Session...' : 'Direct Live Link'}
              </div>
            </div>

            {history.map((turn, i) => (
              <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`max-w-[85%] rounded-2xl px-5 py-3 ${turn.role === 'user' ? 'bg-blue-600 shadow-xl' : 'bg-slate-800/80 border border-slate-700/50'}`}>
                  <p className="text-sm md:text-base leading-relaxed font-medium">{turn.text}</p>
                </div>
              </div>
            ))}
            
            {currentSpeech.text && (
              <div className={`flex ${currentSpeech.role === 'user' ? 'justify-end' : 'justify-start'} animate-pulse`}>
                <div className={`max-w-[85%] rounded-2xl px-5 py-3 ${currentSpeech.role === 'user' ? 'bg-blue-900/40 border border-blue-500/30' : 'bg-slate-700/30 border border-slate-600/30'}`}>
                  <p className="text-sm md:text-base font-medium opacity-80">{currentSpeech.text}</p>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="bg-slate-900 border border-red-500/30 p-8 rounded-3xl text-center space-y-5 shadow-2xl animate-in shake duration-500">
                <p className="text-slate-300 font-medium text-sm leading-relaxed">{errorMessage}</p>
                <div className="flex flex-col gap-3">
                  <button onClick={() => handleStartCall(true)} className="bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-xl font-black shadow-lg shadow-blue-600/20 active:scale-95 transition-all">Manual Reconnect</button>
                </div>
              </div>
            )}
            <div ref={historyEndRef} className="h-8" />
          </div>
        </div>

        <div className="h-32 bg-slate-900/90 border-t border-slate-800/50 flex flex-col items-center justify-center p-4 backdrop-blur-xl">
           {callStatus === 'open' ? (
             <div className="flex items-center gap-2 h-12">
               {[...Array(16)].map((_, i) => (
                 <div key={i} className="w-1 bg-blue-500 rounded-full animate-bounce" style={{ height: `${30 + Math.random() * 70}%`, animationDelay: `${i * 0.05}s` }}></div>
               ))}
               <span className="ml-5 text-blue-400 text-xs font-black tracking-[0.3em] uppercase opacity-70">Coach is Listening</span>
             </div>
           ) : (
             <div className="flex flex-col items-center gap-2">
               <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
               <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">Optimizing Channel</p>
             </div>
           )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-6xl mx-auto selection:bg-blue-500/30">
      <header className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-[10px] font-black mb-6 shadow-sm uppercase tracking-widest">
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
          Unlimited High-Fidelity Voice
        </div>
        <h1 className="text-6xl md:text-8xl font-black bg-gradient-to-b from-white via-white to-slate-500 bg-clip-text text-transparent mb-4 tracking-tighter">
          SpeakFlow AI
        </h1>
        <p className="text-slate-400 text-lg md:text-xl font-medium">Master English through unlimited real-time conversation.</p>
      </header>

      {isKeyMissing && (
        <div className="w-full max-w-lg mb-10 bg-slate-900/60 border border-blue-500/30 p-10 rounded-[2.5rem] text-center animate-in fade-in zoom-in duration-700 shadow-2xl backdrop-blur-md">
           <div className="w-20 h-20 bg-blue-600/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-blue-500/20">
             <span className="text-4xl">🔑</span>
           </div>
           <h3 className="text-2xl font-black text-white mb-3">Connect Your Voice API</h3>
           <p className="text-sm text-slate-400 mb-8 leading-relaxed font-medium">To enable <b>unlimited conversation</b> and multilingual support, we use your secure Gemini API key.</p>
           <button onClick={handleOpenKeySelector} className="w-full bg-blue-600 hover:bg-blue-500 text-white px-8 py-5 rounded-2xl font-black shadow-xl shadow-blue-600/20 transition-all active:scale-[0.98] text-lg">
             Configure API Key
           </button>
        </div>
      )}

      <div className="w-full bg-slate-900/30 backdrop-blur-2xl border border-slate-800/50 rounded-[3rem] p-6 md:p-12 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
        
        <div className="flex justify-center gap-16 mb-16 relative">
          <div className="absolute top-5 left-1/4 right-1/4 h-px bg-slate-800/50 -z-0"></div>
          {[1, 2, 3].map(n => (
            <div key={n} className="flex flex-col items-center gap-3 relative z-10 transition-all">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm transition-all duration-500 ${step >= n ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                {n}
              </div>
              <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${step >= n ? 'text-blue-400' : 'text-slate-600'}`}>
                {n === 1 ? 'Coach' : n === 2 ? 'Level' : 'Mode'}
              </span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-3xl font-black text-center mb-10 tracking-tight">Meet Your Personal Coaches</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {AVATARS.map(a => <AvatarCard key={a.id} avatar={a} isSelected={selectedAvatar?.id === a.id} onSelect={setSelectedAvatar} />)}
            </div>
            <div className="mt-14 flex justify-center">
              <button 
                disabled={!selectedAvatar} 
                onClick={() => setStep(2)} 
                className="bg-white text-slate-950 hover:bg-slate-200 disabled:opacity-20 px-20 py-5 rounded-2xl font-black text-xl shadow-2xl transition-all active:scale-95"
              >
                Next Step
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-8 duration-700 flex flex-col items-center">
            <h2 className="text-4xl font-black mb-10 tracking-tight">Your Proficiency Level</h2>
            <div className="grid grid-cols-1 gap-5 w-full max-w-sm">
              {LEVELS.map(l => (
                <button 
                  key={l} 
                  onClick={() => setSelectedLevel(l as EnglishLevel)} 
                  className={`py-8 rounded-[2rem] border-2 font-black text-2xl transition-all duration-300 ${selectedLevel === l ? 'border-blue-500 bg-blue-600/10 shadow-2xl text-white scale-105' : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex gap-8 mt-14">
              <button onClick={() => setStep(1)} className="text-slate-500 font-black uppercase tracking-widest text-xs hover:text-white transition-all">Back</button>
              <button onClick={() => setStep(3)} className="bg-blue-600 text-white px-16 py-5 rounded-2xl font-black text-xl shadow-xl shadow-blue-600/20 active:scale-95">Continue</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-8 duration-700 flex flex-col items-center">
            <h2 className="text-4xl font-black mb-10 tracking-tight">Focus Area</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-3xl">
              {PRACTICE_MODES.map(m => (
                <button 
                  key={m} 
                  onClick={() => setSelectedMode(m as PracticeType)} 
                  className={`py-7 px-10 rounded-[2rem] border-2 text-left font-black transition-all duration-300 ${selectedMode === m ? 'border-blue-500 bg-blue-600/10 text-white scale-[1.02] shadow-xl' : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="mt-14 flex flex-col items-center gap-10">
               <div className="bg-blue-600/5 border border-blue-500/10 p-5 rounded-[1.5rem] max-w-lg text-center backdrop-blur-sm">
                 <p className="text-xs text-blue-400 font-black uppercase tracking-[0.2em] mb-2">Smart Connection Sync</p>
                 <p className="text-sm text-slate-400 font-medium leading-relaxed">
                   Your conversation will continue indefinitely. We automatically swap session keys in the background to bypass platform limits.
                 </p>
               </div>
               <div className="flex gap-10 items-center">
                <button onClick={() => setStep(2)} className="text-slate-500 font-black uppercase tracking-widest text-xs hover:text-white transition-all">Back</button>
                <button 
                  onClick={() => handleStartCall(false)} 
                  className="bg-green-600 hover:bg-green-500 text-white px-20 py-6 rounded-[2rem] text-3xl font-black shadow-2xl shadow-green-500/20 flex items-center gap-6 animate-pulse active:scale-95 transition-all"
                >
                  <span>📞</span> Start Call
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
