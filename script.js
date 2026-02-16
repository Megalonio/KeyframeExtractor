// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const videoInput = document.getElementById('videoInput');
const uploadContainer = document.getElementById('uploadContainer');
const videoSection = document.getElementById('videoSection');
const videoPlayer = document.getElementById('videoPlayer');
const animationPreview = document.getElementById('animationPreview');
const loadingOverlay = document.getElementById('loadingOverlay');
const resetSpriteBtn = document.getElementById('resetSpriteBtn');
const previewBtn = document.getElementById('previewBtn');
const generateSpriteBtn = document.getElementById('generateSpriteBtn');
const spriteGrid = document.getElementById('spriteGrid');
const navHint = document.getElementById('navHint');
const previewHint = document.getElementById('previewHint');
const fpsDisplay = document.getElementById('fpsDisplay');
const frameCounter = document.getElementById('frameCounter');

// State
let spriteSheetFrames = []; 
let impactFrameIndex = -1; 
let isPreviewing = false;
let previewInterval = null;
const VIDEO_NAV_STEP = 1 / 24; 

// Persistent FPS State
let currentPreviewFps = parseInt(localStorage.getItem('preferredFps')) || 12;

// Session Upload
uploadZone.addEventListener('click', () => videoInput.click());
videoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadVideo(file);
});

function loadVideo(file) {
    loadingOverlay.classList.add('active');
    videoPlayer.src = URL.createObjectURL(file);
    videoPlayer.addEventListener('loadedmetadata', () => {
        uploadContainer.style.display = 'none';
        videoSection.style.display = 'block';
        resetInternalState();
        setTimeout(() => loadingOverlay.classList.remove('active'), 1000);
    }, { once: true });
}

resetSpriteBtn.addEventListener('click', () => {
    videoPlayer.src = "";
    spriteSheetFrames = [];
    impactFrameIndex = -1;
    stopPreview();
    uploadContainer.style.display = 'flex';
    videoSection.style.display = 'none';
    videoInput.value = ""; 
});

function getOrderedFrames() {
    if (impactFrameIndex === -1 || impactFrameIndex >= spriteSheetFrames.length) return spriteSheetFrames;
    return [...spriteSheetFrames.slice(impactFrameIndex), ...spriteSheetFrames.slice(0, impactFrameIndex)];
}

// Preview Logic
previewBtn.addEventListener('click', () => {
    if (isPreviewing) stopPreview();
    else startPreview();
});

function startPreview() {
    isPreviewing = true;
    previewBtn.textContent = "Back to Video";
    videoPlayer.style.display = "none";
    animationPreview.style.display = "block";
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

    previewInterval = setInterval(() => {
        ctx.drawImage(ordered[currentIdx].canvas, 0, 0);
        currentIdx = (currentIdx + 1) % ordered.length;
    }, 1000 / currentPreviewFps);
}

function stopPreview() {
    isPreviewing = false;
    previewBtn.textContent = "Preview Animation";
    clearInterval(previewInterval);
    videoPlayer.style.display = "block";
    animationPreview.style.display = "none";
    navHint.style.display = "block";
    previewHint.style.display = "none";
}

function updateFpsDisplay() {
    fpsDisplay.textContent = `${currentPreviewFps} FPS`;
    localStorage.setItem('preferredFps', currentPreviewFps);
}

// Global Controls
document.addEventListener('keydown', (e) => {
    if (!videoPlayer.src) return;

    if (isPreviewing) {
        // FPS Controls during preview
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            currentPreviewFps = Math.max(1, currentPreviewFps - 1);
            updateFpsDisplay();
            runAnimationLoop(); // Restart loop with new speed
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            currentPreviewFps = Math.min(60, currentPreviewFps + 1);
            updateFpsDisplay();
            runAnimationLoop();
        }
        return;
    }
    
    // Video controls
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - VIDEO_NAV_STEP);
    }
    if (e.key === 'ArrowRight') {
        e.preventDefault();
        videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + VIDEO_NAV_STEP);
    }
    if (e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        captureCurrentFrame();
    }
});

function captureCurrentFrame() {
    const canvas = document.createElement('canvas');
    canvas.width = videoPlayer.videoWidth;
    canvas.height = videoPlayer.videoHeight;
    canvas.getContext('2d').drawImage(videoPlayer, 0, 0);
    spriteSheetFrames.push({ canvas });
    rebuildSpriteGrid();
    updateUI();
}

function rebuildSpriteGrid() {
    spriteGrid.innerHTML = '';
    spriteSheetFrames.forEach((frameObj, index) => {
        const slot = document.createElement('div');
        slot.className = `sprite-slot filled ${index === impactFrameIndex ? 'impact-frame' : ''}`;
        
        const del = document.createElement('div');
        del.className = 'delete-btn'; del.innerHTML = '&times;';
        del.onclick = (e) => {
            e.stopPropagation();
            spriteSheetFrames.splice(index, 1);
            if (impactFrameIndex === index) impactFrameIndex = -1;
            else if (impactFrameIndex > index) impactFrameIndex--;
            rebuildSpriteGrid();
            updateUI();
        };

        const displayCanvas = document.createElement('canvas');
        displayCanvas.width = frameObj.canvas.width;
        displayCanvas.height = frameObj.canvas.height;
        displayCanvas.getContext('2d').drawImage(frameObj.canvas, 0, 0);
        
        slot.onclick = () => { impactFrameIndex = index; rebuildSpriteGrid(); };
        slot.appendChild(del); slot.appendChild(displayCanvas);
        spriteGrid.appendChild(slot);
    });
}

function updateUI() {
    const hasFrames = spriteSheetFrames.length > 0;
    generateSpriteBtn.disabled = !hasFrames;
    previewBtn.disabled = !hasFrames;
    frameCounter.textContent = `${spriteSheetFrames.length} frames`;
}

function resetInternalState() {
    spriteSheetFrames = []; impactFrameIndex = -1;
    stopPreview(); rebuildSpriteGrid(); updateUI();
}

function generateSpriteSheet() {
    const ordered = getOrderedFrames();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fw = ordered[0].canvas.width;
    const fh = ordered[0].canvas.height;
    
    let cols = Math.ceil(Math.sqrt(ordered.length * 1.5));
    let rows = Math.ceil(ordered.length / cols);
    canvas.width = fw * cols; canvas.height = fh * rows;

    ordered.forEach((f, i) => {
        ctx.drawImage(f.canvas, (i % cols) * fw, Math.floor(i / cols) * fh);
    });

    const link = document.createElement('a');
    link.download = `spritesheet_${currentPreviewFps}fps.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

generateSpriteBtn.addEventListener('click', generateSpriteSheet);