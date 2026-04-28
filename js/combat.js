import { player, enemyState, gameState, subclassData } from './state.js';
import { ui, updateUI, log, renderNewEnemy, showLoseScreen, showWinScreen } from './ui.js';
import { roll, TIMINGS } from './utils.js';
import { renderPaths } from './map.js';

function getSubclassDamageTotal(diceCount, diceSides) {
    let calcRoll = () => {
        let sum = 0;
        for(let i=0; i<diceCount; i++) {
            let d = roll(diceSides);
            if (player.subclass === 'cataclysm' && player.level >= 6 && player.archonActive && d <= 2) d = 3; 
            sum += d;
        }
        return sum;
    };
    let total = calcRoll();
    if (player.subclass === 'cataclysm' && player.archonActive) total = Math.max(total, calcRoll());
    return total;
}

function applyElementResistance(dmg, elementId) {
    if (dmg <= 0) return 0;
    let hasRes = enemyState.current.traits.includes(`${elementId}_resistance`);
    let hasImm = enemyState.current.traits.includes(`${elementId}_immunity`);
    let hasWeak = enemyState.current.traits.includes(`${elementId}_weakness`);
    
    let finalDmg = dmg;

    if (player.archonActive) {
        if (hasImm) { finalDmg = Math.floor(finalDmg / 2); log(`💥 <b>Мощь Архонта:</b> Иммунитет пробит!`, 'system'); } 
        else if (hasRes) { log(`💥 <b>Мощь Архонта:</b> Сопротивление проигнорировано!`, 'system'); }
        else if (hasWeak) { finalDmg *= 2; log(`💥 Уязвимость! Урон удвоен!`, 'system'); }
    } else {
        if (hasImm) { finalDmg = 0; log(`🛡️ Иммунитет! Урон поглощен.`, 'system'); } 
        else if (hasRes) { finalDmg = Math.floor(finalDmg / 2); log(`🛡️ Сопротивление! Урон снижен вдвое.`, 'system'); }
        else if (hasWeak) { finalDmg *= 2; log(`💥 Уязвимость! Урон удвоен!`, 'system'); }
    }
    return finalDmg;
}

export function startGame() { 
    player.subclass = ui.subclassSelect.value;
    ui.menu.classList.add('hidden'); ui.over.classList.add('hidden'); ui.game.classList.remove('hidden'); ui.log.innerHTML = ''; 
    player.reset(); gameState.stage = 1; startStage(false); 
}

export function startNextStage() { gameState.stage++; startStage(); }

function startStage() {
    gameState.isAnimating = false; enemyState.current = null;
    enemyState.generate(gameState.stage, false); renderNewEnemy();
    gameState.inCombat = true; player.archonActive = false; player.tempHp = 0; updateUI();
    log(`<b>--- Битва ${gameState.stage} / ${gameState.maxStage}: ${enemyState.current.name} ---</b>`, 'system');
    if (player.level >= 7) activateArchon(true); 
    const pInit = roll(20) + player.dexMod; const eInit = roll(20) + (Math.floor(Math.random() * 4)); 
    log(`Инициатива: Вы <span class="dice-roll">${pInit}</span> vs Враг <span class="dice-roll">${eInit}</span>`, 'system');
    pInit >= eInit ? startPlayerTurn() : startEnemyTurn();
}

export function activateArchon(isFree = false) {
    if (!isFree) player.bonusActions--; player.archonActive = true; player.tempHp += (2 * player.level);
    log(`🔥 Вы принимаете <b>Форму Архонта</b>! Получено <span class="thp-text">${2*player.level} Врем. ХП</span>.`, 'system'); updateUI();
}

export function usePotion(type) {
    player.bonusActions--;
    if (type === 'heal') { player.inventory.heal--; player.hp = Math.min(player.maxHp, player.hp + 15); log(`❤️ Вы выпиваете <b>Зелье лечения</b>!`, 'player-turn'); } 
    else if (type === 'elixir') { player.inventory.elixir--; player.spellSlots = Math.min(player.maxSpellSlots, player.spellSlots + 1); player.currentGiantStrikeCharges = Math.min(player.maxGiantStrikeCharges, player.currentGiantStrikeCharges + 1); log(`💧 Вы выпиваете <b>Эликсир духа</b>!`, 'player-turn'); }
    updateUI();
}

function startPlayerTurn() {
    if (!gameState.inCombat) return;
    gameState.turn = 'player'; gameState.isAnimating = false;
    player.actions = 1; player.bonusActions = 1; player.fireStrikeUsedThisTurn = false; player.attackedThisTurn = false;
    ui.reactionToggle.checked = false; log(`<b>Ваш ход!</b>`, 'player-turn'); updateUI();
}

export function castSpell(spell) {
    if (player.actions <= 0) return;
    if (spell.costSlot > 0) { if (player.spellSlots < spell.costSlot) return; player.spellSlots -= spell.costSlot; }
    player.actions--; if (player.level >= 5) player.attackedThisTurn = true; 
    gameState.isAnimating = true; updateUI();

    setTimeout(() => {
        let isSaved = false; let damage = 0; 
        let isAttack = spell.id === 'guiding_bolt';
        let elementId = 'fire';
        if (player.subclass === 'formless') elementId = 'acid';
        if (player.subclass === 'fallen') elementId = 'radiant';

        let data = subclassData[player.subclass];

        if (!isAttack) {
            const saveRoll = roll(20); const saveTotal = saveRoll + enemyState.current.dmgMod;
            isSaved = saveTotal >= player.spellSaveDc;
            if (isSaved) log(`[${spell.name}] Враг преуспел в спасброске (<span class="dice-roll">${saveRoll}</span>+${enemyState.current.dmgMod}=${saveTotal} vs Сл ${player.spellSaveDc}).`, 'player-turn');
            else log(`[${spell.name}] Враг провалил спасбросок.`, 'player-turn');
        }

        if (spell.id === 'create_bonfire' || spell.id === 'acid_splash' || spell.id === 'sacred_flame') {
            if (!isSaved) damage = getSubclassDamageTotal(player.level >= 5 ? 2 : 1, 8); 
        } else if (spell.id === 'thunderwave') {
            damage = roll(player.slotLevel + 1, 8); if (isSaved) damage = Math.floor(damage / 2); elementId = 'thunder';
        } else if (spell.id === 'caustic_brew') {
            damage = getSubclassDamageTotal(player.slotLevel + 2, 4); if (isSaved) damage = Math.floor(damage / 2);
        } else if (spell.id === 'guiding_bolt') {
            const atkD20 = roll(20); const atkTotal = atkD20 + player.hitMod; const isCrit = atkD20 === 20;
            if (atkD20 === 1 || (!isCrit && atkTotal < enemyState.current.ac)) log(`Промах!`, 'player-turn');
            else damage = getSubclassDamageTotal(player.slotLevel + 3, 6);
        } else if (spell.id === 'fireball' || spell.id === 'vitriolic_sphere' || spell.id === 'flame_strike') {
            damage = getSubclassDamageTotal(8, 6); if (isSaved) damage = Math.floor(damage / 2);
        }

        if (damage > 0) {
            let applied = elementId !== 'thunder' ? applyElementResistance(damage, elementId) : damage;
            if (applied > 0) enemyState.current.hitByElement = true;
            enemyState.current.hp -= applied;
            log(`Урон: <span class="dmg-sub">${applied} ${data.element}</span>`, 'player-turn');
            
            // ВАМПИРИЗМ (Бесформенный Ур. 6)
            if (player.subclass === 'formless' && player.level >= 6 && player.archonActive && elementId === 'acid') {
                let heal = Math.floor(applied / 2);
                player.hp = Math.min(player.maxHp, player.hp + heal);
                log(`🟢 Высасывание жизни! Вы восстановили ${heal} ХП.`, 'system');
            }
        }
        
        gameState.isAnimating = false; checkCombatState();
    }, TIMINGS.strikeDelay);
}

function performSingleStrike(atkTypeStr) {
    if (enemyState.current.traits.includes('nimble') && Math.random() < 0.15) { log(`[${atkTypeStr}] Враг уклонился!`, 'enemy-turn'); return; }

    let critThreshold = (player.subclass === 'fallen' && player.level >= 6 && player.archonActive) ? 19 : 20;
    const d20 = roll(20); const atkTotal = d20 + player.hitMod; const isCrit = d20 >= critThreshold;
    const isMiss = d20 === 1 || (!isCrit && atkTotal < enemyState.current.ac);

    if (isMiss && !isCrit) { log(`[${atkTypeStr}] Промах! <span class="dice-roll">${d20}</span> + ${player.hitMod} = ${atkTotal} vs AC ${enemyState.current.ac}`, 'player-turn'); return; }

    let elementTotal = 0; let radTotal = 0; let baseDmgStr = "";
    let data = subclassData[player.subclass];
    let elementId = player.subclass === 'cataclysm' ? 'fire' : (player.subclass === 'formless' ? 'acid' : 'radiant');

    if (player.level >= 3) {
        elementTotal += getSubclassDamageTotal(isCrit ? 2 : 1, player.dmgDie) + player.dmgMod;
    } else {
        radTotal += roll(player.dmgDie) + (isCrit ? roll(player.dmgDie) : 0) + player.dmgMod;
        baseDmgStr = `<span class="dmg-radiant">${radTotal} луч.</span>`;
    }

    let giantTotal = 0;
    if (ui.fireToggle.checked && !player.fireStrikeUsedThisTurn && player.currentGiantStrikeCharges > 0) {
        player.fireStrikeUsedThisTurn = true; player.currentGiantStrikeCharges--; ui.fireToggle.checked = false; 
        giantTotal = getSubclassDamageTotal(isCrit ? 2 : 1, 10); elementTotal += giantTotal;
    }

    let appliedElement = applyElementResistance(elementTotal, elementId);
    if (appliedElement > 0) enemyState.current.hitByElement = true;
    enemyState.current.hp -= (radTotal + appliedElement);

    let hitMsg = `[${atkTypeStr}] ${isCrit ? '<span class="crit">КРИТ!</span> ' : `Попадание.`}`;
    if (player.level >= 3) { hitMsg += `<br>Урон: <span class="dmg-sub">${appliedElement} ${data.element}</span>`; } 
    else { hitMsg += `<br>Урон: ${baseDmgStr}`; if (giantTotal > 0) hitMsg += ` + <span class="dmg-sub">${appliedElement} ${data.element}</span>`; }

    log(hitMsg, 'player-turn');

    // ВАМПИРИЗМ (Бесформенный Ур. 6)
    if (player.subclass === 'formless' && player.level >= 6 && player.archonActive && appliedElement > 0) {
        let heal = Math.floor(appliedElement / 2); player.hp = Math.min(player.maxHp, player.hp + heal);
        log(`🟢 Высасывание жизни! Восстановлено ${heal} ХП.`, 'system');
    }

    // ОГЛУШЕНИЕ БОССА (Павший Ур. 6 КРИТ)
    if (isCrit && player.subclass === 'fallen' && player.level >= 6 && player.archonActive) {
        enemyState.current.stunned = true;
        log(`✨ <b>Осуждение!</b> Враг ослеплен силой Света и пропустит следующий ход!`, 'system');
    }

    if (enemyState.current.hp <= 0 && enemyState.current.traits.includes('undead_fortitude') && !enemyState.current.usedFortitude && Math.random() < 0.5) {
        enemyState.current.hp = 1; enemyState.current.usedFortitude = true; log(`💀 <b>Стойкость нежити!</b> Враг остается с 1 ХП!`, 'enemy-turn');
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
    
    if (enemyState.current.stunned) {
        enemyState.current.stunned = false;
        log(`✨ Враг ослеплен и пропускает ход!`, 'system');
        setTimeout(() => { gameState.isAnimating = false; startPlayerTurn(); }, TIMINGS.enemyTurnEnd);
        return;
    }
    
    log(`<b>Ход врага...</b>`, 'enemy-turn');

    if (enemyState.current.traits.includes('regeneration') && enemyState.current.hp > 0 && enemyState.current.hp < enemyState.current.maxHp) {
        if (!enemyState.current.hitByElement) {
            let heal = 10; enemyState.current.hp = Math.min(enemyState.current.maxHp, enemyState.current.hp + heal);
            log(`💚 Враг <b>регенерирует</b> ${heal} ХП!`, 'enemy-turn'); updateUI();
        } else log(`🔥 Стихия подавляет регенерацию врага!`, 'system');
    }
    enemyState.current.hitByElement = false; 

    setTimeout(() => {
        if (enemyState.current.hp <= 0) return;
        
        let critThreshold = enemyState.current.traits.includes('reckless') ? 19 : 20;
        const d20 = roll(20); 
        let atkTotal = d20 + enemyState.current.hitMod; 
        
        // Реакция Павшего (Ослепляющая вспышка) заставляет врага промазать
        let forcedMiss = false;
        if (ui.reactionToggle.checked && player.spellSlots > 0 && player.subclass === 'fallen') {
            player.spellSlots--; ui.reactionToggle.checked = false;
            forcedMiss = Math.random() < 0.5;
            log(`✨ Вы применяете <b>Вспышку</b>!`, 'player-turn');
        }

        const isCrit = d20 >= critThreshold && !forcedMiss;
        const isMiss = d20 === 1 || forcedMiss || (!isCrit && atkTotal < player.ac);

        if (isMiss && !isCrit) log(`${enemyState.current.name} промахивается!`, 'enemy-turn');
        else {
            let totalDmg = roll(enemyState.current.dmgD, enemyState.current.dmgC) + (isCrit ? roll(enemyState.current.dmgD, enemyState.current.dmgC) : 0) + enemyState.current.dmgMod;
            
            // Реакция Бесформенного (Щит Слизи)
            if (ui.reactionToggle.checked && player.spellSlots > 0 && player.subclass === 'formless') {
                player.spellSlots--; ui.reactionToggle.checked = false;
                let shield = roll(10) + player.chaMod;
                totalDmg = Math.max(0, totalDmg - shield);
                log(`🟢 Вы применяете <b>Щит Слизи</b>! Урон снижен на ${shield}.`, 'player-turn');
            }

            takePlayerDamage(totalDmg);
            let eMsg = `${enemyState.current.name} ${isCrit ? '<span class="crit">наносит КРИТ!</span> ' : `попадает. `}Вы получаете <b>${totalDmg}</b> урона!`;
            
            if (enemyState.current.traits.includes('lifesteal') && totalDmg > 0) {
                let heal = Math.floor(totalDmg / 2); enemyState.current.hp = Math.min(enemyState.current.maxHp, enemyState.current.hp + heal);
                eMsg += ` <br>🦇 <i>Вампиризм: враг восстановил ${heal} ХП.</i>`;
            }
            log(eMsg, 'enemy-turn');

            // Реакция Катаклизма (Адское возмездие)
            if (ui.reactionToggle.checked && player.spellSlots > 0 && totalDmg > 0 && enemyState.current.hp > 0 && player.subclass === 'cataclysm') {
                player.spellSlots--; ui.reactionToggle.checked = false;
                let rebukeDmg = applyElementResistance(getFireDamageTotal(player.slotLevel + 1, 10), 'fire'); 
                enemyState.current.hp -= rebukeDmg;
                log(`🌋 Вы применяете <b>Адское возмездие</b>! Враг получает <span class="dmg-sub">${rebukeDmg} огн.</span>`, 'player-turn');
            }
        }

        if (!checkCombatState()) setTimeout(() => { gameState.isAnimating = false; startPlayerTurn(); }, TIMINGS.enemyTurnEnd);
    }, TIMINGS.enemyTurnStart);
}

function checkCombatState() {
    updateUI();
    if (enemyState.current.hp <= 0) {
        gameState.inCombat = false; gameState.isAnimating = true; 
        log(`<b>${enemyState.current.name} повержен!</b>`, 'system');
        if (gameState.stage === gameState.maxStage) { setTimeout(showWinScreen, TIMINGS.gameOver); return true; }

        player.xp += enemyState.current.xpGiven; player.gold += enemyState.current.goldGiven;
        if (enemyState.current.goldCritMsg) { log(enemyState.current.goldCritMsg, 'system'); } 
        else { log(`Получено ${enemyState.current.xpGiven} опыта и 💰 ${enemyState.current.goldGiven} золота.`, 'system'); }
        
        let levelUpMsgs = player.checkLevelUp(); levelUpMsgs.forEach(msg => log(msg, 'levelup'));
        log(`<i>Выберите следующий путь:</i>`, 'system'); updateUI(); renderPaths(); return true;
    } else if (player.hp <= 0) {
        gameState.inCombat = false; setTimeout(() => showLoseScreen(gameState.stage, player.level), TIMINGS.gameOver); return true;
    }
    return false;
}
