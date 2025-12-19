
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
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [currentSpeech, setCurrentSpeech] = useState<{ role: string, text: string }>({ role: '', text: '' });
  
  const geminiService = useRef<GeminiLiveService | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keep UI responsive to messages
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, currentSpeech]);

  const handleStartCall = async (isResume = false) => {
    if (!selectedAvatar) return;
    
    setIsCalling(true);
    setCallStatus('connecting');
    setErrorMessage(null);
    
    // Clean up previous service if exists
    if (geminiService.current) {
      geminiService.current.stopAll();
    }
    
    geminiService.current = new GeminiLiveService();
    
    if (!isResume) {
      setHistory([]);
    }
    
    await geminiService.current.connect(
      selectedAvatar, 
      selectedLevel, 
      selectedMode, 
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
            console.error('Call Error:', msg);
            let userMsg = typeof msg === 'string' ? msg : 'An unexpected connection error occurred.';
            
            if (userMsg.includes('403') || userMsg.includes('permission')) {
              userMsg = "Permission Denied. Your API key might not support real-time audio features yet.";
            } else if (userMsg.includes('402') || userMsg.includes('billing')) {
              userMsg = "Live features often require a billing-enabled project. Please check your console.";
            } else if (userMsg.includes('1006')) {
              userMsg = "Session timed out. This is a common limit for the preview version of Gemini Live.";
            }
            
            setErrorMessage(userMsg);
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
    setCurrentSpeech({ role: '', text: '' });
  };

  if (isCalling) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col z-50">
        <header className="p-4 md:p-6 flex justify-between items-center border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden border border-blue-500 phone-glow shrink-0">
              <img src={selectedAvatar?.image} className="w-full h-full object-cover" alt="" />
            </div>
            <div className="overflow-hidden">
              <h2 className="text-lg md:text-xl font-bold truncate">{selectedAvatar?.name}</h2>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${callStatus === 'open' ? 'bg-green-500 animate-pulse' : callStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`}></span>
                <span className="text-xs text-slate-400 capitalize">{callStatus}</span>
              </div>
            </div>
          </div>
          <button 
            onClick={handleEndCall}
            className="bg-red-500 hover:bg-red-600 text-white px-4 md:px-6 py-2 rounded-full font-bold transition-all text-sm flex items-center gap-2 active:scale-95"
          >
            <span className="hidden sm:inline">End Practice</span>
            <span className="sm:hidden">Exit</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6 flex flex-col items-center">
          <div className="w-full max-w-2xl space-y-6">
            <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-3 text-center mb-4">
              <p className="text-blue-400 text-xs md:text-sm">💡 <b>Tip:</b> Try to speak naturally. Use Hindi/Gujarati if you get stuck!</p>
            </div>

            {history.map((turn, i) => (
              <div 
                key={i} 
                className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-5 py-3 ${
                  turn.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none shadow-md' 
                    : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">{turn.text}</p>
                </div>
              </div>
            ))}

            {currentSpeech.text && (
              <div className={`flex ${currentSpeech.role === 'user' ? 'justify-end' : 'justify-start'} animate-pulse`}>
                <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-5 py-3 ${
                  currentSpeech.role === 'user' 
                    ? 'bg-blue-900/50 text-blue-100 border border-blue-500 rounded-tr-none' 
                    : 'bg-slate-700/50 text-slate-300 border border-slate-600 rounded-tl-none'
                }`}>
                  <p className="text-sm md:text-base">{currentSpeech.text}</p>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="bg-slate-900 border border-red-500/50 p-6 rounded-2xl text-center space-y-4 shadow-2xl">
                <div className="bg-red-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-3xl">📡</span>
                </div>
                <div>
                  <p className="font-bold text-lg text-white">Call Interrupted</p>
                  <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">{errorMessage}</p>
                </div>
                
                <div className="flex flex-col gap-3 max-w-xs mx-auto">
                  <button 
                    onClick={() => handleStartCall(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>🔄</span> Resume Session
                  </button>
                  <button 
                    onClick={handleEndCall}
                    className="text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors"
                  >
                    Quit to Home
                  </button>
                </div>
              </div>
            )}
            <div ref={historyEndRef} className="h-4" />
          </div>
        </div>

        <div className="h-40 md:h-48 border-t border-slate-800 bg-slate-900/80 p-4 flex flex-col items-center justify-center backdrop-blur-md">
          {callStatus === 'open' ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-end gap-1.5 h-10 md:h-12">
                {[...Array(16)].map((_, i) => (
                  <div 
                    key={i}
                    className="w-1 md:w-1.5 bg-blue-500 rounded-full animate-bounce"
                    style={{ 
                      height: `${20 + Math.random() * 80}%`,
                      animationDelay: `${i * 0.05}s`,
                      animationDuration: '0.6s'
                    }}
                  ></div>
                ))}
              </div>
              <p className="text-blue-400 font-medium text-sm md:text-base animate-pulse">Your coach is listening...</p>
            </div>
          ) : callStatus === 'error' ? (
            <div className="text-red-400 flex flex-col items-center gap-2">
               <span className="text-2xl">⚠️</span>
               <p className="font-medium text-sm">Session Ended</p>
            </div>
          ) : (
            <div className="text-slate-500 flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p className="text-sm">Connecting to SpeakFlow AI...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-6xl mx-auto">
      <header className="text-center mb-8 md:mb-12">
        <div className="inline-block px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-xs font-bold mb-4 animate-pulse">
          ✨ MULTILINGUAL SUPPORT ACTIVE
        </div>
        <h1 className="text-4xl md:text-6xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent mb-4 tracking-tight">
          SpeakFlow AI
        </h1>
        <p className="text-slate-400 text-lg md:text-xl max-w-lg mx-auto leading-relaxed">
          Improve your English through real conversation. We understand you in <b>Hindi</b> and <b>Gujarati</b> too.
        </p>
      </header>

      <div className="w-full bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
        
        <div className="flex justify-between items-center mb-10 px-4 max-w-md mx-auto relative z-10">
          {[1, 2, 3].map((num) => (
            <div key={num} className="flex flex-col items-center relative z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                step >= num ? 'bg-blue-600 text-white shadow-lg ring-4 ring-blue-500/20' : 'bg-slate-800 text-slate-500'
              }`}>
                {num}
              </div>
              <span className={`text-[10px] md:text-xs mt-2 font-medium ${step >= num ? 'text-blue-400' : 'text-slate-600'}`}>
                {num === 1 ? 'Avatar' : num === 2 ? 'Level' : 'Mode'}
              </span>
            </div>
          ))}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-800 -translate-y-6 mx-16"></div>
          <div className="absolute top-1/2 left-0 h-0.5 bg-blue-600 -translate-y-6 transition-all duration-500 mx-16" 
               style={{ width: `${(step - 1) * 50}%` }}></div>
        </div>

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl md:text-2xl font-bold mb-6 text-center text-white">1. Select your Coach</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {AVATARS.map(avatar => (
                <AvatarCard 
                  key={avatar.id}
                  avatar={avatar}
                  isSelected={selectedAvatar?.id === avatar.id}
                  onSelect={setSelectedAvatar}
                />
              ))}
            </div>
            <div className="mt-12 flex justify-center">
              <button 
                disabled={!selectedAvatar}
                onClick={() => setStep(2)}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-12 py-4 rounded-full text-lg font-bold transition-all shadow-xl hover:shadow-blue-500/20 active:scale-95"
              >
                Next Step
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col items-center">
            <h2 className="text-xl md:text-2xl font-bold mb-8 text-center text-white">2. Your Current Level</h2>
            <div className="flex flex-wrap justify-center gap-4 max-w-2xl">
              {LEVELS.map(level => (
                <button
                  key={level}
                  onClick={() => setSelectedLevel(level as EnglishLevel)}
                  className={`px-8 py-5 rounded-2xl border-2 transition-all text-xl font-medium w-full sm:w-64
                    ${selectedLevel === level 
                      ? 'border-blue-500 bg-blue-900/30 text-white shadow-lg ring-4 ring-blue-500/10' 
                      : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'
                    }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <div className="mt-12 flex gap-4">
              <button onClick={() => setStep(1)} className="text-slate-400 hover:text-white px-6 py-2 font-medium">Back</button>
              <button 
                onClick={() => setStep(3)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-12 py-4 rounded-full text-lg font-bold shadow-xl active:scale-95"
              >
                Next Step
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col items-center">
            <h2 className="text-xl md:text-2xl font-bold mb-8 text-center text-white">3. Practice Topic</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl w-full">
              {PRACTICE_MODES.map(mode => (
                <button
                  key={mode}
                  onClick={() => setSelectedMode(mode as PracticeType)}
                  className={`px-6 py-5 rounded-2xl border-2 transition-all text-base md:text-lg text-left flex items-center gap-4
                    ${selectedMode === mode 
                      ? 'border-blue-500 bg-blue-900/30 text-white' 
                      : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-500'
                    }`}
                >
                  <div className={`w-3 h-3 rounded-full shrink-0 ${selectedMode === mode ? 'bg-blue-500' : 'bg-slate-700'}`}></div>
                  <span className="truncate">{mode}</span>
                </button>
              ))}
            </div>
            <div className="mt-12 flex flex-col items-center gap-6">
              <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-2xl p-6 text-center max-w-lg">
                 <h4 className="font-bold text-indigo-200 mb-2 flex items-center justify-center gap-2">
                   <span>🇮🇳</span> Native Support On
                 </h4>
                 <p className="text-xs md:text-sm text-indigo-300/80 leading-relaxed">
                   Stuck on a word? Say it in <b>Hindi</b> or <b>Gujarati</b>. Your coach will understand and teach you the English way!
                 </p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep(2)} className="text-slate-400 hover:text-white px-6 py-2 font-medium">Back</button>
                <button 
                  onClick={() => handleStartCall(false)}
                  className="bg-green-600 hover:bg-green-500 text-white px-10 md:px-12 py-4 rounded-full text-lg md:text-xl font-bold shadow-2xl flex items-center gap-3 animate-bounce active:scale-95"
                >
                  <span className="text-2xl">📞</span> Start Practice
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      <footer className="mt-16 pb-8 text-slate-600 text-xs md:text-sm flex flex-wrap justify-center gap-4 md:gap-8">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> 
          SpeakFlow AI v1.5
        </span>
        <span className="hidden sm:inline">•</span>
        <span>Secure Audio Pipeline</span>
        <span className="hidden sm:inline">•</span>
        <span>Optimized for Low Latency</span>
      </footer>
    </div>
  );
};

export default App;
