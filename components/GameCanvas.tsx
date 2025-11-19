
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameStatus, LevelConfig, Player, GameObject, Vector2 } from '../types';
import { 
  CANVAS_WIDTH, CANVAS_HEIGHT, GRAVITY, FRICTION, JUMP_FORCE, 
  MOVE_SPEED, MAX_SPEED, TERMINAL_VELOCITY, PLAYER_WIDTH, PLAYER_HEIGHT, COLORS 
} from '../constants';
import { playJump, playCollect, playDeath, playWin, startMusic, stopMusic } from '../services/audioService';

interface GameCanvasProps {
  level: LevelConfig;
  status: GameStatus;
  onGameOver: (win: boolean) => void;
  onCollect: () => void;
}

const COYOTE_FRAMES = 8; // Grace period frames for jumping after leaving a platform
const MAX_LIVES = 3;
const INVINCIBILITY_DURATION = 120; // Frames (approx 2 seconds)

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

  // Gameplay State
  const coyoteFramesRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const lastSafePosRef = useRef<Vector2>({ x: 50, y: 400 });
  const invincibilityRef = useRef(0);
  const isGameOverRef = useRef(false);
  const gameOverTimerRef = useRef(0);

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

  // Music Control
  useEffect(() => {
    if (status === GameStatus.PLAYING) {
        startMusic();
    } else {
        stopMusic();
    }
    return () => stopMusic();
  }, [status]);

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
    coyoteFramesRef.current = 0;
    livesRef.current = MAX_LIVES;
    lastSafePosRef.current = { x: 50, y: 400 };
    invincibilityRef.current = 0;
    isGameOverRef.current = false;
    gameOverTimerRef.current = 0;

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
        subtype: e.type as 'snake' | 'hawk' | 'bat' | 'bug' | 'mole',
        position: { x: e.x, y: e.y },
        size: { width: 40, height: 40 },
        velocity: { x: 0, y: 0 },
        initialPosition: { x: e.x, y: e.y },
        aiState: 'idle',
        timer: 0,
      };

      if (e.type === 'snake') {
        // Snap snake to the platform below it and set patrol bounds
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
      } else if (e.type === 'bat') {
          // Bats patrol horizontally in air with sine wave bob
          enemy.aiState = 'patrol';
          enemy.velocity = { x: 2, y: 0 };
          enemy.patrolRange = { min: e.x - 200, max: e.x + 200 };
      } else if (e.type === 'bug') {
          // Bugs circle around their spawn
          enemy.aiState = 'circle';
          enemy.velocity = { x: 0, y: 0 };
          enemy.size = { width: 25, height: 25 }; // Smaller hitbox
      } else if (e.type === 'mole') {
          // Moles sit in the ground and pop up
          const platform = level.platforms.find(p => 
            e.x + 20 > p.x && e.x + 20 < p.x + p.w && 
            e.y + 40 >= p.y - 30 && e.y + 40 <= p.y + 30
          );

          if (platform) {
            enemy.position.y = platform.y - 30; // Sits slightly lower visually
          }
          enemy.aiState = 'active';
          enemy.timer = Math.random() * 200; // Random offset so they don't all pop at once
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

  // Helper for taking damage / respawning
  const handlePlayerDamage = () => {
      if (invincibilityRef.current > 0 || isGameOverRef.current) return; // Ignore if invincible or already dying

      playDeath();
      livesRef.current -= 1;

      if (livesRef.current <= 0) {
          isGameOverRef.current = true;
          playerRef.current.velocity = { x: 0, y: -12 }; // Death Hop
          // onGameOver(false) called in update loop after animation
      } else {
          // Respawn logic
          invincibilityRef.current = INVINCIBILITY_DURATION;
          
          // Reset to safe pos
          const p = playerRef.current;
          p.position.x = lastSafePosRef.current.x;
          p.position.y = lastSafePosRef.current.y - 50; // Drop in slightly above
          p.velocity = { x: 0, y: 0 };
          p.isGrounded = false;
      }
  };

  // Main Game Loop
  const update = useCallback(() => {
    if (status !== GameStatus.PLAYING) return;

    const player = playerRef.current;
    
    // --- Game Over Animation ---
    if (isGameOverRef.current) {
        gameOverTimerRef.current++;
        
        // Simple Physics: Gravity only, no collisions (fall through floor)
        player.velocity.y += GRAVITY;
        player.position.y += player.velocity.y;
        
        // Wait for animation to finish
        if (gameOverTimerRef.current > 100) {
            onGameOver(false);
            return;
        }
        
        draw();
        requestRef.current = requestAnimationFrame(update);
        return;
    }

    const objects = gameObjectsRef.current;

    // --- Physics ---

    // Decrement Timers
    if (coyoteFramesRef.current > 0) coyoteFramesRef.current--;
    if (invincibilityRef.current > 0) invincibilityRef.current--;
    
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

    // Jump (with Coyote Time)
    const canJump = player.isGrounded || coyoteFramesRef.current > 0;
    if ((keysRef.current['Space'] || keysRef.current['ArrowUp'] || keysRef.current['KeyW']) && canJump) {
      player.velocity.y = JUMP_FORCE;
      player.isGrounded = false;
      coyoteFramesRef.current = 0; // Consume coyote time immediately
      playJump();
    }

    // Apply X movement
    player.position.x += player.velocity.x;
    checkCollisions(player, objects, 'x');

    // Apply Y movement
    player.position.y += player.velocity.y;
    player.isGrounded = false; // Assume falling until collision proves otherwise
    checkCollisions(player, objects, 'y');

    // If grounded after collisions, reset Coyote Time and update Safe Position
    if (player.isGrounded) {
      coyoteFramesRef.current = COYOTE_FRAMES;
      
      // Update safe position if standing on solid ground
      lastSafePosRef.current = { x: player.position.x, y: player.position.y };
    }

    // Death floor
    if (player.position.y > CANVAS_HEIGHT + 200) {
        handlePlayerDamage();
        if (livesRef.current <= 0 && !isGameOverRef.current) return; // Should have triggered game over state
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
    }

    if (newState === 'jump') {
        if (player.velocity.y < 0) {
            anim.frame = 0; 
        } else {
            anim.frame = 1;
        }
    } else {
        anim.timer++;
        const speed = newState === 'run' ? 5 : 15;
        if (anim.timer > speed) {
            anim.timer = 0;
            anim.frame++;
            const maxFrames = newState === 'idle' ? 2 : 4;
            if (anim.frame >= maxFrames) anim.frame = 0;
        }
    }

    // --- Enemy AI Logic ---
    objects.forEach(obj => {
      if (obj.type === 'enemy') {
        
        // --- SNAKE AI (Patrol Ground) ---
        if (obj.subtype === 'snake' && obj.aiState === 'patrol' && obj.velocity && obj.patrolRange) {
             obj.position.x += obj.velocity.x;
             if (obj.position.x <= obj.patrolRange.min) {
                 obj.position.x = obj.patrolRange.min;
                 obj.velocity.x = Math.abs(obj.velocity.x);
             } else if (obj.position.x >= obj.patrolRange.max) {
                 obj.position.x = obj.patrolRange.max;
                 obj.velocity.x = -Math.abs(obj.velocity.x);
             }
        }

        // --- BAT AI (Sine Wave Patrol) ---
        if (obj.subtype === 'bat' && obj.aiState === 'patrol' && obj.velocity && obj.patrolRange && obj.initialPosition) {
            obj.position.x += obj.velocity.x;
            if (obj.position.x <= obj.patrolRange.min) {
                obj.position.x = obj.patrolRange.min;
                obj.velocity.x = Math.abs(obj.velocity.x);
            } else if (obj.position.x >= obj.patrolRange.max) {
                obj.position.x = obj.patrolRange.max;
                obj.velocity.x = -Math.abs(obj.velocity.x);
            }
            const waveSpeed = 0.1;
            const amplitude = 40;
            obj.position.y = obj.initialPosition.y + Math.sin(frameCountRef.current * waveSpeed) * amplitude;
        }

        // --- BUG AI (Circular Swarm) ---
        if (obj.subtype === 'bug' && obj.aiState === 'circle' && obj.initialPosition) {
            const speed = 0.15;
            const radius = 50;
            const angle = frameCountRef.current * speed;
            obj.position.x = obj.initialPosition.x + Math.cos(angle) * radius;
            obj.position.y = obj.initialPosition.y + Math.sin(angle) * radius;
        }

        // --- MOLE AI (Pop Up/Down) ---
        if (obj.subtype === 'mole') {
            obj.timer = (obj.timer || 0) + 1;
            const cycleLength = 240;
            const t = obj.timer % cycleLength;
            if (t < 100) {
                obj.aiState = 'hidden';
            } else if (t < 130) {
                obj.aiState = 'popping';
            } else if (t < 210) {
                obj.aiState = 'active';
            } else {
                obj.aiState = 'popping';
            }
        }

        // --- HAWK AI (Hover -> Dive -> Return) ---
        if (obj.subtype === 'hawk' && obj.initialPosition) {
            const distX = player.position.x - obj.position.x;
            const distY = player.position.y - obj.position.y;

            if (obj.aiState === 'hover') {
                obj.position.y = obj.initialPosition.y + Math.sin(frameCountRef.current * 0.05) * 10;
                if (Math.abs(distX) < 300 && distY > 50 && distY < 400) {
                    obj.aiState = 'dive';
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
                if (obj.position.y > obj.initialPosition.y + 400 || obj.position.y > CANVAS_HEIGHT - 50) {
                    obj.aiState = 'return';
                }
            } else if (obj.aiState === 'return') {
                const dx = obj.initialPosition.x - obj.position.x;
                const dy = obj.initialPosition.y - obj.position.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 5) {
                    obj.position.x = obj.initialPosition.x;
                    obj.position.y = obj.initialPosition.y;
                    obj.velocity = { x: 0, y: 0 };
                    obj.aiState = 'hover';
                } else {
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
    const targetCamX = player.position.x - CANVAS_WIDTH / 2 + player.size.width / 2;
    const maxCamX = 3000 - CANVAS_WIDTH;
    cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.1;
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

    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.subtype === 'mole' && obj.aiState === 'hidden') continue;

      const oLeft = obj.position.x;
      const oRight = obj.position.x + obj.size.width;
      const oTop = obj.position.y;
      const oBottom = obj.position.y + obj.size.height;

      if (pRight > oLeft && pLeft < oRight && pBottom > oTop && pTop < oBottom) {
        if (obj.type === 'platform') {
          if (axis === 'x') {
            if (p.velocity.x > 0) p.position.x = oLeft - p.size.width;
            else if (p.velocity.x < 0) p.position.x = oRight;
            p.velocity.x = 0;
          } else {
            if (p.velocity.y > 0) { 
              p.position.y = oTop - p.size.height;
              p.isGrounded = true;
              p.velocity.y = 0;
            } else if (p.velocity.y < 0) { 
              p.position.y = oBottom;
              p.velocity.y = 0;
            }
          }
        } else if (obj.type === 'enemy') {
          handlePlayerDamage();
          if (livesRef.current <= 0) return;
        } else if (obj.type === 'collectible') {
          objects.splice(i, 1);
          playCollect();
          onCollect();
        } else if (obj.type === 'end_goal') {
          playWin();
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
        ctx.fillStyle = COLORS.ground;
        ctx.fillRect(obj.position.x, obj.position.y, obj.size.width, 20);
        ctx.fillStyle = COLORS.dirt;
        ctx.fillRect(obj.position.x, obj.position.y + 20, obj.size.width, obj.size.height - 20);
      } else if (obj.type === 'enemy') {
        if (obj.subtype === 'mole') {
            const isHidden = obj.aiState === 'hidden';
            const isPopping = obj.aiState === 'popping';
            
            // Draw Dirt Mound/Hole base
            ctx.fillStyle = '#5D4037';
            ctx.beginPath();
            ctx.ellipse(obj.position.x + 20, obj.position.y + 35, 22, 8, 0, 0, 2 * Math.PI);
            ctx.fill();

            if (!isHidden) {
                ctx.save();
                // Offset for popping animation (rising up)
                const yOffset = isPopping ? 15 : 0;
                
                // Clip so it looks like it comes out of the mound
                ctx.beginPath();
                ctx.rect(obj.position.x - 10, obj.position.y - 40, 60, 75); // Clip area above the hole
                ctx.clip();

                // Draw Potato Body
                ctx.font = "32px Arial";
                ctx.fillText('🥔', obj.position.x + 2, obj.position.y + 35 + yOffset); 
                
                // Draw Face relative to potato
                const faceY = obj.position.y + 20 + yOffset;
                ctx.fillStyle = 'black';
                ctx.fillRect(obj.position.x + 14, faceY, 4, 4); // Left Eye
                ctx.fillRect(obj.position.x + 26, faceY, 4, 4); // Right Eye
                ctx.fillStyle = '#F472B6'; // Pink-400
                ctx.fillRect(obj.position.x + 18, faceY + 6, 8, 5); // Nose

                // Draw Teeth
                ctx.fillStyle = 'white';
                ctx.fillRect(obj.position.x + 20, faceY + 11, 4, 4); 

                ctx.restore();
                
                // Dirt debris if popping
                if (isPopping) {
                    ctx.fillStyle = '#78350F'; // amber-900
                    ctx.fillRect(obj.position.x + 5, obj.position.y + 30, 4, 4);
                    ctx.fillRect(obj.position.x + 35, obj.position.y + 28, 3, 3);
                    ctx.fillRect(obj.position.x - 2, obj.position.y + 32, 3, 3);
                }
            }
        }
        else {
            ctx.font = "30px Arial";
            ctx.save();
            const centerX = obj.position.x + obj.size.width/2;
            const centerY = obj.position.y + obj.size.height/2;
            ctx.translate(centerX, centerY);

            if (obj.subtype === 'snake') {
                if (obj.velocity && obj.velocity.x > 0) ctx.scale(-1, 1);
                ctx.fillText('🐍', -15, 10);
            }
            else if (obj.subtype === 'hawk') {
                if (obj.velocity && obj.velocity.x > 0) ctx.scale(-1, 1);
                ctx.fillText('🦅', -15, 10);
            }
            else if (obj.subtype === 'bat') {
                if (obj.velocity && obj.velocity.x > 0) ctx.scale(-1, 1);
                ctx.fillText('🦇', -15, 10);
            }
            else if (obj.subtype === 'bug') {
                ctx.rotate(Math.sin(frameCountRef.current * 0.5) * 0.2);
                ctx.font = "24px Arial";
                ctx.fillText('🐝', -12, 8);
            }
            else {
                ctx.fillStyle = COLORS.enemy;
                ctx.fillRect(-20, -20, 40, 40);
            }
            ctx.restore();
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

    // Draw Player
    const p = playerRef.current;
    const anim = animRef.current;

    // Flashing effect for invincibility
    let shouldDrawPlayer = true;
    if (invincibilityRef.current > 0) {
        // Blink every few frames
        if (Math.floor(frameCountRef.current / 4) % 2 === 0) {
            shouldDrawPlayer = false;
        }
    }

    if (shouldDrawPlayer) {
        ctx.save();
        // If dying, rotation can be applied if desired, but simple falling is usually enough
        if (!p.facingRight) {
            ctx.translate(p.position.x + p.size.width, p.position.y);
            ctx.scale(-1, 1);
            drawSprite(ctx, spriteSheet, anim.state, anim.frame, 0, 0, p.size.width, p.size.height);
        } else {
            ctx.translate(p.position.x, p.position.y);
            drawSprite(ctx, spriteSheet, anim.state, anim.frame, 0, 0, p.size.width, p.size.height);
        }
        ctx.restore();
    }
    
    ctx.restore(); // End Camera Transform

    // Game Over Overlay (Draws on top of everything else in screen space)
    if (isGameOverRef.current) {
        ctx.save();
        // Fade to black
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(gameOverTimerRef.current / 80, 0.8)})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Skull Icon
        ctx.globalAlpha = Math.min(gameOverTimerRef.current / 50, 1);
        ctx.font = "80px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 10;
        ctx.fillText("💀", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.restore();
    }

    // Draw UI (Hearts) on top of everything (Fixed position)
    // Hide hearts during game over sequence for cleaner look
    if (!isGameOverRef.current) {
        ctx.save();
        ctx.font = "24px Arial";
        ctx.fillStyle = "white";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 4;
        let hearts = "";
        for(let i=0; i<livesRef.current; i++) hearts += "❤️ ";
        ctx.fillText(hearts, 20, 80);
        ctx.restore();
    }
  };

  useEffect(() => {
    if (status === GameStatus.PLAYING) {
        requestRef.current = requestAnimationFrame(update);
    } else {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
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

const SPRITE_SIZE = 64; 

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
    let row = 0;
    if (state === 'run') row = 1;
    if (state === 'jump') row = 2;

    const sx = frame * SPRITE_SIZE;
    const sy = row * SPRITE_SIZE;

    ctx.drawImage(sheet, sx, sy, SPRITE_SIZE, SPRITE_SIZE, x, y, w, h);
};

const generatePrairieDogSpriteSheet = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE * 4; 
  canvas.height = SPRITE_SIZE * 3; 
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cMain = '#D97706'; 
  const cLight = '#FDE68A'; 
  const cDark = '#92400E'; 
  
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  };

  for(let f=0; f<2; f++) {
    const ox = f * SPRITE_SIZE;
    const oy = 0;
    r(ox+22, oy+54, 8, 6, cDark);
    r(ox+34, oy+54, 8, 6, cDark);
    r(ox+20, oy+24, 24, 32, cMain);
    r(ox+24, oy+28, 16, 26, cLight); 
    r(ox+18, oy+10, 28, 24, cMain);
    r(ox+18, oy+8, 6, 6, cDark);
    r(ox+40, oy+8, 6, 6, cDark);
    if (f === 0) {
        r(ox+24, oy+16, 4, 4, 'black'); 
        r(ox+36, oy+16, 4, 4, 'black'); 
    } else {
        r(ox+24, oy+18, 4, 2, 'black');
        r(ox+36, oy+18, 4, 2, 'black');
    }
    r(ox+28, oy+22, 8, 6, cLight); 
    r(ox+30, oy+22, 4, 3, 'black'); 
    r(ox+22, oy+34, 4, 8, cDark);
    r(ox+38, oy+34, 4, 8, cDark);
  }

  for(let f=0; f<4; f++) {
    const ox = f * SPRITE_SIZE;
    const oy = SPRITE_SIZE;
    const legOff = Math.sin(f * Math.PI / 2) * 10;
    r(ox+20+legOff, oy+50, 8, 12, cDark);
    r(ox+36-legOff, oy+50, 8, 12, cDark);
    r(ox+18, oy+28, 32, 24, cMain);
    r(ox+22, oy+32, 24, 16, cLight);
    r(ox+40, oy+14, 22, 22, cMain);
    r(ox+44, oy+10, 6, 6, cDark); 
    r(ox+52, oy+18, 4, 4, 'black'); 
    r(ox+56, oy+24, 6, 6, cLight); 
    r(ox+60, oy+24, 2, 2, 'black'); 
    r(ox+10, oy+40, 10, 6, cDark);
  }

  {
    const ox = 0;
    const oy = SPRITE_SIZE * 2;
    r(ox+16, oy+50, 8, 10, cDark);
    r(ox+40, oy+45, 8, 10, cDark);
    r(ox+20, oy+20, 24, 34, cMain);
    r(ox+24, oy+24, 16, 26, cLight);
    r(ox+22, oy+8, 26, 22, cMain);
    r(ox+22, oy+4, 6, 6, cDark);
    r(ox+40, oy+4, 6, 6, cDark);
    r(ox+38, oy+14, 4, 4, 'black'); 
    r(ox+44, oy+24, 8, 6, cDark);
    r(ox+18, oy+24, 8, 6, cDark); 
    r(ox+18, oy+48, 6, 8, cDark);
  }

  {
    const ox = SPRITE_SIZE;
    const oy = SPRITE_SIZE * 2;
    r(ox+20, oy+52, 8, 10, cDark);
    r(ox+36, oy+52, 8, 10, cDark);
    r(ox+20, oy+24, 24, 30, cMain);
    r(ox+24, oy+28, 16, 22, cLight);
    r(ox+22, oy+10, 26, 22, cMain);
    r(ox+22, oy+6, 6, 6, cDark);
    r(ox+40, oy+6, 6, 6, cDark);
    r(ox+40, oy+16, 4, 4, 'black'); 
    r(ox+44, oy+28, 8, 6, cDark); 
    r(ox+14, oy+35, 6, 10, cDark);
  }

  return canvas;
};

export default React.memo(GameCanvas);
