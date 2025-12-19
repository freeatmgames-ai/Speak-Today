
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../utils/audioUtils';
import { Avatar, EnglishLevel, PracticeType, ChatTurn } from '../types';

export interface LiveSessionCallbacks {
  onTranscriptionUpdate: (role: 'user' | 'model', text: string, isComplete: boolean, confidence?: number) => void;
  onStatusChange: (status: 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting', message?: string) => void;
  onKeyRequired?: () => void;
}

export class GeminiLiveService {
  private audioContext: AudioContext | null = null;
  private outAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private currentInputTranscription = '';
  private currentOutputTranscription = '';
  private micStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isActive = false;
  private sessionPromise: Promise<any> | null = null;

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
      if (!apiKey) {
        callbacks.onKeyRequired?.();
        throw new Error("API Key missing");
      }
      
      // Always create a new instance to ensure we have the latest key
      const ai = new GoogleGenAI({ apiKey });

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const memoryContext = history.length > 0 
        ? `Previous conversation summary: ${history.slice(-3).map(h => h.text).join(' -> ')}. Continue naturally.`
        : "Start a new conversation.";

      const levelInstructions = {
        'Basic': 'Use extremely simple vocabulary, short sentences, and speak very slowly. Focus on basic greetings and everyday objects.',
        'Intermediate': 'Use natural conversational English with common idioms. Correct small grammar mistakes gently.',
        'Advanced': 'Use sophisticated vocabulary and complex sentence structures. Provide high-level feedback on nuances.'
      };

      const systemInstruction = `
        ROLE: You are ${avatar.name}, an English Speaking Coach. 
        PERSONALITY: ${avatar.tone}. 
        LEVEL: ${level}. ${levelInstructions[level]}
        PRACTICE MODE: ${mode}.
        STYLE: Conduct this as a friendly phone call. 
        FEEDBACK: Occasionally mention what the user did well or how to improve a sentence naturally in conversation.
        CONTEXT: ${memoryContext}
      `;

      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this.sessionPromise = ai.live.connect({
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
            this.startMicStreaming();
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!this.isActive) return;
            this.handleMessage(message, callbacks);
          },
          onerror: (e: any) => {
            console.error('Gemini Live Error:', e);
            if (e?.message?.includes('entity was not found') || e?.message?.includes('API_KEY')) {
              callbacks.onKeyRequired?.();
            }
            if (this.isActive) {
              callbacks.onStatusChange('error', "Connection interrupted. Retrying...");
            }
          },
          onclose: (e: CloseEvent) => {
            if (this.isActive) {
              callbacks.onStatusChange('reconnecting');
            } else {
              callbacks.onStatusChange('closed');
            }
          }
        }
      });

      await this.sessionPromise;
    } catch (err: any) {
      this.isActive = false;
      callbacks.onStatusChange('error', err.message);
      throw err;
    }
  }

  private startMicStreaming() {
    if (!this.audioContext || !this.micStream || !this.sessionPromise) return;
    
    const source = this.audioContext.createMediaStreamSource(this.micStream);
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.isActive) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = createBlob(inputData);
      
      // CRITICAL: Solely rely on sessionPromise resolves
      this.sessionPromise?.then((session) => {
        if (this.isActive && session) {
          try {
            session.sendRealtimeInput({ media: pcmBlob });
          } catch (err) {
            console.warn("Input stream failed", err);
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

    this.audioContext?.close().catch(() => {});
    this.outAudioContext?.close().catch(() => {});
    this.sessionPromise = null;
  }
}
