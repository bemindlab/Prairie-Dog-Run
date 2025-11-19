import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LevelConfig } from "../types";
import { CANVAS_WIDTH, CANVAS_HEIGHT, GENERATION_MODEL } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const levelSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "A creative name for the level" },
    description: { type: Type.STRING, description: "A short, funny description of the prairie dog's mission" },
    platforms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          w: { type: Type.NUMBER },
          h: { type: Type.NUMBER },
        },
        required: ["x", "y", "w", "h"],
      },
      description: "List of static platforms. Ground level is roughly y=500.",
    },
    enemies: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: ["snake", "hawk", "bat", "bug", "mole"] },
        },
        required: ["x", "y", "type"],
      },
    },
    collectibles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
        },
        required: ["x", "y"],
      },
    },
    goal: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER },
        y: { type: Type.NUMBER },
      },
      required: ["x", "y"],
    },
  },
  required: ["name", "description", "platforms", "enemies", "collectibles", "goal"],
};

export const generateLevel = async (difficulty: number): Promise<LevelConfig> => {
  const difficultyPrompt = difficulty === 1 
    ? "easy, flat terrain with few gaps" 
    : difficulty === 2 
    ? "medium, some jumping required, moderate enemies" 
    : "hard, lots of verticality, precision jumps, and enemies";

  const prompt = `
    Design a 2D platformer level for a Prairie Dog.
    The level dimensions are roughly 3000px wide by ${CANVAS_HEIGHT}px high.
    The player starts at x=50, y=450.
    
    Difficulty: ${difficultyPrompt}.
    
    REQUIREMENTS:
    1. Create a 'ground' using platforms near y=500 to y=600. Gaps are allowed.
    2. Add platforms at various heights (y=200 to y=450) for jumping.
    3. Add 'snake' enemies on ground platforms.
    4. Add 'mole' enemies that ambush from the ground on platforms.
    5. Add flying enemies: 'hawk' (high up), 'bat' (mid-air patrol), or 'bug' (erratic swarms).
    6. Place 'collectibles' (seeds) in reachable but slightly challenging spots.
    7. Place the 'goal' (burrow) at the far right (approx x=2800).
    
    Output ONLY valid JSON conforming to the schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: levelSchema,
        temperature: 0.7, // slightly creative
      },
    });

    const text = response.text;
    if (!text) throw new Error("No content generated");
    
    return JSON.parse(text) as LevelConfig;
  } catch (error) {
    console.error("Failed to generate level:", error);
    // Fallback level if API fails
    return {
      name: "The Backup Burrow",
      description: "The AI spirits were silent, so here is a basic field.",
      platforms: [
        { x: 0, y: 500, w: 1000, h: 100 },
        { x: 1200, y: 450, w: 400, h: 100 },
        { x: 1800, y: 500, w: 1200, h: 100 },
        { x: 400, y: 350, w: 200, h: 20 },
        { x: 800, y: 250, w: 200, h: 20 },
      ],
      enemies: [
        { x: 600, y: 460, type: 'snake' },
        { x: 1400, y: 300, type: 'bat' },
        { x: 850, y: 250, type: 'mole' }
      ],
      collectibles: [{ x: 500, y: 300 }],
      goal: { x: 2800, y: 450 }
    };
  }
};