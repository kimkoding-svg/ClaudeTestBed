/**
 * Social Simulator - Shared type definitions
 */

// ─── Character ───────────────────────────────────────────

export type CharacterState = 'idle' | 'walking' | 'talking' | 'sitting' | 'eating' | 'drinking' | 'bathroom' | 'working' | 'busy';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface CharacterNeeds {
  bladder: number;   // 0-100, rises over time
  hunger: number;    // 0-100, rises over time
  thirst: number;    // 0-100, rises faster than hunger
}

export interface CharacterTraits {
  friendliness: number;  // 0-100
  humor: number;         // 0-100
  seriousness: number;   // 0-100
  empathy: number;       // 0-100
  assertiveness: number; // 0-100
}

export interface SpriteColors {
  primary: string;    // shirt/outfit
  secondary: string;  // accent color
  skin: string;
  hair: string;
}

export interface ScheduleEntry {
  hour: number;       // 8-18
  minute: number;     // 0, 15, 30, 45
  activity: string;   // 'arrive' | 'work' | 'coffee' | 'lunch' | 'meeting' | 'break' | 'leave'
  location: string;   // zone id: 'desk_1', 'breakroom', 'kitchen', etc.
}

export interface SocialCharacter {
  id: string;
  name: string;
  appearance: {
    spriteColors: SpriteColors;
    gender: 'M' | 'F';
  };
  baseTraits: CharacterTraits;
  mood: number;           // 0-100
  needs: CharacterNeeds;
  schedule: ScheduleEntry[];
  position: { x: number; y: number };
  state: CharacterState;
  targetPosition: { x: number; y: number } | null;
  currentEncounter: string | null;
  direction: Direction;
  animFrame: number;
  isTemp: boolean;
  currentTask: { id: string; name: string; icon: string; progress: number; durationTicks: number; startTick: number } | null;
}

// ─── Relationship ────────────────────────────────────────

export interface RelationshipProfile {
  fromId: string;
  toId: string;
  trust: number;       // 0-100
  liking: number;      // 0-100
  respect: number;     // 0-100
  familiarity: number; // 0-100
  interactionCount: number;
  recentSentiments: number[];  // last 10, each -1 to +1
  memoryNotes: string[];       // AI-generated, max 10
  lastInteraction: number | null;
}

// ─── Encounter & Dialogue ────────────────────────────────

export interface DialogueLine {
  speakerId: string;
  speakerName: string;
  text: string;
  timestamp: number;
}

export interface Encounter {
  id: string;
  participants: [string, string];
  tick: number;
  location: string;
  dialogue: DialogueLine[];
  sentiment: number;    // -1 to +1
  memoryNote: string;
  status: 'active' | 'completed';
}

// ─── Office Map ──────────────────────────────────────────

export enum TileType {
  FLOOR = 0,
  WALL = 1,
  DESK = 2,
  CHAIR = 3,
  TABLE = 4,
  COUNTER = 5,
  PLANT = 6,
  DOOR = 7,
  COFFEE_MACHINE = 8,
  FRIDGE = 9,
  COUCH = 10,
  WHITEBOARD = 11,
  TOILET = 12,
  SINK = 13,
  WATER_COOLER = 14,
}

export interface TileZone {
  id: string;
  name: string;
  type: 'desk' | 'breakroom' | 'kitchen' | 'meeting' | 'corridor' | 'entrance' | 'bathroom' | 'watercooler';
  bounds: { x: number; y: number; width: number; height: number };
  capacity: number;
  interactionSpots: { x: number; y: number }[];
}

// ─── Simulation State ────────────────────────────────────

export interface SimTime {
  tick: number;
  hour: number;
  minute: number;
  day: number;
}

export interface SocialSimState {
  time: SimTime;
  characters: SocialCharacter[];
  activeEncounters: Encounter[];
  recentDialogue: DialogueLine[];
  status: 'initialized' | 'running' | 'paused' | 'stopped';
  activeEvents: SimEvent[];
}

// ─── Events ──────────────────────────────────────────────

export interface SimEvent {
  id: string;
  type: string;
  name: string;
  description: string;
  startTick: number;
  duration: number;      // ticks
  affectedZones?: string[];
  affectedCharacters?: string[];
}

// ─── Work Tasks ─────────────────────────────────────────

export interface WorkTaskType {
  typeId: string;
  name: string;
  icon: string;
  description: string;
  durationTicks: number;
  zoneType: string | null;
  requiredZone: string | null;
  moodEffect: number;
  completionMoodBoost: number;
  minParticipants: number;
  maxParticipants: number;
  priority: number;
  autoAssignWeight: number;
}

export interface WorkTaskInstance {
  id: string;
  typeId: string;
  name: string;
  icon: string;
  assignedTo: string[];
  zone: string;
  startTick: number;
  durationTicks: number;
  progress: number;       // 0.0 to 1.0
  status: 'queued' | 'in_progress' | 'completed' | 'interrupted';
  interruptedBy: string | null;
}

// ─── SSE Event Types ─────────────────────────────────────

export type SocialSSEEvent =
  | { type: 'social_tick'; state: SocialSimState }
  | { type: 'social_encounter_start'; encounter: Encounter }
  | { type: 'social_dialogue'; encounterId: string; lines: DialogueLine[] }
  | { type: 'social_encounter_end'; encounterId: string; sentiment: number; memoryNote: string }
  | { type: 'social_relationship_update'; fromId: string; toId: string; profile: RelationshipProfile }
  | { type: 'social_mood_change'; characterId: string; oldMood: number; newMood: number }
  | { type: 'social_event'; event: SimEvent }
  | { type: 'social_status'; status: string }
  | { type: 'social_cost_update'; totalCost: number; budgetRemaining: number };

// ─── Config ──────────────────────────────────────────────

export interface SocialSimConfig {
  characterCount: number;   // 5-20
  tickSpeed: number;        // ms between ticks (500-5000)
  model: string;            // 'haiku' | 'sonnet'
  budgetCap: number;        // $ limit
}
