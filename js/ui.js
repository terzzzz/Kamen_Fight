let selectState = {
  step: 1, // Step 1: P1 Select, Step 2: P2 Select
  p1Index: 9, // Kamen Rider Black
  p2Index: 6, // Kamen Rider Stronger
  p1Type: 'HUMAN',
  p2Type: 'CPU'
};

let ridersData = [];

async function initSelectionUI() {
  const response = await fetch('data/riders.json');
  ridersData = await response.json();
  updateCardUI('p1');
  updateCardUI('p2');
  applyStepState();
}

function cycleRider(player, direction) {
  const key = player + 'Index';
  selectState[key] = (selectState[key] + direction + ridersData.length) % ridersData.length;
  updateCardUI(player);
}

function toggleControlType(player) {
  const key = player + 'Type';
  selectState[key] = selectState[key] === 'HUMAN' ? 'CPU' : 'HUMAN';
  document.getElementById(`${player}-type-display`).textContent = selectState[key];
  document.getElementById('vs-error-banner').hidden = true;
}

function updateCardUI(player) {
  const rider = ridersData[selectState[player + 'Index']];
  document.getElementById(`${player}-img`).src = rider.icon;
  document.getElementById(`${player}-name-display`).textContent = rider.name;
}

function handleConfirmStep() {
  if (selectState.step === 1) {
    selectState.step = 2;
    applyStepState();
  }
}

function handleBackStep() {
  if (selectState.step === 2) {
    selectState.step = 1;
    applyStepState();
  }
}

function applyStepState() {
  const header = document.getElementById('vs-header-text');
  const p1Card = document.getElementById('p1-card');
  const p2Card = document.getElementById('p2-card');
  const p1Badge = document.getElementById('p1-badge');
  const p2Badge = document.getElementById('p2-badge');

  const p1Left = document.getElementById('p1-left-btn');
  const p1Right = document.getElementById('p1-right-btn');
  const p2Left = document.getElementById('p2-left-btn');
  const p2Right = document.getElementById('p2-right-btn');
  const p2TypeL = document.getElementById('p2-type-left');
  const p2TypeR = document.getElementById('p2-type-right');

  const confirmBtn = document.getElementById('confirm-btn');
  const startGameBtn = document.getElementById('start-game-btn');
  const backBtn = document.getElementById('back-btn');

  if (selectState.step === 1) {
    header.textContent = 'STEP 1: SELECT PLAYER 1 RIDER';

    p1Card.className = 'rider-card active-slot';
    p2Card.className = 'rider-card locked-slot';
    p1Badge.textContent = 'P1 CHOOSING';
    p2Badge.textContent = 'WAITING';

    p1Left.disabled = false;
    p1Right.disabled = false;
    p2Left.disabled = true;
    p2Right.disabled = true;
    p2TypeL.disabled = true;
    p2TypeR.disabled = true;

    backBtn.disabled = true;
    confirmBtn.hidden = false;
    confirmBtn.textContent = 'CONFIRM P1';
    startGameBtn.hidden = true;
  } else {
    header.textContent = 'STEP 2: SELECT PLAYER 2 RIDER';

    p1Card.className = 'rider-card locked-slot';
    p2Card.className = 'rider-card active-slot';
    p1Badge.textContent = 'P1 LOCKED';
    p2Badge.textContent = 'P2 CHOOSING';

    p1Left.disabled = true;
    p1Right.disabled = true;
    p2Left.disabled = false;
    p2Right.disabled = false;
    p2TypeL.disabled = false;
    p2TypeR.disabled = false;

    backBtn.disabled = false;
    confirmBtn.hidden = true;
    startGameBtn.hidden = false;
  }
}

function validateAndStartMatch() {
  const errorBanner = document.getElementById('vs-error-banner');

  if (selectState.p1Type === 'HUMAN' && selectState.p2Type === 'HUMAN') {
    errorBanner.hidden = false;
    return;
  }

  errorBanner.hidden = true;
  document.getElementById('vs-select-screen').style.display = 'none';

  startBattle({
    p1Rider: JSON.parse(JSON.stringify(ridersData[selectState.p1Index])),
    p1IsCPU: selectState.p1Type === 'CPU',
    p2Rider: JSON.parse(JSON.stringify(ridersData[selectState.p2Index])),
    p2IsCPU: selectState.p2Type === 'CPU'
  });
}

window.onload = () => {
  initSelectionUI();
  initItemPool();
};
