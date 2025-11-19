
export const GRAVITY = 1.2; // Heavier gravity for less floaty feel
export const FRICTION = 0.88;
export const AIR_FRICTION = 0.95; // Less friction in air
export const JUMP_FORCE = -22; // Stronger jump to counter gravity
export const MOVE_SPEED = 0.95; // Increased 25%
export const AIR_CONTROL = 0.5; // Air acceleration multiplier
export const MAX_SPEED = 5.6; // Increased 25%
export const TERMINAL_VELOCITY = 20;
export const DASH_SPEED = 19; // Scaled up 25%
export const DASH_DURATION = 12; // frames
export const DASH_COOLDOWN = 50; // frames

export const PLAYER_WIDTH = 40;
export const PLAYER_HEIGHT = 40;

export const SHIELD_DURATION = 600; // 10 seconds at 60fps

export const CANVAS_WIDTH = 1024;
export const CANVAS_HEIGHT = 600;

export const GENERATION_MODEL = 'gemini-2.5-flash';
export const MAX_LEADERBOARD_ENTRIES = 5;

export const TIME_LIMITS = {
  1: 240, // Easy
  2: 180, // Medium
  3: 120  // Hard
};

// Colors for fallback rendering
export const COLORS = {
  sky: '#BAE6FD', // sky-200
  ground: '#84CC16', // lime-500
  dirt: '#713F12', // yellow-900
  player: '#D97706', // amber-600
  enemy: '#EF4444', // red-500
  seed: '#FCD34D', // amber-300
  goal: '#A855F7', // purple-500
};