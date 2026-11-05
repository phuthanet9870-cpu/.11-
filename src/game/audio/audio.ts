// WebAudio sound engine: procedural BGM sequencer, ambient beds and synthesized
// SFX. Everything is generated at runtime, so all audio is original.
import audioJson from '../../data/audio.json';
import { Rng } from '../../core/rng';

type Wave = OscillatorType;
interface TrackDef { tempo: number; root: number; mode: string; progression: number[]; lead: Wave; pad: Wave; bass: Wave; density: number; seed: number }
interface AmbientDef { wind: number; birds: number; crickets: number; drips: number }

const MODES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface Volumes { master: number; music: number; sfx: number; ambient: number }

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private ambient!: GainNode;
  private noiseBuf!: AudioBuffer;
  private trackId: string | null = null;
  private trackTimer: number | null = null;
  private ambientTimer: number | null = null;
  private windNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private volumes: Volumes = { master: 0.8, music: 0.5, sfx: 0.8, ambient: 0.5 };
  private lastSfx = new Map<string, number>();
  enabled = true;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain(); this.music.connect(this.master);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.ambient = this.ctx.createGain(); this.ambient.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.setVolumes(this.volumes);
    if (this.pendingTrack) { const t = this.pendingTrack; this.pendingTrack = null; this.playMusic(t); }
    if (this.pendingAmbient) { const a = this.pendingAmbient; this.pendingAmbient = null; this.playAmbient(a); }
  }

  private pendingTrack: string | null = null;
  private pendingAmbient: string | null = null;

  setVolumes(v: Volumes) {
    this.volumes = { ...v };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.master, t, 0.05);
    this.music.gain.setTargetAtTime(v.music * 0.35, t, 0.05);
    this.sfx.gain.setTargetAtTime(v.sfx * 0.5, t, 0.05);
    this.ambient.gain.setTargetAtTime(v.ambient * 0.4, t, 0.05);
  }

  // ---------------------------------------------------------------- music
  playMusic(trackId: string) {
    if (this.trackId === trackId) return;
    if (!this.ctx) { this.pendingTrack = trackId; return; }
    this.stopMusic();
    const def = (audioJson.tracks as Record<string, TrackDef>)[trackId];
    if (!def) return;
    this.trackId = trackId;
    const scale = MODES[def.mode] ?? MODES.major;
    const rng = new Rng(def.seed);
    const beat = 60 / def.tempo;
    const barBeats = 4;
    // Pre-compose an 8-bar melody so the loop is stable.
    const bars = 8;
    const melody: (number | null)[] = [];
    let deg = 0;
    for (let i = 0; i < bars * 8; i++) {
      if (rng.chance(def.density)) {
        deg = Math.max(-2, Math.min(9, deg + rng.pick([-2, -1, -1, 0, 1, 1, 2, 3])));
        melody.push(deg);
      } else melody.push(null);
    }
    let step = 0;
    let nextTime = this.ctx.currentTime + 0.1;
    const note = (deg: number, octave: number) => {
      const oct = Math.floor(deg / 7);
      const idx = ((deg % 7) + 7) % 7;
      return def.root + 12 * (octave + oct) + scale[idx];
    };
    const schedule = () => {
      if (!this.ctx || this.trackId !== trackId) return;
      while (nextTime < this.ctx.currentTime + 0.25) {
        const bar = Math.floor(step / 8) % bars;
        const chordDeg = def.progression[bar % def.progression.length];
        const eighth = step % 8;
        if (eighth === 0) {
          // Pad chord + bass on each bar.
          for (const d of [0, 2, 4]) this.tone(midiHz(note(chordDeg + d, 0)), nextTime, beat * barBeats * 0.95, def.pad, 0.05, this.music, 0.3);
          this.tone(midiHz(note(chordDeg, -2)), nextTime, beat * 1.8, def.bass, 0.16, this.music, 0.02);
        }
        if (eighth === 4) this.tone(midiHz(note(chordDeg + 4, -2)), nextTime, beat * 1.6, def.bass, 0.12, this.music, 0.02);
        const m = melody[step % melody.length];
        if (m != null) this.tone(midiHz(note(chordDeg + m, 1)), nextTime, beat * 0.45, def.lead, 0.07, this.music, 0.01);
        if (trackId === 'boss_battle' && eighth % 2 === 0) this.noiseHit(nextTime, 0.05, eighth === 0 ? 0.25 : 0.1, 4000, this.music);
        nextTime += beat / 2;
        step++;
      }
    };
    schedule();
    this.trackTimer = window.setInterval(schedule, 100);
  }

  stopMusic() {
    if (this.trackTimer != null) clearInterval(this.trackTimer);
    this.trackTimer = null;
    this.trackId = null;
  }

  // ---------------------------------------------------------------- ambience
  playAmbient(id: string) {
    if (!this.ctx) { this.pendingAmbient = id; return; }
    this.stopAmbient();
    const def = (audioJson.ambient as Record<string, AmbientDef>)[id];
    if (!def) return;
    const ctx = this.ctx;
    if (def.wind > 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const g = ctx.createGain(); g.gain.value = def.wind * 0.25;
      src.connect(f); f.connect(g); g.connect(this.ambient);
      src.start();
      this.windNode = { src, gain: g };
    }
    this.ambientTimer = window.setInterval(() => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      if (Math.random() < def.birds * 0.25) {
        const base = 2200 + Math.random() * 1500;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.chirp(base * (1 + Math.random() * 0.2), t + i * 0.09, 0.07, this.ambient, 0.05);
      }
      if (Math.random() < def.crickets * 0.3) for (let i = 0; i < 4; i++) this.tone(4200, t + i * 0.05, 0.025, 'square', 0.012, this.ambient, 0.002);
      if (Math.random() < def.drips * 0.2) this.chirp(900 + Math.random() * 400, t, 0.05, this.ambient, 0.04);
    }, 700);
  }

  stopAmbient() {
    if (this.ambientTimer != null) clearInterval(this.ambientTimer);
    this.ambientTimer = null;
    if (this.windNode) { try { this.windNode.src.stop(); } catch { /* already stopped */ } this.windNode = null; }
  }

  // ---------------------------------------------------------------- primitives
  private tone(freq: number, at: number, dur: number, wave: Wave, vol: number, out: AudioNode, attack = 0.005, slideTo?: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(out);
    o.start(at); o.stop(at + dur + 0.05);
  }

  private noiseHit(at: number, dur: number, vol: number, cutoff: number, out: AudioNode, type: BiquadFilterType = 'lowpass') {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(at, Math.random()); s.stop(at + dur + 0.02);
  }

  private chirp(freq: number, at: number, dur: number, out: AudioNode, vol: number) {
    this.tone(freq, at, dur, 'sine', vol, out, 0.005, freq * 1.4);
  }

  // ---------------------------------------------------------------- sfx
  play(key: string) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const last = this.lastSfx.get(key) ?? 0;
    if (now - last < 0.04) return; // de-duplicate bursts
    this.lastSfx.set(key, now);
    const o = this.sfx, t = now;
    switch (key) {
      case 'hit': this.noiseHit(t, 0.08, 0.5, 1800, o); this.tone(180, t, 0.08, 'square', 0.12, o, 0.002, 90); break;
      case 'crit': this.noiseHit(t, 0.15, 0.7, 3000, o); this.tone(440, t, 0.15, 'sawtooth', 0.12, o, 0.002, 110); break;
      case 'swing': this.noiseHit(t, 0.09, 0.25, 2500, o, 'bandpass'); break;
      case 'bow': this.tone(600, t, 0.08, 'triangle', 0.12, o, 0.002, 200); this.noiseHit(t, 0.06, 0.15, 4000, o, 'highpass'); break;
      case 'zap': this.tone(900, t, 0.12, 'square', 0.06, o, 0.002, 1600); break;
      case 'monster_attack': this.noiseHit(t, 0.07, 0.3, 900, o); break;
      case 'player_hurt': this.tone(220, t, 0.12, 'square', 0.1, o, 0.002, 140); break;
      case 'monster_death': this.tone(300, t, 0.3, 'triangle', 0.15, o, 0.005, 60); break;
      case 'boss_death': for (let i = 0; i < 5; i++) this.noiseHit(t + i * 0.12, 0.3, 0.6, 600, o); this.tone(110, t, 1.2, 'sawtooth', 0.15, o, 0.01, 40); break;
      case 'pickup': this.tone(880, t, 0.06, 'square', 0.06, o); this.tone(1320, t + 0.05, 0.08, 'square', 0.06, o); break;
      case 'coin': this.tone(1568, t, 0.05, 'square', 0.05, o); this.tone(2093, t + 0.05, 0.1, 'square', 0.05, o); break;
      case 'level_up': [0, 4, 7, 12].forEach((s, i) => this.tone(midiHz(72 + s), t + i * 0.09, 0.3, 'triangle', 0.12, o)); break;
      case 'quest': this.tone(midiHz(79), t, 0.12, 'triangle', 0.1, o); this.tone(midiHz(84), t + 0.1, 0.2, 'triangle', 0.1, o); break;
      case 'quest_complete': [0, 4, 7, 11, 12].forEach((s, i) => this.tone(midiHz(67 + s), t + i * 0.08, 0.35, 'square', 0.06, o)); break;
      case 'cast': this.tone(400, t, 0.4, 'sine', 0.06, o, 0.05, 900); break;
      case 'skill_fire': case 'skill_meteor': this.noiseHit(t, 0.35, 0.5, 1200, o); this.tone(160, t, 0.3, 'sawtooth', 0.08, o, 0.01, 60); break;
      case 'skill_ice': this.tone(1800, t, 0.25, 'sine', 0.08, o, 0.002, 2600); this.noiseHit(t, 0.2, 0.2, 6000, o, 'highpass'); break;
      case 'skill_lightning': this.noiseHit(t, 0.25, 0.7, 5000, o, 'highpass'); this.tone(80, t, 0.3, 'sawtooth', 0.1, o, 0.002); break;
      case 'skill_heal': case 'heal': [0, 7, 12].forEach((s, i) => this.tone(midiHz(76 + s), t + i * 0.06, 0.4, 'sine', 0.07, o)); break;
      case 'skill_holy': case 'skill_arcane': [0, 4, 7].forEach((s, i) => this.tone(midiHz(81 + s), t + i * 0.05, 0.4, 'sine', 0.06, o)); break;
      case 'skill_shout': this.tone(140, t, 0.35, 'sawtooth', 0.12, o, 0.02, 100); break;
      case 'skill_slash': case 'skill_pierce': case 'skill_whirl': this.noiseHit(t, 0.18, 0.5, 2200, o, 'bandpass'); this.tone(300, t, 0.15, 'square', 0.06, o, 0.002, 120); break;
      case 'skill_arrow': case 'skill_arrow_rain': case 'skill_falcon': this.tone(700, t, 0.1, 'triangle', 0.1, o, 0.002, 250); break;
      case 'skill_wind': case 'skill_shadow': this.noiseHit(t, 0.4, 0.3, 1500, o, 'bandpass'); break;
      case 'teleport': this.tone(300, t, 0.6, 'sine', 0.1, o, 0.05, 1200); break;
      case 'death': this.tone(330, t, 0.9, 'triangle', 0.12, o, 0.01, 80); break;
      case 'boss_intro': this.tone(55, t, 1.5, 'sawtooth', 0.18, o, 0.05, 45); this.noiseHit(t, 1.2, 0.4, 300, o); break;
      case 'boss_phase': this.tone(110, t, 0.8, 'square', 0.12, o, 0.02, 220); break;
      case 'boss_slam': this.noiseHit(t, 0.4, 0.9, 400, o); this.tone(70, t, 0.4, 'sine', 0.3, o, 0.002, 35); break;
      case 'telegraph': this.tone(880, t, 0.12, 'square', 0.05, o); this.tone(880, t + 0.18, 0.12, 'square', 0.05, o); break;
      case 'ui_open': this.tone(660, t, 0.05, 'triangle', 0.06, o); break;
      case 'ui_click': this.tone(990, t, 0.03, 'square', 0.04, o); break;
      case 'error': this.tone(200, t, 0.12, 'square', 0.06, o); break;
      case 'equip': this.noiseHit(t, 0.08, 0.3, 3000, o, 'bandpass'); this.tone(500, t, 0.06, 'square', 0.04, o); break;
      case 'learn': this.tone(midiHz(84), t, 0.1, 'triangle', 0.08, o); this.tone(midiHz(88), t + 0.08, 0.15, 'triangle', 0.08, o); break;
      case 'potion': this.tone(500, t, 0.15, 'sine', 0.1, o, 0.01, 900); break;
      case 'footstep': this.noiseHit(t, 0.04, 0.08, 700, o); break;
      default: this.tone(600, t, 0.05, 'triangle', 0.03, o);
    }
  }
}

export const audio = new AudioEngine();
