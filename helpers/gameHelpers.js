// In-memory storage shared across the whole app
const sessions = new Map(); // sessionId -> session object

const GAME_DURATION_MS = 60000;
const MAX_ATTEMPTS = 3;

function createSessionId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function buildSession(sessionId, masterSocketId, masterName) {
  return {
    id: sessionId,
    gameMasterId: masterSocketId,
    players: [{ id: masterSocketId, name: masterName, score: 0 }],
    status: 'waiting', // waiting | in_progress | ended
    question: null,
    answer: null,
    attempts: {},       // socketId -> count
    locked: false,
    timer: null
  };
}

function getPublicPlayerList(session) {
  return session.players.map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    isMaster: p.id === session.gameMasterId
  }));
}

function findSessionIdBySocket(socketId) {
  for (const [sessionId, session] of sessions.entries()) {
    if (session.players.some(p => p.id === socketId)) {
      return sessionId;
    }
  }
  return null;
}

function clearSessionTimer(session) {
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
}

function rotateGameMaster(io, session) {
  if (session.players.length === 0) return;

  const currentMasterIndex = session.players.findIndex(p => p.id === session.gameMasterId);
  const nextIndex = (currentMasterIndex + 1) % session.players.length;
  session.gameMasterId = session.players[nextIndex].id;

  session.status = 'waiting';
  session.question = null;
  session.answer = null;
  session.attempts = {};
  session.locked = false;

  io.to(session.id).emit('new_master_assigned', {
    gameMasterId: session.gameMasterId,
    players: getPublicPlayerList(session)
  });
}

function endGame(io, sessionId, winnerSocketId) {
  const session = sessions.get(sessionId);
  if (!session || session.status !== 'in_progress') return;

  clearSessionTimer(session);
  session.locked = true;
  session.status = 'ended';

  let winnerName = null;

  if (winnerSocketId) {
    const winner = session.players.find(p => p.id === winnerSocketId);
    if (winner) {
      winner.score += 10;
      winnerName = winner.name;
    }
  }

  io.to(sessionId).emit('game_ended', {
    winner: winnerName,
    answer: session.answer
  });

  io.to(sessionId).emit('scores_updated', {
    players: getPublicPlayerList(session)
  });

  rotateGameMaster(io, session);
}

function removePlayerFromSession(io, socketId) {
  const sessionId = findSessionIdBySocket(socketId);
  if (!sessionId) return;

  const session = sessions.get(sessionId);
  if (!session) return;

  const leavingPlayer = session.players.find(p => p.id === socketId);
  session.players = session.players.filter(p => p.id !== socketId);
  delete session.attempts[socketId];

  // No players left -> delete session entirely
  if (session.players.length === 0) {
    clearSessionTimer(session);
    sessions.delete(sessionId);
    return;
  }

  // If the master left, reassign immediately
  if (leavingPlayer && leavingPlayer.id === session.gameMasterId) {
    session.gameMasterId = session.players[0].id;
    io.to(sessionId).emit('new_master_assigned', {
      gameMasterId: session.gameMasterId,
      players: getPublicPlayerList(session)
    });
  }

  io.to(sessionId).emit('player_list_updated', {
    players: getPublicPlayerList(session)
  });
}

module.exports = {
  sessions,
  GAME_DURATION_MS,
  MAX_ATTEMPTS,
  createSessionId,
  buildSession,
  getPublicPlayerList,
  findSessionIdBySocket,
  clearSessionTimer,
  rotateGameMaster,
  endGame,
  removePlayerFromSession
};