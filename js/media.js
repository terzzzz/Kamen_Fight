// ORIENTATION RESOLVER
function getTransformFlip(player, playerKey, moveObj = null) {
  if (!player) return 'scaleX(1)';

  const nativeFacing = player.sourceFacing || (player.id === 'nigo' ? 'right' : 'left');

  let shouldFlip = false;
  if (nativeFacing === 'left') {
    shouldFlip = (playerKey === 'p1');
  } else {
    shouldFlip = (playerKey === 'p2');
  }

  if (moveObj && moveObj.unmirrored) {
    shouldFlip = !shouldFlip;
  }

  return shouldFlip ? 'scaleX(-1)' : 'scaleX(1)';
}

// SAFE NON-BLOCKING PRELOADER
async function preloadRiderVideos(riderId, riderMoves = {}) {
  if (!riderId) return;

  if (!window.gameState) window.gameState = {};
  if (!window.gameState.videoCache) window.gameState.videoCache = {};

  const baseVideoFiles = [
    'idle.mp4', 'mid-air.mp4', 'faint.mp4', 'ko.mp4', 'victory.mp4', 'victory2.mp4',
    'hit.mp4', 'hit_physical.mp4', 'guard.mp4', 'windmill_guard.mp4'
  ];

  const moveVideos = Object.values(riderMoves || {})
    .filter(m => m && typeof m === 'object' && m.video)
    .map(m => m.video);

  const videoFiles = Array.from(new Set([...baseVideoFiles, ...moveVideos]));

  videoFiles.forEach(file => {
    const rawUrl = `assets/videos/${riderId}/${file}`;
    gameState.videoCache[rawUrl] = rawUrl;
  });
}

function playCenterVideo(playerKey, videoFile, actionName = '', maxDurationMs = null, moveObj = null) {
  return new Promise((resolve) => {
    const centerBox = document.getElementById('center-box');
    const centerVid = document.getElementById('center-video');
    const actionLabel = document.getElementById('center-action-label');
    if (!centerBox || !centerVid) {
      resolve();
      return;
    }

    const player = gameState ? gameState[playerKey] : null;
    if (!player) {
      resolve();
      return;
    }

    if (actionLabel) {
      const slotPrefix = playerKey.toUpperCase();
      actionLabel.textContent = actionName ? `[${slotPrefix}] ${player.name} : ${actionName}!` : '';
      actionLabel.hidden = !actionName;
    }

    const isMirrorMatch = gameState.p1 && gameState.p2 && (gameState.p1.id === gameState.p2.id);

    centerBox.hidden = false;
    centerVid.muted = true;
    centerVid.playsInline = true;
    centerVid.setAttribute('playsinline', '');
    centerVid.setAttribute('webkit-playsinline', '');

    centerVid.classList.toggle('p2-mirror-palette', playerKey === 'p2' && isMirrorMatch);
    centerVid.style.transform = getTransformFlip(player, playerKey, moveObj);

    let resolved = false;
    let fallbackTimer = null;

    const cleanUpAndResolve = () => {
      if (resolved) return;
      resolved = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);

      centerVid.removeEventListener('ended', cleanUpAndResolve);
      centerVid.removeEventListener('error', cleanUpAndResolve);

      centerBox.hidden = true;
      if (actionLabel) actionLabel.hidden = true;
      resolve();
    };

    centerVid.addEventListener('ended', cleanUpAndResolve);
    centerVid.addEventListener('error', cleanUpAndResolve);

    const riderId = player.id || 'ichigo';
    const rawUrl = `assets/videos/${riderId}/${videoFile}`;
    const videoUrl = (gameState.videoCache && gameState.videoCache[rawUrl]) || rawUrl;

    if (centerVid.dataset.currentFile !== videoUrl) {
      centerVid.dataset.currentFile = videoUrl;
      centerVid.src = videoUrl;
    } else {
      try { centerVid.currentTime = 0; } catch (e) {}
    }

    const playPromise = centerVid.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        setTimeout(cleanUpAndResolve, 1000);
      });
    }

    fallbackTimer = setTimeout(cleanUpAndResolve, maxDurationMs || 8000);
  });
}

function hideCenterScreen() {
  const centerBox = document.getElementById('center-box');
  if (centerBox) centerBox.hidden = true;
}

function updateCharacterMedia(playerKey, stateType) {
  if (!gameState) return;
  const player = gameState[playerKey];
  if (!player) return;

  const videoEl = document.getElementById(`${playerKey}-video`);
  const spriteEl = document.getElementById(`${playerKey}-sprite`);
  if (!videoEl) return;

  let fileName = stateType;

  if (stateType === 'IDLE') {
    if (player.isFainted) {
      fileName = 'faint.mp4';
    } else if (player.airborneTicks > 0) {
      fileName = 'mid-air.mp4';
    } else {
      fileName = 'idle.mp4';
    }
  } else if (stateType === 'VICTORY' || stateType === 'victory') {
    fileName = Math.random() < 0.5 ? 'victory.mp4' : 'victory2.mp4';
  } else if (stateType === 'KO' || stateType === 'ko') {
    fileName = 'ko.mp4';
  }

  if (!fileName.endsWith('.mp4') && !fileName.endsWith('.webm')) {
    fileName += '.mp4';
  }

  const moves = playerKey === 'p1' ? gameState.p1Moves : gameState.p2Moves;
  const currentMove = moves ? Object.values(moves).find(m => m && m.video === fileName) : null;

  videoEl.style.transform = getTransformFlip(player, playerKey, currentMove);

  const isMirrorMatch = gameState.p1 && gameState.p2 && (gameState.p1.id === gameState.p2.id);

  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');

  if (playerKey === 'p2') {
    videoEl.classList.toggle('p2-mirror-palette', isMirrorMatch);
  }

  const isLoopingState = ['idle.mp4', 'mid-air.mp4', 'faint.mp4'].includes(fileName);
  videoEl.loop = isLoopingState;

  const riderId = player.id || 'ichigo';
  const rawUrl = `assets/videos/${riderId}/${fileName}`;
  const videoUrl = (gameState.videoCache && gameState.videoCache[rawUrl]) || rawUrl;

  if (videoEl.dataset.currentFile !== videoUrl) {
    videoEl.dataset.currentFile = videoUrl;
    videoEl.src = videoUrl;
    const playPromise = videoEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  } else if (videoEl.paused && isLoopingState && !videoEl.ended) {
    videoEl.play().catch(() => {});
  }

  if (spriteEl) spriteEl.hidden = true;
  videoEl.hidden = false;
}
