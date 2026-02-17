// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const videoInput = document.getElementById('videoInput');
const uploadContainer = document.getElementById('uploadContainer');
const videoSection = document.getElementById('videoSection');
const videoPlayer = document.getElementById('videoPlayer');
const animationPreview = document.getElementById('animationPreview');
const loadingOverlay = document.getElementById('loadingOverlay');
const resetSpriteBtn = document.getElementById('resetSpriteBtn');
const clearFramesBtn = document.getElementById('clearFramesBtn');
const previewBtn = document.getElementById('previewBtn');
const generateSpriteBtn = document.getElementById('generateSpriteBtn');
const exportIndividualBtn = document.getElementById('exportIndividualBtn');
const spriteGrid = document.getElementById('spriteGrid');
const navHint = document.getElementById('navHint');
const previewHint = document.getElementById('previewHint');
const fpsDisplay = document.getElementById('fpsDisplay');
const frameCounter = document.getElementById('frameCounter');

// ─── Audio System ──────────────────────────────────────────────────────────
const SFX = {
    cursor:  new Audio('audio/menucursor.wav'),
    select:  new Audio('audio/menuselect.wav'),
    back:    new Audio('audio/menuback.wav'),
    chord:   new Audio('audio/menuchord.wav'),
};
// Allow rapid re-triggering by cloning on each play
function playSfx(name) {
    const snd = SFX[name];
    if (!snd) return;
    const clone = snd.cloneNode();
    clone.volume = snd.volume;
    clone.play().catch(() => {});
}

// State
let spriteSheetFrames = []; 
let impactFrameIndex = -1; 
let isPreviewing = false;
let previewInterval = null;
const VIDEO_NAV_STEP = 1 / 24; 

// Range capture state
let rangeStartTime = null;
let rangeStartIndex = null;
let rangeModeIndicator = null;

// Hold-up range mode state
let upHoldTimer = null;
const UP_HOLD_DELAY = 300; // ms hold before range mode activates

// ─── Seek Mode Config (edit these) ─────────────────────────────────────────
const SEEK_INTERVAL_MS = 100;  // how often (ms) the video jumps in seek mode
const SEEK_PHASES = [
    { step: 1,    label: '1s/step'  },
    { step: 2.5,  label: '2.5s/step' },
    { step: 5,    label: '5s/step'  },
    { step: 10,   label: '10s/step' },
];

// Seek runtime state (don't edit)
let isSeekMode       = false;  // true while Shift is held
let seekPhaseIndex   = 0;      // which SEEK_PHASES entry is active
let seekStepInterval = null;   // interval driving movement
let seekDirection    = 0;      // -1 or +1, set when arrow pressed in seek mode
let seekModeIndicator = null;

// Persistent FPS State
let currentPreviewFps = parseInt(localStorage.getItem('preferredFps')) || 12;

// Drag & Drop Enhancement
uploadZone.addEventListener('click', () => videoInput.click());

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Highlight drop zone when item is dragged over it
['dragenter', 'dragover'].forEach(eventName => {
    uploadZone.addEventListener(eventName, () => {
        uploadZone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, () => {
        uploadZone.classList.remove('dragover');
    }, false);
});

// Handle dropped files
uploadZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        loadVideo(files[0]);
    }
});

videoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadVideo(file);
});

function loadVideo(file) {
    // Animated loading messages
    const loadingText = document.querySelector('.loading-text');
    const loadingSubtext = document.querySelector('.loading-subtext');
    
    const messages = [
        { main: 'INITIALIZING', sub: 'Preparing video stream...' },
        { main: 'LOADING', sub: 'Analyzing video data...' },
        { main: 'PROCESSING', sub: 'Building frame buffer...' }
    ];
    
    loadingText.textContent = messages[0].main;
    loadingSubtext.textContent = messages[0].sub;
    
    let msgIndex = 0;
    const msgInterval = setInterval(() => {
        msgIndex = (msgIndex + 1) % messages.length;
        loadingText.textContent = messages[msgIndex].main;
        loadingSubtext.textContent = messages[msgIndex].sub;
    }, 500);
    
    loadingOverlay.classList.add('active');
    videoPlayer.src = URL.createObjectURL(file);
    
    videoPlayer.addEventListener('loadedmetadata', () => {
        clearInterval(msgInterval);
        
        // Smooth transition
        setTimeout(() => {
            uploadContainer.style.display = 'none';
            videoSection.style.display = 'block';
            resetInternalState();
            
            setTimeout(() => {
                loadingOverlay.classList.remove('active');
            }, 300);
        }, 600);
    }, { once: true });
}

resetSpriteBtn.addEventListener('click', () => {
    playSfx('back');
    
    videoPlayer.src = "";
    spriteSheetFrames = [];
    impactFrameIndex = -1;
    rangeStartTime = null;
    rangeStartIndex = null;
    hideRangeModeIndicator();
    stopPreview();
    
    // Smooth transition back
    videoSection.style.opacity = '0';
    setTimeout(() => {
        uploadContainer.style.display = 'flex';
        videoSection.style.display = 'none';
        videoSection.style.opacity = '1';
    }, 300);
    
    videoInput.value = ""; 
});

// Clear all frames without resetting video
clearFramesBtn.addEventListener('click', () => {
    if (spriteSheetFrames.length === 0) return;
    playSfx('back');
    spriteSheetFrames = [];
    impactFrameIndex = -1;
    rangeStartTime = null;
    rangeStartIndex = null;
    hideRangeModeIndicator();
    stopPreview();
    rebuildSpriteGrid();
    updateUI();
});

// Export each frame as individual PNGs inside a ZIP
exportIndividualBtn.addEventListener('click', async () => {
    if (spriteSheetFrames.length === 0) return;
    
    const loadingText = document.querySelector('.loading-text');
    const loadingSubtext = document.querySelector('.loading-subtext');
    loadingText.textContent = 'ZIPPING';
    loadingSubtext.textContent = `Packing ${spriteSheetFrames.length} frames...`;
    loadingOverlay.classList.add('active');
    
    const ordered = getOrderedFrames();
    const zip = new JSZip();
    
    for (let i = 0; i < ordered.length; i++) {
        const canvas = ordered[i].canvas;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const arrayBuffer = await blob.arrayBuffer();
        const padded = String(i + 1).padStart(3, '0');
        zip.file(`frame_${padded}.png`, arrayBuffer);
        loadingSubtext.textContent = `Packed ${i + 1}/${ordered.length} frames...`;
    }
    
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.download = `frames_${ordered.length}x.zip`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
    playSfx('chord');
    
    loadingText.textContent = 'SUCCESS';
    loadingSubtext.textContent = `${ordered.length} PNGs zipped!`;
    setTimeout(() => loadingOverlay.classList.remove('active'), 800);
});

function getOrderedFrames() {
    if (impactFrameIndex === -1 || impactFrameIndex >= spriteSheetFrames.length) return spriteSheetFrames;
    return [...spriteSheetFrames.slice(impactFrameIndex), ...spriteSheetFrames.slice(0, impactFrameIndex)];
}

// Preview Logic with enhanced transitions
previewBtn.addEventListener('click', () => {
    if (isPreviewing) { playSfx('back'); stopPreview(); }
    else { playSfx('select'); startPreview(); }
});

function startPreview() {
    isPreviewing = true;
    previewBtn.innerHTML = '<span class="btn-icon">◼</span> Back to Video';
    
    // Smooth crossfade
    videoPlayer.style.opacity = '0';
    setTimeout(() => {
        videoPlayer.style.display = "none";
        animationPreview.style.display = "block";
        animationPreview.style.opacity = '0';
        
        setTimeout(() => {
            animationPreview.style.opacity = '1';
        }, 50);
    }, 200);
    
    navHint.style.display = "none";
    previewHint.style.display = "block";
    updateFpsDisplay();
    runAnimationLoop();
}

function runAnimationLoop() {
    clearInterval(previewInterval);
    const ordered = getOrderedFrames();
    let currentIdx = 0;
    const ctx = animationPreview.getContext('2d');
    animationPreview.width = videoPlayer.videoWidth;
    animationPreview.height = videoPlayer.videoHeight;

    // In the ordered array, index 0 is always the impact frame (if set)
    const impactIdxInLoop = (impactFrameIndex !== -1) ? 0 : -1;

    previewInterval = setInterval(() => {
        ctx.drawImage(ordered[currentIdx].canvas, 0, 0);
        if (currentIdx === impactIdxInLoop) {
            playSfx('select');
        }
        currentIdx = (currentIdx + 1) % ordered.length;
    }, 1000 / currentPreviewFps);
}

function stopPreview() {
    isPreviewing = false;
    previewBtn.innerHTML = '<span class="btn-icon">▶</span> Preview Animation';
    clearInterval(previewInterval);
    
    // Smooth crossfade back
    animationPreview.style.opacity = '0';
    setTimeout(() => {
        animationPreview.style.display = "none";
        videoPlayer.style.display = "block";
        videoPlayer.style.opacity = '0';
        
        setTimeout(() => {
            videoPlayer.style.opacity = '1';
        }, 50);
    }, 200);
    
    navHint.style.display = "block";
    previewHint.style.display = "none";
}

function updateFpsDisplay() {
    fpsDisplay.textContent = `${currentPreviewFps} FPS`;
    localStorage.setItem('preferredFps', currentPreviewFps);
    
    // Pulse effect via CSS class
    fpsDisplay.classList.add('fps-flash');
    setTimeout(() => fpsDisplay.classList.remove('fps-flash'), 150);
}

// Global Controls
function showNavArrow(direction) {
    const arrowLeft  = document.getElementById('navArrowLeft');
    const arrowRight = document.getElementById('navArrowRight');

    if (isSeekMode) {
        // In seek mode: persistent double-arrow only on the active direction
        arrowLeft.classList.toggle('seek-hold', direction === 'left');
        arrowRight.classList.toggle('seek-hold', direction === 'right');
        return;
    }

    // Normal mode: snap to full opacity, then fade out
    const arrow = direction === 'left' ? arrowLeft : arrowRight;
    arrow.classList.remove('show');
    arrow.style.opacity = '1';
    arrow.style.animation = 'none';
    // Small delay so the browser paints opacity:1 before starting fade-out
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            arrow.style.animation = '';
            arrow.style.opacity  = '';
            arrow.classList.add('show');
        });
    });
}

function showRangeModeIndicator() {
    if (!rangeModeIndicator) {
        rangeModeIndicator = document.createElement('div');
        rangeModeIndicator.className = 'range-mode-indicator';
        document.body.appendChild(rangeModeIndicator);
    }
    
    const frameCount = spriteSheetFrames.length - rangeStartIndex;
    rangeModeIndicator.innerHTML = `
        ◉ RANGE MODE ACTIVE
        <span class="range-count">${frameCount} frame${frameCount !== 1 ? 's' : ''} selected</span>
    `;
    rangeModeIndicator.style.display = 'block';
}

function hideRangeModeIndicator() {
    if (rangeModeIndicator) {
        rangeModeIndicator.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => {
            rangeModeIndicator.style.display = 'none';
            rangeModeIndicator.style.animation = '';
        }, 200);
    }
}

document.addEventListener('keydown', (e) => {
    if (!videoPlayer.src) return;

    // Enter seek mode when Shift is first pressed
    if ((e.key === 'Shift') && !isSeekMode) {
        isSeekMode = true;
        showSeekModeIndicator();
        // If a direction is already held, switch the running interval to seek speed
        if (seekDirection !== 0) {
            clearInterval(seekStepInterval);
            seekStepInterval = setInterval(() => {
                videoPlayer.currentTime = Math.max(0, Math.min(videoPlayer.duration,
                    videoPlayer.currentTime + seekDirection * SEEK_PHASES[seekPhaseIndex].step));
                playSfx('cursor');
            }, SEEK_INTERVAL_MS);
            showNavArrow(seekDirection === -1 ? 'left' : 'right');
        }
        return;
    }

    // ── Global shortcuts (work everywhere) ───────────────────────────────
    if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        if (isPreviewing) { playSfx('back'); stopPreview(); }
        else if (spriteSheetFrames.length > 0) { playSfx('select'); startPreview(); }
        return;
    }
    if (e.key === 'Backspace' && !e.repeat) {
        e.preventDefault();
        if (spriteSheetFrames.length > 0) {
            if (isPreviewing) stopPreview();
            playSfx('back');
            spriteSheetFrames = [];
            impactFrameIndex = -1;
            rangeStartTime = null;
            rangeStartIndex = null;
            clearTimeout(upHoldTimer);
            upHoldTimer = null;
            hideRangeModeIndicator();
            rebuildSpriteGrid();
            updateUI();
        }
        return;
    }
    if (e.key === 'Escape' && !e.repeat) {
        e.preventDefault();
        resetSpriteBtn.click();
        return;
    }
    if (e.key === 'Enter' && !e.repeat) {
        e.preventDefault();
        if (e.shiftKey) {
            if (!exportIndividualBtn.disabled) exportIndividualBtn.click();
        } else {
            if (!generateSpriteBtn.disabled) generateSpriteBtn.click();
        }
        return;
    }

    if (isPreviewing) {
        // FPS Controls during preview — arrows + QD
        const isLeft  = e.key === 'ArrowLeft'  || e.key === 'q' || e.key === 'Q';
        const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
        if (isLeft) {
            e.preventDefault();
            currentPreviewFps = Math.max(1, currentPreviewFps - 1);
            playSfx('cursor');
            updateFpsDisplay();
            runAnimationLoop();
            showNavArrow('left');
        }
        if (isRight) {
            e.preventDefault();
            currentPreviewFps = Math.min(60, currentPreviewFps + 1);
            playSfx('cursor');
            updateFpsDisplay();
            runAnimationLoop();
            showNavArrow('right');
        }
        return;
    }

    const isLeft  = e.key === 'ArrowLeft'  || e.key === 'q' || e.key === 'Q';
    const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
    const isUp    = e.key === 'ArrowUp'    || e.key === 'z' || e.key === 'Z'
                 || e.key === 'w' || e.key === 'W';
    const isDown  = e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S';

    // ── Seek mode (Shift held) ────────────────────────────────────────────
    if (isSeekMode) {
        if (isLeft || isRight) {
            e.preventDefault();
            if (e.repeat) return; // interval handles movement, ignore repeats
            const dir = isLeft ? -1 : 1;
            seekDirection = dir;
            // step once immediately, then start interval
            videoPlayer.currentTime = Math.max(0, Math.min(videoPlayer.duration,
                videoPlayer.currentTime + dir * SEEK_PHASES[seekPhaseIndex].step));
            showNavArrow(dir === -1 ? 'left' : 'right');
            if (!seekStepInterval) {
                seekStepInterval = setInterval(() => {
                    videoPlayer.currentTime = Math.max(0, Math.min(videoPlayer.duration,
                        videoPlayer.currentTime + seekDirection * SEEK_PHASES[seekPhaseIndex].step));
                    playSfx('cursor');
                }, SEEK_INTERVAL_MS);
            }
        }
        // Up = faster phase, Down = slower phase (arrows AND Z/W/S)
        if (isUp && !e.repeat) {
            e.preventDefault();
            if (seekPhaseIndex < SEEK_PHASES.length - 1) {
                seekPhaseIndex++;
                playSfx('cursor');
                showSeekModeIndicator();
            }
        }
        if (isDown && !e.repeat) {
            e.preventDefault();
            if (seekPhaseIndex > 0) {
                seekPhaseIndex--;
                playSfx('cursor');
                showSeekModeIndicator();
            }
        }
        return;
    }

    // ── Normal mode ───────────────────────────────────────────────────────
    if (isLeft) {
        e.preventDefault();
        if (!e.repeat) {
            clearInterval(seekStepInterval);
            seekStepInterval = null;
            document.getElementById('navArrowRight').classList.remove('show');
            videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - VIDEO_NAV_STEP);
            playSfx('cursor');
            showNavArrow('left');
            seekDirection = -1;
            seekStepInterval = setInterval(() => {
                videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - VIDEO_NAV_STEP);
                playSfx('cursor');
                showNavArrow('left');
            }, SEEK_INTERVAL_MS);
        }
    }
    if (isRight) {
        e.preventDefault();
        if (!e.repeat) {
            clearInterval(seekStepInterval);
            seekStepInterval = null;
            document.getElementById('navArrowLeft').classList.remove('show');
            videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + VIDEO_NAV_STEP);
            playSfx('cursor');
            showNavArrow('right');
            seekDirection = 1;
            seekStepInterval = setInterval(() => {
                videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + VIDEO_NAV_STEP);
                playSfx('cursor');
                showNavArrow('right');
            }, SEEK_INTERVAL_MS);
        }
    }
    if (isDown && !e.repeat) {
        e.preventDefault();
        // Delete the most recent frame
        if (spriteSheetFrames.length > 0) {
            const idx = spriteSheetFrames.length - 1;
            spriteSheetFrames.splice(idx, 1);
            if (impactFrameIndex === idx) impactFrameIndex = -1;
            else if (impactFrameIndex > idx) impactFrameIndex--;
            playSfx('back');
            rebuildSpriteGrid();
            updateUI();
        }
    }
    if (isUp && !e.repeat) {
        e.preventDefault();
        // Tap: capture one frame immediately
        playSfx('select');
        captureCurrentFrame();
        // Start hold timer for range mode
        upHoldTimer = setTimeout(() => {
            upHoldTimer = null;
            // Enter range mode: the frame we just captured is frame 0 of the range
            rangeStartTime = videoPlayer.currentTime;
            rangeStartIndex = spriteSheetFrames.length - 1;
            showRangeModeIndicator();
        }, UP_HOLD_DELAY);
    }
});

document.addEventListener('keyup', (e) => {
    // Up released — cancel hold timer or commit range if active
    if (!isPreviewing && (e.key === 'ArrowUp' || e.key === 'z' || e.key === 'Z'
                       || e.key === 'w' || e.key === 'W')) {
        if (upHoldTimer !== null) {
            // Released before range mode kicked in — just the tap capture, nothing else
            clearTimeout(upHoldTimer);
            upHoldTimer = null;
        } else if (rangeStartTime !== null) {
            // Released after range mode was active — capture the range
            const endTime = videoPlayer.currentTime;
            const startTime = rangeStartTime;
            playSfx('select');
            if (endTime > startTime) {
                captureRangeFrames(startTime, endTime);
            }
            rangeStartTime = null;
            rangeStartIndex = null;
            setTimeout(() => hideRangeModeIndicator(), 300);
        }
    }

    // Exit seek mode when Shift is released
    if (e.key === 'Shift' && isSeekMode) {
        isSeekMode = false;
        clearInterval(seekStepInterval);
        seekStepInterval = null;
        seekDirection = 0;
        hideSeekModeIndicator();
        document.getElementById('navArrowLeft').classList.remove('seek-hold');
        document.getElementById('navArrowRight').classList.remove('seek-hold');
        return;
    }

    // Stop interval when directional key is released (both normal and seek mode)
    if (isSeekMode) {
        const isLeft  = e.key === 'ArrowLeft'  || e.key === 'q' || e.key === 'Q';
        const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
        if (isLeft || isRight) {
            clearInterval(seekStepInterval);
            seekStepInterval = null;
            seekDirection = 0;
            document.getElementById('navArrowLeft').classList.remove('seek-hold');
            document.getElementById('navArrowRight').classList.remove('seek-hold');
        }
    } else {
        const isLeft  = e.key === 'ArrowLeft'  || e.key === 'q' || e.key === 'Q';
        const isRight = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
        if (isLeft || isRight) {
            clearInterval(seekStepInterval);
            seekStepInterval = null;
            seekDirection = 0;
        }
    }
});

function showSeekModeIndicator() {
    if (!seekModeIndicator) {
        seekModeIndicator = document.createElement('div');
        seekModeIndicator.className = 'seek-mode-indicator';
        document.body.appendChild(seekModeIndicator);
    }
    const label = SEEK_PHASES[seekPhaseIndex]?.label ?? '';
    seekModeIndicator.textContent = `⏩ SEEK — ${label}`;
    seekModeIndicator.style.display = 'block';
    seekModeIndicator.style.animation = 'none';
}

function hideSeekModeIndicator() {
    if (seekModeIndicator) {
        seekModeIndicator.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => {
            if (seekModeIndicator) seekModeIndicator.style.display = 'none';
            if (seekModeIndicator) seekModeIndicator.style.animation = '';
        }, 200);
    }
}

function captureCurrentFrame() {
    const canvas = document.createElement('canvas');
    canvas.width = videoPlayer.videoWidth;
    canvas.height = videoPlayer.videoHeight;
    canvas.getContext('2d').drawImage(videoPlayer, 0, 0);
    spriteSheetFrames.push({ canvas });
    
    // Haptic-like feedback via CSS class
    videoPlayer.classList.add('capture-flash');
    setTimeout(() => videoPlayer.classList.remove('capture-flash'), 100);
    
    rebuildSpriteGrid();
    updateUI();
    
    // Auto-scroll to newest frame
    setTimeout(() => {
        const container = document.querySelector('.sprite-grid-container');
        container.scrollLeft = container.scrollWidth;
    }, 50);
}

async function captureRangeFrames(startTime, endTime) {
    const timeDiff = endTime - startTime;
    const framesToCapture = Math.ceil(timeDiff * 24); // 24 fps
    
    // Show loading feedback
    const loadingText = document.querySelector('.loading-text');
    const loadingSubtext = document.querySelector('.loading-subtext');
    loadingText.textContent = 'CAPTURING';
    loadingSubtext.textContent = `Extracting ${framesToCapture} frames...`;
    loadingOverlay.classList.add('active');
    
    const originalTime = videoPlayer.currentTime;
    
    // Capture each frame
    for (let i = 1; i <= framesToCapture; i++) {
        const frameTime = startTime + (i * timeDiff / framesToCapture);
        
        // Seek to frame
        videoPlayer.currentTime = frameTime;
        
        // Wait for seek to complete
        await new Promise(resolve => {
            const onSeeked = () => {
                videoPlayer.removeEventListener('seeked', onSeeked);
                resolve();
            };
            videoPlayer.addEventListener('seeked', onSeeked);
        });
        
        // Small delay to ensure frame is ready
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Capture the frame
        const canvas = document.createElement('canvas');
        canvas.width = videoPlayer.videoWidth;
        canvas.height = videoPlayer.videoHeight;
        canvas.getContext('2d').drawImage(videoPlayer, 0, 0);
        spriteSheetFrames.push({ canvas });
        
        // Update UI periodically
        if (i % 5 === 0 || i === framesToCapture) {
            loadingSubtext.textContent = `Captured ${i}/${framesToCapture} frames...`;
            rebuildSpriteGrid();
            updateUI();
        }
    }
    
    // Final UI update
    rebuildSpriteGrid();
    updateUI();
    
    // Auto-scroll to newest frames
    setTimeout(() => {
        const container = document.querySelector('.sprite-grid-container');
        container.scrollLeft = container.scrollWidth;
    }, 50);
    
    // Return to original time
    videoPlayer.currentTime = originalTime;
    
    // Hide loading
    loadingText.textContent = 'COMPLETE';
    loadingSubtext.textContent = `${framesToCapture} frames captured!`;
    setTimeout(() => {
        loadingOverlay.classList.remove('active');
    }, 600);
}

function rebuildSpriteGrid() {
    // Clear grid but keep empty state if needed
    if (spriteSheetFrames.length === 0) {
        spriteGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">◇</div>
                <div class="empty-text">No frames yet</div>
                <div class="empty-hint">Capture frames from the video above</div>
            </div>
        `;
        return;
    }
    
    spriteGrid.innerHTML = '';
    spriteSheetFrames.forEach((frameObj, index) => {
        const slot = document.createElement('div');
        slot.className = `sprite-slot filled ${index === impactFrameIndex ? 'impact-frame' : ''}`;
        
        // Delete button
        const del = document.createElement('div');
        del.className = 'delete-btn'; 
        del.textContent = '✕';
        del.title = 'Delete frame';
        del.onclick = (e) => {
            e.stopPropagation();
            
            // Animate out via CSS class
            slot.classList.add('slot-removing');
            
            setTimeout(() => {
                spriteSheetFrames.splice(index, 1);
                if (impactFrameIndex === index) impactFrameIndex = -1;
                else if (impactFrameIndex > index) impactFrameIndex--;
                rebuildSpriteGrid();
                updateUI();
            }, 200);
        };

        // Frame number badge
        const badge = document.createElement('div');
        badge.className = 'sprite-slot-number';
        badge.textContent = index + 1;

        // Display canvas
        const displayCanvas = document.createElement('canvas');
        displayCanvas.width = frameObj.canvas.width;
        displayCanvas.height = frameObj.canvas.height;
        displayCanvas.getContext('2d').drawImage(frameObj.canvas, 0, 0);
        
        // Click to set impact frame
        slot.onclick = () => { 
            impactFrameIndex = index; 
            rebuildSpriteGrid();
            
            // Scroll to impact frame
            setTimeout(() => {
                slot.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }, 50);
        };
        
        slot.appendChild(del); 
        slot.appendChild(badge);
        slot.appendChild(displayCanvas);
        spriteGrid.appendChild(slot);
        
        // Stagger animation
        slot.style.animationDelay = `${index * 0.05}s`;
    });
}

function updateUI() {
    const hasFrames = spriteSheetFrames.length > 0;
    const isSingle = spriteSheetFrames.length === 1;
    generateSpriteBtn.disabled = !hasFrames;
    previewBtn.disabled = !hasFrames;
    clearFramesBtn.disabled = !hasFrames;
    exportIndividualBtn.disabled = !hasFrames;
    
    // Update generate button label
    if (isSingle) {
        generateSpriteBtn.innerHTML = '<span class="btn-icon">↓</span> Save Screenshot';
    } else {
        generateSpriteBtn.innerHTML = '<span class="btn-icon">↓</span> Generate Sheet';
    }
    
    // Update frame counter with animation
    const newCount = `${spriteSheetFrames.length} frame${spriteSheetFrames.length !== 1 ? 's' : ''}`;
    if (frameCounter.textContent !== newCount) {
        frameCounter.textContent = newCount;
        frameCounter.classList.toggle('has-frames', hasFrames);
        frameCounter.classList.add('badge-pop');
        setTimeout(() => frameCounter.classList.remove('badge-pop'), 150);
    }
}

function resetInternalState() {
    spriteSheetFrames = []; 
    impactFrameIndex = -1;
    rangeStartTime = null;
    rangeStartIndex = null;
    clearTimeout(upHoldTimer);
    upHoldTimer = null;
    stopPreview(); 
    rebuildSpriteGrid(); 
    updateUI();
}

function generateSpriteSheet() {
    // Show loading briefly
    const loadingText = document.querySelector('.loading-text');
    const loadingSubtext = document.querySelector('.loading-subtext');
    loadingOverlay.classList.add('active');
    
    const ordered = getOrderedFrames();
    const isSingle = ordered.length === 1;
    
    if (isSingle) {
        loadingText.textContent = 'EXPORTING';
        loadingSubtext.textContent = 'Saving screenshot...';
    } else {
        loadingText.textContent = 'GENERATING';
        loadingSubtext.textContent = 'Creating sprite sheet...';
    }
    
    setTimeout(() => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const fw = ordered[0].canvas.width;
        const fh = ordered[0].canvas.height;
        
        if (isSingle) {
            // Pure single screenshot — no sheet
            canvas.width = fw;
            canvas.height = fh;
            ctx.drawImage(ordered[0].canvas, 0, 0);
        } else {
            // Sprite sheet: max 5 per row, each new row after every 5 frames
            const cols = Math.min(5, ordered.length);
            const rows = Math.ceil(ordered.length / 5);
            canvas.width = fw * cols;
            canvas.height = fh * rows;

            ordered.forEach((f, i) => {
                const col = i % 5;
                const row = Math.floor(i / 5);
                ctx.drawImage(f.canvas, col * fw, row * fh);
            });
        }

        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            if (isSingle) {
                link.download = `screenshot_frame.png`;
            } else {
                link.download = `spritesheet_${ordered.length}frames_${currentPreviewFps}fps.png`;
            }
            link.href = url;
            link.click();
            playSfx('chord');
            
            // Cleanup
            setTimeout(() => URL.revokeObjectURL(url), 100);
            
            // Success feedback
            loadingText.textContent = 'SUCCESS';
            loadingSubtext.textContent = isSingle ? 'Screenshot downloaded!' : 'Sprite sheet downloaded!';
            
            setTimeout(() => {
                loadingOverlay.classList.remove('active');
            }, 800);
        }, 'image/png');
    }, 300);
}

generateSpriteBtn.addEventListener('click', generateSpriteSheet);

// Initialize
updateUI();