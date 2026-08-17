
let selectState = {
  p1Index: 9, // Kamen Rider Black
  p2Index: 6, // Kamen Rider Stronger
  p1Type: 'PLAYER', // 'PLAYER' or 'CPU'
  p2Type: 'CPU'     // 'PLAYER' or 'CPU'
};

let ridersData = []; // Populated from riders.json

// Initialize selection UI after loading JSON
async function initSelectionUI() {
  const response = await fetch('data/riders.json');
  ridersData = await response.json();
  updateCardUI('p1');
  updateCardUI('p2');
}

// Flip through riders list
function cycleRider(player, direction) {
  const key = player + 'Index';
  selectState[key] = (selectState[key] + direction + ridersData.length) % ridersData.length;
  updateCardUI(player);
}

// Toggle between PLAYER and CPU modes
function toggleControlType(player) {
  const key = player + 'Type';
  selectState[key] = selectState[key] === 'PLAYER' ? 'CPU' : 'PLAYER';
  document.getElementById(`${player}-type-display`).textContent = selectState[key];
  
  // Clear error banner on toggle
  document.getElementById('vs-error-banner').hidden = true;
}

// Update card UI details
function updateCardUI(player) {
  const rider = ridersData[selectState[player + 'Index']];
  document.getElementById(`${player}-img`).src = rider.icon;
  document.getElementById(`${player}-name-display`).textContent = rider.name;
}

// Check conditions before starting match
function validateAndStartMatch() {
  const errorBanner = document.getElementById('vs-error-banner');

  // Rule: Cannot start if BOTH slots are set to PLAYER
  if (selectState.p1Type === 'PLAYER' && selectState.p2Type === 'PLAYER') {
    errorBanner.hidden = false;
    errorBanner.textContent = "2-Player Local Mode Unavailable! At least one slot must be CPU.";
    return;
  }

  errorBanner.hidden = true;

  // Initialize and start battle state in game.js
  startBattle({
    p1Rider: ridersData[selectState.p1Index],
    p1IsCPU: selectState.p1Type === 'CPU',
    p2Rider: ridersData[selectState.p2Index],
    p2IsCPU: selectState.p2Type === 'CPU'
  });
}

window.onload = initSelectionUI;
