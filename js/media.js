// ORIENTATION RESOLVER BASED ON NATIVE SOURCE FACING & UNMIRRORED EXCEPTIONS
function getTransformFlip(player, playerKey, moveObj = null) {
  if (!player) return 'scaleX(1)';

  // Determine native video orientation (Default: 'left', Nigo: 'right')
  const nativeFacing = player.sourceFacing || (player.id === 'nigo' ? 'right' : 'left');

  // P1 needs to face RIGHT, P2 needs to face LEFT
  let shouldFlip = false;
  if (nativeFacing === 'left') {
    shouldFlip = (playerKey === 'p1');
  } else {
    shouldFlip = (playerKey === 'p2');
  }

  // Invert flip if the move is explicitly marked unmirrored
  if (moveObj && moveObj.unmirrored) {
    shouldFlip = !shouldFlip;
  }

  return shouldFlip ? 'scaleX(-1)' : 'scaleX(1)';
}

// DYNAMIC BATCH PRELOAD OF MP4 CLIPS FROM RIDER MOVESET
async function preloadRiderVideos(riderId, riderMoves = {}) {
  const baseVideoFiles = [
    'idle.mp4', 'mid-air.mp4', 'faint.mp4', 'ko.mp4', 'victory.mp4', 'victory2.mp4',
    'hit.mp4', 'hit_physical.mp4', 'guard.mp4'
  ];

  const moveVideos = Object.values(riderMoves)
    .filter(m => m && typeof m === 'object' && m.video)
    .map(m => m.video);

  const videoFiles = Array.from(new Set([...baseVideoFiles, ...moveVideos]));

  const BATCH_SIZE = 4; // Concurrent video fetches
  for (let i = 0; i < videoFiles.length; i += BATCH_SIZE) {
    const batch = videoFiles.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (file) => {
      const rawUrl = `assets/videos/${riderId}/${file}`;
      if (gameState.videoCache[rawUrl]) return;

      try {
        const res = await fetch(rawUrl);
        if (res.ok) {
          const blob = await res.blob();
          gameState.videoCache[rawUrl] = URL.createObjectURL(blob);
        }
      } catch (e) {
        gameState.videoCache[rawUrl] = rawUrl;
      }
    }));
  }
}

function playCenterVideo(playerKey, videoFile, actionName = '', maxDurationMs = null, moveObj = null) {
  return new Promise((resolve) => {
    const centerBox = document.getElementById('center-box');
    const centerVid = document.getElementById('center-video');
    const actionLabel = document.getElementById('center-action-label');
    if (!centerBox || !centerVid) return resolve();

    const player = gameState[playerKey];
    if (!player) return resolve();

    if (actionLabel) {
      const slotPrefix = playerKey.toUpperCase();
      actionLabel.textContent = actionName ? `[${slotPrefix}] ${player.name} : ${actionName}!` : '';
      actionLabel.hidden = !actionName;
    }

    const isMirrorMatch = gameState.p1 && gameState.p2 && (gameState.p1.id === gameState.p2.id);

    centerBox.hidden = false;
    centerVid.muted = true;
    centerVid.playsInline = true;

    centerVid.classList.toggle('p2-mirror-palette', playerKey === 'p2' && isMirrorMatch);

    // Dynamic Orientation
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

    const rawUrl = `assets/videos/${player.id}/${videoFile}`;
    const videoUrl = gameState.videoCache[rawUrl] || rawUrl;
    centerVid.src = videoUrl;
    centerVid.load();

    centerVid.play().catch(() => cleanUpAndResolve());

    fallbackTimer = setTimeout(cleanUpAndResolve, maxDurationMs || 8000);
  });
}

function hideCenterScreen() {
  const centerBox = document.getElementById('center-box');
  if (centerBox) centerBox.hidden = true;
}

function updateCharacterMedia(playerKey, stateType) {
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

  // Dynamic Orientation
  videoEl.style.transform = getTransformFlip(player, playerKey, currentMove);

  const isMirrorMatch = gameState.p1 && gameState.p2 && (gameState.p1.id === gameState.p2.id);

  videoEl.muted = true;
  videoEl.playsInline = true;

  if (playerKey === 'p2') {
    videoEl.classList.toggle('p2-mirror-palette', isMirrorMatch);
  }

  const isLoopingState = ['idle.mp4', 'mid-air.mp4', 'faint.mp4'].includes(fileName);
  videoEl.loop = isLoopingState;

  const riderId = player.id || 'ichigo';
  const rawUrl = `assets/videos/${riderId}/${fileName}`;
  const videoUrl = gameState.videoCache[rawUrl] || rawUrl;

  if (videoEl.dataset.currentFile !== videoUrl || videoEl.paused || videoEl.readyState === 0) {
    videoEl.dataset.currentFile = videoUrl;
    videoEl.src = videoUrl;
    videoEl.load();
  }

  if (spriteEl) spriteEl.hidden = true;
  videoEl.hidden = false;

  const playPromise = videoEl.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {});
  }
}
