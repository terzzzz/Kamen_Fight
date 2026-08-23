/**
 * ai.js - Accumulative Utility AI Engine
 */

class AIKnowledgeBase {
  constructor(decayFactor = 0.95) {
    this.memoryStore = {};
    this.decayFactor = decayFactor;
  }

  _getMatchupKey(cpuId, oppId) {
    return `${cpuId}_vs_${oppId}`;
  }

  _getMatchupMemory(cpuId, oppId) {
    const key = this._getMatchupKey(cpuId, oppId);
    if (!this.memoryStore[key]) {
      this.memoryStore[key] = {
        transitions: {},     // P(Opponent Move t | Opponent Move t-1)
        moveExperience: {},  // Accumulated reward/punish offsets
        lastOpponentMove: null
      };
    }
    return this.memoryStore[key];
  }

  recordTurnOutcome(cpuPlayer, opponentPlayer, oppMoveKey, cpuMoveKey, wasCpuSuccessful) {
    const cpuId = cpuPlayer.id || 'ichigo';
    const oppId = opponentPlayer.id || 'nigo';
    const mem = this._getMatchupMemory(cpuId, oppId);

    // 1. Update Markov Chain
    if (mem.lastOpponentMove && oppMoveKey) {
      if (!mem.transitions[mem.lastOpponentMove]) {
        mem.transitions[mem.lastOpponentMove] = {};
      }
      const counts = mem.transitions[mem.lastOpponentMove];
      counts[oppMoveKey] = (counts[oppMoveKey] || 0) + 1;
    }
    mem.lastOpponentMove = oppMoveKey;

    // 2. Update Reinforcement Experience Bias
    if (cpuMoveKey) {
      if (!mem.moveExperience[cpuMoveKey]) mem.moveExperience[cpuMoveKey] = 0;
      const rewardDelta = wasCpuSuccessful ? 4.5 : -3.5;
      mem.moveExperience[cpuMoveKey] = 
        (mem.moveExperience[cpuMoveKey] * this.decayFactor) + rewardDelta;
    }
  }

  getPredictedOpponentMove(cpuId, oppId) {
    const mem = this._getMatchupMemory(cpuId, oppId);
    if (!mem.lastOpponentMove || !mem.transitions[mem.lastOpponentMove]) return null;

    const options = mem.transitions[mem.lastOpponentMove];
    let total = 0;
    let mostLikely = null;
    let maxCount = -1;

    for (const [move, count] of Object.entries(options)) {
      total += count;
      if (count > maxCount) {
        maxCount = count;
        mostLikely = move;
      }
    }

    return total >= 3 ? { move: mostLikely, confidence: maxCount / total } : null;
  }

  getMoveExperienceBias(cpuId, oppId) {
    return this._getMatchupMemory(cpuId, oppId).moveExperience;
  }
}

// Global Knowledge Instance
window.globalAIKnowledge = new AIKnowledgeBase();

/**
 * Evaluates whether a CPU move achieved a net-positive tactical outcome.
 */
function calculateMoveSuccess(cpuPlayer, opponentPlayer, cpuMoveKey, turnResult = {}) {
  const {
    damageDealt = 0,
    damageTaken = 0,
    cpuWasHit = false,
    cpuWasInterrupted = false,
    oppWasGuarded = false,
    chiSpent = 0,
    oppAttemptedAttack = false,
    faintRecovered = 0
  } = turnResult;

  if (cpuWasInterrupted) return false;
  if (cpuWasHit && damageTaken > damageDealt) return false;

  if (damageDealt > 0) {
    if (oppWasGuarded && chiSpent >= 4 && damageDealt < 25) return false;
    return true;
  }

  if (cpuMoveKey.startsWith('A+')) {
    if (cpuPlayer.isGuarding && oppAttemptedAttack && damageTaken <= 5) return true;
    if (!oppAttemptedAttack) return false;
  }

  if (cpuMoveKey === 'W+L' && faintRecovered > 20 && !cpuWasHit) return true;

  if (['W+K', 'W+I'].includes(cpuMoveKey)) {
    return !cpuWasHit && damageTaken === 0;
  }

  return !cpuWasHit && damageTaken === 0;
}

window.calculateMoveSuccess = calculateMoveSuccess;

/**
 * Primary CPU Decision Engine
 */
function selectCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty = 'hard') {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  const cpuChi = cpuPlayer.chi || 0;
  const oppLp = Math.max(1, opponentPlayer.lp || 1);
  const cpuLp = Math.max(1, cpuPlayer.lp || 1);
  const cpuMaxLp = cpuPlayer.maxLp || 1000;
  const oppMaxLp = opponentPlayer.maxLp || 1000;
  
  const cpuId = cpuPlayer.id || 'ichigo';
  const oppId = opponentPlayer.id || 'nigo';
  const isIchigo = cpuId === 'ichigo';
  const isNigo = cpuId === 'nigo';

  const affordableKeys = Object.keys(movesData).filter(key => {
    const move = movesData[key];
    return move && typeof move === 'object' && (move.chiCost || 0) <= cpuChi;
  });

  if (affordableKeys.length === 0) return 'D+J';
  if (affordableKeys.length === 1) return affordableKeys[0];

  const TEMPERATURE_MAP = { easy: 35.0, normal: 18.0, hard: 6.5 };
  const temperature = TEMPERATURE_MAP[difficulty] || 12.0;

  const activeBuffs = cpuPlayer.activeBuffs || [];
  const isAirborne = (cpuPlayer.airborneTicks && cpuPlayer.airborneTicks > 0) ||
                     activeBuffs.some(b => ['airborne_boost', 'airborne', 'hit_buff'].includes(b.id));
  const hasPowerBuff = activeBuffs.some(b => ['power_stance', 'power_focus', 'focus'].includes(b.id));
  const isOpponentStunned = opponentPlayer.isFainted || (opponentPlayer.faintMeter >= 100);
  const faintRatio = (cpuPlayer.faintMeter || 0) / 100;
  const healthRatio = cpuLp / cpuMaxLp;
  const oppHealthRatio = oppLp / oppMaxLp;

  let isOpponentConfirmed = false;
  let oppMove = null;
  if (typeof gameState !== 'undefined') {
    const oppSlot = cpuPlayer === gameState.p1 ? 'p2' : 'p1';
    isOpponentConfirmed = oppSlot === 'p1' ? gameState.input?.isConfirmed : gameState.p2IsConfirmed;
    const oppMoveKey = oppSlot === 'p1' ? gameState.input?.selectedMoveKey : gameState.p2SelectedMoveKey;
    if (isOpponentConfirmed && oppMoveKey && typeof getMoveForPlayer === 'function') {
      oppMove = getMoveForPlayer(oppSlot, oppMoveKey);
    }
  }

  // ACCUMULATED KNOWLEDGE
  const prediction = window.globalAIKnowledge.getPredictedOpponentMove(cpuId, oppId);
  const experienceBias = window.globalAIKnowledge.getMoveExperienceBias(cpuId, oppId);

  const utilities = {};

  affordableKeys.forEach(key => {
    const move = movesData[key];
    const baseDmg = move.baseDamage || move.damage || 0;
    const accuracy = move.hitChance !== undefined ? move.hitChance : (move.accuracy !== undefined ? move.accuracy : 100);
    const hitRate = Math.max(0.1, accuracy / 100);
    const chiCost = move.chiCost || 0;
    const expectedDmg = baseDmg * hitRate;

    let utility = 0;

    // --- OFFENSIVE VALUE ---
    utility += (expectedDmg / oppMaxLp) * 220;

    // --- CHI COST ---
    utility -= (chiCost / 10) * (isNigo ? 6 : 10);

    // --- LETHAL ---
    if (expectedDmg >= oppLp) utility += 70;
    else if (oppHealthRatio <= 0.25 && expectedDmg > 0) utility += 25;

    // --- AIRBORNE ---
    if (isAirborne) {
      if (key === 'S+L') utility += 65;
      else if (key === 'D+L') utility += 30;
      else if (['W+I', 'W+K'].includes(key)) utility -= 90;
      else if (key.startsWith('A+')) utility -= 80;
    }

    // --- STUN ---
    if (isOpponentStunned) {
      if (move.type === 'SPECIAL' && expectedDmg > 0) utility += 60;
      else if (expectedDmg > 0) utility += 30;
      if (['W+K', 'W+I'].includes(key)) utility -= 50;
      if (key.startsWith('A+')) utility -= 100;
    }

    // --- STANCE & BUFFS ---
    if (key === 'W+K') {
      if (hasPowerBuff) utility -= 80;
      else if (healthRatio < 0.25) utility -= 40;
      else utility += (isNigo ? 22 : 12);
    }

    if (key === 'W+I') {
      if (isAirborne) utility -= 90;
      else if (cpuChi >= (isIchigo ? 6 : 7)) utility += (isNigo ? 24 : 16);
      else utility -= 25;
    }

    if (key === 'W+L' && move.faintRecovery) {
      utility += faintRatio * 50;
    }

    // --- ARCHETYPE FLAVOR ---
    if (isNigo) {
      if (baseDmg >= 120) utility += 18;
      if (hasPowerBuff && expectedDmg > 0) utility += 15;
    } else if (isIchigo) {
      if (hitRate >= 0.95) utility += 12;
      if (key === 'S+K') utility += 14;
    }

    // --- ACCUMULATED KNOWLEDGE: MARKOV PATTERNS ---
    if (prediction && prediction.confidence >= 0.35) {
      const predOppKey = prediction.move;
      const weight = prediction.confidence * 35;

      if (['W+I', 'S+L', 'D+L'].includes(predOppKey) && key === 'S+L') utility += weight * 1.3;
      if (predOppKey.includes('SPECIAL') && key === 'A+I') utility += weight * 1.2;
      if (predOppKey.startsWith('A+') && move.type === 'GRAB') utility += weight * 1.4;
    }

    // --- ACCUMULATED KNOWLEDGE: REINFORCEMENT BIAS ---
    utility += (experienceBias[key] || 0);

    utilities[key] = Math.max(0.1, utility);
  });

  // BOLTZMANN SAMPLING
  const maxScore = Math.max(...Object.values(utilities));
  let sumExp = 0;
  const expProbabilities = {};

  affordableKeys.forEach(key => {
    const expVal = Math.exp((utilities[key] - maxScore) / temperature);
    expProbabilities[key] = expVal;
    sumExp += expVal;
  });

  let roll = Math.random() * sumExp;
  for (const key of affordableKeys) {
    roll -= expProbabilities[key];
    if (roll <= 0) return key;
  }

  return affordableKeys[0];
}

window.selectCPUMove = selectCPUMove;
 