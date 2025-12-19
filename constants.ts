
import { Avatar } from './types';

export const AVATARS: Avatar[] = [
  {
    id: 'coach',
    name: 'Friendly Coach 👋',
    role: 'Patient Beginner Guide',
    description: 'Warm and encouraging. Perfect if you are just starting your journey.',
    tone: 'Warm, calm, patient, and very encouraging.',
    speed: 'slow',
    image: 'https://picsum.photos/seed/coach/400/400',
    voiceName: 'Kore'
  },
  {
    id: 'trainer',
    name: 'Professional Trainer 💼',
    role: 'Career & Interview Expert',
    description: 'Structured and clear. Focuses on workplace communication and interviews.',
    tone: 'Confident, structured, professional, and clear.',
    speed: 'normal',
    image: 'https://picsum.photos/seed/trainer/400/400',
    voiceName: 'Charon'
  },
  {
    id: 'partner',
    name: 'Casual Partner 😄',
    role: 'Conversational Friend',
    description: 'Relaxed and informal. Like chatting with a close friend over coffee.',
    tone: 'Relaxed, friendly, informal, and energetic.',
    speed: 'normal',
    image: 'https://picsum.photos/seed/partner/400/400',
    voiceName: 'Zephyr'
  },
  {
    id: 'mentor',
    name: 'Advanced Mentor 🎯',
    role: 'Fluency & Rhetoric Coach',
    description: 'Polished and sophisticated. Ideal for mastering advanced vocabulary.',
    tone: 'Fluent, polished, sophisticated, and provides detailed feedback.',
    speed: 'normal',
    image: 'https://picsum.photos/seed/mentor/400/400',
    voiceName: 'Puck'
  }
];

export const PRACTICE_MODES = [
  'General English Speaking',
  'Daily Conversation',
  'Interview Practice',
  'Public Speaking',
  'Vocabulary & Fluency'
];

export const LEVELS = ['Basic', 'Intermediate', 'Advanced'];
