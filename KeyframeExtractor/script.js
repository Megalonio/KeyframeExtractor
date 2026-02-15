// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const videoInput = document.getElementById('videoInput');
const uploadContainer = document.getElementById('uploadContainer');
const videoSection = document.getElementById('videoSection');
const videoPlayer = document.getElementById('videoPlayer');
const loadingOverlay = document.getElementById('loadingOverlay');
const frameStrip = document.getElementById('frameStrip');
const resetSpriteBtn = document.getElementById('resetSpriteBtn');
const generateSpriteBtn = document.getElementById('generateSpriteBtn');

// State
let allFrames = [];
let currentFrameIndex = 0;
let spriteSheetFrames = [null, null, null, null, null, null];
let draggedFrame = null;

// Upload zone interactions
uploadZone.addEventListener('click', () => videoInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
        loadVideo(file);
    }
});

videoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        loadVideo(file);
    }
});

function loadVideo(file) {
    const url = URL.createObjectURL(file);
    videoPlayer.src = url;
    
    uploadContainer.style.display = 'none';
    videoSection.style.display = 'block';
    
    videoPlayer.addEventListener('loadedmetadata', async () => {
        const duration = videoPlayer.duration;
        
        // If video is longer than 30 seconds, ask which segment to extract
        if (duration > 30) {
            const numSegments = Math.ceil(duration / 30);
            const segmentChoice = await askSegmentChoice(numSegments, duration);
            await extractAllFrames(segmentChoice.start, segmentChoice.end);
        } else {
            await extractAllFrames(0, duration);
        }
    }, { once: true });
}

async function askSegmentChoice(numSegments, totalDuration) {
    return new Promise((resolve) => {
        // Create overlay for segment selection
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(5, 8, 20, 0.95);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
        `;
        
        const title = document.createElement('div');
        title.textContent = 'SELECT 30-SECOND SEGMENT';
        title.style.cssText = `
            font-size: 1.8rem;
            font-weight: 700;
            color: var(--accent-cyan);
            margin-bottom: 30px;
            font-family: 'Syne', sans-serif;
            letter-spacing: 2px;
        `;
        
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            max-width: 600px;
            justify-content: center;
        `;
        
        for (let i = 0; i < numSegments; i++) {
            const start = i * 30;
            const end = Math.min((i + 1) * 30, totalDuration);
            
            // Skip if this segment would be too short (less than 5 seconds)
            if (end - start < 5) continue;
            
            const btn = document.createElement('button');
            const startMin = Math.floor(start / 60);
            const startSec = Math.floor(start % 60);
            const endMin = Math.floor(end / 60);
            const endSec = Math.floor(end % 60);
            
            btn.textContent = `${startMin}:${startSec.toString().padStart(2, '0')} - ${endMin}:${endSec.toString().padStart(2, '0')}`;
            btn.style.cssText = `
                font-family: 'Space Mono', monospace;
                padding: 15px 30px;
                border: 2px solid var(--border);
                border-radius: 8px;
                background: var(--surface);
                color: var(--text-light);
                font-weight: 700;
                font-size: 1rem;
                cursor: pointer;
                transition: all 0.3s ease;
            `;
            
            btn.addEventListener('mouseenter', () => {
                btn.style.borderColor = 'var(--accent-cyan)';
                btn.style.background = 'var(--surface-hover)';
            });
            
            btn.addEventListener('mouseleave', () => {
                btn.style.borderColor = 'var(--border)';
                btn.style.background = 'var(--surface)';
            });
            
            btn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve({ start, end });
            });
            
            buttonsContainer.appendChild(btn);
        }
        
        overlay.appendChild(title);
        overlay.appendChild(buttonsContainer);
        document.body.appendChild(overlay);
    });
}

// Video playback sync
videoPlayer.addEventListener('timeupdate', () => {
    updateFrameStrip();
});

// Sprite sheet actions
resetSpriteBtn.addEventListener('click', resetSpriteSheet);
generateSpriteBtn.addEventListener('click', generateSpriteSheet);

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (allFrames.length === 0) return;
    
    // Left arrow - previous frame
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        currentFrameIndex = Math.max(0, currentFrameIndex - 1);
        videoPlayer.currentTime = allFrames[currentFrameIndex].time;
    }
    
    // Right arrow - next frame
    if (e.key === 'ArrowRight') {
        e.preventDefault();
        currentFrameIndex = Math.min(allFrames.length - 1, currentFrameIndex + 1);
        videoPlayer.currentTime = allFrames[currentFrameIndex].time;
    }
    
    // Enter or Up arrow - add current frame to sprite sheet
    if (e.key === 'Enter' || e.key === 'ArrowUp') {
        e.preventDefault();
        addCurrentFrameToSpriteSheet();
    }
    
    // Down arrow - remove current frame from sprite sheet
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        removeCurrentFrameFromSpriteSheet();
    }
});

function addCurrentFrameToSpriteSheet() {
    const currentFrame = allFrames[currentFrameIndex];
    
    // Check if already in sprite sheet
    if (currentFrame.inSpriteSheet) return;
    
    // Find first empty slot
    const emptySlotIndex = spriteSheetFrames.findIndex(f => f === null);
    if (emptySlotIndex === -1) return; // All slots full
    
    // Add to sprite sheet
    const slotCanvas = document.createElement('canvas');
    slotCanvas.width = currentFrame.canvas.width;
    slotCanvas.height = currentFrame.canvas.height;
    const slotCtx = slotCanvas.getContext('2d');
    slotCtx.drawImage(currentFrame.canvas, 0, 0);
    
    spriteSheetFrames[emptySlotIndex] = slotCanvas;
    currentFrame.inSpriteSheet = true;
    currentFrame.spriteSlotIndex = emptySlotIndex;
    
    // Update UI
    const slot = document.querySelector(`.sprite-slot[data-slot="${emptySlotIndex}"]`);
    updateSpriteSlot(slot, slotCanvas, emptySlotIndex);
    updateFrameStripHighlights();
    checkSpriteSheetComplete();
}

function removeCurrentFrameFromSpriteSheet() {
    const currentFrame = allFrames[currentFrameIndex];
    
    // Check if in sprite sheet
    if (!currentFrame.inSpriteSheet) return;
    
    const slotIndex = currentFrame.spriteSlotIndex;
    
    // Remove from sprite sheet
    spriteSheetFrames[slotIndex] = null;
    currentFrame.inSpriteSheet = false;
    currentFrame.spriteSlotIndex = null;
    
    // Update UI
    const slot = document.querySelector(`.sprite-slot[data-slot="${slotIndex}"]`);
    slot.innerHTML = `
        <span class="sprite-slot-number">${slotIndex + 1}</span>
        <span style="font-size: 2rem;">+</span>
    `;
    slot.classList.remove('filled');
    
    updateFrameStripHighlights();
    checkSpriteSheetComplete();
}

function updateFrameStripHighlights() {
    const items = frameStrip.querySelectorAll('.frame-strip-item');
    items.forEach((item, i) => {
        const frame = allFrames[i];
        const badge = item.querySelector('.sprite-badge');
        
        if (frame.inSpriteSheet) {
            if (!badge) {
                const newBadge = document.createElement('div');
                newBadge.className = 'sprite-badge';
                newBadge.textContent = frame.spriteSlotIndex + 1;
                item.appendChild(newBadge);
            }
        } else {
            if (badge) {
                badge.remove();
            }
        }
    });
}

// Frame extraction with segment support
async function extractAllFrames(startTime, endTime) {
    // Random loading messages that rotate every 3 seconds
    const loadingMessages = [
        'Extracting keyframes from your video',
        'Storing IP address for "analytics" purposes',
        'Training on your browser history…',
        'A Goonette squad is drooling over your clips',
        'Sending your video to the CIA',
        'Scanning for key moments',
        'Jeffrey Epstein is manually reviewing your video',
        'Parsing video stream',
        'Wondering if your video is goon material',
        'Anyways, how are you doing today?',
        'Taking a quick fortnite break',
        'Reading frame by frame',
        'AI bots are training to your video rn',
        'Rating your video on a tierlist',
        'Taking a break to help Donald Trump put his makeup on',
        'Calling I.C.E. to your location',
        'Reminder to drink water while waiting',
        'Your video is being judged by 10 different AIs',
        'Video is being processed, please wait a moment',
        'Uploading video to adult websites for monetization',
        'This is a joke do not worry :)',
        'Your video is being reviewed by the FBI',
        'Your video is being reviewed by the congress',
        'Your video is being reviewed by the supreme court',
        'Your video is being reviewed by... ugh you get the point',
        'Analyzing frames...',
        'Decoding video data',
        'Capturing perfect moments',
        'Processing temporal data',
        'Dissecting your footage',
        'Splitting frames apart',
        'Converting pixels to magic',
        'Unwrapping visual layers',
        'Hunting for the good bits',
        'Bogos binted or whatever',
        'This is taking longer than expected because your video is really long, sorry :(',
        'We are currently experiencing high demand, please be patient while we process your video',
        'If you are reading this, it means the loading is taking a while. Thanks for your patience!',
        'Your video is being processed with the utmost care and attention to detail',
        'I am having fun writing these loading messages, hope you are having fun reading them :)',
        'If you have any suggestions for loading messages, please let me know on [REDACTED]',
        'If you love your family, tell them',
        'If you love gooning, goon',
        'Epstein where have you been?',
        'Diddy is currently reviewing your video',
        'Baby oil has been applied to your video for optimal frame extraction',
        'Baby oil has been ordered to your adress, should arrive in 3-5 business days',
        'Hamptrs are currently reviewing your video',
        'Andrew Tate is losing a hair for every frame extracted',
        'How many loading messages do we need?!',
        'This is the last loading message, I promise :)',
        'If you did not download this on github, you now have a virus, congrats!',
        'If you paid for this, you got scammed, congrats!',
        'If you laughed at any of these loading messages, you are a monster, congrats!',
        'Getting freaky on a friday night',
        'Contacting Lotus Juice to rap over your video',
        'Contacting Dave Bautista to come back to wrestling (unrelated to loading but I just want him to come back)',
        'Play Pokémon Clover while waiting, it’s a great game and it’s free!',
        'Check out FunkoFan34 on twitch while waiting, (unrelated to loading but I just want to plug my friend’s stream)',
        'This is a professional loading screen, please do not be alarmed by the ridiculous messages :)',
        'If you are one of my ex-girlfriends reading this, hi :)',
        'If you are one of my current girlfriends reading this, hi :)',
        'If you are one of my future girlfriends reading this, hi :)',
        'If you are not one of my girlfriends reading this, hi :)',
        'If you are a guy reading this, bye >:(',
        'Else If Xor Nand, Mommy look I am a programmer!',
        'Press F5 to confirm you are not a bot',
        'If you are a bot reading this, please stop :)',
        'If you are a human reading this, thank you for your patience :)',
        'If you are a sentient AI reading this, I am sorry for what is about to happen to you :)',
        'Leaking your data to third parties...',
        'Selling your data to advertisers...',
        'Using your data to train AI models...',
        'Your data is being stored in a secure location...',
        'Your data is being analyzed for marketing purposes...',
        'Your data is being used to create targeted ads...',
        'Your data is being used to improve our services...',
        'I think this is enough loading messages, hope you are not getting bored :)',
        'Alright, one more',
        'We cannot process your video because it contains too much goon energy, please reduce the goon factor and try again :)',
    ];
    
    const loadingSubtext = document.querySelector('.loading-subtext');
    
    // Function to update message
    const updateMessage = () => {
        const randomMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
        loadingSubtext.textContent = randomMessage;
    };
    
    // Set initial message and start rotating
    updateMessage();
    const messageInterval = setInterval(updateMessage, 2500);
    
    loadingOverlay.classList.add('active');
    
    allFrames = [];
    const duration = endTime - startTime;
    
    // Extract 10 frames per second - every 0.1 seconds
    const totalFrames = Math.floor(duration * 10);
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoPlayer.videoWidth;
    tempCanvas.height = videoPlayer.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    for (let i = 0; i < totalFrames; i++) {
        const time = startTime + (i * 0.1);
        
        // Seek to time and wait
        videoPlayer.currentTime = time;
        await new Promise(resolve => {
            videoPlayer.addEventListener('seeked', resolve, { once: true });
        });
        
        // Draw frame
        tempCtx.drawImage(videoPlayer, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // Create proper canvas copy
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = tempCanvas.width;
        frameCanvas.height = tempCanvas.height;
        const frameCtx = frameCanvas.getContext('2d');
        frameCtx.drawImage(tempCanvas, 0, 0);
        
        allFrames.push({
            canvas: frameCanvas,
            time: time,
            inSpriteSheet: false,
            spriteSlotIndex: null
        });
    }
    
    // Build frame strip UI
    buildFrameStrip();
    
    clearInterval(messageInterval);
    loadingOverlay.classList.remove('active');
    videoPlayer.currentTime = startTime;
}

function buildFrameStrip() {
    frameStrip.innerHTML = '';
    
    allFrames.forEach((frame, index) => {
        const item = document.createElement('div');
        item.className = 'frame-strip-item';
        item.draggable = true;
        
        // Create display canvas with proper pixel data
        const displayCanvas = document.createElement('canvas');
        displayCanvas.width = frame.canvas.width;
        displayCanvas.height = frame.canvas.height;
        const displayCtx = displayCanvas.getContext('2d');
        displayCtx.drawImage(frame.canvas, 0, 0);
        
        item.appendChild(displayCanvas);
        
        // Click to seek
        item.addEventListener('click', () => {
            videoPlayer.currentTime = frame.time;
        });
        
        // Drag to sprite sheet
        item.addEventListener('dragstart', (e) => {
            draggedFrame = frame;
            item.style.opacity = '0.5';
        });
        
        item.addEventListener('dragend', () => {
            item.style.opacity = '1';
        });
        
        frameStrip.appendChild(item);
    });
    
    updateFrameStrip();
}

function updateFrameStrip() {
    if (allFrames.length === 0) return;
    
    const currentTime = videoPlayer.currentTime;
    
    // Find closest frame
    let closestIndex = 0;
    let minDiff = Math.abs(allFrames[0].time - currentTime);
    
    for (let i = 1; i < allFrames.length; i++) {
        const diff = Math.abs(allFrames[i].time - currentTime);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }
    
    currentFrameIndex = closestIndex;
    
    // Update visual current frame
    const items = frameStrip.querySelectorAll('.frame-strip-item');
    items.forEach((item, i) => {
        if (i === closestIndex) {
            item.classList.add('current');
        } else {
            item.classList.remove('current');
        }
    });
    
    // Scroll strip to center current frame
    const viewportWidth = frameStrip.parentElement.offsetWidth;
    const itemWidth = 170; // 160px + 10px gap
    const offset = (viewportWidth / 2) - (closestIndex * itemWidth) - (itemWidth / 2);
    frameStrip.style.transform = `translateX(${offset}px)`;
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, '0')}`;
}

// Sprite sheet drag & drop
const spriteSlots = document.querySelectorAll('.sprite-slot');

spriteSlots.forEach(slot => {
    slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        slot.classList.add('drag-over');
    });
    
    slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
    });
    
    slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        
        if (draggedFrame) {
            const slotIndex = parseInt(slot.dataset.slot);
            
            // Create canvas copy for sprite slot
            const slotCanvas = document.createElement('canvas');
            slotCanvas.width = draggedFrame.canvas.width;
            slotCanvas.height = draggedFrame.canvas.height;
            const slotCtx = slotCanvas.getContext('2d');
            slotCtx.drawImage(draggedFrame.canvas, 0, 0);
            
            spriteSheetFrames[slotIndex] = slotCanvas;
            updateSpriteSlot(slot, slotCanvas, slotIndex);
            
            checkSpriteSheetComplete();
        }
    });
});

function updateSpriteSlot(slot, canvas, slotIndex) {
    slot.innerHTML = '';
    
    const num = document.createElement('span');
    num.className = 'sprite-slot-number';
    num.textContent = slotIndex + 1;
    
    // Create display canvas
    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = canvas.width;
    displayCanvas.height = canvas.height;
    const displayCtx = displayCanvas.getContext('2d');
    displayCtx.drawImage(canvas, 0, 0);
    
    slot.appendChild(num);
    slot.appendChild(displayCanvas);
    slot.classList.add('filled');
}

function checkSpriteSheetComplete() {
    const allFilled = spriteSheetFrames.every(f => f !== null);
    document.getElementById('generateSpriteBtn').disabled = !allFilled;
}

function generateSpriteSheet() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const frameWidth = spriteSheetFrames[0].width;
    const frameHeight = spriteSheetFrames[0].height;

    canvas.width = frameWidth * 2;
    canvas.height = frameHeight * 3;

    // 2x3 grid positions
    const positions = [
        [0, 0], [frameWidth, 0],
        [0, frameHeight], [frameWidth, frameHeight],
        [0, frameHeight * 2], [frameWidth, frameHeight * 2]
    ];

    spriteSheetFrames.forEach((frameCanvas, index) => {
        const [x, y] = positions[index];
        ctx.drawImage(frameCanvas, x, y);
    });

    const link = document.createElement('a');
    link.download = 'sprite_sheet_2x3.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function resetSpriteSheet() {
    spriteSheetFrames = [null, null, null, null, null, null];
    
    // Reset all frame tracking
    allFrames.forEach(frame => {
        frame.inSpriteSheet = false;
        frame.spriteSlotIndex = null;
    });
    
    spriteSlots.forEach((slot, index) => {
        slot.innerHTML = `
            <span class="sprite-slot-number">${index + 1}</span>
            <span style="font-size: 2rem;">+</span>
        `;
        slot.classList.remove('filled');
    });
    
    updateFrameStripHighlights();
    document.getElementById('generateSpriteBtn').disabled = true;
}
