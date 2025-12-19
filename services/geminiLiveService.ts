
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../utils/audioUtils';
import { Avatar, EnglishLevel, PracticeType, ChatTurn } from '../types';

export interface LiveSessionCallbacks {
  onTranscriptionUpdate: (role: 'user' | 'model', text: string, isComplete: boolean) => void;
  onStatusChange: (status: 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting', message?: string) => void;
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
  private micStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isActive = false;

  constructor() {}

  async connect(
    avatar: Avatar,
    level: EnglishLevel,
    mode: PracticeType,
    history: ChatTurn[],
    callbacks: LiveSessionCallbacks
  ) {
    try {
      this.isActive = true;
      callbacks.onStatusChange(history.length > 0 ? 'reconnecting' : 'connecting');

      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key missing");
      
      const ai = new GoogleGenAI({ apiKey });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      await this.audioContext.resume();
      await this.outAudioContext.resume();

      // Ensure the AI knows this is a continuous conversation to avoid repetitive greetings
      const memoryPrompt = history.length > 0 
        ? `\n\n[SYSTEM: CONNECTION REFRESHED. DO NOT GREET THE USER AGAIN. CONTINUE THE PREVIOUS CONVERSATION NATURALLY. Last few sentences: ${history.slice(-2).map(h => h.text).join(' | ')}]`
        : "";

      const systemInstruction = `You are ${avatar.name}, an English coach. Tone: ${avatar.tone}. Level: ${level}. Focus: ${mode}. Understand English/Hindi/Gujarati, but respond ONLY in English. ${memoryPrompt}`;

      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

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
            if (!this.isActive) return;
            callbacks.onStatusChange('open');
            this.startMicStreaming(sessionPromise);
            this.keepAliveInterval = window.setInterval(() => {
              if (this.audioContext?.state === 'suspended') this.audioContext?.resume();
            }, 3000);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!this.isActive) return;
            this.handleMessage(message, callbacks);
          },
          onerror: (e: any) => {
            console.error('Socket Error:', e);
            if (this.isActive) {
              callbacks.onStatusChange('error', "Connection issue. Retrying...");
            }
          },
          onclose: (e: CloseEvent) => {
            const wasActive = this.isActive;
            this.stopAll(); // Cleanup immediately
            
            if (wasActive && (e.code === 1006 || e.code === 1011 || e.code === 1001)) {
              // Server-side timeout (the 2-min limit)
              callbacks.onStatusChange('reconnecting');
            } else if (wasActive) {
              callbacks.onStatusChange('closed');
            }
          }
        }
      });

      this.session = await sessionPromise;
    } catch (err: any) {
      this.isActive = false;
      callbacks.onStatusChange('error', err.message || 'Connect failed');
      throw err;
    }
  }

  private startMicStreaming(sessionPromise: Promise<any>) {
    if (!this.audioContext || !this.micStream) return;
    
    const source = this.audioContext.createMediaStreamSource(this.micStream);
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.isActive || !this.session) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = createBlob(inputData);
      
      sessionPromise.then((session) => {
        if (this.isActive && session && session.sendRealtimeInput) {
          try {
            session.sendRealtimeInput({ media: pcmBlob });
          } catch (err) {
            // Drop frames silently during closing
          }
        }
      });
    };

    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
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
      callbacks.onTranscriptionUpdate('user', this.currentInputTranscription, true);
      callbacks.onTranscriptionUpdate('model', this.currentOutputTranscription, true);
      this.currentInputTranscription = '';
      this.currentOutputTranscription = '';
    }

    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.outAudioContext && this.isActive) {
      this.nextStartTime = Math.max(this.nextStartTime, this.outAudioContext.currentTime);
      const buffer = await decodeAudioData(decode(audioData), this.outAudioContext, 24000, 1);
      const source = this.outAudioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.outAudioContext.destination);
      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      this.sources.add(source);
      source.onended = () => this.sources.delete(source);
    }

    if (message.serverContent?.interrupted) {
      this.sources.forEach(s => { try { s.stop(); } catch(e) {} });
      this.sources.clear();
      this.nextStartTime = 0;
    }
  }

  stopAll() {
    this.isActive = false;
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = null;
    
    this.sources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.sources.clear();

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }

    if (this.session) {
      try { this.session.close(); } catch(e) {}
      this.session = null;
    }

    this.audioContext?.close().catch(() => {});
    this.outAudioContext?.close().catch(() => {});
  }
}
