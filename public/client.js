const socket = io();

let currentSessionId = null;
let myId = null;
let myMasterStatus = false;

// ---- DOM references ----
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const lobbyError = document.getElementById('lobby-error');

const createNameInput = document.getElementById('create-name');
const createBtn = document.getElementById('create-btn');

const joinSessionIdInput = document.getElementById('join-session-id');
const joinNameInput = document.getElementById('join-name');
const joinBtn = document.getElementById('join-btn');

const sessionIdDisplay = document.getElementById('session-id-display');
const copySessionBtn = document.getElementById('copy-session-btn');
const leaveBtn = document.getElementById('leave-btn');
const playersList = document.getElementById('players-list');
const chatLog = document.getElementById('chat-log');

const masterControls = document.getElementById('master-controls');
const questionInput = document.getElementById('question-input');
const answerInput = document.getElementById('answer-input');
const hintInput = document.getElementById('hint-input');
const startGameBtn = document.getElementById('start-game-btn');

const guessControls = document.getElementById('guess-controls');
const guessInput = document.getElementById('guess-input');
const guessBtn = document.getElementById('guess-btn');
const hintBtn = document.getElementById('hint-btn');

// ---- Helpers ----
function logMessage(text) {
  const p = document.createElement('p');
  p.textContent = text;
  chatLog.appendChild(p);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function showGameScreen() {
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  sessionIdDisplay.textContent = currentSessionId;
}

function renderPlayers(players) {
  playersList.innerHTML = '';
  players.forEach((p) => {
    const li = document.createElement('li');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${p.name} · ${p.score} pts`;
    li.appendChild(nameSpan);

    if (p.isMaster) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Master';
      li.appendChild(badge);
    }

    playersList.appendChild(li);

    if (p.id === myId) {
      myMasterStatus = p.isMaster;
    }
  });
  updateControlVisibility();
}

function updateControlVisibility() {
  masterControls.classList.toggle('hidden', !myMasterStatus);
}

// ---- Lobby actions ----
createBtn.addEventListener('click', () => {
  const name = createNameInput.value.trim();
  if (!name) {
    lobbyError.textContent = 'Enter your name first.';
    return;
  }
  socket.emit('create_session', { name });
});

joinBtn.addEventListener('click', () => {
  const sessionId = joinSessionIdInput.value.trim();
  const name = joinNameInput.value.trim();
  if (!sessionId || !name) {
    lobbyError.textContent = 'Enter session ID and your name.';
    return;
  }
  currentSessionId = sessionId;
  socket.emit('join_session', { sessionId, name });
});

leaveBtn.addEventListener('click', () => {
  if (!currentSessionId) return;
  socket.emit('leave_session', { sessionId: currentSessionId });
  window.location.reload();
});

copySessionBtn.addEventListener('click', async () => {
  if (!currentSessionId) return;
  try {
    await navigator.clipboard.writeText(currentSessionId);
  } catch (err) {
    // Fallback for browsers without clipboard API support
    const tempInput = document.createElement('input');
    tempInput.value = currentSessionId;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
  }
  const original = copySessionBtn.textContent;
  copySessionBtn.textContent = 'Copied';
  copySessionBtn.disabled = true;
  setTimeout(() => {
    copySessionBtn.textContent = original;
    copySessionBtn.disabled = false;
  }, 1500);
});

// ---- Master actions ----
startGameBtn.addEventListener('click', () => {
  const question = questionInput.value.trim();
  const answer = answerInput.value.trim();
  const hint = hintInput.value.trim();
  if (!question || !answer) {
    logMessage('Enter both a question and an answer.');
    return;
  }
  socket.emit('start_game', { sessionId: currentSessionId, question, answer, hint });
  hintInput.value = '';
});

// ---- Player actions ----
guessBtn.addEventListener('click', () => {
  const guess = guessInput.value.trim();
  if (!guess) return;
  socket.emit('submit_answer', { sessionId: currentSessionId, guess });
  guessInput.value = '';
});

hintBtn.addEventListener('click', () => {
  socket.emit('reveal_hint', { sessionId: currentSessionId });
  hintBtn.disabled = true;
});

// ---- Socket event listeners ----
socket.on('connect', () => {
  myId = socket.id;
});

socket.on('session_created', (data) => {
  currentSessionId = data.sessionId;
  showGameScreen();
  logMessage(`Session created. Share this ID with friends: ${data.sessionId}`);
  renderPlayers(data.players);
});

socket.on('player_list_updated', (data) => {
  showGameScreen();
  logMessage('Player list updated.');
  renderPlayers(data.players);
});

socket.on('error_message', (data) => {
  lobbyError.textContent = data.error;
  logMessage(`Error: ${data.error}`);
});

socket.on('game_started', (data) => {
  masterControls.classList.add('hidden');
  guessControls.classList.remove('hidden');
  hintBtn.disabled = false;
  hintBtn.classList.toggle('hidden', !data.hasHint);
  logMessage(`Game started! Question: ${data.question}`);
});

socket.on('hint_revealed', (data) => {
  logMessage(`Hint: ${data.hint}`);
  hintBtn.classList.add('hidden');
});

socket.on('wrong_guess', (data) => {
  logMessage(`Wrong guess. Attempts remaining: ${data.attemptsRemaining}`);
});

socket.on('out_of_guesses', (data) => {
  logMessage(data.message);
  guessControls.classList.add('hidden');
});

socket.on('game_ended', (data) => {
  guessControls.classList.add('hidden');
  hintBtn.classList.add('hidden');
  if (data.winner) {
    logMessage(`${data.winner} guessed correctly! Answer: ${data.answer}`);
  } else {
    logMessage(`Time's up! No winner. Answer was: ${data.answer}`);
  }
});

socket.on('scores_updated', (data) => {
  renderPlayers(data.players);
});

socket.on('new_master_assigned', (data) => {
  renderPlayers(data.players);
  if (data.gameMasterId === myId) {
    logMessage('You are now the game master. Create a new question!');
    masterControls.classList.remove('hidden');
  } else {
    logMessage('A new game master has been assigned.');
  }
});