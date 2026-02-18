// hub-audio.js — shared sound system for all hub tools
// Uses the same SFX as the keyframe extractor (script.js)

const HubAudio = (() => {
    const SFX = {
        cursor:  new Audio('audio/menucursor.wav'),
        select:  new Audio('audio/menuselect.wav'),
        back:    new Audio('audio/menuback.wav'),
        chord:   new Audio('audio/menuchord.wav'),
    };

    // Clone on each play so rapid-fire calls never get cut off
    function play(name) {
        const snd = SFX[name];
        if (!snd) return;
        const clone = snd.cloneNode();
        clone.volume = snd.volume;
        clone.play().catch(() => {});
    }

    return { play };
})();
