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
  type: 'platform' | 'enemy' | 'collectible' | 'end_goal';
  subtype?: 'snake' | 'hawk' | 'seed' | 'cactus';
  
  // AI / Physics Properties
  velocity?: Vector2;
  initialPosition?: Vector2;
  patrolRange?: { min: number; max: number };
  aiState?: string; // e.g. 'idle', 'patrol', 'hover', 'dive', 'return'
}

export interface Player {
  position: Vector2;
  velocity: Vector2;
  size: Size;
  isGrounded: boolean;
  isDead: boolean;
  facingRight: boolean;
}

// AI Gen Types
export interface LevelConfig {
  name: string;
  description: string;
  platforms: { x: number; y: number; w: number; h: number }[];
  enemies: { x: number; y: number; type: 'snake' | 'hawk' }[];
  collectibles: { x: number; y: number }[];
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