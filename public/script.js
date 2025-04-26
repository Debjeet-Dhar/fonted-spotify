// DOM Elements
const createRoomBtn = document.getElementById('create-room-btn');
const roomModal = document.getElementById('room-modal');
const closeModal = document.querySelector('.close');
const confirmRoomBtn = document.getElementById('confirm-room');
const usernameInput = document.getElementById('username-input');
const roomCodeInput = document.getElementById('room-code-input');
const roomView = document.getElementById('room-view');
const defaultView = document.getElementById('default-view');
const roomName = document.getElementById('room-name');
const memberCount = document.getElementById('member-count');
const leaveRoomBtn = document.getElementById('leave-room');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message');
const availableRooms = document.getElementById('available-rooms');

// Player elements
const albumCover = document.getElementById('album-cover');
const songTitle = document.getElementById('song-title');
const songArtist = document.getElementById('song-artist');
const playPauseBtn = document.getElementById('play-pause');
const prevTrackBtn = document.getElementById('prev-track');
const nextTrackBtn = document.getElementById('next-track');
const progress = document.getElementById('progress');
const currentTime = document.getElementById('current-time');
const duration = document.getElementById('duration');

 //& Spotify API config
 const CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID';
 const REDIRECT_URI = 'http://localhost:3000/callback';
 const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
 const RESPONSE_TYPE = 'token';
 const SCOPE = 'streaming user-read-email user-read-private user-library-read user-library-modify user-read-playback-state user-modify-playback-state';

// App state
let currentRoom = null;
let username = '';
let accessToken = null;
let player;
let isPlaying = false;
let currentTrack = null;
let socket;

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
    connectSocket();
});

// Check if user is authenticated with Spotify
function checkAuth() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');

    if (token) {
        accessToken = token;
        window.location.hash = '';
        localStorage.setItem('spotify_access_token', token);
        initializePlayer();
    } else {
        const storedToken = localStorage.getItem('spotify_access_token');
        if (storedToken) {
            accessToken = storedToken;
            initializePlayer();
        }
    }
}

// Connect to Socket.io server
function connectSocket() {
    socket = io('http://localhost:5000');

    socket.on('roomCreated', (data) => {
        currentRoom = data.roomId;
        roomName.textContent = data.roomId;
        toggleRoomView(true);
        roomModal.style.display = 'none';
    });

    socket.on('userJoined', (data) => {
        memberCount.textContent = data.users.length;
        addMessage(`${data.user} joined the room`, 'system');
    });

    socket.on('userLeft', (data) => {
        memberCount.textContent = data.users.length;
        addMessage(`A user left the room`, 'system');
    });

    socket.on('roomState', (data) => {
        if (data.currentTrack) {
            updatePlayerUI(data.currentTrack);
        }
        updatePlaybackState(data.playbackState, data.position);
    });

    socket.on('playbackUpdate', (data) => {
        updatePlaybackState(data.state, data.position);
    });

    socket.on('trackChanged', (data) => {
        updatePlayerUI(data.track);
        updatePlaybackState('playing', 0);
    });

    socket.on('newMessage', (data) => {
        addMessage(data.message, data.user);
    });

    socket.on('roomClosed', () => {
        alert('The room host has left. This room is now closed.');
        leaveRoom();
    });

    socket.on('error', (data) => {
        alert(data.message);
    });
}

// Initialize Spotify Web Playback SDK
function initializePlayer() {
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
        player = new Spotify.Player({
            name: 'Spotify Rooms Player',
            getOAuthToken: cb => { cb(accessToken); },
            volume: 0.5
        });

        player.addListener('ready', ({ device_id }) => {
            console.log('Ready with Device ID', device_id);
            transferPlayback(device_id);
        });

        player.addListener('player_state_changed', (state) => {
            if (!state) return;

            currentTrack = state.track_window.current_track;
            isPlaying = !state.paused;
            updatePlayPauseButton();

            if (currentRoom && socket.id === rooms[currentRoom].host) {
                socket.emit('playbackEvent', {
                    roomId: currentRoom,
                    state: isPlaying ? 'playing' : 'paused',
                    position: state.position
                });
            }
        });

        player.connect();
    };
}

// Transfer playback to our player
function transferPlayback(deviceId) {
    fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            device_ids: [deviceId],
            play: false
        })
    });
}

// Setup event listeners
function setupEventListeners() {
    // Room creation
    createRoomBtn.addEventListener('click', () => {
        roomModal.style.display = 'block';
    });

    closeModal.addEventListener('click', () => {
        roomModal.style.display = 'none';
    });

    confirmRoomBtn.addEventListener('click', () => {
        username = usernameInput.value.trim();
        const roomCode = roomCodeInput.value.trim();

        if (!username) {
            alert('Please enter your name');
            return;
        }

        document.getElementById('username').textContent = username;

        if (roomCode) {
            socket.emit('joinRoom', {
                roomId: roomCode,
                username: username
            });
        } else {
            socket.emit('createRoom', {
                username: username
            });
        }
    });

    // Room management
    leaveRoomBtn.addEventListener('click', leaveRoom);

    // Chat
    sendMessageBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Player controls
    playPauseBtn.addEventListener('click', togglePlay);
    prevTrackBtn.addEventListener('click', playPreviousTrack);
    nextTrackBtn.addEventListener('click', playNextTrack);
}

// Toggle between room view and default view
function toggleRoomView(showRoom) {
    if (showRoom) {
        roomView.classList.remove('hidden');
        defaultView.classList.add('hidden');
    } else {
        roomView.classList.add('hidden');
        defaultView.classList.remove('hidden');
    }
}

// Leave the current room
function leaveRoom() {
    if (currentRoom) {
        socket.emit('leaveRoom', { roomId: currentRoom });
        currentRoom = null;
        toggleRoomView(false);
    }
}

// Send chat message
function sendMessage() {
    const message = messageInput.value.trim();
    if (message && currentRoom) {
        socket.emit('sendMessage', {
            roomId: currentRoom,
            user: username,
            message: message
        });
        addMessage(message, 'You');
        messageInput.value = '';
    }
}

// Add message to chat
function addMessage(message, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    if (sender === 'You') {
        messageDiv.classList.add('self');
    } else if (sender !== 'system') {
        messageDiv.classList.add('other');
    }

    const senderSpan = document.createElement('span');
    senderSpan.classList.add('message-sender');
    senderSpan.textContent = sender === 'system' ? 'System' : sender;
    
    const timeSpan = document.createElement('span');
    timeSpan.classList.add('message-time');
    timeSpan.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const headerDiv = document.createElement('div');
    headerDiv.appendChild(senderSpan);
    if (sender !== 'system') headerDiv.appendChild(timeSpan);
    
    const contentDiv = document.createElement('div');
    contentDiv.textContent = message;
    
    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(contentDiv);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Player functions
function togglePlay() {
    if (!player) return;

    player.togglePlay().then(() => {
        isPlaying = !isPlaying;
        updatePlayPauseButton();
    });
}

function playNextTrack() {
    if (!player) return;
    player.nextTrack();
}

function playPreviousTrack() {
    if (!player) return;
    player.previousTrack();
}

function updatePlayerUI(track) {
    albumCover.src = track.album.images[0].url;
    songTitle.textContent = track.name;
    songArtist.textContent = track.artists.map(artist => artist.name).join(', ');
}

function updatePlaybackState(state, position) {
    isPlaying = state === 'playing';
    updatePlayPauseButton();
    
    if (position !== undefined) {
        const progressPercentage = (position / currentTrack.duration_ms) * 100;
        progress.style.width = `${progressPercentage}%`;
        currentTime.textContent = formatTime(position / 1000);
    }
}

function updatePlayPauseButton() {
    playPauseBtn.className = isPlaying ? 'fas fa-pause-circle' : 'fas fa-play-circle';
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Search functionality
document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) {
            searchTracks(query);
        }
    }
});

function searchTracks(query) {
    fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    })
    .then(response => response.json())
    .then(data => {
        displaySearchResults(data.tracks.items);
    })
    .catch(error => console.error('Error searching tracks:', error));
}

function displaySearchResults(tracks) {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';
    
    tracks.slice(0, 6).forEach(track => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-img">
                <img src="${track.album.images[0].url}" alt="${track.name}">
                <div class="play-btn">
                    <i class="fas fa-play"></i>
                </div>
            </div>
            <h3>${track.name}</h3>
            <p>${track.artists.map(artist => artist.name).join(', ')}</p>
        `;
        
        card.addEventListener('click', () => {
            if (currentRoom) {
                socket.emit('changeTrack', {
                    roomId: currentRoom,
                    track: track
                });
            } else {
                updatePlayerUI(track);
                playTrack(track.uri);
            }
        });
        
        resultsContainer.appendChild(card);
    });
}

function playTrack(trackUri) {
    fetch(`https://api.spotify.com/v1/me/player/play`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            uris: [trackUri]
        })
    })
    .catch(error => console.error('Error playing track:', error));
}