
export type EnglishLevel = 'Basic' | 'Intermediate' | 'Advanced';

export type PracticeType = 
  | 'General English Speaking' 
  | 'Daily Conversation' 
  | 'Interview Practice' 
  | 'Public Speaking' 
  | 'Vocabulary & Fluency';

export interface Avatar {
  id: string;
  name: string;
  role: string;
  description: string;
  tone: string;
  speed: 'slow' | 'normal' | 'fast';
  image: string;
  voiceName: 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}
