const Joi = require('joi');

const nameSchema = Joi.string().trim().min(1).max(20).required();
const sessionIdSchema = Joi.string().trim().required();

const createSessionSchema = Joi.object({
  name: nameSchema
});

const joinSessionSchema = Joi.object({
  sessionId: sessionIdSchema,
  name: nameSchema
});

const startGameSchema = Joi.object({
  sessionId: sessionIdSchema,
  question: Joi.string().trim().min(1).max(200).required(),
  answer: Joi.string().trim().min(1).max(100).required(),
  hint: Joi.string().trim().max(150).allow('').optional()
});

const submitAnswerSchema = Joi.object({
  sessionId: sessionIdSchema,
  guess: Joi.string().trim().min(1).max(100).required()
});

const leaveSessionSchema = Joi.object({
  sessionId: sessionIdSchema
});

// Validates payload against schema. On failure calls onError(errObj) and
// returns null. On success returns the cleaned/validated value.
function validate(schema, payload, onError) {
  const { error, value } = schema.validate(payload);
  if (error) {
    onError({ error: error.details[0].message });
    return null;
  }
  return value;
}

module.exports = {
  createSessionSchema,
  joinSessionSchema,
  startGameSchema,
  submitAnswerSchema,
  leaveSessionSchema,
  validate
};