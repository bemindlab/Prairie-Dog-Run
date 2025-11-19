import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameStatus, LevelConfig, Player, GameObject, Vector2 } from '../types';
import { 
  CANVAS_WIDTH, CANVAS_HEIGHT, GRAVITY, FRICTION, JUMP_FORCE, 
  MOVE_SPEED, MAX_SPEED, TERMINAL_VELOCITY, PLAYER_WIDTH, PLAYER_HEIGHT, COLORS 
} from '../constants';

interface GameCanvasProps {
  level: LevelConfig;
  status: GameStatus;
  onGameOver: (win: boolean) => void;
  onCollect: () => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ level, status, onGameOver, onCollect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spriteSheet, setSpriteSheet] = useState<HTMLCanvasElement | null>(null);
  
  // Mutable game state (refs for performance in game loop)
  const playerRef = useRef<Player>({
    position: { x: 50, y: 400 },
    velocity: { x: 0, y: 0 },
    size: { width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
    isGrounded: false,
    isDead: false,
    facingRight: true,
  });

  // Animation State
  const animRef = useRef({
    state: 'idle' as 'idle' | 'run' | 'jump',
    frame: 0,
    timer: 0
  });

  const cameraRef = useRef<Vector2>({ x: 0, y: 0 });
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const gameObjectsRef = useRef<GameObject[]>([]);
  const requestRef = useRef<number>();
  const frameCountRef = useRef(0);

  // Initialize Sprite Sheet
  useEffect(() => {
    const sheet = generatePrairieDogSpriteSheet();
    setSpriteSheet(sheet);
  }, []);

  // Convert level config to GameObjects on mount/change
  useEffect(() => {
    if (!level) return;

    // Reset player
    playerRef.current = {
      position: { x: 50, y: 400 },
      velocity: { x: 0, y: 0 },
      size: { width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
      isGrounded: false,
      isDead: false,
      facingRight: true,
    };

    const newObjects: GameObject[] = [];

    // Platforms
    level.platforms.forEach((p, i) => {
      newObjects.push({
        id: `plat-${i}`,
        type: 'platform',
        position: { x: p.x, y: p.y },
        size: { width: p.w, height: p.h }
      });
    });

    // Enemies
    level.enemies.forEach((e, i) => {
      const enemy: GameObject = {
        id: `enemy-${i}`,
        type: 'enemy',
        subtype: e.type as 'snake' | 'hawk',
        position: { x: e.x, y: e.y },
        size: { width: 40, height: 40 },
        velocity: { x: 0, y: 0 },
        initialPosition: { x: e.x, y: e.y },
        aiState: 'idle',
      };

      if (e.type === 'snake') {
        // Snap snake to the platform below it and set patrol bounds
        // Check for platform directly under (or close to) the spawn point
        const platform = level.platforms.find(p => 
             e.x + 20 > p.x && e.x + 20 < p.x + p.w && // Center x is over platform
             e.y + 40 >= p.y - 30 && e.y + 40 <= p.y + 30 // Bottom is near top
        );

        if (platform) {
             // Snap y to sit on platform
             enemy.position.y = platform.y - 40;
             enemy.patrolRange = { min: platform.x, max: platform.x + platform.w - 40 };
             enemy.velocity = { x: 1.5, y: 0 }; // Start moving right
             enemy.aiState = 'patrol';
        } else {
             // Fallback if floating
             enemy.patrolRange = { min: e.x - 100, max: e.x + 100 };
             enemy.velocity = { x: 1.5, y: 0 };
             enemy.aiState = 'patrol';
        }
      } else if (e.type === 'hawk') {
          enemy.aiState = 'hover';
          enemy.velocity = { x: 0, y: 0 };
      }

      newObjects.push(enemy);
    });

    // Collectibles
    level.collectibles.forEach((c, i) => {
      newObjects.push({
        id: `seed-${i}`,
        type: 'collectible',
        subtype: 'seed',
        position: { x: c.x, y: c.y },
        size: { width: 25, height: 25 }
      });
    });

    // Goal
    newObjects.push({
      id: 'goal',
      type: 'end_goal',
      position: { x: level.goal.x, y: level.goal.y },
      size: { width: 60, height: 80 }
    });

    gameObjectsRef.current = newObjects;
    cameraRef.current = { x: 0, y: 0 };

  }, [level]);

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keysRef.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Main Game Loop
  const update = useCallback(() => {
    if (status !== GameStatus.PLAYING) return;

    const player = playerRef.current;
    const objects = gameObjectsRef.current;

    // --- Physics ---
    
    // Gravity
    player.velocity.y += GRAVITY;

    // Horizontal Move
    if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) {
      player.velocity.x += MOVE_SPEED;
      player.facingRight = true;
    }
    if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) {
      player.velocity.x -= MOVE_SPEED;
      player.facingRight = false;
    }

    // Friction
    player.velocity.x *= FRICTION;

    // Cap Velocity
    player.velocity.x = Math.max(Math.min(player.velocity.x, MAX_SPEED), -MAX_SPEED);
    player.velocity.y = Math.min(player.velocity.y, TERMINAL_VELOCITY);

    // Jump
    if ((keysRef.current['Space'] || keysRef.current['ArrowUp'] || keysRef.current['KeyW']) && player.isGrounded) {
      player.velocity.y = JUMP_FORCE;
      player.isGrounded = false;
    }

    // Apply X movement
    player.position.x += player.velocity.x;
    checkCollisions(player, objects, 'x');

    // Apply Y movement
    player.position.y += player.velocity.y;
    player.isGrounded = false; // Assume falling until collision proves otherwise
    checkCollisions(player, objects, 'y');

    // Death floor
    if (player.position.y > CANVAS_HEIGHT + 200) {
        onGameOver(false);
        return; // Stop loop
    }

    // --- Animation Logic ---
    const anim = animRef.current;
    let newState: 'idle' | 'run' | 'jump' = 'idle';

    if (!player.isGrounded) {
      newState = 'jump';
    } else if (Math.abs(player.velocity.x) > 0.5) {
      newState = 'run';
    } else {
      newState = 'idle';
    }

    if (anim.state !== newState) {
      anim.state = newState;
      anim.frame = 0;
      anim.timer = 0;
    } else {
      anim.timer++;
      const speed = newState === 'run' ? 5 : 15; // Run is faster
      if (anim.timer > speed) {
        anim.timer = 0;
        anim.frame++;
        // Wrap frames
        // Idle: 2 frames, Run: 4 frames, Jump: 1 frame
        const maxFrames = newState === 'idle' ? 2 : newState === 'run' ? 4 : 1;
        if (anim.frame >= maxFrames) anim.frame = 0;
      }
    }

    // --- Enemy AI Logic ---
    objects.forEach(obj => {
      if (obj.type === 'enemy') {
        
        // --- SNAKE AI (Patrol) ---
        if (obj.subtype === 'snake' && obj.aiState === 'patrol' && obj.velocity && obj.patrolRange) {
             obj.position.x += obj.velocity.x;

             // Bounce off patrol limits
             if (obj.position.x <= obj.patrolRange.min) {
                 obj.position.x = obj.patrolRange.min;
                 obj.velocity.x = Math.abs(obj.velocity.x); // Move right
             } else if (obj.position.x >= obj.patrolRange.max) {
                 obj.position.x = obj.patrolRange.max;
                 obj.velocity.x = -Math.abs(obj.velocity.x); // Move left
             }
        }

        // --- HAWK AI (Hover -> Dive -> Return) ---
        if (obj.subtype === 'hawk' && obj.initialPosition) {
            
            const distX = player.position.x - obj.position.x;
            const distY = player.position.y - obj.position.y;

            if (obj.aiState === 'hover') {
                // Gentle Bobbing
                obj.position.y = obj.initialPosition.y + Math.sin(frameCountRef.current * 0.05) * 10;
                
                // Detect Player for Dive
                // Logic: Player is close horizontally (< 300px) and below the hawk (> 50px)
                if (Math.abs(distX) < 300 && distY > 50 && distY < 400) {
                    obj.aiState = 'dive';
                    
                    // Calculate dive vector towards player's current pos
                    const angle = Math.atan2(distY, distX);
                    const diveSpeed = 6;
                    obj.velocity = {
                        x: Math.cos(angle) * diveSpeed,
                        y: Math.sin(angle) * diveSpeed
                    };
                }

            } else if (obj.aiState === 'dive') {
                if (obj.velocity) {
                    obj.position.x += obj.velocity.x;
                    obj.position.y += obj.velocity.y;
                }

                // Stop Dive conditions:
                // 1. Hit the ground (approx check)
                // 2. Travelled too far down
                if (obj.position.y > obj.initialPosition.y + 400 || obj.position.y > CANVAS_HEIGHT - 50) {
                    obj.aiState = 'return';
                }

            } else if (obj.aiState === 'return') {
                // Return to start position
                const dx = obj.initialPosition.x - obj.position.x;
                const dy = obj.initialPosition.y - obj.position.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist < 5) {
                    // Arrived
                    obj.position.x = obj.initialPosition.x;
                    obj.position.y = obj.initialPosition.y;
                    obj.velocity = { x: 0, y: 0 };
                    obj.aiState = 'hover';
                } else {
                    // Normalize and move
                    const angle = Math.atan2(dy, dx);
                    const returnSpeed = 4;
                    obj.position.x += Math.cos(angle) * returnSpeed;
                    obj.position.y += Math.sin(angle) * returnSpeed;
                }
            }
        }
      }
    });

    // --- Camera Follow ---
    // Center player with some lerp
    const targetCamX = player.position.x - CANVAS_WIDTH / 2 + player.size.width / 2;
    const maxCamX = 3000 - CANVAS_WIDTH; // Rough level width max
    cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.1;
    // Clamp camera
    cameraRef.current.x = Math.max(0, Math.min(cameraRef.current.x, maxCamX));
    
    frameCountRef.current++;
    draw();
    requestRef.current = requestAnimationFrame(update);
  }, [status, onGameOver, onCollect, spriteSheet]);

  const checkCollisions = (p: Player, objects: GameObject[], axis: 'x' | 'y') => {
    const pLeft = p.position.x;
    const pRight = p.position.x + p.size.width;
    const pTop = p.position.y;
    const pBottom = p.position.y + p.size.height;

    // Filter active objects
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      const oLeft = obj.position.x;
      const oRight = obj.position.x + obj.size.width;
      const oTop = obj.position.y;
      const oBottom = obj.position.y + obj.size.height;

      // AABB Collision
      if (pRight > oLeft && pLeft < oRight && pBottom > oTop && pTop < oBottom) {
        if (obj.type === 'platform') {
          if (axis === 'x') {
            if (p.velocity.x > 0) p.position.x = oLeft - p.size.width;
            else if (p.velocity.x < 0) p.position.x = oRight;
            p.velocity.x = 0;
          } else {
            if (p.velocity.y > 0) { // Falling onto platform
              p.position.y = oTop - p.size.height;
              p.isGrounded = true;
              p.velocity.y = 0;
            } else if (p.velocity.y < 0) { // Hitting head
              p.position.y = oBottom;
              p.velocity.y = 0;
            }
          }
        } else if (obj.type === 'enemy') {
          onGameOver(false);
        } else if (obj.type === 'collectible') {
          // Remove collectible
          objects.splice(i, 1);
          onCollect();
        } else if (obj.type === 'end_goal') {
          onGameOver(true);
        }
      }
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cam = cameraRef.current;

    // Clear
    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Save for camera transform
    ctx.save();
    ctx.translate(-cam.x, 0);

    // Draw Objects
    gameObjectsRef.current.forEach(obj => {
      if (obj.type === 'platform') {
        // Grass top
        ctx.fillStyle = COLORS.ground;
        ctx.fillRect(obj.position.x, obj.position.y, obj.size.width, 20);
        // Dirt body
        ctx.fillStyle = COLORS.dirt;
        ctx.fillRect(obj.position.x, obj.position.y + 20, obj.size.width, obj.size.height - 20);
      } else if (obj.type === 'enemy') {
        ctx.font = "30px Arial";
        if (obj.subtype === 'snake') {
             // Flip snake based on velocity
             ctx.save();
             const centerX = obj.position.x + 20;
             const centerY = obj.position.y + 20;
             ctx.translate(centerX, centerY);
             
             // Standard snake emoji 🐍 faces left.
             // If moving right (vel > 0), scale(-1, 1) to face right.
             if (obj.velocity && obj.velocity.x > 0) {
                 ctx.scale(-1, 1);
             }
             ctx.fillText('🐍', -15, 10);
             ctx.restore();
        }
        else if (obj.subtype === 'hawk') {
            // Hawk faces player? Or just direction of movement
            ctx.save();
            const centerX = obj.position.x + 20;
            const centerY = obj.position.y + 20;
            ctx.translate(centerX, centerY);
            
            // Hawk 🦅 faces Left. 
            // If velocity.x > 0 (moving right), flip.
            if (obj.velocity && obj.velocity.x > 0) ctx.scale(-1, 1);

            ctx.fillText('🦅', -15, 10);
            ctx.restore();
        }
        else {
            ctx.fillStyle = COLORS.enemy;
            ctx.fillRect(obj.position.x, obj.position.y, 40, 40);
        }
      } else if (obj.type === 'collectible') {
        ctx.font = "20px Arial";
        ctx.fillText('🌱', obj.position.x, obj.position.y + 20);
      } else if (obj.type === 'end_goal') {
         ctx.font = "60px Arial";
         ctx.fillText('🕳️', obj.position.x, obj.position.y + 60);
         ctx.font = "16px Arial";
         ctx.fillStyle = "white";
         ctx.fillText("HOME", obj.position.x + 10, obj.position.y);
      }
    });

    // Draw Player with Sprite Sheet
    const p = playerRef.current;
    const anim = animRef.current;

    ctx.save();
    
    // Handle flipping
    if (!p.facingRight) {
        ctx.translate(p.position.x + p.size.width, p.position.y);
        ctx.scale(-1, 1);
        // Draw at 0,0
        drawSprite(ctx, spriteSheet, anim.state, anim.frame, 0, 0, p.size.width, p.size.height);
    } else {
        ctx.translate(p.position.x, p.position.y);
        drawSprite(ctx, spriteSheet, anim.state, anim.frame, 0, 0, p.size.width, p.size.height);
    }
    
    ctx.restore();

    ctx.restore();
  };

  useEffect(() => {
    if (status === GameStatus.PLAYING) {
        requestRef.current = requestAnimationFrame(update);
    } else {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        // Initial draw for paused state
        draw();
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [status, update, spriteSheet]);

  // Mobile Controls Hooks
  const handleTouchStart = (key: string) => {
    keysRef.current[key] = true;
  };
  const handleTouchEnd = (key: string) => {
    keysRef.current[key] = false;
  };

  return (
    <div className="relative w-full h-full flex justify-center items-center bg-gray-800">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="bg-sky-200 rounded-lg shadow-2xl max-w-full max-h-full object-contain"
      />
      
      {/* Mobile Controls Overlay */}
      <div className="absolute bottom-4 left-4 flex gap-4 md:hidden no-select">
         <button 
            className="w-16 h-16 bg-white/30 rounded-full text-3xl flex items-center justify-center backdrop-blur-sm active:bg-white/60"
            onTouchStart={(e) => { e.preventDefault(); handleTouchStart('ArrowLeft'); }}
            onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd('ArrowLeft'); }}
         >←</button>
         <button 
            className="w-16 h-16 bg-white/30 rounded-full text-3xl flex items-center justify-center backdrop-blur-sm active:bg-white/60"
            onTouchStart={(e) => { e.preventDefault(); handleTouchStart('ArrowRight'); }}
            onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd('ArrowRight'); }}
         >→</button>
      </div>
      <div className="absolute bottom-4 right-4 md:hidden no-select">
        <button 
            className="w-20 h-20 bg-white/30 rounded-full text-xl font-bold flex items-center justify-center backdrop-blur-sm active:bg-white/60"
            onTouchStart={(e) => { e.preventDefault(); handleTouchStart('Space'); }}
            onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd('Space'); }}
         >JUMP</button>
      </div>
    </div>
  );
};

const SPRITE_SIZE = 64; // Width/Height of a single tile in the sprite sheet

// Helper to draw a frame from the sprite sheet
const drawSprite = (
    ctx: CanvasRenderingContext2D,
    sheet: HTMLCanvasElement | null,
    state: 'idle' | 'run' | 'jump',
    frame: number,
    x: number,
    y: number,
    w: number,
    h: number
) => {
    if (!sheet) return;

    // Map State to Row Index
    // Row 0: Idle
    // Row 1: Run
    // Row 2: Jump
    let row = 0;
    if (state === 'run') row = 1;
    if (state === 'jump') row = 2;

    const sx = frame * SPRITE_SIZE;
    const sy = row * SPRITE_SIZE;

    ctx.drawImage(sheet, sx, sy, SPRITE_SIZE, SPRITE_SIZE, x, y, w, h);
};

// Generates a pixel-art style sprite sheet programmatically
const generatePrairieDogSpriteSheet = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE * 4; // Max 4 frames
  canvas.height = SPRITE_SIZE * 3; // 3 Rows
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cMain = '#D97706'; // amber-600
  const cLight = '#FDE68A'; // amber-200
  const cDark = '#92400E'; // brown
  
  // Helper to fill rect
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  };

  // --- ROW 0: IDLE (2 Frames) ---
  for(let f=0; f<2; f++) {
    const ox = f * SPRITE_SIZE;
    const oy = 0;
    
    // Feet
    r(ox+22, oy+54, 8, 6, cDark);
    r(ox+34, oy+54, 8, 6, cDark);

    // Body
    r(ox+20, oy+24, 24, 32, cMain);
    r(ox+24, oy+28, 16, 26, cLight); // Belly

    // Head
    r(ox+18, oy+10, 28, 24, cMain);
    // Ears
    r(ox+18, oy+8, 6, 6, cDark);
    r(ox+40, oy+8, 6, 6, cDark);
    
    // Face
    if (f === 0) {
        r(ox+24, oy+16, 4, 4, 'black'); // Eye L
        r(ox+36, oy+16, 4, 4, 'black'); // Eye R
    } else {
        // Blink
        r(ox+24, oy+18, 4, 2, 'black');
        r(ox+36, oy+18, 4, 2, 'black');
    }
    r(ox+28, oy+22, 8, 6, cLight); // Snout
    r(ox+30, oy+22, 4, 3, 'black'); // Nose

    // Arms (tucked)
    r(ox+22, oy+34, 4, 8, cDark);
    r(ox+38, oy+34, 4, 8, cDark);
  }

  // --- ROW 1: RUN (4 Frames) ---
  for(let f=0; f<4; f++) {
    const ox = f * SPRITE_SIZE;
    const oy = SPRITE_SIZE;
    
    // Leg cycle
    const legOff = Math.sin(f * Math.PI / 2) * 10;
    
    // Back Leg
    r(ox+20+legOff, oy+50, 8, 12, cDark);
    // Front Leg
    r(ox+36-legOff, oy+50, 8, 12, cDark);
    
    // Body (Forward Lean)
    r(ox+18, oy+28, 32, 24, cMain);
    r(ox+22, oy+32, 24, 16, cLight);

    // Head (Right side)
    r(ox+40, oy+14, 22, 22, cMain);
    r(ox+44, oy+10, 6, 6, cDark); // Ear
    r(ox+52, oy+18, 4, 4, 'black'); // Eye
    r(ox+56, oy+24, 6, 6, cLight); // Snout
    r(ox+60, oy+24, 2, 2, 'black'); // Nose

    // Tail
    r(ox+10, oy+40, 10, 6, cDark);
  }

  // --- ROW 2: JUMP (1 Frame) ---
  {
    const ox = 0;
    const oy = SPRITE_SIZE * 2;
    
    // Legs (Splayed)
    r(ox+16, oy+50, 8, 10, cDark);
    r(ox+40, oy+45, 8, 10, cDark);
    
    // Body (Stretched)
    r(ox+20, oy+20, 24, 34, cMain);
    r(ox+24, oy+24, 16, 26, cLight);
    
    // Head
    r(ox+22, oy+8, 26, 22, cMain);
    r(ox+22, oy+4, 6, 6, cDark);
    r(ox+40, oy+4, 6, 6, cDark);
    r(ox+38, oy+14, 4, 4, 'black'); // Eye Side/Up

    // Arms (Up)
    r(ox+44, oy+24, 8, 6, cDark);
    
    // Tail
    r(ox+18, oy+48, 6, 8, cDark);
  }

  return canvas;
};

export default React.memo(GameCanvas);