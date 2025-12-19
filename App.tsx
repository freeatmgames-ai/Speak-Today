
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
  const historyRef = useRef<ChatTurn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    historyRef.current = history;
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [history, currentSpeech]);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const hasSelected = await window.aistudio.hasSelectedApiKey();
        if (!hasSelected && !process.env.API_KEY) {
          setIsKeyMissing(true);
        }
      }
    };
    checkKey();
  }, []);

  const handleOpenKeySelector = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      // Guideline: Assume successful selection after call
      setIsKeyMissing(false);
    }
  };

  const startCall = async (isReconnect = false) => {
    if (!selectedAvatar) return;
    
    setIsCalling(true);
    setCallStatus(isReconnect ? 'reconnecting' : 'connecting');
    setErrorMessage(null);
    
    // Cleanup previous session
    if (geminiService.current) {
      geminiService.current.stopAll();
    }
    
    geminiService.current = new GeminiLiveService();
    
    if (!isReconnect) setHistory([]);
    
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
            setCallStatus(status);
            if (status === 'error') {
              setErrorMessage(msg || 'Network connection failed. Please check your API key and connection.');
            }
          },
          onKeyRequired: () => {
            setIsKeyMissing(true);
            handleEndCall();
          }
        }
      );
    } catch (err: any) {
      console.error("Start call failed:", err);
      setCallStatus('error');
      setErrorMessage(err.message || "Network error. Please try again.");
    }
  };

  const handleEndCall = () => {
    geminiService.current?.stopAll();
    setIsCalling(false);
    setCallStatus('idle');
    setErrorMessage(null);
    setCurrentSpeech({ role: '', text: '' });
  };

  if (isCalling) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col z-50 overflow-hidden">
        {/* Call Header */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center bg-gradient-to-b from-slate-950/80 to-transparent z-10">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {selectedAvatar?.name}
              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30 uppercase tracking-tighter">Coach</span>
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              {callStatus === 'open' ? 'Live Conversation' : (callStatus === 'connecting' ? 'Connecting...' : 'Status: ' + callStatus)}
            </p>
          </div>
          <button onClick={handleEndCall} className="bg-red-500 hover:bg-red-600 p-4 rounded-full shadow-lg shadow-red-500/30 transition-all active:scale-90">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.209.544l-1.291 2.583a13.581 13.581 0 01-5.59-5.59l2.583-1.291a1 1 0 00.544-1.209L9.507 4.684A1 1 0 008.559 4H5z" />
            </svg>
          </button>
        </div>

        {/* Central Visual Area */}
        <div className="flex-1 flex flex-col items-center justify-center relative px-6">
          <div className="relative">
            {/* Visualizer Rings */}
            {callStatus === 'open' && (
              <>
                <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 animate-ping" style={{ animationDuration: '3s' }}></div>
                <div className="absolute inset-0 rounded-full border-2 border-blue-500/10 animate-ping" style={{ animationDuration: '4s', animationDelay: '1s' }}></div>
              </>
            )}
            
            <div className={`w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden border-4 transition-all duration-1000 ${callStatus === 'open' ? 'border-blue-500 shadow-[0_0_80px_rgba(59,130,246,0.4)] scale-110' : 'border-slate-800 grayscale'}`}>
              <img src={selectedAvatar?.image} className="w-full h-full object-cover" alt="" />
            </div>
          </div>

          <div className="mt-12 text-center space-y-4">
             {callStatus === 'connecting' && <div className="text-blue-400 font-black animate-pulse uppercase tracking-[0.3em] text-sm">Establishing Link...</div>}
             {callStatus === 'open' && currentSpeech.role === 'model' && <div className="text-blue-400 font-black animate-bounce uppercase tracking-[0.3em] text-sm">Speaking</div>}
             {callStatus === 'open' && currentSpeech.role === 'user' && <div className="text-green-400 font-black animate-pulse uppercase tracking-[0.3em] text-sm">Listening</div>}
          </div>
        </div>

        {/* Live Transcript / Captions Area */}
        <div className="h-2/5 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-6 flex flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
            {history.slice(-10).map((turn, i) => (
              <div key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${turn.role === 'user' ? 'bg-blue-600 text-white font-medium' : 'bg-slate-800 text-slate-200 border border-slate-700'}`}>
                  {turn.text}
                </div>
              </div>
            ))}
            {currentSpeech.text && (
              <div className={`flex ${currentSpeech.role === 'user' ? 'justify-end' : 'justify-start'} animate-pulse`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm italic ${currentSpeech.role === 'user' ? 'bg-blue-900/40 text-blue-200' : 'bg-slate-700/40 text-slate-300'}`}>
                  {currentSpeech.text}
                </div>
              </div>
            )}
            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-center">
                <p className="text-red-400 text-xs font-bold mb-2">{errorMessage}</p>
                <button onClick={() => startCall(true)} className="text-[10px] font-black uppercase tracking-widest bg-red-500 text-white px-4 py-2 rounded-full">Try Again</button>
              </div>
            )}
          </div>
          
          <div className="pt-4 flex justify-center">
            {callStatus === 'open' && (
               <div className="flex gap-1 items-end h-8">
                 {[...Array(12)].map((_, i) => (
                   <div key={i} className="w-1 bg-blue-500 rounded-full animate-bounce" style={{ 
                     height: `${20 + Math.random() * 80}%`, 
                     animationDelay: `${i * 0.1}s`,
                     animationDuration: '0.8s'
                   }}></div>
                 ))}
               </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-['Inter'] selection:bg-blue-500/30 flex flex-col">
      <div className="max-w-6xl mx-auto w-full p-6 md:p-12 flex-1 flex flex-col">
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full text-[10px] font-black mb-6 uppercase tracking-[0.2em] shadow-lg">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
            Real-Time English Coaching
          </div>
          <h1 className="text-5xl md:text-8xl font-black mb-4 tracking-tighter bg-gradient-to-b from-white to-slate-500 bg-clip-text text-transparent">
            SpeakFlow AI
          </h1>
          <p className="text-slate-400 text-lg md:text-xl font-medium max-w-2xl mx-auto">
            Experience 1-on-1 language coaching through high-fidelity voice. 
            Choose an avatar and start speaking.
          </p>
        </header>

        {isKeyMissing && (
          <div className="bg-blue-600/10 border border-blue-500/30 p-8 rounded-[2rem] text-center mb-12 animate-in zoom-in-95 duration-500">
            <h3 className="text-2xl font-black mb-2">Connect Your API Key</h3>
            <p className="text-slate-400 text-sm mb-6 font-medium">This app requires a Gemini API key to power real-time voice conversations.</p>
            <button onClick={handleOpenKeySelector} className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-xl font-black transition-all active:scale-95 shadow-xl shadow-blue-600/20">
              Set API Key
            </button>
          </div>
        )}

        {/* Step Indicator */}
        <div className="flex justify-center gap-12 mb-12 relative">
          {[1, 2, 3].map(n => (
            <div key={n} className="flex flex-col items-center gap-3 relative z-10">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm border-2 transition-all duration-500 ${step >= n ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-600'}`}>
                {n}
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest ${step >= n ? 'text-blue-400' : 'text-slate-700'}`}>
                {n === 1 ? 'Coach' : n === 2 ? 'Level' : 'Mode'}
              </span>
            </div>
          ))}
          <div className="absolute top-5 left-1/4 right-1/4 h-0.5 bg-slate-900 -z-0"></div>
        </div>

        {/* Selection Content */}
        <div className="flex-1">
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <h2 className="text-2xl font-black text-center mb-8">Select Your Speaking Partner</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {AVATARS.map(a => <AvatarCard key={a.id} avatar={a} isSelected={selectedAvatar?.id === a.id} onSelect={setSelectedAvatar} />)}
              </div>
              <div className="mt-12 flex justify-center">
                <button 
                  disabled={!selectedAvatar} 
                  onClick={() => setStep(2)} 
                  className="bg-white text-slate-950 hover:bg-slate-200 disabled:opacity-20 px-16 py-4 rounded-2xl font-black text-lg transition-all active:scale-95 shadow-2xl"
                >
                  Next Step
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-700 max-w-md mx-auto">
              <h2 className="text-2xl font-black text-center mb-8">Current Proficiency</h2>
              <div className="space-y-4">
                {LEVELS.map(l => (
                  <button 
                    key={l} 
                    onClick={() => setSelectedLevel(l as EnglishLevel)} 
                    className={`w-full py-6 rounded-2xl border-2 font-black text-xl transition-all ${selectedLevel === l ? 'border-blue-500 bg-blue-600/10 text-white' : 'border-slate-800 text-slate-500 hover:border-slate-700'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex justify-between mt-12">
                <button onClick={() => setStep(1)} className="text-slate-500 font-black uppercase text-xs tracking-widest hover:text-white">Back</button>
                <button onClick={() => setStep(3)} className="bg-blue-600 text-white px-12 py-4 rounded-2xl font-black shadow-lg shadow-blue-600/20 active:scale-95">Continue</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-700 max-w-2xl mx-auto">
              <h2 className="text-2xl font-black text-center mb-8">What do you want to practice?</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PRACTICE_MODES.map(m => (
                  <button 
                    key={m} 
                    onClick={() => setSelectedMode(m as PracticeType)} 
                    className={`p-6 rounded-2xl border-2 text-left font-black transition-all ${selectedMode === m ? 'border-blue-500 bg-blue-600/10 text-white' : 'border-slate-800 text-slate-500 hover:border-slate-700'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="mt-12 flex flex-col items-center gap-8">
                <div className="flex items-center gap-8">
                  <button onClick={() => setStep(2)} className="text-slate-500 font-black uppercase text-xs tracking-widest hover:text-white">Back</button>
                  <button 
                    onClick={() => startCall()} 
                    className="bg-green-600 hover:bg-green-500 text-white px-12 py-5 rounded-[2rem] text-2xl font-black shadow-2xl shadow-green-500/20 active:scale-95 flex items-center gap-4 group"
                  >
                    <span className="group-hover:rotate-12 transition-transform">📞</span>
                    Start Calling
                  </button>
                </div>
                <p className="text-xs text-slate-600 font-medium uppercase tracking-[0.2em]">Microphone access required</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
