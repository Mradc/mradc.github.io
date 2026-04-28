const AudioContext = window.AudioContext || window.webkitAudioContext;
let actx = null;

export function initAudio() {
    if (!actx) actx = new AudioContext();
    if (actx.state === 'suspended') actx.resume();
}

function playTone(freq, type, duration, vol = 0.1, slide = 0) {
    if (!actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, actx.currentTime);
    if (slide !== 0) {
        osc.frequency.exponentialRampToValueAtTime(freq * slide, actx.currentTime + duration);
    }
    gain.gain.setValueAtTime(vol, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, actx.currentTime + duration);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start();
    osc.stop(actx.currentTime + duration);
}

export const sfx = {
    hit: () => playTone(150, 'square', 0.15, 0.1, 0.5),        // Глухой удар
    crit: () => playTone(80, 'sawtooth', 0.3, 0.2, 0.2),       // Мощный взрыв/крит
    miss: () => playTone(300, 'sine', 0.1, 0.05, 0.8),         // Свист промаха (вжух)
    fire: () => playTone(200, 'square', 0.4, 0.1, 0.1),        // Гудение огня
    thunder: () => playTone(100, 'square', 0.6, 0.2, 0.1),     // Громовой раскат
    coin: () => { 
        playTone(1200, 'sine', 0.1, 0.05);                     // Дзинь (монетка)
        setTimeout(() => playTone(1600, 'sine', 0.2, 0.05), 50); 
    },
    heal: () => { 
        playTone(400, 'sine', 0.1, 0.1);                       // Питье зелья (бульк-бульк)
        setTimeout(() => playTone(600, 'sine', 0.1, 0.1), 100); 
        setTimeout(() => playTone(800, 'sine', 0.3, 0.1), 200); 
    },
    levelup: () => { 
        playTone(440, 'square', 0.2, 0.1);                     // Фанфары левелапа
        setTimeout(() => playTone(554, 'square', 0.2, 0.1), 200);
        setTimeout(() => playTone(659, 'square', 0.5, 0.1), 400);
    }
};
