import React, { useRef, useEffect, useState } from 'react';
import { GameStatus, LevelConfig, Player, GameObject, Vector2, Particle, Projectile } from '../types';
import { 
  GRAVITY, FRICTION, AIR_FRICTION, JUMP_FORCE, 
  MOVE_SPEED, AIR_CONTROL, MAX_SPEED, TERMINAL_VELOCITY, PLAYER_WIDTH, PLAYER_HEIGHT, COLORS,
  SHIELD_DURATION, DASH_SPEED, DASH_DURATION, DASH_COOLDOWN
} from '../constants';
import { playJump, playCollect, playDeath, playWin, startMusic, stopMusic } from '../services/audioService';
import { DeviceMobile, Wind } from 'phosphor-react';

interface GameCanvasProps {
  level: LevelConfig;
  status: GameStatus;
  onGameOver: (win: boolean) => void;
  onCollect: () => void;
  width: number;
  height: number;
}

const COYOTE_FRAMES = 8; // Grace period frames for jumping after leaving a platform
const MAX_LIVES = 3;
const INVINCIBILITY_DURATION = 120; // Frames (approx 2 seconds)
const CRUMBLE_TIME = 30; // Frames before a crumble platform breaks

const GameCanvas: React.FC<GameCanvasProps> = ({ level, status, onGameOver, onCollect, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spriteSheet, setSpriteSheet] = useState<HTMLCanvasElement | null>(null);
  
  // High DPI Scaling
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // Mutable game state (refs for performance in game loop)
  const playerRef = useRef<Player>({
    position: { x: 50, y: 400 },
    velocity: { x: 0, y: 0 },
    size: { width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
    isGrounded: false,
    isDead: false,
    facingRight: true,
    canDoubleJump: false,
    isDashing: false
  });

  // Animation State
  const animRef = useRef({
    state: 'idle' as 'idle' | 'walk' | 'run' | 'jump',
    frame: 0,
    timer: 0,
    spin: 0 // Rotation angle in degrees for double jump
  });

  // Gameplay State
  const coyoteFramesRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const lastSafePosRef = useRef<Vector2>({ x: 50, y: 400 });
  const invincibilityRef = useRef(0);
  const shieldTimerRef = useRef(0);
  
  // Dash State
  const dashTimerRef = useRef(0);
  const dashCooldownRef = useRef(0);
  
  // Visual Effects
  const shakeTimerRef = useRef(0);
  const shakeStrengthRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  
  // Game Flow
  const cameraRef = useRef<Vector2>({ x: 0, y: 0 });
  const isGameOverRef = useRef(false);
  const gameOverTimerRef = useRef(0);

  // Inputs
  const inputRef = useRef({
    left: false,
    right: false,
    up: false,
    jumpPressed: false,
    dashPressed: false
  });

  // Initialize Game Objects from Level Config
  const platformsRef = useRef<GameObject[]>([]);
  const obstaclesRef = useRef<GameObject[]>([]);
  const enemiesRef = useRef<GameObject[]>([]);
  const collectiblesRef = useRef<GameObject[]>([]);
  const goalRef = useRef<GameObject | null>(null);

  // Helper to spawn particles
  const spawnDebris = (x: number, y: number, color: string, count: number = 5) => {
      for(let i=0; i<count; i++) {
          particlesRef.current.push({
              x: x + Math.random() * 40,
              y: y + Math.random() * 40,
              vx: (Math.random() - 0.5) * 10,
              vy: (Math.random() - 0.5) * 10,
              life: 30 + Math.random() * 20,
              color: color,
              size: 4 + Math.random() * 4
          });
      }
  };

  // Sprite Sheet Generation
  useEffect(() => {
    const generatePrairieDogSpriteSheet = () => {
      const CELL_SIZE = 128; // Increased resolution for sharpness
      const sCanvas = document.createElement('canvas');
      sCanvas.width = CELL_SIZE * 4; 
      sCanvas.height = CELL_SIZE * 4; 
      const ctx = sCanvas.getContext('2d');
      if (!ctx) return null;

      const drawFrame = (row: number, col: number, action: (c: CanvasRenderingContext2D) => void) => {
          ctx.save();
          ctx.translate(col * CELL_SIZE, row * CELL_SIZE);
          
          // Clip to cell
          ctx.beginPath();
          ctx.rect(0, 0, CELL_SIZE, CELL_SIZE);
          ctx.clip();
          
          // Scale up coordinate system to fit 128x128 conveniently (0-100 range logic)
          // 100 units * 1.28 = 128 pixels
          ctx.scale(1.28, 1.28); 

          action(ctx);
          ctx.restore();
      };

      // Common body drawing (Vector paths remain valid with scaling)
      const drawBody = (c: CanvasRenderingContext2D, legOffset: number, yOffset: number) => {
          // Body
          c.fillStyle = COLORS.player;
          c.beginPath();
          c.ellipse(50, 60 + yOffset, 25, 35, 0, 0, Math.PI * 2);
          c.fill();

          // Belly
          c.fillStyle = '#FDE68A';
          c.beginPath();
          c.ellipse(50, 65 + yOffset, 15, 25, 0, 0, Math.PI * 2);
          c.fill();

          // Head
          c.fillStyle = COLORS.player;
          c.beginPath();
          c.arc(50, 35 + yOffset, 20, 0, Math.PI * 2);
          c.fill();

          // Snout area
          c.fillStyle = '#FDE68A';
          c.beginPath();
          c.ellipse(50, 42 + yOffset, 12, 10, 0, 0, Math.PI * 2);
          c.fill();
          
          // Nose
          c.fillStyle = '#3e2723';
          c.beginPath();
          c.arc(50, 38 + yOffset, 3, 0, Math.PI * 2);
          c.fill();

          // Eyes
          c.fillStyle = 'black';
          c.beginPath();
          c.arc(42, 32 + yOffset, 3, 0, Math.PI * 2);
          c.arc(58, 32 + yOffset, 3, 0, Math.PI * 2);
          c.fill();
          // Highlights
          c.fillStyle = 'white';
          c.beginPath();
          c.arc(43, 31 + yOffset, 1, 0, Math.PI * 2);
          c.arc(59, 31 + yOffset, 1, 0, Math.PI * 2);
          c.fill();

          // Ears
          c.fillStyle = '#92400E';
          c.beginPath();
          c.arc(32, 30 + yOffset, 5, 0, Math.PI * 2);
          c.arc(68, 30 + yOffset, 5, 0, Math.PI * 2);
          c.fill();

          // Tail
          c.fillStyle = '#92400E';
          c.beginPath();
          c.ellipse(25, 70 + yOffset, 15, 8, -0.5, 0, Math.PI * 2);
          c.fill();

          // Legs
          c.fillStyle = '#92400E';
          c.beginPath();
          // Left Leg
          c.ellipse(40 + legOffset, 90 + yOffset, 6, 8, 0, 0, Math.PI * 2);
          // Right Leg
          c.ellipse(60 - legOffset, 90 + yOffset, 6, 8, 0, 0, Math.PI * 2);
          c.fill();
      };

      // Row 0: Idle (Breathing)
      for(let i=0; i<4; i++) {
        drawFrame(0, i, (c) => {
             const breathe = Math.sin(i) * 2;
             drawBody(c, 0, breathe);
        });
      }

      // Row 1: Run (Fast Leg Cycle)
      for(let i=0; i<4; i++) {
        drawFrame(1, i, (c) => {
             // Use PI/2 to get 0, 1, 0, -1 cycle approx
             const leg = Math.sin(i * Math.PI / 2) * 12;
             const bounce = Math.abs(Math.sin(i * Math.PI / 2)) * 5;
             drawBody(c, leg, -bounce);
        });
      }

      // Row 2: Jump
      // Frame 0: Up (Stretch)
      drawFrame(2, 0, (c) => {
          c.scale(0.9, 1.1); // Stretch vertically
          drawBody(c, 0, -5);
      });
      // Frame 1: Down (Squash)
      drawFrame(2, 1, (c) => {
          c.scale(1.1, 0.9); // Squash vertically
          drawBody(c, 0, 0);
      });

      // Row 3: Walk (Slower Leg Cycle)
      for(let i=0; i<4; i++) {
        drawFrame(3, i, (c) => {
             const leg = Math.sin(i * Math.PI / 2) * 6;
             const bounce = Math.abs(Math.sin(i * Math.PI / 2)) * 2;
             drawBody(c, leg, -bounce);
        });
      }

      return sCanvas;
    };

    setSpriteSheet(generatePrairieDogSpriteSheet());
  }, []);

  // Initialization Effect
  useEffect(() => {
    if (level) {
      // Parse platforms
      platformsRef.current = level.platforms.map((p, i) => ({
        id: `plat-${i}`,
        position: { x: p.x, y: p.y },
        size: { width: p.w, height: p.h },
        type: 'platform',
        subtype: p.subtype, // normal, crumble, bouncy
        isBroken: false,
        timer: p.subtype === 'crumble' ? CRUMBLE_TIME : 0
      }));

      // Parse obstacles
      obstaclesRef.current = (level.obstacles || []).map((o, i) => ({
        id: `obs-${i}`,
        position: { x: o.x, y: o.y },
        size: { width: o.w, height: o.h },
        type: 'obstacle',
        subtype: o.type,
        isBroken: false
      }));

      // Parse enemies
      enemiesRef.current = level.enemies.map((e, i) => {
        // For snakes and moles, find the platform underneath to define patrol/spawn range
        let patrol = { min: e.x - 100, max: e.x + 100 };
        let yPos = e.y;
        
        if (e.type === 'snake' || e.type === 'mole') {
            const platform = level.platforms.find(p => 
                e.x >= p.x && e.x <= p.x + p.w && Math.abs(p.y - e.y) < 50
            );
            if (platform) {
                patrol = { min: platform.x, max: platform.x + platform.w };
                yPos = platform.y - 40; // Snap to top
            }
        }

        // Determine initial AI state variants
        let initialState = 'idle';
        if (e.type === 'mole') initialState = 'hidden';
        
        // Variant Assignment
        // 40% chance for an alternate variant
        const isAlt = Math.random() < 0.4;
        const variant = isAlt ? 'alt' : 'default';

        // Adjust initial state for specific types/variants
        if (e.type === 'bat') {
           if (variant === 'default') {
               initialState = Math.random() > 0.5 ? 'sleeping' : 'idle';
           } else {
               // Alt Bat (Seeker) never sleeps
               initialState = 'idle';
           }
        }

        return {
          id: `enemy-${i}`,
          position: { x: e.x, y: yPos },
          size: { width: 40, height: 40 },
          type: 'enemy',
          subtype: e.type,
          velocity: { x: e.type === 'snake' ? 2 : 0, y: 0 },
          initialPosition: { x: e.x, y: yPos },
          patrolRange: patrol,
          aiState: initialState,
          timer: Math.random() * 100,
          variant: variant
        };
      });

      // Parse collectibles
      collectiblesRef.current = level.collectibles.map((c, i) => ({
        id: `col-${i}`,
        position: { x: c.x, y: c.y },
        size: { width: 30, height: 30 },
        type: 'collectible',
        subtype: c.type || 'seed'
      }));

      // Parse goal
      goalRef.current = {
        id: 'goal',
        position: { x: level.goal.x, y: level.goal.y },
        size: { width: 60, height: 80 },
        type: 'end_goal',
      };

      // Reset Player
      playerRef.current = {
        position: { x: 50, y: 400 },
        velocity: { x: 0, y: 0 },
        size: { width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
        isGrounded: false,
        isDead: false,
        facingRight: true,
        canDoubleJump: false,
        isDashing: false
      };
      
      lastSafePosRef.current = { x: 50, y: 400 };
      livesRef.current = MAX_LIVES;
      cameraRef.current = { x: 0, y: 0 };
      projectilesRef.current = [];
      particlesRef.current = [];
      isGameOverRef.current = false;
      gameOverTimerRef.current = 0;
      invincibilityRef.current = 0;
      shieldTimerRef.current = 0;
      dashTimerRef.current = 0;
      dashCooldownRef.current = 0;
      animRef.current.spin = 0;
      
      startMusic();
    }
    return () => { stopMusic(); };
  }, [level]);

  // Collision Helpers
  const getBounds = (obj: { position: Vector2, size: { width: number, height: number } }) => {
      return {
          x: obj.position.x,
          y: obj.position.y,
          w: obj.size.width,
          h: obj.size.height
      };
  };

  // HurtBox is slightly larger/more forgiving than physics box for collecting/damage
  const getHurtBounds = (obj: { position: Vector2, size: { width: number, height: number } }) => {
      const padding = 10;
      return {
          x: obj.position.x - padding / 2,
          y: obj.position.y - padding / 2,
          w: obj.size.width + padding,
          h: obj.size.height + padding
      };
  };

  const checkRectCollision = (
      rect1: { position: Vector2, size: { width: number, height: number } }, 
      rect2: { position: Vector2, size: { width: number, height: number } },
      useHurtBox: boolean = false
  ) => {
      const b1 = useHurtBox ? getHurtBounds(rect1) : getBounds(rect1);
      const b2 = useHurtBox ? getHurtBounds(rect2) : getBounds(rect2);

      return (
          b1.x < b2.x + b2.w &&
          b1.x + b1.w > b2.x &&
          b1.y < b2.y + b2.h &&
          b1.y + b1.h > b2.y
      );
  };

  const checkCircleRectCollision = (
      circle: { x: number, y: number, size: number }, 
      rect: { position: Vector2, size: { width: number, height: number } },
      useHurtBox: boolean = false
  ) => {
      const b = useHurtBox ? getHurtBounds(rect) : getBounds(rect);
      
      // Find closest point on rect to circle center
      const closestX = Math.max(b.x, Math.min(circle.x, b.x + b.w));
      const closestY = Math.max(b.y, Math.min(circle.y, b.y + b.h));
      
      const dx = circle.x - closestX;
      const dy = circle.y - closestY;
      
      return (dx * dx + dy * dy) < (circle.size * circle.size);
  };

  const handlePlayerDamage = () => {
      if (invincibilityRef.current > 0 || isGameOverRef.current || shieldTimerRef.current > 0 || playerRef.current.isDashing) return;

      playDeath();
      livesRef.current -= 1;
      shakeTimerRef.current = 20; // Screen shake
      shakeStrengthRef.current = 10;

      if (livesRef.current <= 0) {
          isGameOverRef.current = true;
          // Death hop
          playerRef.current.velocity.y = -15;
      } else {
          // Respawn at safe pos
          playerRef.current.position = { ...lastSafePosRef.current };
          playerRef.current.velocity = { x: 0, y: 0 };
          invincibilityRef.current = INVINCIBILITY_DURATION;
      }
  };

  // Game Loop
  useEffect(() => {
    if (status !== GameStatus.PLAYING && status !== GameStatus.GAME_OVER) return;

    let animationFrameId: number;

    const update = () => {
      const player = playerRef.current;
      
      // --- GAME OVER SEQUENCE ---
      if (isGameOverRef.current) {
           // Simple physics for death fall
           player.velocity.y += GRAVITY;
           player.position.y += player.velocity.y;
           gameOverTimerRef.current++;
           
           // Screen shake decay
           if (shakeTimerRef.current > 0) shakeTimerRef.current--;

           if (gameOverTimerRef.current > 100) { // ~1.6 seconds
               onGameOver(false);
               return; // Stop loop
           }
           draw();
           animationFrameId = requestAnimationFrame(update);
           return;
      }

      // --- NORMAL UPDATE ---
      
      // 1. Update Effects Timers
      if (coyoteFramesRef.current > 0) coyoteFramesRef.current--;
      if (invincibilityRef.current > 0) invincibilityRef.current--;
      if (shieldTimerRef.current > 0) shieldTimerRef.current--;
      if (shakeTimerRef.current > 0) shakeTimerRef.current--;
      if (dashCooldownRef.current > 0) dashCooldownRef.current--;
      
      // Spin Animation Update
      if (animRef.current.spin > 0) {
          animRef.current.spin -= 20; // Rotate 20 degrees per frame back to 0
          if (animRef.current.spin < 0) animRef.current.spin = 0;
      }

      // 2. Physics Calculation
      
      // Dash Logic
      if (inputRef.current.dashPressed && dashCooldownRef.current <= 0 && !player.isDashing) {
          player.isDashing = true;
          dashTimerRef.current = DASH_DURATION;
          dashCooldownRef.current = DASH_COOLDOWN;
          
          // Dash impulse
          const dir = player.facingRight ? 1 : -1;
          player.velocity.x = dir * DASH_SPEED;
          player.velocity.y = 0; // Gravity suspension start
          
          spawnDebris(player.position.x + PLAYER_WIDTH/2, player.position.y + PLAYER_HEIGHT/2, 'white', 8);
          playJump(); // Reuse jump sound or new sound
          shakeTimerRef.current = 5;
          shakeStrengthRef.current = 2;
          inputRef.current.dashPressed = false;
      }

      if (player.isDashing) {
          dashTimerRef.current--;
          
          // Maintain Dash Speed
          const dir = player.facingRight ? 1 : -1;
          player.velocity.x = dir * DASH_SPEED;
          player.velocity.y = 0; // Suspend gravity
          
          // Trail particles
          if (Math.random() > 0.5) {
              particlesRef.current.push({
                  x: player.position.x + Math.random() * PLAYER_WIDTH,
                  y: player.position.y + Math.random() * PLAYER_HEIGHT,
                  vx: -dir * Math.random() * 2,
                  vy: (Math.random() - 0.5),
                  life: 10,
                  color: 'rgba(255,255,255,0.5)',
                  size: 2
              });
          }

          if (dashTimerRef.current <= 0) {
              player.isDashing = false;
              player.velocity.x = Math.sign(player.velocity.x) * MAX_SPEED; // Clamp exit speed
          }
      } 
      else {
          // Normal Horizontal Movement
          if (inputRef.current.left) {
              player.velocity.x -= MOVE_SPEED * (player.isGrounded ? 1 : AIR_CONTROL);
              player.facingRight = false;
              animRef.current.state = Math.abs(player.velocity.x) > 8 ? 'run' : 'walk';
          } else if (inputRef.current.right) {
              player.velocity.x += MOVE_SPEED * (player.isGrounded ? 1 : AIR_CONTROL);
              player.facingRight = true;
              animRef.current.state = Math.abs(player.velocity.x) > 8 ? 'run' : 'walk';
          } else {
              // Idle friction
              player.velocity.x *= player.isGrounded ? FRICTION : AIR_FRICTION;
              if (Math.abs(player.velocity.x) < 0.5) {
                player.velocity.x = 0;
                animRef.current.state = 'idle';
              } else {
                animRef.current.state = Math.abs(player.velocity.x) > 8 ? 'run' : 'walk';
              }
          }

          // Clamp Speed
          player.velocity.x = Math.max(Math.min(player.velocity.x, MAX_SPEED), -MAX_SPEED);

          // Jumping Logic
          if (inputRef.current.jumpPressed) {
            // Normal Jump / Coyote Jump
            if (player.isGrounded || coyoteFramesRef.current > 0) {
              player.velocity.y = JUMP_FORCE;
              player.isGrounded = false;
              player.canDoubleJump = true; // Enable double jump
              coyoteFramesRef.current = 0;
              playJump();
            } 
            // Double Jump
            else if (player.canDoubleJump) {
                player.velocity.y = JUMP_FORCE * 0.9; // Slightly less force
                player.canDoubleJump = false; // Consume double jump
                animRef.current.spin = 360; // Trigger spin animation
                playJump();
                spawnDebris(player.position.x + PLAYER_WIDTH/2, player.position.y + PLAYER_HEIGHT, 'white', 6); // Cloud effect
            }
            inputRef.current.jumpPressed = false; // Consume jump
          } else if (player.velocity.y < 0 && !inputRef.current.up) {
            // Variable Jump Height: Damping if key released early
            player.velocity.y *= 0.6;
          }

          // Gravity
          player.velocity.y += GRAVITY;
          player.velocity.y = Math.min(player.velocity.y, TERMINAL_VELOCITY);
      }

      // Apply Velocity
      player.position.x += player.velocity.x;
      player.position.y += player.velocity.y;

      // Jump Animation Override
      if (!player.isGrounded && !player.isDashing) {
          animRef.current.state = 'jump';
      }

      // 3. Collisions
      let groundedThisFrame = false;

      // Platforms & Obstacles
      const checkEnvironmentCollision = (obj: GameObject) => {
           if (obj.isBroken) return;

           // Simple AABB Logic for floor/walls
           // We use the object bounds directly
           const b = getBounds(obj);
           
           // Predict previous position to determine collision side
           const prevY = player.position.y - player.velocity.y;
           const prevX = player.position.x - player.velocity.x;
           
           if (checkRectCollision(player, obj, false)) {
               // Top Collision (Landing)
               if (prevY + player.size.height <= b.y && player.velocity.y >= 0) {
                   
                   // Bouncy Platform Logic
                   if (obj.subtype === 'bouncy') {
                       player.position.y = b.y - player.size.height;
                       player.velocity.y = JUMP_FORCE * 1.4; // Super Bounce
                       player.isGrounded = false; // Immediately airborne
                       player.canDoubleJump = true; // Restore double jump
                       playJump(); // Play sound
                       spawnDebris(obj.position.x + obj.size.width/2, obj.position.y, '#EC4899', 5); // Pink bounce particles
                       return; // Skip normal grounding
                   }

                   player.position.y = b.y - player.size.height;
                   player.velocity.y = 0;
                   player.isGrounded = true;
                   groundedThisFrame = true;
                   
                   // Handle Crumble
                   if (obj.subtype === 'crumble') {
                       obj.timer = (obj.timer || CRUMBLE_TIME) - 1;
                       // Shake effect for platform
                       if (Math.random() > 0.5) obj.position.x += (Math.random() - 0.5) * 2;

                       if (obj.timer <= 0) {
                           obj.isBroken = true;
                           spawnDebris(obj.position.x + obj.size.width/2, obj.position.y, COLORS.ground, 10);
                           playDeath(); // Sound effect for breaking
                       }
                   } else {
                       lastSafePosRef.current = { x: obj.position.x, y: obj.position.y - 40 };
                   }
               }
               // Bottom Collision (Bonk)
               else if (prevY >= b.y + b.h && player.velocity.y < 0) {
                   player.position.y = b.y + b.h;
                   player.velocity.y = 0;
                   
                   // Break Crate from below
                   if (obj.type === 'obstacle' && obj.subtype === 'crate') {
                       obj.isBroken = true;
                       spawnDebris(obj.position.x + obj.size.width/2, obj.position.y + obj.size.height/2, '#8B4513', 8);
                   }
               }
               // Side Collisions
               else if (prevX + player.size.width <= b.x) {
                   player.position.x = b.x - player.size.width;
                   player.velocity.x = 0;
               }
               else if (prevX >= b.x + b.w) {
                   player.position.x = b.x + b.w;
                   player.velocity.x = 0;
               }
           }
      };

      platformsRef.current.forEach(checkEnvironmentCollision);
      obstaclesRef.current.forEach(obj => {
          // Special logic for crates - destroy on impact if shielded or jumped on
          if (obj.isBroken) return;
          
          // If shielded or dashing, break instantly on touch
          if ((shieldTimerRef.current > 0 || player.isDashing) && checkRectCollision(player, obj, true)) {
              obj.isBroken = true;
              spawnDebris(obj.position.x + obj.size.width/2, obj.position.y, '#8B4513', 10);
              return;
          }
          checkEnvironmentCollision(obj);
      });

      player.isGrounded = groundedThisFrame;
      if (groundedThisFrame) {
          coyoteFramesRef.current = COYOTE_FRAMES;
          player.canDoubleJump = true; // Reset Double Jump on ground
      }

      // World Bounds (Death Floor) - Immediate Game Over
      // Calculate the lowest platform Y to determine death plane. 
      // Default to height + 400 if no platforms (fallback)
      let lowestY = height;
      if (level.platforms.length > 0) {
          lowestY = Math.max(...level.platforms.map(p => p.y));
      }
      const deathY = lowestY + 400;

      if (player.position.y > deathY) {
          if (!isGameOverRef.current) {
              livesRef.current = 0; // Ensure no respawn
              isGameOverRef.current = true; // Trigger game over loop
              playDeath();
              playerRef.current.velocity.y = -15; // Visual death hop
          }
      }

      // Collectibles
      collectiblesRef.current.forEach(c => {
          if (c.isBroken) return;
          if (checkRectCollision(player, c, true)) { // Use hurtbox for easier collection
              c.isBroken = true;
              if (c.subtype === 'shield') {
                  shieldTimerRef.current = SHIELD_DURATION;
                  playCollect(); // or distinct powerup sound
                  shakeTimerRef.current = 20;
                  shakeStrengthRef.current = 5;
              } else {
                  onCollect(); // Seed
                  playCollect();
                  shakeTimerRef.current = 5;
                  shakeStrengthRef.current = 2;
              }
          }
      });

      // Goal
      if (goalRef.current && checkRectCollision(player, goalRef.current, true)) {
          onGameOver(true); // Win
          playWin();
          return;
      }

      // Enemies Update & Collision
      enemiesRef.current.forEach(enemy => {
          if (enemy.isBroken) return;
          
          // AI Logic (Same as before)
          if (enemy.subtype === 'snake') {
              // Patrol Logic
              if (enemy.aiState !== 'angry') {
                  // Normal Patrol
                  enemy.position.x += enemy.velocity!.x;
                  if (enemy.patrolRange) {
                      if (enemy.position.x <= enemy.patrolRange.min || enemy.position.x >= enemy.patrolRange.max) {
                          enemy.velocity!.x *= -1;
                      }
                      // Random turn
                      if (Math.random() < 0.005) enemy.velocity!.x *= -1;
                  }
                  
                  // Variant: Check for player to Charge
                  if (Math.abs(player.position.y - enemy.position.y) < 50 && 
                      Math.abs(player.position.x - enemy.position.x) < 250) {
                          enemy.aiState = 'angry';
                          // Face player
                          const dir = player.position.x > enemy.position.x ? 1 : -1;
                          enemy.velocity!.x = 6 * dir; // Fast charge
                  }
              } else {
                  // Angry State
                  enemy.position.x += enemy.velocity!.x;
                  // Stop at edge
                  if (enemy.patrolRange) {
                       if (enemy.position.x <= enemy.patrolRange.min || enemy.position.x >= enemy.patrolRange.max) {
                           enemy.velocity!.x = 0;
                           enemy.aiState = 'idle'; // Reset
                       }
                  }
                  // Jump variant if player jumps over
                  if (enemy.variant === 'alt' && player.position.y < enemy.position.y - 50 && Math.abs(player.position.x - enemy.position.x) < 50) {
                      if (enemy.position.y >= enemy.initialPosition!.y) { // grounded check approx
                         enemy.velocity!.y = -10;
                      }
                  }
                  // Gravity for jumping snake
                  enemy.position.y += enemy.velocity!.y || 0;
                  if ((enemy.velocity!.y || 0) < 0 || enemy.position.y < enemy.initialPosition!.y) {
                      enemy.velocity!.y = (enemy.velocity!.y || 0) + 0.5; // Gravity
                  } else {
                      enemy.velocity!.y = 0;
                      enemy.position.y = enemy.initialPosition!.y;
                  }
              }
          } 
          else if (enemy.subtype === 'hawk') {
             // Hawk AI: Hover -> Stalk -> Dive -> Return
             if (enemy.aiState === 'idle' || enemy.aiState === 'hover') {
                 enemy.position.y = enemy.initialPosition!.y + Math.sin(Date.now() / 500) * 20;
                 
                 // Stalking behavior: Drift towards player X
                 const dx = player.position.x - enemy.position.x;
                 enemy.position.x += dx * 0.005;

                 // Check trigger
                 if (Math.abs(player.position.x - enemy.position.x) < 150 && player.position.y > enemy.position.y) {
                     // Add random delay before dive
                     enemy.aiState = 'preparing';
                     enemy.timer = 30 + Math.random() * 30;
                 }
             } else if (enemy.aiState === 'preparing') {
                 enemy.timer = (enemy.timer || 0) - 1;
                 if (enemy.timer <= 0) enemy.aiState = 'dive';
             } else if (enemy.aiState === 'dive') {
                 const targetY = player.position.y;
                 const targetX = player.position.x;
                 const dx = targetX - enemy.position.x;
                 const dy = targetY - enemy.position.y;
                 
                 enemy.position.x += dx * 0.05;
                 enemy.position.y += 6; // Dive speed
                 
                 if (enemy.position.y >= targetY + 50 || enemy.position.y > enemy.initialPosition!.y + 300) {
                     enemy.aiState = 'return';
                 }
             } else if (enemy.aiState === 'return') {
                 // Fly back up
                 const dx = enemy.initialPosition!.x - enemy.position.x;
                 const dy = enemy.initialPosition!.y - enemy.position.y;
                 enemy.position.x += dx * 0.02;
                 enemy.position.y += dy * 0.05;
                 
                 if (Math.abs(dy) < 10) enemy.aiState = 'idle';
             }
          }
          else if (enemy.subtype === 'bat') {
             // Bat AI: Figure 8 or Swoop
             if (enemy.aiState === 'sleeping') {
                 // Roosting check
                 const dist = Math.hypot(player.position.x - enemy.position.x, player.position.y - enemy.position.y);
                 if (dist < 250) enemy.aiState = 'idle';
             } else {
                 const t = Date.now() / 300;
                 // Basic movement
                 enemy.position.x = enemy.initialPosition!.x + Math.sin(t) * 100; 
                 enemy.position.y = enemy.initialPosition!.y + Math.sin(t * 2) * 50;
                 
                 // Seeker Variant
                 if (enemy.variant === 'alt') {
                    const dx = player.position.x - enemy.position.x;
                    const dy = player.position.y - enemy.position.y;
                    if (Math.abs(dx) < 200 && dy > 0) {
                        enemy.position.y += 3; // Swoop down
                    }
                 }
             }
          }
          else if (enemy.subtype === 'bug') {
              // Bug AI: Swarm
              const t = Date.now() / 200;
              const phase = (enemy.timer || 0);
              
              // Variant: Pulsing/Chasing swarm
              let cx = enemy.initialPosition!.x;
              if (enemy.variant === 'alt') {
                  // Drift center towards player slowly
                  if (Math.abs(player.position.x - cx) < 400) {
                      enemy.initialPosition!.x += (player.position.x - cx) * 0.002;
                  }
              }

              const radius = enemy.variant === 'alt' ? 60 + Math.sin(t/2)*30 : 60;
              
              enemy.position.x = enemy.initialPosition!.x + Math.cos(t + phase) * radius;
              enemy.position.y = enemy.initialPosition!.y + Math.sin(t + phase) * radius;
          }
          else if (enemy.subtype === 'mole') {
              // Mole AI: Pop up and Down
              if (enemy.aiState === 'hidden') {
                  enemy.timer = (enemy.timer || 0) - 1;
                  if (enemy.timer <= 0) {
                      enemy.aiState = 'rising';
                      enemy.timer = 30;
                  }
                  // Tracker variant: Digs towards player
                  if (enemy.variant === 'alt' && enemy.patrolRange) {
                      const dx = player.position.x - enemy.position.x;
                      if (Math.abs(dx) < 200) {
                          const dir = Math.sign(dx);
                          enemy.position.x += dir * 0.5;
                          // Clamp to platform
                          enemy.position.x = Math.max(enemy.patrolRange.min, Math.min(enemy.patrolRange.max, enemy.position.x));
                          // Dig particles
                          if (Math.random() > 0.8) spawnDebris(enemy.position.x, enemy.position.y + 40, COLORS.dirt, 1);
                      }
                  }
              } else if (enemy.aiState === 'rising') {
                  enemy.timer = (enemy.timer || 0) - 1;
                  // Visual offset handled in draw
                  if (enemy.timer <= 0) {
                      enemy.aiState = 'active';
                      enemy.timer = 120 + Math.random()*60;
                      
                      // Spit attack immediately upon surfacing
                      // Fire projectile towards player
                      const dx = (player.position.x + player.size.width/2) - enemy.position.x;
                      const dy = (player.position.y + player.size.height/2) - enemy.position.y;
                      const mag = Math.hypot(dx, dy);
                      
                      projectilesRef.current.push({
                          x: enemy.position.x,
                          y: enemy.position.y - 20,
                          vx: (dx / mag) * 5,
                          vy: (dy / mag) * 5 - 3, // Slight arc up
                          size: 6,
                          color: COLORS.dirt,
                          damage: 1
                      });
                  }
              } else if (enemy.aiState === 'active') {
                  enemy.timer = (enemy.timer || 0) - 1;
                  if (enemy.timer <= 0) {
                      enemy.aiState = 'lowering';
                      enemy.timer = 30;
                  }
              } else if (enemy.aiState === 'lowering') {
                  enemy.timer = (enemy.timer || 0) - 1;
                  if (enemy.timer <= 0) {
                      enemy.aiState = 'hidden';
                      enemy.timer = 100 + Math.random()*100;
                  }
              }
          }

          // Damage check
          // Moles only hurt when active/rising/lowering, not hidden
          if (enemy.subtype === 'mole' && enemy.aiState === 'hidden') return;

          if (checkRectCollision(player, enemy, true)) {
              if (shieldTimerRef.current > 0 || player.isDashing) {
                  // Kill enemy if shielded OR dashing
                  enemy.isBroken = true;
                  spawnDebris(enemy.position.x, enemy.position.y, COLORS.enemy, 8);
                  playDeath();
                  if (player.isDashing) {
                      shakeTimerRef.current = 10;
                      shakeStrengthRef.current = 5;
                  }
              } else {
                  handlePlayerDamage();
              }
          }
      });

      // Projectiles Update
      for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
          const p = projectilesRef.current[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.15; // Gravity

          // Check Bounds
          if (p.y > level.platforms[0]?.y + 500 || p.y > deathY) {
              projectilesRef.current.splice(i, 1);
              continue;
          }

          // Hit Player
          if (checkCircleRectCollision(p, player, true)) {
              handlePlayerDamage();
              projectilesRef.current.splice(i, 1);
              continue;
          }
          
          // Hit Platforms
          const hitPlat = platformsRef.current.some(plat => !plat.isBroken && checkCircleRectCollision(p, plat));
          if (hitPlat) {
              spawnDebris(p.x, p.y, p.color, 3);
              projectilesRef.current.splice(i, 1);
          }
      }

      // Particles Update
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const p = particlesRef.current[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += GRAVITY * 0.5;
          p.life--;
          if (p.life <= 0) particlesRef.current.splice(i, 1);
      }

      // Camera Follow
      // Calculate target camera X to keep player centered horizontally
      let targetCamX = player.position.x - width / 2 + player.size.width / 2;
      // Calculate target camera Y to keep player visible vertically, but clamped
      let targetCamY = player.position.y - height * 0.6;

      // Clamp Camera to Level Bounds
      targetCamX = Math.max(0, Math.min(targetCamX, 3000 - width)); // Assuming 3000 width
      targetCamY = Math.min(targetCamY, 600); // Prevent seeing below world

      // Smooth Lerp
      cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.1;
      cameraRef.current.y += (targetCamY - cameraRef.current.y) * 0.1;

      draw();
      animationFrameId = requestAnimationFrame(update);
    };

    // Start Loop
    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, [status, level, width, height, onGameOver, onCollect]);

  // Drawing
  const draw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !playerRef.current) return;

    // Handle High DPI Scaling
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const player = playerRef.current;
    const cam = cameraRef.current;

    // Clear logical area
    ctx.clearRect(0, 0, width, height);

    // --- Background ---
    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, width, height);
    
    // Parallax Clouds (Simple)
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const t = Date.now() / 10000;
    for(let i=0; i<5; i++) {
        const cx = ((i * 400) + t * 50) % (3000 + width) - cam.x * 0.5;
        const cy = 100 + i * 50 - cam.y * 0.1;
        ctx.beginPath();
        ctx.arc(cx, cy, 40, 0, Math.PI*2);
        ctx.arc(cx+50, cy+10, 50, 0, Math.PI*2);
        ctx.arc(cx-50, cy+10, 50, 0, Math.PI*2);
        ctx.fill();
    }

    // Apply Camera Transform & Shake
    ctx.save();
    
    // Screen Shake
    let shakeX = 0, shakeY = 0;
    if (shakeTimerRef.current > 0) {
        shakeX = (Math.random() - 0.5) * shakeStrengthRef.current;
        shakeY = (Math.random() - 0.5) * shakeStrengthRef.current;
    }

    ctx.translate(-cam.x + shakeX, -cam.y + shakeY);

    // --- World Rendering ---

    // Goal
    if (goalRef.current) {
        const g = goalRef.current;
        ctx.fillStyle = COLORS.goal;
        // Burrow hole
        ctx.beginPath();
        ctx.ellipse(g.position.x + 30, g.position.y + 60, 30, 10, 0, 0, Math.PI*2);
        ctx.fill();
        // Flag/Sign
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(g.position.x + 25, g.position.y, 10, 60);
        ctx.fillStyle = COLORS.goal;
        ctx.beginPath();
        ctx.moveTo(g.position.x + 35, g.position.y);
        ctx.lineTo(g.position.x + 80, g.position.y + 20);
        ctx.lineTo(g.position.x + 35, g.position.y + 40);
        ctx.fill();
    }

    // Platforms
    platformsRef.current.forEach(p => {
        if (p.isBroken) return;
        
        if (p.subtype === 'bouncy') {
            // Bouncy style
            ctx.fillStyle = '#F472B6'; // Pink-400
            ctx.fillRect(p.position.x, p.position.y, p.size.width, p.size.height);
            // Spring pattern
            ctx.strokeStyle = '#EC4899';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(p.position.x, p.position.y + 5);
            for(let x = 10; x < p.size.width; x+=20) {
                ctx.lineTo(p.position.x + x, p.position.y + 15);
                ctx.lineTo(p.position.x + x + 10, p.position.y + 5);
            }
            ctx.stroke();
        } else {
            // Texture pattern
            ctx.fillStyle = p.subtype === 'crumble' ? '#D4D4D8' : COLORS.ground;
            ctx.fillRect(p.position.x, p.position.y, p.size.width, p.size.height);
            
            // Grass top
            if (p.subtype !== 'crumble') {
                ctx.fillStyle = '#65A30D';
                ctx.fillRect(p.position.x, p.position.y, p.size.width, 10);
            } else {
                // Cracks if crumbling
                if ((p.timer || 0) < CRUMBLE_TIME) {
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(p.position.x + 10, p.position.y);
                    ctx.lineTo(p.position.x + 20, p.position.y + 20);
                    ctx.lineTo(p.position.x + 30, p.position.y + 5);
                    ctx.stroke();
                }
            }
        }
    });

    // Obstacles
    obstaclesRef.current.forEach(o => {
        if (o.isBroken) return;
        // Crate look
        ctx.fillStyle = '#B45309';
        ctx.fillRect(o.position.x, o.position.y, o.size.width, o.size.height);
        // X Pattern
        ctx.strokeStyle = '#78350F';
        ctx.lineWidth = 4;
        ctx.strokeRect(o.position.x, o.position.y, o.size.width, o.size.height);
        ctx.beginPath();
        ctx.moveTo(o.position.x, o.position.y);
        ctx.lineTo(o.position.x + o.size.width, o.position.y + o.size.height);
        ctx.moveTo(o.position.x + o.size.width, o.position.y);
        ctx.lineTo(o.position.x, o.position.y + o.size.height);
        ctx.stroke();
    });

    // Collectibles
    collectiblesRef.current.forEach(c => {
        if (c.isBroken) return;
        const cx = c.position.x + c.size.width / 2;
        const cy = c.position.y + c.size.height / 2;
        const t = Date.now() / 200;
        
        ctx.save();
        ctx.translate(cx, cy);
        
        if (c.subtype === 'shield') {
             // Pulsing Shield
             const s = 1 + Math.sin(t) * 0.1;
             ctx.scale(s, s);
             ctx.font = "48px serif"; // Increased scale
             ctx.textAlign = "center";
             ctx.textBaseline = "middle";
             // Aura
             ctx.shadowColor = "cyan";
             ctx.shadowBlur = 20;
             ctx.fillText("🛡️", 0, 0);
        } else {
             // Bobbing Seed
             const bob = Math.sin(t + cx) * 5;
             ctx.translate(0, bob);
             // Rotation
             ctx.rotate(Math.sin(t/2) * 0.2);
             
             ctx.font = "36px serif"; // Increased scale
             ctx.textAlign = "center";
             ctx.textBaseline = "middle";
             ctx.shadowColor = "gold";
             ctx.shadowBlur = 10 + Math.sin(t)*5;
             ctx.fillText("🌰", 0, 0);
        }
        ctx.restore();
    });

    // Enemies
    enemiesRef.current.forEach(e => {
        if (e.isBroken) return;
        const ex = e.position.x + e.size.width / 2;
        const ey = e.position.y + e.size.height / 2;
        
        ctx.save();
        ctx.translate(ex, ey);

        // Flip based on direction or player position
        const isFacingLeft = e.velocity && e.velocity.x < 0;
        if (!isFacingLeft) ctx.scale(-1, 1);

        ctx.font = "48px serif"; // Increased scale
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (e.subtype === 'snake') {
            if (e.aiState === 'angry') {
                ctx.fillText("🐍", 0, 0);
                // Angry emote
                ctx.font = "24px serif";
                ctx.fillText("💢", 0, -25);
            } else {
                ctx.fillText("🐍", 0, 0);
            }
        } 
        else if (e.subtype === 'hawk') {
            ctx.fillText("🦅", 0, 0);
            if (e.aiState === 'dive') {
                ctx.rotate(Math.PI / 4); // Tilt down
            }
        }
        else if (e.subtype === 'bat') {
            if (e.aiState === 'sleeping') {
                ctx.scale(1, -1); // Upside down
                ctx.fillText("🦇", 0, 0);
            } else {
                ctx.rotate(Math.sin(Date.now()/100) * 0.2); // Bank
                ctx.fillText("🦇", 0, 0);
                if (e.variant === 'alt') {
                   // Red eyes for seeker
                   ctx.fillStyle = 'red';
                   ctx.beginPath(); ctx.arc(2, -2, 1, 0, Math.PI*2); ctx.fill();
                }
            }
        }
        else if (e.subtype === 'bug') {
            ctx.fillText("🐝", 0, 0);
        }
        else if (e.subtype === 'mole') {
            // Mole Render
            if (e.aiState === 'hidden') {
                // Digging mound moving
                 if (e.variant === 'alt') {
                     ctx.fillStyle = COLORS.dirt;
                     ctx.beginPath();
                     ctx.arc(0, 15, 10, 0, Math.PI*2); // Little mound
                     ctx.fill();
                 }
            } else {
                const rise = e.aiState === 'rising' ? e.timer! : e.aiState === 'lowering' ? (30 - e.timer!) : 0;
                const offset = (rise / 30) * 40; // Pixels down
                
                // Masking/Clipping for hole effect requires restoring state, 
                // but for emoji simplicity we just shift Y
                
                // Dirt Pile
                ctx.fillStyle = '#5D4037';
                ctx.beginPath();
                ctx.ellipse(0, 20, 20, 8, 0, 0, Math.PI * 2);
                ctx.fill();

                // Mole body
                if (e.aiState !== 'hidden') {
                    ctx.translate(0, Math.min(0, offset)); // Actually we want to start low and go up
                    // Re-calculate logic: 
                    // Hidden: Not drawn
                    // Rising: starts at +40 (hidden), goes to 0
                    let yOff = 0;
                    if (e.aiState === 'rising') yOff = (e.timer! / 30) * 40;
                    if (e.aiState === 'lowering') yOff = ((30 - e.timer!) / 30) * 40;
                    
                    ctx.translate(0, yOff);
                    ctx.fillText("🥔", 0, 0);
                    // Face
                    ctx.font = "16px monospace";
                    // Eyes tracking
                    const dx = player.position.x - e.position.x;
                    const eyeOff = Math.sign(dx) * 2;
                    ctx.fillText(e.aiState==='active' && e.timer! > 100 ? "😮" : "..", eyeOff, -5); // Spit anim
                    ctx.fillStyle = 'pink';
                    ctx.beginPath(); ctx.arc(0, 2, 2, 0, Math.PI*2); ctx.fill(); // Nose
                }
            }
        }

        ctx.restore();
    });

    // Projectiles
    projectilesRef.current.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        // Rotate along velocity
        const angle = Math.atan2(p.vy, p.vx);
        ctx.rotate(angle);
        
        ctx.fillStyle = p.color;
        ctx.beginPath();
        // Teardrop shape (Scaled up 1.5x)
        const visualSize = p.size * 1.5;
        ctx.arc(0, 0, visualSize, Math.PI/2, -Math.PI/2);
        ctx.lineTo(-visualSize*2, 0);
        ctx.fill();
        
        ctx.restore();
    });

    // Particles
    particlesRef.current.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.rect(p.x, p.y, p.size, p.size);
        ctx.fill();
    });

    // --- Player ---
    if (!player.isDead && !isGameOverRef.current) {
        ctx.save();
        ctx.translate(player.position.x + player.size.width / 2, player.position.y + player.size.height / 2);
        
        // Spin Animation (Double Jump)
        if (animRef.current.spin > 0) {
            const rot = (360 - animRef.current.spin) * (Math.PI / 180);
            ctx.rotate(player.facingRight ? rot : -rot);
        }

        // Dash Distortion
        if (player.isDashing) {
            ctx.scale(1.4, 0.7); // Stretch horizontally
        }

        // Facing
        if (!player.facingRight) {
           ctx.scale(-1, 1);
        }

        // Invincibility Flash
        if (invincibilityRef.current > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // Shield Aura
        if (shieldTimerRef.current > 0) {
            const t = Date.now() / 100;
            ctx.strokeStyle = `rgba(0, 255, 255, ${0.5 + Math.sin(t)*0.2})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 40, 0, Math.PI*2);
            ctx.stroke();
            
            // Rotating dashed ring
            ctx.save();
            ctx.rotate(t * 0.5);
            ctx.setLineDash([10, 10]);
            ctx.strokeStyle = "cyan";
            ctx.beginPath();
            ctx.arc(0, 0, 45, 0, Math.PI*2);
            ctx.stroke();
            ctx.restore();
        }

        // Render Sprite
        if (spriteSheet) {
            const spriteSize = 128; // Source size (Upscaled to match CELL_SIZE)
            const renderSize = 100; // Target size (Upscaled)
            
            // Determine row/col
            // 0:Idle, 1:Run, 2:Jump, 3:Walk
            let row = 0;
            let speedDiv = 10; // Frames per sprite update
            
            if (animRef.current.state === 'run') { row = 1; speedDiv = 5; }
            else if (animRef.current.state === 'jump') { 
                row = 2; 
                animRef.current.frame = player.velocity.y < 0 ? 0 : 1; // Up/Down frames
            }
            else if (animRef.current.state === 'walk') { row = 3; speedDiv = 8; }

            // Update Frame Timer
            animRef.current.timer++;
            if (animRef.current.timer >= speedDiv && animRef.current.state !== 'jump') {
                animRef.current.frame = (animRef.current.frame + 1) % 4; // 4 frames per row
                animRef.current.timer = 0;
            }

            // Draw Image
            // Offset to center the sprite visually within the physics box
            const xOff = -renderSize / 2; 
            const yOff = -renderSize / 2 - 15; // Adjusted yOff for larger sprite

            ctx.drawImage(
                spriteSheet,
                animRef.current.frame * spriteSize, row * spriteSize, spriteSize, spriteSize,
                xOff, yOff, renderSize, renderSize
            );

        } else {
             // Fallback
             ctx.fillStyle = COLORS.player;
             ctx.fillRect(-20, -20, 40, 40);
        }

        ctx.restore();
    }

    // Game Over Overlay in World Space (if running logic there)
    ctx.restore();

    // --- HUD / Overlays ---
    
    // Lives (Rendered via React Overlay now)
    
    // Game Over Screen specific rendering (Internal fade)
    if (isGameOverRef.current) {
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1.0, gameOverTimerRef.current / 60)})`;
        ctx.fillRect(0, 0, width, height);
        
        const skullSize = Math.min(width, height) / 4;
        ctx.font = `${skullSize}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("💀", width/2, height/2);
    }

  };

  // --- Input Handlers ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'ArrowLeft' || e.key === 'a') inputRef.current.left = true;
          if (e.key === 'ArrowRight' || e.key === 'd') inputRef.current.right = true;
          if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') {
              inputRef.current.up = true;
              if (!inputRef.current.jumpPressed) inputRef.current.jumpPressed = true;
          }
          if (e.key === 'Shift' || e.key === 'z') {
              inputRef.current.dashPressed = true;
          }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.key === 'ArrowLeft' || e.key === 'a') inputRef.current.left = false;
          if (e.key === 'ArrowRight' || e.key === 'd') inputRef.current.right = false;
          if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') inputRef.current.up = false;
          if (e.key === 'Shift' || e.key === 'z') {
              inputRef.current.dashPressed = false;
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, []);

  // Mobile Touch Handlers (Rendered as DOM elements for accessibility/ease)
  // Since I am in GameCanvas, I can return JSX.
  
  return (
    <div className="relative w-full h-full">
        <canvas 
            ref={canvasRef} 
            width={width * dpr} 
            height={height * dpr}
            className="block w-full h-full object-contain bg-sky-200"
        />
        
        {/* Mobile Controls Overlay */}
        {(status === GameStatus.PLAYING) && (
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-end pb-8 px-4 sm:hidden">
                <div className="flex justify-between items-end pointer-events-auto w-full">
                    {/* D-Pad */}
                    <div className="flex gap-4">
                        <button 
                            className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full border-2 border-white/30 active:bg-white/40 flex items-center justify-center text-3xl"
                            onTouchStart={(e) => { e.preventDefault(); inputRef.current.left = true; }}
                            onTouchEnd={(e) => { e.preventDefault(); inputRef.current.left = false; }}
                        >
                           ⬅️
                        </button>
                        <button 
                            className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full border-2 border-white/30 active:bg-white/40 flex items-center justify-center text-3xl"
                            onTouchStart={(e) => { e.preventDefault(); inputRef.current.right = true; }}
                            onTouchEnd={(e) => { e.preventDefault(); inputRef.current.right = false; }}
                        >
                           ➡️
                        </button>
                    </div>

                    <div className="flex gap-4 items-end">
                        {/* Dash Btn */}
                        <button 
                            className={`w-14 h-14 backdrop-blur-md rounded-full border-2 flex items-center justify-center text-2xl shadow-lg transition-all ${
                                dashCooldownRef.current <= 0 
                                ? 'bg-cyan-500/40 border-cyan-300/50 active:bg-cyan-500/60 text-white' 
                                : 'bg-gray-500/40 border-gray-500/50 text-gray-400 cursor-not-allowed'
                            }`}
                            onTouchStart={(e) => { 
                                e.preventDefault(); 
                                if (dashCooldownRef.current <= 0) inputRef.current.dashPressed = true; 
                            }}
                        >
                           <Wind weight="fill" />
                        </button>

                        {/* Jump Btn */}
                        <button 
                            className="w-20 h-20 bg-amber-500/80 backdrop-blur-md rounded-full border-4 border-amber-300/50 active:bg-amber-600 shadow-xl flex items-center justify-center text-4xl"
                            onTouchStart={(e) => { e.preventDefault(); inputRef.current.jumpPressed = true; inputRef.current.up = true; }}
                            onTouchEnd={(e) => { e.preventDefault(); inputRef.current.up = false; }}
                        >
                           ⬆️
                        </button>
                    </div>
                </div>
            </div>
        )}
        
        {/* Orientation Hint */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-0 transition-opacity duration-1000 hidden portrait:flex flex-col items-center text-white/50 bg-black/40 p-4 rounded-xl backdrop-blur-sm animate-pulse">
             <DeviceMobile size={48} className="mb-2 rotate-90" />
             <span className="text-sm font-bold">Rotate for best view</span>
        </div>

    </div>
  );
};

export default React.memo(GameCanvas);