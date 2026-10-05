import { player, enemyState, gameState, damageTypeMeta } from './state.js';
import { ui, updateUI, log, renderNewEnemy, showLoseScreen, showWinScreen, spawnFloatingText, triggerFlash, triggerShake } from './ui.js';
import { roll, TIMINGS } from './utils.js';
import { enterStage, refreshStageUi, logStageHint } from './map.js';
import { sfx } from './audio.js';
import { saveGame } from './storage.js'; // <-- Добавлено
import { has, grantAspectSlotsIfNeeded, tryShowAspectPicker } from './aspects.js';

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
    player.reset(); gameState.stage = 1; gameState.map = null; gameState.settlementVisit = null; gameState.pendingAspectChoices = 0;
    enemyState.current = null; gameState.inCombat = false;
    grantAspectSlotsIfNeeded(); // Аспект 1-го уровня — часть стартовых умений Сосуда
    // Игра больше не начинается сразу с боя: игрок появляется в первой области
    // и сам решает, куда пойти (см. map.js).
    enterStage(1);
    tryShowAspectPicker(); // Предлагаем выбрать стартовый Аспект сразу
}

export function startStage(isElite = false, variantIdx = 0) {
    gameState.isAnimating = false; enemyState.generate(gameState.stage, isElite, variantIdx); renderNewEnemy();
    gameState.inCombat = true; player.archonActive = false; player.tempHp = 0; player.archonAspectAcBonus = 0;
    // Сброс ресурсов Аспектов на бой
    player.minorMagickUsedThisCombat = false; player.enemyFrightened = false;
    player.reactionAvailable = true;
    updateUI();
    log(`<b>--- Битва ${gameState.stage} / ${gameState.maxStage}: ${enemyState.current.name} ---</b>`, 'system');
    if (player.level >= 7) activateArchon(true); 
    const pInit = roll(20) + player.dexMod; const eInit = roll(20) + (Math.floor(Math.random() * 4)); 
    log(`Инициатива: Вы <span class="dice-roll">${pInit}</span> vs Враг <span class="dice-roll">${eInit}</span>`, 'system');
    pInit >= eInit ? startPlayerTurn() : startEnemyTurn();
}

export function activateArchon(isFree = false) {
    if (!isFree) player.bonusActions--; 
    player.archonActive = true; 
    player.archonAspectAcBonus = has('dire_stature') ? 1 : 0;
    player.tempHp += (2 * player.level);
    sfx.fire(); log(`🔥 Вы принимаете <b>Форму Архонта</b>! Получено <span class="thp-text">${2*player.level} Врем. ХП</span>.`, 'system'); 

    if (has('perilous_visage') && enemyState.current && !player.enemyFrightened) {
        const saveRoll = roll(20); const saveTotal = saveRoll + enemyState.current.dmgMod;
        if (saveTotal < player.spellSaveDc) {
            player.enemyFrightened = true;
            log(`😱 <b>Устрашающий облик:</b> враг провалил спасбросок Мудрости (<span class="dice-roll">${saveRoll}</span>+${enemyState.current.dmgMod}=${saveTotal} vs Сл ${player.spellSaveDc}) и запуган — его атаки по вам совершаются с помехой до конца боя!`, 'levelup');
        } else {
            log(`Враг преуспевает в спасброске против вашего устрашающего облика (${saveTotal} vs Сл ${player.spellSaveDc}).`, 'system');
        }
    }
    updateUI();
}

// ===================================================================
// АКТИВНЫЕ СПОСОБНОСТИ АСПЕКТОВ
// ===================================================================

export function useOtherworldlyMaw() {
    if (player.actions <= 0 || player.attacksRemaining <= 0 || !player.archonActive || player.otherworldlyMawUsedThisTurn) return;
    player.attacksRemaining--; player.otherworldlyMawUsedThisTurn = true;
    if (player.attacksRemaining <= 0) player.actions--; // Действие исчерпано, только когда закончились и атаки
    gameState.isAnimating = true; updateUI();
    setTimeout(() => {
        const saveRoll = roll(20); const saveTotal = saveRoll + enemyState.current.dmgMod;
        if (saveTotal < player.spellSaveDc) {
            const dmg = roll(6, 2);
            enemyState.current.hp -= dmg;
            const gain = Math.floor(dmg / 2);
            const cap = 2 * player.level;
            const newThp = Math.min(cap, player.tempHp + gain);
            const actualGain = newThp - player.tempHp;
            player.tempHp = newThp;
            triggerFlash(ui.enemyAvatar); spawnFloatingText(ui.enemyAvatar, `-${dmg}`, "#8bc34a"); sfx.hit();
            log(`👄 <b>Иномирная пасть:</b> враг проваливает спасбросок Харизмы (<span class="dice-roll">${saveRoll}</span>+${enemyState.current.dmgMod}=${saveTotal} vs Сл ${player.spellSaveDc}) — получает <span style="color:#8bc34a;">${dmg} некр.</span> урона${actualGain > 0 ? `, вы получаете +${actualGain} врем. ХП` : ''}.`, 'player-turn');
        } else {
            sfx.miss();
            log(`👄 <b>Иномирная пасть:</b> враг успешно спасается (${saveTotal} vs Сл ${player.spellSaveDc}).`, 'player-turn');
        }
        gameState.isAnimating = false; checkCombatState();
    }, TIMINGS.strikeDelay);
}

export function usePotion(type) {
    player.bonusActions--; sfx.heal();
    if (type === 'heal') { 
        player.inventory.heal--;
        const tier = player.healPotionInfo;
        const healAmt = roll(tier.diceSides, tier.diceCount) + tier.bonus;
        const actualHealed = Math.min(healAmt, player.maxHp - player.hp);
        player.hp = Math.min(player.maxHp, player.hp + healAmt); 
        spawnFloatingText(ui.playerAvatar, `+${actualHealed}`, "#4caf50"); 
        log(`❤️ Вы выпиваете <b>${tier.name}</b>! Восстановлено ${actualHealed} ХП <i>(бросок ${tier.diceCount}к${tier.diceSides}+${tier.bonus} = ${healAmt})</i>.`, 'player-turn'); 
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
    player.actions = 1; player.bonusActions = 1; player.attacksRemaining = player.attacksPerAction; player.fireStrikeUsedThisTurn = false; player.attackedThisTurn = false;
    player.otherworldlyMawUsedThisTurn = false;
    player.reactionAvailable = true; // Реакция (Опаловый щит / Адское возмездие) обновляется в начале своего хода
    ui.fireToggle.checked = false; log(`<b>Ваш ход!</b>`, 'player-turn'); updateUI();
}

export function castSpell(spell) {
    if (player.actions <= 0 || player.attacksRemaining < player.attacksPerAction) return;
    let usedMinorMagick = false;
    if (spell.costSlot > 0) {
        if (has('minor_magick') && !player.minorMagickUsedThisCombat) {
            usedMinorMagick = true; player.minorMagickUsedThisCombat = true;
        } else {
            if (player.spellSlots < spell.costSlot) return;
            player.spellSlots -= spell.costSlot;
        }
    }
    if (usedMinorMagick) log(`✨ <b>Малое волшебство:</b> заклинание сотворено без затраты ячейки!`, 'levelup');
    
    player.actions--; player.attacksRemaining = 0;
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

function performSingleStrike(atkTypeStr, isMainAttack = true) {
    if (enemyState.current.traits.includes('nimble') && Math.random() < 0.15) { 
        sfx.miss(); spawnFloatingText(ui.enemyAvatar, "Уворот", "#9e9e9e");
        log(`[${atkTypeStr}] Враг <b>уклонился</b> от атаки благодаря ловкости!`, 'enemy-turn'); return; 
    }

    let d20 = roll(20);
    const atkTotal = d20 + player.hitMod;
    const isCrit = d20 >= 20;
    const isMiss = d20 === 1 || (!isCrit && atkTotal < enemyState.current.ac);

    if (isMiss && !isCrit) { 
        sfx.miss(); spawnFloatingText(ui.enemyAvatar, "Промах", "#9e9e9e");
        log(`[${atkTypeStr}] Промах! <span class="dice-roll">${d20}</span> + ${player.hitMod} = ${atkTotal} vs AC ${enemyState.current.ac}`, 'player-turn'); return; 
    }

    let fireTotal = 0; let radTotal = 0; let forceTotal = 0; let baseDmgStr = ""; let aspectLogParts =[];

    if (player.level >= 3) {
        fireTotal += getFireDamageTotal(isCrit ? 2 : 1, player.dmgDie) + player.dmgMod;
    } else {
        radTotal += roll(player.dmgDie) + (isCrit ? roll(player.dmgDie) : 0) + player.dmgMod;
        baseDmgStr = `<span class="dmg-radiant">${radTotal} луч.</span>`;
    }

    // --- Урон духа от Аспектов (типеless — минует сопротивления) ---
    if (player.archonActive && has('dire_stature')) {
        const d = roll(4) + (isCrit ? roll(4) : 0);
        forceTotal += d; aspectLogParts.push(`+${d} <span style="color:#ba68c8;">дух.</span> (Исполинский рост)`);
    }

    // --- Бонусный урон от экипировки (кислота идёт мимо сопротивления огню, огонь — через него) ---
    let equipAcidTotal = 0; let equipLogParts =[];
    (player.equipBonusDamages || []).forEach(b => {
        const dmg = roll(b.die) + (isCrit ? roll(b.die) : 0);
        if (b.type === 'fire') { fireTotal += dmg; equipLogParts.push(`+${dmg} огн. (${b.name})`); }
        else { equipAcidTotal += dmg; equipLogParts.push(`+${dmg} <span style="color:#8bc34a;">кисл.</span> (${b.name})`); }
    });

    let giantFireTotal = 0;
    if (ui.fireToggle.checked && !player.fireStrikeUsedThisTurn && player.currentGiantStrikeCharges > 0) {
        player.fireStrikeUsedThisTurn = true; player.currentGiantStrikeCharges--; ui.fireToggle.checked = false; 
        giantFireTotal = getFireDamageTotal(isCrit ? 2 : 1, 10); fireTotal += giantFireTotal;
    }

    // --- Ослепляющее копьё: доп. 6d8 духовного урона за ячейку заклинания (Спасбросок Ловкости на половину) ---
    if (ui.dazzlingToggle && ui.dazzlingToggle.checked && player.spellSlots > 0) {
        player.spellSlots--; ui.dazzlingToggle.checked = false;
        const saveRoll = roll(20); const saveTotal = saveRoll + enemyState.current.dmgMod;
        let dazzlingDmg = roll(8, 6);
        if (saveTotal >= player.spellSaveDc) { dazzlingDmg = Math.floor(dazzlingDmg / 2); aspectLogParts.push(`+${dazzlingDmg} <span style="color:#ba68c8;">дух.</span> (Ослепляющее копьё, спасбросок успешен)`); }
        else { aspectLogParts.push(`+${dazzlingDmg} <span style="color:#ba68c8;">дух.</span> (Ослепляющее копьё, спасбросок провален)`); }
        forceTotal += dazzlingDmg;
    }

    let appliedFireTotal = applyFireResistance(fireTotal);
    if (appliedFireTotal > 0) enemyState.current.hitByFire = true;
    let totalDone = radTotal + appliedFireTotal + equipAcidTotal + forceTotal;
    enemyState.current.hp -= totalDone;

    triggerFlash(ui.enemyAvatar);
    if (isCrit) { sfx.crit(); triggerShake(); spawnFloatingText(ui.enemyAvatar, `КРИТ! -${totalDone}`, "#f44336"); }
    else { sfx.hit(); spawnFloatingText(ui.enemyAvatar, `-${totalDone}`, (player.level >= 3 ? "#e64a19" : "#fbc02d")); }

    let hitMsg = `[${atkTypeStr}] ${isCrit ? `<span class="crit">КРИТ!</span> ` : `Попадание (<span class="dice-roll">${d20}</span>+${player.hitMod}=${atkTotal}). `}`;
    if (player.level >= 3) { 
        hitMsg += `<br>Урон: <span class="dmg-fire">${appliedFireTotal} огн.</span>`; 
        if (giantFireTotal > 0) hitMsg += ` (включая Огн. удар)`; 
    } else { 
        hitMsg += `<br>Урон: ${baseDmgStr}`; 
        if (giantFireTotal > 0) hitMsg += ` + <span class="dmg-fire">${appliedFireTotal} огн.</span> (Огн. удар)`; 
    }
    if (equipLogParts.length > 0) hitMsg += ` ${equipLogParts.join(', ')}`;
    if (aspectLogParts.length > 0) hitMsg += ` ${aspectLogParts.join(', ')}`;

    // --- Вампиризм от экипировки ---
    if (player.equipLifestealPct > 0 && totalDone > 0 && player.hp < player.maxHp) {
        const healed = Math.max(1, Math.ceil(totalDone * player.equipLifestealPct));
        const actualHealed = Math.min(healed, player.maxHp - player.hp);
        if (actualHealed > 0) {
            player.hp += actualHealed;
            spawnFloatingText(ui.playerAvatar, `+${actualHealed}`, "#4caf50");
            hitMsg += `<br><span style="color:#4caf50;">🩸 Вампиризм экипировки: +${actualHealed} ХП</span>`;
        }
    }

    log(hitMsg, 'player-turn');

    if (enemyState.current.hp <= 0 && enemyState.current.traits.includes('undead_fortitude') && !enemyState.current.usedFortitude) {
        if (Math.random() < 0.5) { enemyState.current.hp = 1; enemyState.current.usedFortitude = true; log(`💀 <b>Стойкость нежити!</b> Враг отказывается умирать и остается с 1 ХП!`, 'enemy-turn'); }
    }
}

export function executePlayerAttack(isBonus) {
    if (!isBonus && player.attacksRemaining <= 0) return;
    gameState.isAnimating = true; 
    let strikes;
    if (isBonus) { player.bonusActions--; strikes = 1; }
    else { strikes = player.attacksRemaining; player.attacksRemaining = 0; player.actions--; player.attackedThisTurn = true; }
    updateUI(); 

    let i = 0;
    function strikeLoop() {
        if (i < strikes && enemyState.current.hp > 0) {
            performSingleStrike((isBonus ? "Бонусная атака" : "Осн. атака") + (strikes > 1 ? ` #${i+1}` : ''), !isBonus);
            updateUI(); i++; setTimeout(strikeLoop, TIMINGS.strikeDelay); 
        } else { gameState.isAnimating = false; checkCombatState(); }
    }
    strikeLoop();
}

const PHYSICAL_TYPES = ['bludgeoning', 'piercing', 'slashing'];

function takePlayerDamage(amount, dmgType = 'bludgeoning') {
    let dmg = amount;

    // --- Опаловая броня: Сопротивление ТОЛЬКО физическому урону (дробящему,
    // колющему, рубящему), пока облачены в Мантию Духа. На огонь,
    // некротический, кислотный и другой стихийный/магический урон не
    // действует — см. её описание в aspects.js. ---
    if (has('opalescent_armor') && PHYSICAL_TYPES.includes(dmgType)) {
        dmg = Math.max(0, Math.floor(dmg / 2));
    }

    // --- Огнестойкость Сосуда (с 3 уровня, см. player.fireResistant): постоянное
    // Сопротивление огненному урону — не завязано на Форму Архонта и не
    // расходует Реакцию, в отличие от Опалового щита ниже. ---
    if (dmgType === 'fire' && player.fireResistant && dmg > 0) {
        dmg = Math.max(0, Math.floor(dmg / 2));
        log(`🛡️ <b>Огнестойкость:</b> огненный урон снижен вдвое.`, 'system');
    }

    // --- Опаловый щит: реакцией поглощаем часть урона (уровень + мод. Харизмы). ---
    // Расходует Реакцию (тот же ресурс, что и Адское возмездие) и срабатывает
    // только на один инстанс урона за раз (1 удар/атака/спасбросок и т.д.).
    // Если игрок вооружил Адское возмездие (чекбокс), Реакция резервируется под него —
    // Опаловый щит в этот момент не срабатывает.
    if (has('iridescent_shield') && dmg > 0 && player.reactionAvailable && !ui.rebukeToggle.checked) {
        player.reactionAvailable = false;
        const reduction = Math.min(dmg, player.level + player.chaMod);
        dmg -= reduction;
        log(`🛡️ <b>Опаловый щит</b> (Реакция): урон снижен на ${reduction}.`, 'player-turn');
    }

    if (player.tempHp > 0) {
        if (player.tempHp >= dmg) { player.tempHp -= dmg; dmg = 0; } 
        else { dmg -= player.tempHp; player.tempHp = 0; }
    }
    player.hp -= dmg;
    return dmg;
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

    // Мультиатака: враг бьёт enemyState.current.attacks раз подряд (по
    // умолчанию 1 — обычное поведение). Каждый удар — полноценная атака
    // со своим броском, критом и уроном; серия останавливается сразу,
    // как только бой решился (игрок пал, или враг погиб от Возмездия).
    const totalAttacks = Math.max(1, enemyState.current.attacks || 1);
    let strikeIndex = 0;

    function nextStrike() {
        if (!gameState.inCombat || enemyState.current.hp <= 0) return;

        strikeIndex++;
        performEnemyStrike(strikeIndex, totalAttacks);

        if (checkCombatState()) return; // Бой завершился этим ударом

        if (strikeIndex < totalAttacks) {
            setTimeout(nextStrike, TIMINGS.strikeDelay);
        } else {
            setTimeout(() => { gameState.isAnimating = false; startPlayerTurn(); }, TIMINGS.enemyTurnEnd);
        }
    }

    setTimeout(nextStrike, TIMINGS.enemyTurnStart);
}

// Один удар вражеской атаки (обычной или одной из серии Мультиатаки).
// index/total нужны только для подписи в логе, когда ударов больше одного.
function performEnemyStrike(index, total) {
    const label = total > 1 ? ` <span style="color:#888; font-size:11px;">(удар ${index}/${total})</span>` : '';
    let critThreshold = enemyState.current.traits.includes('reckless') ? 19 : 20;

    // --- Помеха от Устрашающего облика (Perilous Visage) ---
    const hasDisadvantage = player.enemyFrightened;
    let d20 = roll(20);
    if (hasDisadvantage) { const d20b = roll(20); if (d20b < d20) d20 = d20b; }

    const atkTotal = d20 + enemyState.current.hitMod; const isCrit = d20 >= critThreshold;
    const isMiss = d20 === 1 || (!isCrit && atkTotal < player.ac);

    if (isMiss && !isCrit) {
        sfx.miss(); spawnFloatingText(ui.playerAvatar, "Уворот", "#9e9e9e");
        log(`${enemyState.current.name}${label} не пробивает (<span class="dice-roll">${d20}</span>${hasDisadvantage ? ' [помеха]' : ''} + ${enemyState.current.hitMod} = ${atkTotal}) Эфирную броню!`, 'enemy-turn');
        return;
    }

    let rawDmg = roll(enemyState.current.dmgD, enemyState.current.dmgC) + (isCrit ? roll(enemyState.current.dmgD, enemyState.current.dmgC) : 0) + enemyState.current.dmgMod;

    const dt = damageTypeMeta[enemyState.current.dmgType] || damageTypeMeta.bludgeoning;
    const totalDmg = takePlayerDamage(rawDmg, enemyState.current.dmgType);
    
    triggerFlash(ui.playerAvatar);
    if (isCrit) { sfx.crit(); triggerShake(); spawnFloatingText(ui.playerAvatar, `КРИТ! -${totalDmg}`, "#f44336"); }
    else { sfx.hit(); spawnFloatingText(ui.playerAvatar, `-${totalDmg}`, "#d32f2f"); }

    let eMsg = `${enemyState.current.name}${label} ${isCrit ? '<span class="crit">наносит КРИТ!</span> ' : `попадает. `}Вы получаете <b>${totalDmg}</b> <span class="${dt.className}">${dt.label}</span> урона!`;
    if (rawDmg !== totalDmg) eMsg += ` <i>(снижено с ${rawDmg})</i>`;
    
    if (enemyState.current.traits.includes('lifesteal') && totalDmg > 0) {
        let heal = Math.floor(totalDmg / 2); enemyState.current.hp = Math.min(enemyState.current.maxHp, enemyState.current.hp + heal);
        eMsg += ` <br>🦇 <i>Вампиризм: враг восстановил ${heal} ХП.</i>`;
    }
    log(eMsg, 'enemy-turn');

    if (ui.rebukeToggle.checked && player.spellSlots > 0 && player.reactionAvailable && totalDmg > 0 && enemyState.current.hp > 0) {
        player.spellSlots--; ui.rebukeToggle.checked = false; player.reactionAvailable = false;
        sfx.fire();
        let rebukeDmg = getFireDamageTotal(player.slotLevel + 1, 10); 
        rebukeDmg = applyFireResistance(rebukeDmg);
        enemyState.current.hp -= rebukeDmg;
        
        triggerFlash(ui.enemyAvatar); spawnFloatingText(ui.enemyAvatar, `-${rebukeDmg}`, "#e64a19");
        log(`🌋 Вы применяете <b>Адское возмездие</b> (Реакция)! Враг получает <span class="dmg-fire">${rebukeDmg} огн.</span> урона.`, 'player-turn');
    } else if (ui.rebukeToggle.checked && !player.reactionAvailable) {
        ui.rebukeToggle.checked = false;
        log(`⛔ <b>Адское возмездие</b> не сработало: Реакция уже потрачена в этом ходу.`, 'system');
    }
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
        grantAspectSlotsIfNeeded();
        if (levelUpMsgs.length > 0) sfx.levelup();
        levelUpMsgs.forEach(msg => log(msg, 'levelup'));
        
        logStageHint(); // Напоминаем, сколько взаимодействий осталось на этапе
        updateUI(); 
        
        refreshStageUi(); // Обновляем панель этапа (карта уже помечена как пройденная точка)
        saveGame();       // СОХРАНЯЕМ ВЕСЬ ПРОГРЕСС, ЛОГИ, КАРТУ И ВРАГА!
        tryShowAspectPicker(); // Если за бой набрался выбор Аспекта — предложить его сейчас
        
        return true;
    } else if (player.hp <= 0) {
        gameState.inCombat = false; setTimeout(() => showLoseScreen(gameState.stage, player.level), TIMINGS.gameOver); return true;
    }
    return false;
}
