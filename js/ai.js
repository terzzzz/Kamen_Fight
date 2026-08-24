/**
 * Main AI Engine Dispatcher & Fallback Evaluator
 * Path: js/ai.js
 */

function selectCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  // ROUTE TO SPECIFIC CHARACTERS UNDER JS/VS/ IF AVAILABLE
  if (cpuPlayer.id === 'ichigo' && typeof selectIchigoCPUMove === 'function') {
    return selectIchigoCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty);
  }

  // GENERAL FALLBACK AI FOR OTHER CHARACTERS (NIGO, V3, ETC.)
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
function simulateCPUButtonPress(moveKey) {
  if (!moveKey || moveKey === 'DO_NOTHING') return;
  const p2Box = document.getElementById('p2-box');
  if (!p2Box) return;

  const btn = p2Box.querySelector(`.key-btn[data-key="${moveKey}"]`) || p2Box.querySelector(`.cmd-btn[data-key="${moveKey}"]`);
  if (btn) {
    btn.classList.add('cpu-pressed');
    setTimeout(() => {
      btn.classList.remove('cpu-pressed');
    }, 400);
  }
}
