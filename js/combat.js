import { player, enemyState, gameState } from './state.js';
import { ui, updateUI, log, renderNewEnemy, showLoseScreen, showWinScreen, spawnFloatingText, triggerFlash, triggerShake } from './ui.js';
import { roll, TIMINGS } from './utils.js';
import { renderPaths } from './map.js';
import { sfx } from './audio.js';
import { saveGame } from './storage.js'; // <-- Добавлено

function getFireDamageTotal(diceCount, diceSides) {
    let calcRoll = () => {
        let sum = 0;
        for(let i=0; i<diceCount; i++) {
            let d = roll(diceSides);
            if (player.level >= 6 && player.archonActive && d <= 2) d = 3; 
            sum += d;
        }
        return sum;
    };
    let total1 = calcRoll();
    if (player.archonActive) return Math.max(total1, calcRoll());
    return total1;
}

function applyFireResistance(dmg) {
    if (dmg <= 0) return 0;
    let hasRes = enemyState.current.traits.includes('fire_resistance');
    let hasImm = enemyState.current.traits.includes('fire_immunity');
    let finalDmg = dmg;

    if (player.archonActive) {
        if (hasImm) { finalDmg = Math.floor(finalDmg / 2); log(`🔥 <b>Мощь Архонта:</b> Иммунитет к огню пробит!`, 'system'); } 
        else if (hasRes) { log(`🔥 <b>Мощь Архонта:</b> Сопротивление огню проигнорировано!`, 'system'); }
    } else {
        if (hasImm) { finalDmg = 0; log(`🛡️ Иммунитет к огню! Огненный урон полностью поглощен.`, 'system'); } 
        else if (hasRes) { finalDmg = Math.floor(finalDmg / 2); log(`🛡️ Сопротивление огню! Урон снижен вдвое.`, 'system'); }
    }
    return finalDmg;
}

export function startGame() { 
    ui.menu.classList.add('hidden'); ui.over.classList.add('hidden'); ui.game.classList.remove('hidden'); ui.log.innerHTML = ''; 
    player.reset(); gameState.stage = 1; gameState.paths =[]; startStage(false); 
}

export function startStage(isElite = false) {
    gameState.isAnimating = false; enemyState.generate(gameState.stage, isElite); renderNewEnemy();
    gameState.inCombat = true; player.archonActive = false; player.tempHp = 0; updateUI();
    log(`<b>--- Битва ${gameState.stage} / ${gameState.maxStage}: ${enemyState.current.name} ---</b>`, 'system');
    if (player.level >= 7) activateArchon(true); 
    const pInit = roll(20) + player.dexMod; const eInit = roll(20) + (Math.floor(Math.random() * 4)); 
    log(`Инициатива: Вы <span class="dice-roll">${pInit}</span> vs Враг <span class="dice-roll">${eInit}</span>`, 'system');
    pInit >= eInit ? startPlayerTurn() : startEnemyTurn();
}

export function activateArchon(isFree = false) {
    if (!isFree) player.bonusActions--; 
    player.archonActive = true; player.tempHp += (2 * player.level);
    sfx.fire(); log(`🔥 Вы принимаете <b>Форму Архонта</b>! Получено <span class="thp-text">${2*player.level} Врем. ХП</span>.`, 'system'); 
    updateUI();
}

export function usePotion(type) {
    player.bonusActions--; sfx.heal();
    if (type === 'heal') { 
        player.inventory.heal--; player.hp = Math.min(player.maxHp, player.hp + 15); 
        spawnFloatingText(ui.playerAvatar, "+15", "#4caf50"); 
        log(`❤️ Вы выпиваете <b>Зелье лечения</b>! Восстановлено 15 ХП.`, 'player-turn'); 
    } else if (type === 'elixir') { 
        player.inventory.elixir--; player.spellSlots = Math.min(player.maxSpellSlots, player.spellSlots + 1); player.currentGiantStrikeCharges = Math.min(player.maxGiantStrikeCharges, player.currentGiantStrikeCharges + 1); 
        spawnFloatingText(ui.playerAvatar, "Мана!", "#64b5f6"); 
        log(`💧 Вы выпиваете <b>Эликсир духа</b>! Восст. 1 ячейка и 1 Огн. удар.`, 'player-turn'); 
    }
    updateUI();
}

function startPlayerTurn() {
    if (!gameState.inCombat) return;
    gameState.turn = 'player'; gameState.isAnimating = false;
    player.actions = 1; player.bonusActions = 1; player.fireStrikeUsedThisTurn = false; player.attackedThisTurn = false;
    ui.fireToggle.checked = false; log(`<b>Ваш ход!</b>`, 'player-turn'); updateUI();
}

export function castSpell(spell) {
    if (player.actions <= 0) return;
    if (spell.costSlot > 0) {
        if (player.spellSlots < spell.costSlot) return;
        player.spellSlots -= spell.costSlot;
    }
    
    player.actions--;
    if (player.level >= 5) player.attackedThisTurn = true; 
    
    gameState.isAnimating = true; updateUI();

    setTimeout(() => {
        let isSaved = false; let damage = 0; let dmgType = 'огн.';
        const saveRoll = roll(20); const saveTotal = saveRoll + enemyState.current.dmgMod;
        isSaved = saveTotal >= player.spellSaveDc;

        if (isSaved) log(`[${spell.name}] Враг преуспел в спасброске (<span class="dice-roll">${saveRoll}</span>+${enemyState.current.dmgMod}=${saveTotal} vs Сл ${player.spellSaveDc}).`, 'player-turn');
        else log(`[${spell.name}] Враг провалил спасбросок (<span class="dice-roll">${saveRoll}</span>+${enemyState.current.dmgMod}=${saveTotal} vs Сл ${player.spellSaveDc}).`, 'player-turn');

        if (spell.id === 'create_bonfire') {
            if (!isSaved) damage = getFireDamageTotal(player.level >= 5 ? 2 : 1, 8);
            sfx.fire();
        } else if (spell.id === 'thunderwave') {
            damage = roll(player.slotLevel + 1, 8); if (isSaved) damage = Math.floor(damage / 2); dmgType = 'грома';
            sfx.thunder(); triggerShake();
        } else if (spell.id === 'fireball') {
            damage = getFireDamageTotal(8, 6); if (isSaved) damage = Math.floor(damage / 2);
            sfx.crit(); triggerShake();
        }

        if (damage > 0) {
            triggerFlash(ui.enemyAvatar);
            if (dmgType === 'огн.') {
                let applied = applyFireResistance(damage);
                if (applied > 0) enemyState.current.hitByFire = true;
                enemyState.current.hp -= applied;
                spawnFloatingText(ui.enemyAvatar, `-${applied}`, "#e64a19");
                log(`Урон: <span class="dmg-fire">${applied} огн.</span>`, 'player-turn');
            } else {
                enemyState.current.hp -= damage;
                spawnFloatingText(ui.enemyAvatar, `-${damage}`, "#ba68c8");
                log(`Урон: <span style="color:#ba68c8;">${damage} грома</span>`, 'player-turn');
            }
        } else {
            sfx.miss(); spawnFloatingText(ui.enemyAvatar, "Блок", "#9e9e9e"); log(`Урон не нанесен.`, 'player-turn');
        }
        
        gameState.isAnimating = false; checkCombatState();
    }, TIMINGS.strikeDelay);
}

function performSingleStrike(atkTypeStr) {
    if (enemyState.current.traits.includes('nimble') && Math.random() < 0.15) { 
        sfx.miss(); spawnFloatingText(ui.enemyAvatar, "Уворот", "#9e9e9e");
        log(`[${atkTypeStr}] Враг <b>уклонился</b> от атаки благодаря ловкости!`, 'enemy-turn'); return; 
    }

    const d20 = roll(20); const atkTotal = d20 + player.hitMod; const isCrit = d20 === 20;
    const isMiss = d20 === 1 || (!isCrit && atkTotal < enemyState.current.ac);

    if (isMiss && !isCrit) { 
        sfx.miss(); spawnFloatingText(ui.enemyAvatar, "Промах", "#9e9e9e");
        log(`[${atkTypeStr}] Промах! <span class="dice-roll">${d20}</span> + ${player.hitMod} = ${atkTotal} vs AC ${enemyState.current.ac}`, 'player-turn'); return; 
    }

    let fireTotal = 0; let radTotal = 0; let baseDmgStr = "";

    if (player.level >= 3) {
        fireTotal += getFireDamageTotal(isCrit ? 2 : 1, player.dmgDie) + player.dmgMod;
    } else {
        radTotal += roll(player.dmgDie) + (isCrit ? roll(player.dmgDie) : 0) + player.dmgMod;
        baseDmgStr = `<span class="dmg-radiant">${radTotal} луч.</span>`;
    }

    let giantFireTotal = 0;
    if (ui.fireToggle.checked && !player.fireStrikeUsedThisTurn && player.currentGiantStrikeCharges > 0) {
        player.fireStrikeUsedThisTurn = true; player.currentGiantStrikeCharges--; ui.fireToggle.checked = false; 
        giantFireTotal = getFireDamageTotal(isCrit ? 2 : 1, 10); fireTotal += giantFireTotal;
    }

    let appliedFireTotal = applyFireResistance(fireTotal);
    if (appliedFireTotal > 0) enemyState.current.hitByFire = true;
    let totalDone = radTotal + appliedFireTotal;
    enemyState.current.hp -= totalDone;

    triggerFlash(ui.enemyAvatar);
    if (isCrit) { sfx.crit(); triggerShake(); spawnFloatingText(ui.enemyAvatar, `КРИТ! -${totalDone}`, "#f44336"); }
    else { sfx.hit(); spawnFloatingText(ui.enemyAvatar, `-${totalDone}`, (player.level >= 3 ? "#e64a19" : "#fbc02d")); }

    let hitMsg = `[${atkTypeStr}] ${isCrit ? '<span class="crit">КРИТ (20)!</span> ' : `Попадание (<span class="dice-roll">${d20}</span>+${player.hitMod}=${atkTotal}). `}`;
    if (player.level >= 3) { 
        hitMsg += `<br>Урон: <span class="dmg-fire">${appliedFireTotal} огн.</span>`; 
        if (giantFireTotal > 0) hitMsg += ` (включая Огн. удар)`; 
    } else { 
        hitMsg += `<br>Урон: ${baseDmgStr}`; 
        if (giantFireTotal > 0) hitMsg += ` + <span class="dmg-fire">${appliedFireTotal} огн.</span> (Огн. удар)`; 
    }

    log(hitMsg, 'player-turn');

    if (enemyState.current.hp <= 0 && enemyState.current.traits.includes('undead_fortitude') && !enemyState.current.usedFortitude) {
        if (Math.random() < 0.5) { enemyState.current.hp = 1; enemyState.current.usedFortitude = true; log(`💀 <b>Стойкость нежити!</b> Враг отказывается умирать и остается с 1 ХП!`, 'enemy-turn'); }
    }
}

export function executePlayerAttack(isBonus) {
    gameState.isAnimating = true; 
    if (isBonus) player.bonusActions--; else { player.actions--; player.attackedThisTurn = true; }
    updateUI(); 

    let strikes = isBonus ? 1 : player.attacksPerAction; let i = 0;
    function strikeLoop() {
        if (i < strikes && enemyState.current.hp > 0) {
            performSingleStrike((isBonus ? "Бонусная атака" : "Осн. атака") + (strikes > 1 ? ` #${i+1}` : ''));
            updateUI(); i++; setTimeout(strikeLoop, TIMINGS.strikeDelay); 
        } else { gameState.isAnimating = false; checkCombatState(); }
    }
    strikeLoop();
}

function takePlayerDamage(amount) {
    let dmg = amount;
    if (player.tempHp > 0) {
        if (player.tempHp >= dmg) { player.tempHp -= dmg; dmg = 0; } 
        else { dmg -= player.tempHp; player.tempHp = 0; }
    }
    player.hp -= dmg;
}

export function startEnemyTurn() {
    if (!gameState.inCombat) return;
    gameState.turn = 'enemy'; gameState.isAnimating = true; updateUI();
    log(`<b>Ход врага...</b>`, 'enemy-turn');

    if (enemyState.current.traits.includes('regeneration') && enemyState.current.hp > 0 && enemyState.current.hp < enemyState.current.maxHp) {
        if (!enemyState.current.hitByFire) {
            let heal = 10; enemyState.current.hp = Math.min(enemyState.current.maxHp, enemyState.current.hp + heal);
            log(`💚 Враг <b>регенерирует</b> ${heal} ХП!`, 'enemy-turn'); updateUI();
        } else log(`🔥 Огонь подавляет регенерацию врага!`, 'system');
    }
    enemyState.current.hitByFire = false; 

    setTimeout(() => {
        if (enemyState.current.hp <= 0) return;
        
        let critThreshold = enemyState.current.traits.includes('reckless') ? 19 : 20;
        const d20 = roll(20); const atkTotal = d20 + enemyState.current.hitMod; const isCrit = d20 >= critThreshold;
        const isMiss = d20 === 1 || (!isCrit && atkTotal < player.ac);

        if (isMiss && !isCrit) {
            sfx.miss(); spawnFloatingText(ui.playerAvatar, "Уворот", "#9e9e9e");
            log(`${enemyState.current.name} не пробивает (<span class="dice-roll">${d20}</span> + ${enemyState.current.hitMod}) Эфирную броню!`, 'enemy-turn');
        } else {
            let totalDmg = roll(enemyState.current.dmgD, enemyState.current.dmgC) + (isCrit ? roll(enemyState.current.dmgD, enemyState.current.dmgC) : 0) + enemyState.current.dmgMod;
            takePlayerDamage(totalDmg);
            
            triggerFlash(ui.playerAvatar);
            if (isCrit) { sfx.crit(); triggerShake(); spawnFloatingText(ui.playerAvatar, `КРИТ! -${totalDmg}`, "#f44336"); }
            else { sfx.hit(); spawnFloatingText(ui.playerAvatar, `-${totalDmg}`, "#d32f2f"); }

            let eMsg = `${enemyState.current.name} ${isCrit ? '<span class="crit">наносит КРИТ!</span> ' : `попадает. `}Вы получаете <b>${totalDmg}</b> урона!`;
            
            if (enemyState.current.traits.includes('lifesteal') && totalDmg > 0) {
                let heal = Math.floor(totalDmg / 2); enemyState.current.hp = Math.min(enemyState.current.maxHp, enemyState.current.hp + heal);
                eMsg += ` <br>🦇 <i>Вампиризм: враг восстановил ${heal} ХП.</i>`;
            }
            log(eMsg, 'enemy-turn');

            if (ui.rebukeToggle.checked && player.spellSlots > 0 && totalDmg > 0 && enemyState.current.hp > 0) {
                player.spellSlots--; ui.rebukeToggle.checked = false;
                sfx.fire();
                let rebukeDmg = getFireDamageTotal(player.slotLevel + 1, 10); 
                rebukeDmg = applyFireResistance(rebukeDmg);
                enemyState.current.hp -= rebukeDmg;
                
                triggerFlash(ui.enemyAvatar); spawnFloatingText(ui.enemyAvatar, `-${rebukeDmg}`, "#e64a19");
                log(`🌋 Вы применяете <b>Адское возмездие</b> (Реакция)! Враг получает <span class="dmg-fire">${rebukeDmg} огн.</span> урона.`, 'player-turn');
            }
        }

        if (!checkCombatState()) setTimeout(() => { gameState.isAnimating = false; startPlayerTurn(); }, TIMINGS.enemyTurnEnd);
    }, TIMINGS.enemyTurnStart);
}

function checkCombatState() {
    updateUI();
    if (enemyState.current.hp <= 0) {
        gameState.inCombat = false; gameState.isAnimating = true; 
        sfx.coin(); 
        log(`<b>${enemyState.current.name} повержен!</b>`, 'system');
        if (gameState.stage === gameState.maxStage) { setTimeout(showWinScreen, TIMINGS.gameOver); return true; }

        player.xp += enemyState.current.xpGiven; player.gold += enemyState.current.goldGiven;
        if (enemyState.current.goldCritMsg) { log(enemyState.current.goldCritMsg, 'system'); } 
        else { log(`Получено ${enemyState.current.xpGiven} опыта и 💰 ${enemyState.current.goldGiven} золота.`, 'system'); }
        
        let levelUpMsgs = player.checkLevelUp(); 
        if (levelUpMsgs.length > 0) sfx.levelup();
        levelUpMsgs.forEach(msg => log(msg, 'levelup'));
        
        log(`<i>Выберите следующий путь:</i>`, 'system'); 
        updateUI(); 
        
        renderPaths(true); // Генерируем пути
        saveGame();        // СОХРАНЯЕМ ВЕСЬ ПРОГРЕСС И ЛОГИ И ПУТИ И ВРАГА!
        
        return true;
    } else if (player.hp <= 0) {
        gameState.inCombat = false; setTimeout(() => showLoseScreen(gameState.stage, player.level), TIMINGS.gameOver); return true;
    }
    return false;
}
