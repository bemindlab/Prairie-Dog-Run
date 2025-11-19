
// Web Audio API Service for Prairie Dog Run

let audioCtx: AudioContext | null = null;
let isMuted = false;
let musicInterval: any = null;

const getCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

export const initAudio = () => {
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
};

// --- Sound Effects ---

export const playJump = () => {
    if (isMuted) return;
    const ctx = getCtx();
    const t = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(300, t + 0.1);
    
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.1);
    
    osc.start();
    osc.stop(t + 0.1);
};

export const playCollect = () => {
    if (isMuted) return;
    const ctx = getCtx();
    const t = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    // Coin/Seed chime
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, t); // B5
    osc.frequency.setValueAtTime(1318.51, t + 0.08); // E6
    
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);
    
    osc.start();
    osc.stop(t + 0.3);
};

export const playDeath = () => {
    if (isMuted) return;
    const ctx = getCtx();
    const t = ctx.currentTime;

    // Noise burst for impact
    const bufferSize = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    
    noiseGain.gain.setValueAtTime(0.2, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    noise.start();
    
    // Falling slide
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.4);
    
    oscGain.gain.setValueAtTime(0.1, t);
    oscGain.gain.linearRampToValueAtTime(0, t + 0.4);
    
    osc.start();
    osc.stop(t + 0.4);
};

export const playWin = () => {
    if (isMuted) return;
    const ctx = getCtx();
    const t = ctx.currentTime;
    
    // Simple Major Arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C E G C
    
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        const start = t + i * 0.1;
        osc.type = 'triangle';
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0.1, start);
        gain.gain.linearRampToValueAtTime(0, start + 0.3);
        
        osc.start(start);
        osc.stop(start + 0.3);
    });
};

// --- Background Music ---

const createNote = (freq: number, dur: number, vol: number) => {
    if (isMuted) return;
    const ctx = getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'square'; // Retro style
    osc.frequency.value = freq;
    
    gain.gain.setValueAtTime(vol, t);
    gain.gain.linearRampToValueAtTime(0, t + dur * 0.8);
    
    osc.start();
    osc.stop(t + dur);
};

// Simple Prairie Bassline
const bassLoop = [
    261.63, 0, 329.63, 0, 392.00, 0, 329.63, 0, // C E G E
    293.66, 0, 349.23, 0, 392.00, 0, 349.23, 0  // D F G F
];
let noteIndex = 0;

export const startMusic = () => {
    if (musicInterval) return; // Already playing
    
    const tempo = 200; // ms per 8th note
    noteIndex = 0;
    
    // We use setInterval for simplicity in this context instead of precise WebAudio scheduling ahead of time
    musicInterval = setInterval(() => {
        if (isMuted) return;
        
        const freq = bassLoop[noteIndex % bassLoop.length];
        if (freq > 0) {
            createNote(freq, 0.15, 0.05);
        }
        
        // Add a little hi-hat ticking every other beat
        if (noteIndex % 2 === 0) {
             const ctx = getCtx();
             const osc = ctx.createOscillator();
             const gain = ctx.createGain();
             osc.connect(gain);
             gain.connect(ctx.destination);
             osc.type = 'sawtooth';
             osc.frequency.value = 10000; // Hi hat
             gain.gain.setValueAtTime(0.01, ctx.currentTime);
             gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
             osc.start();
             osc.stop(ctx.currentTime + 0.05);
        }
        
        noteIndex++;
    }, tempo);
};

export const stopMusic = () => {
    if (musicInterval) {
        clearInterval(musicInterval);
        musicInterval = null;
    }
};
