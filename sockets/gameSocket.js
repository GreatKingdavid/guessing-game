const {
  sessions,
  GAME_DURATION_MS,
  MAX_ATTEMPTS,
  createSessionId,
  buildSession,
  getPublicPlayerList,
  clearSessionTimer,
  endGame,
  removePlayerFromSession
} = require('../helpers/gameHelpers');

const {
  createSessionSchema,
  joinSessionSchema,
  startGameSchema,
  submitAnswerSchema,
  leaveSessionSchema,
  validate
} = require('../validation/schemas');

function registerGameSocket(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('create_session', (payload) => {
      const data = validate(createSessionSchema, payload, (err) => socket.emit('error_message', err));
      if (!data) return;

      const sessionId = createSessionId();
      const session = buildSession(sessionId, socket.id, data.name);
      sessions.set(sessionId, session);

      socket.join(sessionId);

      socket.emit('session_created', {
        sessionId,
        gameMasterId: session.gameMasterId,
        players: getPublicPlayerList(session)
      });
    });

    socket.on('join_session', (payload) => {
      const data = validate(joinSessionSchema, payload, (err) => socket.emit('error_message', err));
      if (!data) return;

      const session = sessions.get(data.sessionId);
      if (!session) {
        socket.emit('error_message', { error: 'Session not found.' });
        return;
      }
      if (session.status !== 'waiting') {
        socket.emit('error_message', { error: 'Game already in progress. Cannot join right now.' });
        return;
      }
      if (session.players.some(p => p.id === socket.id)) {
        socket.emit('error_message', { error: 'You are already in this session.' });
        return;
      }

      session.players.push({ id: socket.id, name: data.name, score: 0 });
      socket.join(data.sessionId);

      io.to(data.sessionId).emit('player_list_updated', {
        players: getPublicPlayerList(session)
      });
    });

    socket.on('start_game', (payload) => {
      const data = validate(startGameSchema, payload, (err) => socket.emit('error_message', err));
      if (!data) return;

      const session = sessions.get(data.sessionId);
      if (!session) {
        socket.emit('error_message', { error: 'Session not found.' });
        return;
      }
      if (session.gameMasterId !== socket.id) {
        socket.emit('error_message', { error: 'Only the game master can start the game.' });
        return;
      }
      if (session.status !== 'waiting') {
        socket.emit('error_message', { error: 'Game already started or ended.' });
        return;
      }
      if (session.players.length <= 2) {
        socket.emit('error_message', { error: 'Need more than two players to start.' });
        return;
      }

      session.question = data.question;
      session.answer = data.answer.trim().toLowerCase();
      session.status = 'in_progress';
      session.locked = false;
      session.attempts = {};

      io.to(data.sessionId).emit('game_started', {
        question: session.question
      });

      clearSessionTimer(session);
      session.timer = setTimeout(() => {
        endGame(io, data.sessionId, null);
      }, GAME_DURATION_MS);
    });

    socket.on('submit_answer', (payload) => {
      const data = validate(submitAnswerSchema, payload, (err) => socket.emit('error_message', err));
      if (!data) return;

      const session = sessions.get(data.sessionId);
      if (!session) {
        socket.emit('error_message', { error: 'Session not found.' });
        return;
      }
      if (session.status !== 'in_progress' || session.locked) {
        socket.emit('error_message', { error: 'No active question to answer right now.' });
        return;
      }

      const attemptsSoFar = session.attempts[socket.id] || 0;
      if (attemptsSoFar >= MAX_ATTEMPTS) {
        socket.emit('out_of_guesses', { message: 'You have used all 3 attempts.' });
        return;
      }

      session.attempts[socket.id] = attemptsSoFar + 1;

      const guessNormalized = data.guess.trim().toLowerCase();
      const isCorrect = guessNormalized === session.answer;

      if (isCorrect) {
        endGame(io, data.sessionId, socket.id);
      } else {
        const remaining = MAX_ATTEMPTS - session.attempts[socket.id];
        if (remaining > 0) {
          socket.emit('wrong_guess', { attemptsRemaining: remaining });
        } else {
          socket.emit('out_of_guesses', { message: 'You have used all 3 attempts.' });
        }
      }
    });

    socket.on('leave_session', (payload) => {
      const data = validate(leaveSessionSchema, payload, (err) => socket.emit('error_message', err));
      if (!data) return;

      socket.leave(data.sessionId);
      removePlayerFromSession(io, socket.id);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      removePlayerFromSession(io, socket.id);
    });
  });
}

module.exports = registerGameSocket;