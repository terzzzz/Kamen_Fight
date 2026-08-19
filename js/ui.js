const AVAILABLE_RIDERS = [
  { id: 'ichigo', name: 'Kamen Rider Ichigo', icon: 'assets/images/icons/ichigo.png', maxLp: 1050 },
  { id: 'black', name: 'Kamen Rider Black', icon: 'assets/images/icons/black.png', maxLp: 1050 },
  { id: 'stronger', name: 'Kamen Rider Stronger', icon: 'assets/images/icons/stronger.png', maxLp: 1100 },
  { id: 'zx', name: 'Kamen Rider ZX', icon: 'assets/images/icons/zx.png', maxLp: 1080 }
];

let vsSelectionState = {
  step: 1, // 1: Choosing P1, 2: Choosing P2, 3: Ready to Fight
  p1Index: 0,
  p1IsCPU: false,
  p2Index: 3, // Defaults to ZX for P2
  p2IsCPU: true
};

document.addEventListener('DOMContentLoaded', () => {
  updateSelectionUI();
});

function cycleRider(playerKey, direction) {
  if (playerKey === 'p1' && vsSelectionState.step === 1) {
    vsSelectionState.p1Index = (vsSelectionState.p1Index + direction + AVAILABLE_RIDERS.length) % AVAILABLE_RIDERS.length;
  } else if (playerKey === 'p2' && vsSelectionState.step === 2) {
    vsSelectionState.p2Index = (vsSelectionState.p2Index + direction + AVAILABLE_RIDERS.length) % AVAILABLE_RIDERS.length;
  }
  updateSelectionUI();
}

function toggleControlType(playerKey) {
  if (playerKey === 'p1' && vsSelectionState.step === 1) {
    vsSelectionState.p1IsCPU = !vsSelectionState.p1IsCPU;
  } else if (playerKey === 'p2' && vsSelectionState.step === 2) {
    vsSelectionState.p2IsCPU = !vsSelectionState.p2IsCPU;
  }
  updateSelectionUI();
}

function handleConfirmStep() {
  const errorBanner = document.getElementById('vs-error-banner');
  if (errorBanner) errorBanner.hidden = true;

  if (vsSelectionState.step === 1) {
    vsSelectionState.step = 2;
  } else if (vsSelectionState.step === 2) {
    // Validate that at least one player is CPU (Local 2P restraint)
    if (!vsSelectionState.p1IsCPU && !vsSelectionState.p2IsCPU) {
      if (errorBanner) errorBanner.hidden = false;
      return;
    }
    vsSelectionState.step = 3;
  }
  updateSelectionUI();
}

function handleBackStep() {
  const errorBanner = document.getElementById('vs-error-banner');
  if (errorBanner) errorBanner.hidden = true;

  if (vsSelectionState.step > 1) {
    vsSelectionState.step--;
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const p1 = AVAILABLE_RIDERS[vsSelectionState.p1Index];
  const p2 = AVAILABLE_RIDERS[vsSelectionState.p2Index];

  // Update P1 Card Display
  document.getElementById('p1-img').src = p1.icon;
  document.getElementById('p1-name-display').textContent = p1.name;
  document.getElementById('p1-type-display').textContent = vsSelectionState.p1IsCPU ? 'CPU' : 'HUMAN';

  // Update P2 Card Display
  document.getElementById('p2-img').src = p2.icon;
  document.getElementById('p2-name-display').textContent = p2.name;
  document.getElementById('p2-type-display').textContent = vsSelectionState.p2IsCPU ? 'CPU' : 'HUMAN';

  // Manage Step Controls & Cards Focus
  const p1Card = document.getElementById('p1-card');
  const p2Card = document.getElementById('p2-card');
  const headerText = document.getElementById('vs-header-text');
  const confirmBtn = document.getElementById('confirm-btn');
  const startBtn = document.getElementById('start-game-btn');
  const backBtn = document.getElementById('back-btn');

  const p1LeftBtn = document.getElementById('p1-left-btn');
  const p1RightBtn = document.getElementById('p1-right-btn');
  const p2LeftBtn = document.getElementById('p2-left-btn');
  const p2RightBtn = document.getElementById('p2-right-btn');
  const p2TypeLeft = document.getElementById('p2-type-left');
  const p2TypeRight = document.getElementById('p2-type-right');

  if (vsSelectionState.step === 1) {
    headerText.textContent = 'STEP 1: SELECT PLAYER 1 RIDER';
    p1Card.className = 'rider-card active-slot';
    p2Card.className = 'rider-card locked-slot';

    p1LeftBtn.disabled = false;
    p1RightBtn.disabled = false;
    p2LeftBtn.disabled = true;
    p2RightBtn.disabled = true;
    if (p2TypeLeft) p2TypeLeft.disabled = true;
    if (p2TypeRight) p2TypeRight.disabled = true;

    confirmBtn.hidden = false;
    confirmBtn.textContent = 'CONFIRM P1';
    startBtn.hidden = true;
    backBtn.disabled = true;

  } else if (vsSelectionState.step === 2) {
    headerText.textContent = 'STEP 2: SELECT PLAYER 2 RIDER';
    p1Card.className = 'rider-card locked-slot';
    p2Card.className = 'rider-card active-slot';

    p1LeftBtn.disabled = true;
    p1RightBtn.disabled = true;
    p2LeftBtn.disabled = false;
    p2RightBtn.disabled = false;
    if (p2TypeLeft) p2TypeLeft.disabled = false;
    if (p2TypeRight) p2TypeRight.disabled = false;

    confirmBtn.hidden = false;
    confirmBtn.textContent = 'CONFIRM P2';
    startBtn.hidden = true;
    backBtn.disabled = false;

  } else if (vsSelectionState.step === 3) {
    headerText.textContent = 'READY FOR BATTLE!';
    p1Card.className = 'rider-card active-slot';
    p2Card.className = 'rider-card active-slot';

    p1LeftBtn.disabled = true;
    p1RightBtn.disabled = true;
    p2LeftBtn.disabled = true;
    p2RightBtn.disabled = true;
    if (p2TypeLeft) p2TypeLeft.disabled = true;
    if (p2TypeRight) p2TypeRight.disabled = true;

    confirmBtn.hidden = true;
    startBtn.hidden = false;
    backBtn.disabled = false;
  }
}

function validateAndStartMatch() {
  document.getElementById('vs-select-screen').hidden = true;

  const matchConfig = {
    p1Rider: AVAILABLE_RIDERS[vsSelectionState.p1Index],
    p1IsCPU: vsSelectionState.p1IsCPU,
    p2Rider: AVAILABLE_RIDERS[vsSelectionState.p2Index],
    p2IsCPU: vsSelectionState.p2IsCPU
  };

  if (typeof startBattle === 'function') {
    startBattle(matchConfig);
  }
}
