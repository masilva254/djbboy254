// MixHub Main Application JavaScript

// Configuration
const API_BASE_URL = window.location.origin + '/api';
const SOCKET_URL = window.location.origin;
let socket = null;

// State management
let currentUser = null;
let currentMix = null;
let player = null;
let equalizerSettings = { bass: 0, mid: 0, treble: 0 };

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    initSocket();
    loadUserPreferences();
    updatePlayerState();
    
    // Check if we're on dashboard page
    if (window.location.pathname === '/' || window.location.pathname === '/dashboard') {
        loadDashboard();
    }
    
    // Check if we're on player page
    if (window.location.pathname === '/player') {
        initPlayer();
    }
    
    // Check if we're on equalizer page
    if (window.location.pathname === '/equalizer') {
        initEqualizer();
    }
});

// Theme management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const isDark = savedTheme === 'dark';
    
    document.documentElement.classList.toggle('dark', isDark);
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.innerHTML = isDark ? 
            '<i class="fas fa-moon"></i>' : 
            '<i class="fas fa-sun"></i>';
        
        themeToggle.addEventListener('click', toggleTheme);
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    
    document.documentElement.classList.toggle('dark', !isDark);
    localStorage.setItem('theme', newTheme);
    
    this.innerHTML = isDark ? 
        '<i class="fas fa-sun"></i>' : 
        '<i class="fas fa-moon"></i>';
    
    // Update theme on server if user is logged in
    if (currentUser) {
        updateUserPreferences({ theme: newTheme });
    }
}

// Socket.IO connection
function initSocket() {
    socket = io(SOCKET_URL);
    
    socket.on('connect', () => {
        console.log('Connected to server via WebSocket');
    });
    
    socket.on('progress-update', (data) => {
        // Handle real-time progress updates from other clients
        if (data.room === 'global' && player) {
            updatePlayerProgress(data.currentTime, data.duration);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
}

// User management
async function loadUserPreferences() {
    try {
        const userId = localStorage.getItem('userId');
        if (!userId) return;
        
        const response = await fetch(`${API_BASE_URL}/profile/${userId}`);
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            equalizerSettings = data.user.preferences?.equalizer || { bass: 0, mid: 0, treble: 0 };
            
            // Update UI with user data
            updateUserUI();
        }
    } catch (error) {
        console.error('Failed to load user preferences:', error);
    }
}

function updateUserUI() {
    // Update user avatar and name in navigation
    const userElements = document.querySelectorAll('.user-avatar, .user-name');
    userElements.forEach(el => {
        if (el.classList.contains('user-avatar') && currentUser?.avatar) {
            el.style.backgroundImage = `url(${currentUser.avatar})`;
        }
        if (el.classList.contains('user-name') && currentUser?.username) {
            el.textContent = currentUser.username;
        }
    });
}

async function updateUserPreferences(preferences) {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/profile/${currentUser.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preferences })
        });
        
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Failed to update preferences:', error);
        return false;
    }
}

// Dashboard functions
async function loadDashboard() {
    try {
        showLoading('Loading channel mixes...');
        
        const response = await fetch(`${API_BASE_URL}/channel/videos`);
        const data = await response.json();
        
        if (data.success) {
            renderChannelVideos(data.videos);
        } else {
            showError('Failed to load videos');
        }
    } catch (error) {
        console.error('Dashboard load error:', error);
        showError('Network error. Please try again.');
    } finally {
        hideLoading();
    }
}

function renderChannelVideos(videos) {
    const container = document.getElementById('videosContainer');
    if (!container) return;
    
    if (videos.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-music text-4xl text-gray-500 mb-4"></i>
                <p class="text-gray-400">No mixes found in channel</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = videos.map((video, index) => `
        <div class="card-hover bg-gradient-to-br from-dark-700/50 to-dark-800/50 backdrop-blur-lg rounded-2xl overflow-hidden border border-dark-600 hover:border-neon-blue/50 transition-all">
            <div class="relative h-48 overflow-hidden">
                <img 
                    src="${video.thumbnail}" 
                    alt="${video.title}"
                    class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    loading="lazy"
                    onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%231e293b%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22white%22 font-family=%22sans-serif%22>${encodeURIComponent(video.title.substring(0, 20))}</text></svg>'"
                >
                <div class="absolute inset-0 bg-gradient-to-t from-dark-900 via-transparent to-transparent opacity-70"></div>
                
                <button 
                    onclick="playMix('${video.videoId}', '${video.title.replace(/'/g, "\\'")}')"
                    class="absolute top-3 left-3 w-10 h-10 bg-gradient-neon rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                >
                    <i class="fas fa-play text-white"></i>
                </button>
                
                <div class="absolute top-3 right-3 px-2 py-1 bg-dark-900/80 backdrop-blur-sm rounded-lg text-xs">
                    1:18:02
                </div>
            </div>
            
            <div class="p-4">
                <h4 class="font-bold text-lg mb-2 line-clamp-2">${video.title}</h4>
                <p class="text-sm text-neon-blue mb-3">${video.channelTitle || 'DJ BBOY'}</p>
                
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <button 
                            onclick="toggleFavorite('${video.videoId}', this)"
                            class="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-dark-700 transition-all"
                            title="Add to favorites"
                        >
                            <i class="fas fa-heart"></i>
                        </button>
                        
                        <button 
                            onclick="downloadMix('${video.videoId}', '${video.title.replace(/'/g, "\\'")}')"
                            class="p-2 rounded-lg text-gray-400 hover:text-neon-blue hover:bg-dark-700 transition-all"
                            title="Download"
                        >
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                    
                    <span class="text-xs text-gray-400">
                        ${new Date(video.publishedAt).toLocaleDateString()}
                    </span>
                </div>
            </div>
        </div>
    `).join('');
}

// Player functions
function initPlayer() {
    const audioElement = document.getElementById('audioElement');
    if (!audioElement) return;
    
    player = {
        element: audioElement,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        currentMix: null
    };
    
    // Setup audio event listeners
    audioElement.addEventListener('loadedmetadata', () => {
        player.duration = audioElement.duration;
        updatePlayerDuration();
    });
    
    audioElement.addEventListener('timeupdate', () => {
        player.currentTime = audioElement.currentTime;
        updatePlayerProgress();
        
        // Send progress update via WebSocket
        if (socket && socket.connected) {
            socket.emit('audio-progress', {
                room: 'global',
                currentTime: player.currentTime,
                duration: player.duration
            });
        }
    });
    
    audioElement.addEventListener('ended', () => {
        player.isPlaying = false;
        updatePlayerControls();
        
        // Auto-play next mix if enabled
        if (currentUser?.preferences?.autoPlay) {
            playNextMix();
        }
    });
    
    // Load current mix from URL or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('video') || localStorage.getItem('currentMixId');
    
    if (videoId) {
        loadMix(videoId);
    }
}

async function loadMix(videoId) {
    try {
        showLoading('Loading mix...');
        
        // Get video info
        const response = await fetch(`${API_BASE_URL}/channel/videos`);
        const data = await response.json();
        
        if (data.success) {
            const video = data.videos.find(v => v.videoId === videoId);
            if (video) {
                player.currentMix = video;
                localStorage.setItem('currentMixId', videoId);
                
                // Update player UI
                updatePlayerUI(video);
                
                // Get stream URL
                const streamUrl = `${API_BASE_URL}/stream/${videoId}`;
                player.element.src = streamUrl;
                
                // Load waveform
                loadWaveform(videoId);
            }
        }
    } catch (error) {
        console.error('Failed to load mix:', error);
        showError('Failed to load mix');
    } finally {
        hideLoading();
    }
}

async function playMix(videoId, title) {
    // If we're not on player page, navigate to it
    if (window.location.pathname !== '/player') {
        window.location.href = `/player?video=${videoId}`;
        return;
    }
    
    // Already on player page
    if (player.currentMix?.videoId === videoId) {
        togglePlay();
    } else {
        await loadMix(videoId);
        play();
    }
}

function togglePlay() {
    if (!player) return;
    
    if (player.isPlaying) {
        pause();
    } else {
        play();
    }
}

function play() {
    if (!player || !player.element) return;
    
    player.element.play()
        .then(() => {
            player.isPlaying = true;
            updatePlayerControls();
        })
        .catch(error => {
            console.error('Playback error:', error);
            showError('Failed to play audio. Please try again.');
        });
}

function pause() {
    if (!player || !player.element) return;
    
    player.element.pause();
    player.isPlaying = false;
    updatePlayerControls();
}

function updatePlayerUI(video) {
    // Update player display with video info
    const titleEl = document.getElementById('playerTitle');
    const artistEl = document.getElementById('playerArtist');
    const thumbnailEl = document.getElementById('playerThumbnail');
    
    if (titleEl) titleEl.textContent = video.title;
    if (artistEl) artistEl.textContent = video.channelTitle || 'DJ BBOY';
    if (thumbnailEl) {
        thumbnailEl.src = video.thumbnail;
        thumbnailEl.alt = video.title;
    }
    
    // Update document title
    document.title = `${video.title} - MixHub Player`;
}

function updatePlayerControls() {
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    
    if (player.isPlaying) {
        if (playBtn) playBtn.classList.add('hidden');
        if (pauseBtn) pauseBtn.classList.remove('hidden');
    } else {
        if (playBtn) playBtn.classList.remove('hidden');
        if (pauseBtn) pauseBtn.classList.add('hidden');
    }
}

function updatePlayerProgress() {
    const progressBar = document.getElementById('progressBar');
    const currentTimeEl = document.getElementById('currentTime');
    const durationEl = document.getElementById('duration');
    
    if (progressBar && player.duration > 0) {
        const progress = (player.currentTime / player.duration) * 100;
        progressBar.style.width = `${progress}%`;
    }
    
    if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(player.currentTime);
    }
    
    if (durationEl && player.duration > 0) {
        durationEl.textContent = formatTime(player.duration);
    }
}

function updatePlayerDuration() {
    const durationEl = document.getElementById('duration');
    if (durationEl && player.duration > 0) {
        durationEl.textContent = formatTime(player.duration);
    }
}

function seekPlayer(event) {
    if (!player || !player.element || player.duration <= 0) return;
    
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * player.duration;
    
    player.element.currentTime = newTime;
    player.currentTime = newTime;
    updatePlayerProgress();
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Waveform functions
async function loadWaveform(videoId) {
    try {
        const response = await fetch(`${API_BASE_URL}/waveform/${videoId}`);
        const data = await response.json();
        
        if (data.success) {
            renderWaveform(data.waveform);
        }
    } catch (error) {
        console.error('Failed to load waveform:', error);
    }
}

function renderWaveform(waveformData) {
    const container = document.getElementById('waveformContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    waveformData.forEach((height, index) => {
        const bar = document.createElement('div');
        bar.className = 'waveform-bar';
        bar.style.height = `${height}%`;
        bar.style.width = '4px';
        bar.style.background = `linear-gradient(to top, #00f0ff, #b967ff)`;
        bar.style.borderRadius = '2px';
        bar.style.margin = '0 1px';
        
        if (player?.isPlaying) {
            bar.classList.add('playing');
        }
        
        // Add animation delay for wave effect
        bar.style.animationDelay = `${index * 0.05}s`;
        
        container.appendChild(bar);
    });
}

// Download functions
async function downloadMix(videoId, title) {
    try {
        showLoading('Preparing download...');
        
        // Show download options modal
        const options = await getDownloadOptions(videoId);
        showDownloadModal(videoId, title, options);
        
    } catch (error) {
        console.error('Download error:', error);
        showError('Failed to prepare download');
    } finally {
        hideLoading();
    }
}

async function getDownloadOptions(videoId) {
    try {
        const response = await fetch(`${API_BASE_URL}/download/options/${videoId}`);
        const data = await response.json();
        
        if (data.success) {
            return data.options;
        }
        throw new Error('Failed to get options');
    } catch (error) {
        console.error('Options error:', error);
        return {
            video: [
                { quality: '720p', label: 'HD Video (720p)', format: 'mp4', size: '~120MB' },
                { quality: '480p', label: 'Standard Video (480p)', format: 'mp4', size: '~80MB' }
            ],
            audio: [
                { quality: '320kbps', label: 'High Quality Audio (320kbps)', format: 'mp3', size: '~40MB' },
                { quality: '128kbps', label: 'Standard Audio (128kbps)', format: 'mp3', size: '~15MB' }
            ]
        };
    }
}

async function startDownload(videoId, format, quality) {
    try {
        showLoading(`Downloading ${format} (${quality})...`);
        
        const response = await fetch(`${API_BASE_URL}/download/${videoId}?format=${format}&quality=${quality}`);
        const data = await response.json();
        
        if (data.success) {
            // Create download link
            const link = document.createElement('a');
            link.href = data.download.url;
            link.download = `${data.video.title.replace(/[^\w\s]/gi, '')}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showSuccess('Download started!');
            
            // Track download if user is logged in
            if (currentUser) {
                trackDownload(videoId, data.video.title, format, quality);
            }
        } else {
            throw new Error(data.error || 'Download failed');
        }
    } catch (error) {
        console.error('Download error:', error);
        showError('Download failed: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function trackDownload(videoId, title, format, quality) {
    try {
        await fetch(`${API_BASE_URL}/downloads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                videoId,
                title,
                format,
                quality
            })
        });
    } catch (error) {
        console.error('Failed to track download:', error);
    }
}

// Equalizer functions
function initEqualizer() {
    // Load saved equalizer settings
    const savedSettings = localStorage.getItem('equalizerSettings');
    if (savedSettings) {
        equalizerSettings = JSON.parse(savedSettings);
    }
    
    // Update sliders
    updateEqualizerSliders();
    
    // Setup event listeners
    document.querySelectorAll('.equalizer-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const band = e.target.dataset.band;
            const value = parseInt(e.target.value);
            
            equalizerSettings[band] = value;
            updateEqualizerValue(band, value);
            
            // Save to localStorage
            localStorage.setItem('equalizerSettings', JSON.stringify(equalizerSettings));
            
            // Apply to audio if playing
            applyEqualizer();
        });
    });
    
    // Preset buttons
    document.querySelectorAll('.equalizer-preset').forEach(button => {
        button.addEventListener('click', (e) => {
            const preset = e.target.dataset.preset;
            loadEqualizerPreset(preset);
        });
    });
    
    // Reset button
    const resetBtn = document.getElementById('resetEqualizer');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetEqualizer);
    }
}

function updateEqualizerSliders() {
    Object.entries(equalizerSettings).forEach(([band, value]) => {
        const slider = document.querySelector(`.equalizer-slider[data-band="${band}"]`);
        const valueEl = document.getElementById(`${band}Value`);
        
        if (slider) slider.value = value;
        if (valueEl) valueEl.textContent = value > 0 ? `+${value}dB` : `${value}dB`;
    });
}

function updateEqualizerValue(band, value) {
    const valueEl = document.getElementById(`${band}Value`);
    if (valueEl) {
        valueEl.textContent = value > 0 ? `+${value}dB` : `${value}dB`;
    }
}

function loadEqualizerPreset(preset) {
    const presets = {
        flat: { bass: 0, mid: 0, treble: 0 },
        bass: { bass: 6, mid: 2, treble: 0 },
        treble: { bass: 0, mid: 2, treble: 6 },
        rock: { bass: 4, mid: 2, treble: 4 },
        jazz: { bass: 2, mid: 4, treble: 2 },
        classical: { bass: 3, mid: 1, treble: 4 }
    };
    
    equalizerSettings = presets[preset] || presets.flat;
    updateEqualizerSliders();
    applyEqualizer();
    
    // Save to localStorage
    localStorage.setItem('equalizerSettings', JSON.stringify(equalizerSettings));
}

function resetEqualizer() {
    equalizerSettings = { bass: 0, mid: 0, treble: 0 };
    updateEqualizerSliders();
    applyEqualizer();
    
    // Save to localStorage
    localStorage.setItem('equalizerSettings', JSON.stringify(equalizerSettings));
}

function applyEqualizer() {
    if (!player?.element) return;
    
    // Create audio context and apply filters
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaElementSource(player.element);
    
    // Create filters for each band
    const bassFilter = audioContext.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 100;
    bassFilter.gain.value = equalizerSettings.bass;
    
    const midFilter = audioContext.createBiquadFilter();
    midFilter.type = 'peaking';
    midFilter.frequency.value = 1000;
    midFilter.Q.value = 1;
    midFilter.gain.value = equalizerSettings.mid;
    
    const trebleFilter = audioContext.createBiquadFilter();
    trebleFilter.type = 'highshelf';
    trebleFilter.frequency.value = 3000;
    trebleFilter.gain.value = equalizerSettings.treble;
    
    // Connect filters
    source.connect(bassFilter);
    bassFilter.connect(midFilter);
    midFilter.connect(trebleFilter);
    trebleFilter.connect(audioContext.destination);
}

// UI Helper functions
function showLoading(message = 'Loading...') {
    // Create or show loading overlay
    let loadingEl = document.getElementById('loadingOverlay');
    
    if (!loadingEl) {
        loadingEl = document.createElement('div');
        loadingEl.id = 'loadingOverlay';
        loadingEl.className = 'fixed inset-0 z-50 flex items-center justify-center bg-dark-900/80 backdrop-blur-lg';
        loadingEl.innerHTML = `
            <div class="text-center">
                <div class="spinner mx-auto mb-4"></div>
                <p class="text-gray-300">${message}</p>
            </div>
        `;
        document.body.appendChild(loadingEl);
    } else {
        loadingEl.classList.remove('hidden');
    }
}

function hideLoading() {
    const loadingEl = document.getElementById('loadingOverlay');
    if (loadingEl) {
        loadingEl.classList.add('hidden');
    }
}

function showError(message) {
    // Create error toast
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 z-50 px-6 py-3 bg-red-600 text-white rounded-lg shadow-lg animate-fade-in';
    toast.innerHTML = `
        <div class="flex items-center gap-2">
            <i class="fas fa-exclamation-circle"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function showSuccess(message) {
    // Create success toast
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 z-50 px-6 py-3 bg-green-600 text-white rounded-lg shadow-lg animate-fade-in';
    toast.innerHTML = `
        <div class="flex items-center gap-2">
            <i class="fas fa-check-circle"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function showDownloadModal(videoId, title, options) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-lg';
    modal.innerHTML = `
        <div class="bg-gradient-to-br from-dark-800 to-dark-900 rounded-2xl p-6 max-w-md w-full border border-dark-600">
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-bold">Download Options</h3>
                <button onclick="this.closest('.fixed').remove()" class="p-2 hover:bg-dark-700 rounded-lg">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="mb-4">
                <p class="text-gray-300 line-clamp-2 mb-2">${title}</p>
                <p class="text-sm text-neon-blue">DJ BBOY</p>
            </div>
            
            <div class="space-y-4">
                <div>
                    <h4 class="font-semibold mb-2 text-gray-300">Audio Formats</h4>
                    <div class="space-y-2">
                        ${options.audio.map(opt => `
                            <button 
                                onclick="startDownload('${videoId}', 'audio', '${opt.quality}'); this.closest('.fixed').remove()"
                                class="w-full text-left p-3 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors"
                            >
                                <div class="flex justify-between items-center">
                                    <span>${opt.label}</span>
                                    <span class="text-sm text-gray-400">${opt.size}</span>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                </div>
                
                <div>
                    <h4 class="font-semibold mb-2 text-gray-300">Video Formats</h4>
                    <div class="space-y-2">
                        ${options.video.map(opt => `
                            <button 
                                onclick="startDownload('${videoId}', 'video', '${opt.quality}'); this.closest('.fixed').remove()"
                                class="w-full text-left p-3 bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors"
                            >
                                <div class="flex justify-between items-center">
                                    <span>${opt.label}</span>
                                    <span class="text-sm text-gray-400">${opt.size}</span>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
            
            <div class="mt-6 text-center text-sm text-gray-400">
                <p><i class="fas fa-info-circle mr-2"></i>Downloads are unlimited and free!</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Global utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Make functions available globally
window.playMix = playMix;
window.downloadMix = downloadMix;
window.togglePlay = togglePlay;
window.seekPlayer = seekPlayer;
window.startDownload = startDownload;
window.toggleFavorite = function(videoId, button) {
    button.classList.toggle('text-red-500');
    button.classList.toggle('text-gray-400');
    
    const icon = button.querySelector('i');
    if (icon.classList.contains('fas')) {
        icon.classList.replace('fas', 'far');
    } else {
        icon.classList.replace('far', 'fas');
    }
    
    // In production, save to server
    if (currentUser) {
        // Save favorite to server
    }
};