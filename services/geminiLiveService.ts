
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

  constructor() {}

  async connect(
    avatar: Avatar,
    level: EnglishLevel,
    mode: PracticeType,
    history: ChatTurn[],
    callbacks: LiveSessionCallbacks
  ) {
    try {
      callbacks.onStatusChange(history.length > 0 ? 'reconnecting' : 'connecting');

      const apiKey = process.env.API_KEY;
      const ai = new GoogleGenAI({ apiKey: apiKey || '' });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      await this.audioContext.resume();
      await this.outAudioContext.resume();

      // Create memory of previous conversation
      const memoryPrompt = history.length > 0 
        ? `\n\nCONTINUATION: We are continuing an ongoing conversation. 
           HISTORY SUMMARY:
           ${history.slice(-5).map(h => `${h.role === 'user' ? 'User' : 'Coach'}: ${h.text}`).join('\n')}
           \nPick up naturally from where we left off.`
        : "";

      const systemInstruction = `
        ROLE: You are ${avatar.name}, an English Speaking Coach.
        PERSONALITY: ${avatar.tone}. 
        MISSION: Improve user's fluency. Understand English, Hindi, and Gujarati, but ALWAYS respond ONLY in English.
        Current Level: ${level}. Practice Mode: ${mode}.
        ${memoryPrompt}
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
            
            // Aggressive keep-alive to prevent idling
            this.keepAliveInterval = window.setInterval(() => {
              if (this.audioContext?.state === 'suspended') this.audioContext.resume();
              // Send a tiny bit of noise if silent to keep pipe open (optional but helpful)
            }, 3000);
          },
          onmessage: async (message: LiveServerMessage) => {
            this.handleMessage(message, callbacks);
          },
          onerror: (e: any) => {
            console.error('Session Error:', e);
            let msg = "Network interrupted.";
            if (e.message) msg = e.message;
            callbacks.onStatusChange('error', msg);
          },
          onclose: (e: CloseEvent) => {
            console.debug('Session closed with code:', e.code);
            // 1006 is the standard "unexpected/timeout" code for the 2-min limit
            if (e.code === 1006 || e.code === 1011 || e.code === 1001) {
              callbacks.onStatusChange('reconnecting', "Refreshing connection to allow unlimited speaking...");
            } else {
              callbacks.onStatusChange('closed');
            }
            this.stopAll();
          }
        }
      });

      this.session = await sessionPromise;
    } catch (err: any) {
      console.error('Connect Error:', err);
      callbacks.onStatusChange('error', err.message || 'Failed to connect.');
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
          try { session.sendRealtimeInput({ media: pcmBlob }); } catch(err) {}
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
      callbacks.onTranscriptionUpdate('user', this.currentInputTranscription, true);
      callbacks.onTranscriptionUpdate('model', this.currentOutputTranscription, true);
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
      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      this.sources.add(source);
      source.onended = () => this.sources.delete(source);
    }
  }

  stopAll() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.sources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.sources.clear();
    if (this.session) { try { this.session.close(); } catch(e) {} }
    this.audioContext?.close().catch(() => {});
    this.outAudioContext?.close().catch(() => {});
  }
}
