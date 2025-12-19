
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../utils/audioUtils';
import { Avatar, EnglishLevel, PracticeType } from '../types';

export interface LiveSessionCallbacks {
  onTranscriptionUpdate: (role: 'user' | 'model', text: string, isComplete: boolean) => void;
  onStatusChange: (status: 'connecting' | 'open' | 'closed' | 'error', message?: string) => void;
}

export class GeminiLiveService {
  private session: any | null = null;
  private audioContext: AudioContext | null = null;
  private outAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private currentInputTranscription = '';
  private currentOutputTranscription = '';
  private keepAliveInterval: number | null = null;

  constructor() {}

  async connect(
    avatar: Avatar,
    level: EnglishLevel,
    mode: PracticeType,
    callbacks: LiveSessionCallbacks
  ) {
    try {
      callbacks.onStatusChange('connecting');

      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error('API Key is missing. Please set the API_KEY environment variable in your Vercel/deployment dashboard.');
      }

      const ai = new GoogleGenAI({ apiKey });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      await this.audioContext.resume();
      await this.outAudioContext.resume();

      const systemInstruction = `
        ROLE: You are ${avatar.name}, a multilingual AI English Speaking Coach.
        PERSONALITY: ${avatar.tone} 
        SPEAKING SPEED: ${avatar.speed}. 
        TARGET LEVEL: ${level}.
        PRACTICE MODE: ${mode}.

        MULTILINGUAL CAPABILITIES:
        - You fully understand English, Hindi (Hinglish), and Gujarati (Gujlish).
        - If the user speaks Hindi or Gujarati, understand the meaning perfectly.
        - CRITICAL RULE: ALWAYS respond ONLY in English. Never speak Hindi or Gujarati yourself.
        
        FEEDBACK LOGIC:
        1. If user speaks in Hindi/Gujarati: Acknowledge you understood, then explain the English equivalent.
        2. If user speaks broken English: Correct politely.
        3. Motivation is key. Say "You're doing great!" often.
        
        RESPONSE FORMAT (Spoken & Text):
        ✔ [What they did well / That was great!]
        ✏ [Small correction if needed]
        ⭐ [Improved English sentence: "Instead of '...', you can say '...'"]
        ❓ [Next speaking question]

        MISSION: Help users transition from their native language to fluent English.
        NEVER end the conversation unless the user says "stop".
      `;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: avatar.voiceName } },
          },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            callbacks.onStatusChange('open');
            this.startMicStreaming(stream, sessionPromise);
            this.keepAliveInterval = window.setInterval(() => {
              if (this.audioContext?.state === 'suspended') {
                this.audioContext.resume();
              }
            }, 10000);
          },
          onmessage: async (message: LiveServerMessage) => {
            this.handleMessage(message, callbacks);
          },
          onerror: (e: any) => {
            console.error('Gemini Live Error:', e);
            let errorMsg = 'Unknown connection error';
            if (e instanceof Error) errorMsg = e.message;
            else if (e && e.message) errorMsg = e.message;
            else if (typeof e === 'string') errorMsg = e;
            else if (e && e.type === 'error') errorMsg = 'The connection was interrupted by the server.';
            else errorMsg = JSON.stringify(e);
            
            callbacks.onStatusChange('error', errorMsg);
          },
          onclose: (e: CloseEvent) => {
            console.debug('Gemini Live Connection closed:', e);
            if (e.code === 1006 || e.code === 1011) {
              callbacks.onStatusChange('error', `Connection lost (Code ${e.code}). This is a common preview limit.`);
            } else {
              callbacks.onStatusChange('closed');
            }
            this.stopAll();
          }
        }
      });

      this.session = await sessionPromise;
    } catch (err) {
      console.error('Failed to connect to Gemini Live:', err);
      let errorMsg = 'Failed to initialize session';
      if (err instanceof Error) errorMsg = err.message;
      callbacks.onStatusChange('error', errorMsg);
    }
  }

  private startMicStreaming(stream: MediaStream, sessionPromise: Promise<any>) {
    if (!this.audioContext) return;
    const source = this.audioContext.createMediaStreamSource(stream);
    const scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    scriptProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = createBlob(inputData);
      sessionPromise.then((session) => {
        if (session) {
          try {
            session.sendRealtimeInput({ media: pcmBlob });
          } catch (err) {
            console.error('Error sending mic data:', err);
          }
        }
      });
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(this.audioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage, callbacks: LiveSessionCallbacks) {
    if (message.serverContent?.inputTranscription) {
      this.currentInputTranscription += message.serverContent.inputTranscription.text;
      callbacks.onTranscriptionUpdate('user', this.currentInputTranscription, false);
    }
    
    if (message.serverContent?.outputTranscription) {
      this.currentOutputTranscription += message.serverContent.outputTranscription.text;
      callbacks.onTranscriptionUpdate('model', this.currentOutputTranscription, false);
    }

    if (message.serverContent?.turnComplete) {
      const uText = this.currentInputTranscription;
      const mText = this.currentOutputTranscription;
      callbacks.onTranscriptionUpdate('user', uText, true);
      callbacks.onTranscriptionUpdate('model', mText, true);
      this.currentInputTranscription = '';
      this.currentOutputTranscription = '';
    }

    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.outAudioContext) {
      this.nextStartTime = Math.max(this.nextStartTime, this.outAudioContext.currentTime);
      const buffer = await decodeAudioData(decode(audioData), this.outAudioContext, 24000, 1);
      
      const source = this.outAudioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.outAudioContext.destination);
      source.addEventListener('ended', () => this.sources.delete(source));
      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      this.sources.add(source);
    }

    if (message.serverContent?.interrupted) {
      this.sources.forEach(s => {
        try { s.stop(); } catch(e) {}
      });
      this.sources.clear();
      this.nextStartTime = 0;
    }
  }

  stopAll() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.sources.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    this.sources.clear();
    if (this.session) {
      try { this.session.close(); } catch(e) {}
      this.session = null;
    }
    this.audioContext?.close().catch(() => {});
    this.outAudioContext?.close().catch(() => {});
  }
}
