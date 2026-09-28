(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const TILE = 24;
  const VIEW_COLS = canvas.width / TILE;
  const VIEW_ROWS = canvas.height / TILE;
  const COLS = 72;
  const ROWS = 44;
  const MAX_HP = 10;
  const WAND_BLAST_RADIUS = 28;
  const MAX_CHARGE = 2;
  const MIN_SPIN_CHARGE = 1;
  const keys = new Set();
  const pressed = new Set();
  const colors = { wall: '#211a32', wallTop: '#42345a', floor: '#35294a', floorAlt: '#382c4e', gold: '#ffc857', cream: '#f8e8bd', pink: '#f2779c', mint: '#63e6b3', purple: '#966bdf', blue: '#5ea7ff', red: '#ff4f5e' };

  let map, rooms, player, enemies, projectiles, webs, particles, explosions, floatingTexts, exit, currentWeapon;
  let floor = 1, run = 0, score = 0, coins = 0, elapsed = 0, state = 'playing', lastTime = 0, shake = 0, levelSeed = 0;
  let mouse = { x: 0, y: 0, screenX: 0, screenY: 0, inside: false, down: false };
  let touchAimDirection = null;
  let touchMoveDirection = null;
  let touchAttackHeld = false;
  let camera = { x: 0, y: 0 };
  let audioContext, musicTimer, musicStep = 0, musicMuted = false, touchControlsEnabled = true;
  let activeDrawAudio = null, weaponDrawToken = 0;
  let bestScore = Number(localStorage.getItem('cryptbound-best') || 0);
  document.getElementById('bestScore').textContent = String(bestScore).padStart(4, '0');

  const weapons = {
    blade: { name: 'IRON SWORD', damage: 5, cooldown: .34, color: colors.pink },
    wand: { name: 'EMBER WAND', damage: 2, cooldown: .55, color: colors.mint },
    claws: { name: 'VAMPIRE CLAWS', damage: 1, cooldown: .18, color: '#d44d78' }
  };

  const soundFiles = {
    drawBlade: 'assets/draw_sword.wav',
    drawWand: 'assets/draw_bow.wav',
    wandFire: 'assets/Wooden_wand_fire1.mp3.ogg',
    wandSuperFire: 'assets/cow_mangler_main_shot.wav',
    axeHit: 'assets/knight_axe_hit.wav',
    swordSwing: 'assets/demo_sword_swing1.wav',
    explosion: 'assets/cow_mangler_explode.wav',
    deflect: 'assets/bulletltor14.wav',
    enemyDeath: 'assets/flow.wav',
    enemyDissolve: 'assets/dissolve.wav',
    critReceived: 'assets/crit_received1.wav',
    spinStart: 'assets/discipline_device_power_up.wav',
    spinEnd: 'assets/discipline_device_power_down.wav',
    painSharp: 'assets/Medic_painsharp01.wav',
    painSevere: 'assets/Medic_painsevere04.wav',
    mageVoice: 'assets/magekilledu.wav',
    spiderWeb: 'assets/Spider_web.ogg',
    spiderPain: 'assets/Spider_pain.ogg',
    spiderDeath: 'assets/Spider_death.ogg',
    meleeHit1: 'assets/eviction_notice_01.wav',
    meleeHit2: 'assets/eviction_notice_02.wav'
  };

  function unlockAudio() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    startMusic();
  }

  function playFile(name, onEnded, volume = .7) {
    const audio = new Audio(soundFiles[name]);
    audio.preload = 'auto';
    audio.volume = Math.max(0, Math.min(1, volume));
    if (onEnded) audio.addEventListener('ended', onEnded, { once: true });
    audio.addEventListener('error', () => onEnded?.(), { once: true });
    audio.play().catch(() => onEnded?.());
    return audio;
  }

  function startMusic() {
    if (!audioContext || musicTimer) return;
    musicTimer = window.setInterval(scheduleMusicNote, 230);
    scheduleMusicNote();
  }

  function scheduleMusicNote() {
    if (!audioContext || musicMuted) return;
    const melody = [146.83, 155.56, 174.61, 196, 174.61, 155.56, 130.81, 116.54];
    const bass = [73.42, 73.42, 65.41, 65.41, 58.27, 58.27, 65.41, 49];
    const start = audioContext.currentTime + .02;
    const melodyOsc = audioContext.createOscillator(), melodyGain = audioContext.createGain();
    melodyOsc.type = 'sawtooth'; melodyOsc.frequency.setValueAtTime(melody[musicStep % melody.length], start);
    melodyGain.gain.setValueAtTime(.0001, start); melodyGain.gain.exponentialRampToValueAtTime(.05, start + .012); melodyGain.gain.exponentialRampToValueAtTime(.0001, start + .17);
    melodyOsc.connect(melodyGain); melodyGain.connect(audioContext.destination); melodyOsc.start(start); melodyOsc.stop(start + .19);
    if (musicStep % 2 === 0) {
      const bassOsc = audioContext.createOscillator(), bassGain = audioContext.createGain();
      bassOsc.type = 'square'; bassOsc.frequency.setValueAtTime(bass[musicStep % bass.length], start);
      bassGain.gain.setValueAtTime(.0001, start); bassGain.gain.exponentialRampToValueAtTime(.065, start + .015); bassGain.gain.exponentialRampToValueAtTime(.0001, start + .27);
      bassOsc.connect(bassGain); bassGain.connect(audioContext.destination); bassOsc.start(start); bassOsc.stop(start + .3);
    }
    musicStep += 1;
  }

  function tone(startFrequency, endFrequency, duration, type, volume, delay = 0) {
    if (!audioContext) return;
    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(start); oscillator.stop(start + duration + .02);
  }

  function playSfx(name) {
    if (!audioContext) return;
    if (name === 'slash') tone(240, 75, .11, 'sawtooth', .055);
    if (name === 'wand') { tone(330, 720, .13, 'triangle', .045); tone(680, 980, .08, 'square', .025, .04); }
    if (name === 'hit') tone(150, 70, .07, 'square', .04);
    if (name === 'death') { tone(160, 45, .16, 'square', .05); tone(90, 35, .2, 'triangle', .025, .04); }
    if (name === 'hurt') tone(125, 48, .18, 'sawtooth', .065);
    if (name === 'monster') { tone(185, 58, .24, 'sawtooth', .07); tone(92, 34, .28, 'triangle', .045, .035); }
    if (name === 'web') tone(420, 180, .13, 'triangle', .035);
    if (name === 'webBreak') tone(260, 80, .12, 'square', .045);
    if (name === 'mage') { tone(190, 430, .2, 'triangle', .045); tone(430, 700, .15, 'triangle', .025, .1); }
    if (name === 'deflect') { tone(560, 180, .09, 'square', .06); tone(880, 520, .11, 'triangle', .035, .03); }
    if (name === 'detonate') { tone(520, 180, .14, 'square', .08); tone(260, 70, .22, 'sawtooth', .05, .04); }
    if (name === 'gate') { tone(260, 520, .18, 'square', .04); tone(520, 780, .23, 'triangle', .03, .16); }
  }

  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function choice(list) { return list[Math.floor(Math.random() * list.length)]; }
  function shuffle(list) { for (let i = list.length - 1; i > 0; i -= 1) { const j = rand(0, i); [list[i], list[j]] = [list[j], list[i]]; } return list; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  function newRun() {
    floor = 1; run += 1; score = 0; coins = 0; elapsed = 0;
    document.getElementById('runNumber').textContent = String(run).padStart(2, '0');
    newFloor();
  }

  function newFloor() {
    if (activeDrawAudio) { activeDrawAudio.pause(); activeDrawAudio.currentTime = 0; activeDrawAudio = null; }
    weaponDrawToken += 1;
    // A fresh random layout is generated for every floor, including floors in the same run.
    levelSeed = Math.floor(Math.random() * 0xFFFFFFFF);
    map = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    rooms = [];
    enemies = [];
    projectiles = [];
    webs = [];
    particles = [];
    explosions = [];
    floatingTexts = [];
    currentWeapon = currentWeapon || 'blade';
    generateDungeon();
    const start = rooms[0];
    player = { x: (start.cx + .5) * TILE, y: (start.cy + .5) * TILE, w: 14, h: 16, hp: MAX_HP, maxHp: MAX_HP, speed: 145, slowTimer: 0, attackTimer: 0, swingTimer: 0, spinTimer: 0, spinAngle: 0, spinHitTimer: 0, charge: 0, charging: false, clawSelfDrainTimer: 2, invuln: 0, aimAngle: 0, facing: { x: 1, y: 0 }, drawState: null };
    updateCamera();
    mouse.screenX = canvas.width / 2 + 100; mouse.screenY = canvas.height / 2; syncMouseWorld(); mouse.inside = false; mouse.down = false;
    const last = rooms[rooms.length - 1];
    exit = { x: (last.cx + .5) * TILE, y: (last.cy + .5) * TILE, open: false, pulse: 0 };
    spawnEnemies();
    state = 'playing';
    document.getElementById('messageCard').classList.add('hidden');
    document.getElementById('pauseOverlay').classList.add('hidden');
    document.getElementById('pauseButton').textContent = 'PAUSE [P]';
    document.getElementById('floorNumber').textContent = `FLOOR ${String(floor).padStart(2, '0')}`;
    setTip('Clear the crypt. Find the gate.');
    updateHud();
  }

  function carveRoom(room) {
    for (let y = room.y; y < room.y + room.h; y += 1) for (let x = room.x; x < room.x + room.w; x += 1) map[y][x] = 1;
  }

  function carveCorridor(a, b) {
    let x = a.cx, y = a.cy;
    const horizontalFirst = Math.random() > .5;
    const dig = (tx, ty) => {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (map[y + oy] && map[y + oy][x + ox] !== undefined) map[y + oy][x + ox] = 1;
      }
      x = tx; y = ty;
    };
    const moveX = () => { while (x !== b.cx) dig(x + Math.sign(b.cx - x), y); };
    const moveY = () => { while (y !== b.cy) dig(x, y + Math.sign(b.cy - y)); };
    horizontalFirst ? (moveX(), moveY()) : (moveY(), moveX());
  }

  function generateDungeon() {
    const desired = rand(12, 18);
    let attempts = 0;
    while (rooms.length < desired && attempts < 320) {
      attempts += 1;
      const w = rand(4, 8), h = rand(4, 7), x = rand(1, COLS - w - 2), y = rand(1, ROWS - h - 2);
      const candidate = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
      if (rooms.some(room => candidate.x < room.x + room.w + 1 && candidate.x + candidate.w + 1 > room.x && candidate.y < room.y + room.h + 1 && candidate.y + candidate.h + 1 > room.y)) continue;
      rooms.push(candidate); carveRoom(candidate);
    }
    if (rooms.length >= 2) {
      const startRoom = rooms.splice(rand(0, rooms.length - 1), 1)[0];
      const farthestRoom = rooms.reduce((farthest, room) => {
        const currentDistance = Math.hypot(room.cx - startRoom.cx, room.cy - startRoom.cy);
        const farthestDistance = Math.hypot(farthest.cx - startRoom.cx, farthest.cy - startRoom.cy);
        return currentDistance > farthestDistance ? room : farthest;
      }, rooms[0]);
      rooms.splice(rooms.indexOf(farthestRoom), 1);
      rooms = [startRoom, ...shuffle(rooms), farthestRoom];
      for (let i = 1; i < rooms.length; i += 1) {
        carveCorridor(rooms[rand(0, i - 1)], rooms[i]);
        if (i > 1 && Math.random() < .35) carveCorridor(rooms[rand(0, i - 1)], rooms[i]);
      }
    }
    if (rooms.length < 2) { rooms = [{ x: 2, y: 2, w: 12, h: 8, cx: 8, cy: 6 }, { x: 20, y: 11, w: 12, h: 8, cx: 26, cy: 15 }]; rooms.forEach(carveRoom); carveCorridor(rooms[0], rooms[1]); }
  }

  function spawnEnemies() {
    const amount = Math.min((8 + floor * 3) * 2, 80);
    const safe = { x: player.x / TILE, y: player.y / TILE };
    const candidates = [];
    for (let y = 1; y < ROWS - 1; y += 1) for (let x = 1; x < COLS - 1; x += 1) if (map[y][x] && Math.hypot(x - safe.x, y - safe.y) > 7) candidates.push({ x, y });
    for (let i = 0; i < amount && candidates.length; i += 1) {
      const spot = candidates.splice(rand(0, candidates.length - 1), 1)[0];
      const type = i === 0 ? 'mage' : i === 1 ? 'tank' : i === amount - 1 ? choice(['boss', 'minotaur']) : choice(['skull', 'slime', 'bat', 'brute', 'wraith', 'mage', 'tank', 'spider', 'golem', 'imp', 'charger', 'necromancer']);
      const stats = { boss: [19, 1.4], minotaur: [25, 1.6], mage: [28, 1.25], tank: [17, 1.2], golem: [14, 1.35], brute: [22, 1.05], wraith: [57, .62], spider: [65, .65], bat: [43, .78], imp: [50, .7], slime: [25, .9], skull: [34, .82], charger: [78, .65], necromancer: [24, 1.45] }[type];
      const maxHp = type === 'boss' ? 28 + floor * 8 : type === 'minotaur' ? 36 + floor * 10 : type === 'tank' ? 14 : type === 'golem' ? 10 : type === 'necromancer' ? 9 : type === 'charger' ? 8 : 5;
      const size = type === 'boss' ? 28 : type === 'minotaur' ? 32 : type === 'tank' || type === 'golem' ? 20 : type === 'charger' ? 18 : 15;
      enemies.push({ x: (spot.x + .5) * TILE, y: (spot.y + .5) * TILE, w: size, h: size, hp: maxHp, maxHp, speed: stats[0] + floor * 2, damage: type === 'boss' ? 3 : type === 'minotaur' ? 4 : type === 'tank' || type === 'golem' || type === 'brute' || type === 'charger' ? 2 : 1, hitTimer: rand(0, 60) / 100, shotTimer: rand(30, 120) / 100, webTimer: rand(180, 330) / 100, growlTimer: rand(140, 360) / 100, clawDrain: false, clawDrainTimer: 0, chargeTimer: 0, chargeCooldown: type === 'minotaur' ? rand(100, 220) / 100 : 0, flash: 0, wobble: Math.random() * 6, steerSide: Math.random() < .5 ? -1 : 1, pathTimer: 0, pathDir: null, type });
    }
  }

  function isWallAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || map[ty][tx] === 0;
  }

  function canMove(entity, dx, dy) {
    const pad = 5;
    const left = entity.x - entity.w / 2 + pad, right = entity.x + entity.w / 2 - pad;
    const top = entity.y - entity.h / 2 + pad, bottom = entity.y + entity.h / 2 - pad;
    return !isWallAt(left + dx, top + dy) && !isWallAt(right + dx, top + dy) && !isWallAt(left + dx, bottom + dy) && !isWallAt(right + dx, bottom + dy);
  }

  function moveEntity(entity, dx, dy) {
    if (canMove(entity, dx, 0)) entity.x += dx;
    if (canMove(entity, 0, dy)) entity.y += dy;
  }

  function findEnemyPathStep(enemy) {
    const startX = Math.floor(enemy.x / TILE), startY = Math.floor(enemy.y / TILE);
    const targetX = Math.floor(player.x / TILE), targetY = Math.floor(player.y / TILE);
    if (startX === targetX && startY === targetY) return null;
    if (startX < 0 || startY < 0 || targetX < 0 || targetY < 0 || startX >= COLS || startY >= ROWS || targetX >= COLS || targetY >= ROWS) return null;
    const start = startY * COLS + startX, target = targetY * COLS + targetX;
    const cameFrom = new Int32Array(COLS * ROWS); cameFrom.fill(-2); cameFrom[start] = -1;
    const queue = new Int32Array(COLS * ROWS); let head = 0, tail = 0; queue[tail++] = start;
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < tail) {
      const current = queue[head++];
      if (current === target) break;
      const currentX = current % COLS, currentY = Math.floor(current / COLS);
      directions.forEach(([dx, dy]) => {
        const nextX = currentX + dx, nextY = currentY + dy;
        if (nextX < 1 || nextY < 1 || nextX >= COLS - 1 || nextY >= ROWS - 1 || !map[nextY][nextX]) return;
        const next = nextY * COLS + nextX;
        if (cameFrom[next] === -2) { cameFrom[next] = current; queue[tail++] = next; }
      });
    }
    if (cameFrom[target] === -2) return null;
    let step = target;
    while (cameFrom[step] !== start && cameFrom[step] !== -1) step = cameFrom[step];
    return { x: (step % COLS) - startX, y: Math.floor(step / COLS) - startY };
  }

  function moveEnemySmart(enemy, dx, dy, dt, speed = enemy.speed) {
    const desiredAngle = Math.atan2(dy, dx);
    const stepDistance = speed * dt;
    enemy.pathTimer -= dt;
    if (enemy.pathTimer <= 0) { enemy.pathDir = findEnemyPathStep(enemy); enemy.pathTimer = .3 + Math.random() * .18; }
    const pathAngle = enemy.pathDir ? Math.atan2(enemy.pathDir.y, enemy.pathDir.x) : desiredAngle;
    const angles = [desiredAngle, desiredAngle + enemy.steerSide * .65, desiredAngle - enemy.steerSide * .65, pathAngle, pathAngle + enemy.steerSide * .9, pathAngle - enemy.steerSide * .9];
    for (const candidateAngle of angles) {
      const vx = Math.cos(candidateAngle) * stepDistance, vy = Math.sin(candidateAngle) * stepDistance;
      if (canMove(enemy, vx, vy)) { moveEntity(enemy, vx, vy); return; }
    }
    moveEntity(enemy, Math.cos(desiredAngle) * stepDistance * .45, Math.sin(desiredAngle) * stepDistance * .45);
  }

  function updateCamera() {
    if (!player) return;
    camera.x = clamp(player.x - canvas.width / 2, 0, COLS * TILE - canvas.width);
    camera.y = clamp(player.y - canvas.height / 2, 0, ROWS * TILE - canvas.height);
  }

  function syncMouseWorld() {
    mouse.x = mouse.screenX + camera.x;
    mouse.y = mouse.screenY + camera.y;
  }

  function updatePlayerAim() {
    if (touchAimDirection) {
      player.facing = touchAimDirection;
      player.aimAngle = Math.atan2(touchAimDirection.y, touchAimDirection.x);
      return player.facing;
    }
    const dx = mouse.x - player.x, dy = mouse.y - player.y;
    if (Math.hypot(dx, dy) < 1) return { x: player.facing.x, y: player.facing.y };
    const length = Math.hypot(dx, dy);
    player.aimAngle = Math.atan2(dy, dx);
    player.facing = { x: dx / length, y: dy / length };
    return player.facing;
  }

  function breakNearbyWebs() {
    let broken = false;
    webs.forEach(web => {
      const dx = web.x - player.x, dy = web.y - player.y, distance = Math.hypot(dx, dy) || 1;
      if (distance < 50 && (dx * player.facing.x + dy * player.facing.y) / distance > .15) {
        web.life = 0; broken = true; burst(web.x, web.y, colors.cream, 10);
      }
    });
    if (broken) { webs = webs.filter(web => web.life > 0); playSfx('webBreak'); }
  }

  function beginAttackCharge() {
    if (state !== 'playing' || player.attackTimer > 0 || player.drawState || player.charging) return;
    unlockAudio();
    if (currentWeapon === 'claws') { attack(0); return; }
    player.charging = true; player.charge = 0;
  }

  function releaseAttackCharge() {
    if (!player.charging) return;
    const chargeSeconds = clamp(player.charge, 0, MAX_CHARGE);
    const charge = chargeSeconds / MAX_CHARGE;
    player.charging = false; player.charge = 0; attack(charge);
  }

  function attack(charge = 0) {
    if (state !== 'playing' || player.attackTimer > 0 || player.drawState) return;
    unlockAudio();
    const aim = updatePlayerAim();
    const weapon = weapons[currentWeapon];
    const chargeSeconds = charge * MAX_CHARGE;
    const charged = chargeSeconds >= MIN_SPIN_CHARGE;
    const spinAttack = currentWeapon === 'blade' && chargeSeconds >= MIN_SPIN_CHARGE;
    player.attackTimer = weapon.cooldown; player.swingTimer = currentWeapon === 'blade' ? (spinAttack ? .3 : .16) : currentWeapon === 'claws' ? .12 : 0;
    if (currentWeapon === 'wand') {
      const blueCharge = chargeSeconds > MIN_SPIN_CHARGE;
      const damage = Math.round(weapon.damage * (1 + charge * 2.2)) + (charged ? 1 : 0);
      const blastRadius = WAND_BLAST_RADIUS + charge * 26;
      projectiles.push({ owner: 'player', kind: 'wand', superShot: charged, blueCharge, blastRadius, x: player.x + aim.x * 12, y: player.y + aim.y * 12, vx: aim.x * (charged ? 340 : 270), vy: aim.y * (charged ? 340 : 270), life: charged ? 1.1 : .8, damage, color: blueCharge ? colors.blue : weapon.color });
      burst(player.x + aim.x * 10, player.y + aim.y * 10, weapon.color, charged ? 12 : 5); playFile(charged ? 'wandSuperFire' : 'wandFire');
    } else {
      const clawAttack = currentWeapon === 'claws';
      const damage = clawAttack ? weapon.damage : Math.round(weapon.damage * (1 + charge * 1.2));
      const hitX = player.x + aim.x * 22, hitY = player.y + aim.y * 22;
      burst(hitX, hitY, weapon.color, clawAttack ? 5 : charged ? 16 : 7); if (!clawAttack) breakNearbyWebs();
      if (spinAttack) {
        const spinProgress = clamp((chargeSeconds - MIN_SPIN_CHARGE) / (MAX_CHARGE - MIN_SPIN_CHARGE), 0, 1);
        player.spinTimer = 1 + spinProgress * 1.2; player.spinAngle = 0; player.spinHitTimer = 0;
        playFile('spinStart');
      } else {
        const attackRange = clawAttack ? 31 : 47;
        enemies.forEach(enemy => { const toEnemyX = enemy.x - player.x, toEnemyY = enemy.y - player.y; const length = Math.hypot(toEnemyX, toEnemyY) || 1; if (length < attackRange && (toEnemyX * aim.x + toEnemyY * aim.y) / length > .45) damageEnemy(enemy, damage, clawAttack ? 'claws' : 'sword'); });
      }
      playFile('swordSwing', null, clawAttack ? .5 : 2);
    }
  }

  function damageEnemy(enemy, damage, source = 'projectile') {
    if (enemy.hp <= 0) return;
    enemy.hp -= damage; enemy.flash = .12; shake = Math.max(shake, 3);
    if (source === 'sword' || source === 'claws' || source === 'clawDrain') playFile('axeHit', null, source === 'claws' ? .5 : 2); else playSfx('hit');
    if (enemy.type === 'mage') playFile('painSharp', null, .65);
    if (enemy.type === 'spider') playFile('spiderPain', null, .75);
    floatingTexts.push({ x: enemy.x, y: enemy.y - 12, text: `-${damage}`, color: colors.gold, life: .7 });
    burst(enemy.x, enemy.y, colors.pink, 4);
    if (source === 'claws' && player.hp < player.maxHp) {
      const healing = Math.min(.5, player.maxHp - player.hp);
      player.hp += healing;
      floatingTexts.push({ x: player.x, y: player.y - 17, text: `+${healing.toFixed(1)}`, color: colors.mint, life: .7 });
      burst(player.x, player.y, colors.mint, 4);
    }
    if (source === 'claws') { enemy.clawDrain = true; enemy.clawDrainTimer = enemy.clawDrainTimer > 0 ? enemy.clawDrainTimer : 2; }
    if (enemy.hp <= 0) {
      const vaporizing = source === 'wand' || source === 'deflect';
      enemy.vaporizing = vaporizing; enemy.deathTimer = vaporizing ? 1.8 : 0; enemy.deathDuration = 1.8;
      score += enemy.type === 'boss' || enemy.type === 'minotaur' ? 700 : enemy.type === 'tank' ? 250 : enemy.type === 'mage' ? 150 : 100;
      coins += rand(3, 9); burst(enemy.x, enemy.y, colors.gold, enemy.type === 'boss' || enemy.type === 'minotaur' ? 30 : 13);
      if ((source === 'sword' || source === 'claws' || source === 'clawDrain') && Math.random() > .3) playFile('enemyDeath', null, .25);
      if (source === 'wand' || source === 'deflect') playFile('enemyDissolve', null, .35);
      if (enemy.type === 'mage') playFile('painSevere', null, .8);
      if (enemy.type === 'spider') playFile('spiderDeath', null, .8);
    }
  }

  function hurtPlayer(amount, sourceType = '', melee = false) {
    if (player.invuln > 0 || player.spinTimer > 0 || state !== 'playing') return;
    player.hp = Math.max(0, player.hp - amount); player.invuln = .65; shake = 7; playSfx('hurt'); playFile('critReceived', null, .75);
    if (melee) playFile(Math.random() < .5 ? 'meleeHit1' : 'meleeHit2', null, .8);
    floatingTexts.push({ x: player.x, y: player.y - 15, text: `-${amount}`, color: colors.pink, life: .8 });
    burst(player.x, player.y, colors.pink, 7);
    if (player.hp <= 0) { if (sourceType === 'mage') playFile('mageVoice', null, .75); endGame(false); }
  }

  function burstProjectile(projectile) {
    if (projectile.kind !== 'wand' || projectile.burstDone) return;
    projectile.burstDone = true;
    burst(projectile.x, projectile.y, colors.mint, 28);
    burst(projectile.x, projectile.y, colors.cream, 14);
    explosions.push({ x: projectile.x, y: projectile.y, life: .34, duration: .34 });
    const blastRadius = projectile.blastRadius || WAND_BLAST_RADIUS;
    enemies.forEach(enemy => {
      const distance = Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y);
      if (enemy.hp > 0 && distance <= blastRadius) {
        const distanceRatio = clamp(distance / blastRadius, 0, 1);
        const falloff = .35 + .65 * (1 - distanceRatio);
        damageEnemy(enemy, Math.max(1, Math.round(projectile.damage * falloff)), 'wand');
      }
    });
    playFile('explosion', null, .25);
  }

  function detonateWand() {
    if (state !== 'playing') return;
    let detonated = false;
    projectiles.forEach(projectile => {
      if (projectile.owner === 'player' && projectile.kind === 'wand' && projectile.life > 0) { burstProjectile(projectile); projectile.life = 0; detonated = true; }
    });
    if (detonated) playSfx('detonate');
  }

  function placeWeb(x, y) {
    if (isWallAt(x, y)) return;
    const web = { kind: 'web', x, y, radius: 25, life: 11, arming: 1, pulse: Math.random() * 6 };
    webs.push(web);
    if (webs.length > 10) webs.shift();
    burst(x, y, colors.cream, 8); setTip('WEB LANDED. IT ARMS IN 1 SECOND.');
    return web;
  }

  function updateWebs(dt) {
    webs.forEach(web => { web.life -= dt; web.arming = Math.max(0, web.arming - dt); web.pulse += dt * 3; });
    webs = webs.filter(web => web.life > 0);
  }

  function deflectProjectile(projectile) {
    if (projectile.owner !== 'enemy' || currentWeapon !== 'blade' || (player.swingTimer <= 0 && player.spinTimer <= 0)) return false;
    const dx = projectile.x - player.x, dy = projectile.y - player.y, distance = Math.hypot(dx, dy) || 1;
    const aim = player.facing;
    const frontOfSword = (dx * aim.x + dy * aim.y) / distance > -.25;
    if (distance > 38 || !frontOfSword) return false;
    if (projectile.kind === 'web' || projectile.kind === 'webProjectile') { projectile.life = 0; burst(projectile.x, projectile.y, colors.cream, 12); playSfx('deflect'); return true; }
    projectile.owner = 'player'; projectile.kind = 'deflect'; projectile.damage = weapons.blade.damage; projectile.color = colors.pink; projectile.vx = aim.x * 325; projectile.vy = aim.y * 325; projectile.life = 1.25;
    burst(projectile.x, projectile.y, colors.gold, 10); shake = Math.max(shake, 4); playFile('deflect', null, 2);
    return true;
  }

  function endGame(won) {
    state = won ? 'won' : 'lost';
    const bonus = won ? floor * 250 : 0;
    score += bonus;
    if (score > bestScore) { bestScore = score; localStorage.setItem('cryptbound-best', bestScore); }
    document.getElementById('bestScore').textContent = String(bestScore).padStart(4, '0');
    document.getElementById('messageTitle').textContent = won ? 'GATE CLEARED' : 'YOU FADED';
    document.getElementById('messageBody').textContent = won ? `Floor ${floor} conquered. Score ${String(score).padStart(4, '0')}.` : `The crypt keeps your coins. Score ${String(score).padStart(4, '0')}.`;
    document.getElementById('messageCard').classList.remove('hidden');
    document.getElementById('statusLight').textContent = won ? '● CLEAR' : '● DOWN';
    document.getElementById('statusLight').style.color = won ? colors.mint : colors.pink;
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) particles.push({ x, y, vx: rand(-55, 55), vy: rand(-75, 10), life: rand(20, 45) / 100, color, size: rand(2, 4) });
  }

  function update(dt) {
    if (state === 'paused') return;
    elapsed += dt; shake = Math.max(0, shake - dt * 18); player.slowTimer = Math.max(0, player.slowTimer - dt); const wasSpinning = player.spinTimer > 0; player.spinTimer = Math.max(0, player.spinTimer - dt); if (player.spinTimer > 0) { player.spinAngle += dt * 24; player.spinHitTimer -= dt; if (player.spinHitTimer <= 0) { player.spinHitTimer = .28; breakNearbyWebs(); enemies.forEach(enemy => { if (enemy.hp > 0 && Math.hypot(enemy.x - player.x, enemy.y - player.y) < 62) damageEnemy(enemy, weapons.blade.damage, 'sword'); }); } } else if (wasSpinning) playFile('spinEnd'); player.attackTimer = Math.max(0, player.attackTimer - dt); player.swingTimer = Math.max(0, player.swingTimer - dt); player.invuln = Math.max(0, player.invuln - dt); exit.pulse += dt;
    if (player.drawState) player.drawState.elapsed += dt;
    if (state !== 'playing') { updateParticles(dt); return; }
    if (currentWeapon === 'claws' && !player.drawState) {
      player.clawSelfDrainTimer -= dt;
      if (player.clawSelfDrainTimer <= 0) { player.clawSelfDrainTimer = 2; hurtPlayer(1, 'clawSelfDrain'); if (state !== 'playing') return; }
    } else if (currentWeapon !== 'claws') player.clawSelfDrainTimer = 2;
    updateWebs(dt);
    let dx = 0, dy = 0;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (touchMoveDirection) { dx += touchMoveDirection.x; dy += touchMoveDirection.y; }
    if (dx || dy) { const length = Math.hypot(dx, dy) || 1; dx /= length; dy /= length; const webSlow = webs.some(web => web.arming <= 0 && Math.hypot(web.x - player.x, web.y - player.y) < web.radius + 10); const chargeSlow = player.charging ? .3 : 1; const spinBoost = player.spinTimer > 0 ? 1.2 : 1; const movementScale = webSlow ? .45 : 1; moveEntity(player, dx * player.speed * movementScale * chargeSlow * spinBoost * dt, dy * player.speed * movementScale * chargeSlow * spinBoost * dt); }
    if (player.spinTimer > 0) { particles.push({ x: player.x - player.facing.x * 12 + rand(-3, 3), y: player.y - player.facing.y * 12 + rand(-3, 3), vx: -player.facing.x * 22 + rand(-16, 16), vy: -player.facing.y * 22 + rand(-16, 16), life: .22, color: Math.random() < .5 ? colors.gold : colors.cream, size: rand(2, 4) }); }
    updateCamera(); syncMouseWorld(); if (mouse.inside) updatePlayerAim();
    if (pressed.has('x')) detonateWand();
    const attackHeld = keys.has('space') || mouse.down || touchAttackHeld;
    if (attackHeld) {
      if (currentWeapon === 'claws') {
        player.charging = false; player.charge = 0;
        if (player.attackTimer <= 0) attack(0);
      } else {
        if (!player.charging) beginAttackCharge(); player.charge = Math.min(MAX_CHARGE, player.charge + dt);
      }
    }
    else if (player.charging) releaseAttackCharge();
    enemies.forEach(enemy => {
      if (enemy.hp <= 0) {
        if (enemy.vaporizing && enemy.deathTimer > 0) {
          enemy.deathTimer -= dt;
          if (Math.random() < dt * 34) particles.push({ x: enemy.x + rand(-enemy.w, enemy.w), y: enemy.y + rand(-enemy.h, enemy.h), vx: rand(-42, 42), vy: rand(-55, 15), life: rand(18, 35) / 100, color: colors.blue, size: rand(2, 5) });
        }
        return;
      }
      enemy.flash = Math.max(0, enemy.flash - dt); enemy.hitTimer -= dt; enemy.wobble += dt * 4;
      enemy.shotTimer -= dt; enemy.webTimer -= dt; enemy.growlTimer -= dt;
      if (enemy.type === 'minotaur') { enemy.chargeTimer = Math.max(0, enemy.chargeTimer - dt); enemy.chargeCooldown = Math.max(0, enemy.chargeCooldown - dt); }
      if (enemy.clawDrain) {
        enemy.clawDrainTimer -= dt;
        if (enemy.clawDrainTimer <= 0) { enemy.clawDrainTimer = 2; damageEnemy(enemy, 1, 'clawDrain'); if (enemy.hp <= 0) return; }
      }
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x), distance = dist(player, enemy);
      if (enemy.growlTimer <= 0 && distance < 280) { playSfx('monster'); enemy.growlTimer = rand(180, 420) / 100; }
      if (enemy.type === 'boss' || enemy.type === 'minotaur') {
        const minotaur = enemy.type === 'minotaur';
        if (minotaur && enemy.chargeTimer <= 0 && enemy.chargeCooldown <= 0 && distance > 52 && distance < 210) { enemy.chargeTimer = .75; enemy.chargeCooldown = 3.2; burst(enemy.x, enemy.y, colors.gold, 12); playSfx('monster'); }
        if (distance > (minotaur ? 52 : 46)) { const charging = minotaur && enemy.chargeTimer > 0; const bossSpeed = charging ? enemy.speed * 3.2 : minotaur && distance < 210 ? enemy.speed * 1.45 : enemy.speed; moveEnemySmart(enemy, Math.cos(angle), Math.sin(angle), dt, bossSpeed); }
        if (!minotaur && distance < 360 && enemy.shotTimer <= 0) {
          [-.22, 0, .22].forEach(spread => projectiles.push({ owner: 'enemy', kind: 'boss', x: enemy.x, y: enemy.y, vx: Math.cos(angle + spread) * 170, vy: Math.sin(angle + spread) * 170, life: 2.2, damage: 2, color: colors.pink }));
          enemy.shotTimer = 2.15; burst(enemy.x, enemy.y, colors.pink, 9); playSfx('mage');
        }
      } else if (enemy.type === 'mage') {
        if (distance > 185) moveEnemySmart(enemy, Math.cos(angle), Math.sin(angle), dt);
        else if (distance < 110) moveEnemySmart(enemy, -Math.cos(angle), -Math.sin(angle), dt);
        if (distance < 340 && enemy.shotTimer <= 0) { projectiles.push({ owner: 'enemy', sourceType: 'mage', x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 145, vy: Math.sin(angle) * 145, life: 2.2, damage: 1, color: colors.purple }); enemy.shotTimer = 1.7; burst(enemy.x, enemy.y, colors.purple, 5); playSfx('mage'); }
      } else if (enemy.type === 'charger') {
        if (distance > 25) { const chargeSpeed = distance < 150 ? enemy.speed * 1.35 : enemy.speed; moveEnemySmart(enemy, Math.cos(angle), Math.sin(angle), dt, chargeSpeed); }
      } else if (enemy.type === 'necromancer') {
        if (distance > 220) moveEnemySmart(enemy, Math.cos(angle), Math.sin(angle), dt);
        else if (distance < 135) moveEnemySmart(enemy, -Math.cos(angle), -Math.sin(angle), dt);
        if (distance < 370 && enemy.shotTimer <= 0) { [-.16, .16].forEach(spread => projectiles.push({ owner: 'enemy', sourceType: 'necromancer', kind: 'necromancerBolt', x: enemy.x, y: enemy.y, vx: Math.cos(angle + spread) * 125, vy: Math.sin(angle + spread) * 125, life: 2.6, damage: 1, color: '#b087f0' })); enemy.shotTimer = 2.4; burst(enemy.x, enemy.y, '#b087f0', 8); playSfx('mage'); }
      } else if (enemy.type === 'spider') {
        if (distance > 28) moveEnemySmart(enemy, Math.cos(angle), Math.sin(angle), dt);
        if (distance < 330 && enemy.webTimer <= 0) {
          projectiles.push({ owner: 'enemy', kind: 'webProjectile', x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 135, vy: Math.sin(angle) * 135, life: 2.4, damage: 0, color: '#d9cee5' });
          enemy.webTimer = 2.8; playSfx('web'); playFile('spiderWeb', null, .75);
        }
      } else {
        if (distance > 28) moveEnemySmart(enemy, Math.cos(angle), Math.sin(angle), dt);
      }
      const contactDistance = enemy.type === 'boss' ? 40 : enemy.type === 'minotaur' ? 52 : enemy.type === 'tank' || enemy.type === 'golem' ? 32 : enemy.type === 'charger' ? 31 : 28;
      if (distance <= contactDistance && enemy.hitTimer <= 0) { playSfx('monster'); hurtPlayer(enemy.damage, enemy.type, true); enemy.hitTimer = enemy.type === 'boss' || enemy.type === 'minotaur' || enemy.type === 'brute' || enemy.type === 'tank' ? 1.15 : .85; }
    });
    projectiles.forEach(projectile => {
      projectile.x += projectile.vx * dt; projectile.y += projectile.vy * dt; projectile.life -= dt;
      if (projectile.superShot && projectile.life > 0) for (let trail = 0; trail < 2; trail += 1) particles.push({ x: projectile.x - projectile.vx * .025 + rand(-4, 4), y: projectile.y - projectile.vy * .025 + rand(-4, 4), vx: -projectile.vx * .08 + rand(-22, 22), vy: -projectile.vy * .08 + rand(-22, 22), life: .28, color: projectile.blueCharge ? colors.blue : colors.mint, size: rand(3, 6) });
      if (projectile.kind === 'webProjectile') {
        if (projectile.life > 0 && deflectProjectile(projectile)) return;
        const hitPlayer = Math.hypot(player.x - projectile.x, player.y - projectile.y) < 16;
        const hitWall = isWallAt(projectile.x, projectile.y);
        if (hitPlayer) { placeWeb(player.x, player.y); setTip('WEBBED! IT ARMS IN 1 SECOND. SWING YOUR SWORD TO BREAK IT.'); projectile.life = 0; }
        else if (hitWall || projectile.life <= 0) { if (!hitWall) placeWeb(projectile.x, projectile.y); projectile.life = 0; }
        return;
      }
      if (isWallAt(projectile.x, projectile.y)) { burstProjectile(projectile); projectile.life = 0; return; }
      if (projectile.owner === 'player') enemies.forEach(enemy => {
        if (projectile.life <= 0 || enemy.hp <= 0 || Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) >= 15) return;
        if (projectile.kind === 'wand') burstProjectile(projectile);
        else damageEnemy(enemy, projectile.damage, projectile.kind === 'deflect' ? 'deflect' : 'projectile');
        projectile.life = 0;
      });
      if (projectile.owner === 'enemy' && deflectProjectile(projectile)) { /* The sword caught it; its new owner is player. */ }
      if (projectile.owner === 'enemy' && Math.hypot(player.x - projectile.x, player.y - projectile.y) < 13) { const incomingDamage = currentWeapon === 'claws' ? projectile.damage * 1.5 : projectile.damage; hurtPlayer(incomingDamage, projectile.sourceType); projectile.life = 0; burst(projectile.x, projectile.y, colors.purple, 6); }
      if (projectile.life <= 0) burstProjectile(projectile);
    });
    projectiles = projectiles.filter(projectile => projectile.life > 0);
    enemies = enemies.filter(enemy => enemy.hp > 0 || (enemy.vaporizing && enemy.deathTimer > 0));
    if (!exit.open && enemies.length === 0) { exit.open = true; setTip('The gate is open! Step into the green light.'); burst(exit.x, exit.y, colors.mint, 24); playSfx('gate'); }
    if (exit.open && Math.hypot(player.x - exit.x, player.y - exit.y) < 20) { if (floor >= 3) endGame(true); else { floor += 1; score += 250; newFloor(); } }
    updateParticles(dt); updateHud();
  }

  function updateParticles(dt) {
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 125 * dt; p.life -= dt; }); particles = particles.filter(p => p.life > 0);
    explosions.forEach(explosion => { explosion.life -= dt; }); explosions = explosions.filter(explosion => explosion.life > 0);
    floatingTexts.forEach(t => { t.y -= 18 * dt; t.life -= dt; }); floatingTexts = floatingTexts.filter(t => t.life > 0);
  }

  function draw() {
    ctx.save();
    ctx.fillStyle = colors.wall; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (shake) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    ctx.translate(-camera.x, -camera.y);
    drawDungeon(); drawWebs(); drawExit(); drawProjectiles(); drawExplosions(); enemies.forEach(drawEnemy); drawPlayer(); drawParticles(); drawFloatingTexts();
    ctx.restore();
    drawCrosshair();
    ctx.restore();
    pressed.clear();
  }

  function drawDungeon() {
    for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) {
      const px = x * TILE, py = y * TILE;
      if (map[y][x]) {
        ctx.fillStyle = (x + y) % 5 === 0 ? colors.floorAlt : colors.floor; ctx.fillRect(px, py, TILE, TILE);
        if ((x * 13 + y * 7 + levelSeed) % 17 === 0) { ctx.fillStyle = '#4b385b'; ctx.fillRect(px + 5, py + 14, 3, 2); ctx.fillRect(px + 14, py + 8, 2, 2); }
      } else {
        ctx.fillStyle = colors.wall; ctx.fillRect(px, py, TILE, TILE);
        if (y < ROWS - 1 && map[y + 1][x]) { ctx.fillStyle = colors.wallTop; ctx.fillRect(px, py + TILE - 4, TILE, 4); }
        if (x < COLS - 1 && map[y][x + 1]) { ctx.fillStyle = '#2a2140'; ctx.fillRect(px + TILE - 3, py, 3, TILE); }
      }
    }
  }

  function drawExit() {
    const pulse = Math.sin(exit.pulse * 5) * 2;
    ctx.save(); ctx.translate(exit.x, exit.y);
    ctx.globalAlpha = exit.open ? .16 + (pulse + 2) / 20 : .1; ctx.fillStyle = exit.open ? colors.mint : colors.purple; ctx.fillRect(-16 - pulse, -16 - pulse, 32 + pulse * 2, 32 + pulse * 2); ctx.globalAlpha = 1;
    ctx.fillStyle = exit.open ? colors.mint : '#6d5689'; ctx.fillRect(-9, -11, 18, 23); ctx.fillStyle = colors.wall; ctx.fillRect(-5, -6, 10, 18); ctx.fillStyle = exit.open ? colors.cream : '#a084b4'; ctx.fillRect(4, 2, 2, 2);
    ctx.restore();
  }

  function drawPlayer() {
    if (player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0) return;
    ctx.save(); ctx.translate(Math.round(player.x), Math.round(player.y));
    ctx.rotate(player.spinTimer > 0 ? player.spinAngle : 0);
    ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fillRect(-9, 8, 18, 4);
    ctx.fillStyle = colors.gold; ctx.fillRect(-6, -10, 12, 5); ctx.fillRect(-9, -6, 18, 8); ctx.fillStyle = '#dd875d'; ctx.fillRect(-5, -2, 10, 7); ctx.fillStyle = colors.ink; ctx.fillRect(-7, 5, 5, 6); ctx.fillRect(2, 5, 5, 6);
    const drawProgress = player.drawState ? clamp(player.drawState.elapsed / player.drawState.duration, 0, 1) : 1;
    const swingDuration = currentWeapon === 'blade' ? (player.swingTimer > .16 ? .3 : .16) : currentWeapon === 'claws' ? .12 : .16;
    const swingProgress = player.swingTimer > 0 ? 1 - player.swingTimer / swingDuration : 1;
    const swingRotation = player.swingTimer > 0 ? -.9 + swingProgress * 1.8 : 0;
    ctx.save(); ctx.rotate(player.aimAngle + swingRotation); ctx.translate((1 - drawProgress) * -24, 0); ctx.globalAlpha = .35 + drawProgress * .65;
    if (currentWeapon === 'blade') {
      ctx.fillStyle = '#8c5a42'; ctx.fillRect(7, -2, 10, 4); ctx.fillStyle = colors.gold; ctx.fillRect(9, -5, 3, 10);
      ctx.fillStyle = '#e6d3b0'; ctx.beginPath(); ctx.moveTo(13, -3); ctx.lineTo(32, -3); ctx.lineTo(37, 0); ctx.lineTo(32, 3); ctx.lineTo(13, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = colors.cream; ctx.fillRect(16, -2, 15, 1);
      if (player.swingTimer > 0) { ctx.globalAlpha = player.swingTimer / swingDuration; ctx.strokeStyle = colors.pink; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 34, -.75, .75); ctx.stroke(); }
    } else if (currentWeapon === 'wand') {
      ctx.fillStyle = '#8c5a42'; ctx.fillRect(6, -2, 17, 4); ctx.fillStyle = colors.mint; ctx.fillRect(21, -4, 5, 8); ctx.fillStyle = colors.gold; ctx.fillRect(8, -4, 3, 8);
    } else {
      if (player.swingTimer > 0) { ctx.globalAlpha = player.swingTimer / swingDuration; ctx.strokeStyle = colors.pink; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 31, -.75, .75); ctx.stroke(); }
    }
    ctx.restore();
    if (player.charging) { const ratio = clamp(player.charge / MAX_CHARGE, 0, 1); ctx.globalAlpha = .9; ctx.fillStyle = '#1b1529'; ctx.fillRect(-18, -28, 36, 5); ctx.fillStyle = currentWeapon === 'blade' && player.charge >= MIN_SPIN_CHARGE ? colors.red : currentWeapon === 'wand' && player.charge > MIN_SPIN_CHARGE ? colors.blue : currentWeapon === 'wand' ? colors.mint : colors.gold; ctx.fillRect(-17, -27, 34 * ratio, 3); }
    ctx.restore();
  }

  function drawEnemySilhouette(enemy, fill) {
    ctx.fillStyle = fill;
    if (enemy.type === 'boss') { ctx.fillRect(-15, -13, 30, 25); ctx.fillRect(-10, -18, 20, 5); ctx.fillRect(-19, -8, 4, 15); ctx.fillRect(15, -8, 4, 15); }
    else if (enemy.type === 'minotaur') { ctx.fillRect(-15, -11, 30, 22); ctx.fillRect(-11, -17, 22, 8); ctx.fillRect(-21, -18, 8, 5); ctx.fillRect(13, -18, 8, 5); ctx.fillRect(-11, 11, 7, 8); ctx.fillRect(4, 11, 7, 8); }
    else if (enemy.type === 'mage') { ctx.fillRect(-9, -3, 18, 12); ctx.fillRect(-6, -9, 12, 6); ctx.fillRect(-10, -10, 20, 3); ctx.fillRect(-4, -14, 3, 5); }
    else if (enemy.type === 'charger') { ctx.fillRect(-10, -7, 20, 16); ctx.fillRect(-7, -12, 14, 5); ctx.fillRect(-12, -12, 4, 7); ctx.fillRect(8, -12, 4, 7); }
    else if (enemy.type === 'necromancer') { ctx.fillRect(-9, -2, 18, 12); ctx.fillRect(-8, -10, 16, 8); ctx.fillRect(10, -13, 2, 25); ctx.fillRect(8, -14, 6, 3); }
    else if (enemy.type === 'tank') { ctx.fillRect(-12, -9, 24, 18); ctx.fillRect(-9, -13, 18, 4); ctx.fillRect(-14, -5, 3, 10); ctx.fillRect(11, -5, 3, 10); }
    else if (enemy.type === 'golem') { ctx.fillRect(-11, -9, 22, 18); ctx.fillRect(-8, -13, 16, 4); ctx.fillRect(-15, -4, 4, 8); ctx.fillRect(11, -4, 4, 8); }
    else if (enemy.type === 'brute') { ctx.fillRect(-10, -7, 20, 16); ctx.fillRect(-7, -11, 14, 4); }
    else if (enemy.type === 'wraith') { ctx.fillRect(-7, -10, 14, 18); ctx.fillRect(-11, -2, 4, 8); ctx.fillRect(7, -2, 4, 8); }
    else if (enemy.type === 'spider') { ctx.fillRect(-8, -5, 16, 12); ctx.fillRect(-5, -9, 10, 5); ctx.fillRect(-13, -9, 4, 2); ctx.fillRect(-14, -3, 5, 2); ctx.fillRect(-13, 5, 4, 2); ctx.fillRect(9, -9, 4, 2); ctx.fillRect(9, -3, 5, 2); ctx.fillRect(9, 5, 4, 2); }
    else if (enemy.type === 'bat') { ctx.fillRect(-12, -2, 8, 7); ctx.fillRect(4, -2, 8, 7); ctx.fillRect(-7, -7, 14, 14); }
    else if (enemy.type === 'imp') { ctx.fillRect(-7, -4, 14, 12); ctx.fillRect(-5, -9, 10, 5); ctx.fillRect(-9, -12, 3, 5); ctx.fillRect(6, -12, 3, 5); }
    else if (enemy.type === 'slime') { ctx.fillRect(-8, -4, 16, 12); ctx.fillRect(-5, -8, 10, 4); }
    else { ctx.fillRect(-8, -8, 16, 16); ctx.fillRect(-5, -11, 10, 3); }
  }

  function drawVaporizingEnemy(enemy) {
    const progress = clamp(1 - enemy.deathTimer / enemy.deathDuration, 0, 1);
    const flicker = .7 + Math.abs(Math.sin(elapsed * 48 + enemy.wobble)) * .3;
    ctx.save(); ctx.translate(Math.round(enemy.x), Math.round(enemy.y + Math.sin(enemy.wobble) * 1.5));
    const blackAlpha = progress < .68 ? 1 : clamp((1 - progress) / .32, 0, 1);
    ctx.globalAlpha = blackAlpha; drawEnemySilhouette(enemy, '#05050a');
    ctx.globalAlpha = clamp((progress - .1) / .62, 0, 1) * flicker; drawEnemySilhouette(enemy, colors.blue);
    for (let i = 0; i < 8; i += 1) { const px = ((i * 13) % (enemy.w + 12)) - enemy.w / 2 - 6; const py = ((i * 19 + Math.floor(elapsed * 30) * 3) % (enemy.h + 16)) - enemy.h / 2 - 8; ctx.fillRect(px, py, 2 + (i % 2), 2 + ((i + 1) % 2)); }
    ctx.globalAlpha = clamp((progress - .15) / .65, 0, 1) * flicker; ctx.strokeStyle = colors.blue; ctx.lineWidth = 2; ctx.strokeRect(-enemy.w / 2 - 2, -enemy.h / 2 - 2, enemy.w + 4, enemy.h + 4);
    ctx.restore();
  }

  function drawEnemy(enemy) {
    if (enemy.hp <= 0) { if (enemy.vaporizing && enemy.deathTimer > 0) drawVaporizingEnemy(enemy); return; }
    ctx.save(); ctx.translate(Math.round(enemy.x), Math.round(enemy.y + Math.sin(enemy.wobble) * 1.5));
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-16, 15, 32, 4); ctx.fillStyle = enemy.flash ? colors.cream : ({ boss: '#b74765', minotaur: '#9d5148', mage: colors.purple, tank: '#c17b52', golem: '#8b8293', brute: '#e68c67', wraith: '#70c7d8', spider: '#bd6c96', bat: colors.pink, imp: '#df6b4e', slime: colors.mint, skull: colors.pink, charger: '#d94f63', necromancer: '#b087f0' }[enemy.type]);
    if (enemy.type === 'boss') { ctx.fillRect(-15, -13, 30, 25); ctx.fillRect(-10, -18, 20, 5); ctx.fillRect(-19, -8, 4, 15); ctx.fillRect(15, -8, 4, 15); ctx.fillStyle = colors.gold; ctx.fillRect(-8, -6, 5, 5); ctx.fillRect(4, -6, 5, 5); ctx.fillStyle = colors.ink; ctx.fillRect(-7, -5, 2, 3); ctx.fillRect(5, -5, 2, 3); }
    else if (enemy.type === 'minotaur') { ctx.fillRect(-13, -9, 26, 21); ctx.fillRect(-10, -15, 20, 8); ctx.fillStyle = colors.cream; ctx.fillRect(-20, -17, 9, 4); ctx.fillRect(11, -17, 9, 4); ctx.fillStyle = colors.gold; ctx.fillRect(-7, -4, 4, 4); ctx.fillRect(3, -4, 4, 4); ctx.fillStyle = colors.ink; ctx.fillRect(-6, -3, 2, 2); ctx.fillRect(4, -3, 2, 2); ctx.fillStyle = '#5d3437'; ctx.fillRect(-10, 12, 7, 8); ctx.fillRect(3, 12, 7, 8); }
    else if (enemy.type === 'mage') { ctx.fillRect(-9, -3, 18, 12); ctx.fillRect(-6, -9, 12, 6); ctx.fillStyle = colors.ink; ctx.fillRect(-10, -10, 20, 3); ctx.fillRect(-4, -14, 3, 5); ctx.fillStyle = colors.gold; ctx.fillRect(4, -4, 3, 3); }
    else if (enemy.type === 'charger') { ctx.fillRect(-10, -7, 20, 16); ctx.fillRect(-7, -12, 14, 5); ctx.fillStyle = colors.gold; ctx.fillRect(-12, -12, 4, 7); ctx.fillRect(8, -12, 4, 7); ctx.fillStyle = colors.ink; ctx.fillRect(-5, -3, 3, 3); ctx.fillRect(2, -3, 3, 3); }
    else if (enemy.type === 'necromancer') { ctx.fillRect(-9, -2, 18, 12); ctx.fillRect(-8, -10, 16, 8); ctx.fillStyle = colors.ink; ctx.fillRect(-4, -4, 3, 3); ctx.fillRect(2, -4, 3, 3); ctx.fillStyle = colors.gold; ctx.fillRect(10, -13, 2, 25); ctx.fillRect(8, -14, 6, 3); }
    else if (enemy.type === 'tank') { ctx.fillRect(-12, -9, 24, 18); ctx.fillRect(-9, -13, 18, 4); ctx.fillStyle = '#6b4850'; ctx.fillRect(-14, -5, 3, 10); ctx.fillRect(11, -5, 3, 10); ctx.fillStyle = colors.gold; ctx.fillRect(-6, -4, 4, 3); ctx.fillRect(3, -4, 4, 3); }
    else if (enemy.type === 'golem') { ctx.fillRect(-11, -9, 22, 18); ctx.fillRect(-8, -13, 16, 4); ctx.fillStyle = colors.ink; ctx.fillRect(-6, -4, 4, 4); ctx.fillRect(3, -4, 4, 4); ctx.fillStyle = '#b8aabc'; ctx.fillRect(-15, -4, 4, 8); ctx.fillRect(11, -4, 4, 8); }
    else if (enemy.type === 'brute') { ctx.fillRect(-10, -7, 20, 16); ctx.fillRect(-7, -11, 14, 4); ctx.fillStyle = colors.ink; ctx.fillRect(-6, -3, 4, 4); ctx.fillRect(3, -3, 4, 4); }
    else if (enemy.type === 'wraith') { ctx.fillRect(-7, -10, 14, 18); ctx.fillRect(-11, -2, 4, 8); ctx.fillRect(7, -2, 4, 8); ctx.fillStyle = colors.ink; ctx.fillRect(-4, -3, 3, 4); ctx.fillRect(2, -3, 3, 4); }
    else if (enemy.type === 'spider') { ctx.fillRect(-8, -5, 16, 12); ctx.fillRect(-5, -9, 10, 5); ctx.fillStyle = colors.ink; ctx.fillRect(-4, -4, 3, 3); ctx.fillRect(2, -4, 3, 3); ctx.fillStyle = '#9b547e'; ctx.fillRect(-13, -9, 4, 2); ctx.fillRect(-14, -3, 5, 2); ctx.fillRect(-13, 5, 4, 2); ctx.fillRect(9, -9, 4, 2); ctx.fillRect(9, -3, 5, 2); ctx.fillRect(9, 5, 4, 2); }
    else if (enemy.type === 'bat') { ctx.fillRect(-12, -2, 8, 7); ctx.fillRect(4, -2, 8, 7); ctx.fillRect(-7, -7, 14, 14); }
    else if (enemy.type === 'imp') { ctx.fillRect(-7, -4, 14, 12); ctx.fillRect(-5, -9, 10, 5); ctx.fillStyle = colors.ink; ctx.fillRect(-4, -3, 3, 3); ctx.fillRect(2, -3, 3, 3); ctx.fillStyle = colors.gold; ctx.fillRect(-9, -12, 3, 5); ctx.fillRect(6, -12, 3, 5); }
    else if (enemy.type === 'slime') { ctx.fillRect(-8, -4, 16, 12); ctx.fillRect(-5, -8, 10, 4); }
    else { ctx.fillRect(-8, -8, 16, 16); ctx.fillRect(-5, -11, 10, 3); }
    if (enemy.type !== 'boss' && enemy.type !== 'minotaur' && enemy.type !== 'brute' && enemy.type !== 'tank' && enemy.type !== 'golem' && enemy.type !== 'mage' && enemy.type !== 'charger' && enemy.type !== 'necromancer' && enemy.type !== 'wraith' && enemy.type !== 'spider' && enemy.type !== 'imp') { ctx.fillStyle = colors.ink; ctx.fillRect(-5, -3, 3, 4); ctx.fillRect(2, -3, 3, 4); }
    ctx.restore();
    const barWidth = enemy.type === 'boss' || enemy.type === 'minotaur' ? 46 : enemy.type === 'tank' || enemy.type === 'golem' ? 28 : enemy.type === 'charger' || enemy.type === 'necromancer' ? 24 : 20; const barY = enemy.type === 'boss' || enemy.type === 'minotaur' ? enemy.y - 34 : enemy.y - 20; ctx.fillStyle = '#1b1529'; ctx.fillRect(enemy.x - barWidth / 2, barY, barWidth, 3); ctx.fillStyle = enemy.type === 'boss' ? '#b74765' : enemy.type === 'minotaur' ? '#9d5148' : enemy.type === 'mage' || enemy.type === 'necromancer' ? colors.purple : enemy.type === 'charger' ? '#d94f63' : enemy.type === 'tank' || enemy.type === 'golem' ? '#c17b52' : colors.pink; ctx.fillRect(enemy.x - barWidth / 2, barY, barWidth * (enemy.hp / enemy.maxHp), 3);
  }

  function drawWebs() { webs.forEach(web => { const radius = web.radius + Math.sin(web.pulse) * 2; ctx.save(); ctx.globalAlpha = web.arming > 0 ? .22 : Math.min(.8, web.life / 5); ctx.strokeStyle = '#e8def0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(web.x, web.y, radius, 0, Math.PI * 2); ctx.moveTo(web.x - radius, web.y); ctx.lineTo(web.x + radius, web.y); ctx.moveTo(web.x, web.y - radius); ctx.lineTo(web.x, web.y + radius); ctx.moveTo(web.x - radius * .7, web.y - radius * .7); ctx.lineTo(web.x + radius * .7, web.y + radius * .7); ctx.moveTo(web.x + radius * .7, web.y - radius * .7); ctx.lineTo(web.x - radius * .7, web.y + radius * .7); ctx.stroke(); ctx.restore(); }); }
  function drawProjectiles() { projectiles.forEach(p => { if (p.kind === 'webProjectile') { ctx.save(); ctx.translate(p.x, p.y); ctx.strokeStyle = '#e8def0'; ctx.lineWidth = 2; ctx.strokeRect(-7, -7, 14, 14); ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7); ctx.stroke(); ctx.restore(); return; } if (p.superShot) { ctx.save(); ctx.globalAlpha = .25; ctx.fillStyle = p.blueCharge ? colors.blue : colors.mint; ctx.fillRect(p.x - 13, p.y - 13, 26, 26); ctx.globalAlpha = 1; ctx.fillStyle = p.color; ctx.fillRect(p.x - 8, p.y - 8, 16, 16); ctx.fillStyle = colors.cream; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); ctx.restore(); return; } ctx.fillStyle = p.color; ctx.fillRect(p.x - 4, p.y - 4, 8, 8); ctx.fillStyle = colors.cream; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); if (p.owner === 'enemy') { ctx.strokeStyle = colors.purple; ctx.strokeRect(p.x - 6, p.y - 6, 12, 12); } }); }
  function drawExplosions() { explosions.forEach(explosion => { const progress = 1 - explosion.life / explosion.duration; const radius = 8 + progress * 30; ctx.save(); ctx.globalAlpha = Math.max(0, explosion.life / explosion.duration); ctx.fillStyle = colors.cream; ctx.fillRect(explosion.x - 4, explosion.y - 4, 8, 8); ctx.strokeStyle = colors.mint; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha *= .45; ctx.fillStyle = colors.mint; ctx.fillRect(explosion.x - radius, explosion.y - radius, radius * 2, radius * 2); ctx.restore(); }); }
  function drawParticles() { particles.forEach(p => { ctx.globalAlpha = clamp(p.life * 3, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }); ctx.globalAlpha = 1; }
  function drawFloatingTexts() { floatingTexts.forEach(t => { ctx.globalAlpha = clamp(t.life * 2, 0, 1); ctx.fillStyle = t.color; ctx.font = '8px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.fillText(t.text, t.x, t.y); }); ctx.globalAlpha = 1; }
  function drawCrosshair() { if (!mouse.inside) return; ctx.save(); ctx.translate(mouse.screenX, mouse.screenY); ctx.globalAlpha = .75; ctx.strokeStyle = currentWeapon === 'wand' ? colors.mint : colors.gold; ctx.lineWidth = 1; ctx.strokeRect(-5, -5, 10, 10); ctx.fillRect(-1, -8, 2, 5); ctx.fillRect(-1, 3, 2, 5); ctx.fillRect(-8, -1, 5, 2); ctx.fillRect(3, -1, 5, 2); ctx.restore(); }

  function updateHud() {
    if (!player) return;
    document.getElementById('hpText').textContent = `${player.hp} / ${player.maxHp}`;
    document.getElementById('hpBar').style.width = `${player.hp / player.maxHp * 100}%`;
    document.getElementById('coinText').textContent = String(coins).padStart(3, '0');
    const seconds = Math.floor(elapsed); document.getElementById('depthText').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    document.querySelectorAll('.weapon-card').forEach(card => card.classList.toggle('active', card.dataset.weapon === currentWeapon));
  }
  function setTip(text) { document.getElementById('tipText').textContent = text; }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused'; document.getElementById('pauseOverlay').classList.remove('hidden'); document.getElementById('pauseButton').textContent = 'RESUME [P]'; document.getElementById('statusLight').textContent = '● PAUSED'; document.getElementById('statusLight').style.color = colors.gold;
    } else if (state === 'paused') {
      state = 'playing'; document.getElementById('pauseOverlay').classList.add('hidden'); document.getElementById('pauseButton').textContent = 'PAUSE [P]'; document.getElementById('statusLight').textContent = '● READY'; document.getElementById('statusLight').style.color = colors.mint;
    }
  }

  function toggleMusic() {
    musicMuted = !musicMuted;
    document.getElementById('musicButton').textContent = musicMuted ? 'MUSIC: OFF' : 'MUSIC: ON';
    if (!musicMuted) { unlockAudio(); startMusic(); }
    setTip(musicMuted ? 'Music muted.' : 'Music restored.');
  }
  function toggleTouchControls() {
    touchControlsEnabled = !touchControlsEnabled;
    document.body.classList.toggle('touch-controls-off', !touchControlsEnabled);
    document.getElementById('touchButton').textContent = touchControlsEnabled ? 'TOUCH: ON' : 'TOUCH: OFF';
    setTip(touchControlsEnabled ? 'Touch controls enabled.' : 'Touch controls hidden.');
  }
  function finishWeaponDraw(token) {
    if (!player?.drawState || player.drawState.token !== token) return;
    player.drawState = null; activeDrawAudio = null;
    setTip(`${weapons[currentWeapon].name} ready.`); updateHud();
  }

  function selectWeapon(weapon) {
    if (state !== 'playing' || !player || player.drawState || player.charging || currentWeapon === weapon) return;
    unlockAudio();
    currentWeapon = weapon;
    const token = ++weaponDrawToken;
    const clawDraw = weapon === 'claws';
    player.drawState = { token, elapsed: 0, duration: clawDraw ? .2 : .8 };
    setTip(`Drawing ${weapons[weapon].name.toLowerCase()}...`);
    if (activeDrawAudio) { activeDrawAudio.pause(); activeDrawAudio.currentTime = 0; }
    const drawSound = weapon === 'wand' ? 'drawWand' : 'drawBlade';
    activeDrawAudio = playFile(drawSound, clawDraw ? null : () => finishWeaponDraw(token));
    if (clawDraw) window.setTimeout(() => finishWeaponDraw(token), 200);
    activeDrawAudio.addEventListener('loadedmetadata', () => {
      if (!clawDraw && player?.drawState?.token === token && Number.isFinite(activeDrawAudio.duration)) player.drawState.duration = Math.max(.25, activeDrawAudio.duration);
    }, { once: true });
  }

  function setMousePosition(event) {
    touchAimDirection = null;
    const bounds = canvas.getBoundingClientRect();
    mouse.screenX = (event.clientX - bounds.left) * canvas.width / bounds.width;
    mouse.screenY = (event.clientY - bounds.top) * canvas.height / bounds.height;
    syncMouseWorld();
    mouse.inside = true;
    if (player) updatePlayerAim();
  }

  function setTouchAim(event) {
    const touch = event.touches[0] || event.changedTouches[0];
    if (!touch) return;
    event.preventDefault();
    setMousePosition(touch);
  }

  function bindTouchHold(button, key) {
    const release = event => { event.preventDefault(); keys.delete(key); button.classList.remove('active'); };
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      keys.add(key);
      button.classList.add('active');
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  }

  function updateTouchAimStick(event) {
    const stick = document.getElementById('touchAimStick');
    const knob = document.getElementById('touchAimKnob');
    const bounds = stick.getBoundingClientRect();
    const maxDistance = bounds.width * .31;
    let dx = event.clientX - (bounds.left + bounds.width / 2);
    let dy = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, maxDistance / distance);
    dx *= scale; dy *= scale;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const aimLength = Math.hypot(dx, dy) || 1;
    touchAimDirection = { x: dx / aimLength, y: dy / aimLength };
    if (player) updatePlayerAim();
  }

  function updateTouchMoveStick(event) {
    const stick = document.getElementById('touchMoveStick');
    const knob = document.getElementById('touchMoveKnob');
    const bounds = stick.getBoundingClientRect();
    const maxDistance = bounds.width * .31;
    let dx = event.clientX - (bounds.left + bounds.width / 2);
    let dy = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(dx, dy);
    if (distance < 6) { touchMoveDirection = null; knob.style.transform = 'translate(0, 0)'; return; }
    const scale = Math.min(1, maxDistance / distance);
    dx *= scale; dy *= scale;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const moveLength = Math.hypot(dx, dy) || 1;
    touchMoveDirection = { x: dx / moveLength, y: dy / moveLength };
  }

  canvas.addEventListener('mousemove', setMousePosition);
  canvas.addEventListener('mouseenter', event => { setMousePosition(event); });
  canvas.addEventListener('mouseleave', () => { mouse.inside = false; mouse.down = false; });
  canvas.addEventListener('touchstart', setTouchAim, { passive: false });
  canvas.addEventListener('touchmove', setTouchAim, { passive: false });
  canvas.addEventListener('mousedown', event => { if (event.button !== 0) return; event.preventDefault(); unlockAudio(); setMousePosition(event); mouse.down = true; beginAttackCharge(); });
  window.addEventListener('mouseup', event => { if (event.button === 0) { mouse.down = false; releaseAttackCharge(); } });

  window.addEventListener('keydown', event => {
    unlockAudio();
    const rawKey = event.key.toLowerCase();
    const key = rawKey === ' ' ? 'space' : rawKey;
    if (key === 'p' || key === 'escape') { event.preventDefault(); if (!event.repeat) togglePause(); return; }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space', 'w', 'a', 's', 'd'].includes(key)) event.preventDefault();
    if (!keys.has(key)) pressed.add(key);
    keys.add(key);
    if (key === 'space' && !event.repeat) beginAttackCharge();
    if (key === 'x' && !event.repeat) detonateWand();
    if (key === '1') selectWeapon('blade'); if (key === '2') selectWeapon('wand'); if (key === '3') selectWeapon('claws');
    if (key === 'enter' && state !== 'playing') newRun();
  });
  window.addEventListener('keyup', event => { const key = event.key.toLowerCase() === ' ' ? 'space' : event.key.toLowerCase(); if (key === 'space') releaseAttackCharge(); keys.delete(key); });
  document.getElementById('restartButton').addEventListener('click', newRun);
  document.getElementById('pauseButton').addEventListener('click', togglePause);
  document.getElementById('resumeButton').addEventListener('click', togglePause);
  document.getElementById('musicButton').addEventListener('click', toggleMusic);
  document.getElementById('touchButton').addEventListener('click', toggleTouchControls);
  document.querySelectorAll('.weapon-card').forEach(card => card.addEventListener('click', () => selectWeapon(card.dataset.weapon)));
  document.querySelectorAll('[data-touch-weapon]').forEach(button => button.addEventListener('pointerdown', event => { event.preventDefault(); selectWeapon(button.dataset.touchWeapon); }));
  const touchAttack = document.getElementById('touchAttack');
  const touchDetonate = document.getElementById('touchDetonate');
  const touchAimStick = document.getElementById('touchAimStick');
  const touchAimKnob = document.getElementById('touchAimKnob');
  const touchMoveStick = document.getElementById('touchMoveStick');
  const touchMoveKnob = document.getElementById('touchMoveKnob');
  const releaseTouchAttack = event => { event.preventDefault(); touchAttackHeld = false; touchAttack.classList.remove('active'); releaseAttackCharge(); };
  touchAttack.addEventListener('pointerdown', event => { event.preventDefault(); touchAttack.setPointerCapture?.(event.pointerId); touchAttackHeld = true; touchAttack.classList.add('active'); beginAttackCharge(); });
  touchAttack.addEventListener('pointerup', releaseTouchAttack);
  touchAttack.addEventListener('pointercancel', releaseTouchAttack);
  touchAttack.addEventListener('lostpointercapture', releaseTouchAttack);
  touchDetonate.addEventListener('pointerdown', event => { event.preventDefault(); touchDetonate.classList.add('active'); detonateWand(); });
  touchDetonate.addEventListener('pointerup', event => { event.preventDefault(); touchDetonate.classList.remove('active'); });
  touchDetonate.addEventListener('pointercancel', event => { event.preventDefault(); touchDetonate.classList.remove('active'); });
  touchAimStick.addEventListener('pointerdown', event => { event.preventDefault(); touchAimStick.setPointerCapture?.(event.pointerId); updateTouchAimStick(event); });
  touchAimStick.addEventListener('pointermove', event => { if (event.buttons || event.pressure) { event.preventDefault(); updateTouchAimStick(event); } });
  const resetTouchAimStick = event => { event.preventDefault(); touchAimKnob.style.transform = 'translate(0, 0)'; };
  touchAimStick.addEventListener('pointerup', resetTouchAimStick);
  touchAimStick.addEventListener('pointercancel', resetTouchAimStick);
  touchAimStick.addEventListener('lostpointercapture', resetTouchAimStick);
  touchMoveStick.addEventListener('pointerdown', event => { event.preventDefault(); touchMoveStick.setPointerCapture?.(event.pointerId); updateTouchMoveStick(event); });
  touchMoveStick.addEventListener('pointermove', event => { if (event.buttons || event.pressure) { event.preventDefault(); updateTouchMoveStick(event); } });
  const resetTouchMoveStick = event => { event.preventDefault(); touchMoveDirection = null; touchMoveKnob.style.transform = 'translate(0, 0)'; };
  touchMoveStick.addEventListener('pointerup', resetTouchMoveStick);
  touchMoveStick.addEventListener('pointercancel', resetTouchMoveStick);
  touchMoveStick.addEventListener('lostpointercapture', resetTouchMoveStick);

  function loop(timestamp) { const dt = Math.min((timestamp - lastTime) / 1000 || 0, .05); lastTime = timestamp; update(dt); draw(); requestAnimationFrame(loop); }
  newRun(); requestAnimationFrame(loop);
})();
