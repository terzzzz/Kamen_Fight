/**
 * Main AI Engine Dispatcher & Learning Memory Manager
 * Path: js/ai.js
 */

// GLOBAL AI KNOWLEDGE BASE & HABIT TRACKER
window.globalAIKnowledge = {
  memoryStore: {},
  playerProfiles: {},

  /**
   * Records outcome of each round, tracking opponent charge habits and move success
   */
  recordTurnOutcome: function(cpuPlayer, opponentPlayer, oppMoveKey, cpuMoveKey, outcomeData) {
    const oppId = (opponentPlayer && opponentPlayer.id) ? opponentPlayer.id : 'human';
    
    // 1. INITIALIZE PLAYER PROFILE IF NEW
    if (!this.playerProfiles[oppId]) {
      this.playerProfiles[oppId] = {
        totalRounds: 0,
        attackCount: 0,
        guardCount: 0,
        chargeSamples: { D: [], S: [] },
        avgCharge: { D: 88, S: 100 }
      };
    }

    const profile = this.playerProfiles[oppId];
    profile.totalRounds++;

    // 2. TRACK ACTION TYPES (ATTACK VS GUARD)
    if (oppMoveKey && oppMoveKey.startsWith('A+')) {
      profile.guardCount++;
    } else if (oppMoveKey && oppMoveKey !== 'DO_NOTHING') {
      profile.attackCount++;
    }

    // 3. TRACK CHARGE PERCENTAGE HABITS FOR SPEED PRIORITY TUNING
    const oppCharge = (outcomeData && typeof outcomeData.oppChargePercent === 'number') 
      ? outcomeData.oppChargePercent 
      : 100;

    if (oppMoveKey && oppMoveKey.startsWith('D')) {
      profile.chargeSamples.D.push(oppCharge);
      if (profile.chargeSamples.D.length > 20) profile.chargeSamples.D.shift();
      profile.avgCharge.D = Math.round(
        profile.chargeSamples.D.reduce((a, b) => a + b, 0) / profile.chargeSamples.D.length
      );
    } else if (oppMoveKey && oppMoveKey.startsWith('S')) {
      profile.chargeSamples.S.push(oppCharge);
      if (profile.chargeSamples.S.length > 20) profile.chargeSamples.S.shift();
      profile.avgCharge.S = Math.round(
        profile.chargeSamples.S.reduce((a, b) => a + b, 0) / profile.chargeSamples.S.length
      );
    }

    // 4. RECORD MOVE SUCCESS MEMORY
    const key = `${cpuPlayer.id}_vs_${oppId}_${cpuMoveKey}`;
    if (!this.memoryStore[key]) {
      this.memoryStore[key] = { uses: 0, wins: 0, totalDmgDealt: 0 };
    }
    this.memoryStore[key].uses++;
    if (outcomeData && outcomeData.damageDealt > 0) {
      this.memoryStore[key].wins++;
      this.memoryStore[key].totalDmgDealt += outcomeData.damageDealt;
    }
  },

  /**
   * Serializes learning data for storage.js
   */
  serialize: function() {
    return JSON.stringify({
      memoryStore: this.memoryStore,
      playerProfiles: this.playerProfiles
    });
  },

  /**
   * Restores learning data from storage.js
   */
  deserialize: function(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed) {
        this.memoryStore = parsed.memoryStore || {};
        this.playerProfiles = parsed.playerProfiles || {};
      }
    } catch (e) {
      console.warn("Failed to parse AI knowledge payload", e);
    }
  }
};

/**
 * Calculates whether a CPU move attempt was overall successful
 */
window.calculateMoveSuccess = function(cpuPlayer, opponentPlayer, cpuMoveKey, outcomeData) {
  if (!outcomeData) return false;
  if (outcomeData.cpuWasHit && outcomeData.damageTaken > 150) return false;
  if (outcomeData.damageDealt > 0 || outcomeData.oppWasGuarded) return true;
  return outcomeData.faintRecovered > 0;
};

/**
 * Main CPU Dispatcher
 * Routes to character-specific AI modules (ichigo_cpu.js / nigo_cpu.js)
 */
function selectCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  // ROUTE TO ICHIGO SPECIFIC ENGINE
  if (cpuPlayer.id === 'ichigo' && typeof selectIchigoCPUMove === 'function') {
    return selectIchigoCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty);
  }

  // ROUTE TO NIGO SPECIFIC ENGINE
  if (cpuPlayer.id === 'nigo' && typeof selectNigoCPUMove === 'function') {
    return selectNigoCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty);
  }

  // GENERAL FALLBACK FOR OTHER UNIMPLEMENTED RIDERS
  const keys = Object.keys(availableMoves);
  if (keys.length === 0) return 'D+J';

  const affordableKeys = keys.filter(k => {
    const move = availableMoves[k];
    return move && typeof move === 'object' && (move.chiCost || 0) <= cpuPlayer.chi;
  });

  if (affordableKeys.length === 0) return 'D+J';

  if (difficulty === 'easy') {
    return affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
  }

  // FALLBACK GREEDY EVALUATION BY HIGHEST BASE DAMAGE
  let bestKey = affordableKeys[0];
  let maxDmg = -1;

  affordableKeys.forEach(k => {
    const m = availableMoves[k];
    const dmg = m.baseDamage || 0;
    if (dmg > maxDmg) {
      maxDmg = dmg;
      bestKey = k;
    }
  });

  return bestKey;
}

// SIMULATE CPU BUTTON LOCK-IN ANIMATION
function simulateCPUButtonPress(moveKey, playerKey = 'p2') {
  if (!moveKey || moveKey === 'DO_NOTHING') return;
  const targetBox = document.getElementById(`${playerKey}-box`);
  if (!targetBox) return;

  const btn = targetBox.querySelector(`.key-btn[data-key="${moveKey}"]`) || targetBox.querySelector(`.cmd-btn[data-key="${moveKey}"]`);
  if (btn) {
    btn.classList.add('cpu-pressed');
    setTimeout(() => {
      btn.classList.remove('cpu-pressed');
    }, 400);
  }
}
