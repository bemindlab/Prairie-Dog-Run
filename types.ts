import { Type } from "@google/genai";

// Game Entities
export interface Vector2 {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface GameObject {
  id: string;
  position: Vector2;
  size: Size;
  type: 'platform' | 'enemy' | 'collectible' | 'end_goal' | 'obstacle';
  subtype?: 'snake' | 'hawk' | 'bat' | 'bug' | 'mole' | 'seed' | 'shield' | 'crumble' | 'crate' | 'normal' | 'bouncy';
  
  // AI / Physics Properties
  velocity?: Vector2;
  initialPosition?: Vector2;
  patrolRange?: { min: number; max: number };
  aiState?: string; // e.g. 'idle', 'patrol', 'hover', 'dive', 'return', 'circle', 'hidden', 'active'
  timer?: number; // General purpose timer for AI cycles
  variant?: 'default' | 'alt'; // Behavior variant (e.g. Jumper snake vs Charger snake)
  
  // Dynamic Elements
  isBroken?: boolean;
  health?: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  damage: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface Player {
  position: Vector2;
  velocity: Vector2;
  size: Size;
  isGrounded: boolean;
  isDead: boolean;
  facingRight: boolean;
  canDoubleJump: boolean;
  isDashing: boolean;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  date: string;
}

// AI Gen Types
export interface LevelConfig {
  name: string;
  description: string;
  platforms: { x: number; y: number; w: number; h: number; subtype?: 'crumble' | 'normal' | 'bouncy' }[];
  obstacles: { x: number; y: number; w: number; h: number; type: 'crate' }[];
  enemies: { x: number; y: number; type: 'snake' | 'hawk' | 'bat' | 'bug' | 'mole' }[];
  collectibles: { x: number; y: number; type?: 'seed' | 'shield' }[];
  goal: { x: number; y: number };
}

export enum GameStatus {
  MENU = 'MENU',
  LOADING_LEVEL = 'LOADING_LEVEL',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}