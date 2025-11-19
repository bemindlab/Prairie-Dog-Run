import { GoogleGenAI, Type } from "@google/genai";
import { LevelConfig } from "../types";
import { CANVAS_WIDTH, CANVAS_HEIGHT, GENERATION_MODEL, PLAYER_WIDTH } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const levelSchema = {
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
          subtype: { type: Type.STRING, enum: ["normal", "crumble", "bouncy"], nullable: true },
        },
        required: ["x", "y", "w", "h"],
      },
      description: "List of platforms. 'crumble' platforms break after standing on them. 'bouncy' platforms launch the player high up.",
    },
    obstacles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          w: { type: Type.NUMBER },
          h: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: ["crate"] },
        },
        required: ["x", "y", "w", "h", "type"],
      },
      description: "Destructible obstacles like wooden crates.",
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
          type: { type: Type.STRING, enum: ["seed", "shield"] },
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
  required: ["name", "description", "platforms", "obstacles", "enemies", "collectibles", "goal"],
};

export const generateLevel = async (difficulty: number, collectibleDensity: 'low' | 'medium' | 'high' = 'medium'): Promise<LevelConfig> => {
  const difficultyPrompt = difficulty === 1 
    ? "easy, flat terrain with very few small gaps" 
    : difficulty === 2 
    ? "medium, some jumping required, moderate enemies" 
    : "hard, lots of verticality, precision jumps, and enemies";

  const densityDescription = collectibleDensity === 'high'
    ? "abundant seeds and frequent shields"
    : collectibleDensity === 'low'
    ? "scarce seeds placed in difficult spots, very rare shields"
    : "moderate amount of seeds, balanced placement";

  const prompt = `
    Design a 2D platformer level for a Prairie Dog.
    The level dimensions are roughly 3000px wide by ${CANVAS_HEIGHT}px high.
    The player starts at x=50, y=450.
    
    Difficulty: ${difficultyPrompt}.
    Collectible Density: ${densityDescription}.
    
    REQUIREMENTS:
    1. **CRITICAL**: Create a solid 'normal' platform from x=0 to x=300 at y=500 to ensure the player has a safe start.
    2. Create a continuous 'ground' path using platforms near y=500 to y=600 across the level. Gaps are allowed but must be jumpable (max 150px).
    3. Add platforms at various heights (y=200 to y=450) for verticality.
    4. Make some platforms 'crumble' (fragile bridges) or 'bouncy' (pink platforms to reach high areas).
    5. Add 'obstacles' (type: 'crate') that stack or block paths. These are destructible.
    6. Add 'snake' enemies on ground platforms.
    7. Add 'mole' enemies that ambush from the ground on platforms.
    8. Add flying enemies: 'hawk' (high up), 'bat' (mid-air patrol), or 'bug' (erratic swarms).
    9. Place 'collectibles' (seeds) - ${densityDescription}.
    10. Place 'shield' collectibles - ${collectibleDensity === 'high' ? 'occasionally' : 'rarely'}.
    11. Place the 'goal' (burrow) at the far right (approx x=2800) on a safe platform.
    
    Output ONLY valid JSON conforming to the schema.
  `;

  try {
    // 60 Second Timeout Race (Increased from 30s to avoid timeouts)
    const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Gemini request timed out")), 60000)
    );

    const apiCallPromise = ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: levelSchema,
        temperature: 0.7, 
      },
    });

    const response: any = await Promise.race([apiCallPromise, timeoutPromise]);

    const text = response.text;
    if (!text) throw new Error("No content generated");
    
    let levelConfig = JSON.parse(text) as LevelConfig;

    // --- SANITY CHECKS ---
    // Ensure there is a platform under the start position
    const startX = 50;
    const hasSafeStart = levelConfig.platforms.some(p => 
        p.x <= startX && 
        (p.x + p.w) >= startX + PLAYER_WIDTH &&
        p.y >= 400 && p.y <= 600
    );

    if (!hasSafeStart) {
        // Inject safety platform at start
        levelConfig.platforms.unshift({
            x: 0,
            y: 500,
            w: 400,
            h: 50,
            subtype: 'normal'
        });
    }

    // Ensure there is a platform under the goal
    const goal = levelConfig.goal;
    const hasGoalPlatform = levelConfig.platforms.some(p => 
        p.x <= goal.x && 
        (p.x + p.w) >= goal.x &&
        Math.abs(p.y - goal.y) < 150 // Within reasonable vertical distance
    );

    if (!hasGoalPlatform) {
        // Inject safety platform at goal
        levelConfig.platforms.push({
            x: goal.x - 100,
            y: goal.y + 60, // Goal typically sits on top, so platform is below
            w: 250,
            h: 50,
            subtype: 'normal'
        });
    }

    return levelConfig;
  } catch (error) {
    console.error("Failed to generate level (using fallback):", error);
    // Fallback level if API fails or times out
    return {
      name: "The Backup Burrow",
      description: "The AI spirits were silent, so here is a basic field.",
      platforms: [
        { x: 0, y: 500, w: 1000, h: 100, subtype: 'normal' },
        { x: 1200, y: 450, w: 400, h: 100, subtype: 'crumble' },
        { x: 1800, y: 500, w: 1200, h: 100, subtype: 'normal' },
        { x: 400, y: 350, w: 200, h: 20, subtype: 'normal' },
        { x: 600, y: 200, w: 100, h: 20, subtype: 'bouncy' },
        { x: 800, y: 250, w: 200, h: 20, subtype: 'crumble' },
      ],
      obstacles: [
        { x: 600, y: 450, w: 50, h: 50, type: 'crate' },
        { x: 650, y: 450, w: 50, h: 50, type: 'crate' },
        { x: 625, y: 400, w: 50, h: 50, type: 'crate' } // Pyramid stack
      ],
      enemies: [
        { x: 600, y: 460, type: 'snake' },
        { x: 1400, y: 300, type: 'bat' },
        { x: 850, y: 250, type: 'mole' }
      ],
      collectibles: [{ x: 500, y: 300, type: 'seed' }, { x: 1500, y: 350, type: 'shield' }],
      goal: { x: 2800, y: 450 }
    };
  }
};