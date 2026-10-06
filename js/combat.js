import { player, enemyState, gameState, damageTypeMeta } from './state.js';
import { ui, updateUI, log, renderNewEnemy, showLoseScreen, showWinScreen, spawnFloatingText, triggerFlash, triggerShake } from './ui.js';
import { roll, TIMINGS } from './utils.js';
import { enterStage, refreshStageUi, logStageHint } from './map.js';
import { sfx } from './audio.js';
import { saveGame } from './storage.js'; // <-- Добавлено
import { has, grantAspectSlotsIfNeeded, tryShowAspectPicker } from './aspects.js';
import { abilityCatalog, conditionMeta, saveNames, describeAbility } from './abilities.js';
import {
    hasCond, clearConditions, applyCondition, drainMaxHp, restoreMaxHp,
    attackDisadvantageNames, enemyAdvantageNames,
    applyTurnStartConditions, processTurnEndConditions, endEnemyTurnCleanup
} from './conditions.js';

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
    restoreMaxHp(); clearConditions(); // на случай, если прошлый бой оборвался с активными эффектами
    gameState.isAnimating = false; enemyState.generate(gameState.stage, isElite, variantIdx); renderNewEnemy();
    gameState.inCombat = true; player.archonActive = false; player.tempHp = 0; player.archonAspectAcBonus = 0;
    // Сброс ресурсов Аспектов на бой
    player.minorMagickUsedThisCombat = false; player.enemyFrightened = false;
    player.reactionAvailable = true;
    updateUI();
    log(`<b>--- Битва ${gameState.stage} / ${gameState.maxStage}: ${enemyState.current.name} ---</b>`, 'system');
    logEnemyAbilities();
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
    ui.fireToggle.checked = false; log(`<b>Ваш ход!</b>`, 'player-turn');
    enemyState.current.hpAtRoundStart = enemyState.current.hp; // для механики голов Гидры

    // Эффекты состояний (вставание, замедление, очарование, паралич)
    const skipTurn = applyTurnStartConditions();
    if (skipTurn) {
        gameState.isAnimating = true; updateUI();
        setTimeout(() => { if (gameState.inCombat) startEnemyTurn(); }, TIMINGS.enemyTurnEnd);
        return;
    }
    updateUI();
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
    // Помеха от состояний (Отравлен, Испуган, Опутан, Ослеплён): бросаем два d20, берём меньший
    const disadvNames = attackDisadvantageNames();
    const disadvTag = disadvNames.length ? ` <span style="color:#e57373;">[помеха: ${disadvNames.join(', ')}]</span>` : '';
    if (disadvNames.length) { const d20b = roll(20); if (d20b < d20) d20 = d20b; }
    const atkTotal = d20 + player.hitMod;
    const isCrit = d20 >= 20;
    const isMiss = d20 === 1 || (!isCrit && atkTotal < enemyState.current.ac);

    if (isMiss && !isCrit) { 
        sfx.miss(); spawnFloatingText(ui.enemyAvatar, "Промах", "#9e9e9e");
        log(`[${atkTypeStr}] Промах! <span class="dice-roll">${d20}</span> + ${player.hitMod} = ${atkTotal} vs AC ${enemyState.current.ac}${disadvTag}`, 'player-turn'); return; 
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

    let hitMsg = `[${atkTypeStr}] ${isCrit ? `<span class="crit">КРИТ!</span> ` : `Попадание (<span class="dice-roll">${d20}</span>+${player.hitMod}=${atkTotal}).${disadvTag} `}`;
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

// ===================================================================
// ХОД ВРАГА
// Порядок как в D&D: (конец вашего хода → повторные спасброски состояний)
// → механики врага (головы Гидры, Ярость, Перезарядка)
// → урон от состояний (горение, пиявка)
// → бонусная способность → ОСОБОЕ ДЕЙСТВИЕ либо Мультиатака (+ «при попадании»).
// ===================================================================
export function startEnemyTurn() {
    if (!gameState.inCombat) return;
    const e = enemyState.current;

    // Конец вашего хода: повторные спасброски от состояний, истечение длительности
    processTurnEndConditions();

    gameState.turn = 'enemy'; gameState.isAnimating = true; updateUI();
    log(`<b>Ход врага...</b>`, 'enemy-turn');
    e.turnFlags = {};

    updateHeads(); // считаем урон за раунд ДО регенерации и сброса флага огня

    if (e.traits.includes('regeneration') && e.hp > 0 && e.hp < e.maxHp) {
        if (!e.hitByFire) {
            let heal = 10; e.hp = Math.min(e.maxHp, e.hp + heal);
            log(`💚 Враг <b>регенерирует</b> ${heal} ХП!`, 'enemy-turn'); updateUI();
        } else log(`🔥 Огонь подавляет регенерацию врага!`, 'system');
    }
    e.hitByFire = false;

    // «Кровавая ярость»: раненый враг бьёт чаще
    if (e.traits.includes('frenzy') && !e.frenzied && e.hp > 0 && e.hp <= e.maxHp / 2) {
        e.frenzied = true; e.attacks += 1;
        log(`🩸 <b>Кровавая ярость!</b> ${e.name} впадает в неистовство — ударов за ход: ${e.attacks}.`, 'enemy-turn');
        updateUI();
    }

    rechargeAbilities();

    setTimeout(runEnemyTurn, TIMINGS.enemyTurnStart);
}

function endEnemyTurn() {
    endEnemyTurnCleanup();
    setTimeout(() => { gameState.isAnimating = false; startPlayerTurn(); }, TIMINGS.enemyTurnEnd);
}

function runEnemyTurn() {
    const e = enemyState.current;
    if (!gameState.inCombat || e.hp <= 0) return;

    // 1) Урон от состояний игрока (горение, присосавшаяся пиявка)
    const ticked = tickPlayerConditions();
    if (ticked && checkCombatState()) return;

    const afterTicks = () => {
        if (!gameState.inCombat || e.hp <= 0) return;
        // 2) Бонусная способность (атаки после неё остаются)
        const bonus = pickAbility('bonus');
        if (bonus) { useAbility(bonus); if (checkCombatState()) return; }
        // 3) Основная фаза
        if (bonus) setTimeout(enemyMainPhase, TIMINGS.strikeDelay); else enemyMainPhase();
    };
    if (ticked) setTimeout(afterTicks, TIMINGS.strikeDelay); else afterTicks();
}

function enemyMainPhase() {
    const e = enemyState.current;
    if (!gameState.inCombat || e.hp <= 0) return;

    // Особое действие (дыхание, заклинание...) ЗАМЕНЯЕТ Мультиатаку на этот ход
    const action = pickAbility('action');
    let totalAttacks = Math.max(1, e.attacks || 1);
    if (action) {
        useAbility(action);
        if (checkCombatState()) return;
        totalAttacks = abilityCatalog[action.id].thenStrikes || 0;
        if (!totalAttacks) { endEnemyTurn(); return; }
        setTimeout(() => runStrikes(totalAttacks), TIMINGS.strikeDelay);
        return;
    }
    runStrikes(totalAttacks);
}

// Мультиатака: враг бьёт total раз подряд (по умолчанию e.attacks).
// Каждый удар — полноценная атака со своим броском, критом и уроном;
// серия останавливается сразу, как только бой решился.
function runStrikes(totalAttacks) {
    const e = enemyState.current;
    let strikeIndex = 0;

    function nextStrike() {
        if (!gameState.inCombat || e.hp <= 0) return;

        strikeIndex++;
        performEnemyStrike(strikeIndex, totalAttacks);

        if (checkCombatState()) return; // Бой завершился этим ударом

        if (strikeIndex < totalAttacks) setTimeout(nextStrike, TIMINGS.strikeDelay);
        else endEnemyTurn();
    }
    nextStrike();
}

// ---------- Механики врага ----------

// Гидра: если за раунд игрок нанёс >= cut урона, одна голова отсечена.
// Без огня на её месте вырастают ДВЕ (+1 удар, до heads.max), огонь прижигает шею (−1 удар).
function updateHeads() {
    const e = enemyState.current;
    if (!e.heads || e.hp <= 0) return;
    const lost = (e.hpAtRoundStart != null ? e.hpAtRoundStart : e.hp) - e.hp;
    if (lost < e.heads.cut) return;
    if (e.hitByFire) {
        e.attacks = Math.max(1, e.attacks - 1);
        log(`🔥 Мощный удар (−${lost} ХП) отсекает голову, и огонь прижигает шею — она не отрастёт! Ударов за ход: ${e.attacks}.`, 'player-turn');
    } else {
        e.attacks = Math.min(e.heads.max, e.attacks + 1);
        log(`🐍 Вы отсекли голову, но без огня на её месте отрастают <b>две</b> новые! Ударов за ход: ${e.attacks}.`, 'enemy-turn');
    }
}

// «Перезарядка N–6»: в начале хода врага d6 для каждой остывшей способности
function rechargeAbilities() {
    const e = enemyState.current;
    (e.abilities || []).forEach(a => {
        const def = abilityCatalog[a.id];
        if (!def || !def.recharge || a.ready) return;
        const r = roll(6);
        if (r >= def.recharge) {
            a.ready = true;
            log(`🔄 <b>${def.name}</b> перезарядилась (d6: <span class="dice-roll">${r}</span>).`, 'enemy-turn');
        }
    });
}

// Выбрать готовую способность нужного типа (с учётом шанса применения)
function pickAbility(kind) {
    const e = enemyState.current;
    for (const a of (e.abilities || [])) {
        const def = abilityCatalog[a.id];
        if (!def || def.kind !== kind || !a.ready || a.usesLeft === 0) continue;
        if (Math.random() < (def.chance != null ? def.chance : 1)) return a;
    }
    return null;
}

function useAbility(entry) {
    const def = abilityCatalog[entry.id];
    if (def.uses != null && entry.usesLeft != null) entry.usesLeft--;
    if (def.recharge) entry.ready = false;
    resolveAbility(def);
}

// Карточка монстра в начале боя: что он умеет
function logEnemyAbilities() {
    const e = enemyState.current;
    const lines = (e.abilities || []).map(a => {
        const def = abilityCatalog[a.id];
        return def ? `${def.icon} <b>${def.name}</b> <span style="color:#aaa;">— ${describeAbility(def, abilityDc(def))}</span>` : '';
    }).filter(Boolean);
    if (e.heads) lines.push(`🐍 <b>Многоглавость</b> <span style="color:#aaa;">— ≥${e.heads.cut} урона за раунд отсекает голову; без огня вырастают две</span>`);
    if (e.traits.includes('frenzy')) lines.push(`🩸 <b>Кровавая ярость</b> <span style="color:#aaa;">— ниже 50% ХП +1 удар за ход</span>`);
    if (lines.length) log(`📜 <b>Особенности врага:</b><br>${lines.join('<br>')}`, 'system');
}

// ---------- Урон от состояний ----------
function tickPlayerConditions() {
    let any = false;
    Object.keys(player.conditions || {}).forEach(id => {
        const c = player.conditions[id];
        if (!c || !c.tick || player.hp <= 0) return;
        any = true;
        const dmg = roll(c.tick.d, c.tick.n);
        const dt = damageTypeMeta[c.tick.type] || damageTypeMeta.bludgeoning;
        const taken = takePlayerDamage(dmg, c.tick.type);
        triggerFlash(ui.playerAvatar); spawnFloatingText(ui.playerAvatar, `-${taken}`, "#d32f2f");
        log(`${conditionMeta[id].icon} <b>${c.tick.name || conditionMeta[id].name}:</b> вы получаете <b>${taken}</b> <span class="${dt.className}">${dt.label}</span> урона.`, 'enemy-turn');
    });
    return any;
}

// ---------- Выполнение способности ----------
function abilityDc(def) {
    const base = enemyState.current.saveDc != null ? enemyState.current.saveDc : 10;
    return def.dc != null ? def.dc : base + (def.dcBonus || 0);
}

const fmtMod = (n) => (n >= 0 ? `+${n}` : `${n}`);

function resolveAbility(def) {
    const e = enemyState.current;
    const hasSave = !!def.save;
    let html = `${def.icon} <b>${def.name}</b> — ${e.name} ${def.text}.`;
    let saved = false;
    const dc = abilityDc(def);

    // --- Спасбросок игрока ---
    if (hasSave) {
        const r = roll(20);
        const mod = player.saveMod(def.save);
        const total = r + mod;
        // Паралич: автоматический провал спасбросков Силы и Ловкости (как в D&D)
        const autoFail = hasCond('paralyzed') && (def.save === 'str' || def.save === 'dex');
        saved = !autoFail && total >= dc;
        html += `<br>🎲 Спасбросок ${saveNames[def.save]} (Сл ${dc}): <span class="dice-roll">${r}</span>${fmtMod(mod)} = ${total} — ` +
            (saved ? `<b style="color:#81c784;">успех</b>` : `<b style="color:#e57373;">провал</b>`) + (autoFail ? ' <i>(паралич: авто-провал)</i>' : '');
    }

    // --- Урон ---
    let hpLost = 0; let anyEffect = false;
    if (def.dmg) {
        const mode = def.dmgMode || 'half';
        const parts = [];
        def.dmg.forEach(p => {
            let amt = roll(p.d, p.n) + (p.bonus || 0);
            if (hasSave && saved) amt = mode === 'half' ? Math.floor(amt / 2) : (mode === 'fail' ? 0 : amt);
            if (amt <= 0) return;
            const dt = damageTypeMeta[p.type] || damageTypeMeta.bludgeoning;
            const lost = takePlayerDamage(amt, p.type);
            hpLost += lost;
            parts.push(`<b>${lost}</b> <span class="${dt.className}">${dt.label}</span>${lost !== amt ? ` <i>(снижено с ${amt})</i>` : ''}`);
        });
        if (parts.length) {
            anyEffect = true;
            html += `<br>Вы получаете ${parts.join(' + ')} урона` + (saved && mode === 'half' ? ' <i>(спасбросок — вдвое меньше)</i>' : '') + '.';
        } else html += `<br>Урон не получен.`;
    }

    // --- Состояние (только при провале спасброска) ---
    if (def.cond && (!hasSave || !saved)) {
        const res = applyCondition(def.cond.id, { turns: def.cond.turns, tick: def.cond.tick, dc });
        const meta = conditionMeta[def.cond.id];
        if (res === 'immune') html += `<br>🛡️ Вы ещё не оправились от прошлого эффекта — <b>${meta.name}</b> не действует.`;
        else { anyEffect = true; html += `<br>${meta.icon} <b>${meta.name}:</b> ${meta.desc}`; }
    }

    // --- Иссушение макс. ХП ---
    if (def.drain && (!hasSave || !saved) && hpLost > 0) {
        const n = drainMaxHp(hpLost);
        if (n > 0) { anyEffect = true; html += `<br>🩸 <b>Иссушение:</b> максимум ХП снижен на ${n} до конца боя.`; }
    }

    // --- Кража золота ---
    if (def.steal && (!hasSave || !saved)) {
        const amount = Math.min(player.gold, Math.max(1, Math.floor(player.gold * def.steal)));
        if (player.gold > 0 && amount > 0) {
            player.gold -= amount; e.stolenGold = (e.stolenGold || 0) + amount; anyEffect = true;
            html += `<br>🪙 Украдено <b>${amount}</b> золота! Убейте вора — и вернёте кошель.`;
        } else html += `<br>🪙 Кошель пуст — красть нечего.`;
    }

    log(html, 'enemy-turn');

    // --- Звук и анимация ---
    if (hpLost > 0) {
        triggerFlash(ui.playerAvatar); spawnFloatingText(ui.playerAvatar, `-${hpLost}`, "#d32f2f");
    } else if (hasSave && saved && !anyEffect) {
        spawnFloatingText(ui.playerAvatar, "Устоял", "#81c784");
    }
    if (anyEffect || hpLost > 0) { (sfx[def.sfx] || sfx.hit)(); if (def.shake) triggerShake(); }
    else sfx.miss();

    if (hpLost > 0 && player.hp > 0 && e.hp > 0) tryHellishRebuke(hpLost);
}

// Адское возмездие: реакция на полученный урон (общий код для ударов и способностей)
function tryHellishRebuke(totalDmg) {
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

// «При попадании»: после удачного удара серии проверяем способности-приложения
function runRiders(index, total) {
    const e = enemyState.current;
    (e.abilities || []).forEach(entry => {
        if (player.hp <= 0 || e.hp <= 0) return;
        const def = abilityCatalog[entry.id];
        if (!def || def.kind !== 'rider') return;
        if (def.onStrike === 'first' && index !== 1) return;
        if (def.onStrike === 'last' && index !== total) return;
        if (def.requires && !def.requires.some(hasCond)) return;
        if (!e.turnFlags) e.turnFlags = {};
        if (def.once !== false && e.turnFlags[entry.id]) return;
        e.turnFlags[entry.id] = true;
        resolveAbility(def);
    });
}

// «При смерти» (Костяной взрыв и т.п.)
function runDeathAbilities() {
    const e = enemyState.current;
    (e.abilities || []).forEach(entry => {
        const def = abilityCatalog[entry.id];
        if (def && def.kind === 'death') resolveAbility(def);
    });
}

// Один удар вражеской атаки (обычной или одной из серии Мультиатаки).
// index/total нужны для подписи в логе и для способностей «первый/последний удар».
function performEnemyStrike(index, total) {
    const e = enemyState.current;
    const label = total > 1 ? ` <span style="color:#888; font-size:11px;">(удар ${index}/${total})</span>` : '';
    let critThreshold = e.traits.includes('reckless') ? 19 : 20;

    // --- Преимущество (Опутан/Ослеплён/Парализован/Сбит с ног) и помеха (Устрашающий облик) ---
    const advNames = enemyAdvantageNames();
    const hasAdvantage = advNames.length > 0;
    const hasDisadvantage = player.enemyFrightened;
    let d20 = roll(20);
    if (hasAdvantage !== hasDisadvantage) { // преимущество и помеха взаимно гасятся
        const d20b = roll(20);
        d20 = hasAdvantage ? Math.max(d20, d20b) : Math.min(d20, d20b);
    }
    const rollTag = (hasAdvantage !== hasDisadvantage) ? (hasAdvantage ? ` [преимущество: ${advNames.join(', ')}]` : ' [помеха]') : '';

    const atkTotal = d20 + e.hitMod;
    // Против парализованного любое попадание — критическое
    const isCrit = d20 >= critThreshold || (hasCond('paralyzed') && d20 !== 1 && atkTotal >= player.ac);
    const isMiss = d20 === 1 || (!isCrit && atkTotal < player.ac);

    if (isMiss && !isCrit) {
        sfx.miss(); spawnFloatingText(ui.playerAvatar, "Уворот", "#9e9e9e");
        log(`${e.name}${label} не пробивает (<span class="dice-roll">${d20}</span>${rollTag} + ${e.hitMod} = ${atkTotal}) Эфирную броню!`, 'enemy-turn');
        return;
    }

    let rawDmg = roll(e.dmgD, e.dmgC) + (isCrit ? roll(e.dmgD, e.dmgC) : 0) + e.dmgMod;

    const dt = damageTypeMeta[e.dmgType] || damageTypeMeta.bludgeoning;
    const totalDmg = takePlayerDamage(rawDmg, e.dmgType);
    
    triggerFlash(ui.playerAvatar);
    if (isCrit) { sfx.crit(); triggerShake(); spawnFloatingText(ui.playerAvatar, `КРИТ! -${totalDmg}`, "#f44336"); }
    else { sfx.hit(); spawnFloatingText(ui.playerAvatar, `-${totalDmg}`, "#d32f2f"); }

    let eMsg = `${e.name}${label} ${isCrit ? '<span class="crit">наносит КРИТ!</span> ' : `попадает. `}Вы получаете <b>${totalDmg}</b> <span class="${dt.className}">${dt.label}</span> урона!`;
    if (rawDmg !== totalDmg) eMsg += ` <i>(снижено с ${rawDmg})</i>`;
    if (rollTag && hasAdvantage) eMsg += ` <span style="color:#e57373; font-size:11px;">${rollTag}</span>`;
    
    if (e.traits.includes('lifesteal') && totalDmg > 0) {
        let heal = Math.floor(totalDmg / 2); e.hp = Math.min(e.maxHp, e.hp + heal);
        eMsg += ` <br>🦇 <i>Вампиризм: враг восстановил ${heal} ХП.</i>`;
    }
    log(eMsg, 'enemy-turn');

    tryHellishRebuke(totalDmg);

    // --- Способности «при попадании» (с их спасбросками) ---
    if (player.hp > 0 && e.hp > 0) runRiders(index, total);
}

function checkCombatState() {
    updateUI();
    if (enemyState.current.hp <= 0) {
        // «При смерти» (Костяной взрыв): срабатывает один раз, ДО подведения итогов боя
        if (!enemyState.current.deathDone) {
            enemyState.current.deathDone = true;
            log(`<b>${enemyState.current.name} повержен!</b>`, 'system');
            runDeathAbilities(); updateUI();
            if (player.hp <= 0) { gameState.inCombat = false; setTimeout(() => showLoseScreen(gameState.stage, player.level), TIMINGS.gameOver); return true; }
        } else log(`<b>${enemyState.current.name} повержен!</b>`, 'system');

        gameState.inCombat = false; gameState.isAnimating = true; 
        sfx.coin(); 
        restoreMaxHp(); clearConditions(); // Иссушение и боевые состояния не переживают бой
        if (gameState.stage === gameState.maxStage) { setTimeout(showWinScreen, TIMINGS.gameOver); return true; }

        player.xp += enemyState.current.xpGiven; player.gold += enemyState.current.goldGiven;
        if (enemyState.current.goldCritMsg) { log(enemyState.current.goldCritMsg, 'system'); } 
        else { log(`Получено ${enemyState.current.xpGiven} опыта и 💰 ${enemyState.current.goldGiven} золота.`, 'system'); }
        if (enemyState.current.stolenGold > 0) {
            player.gold += enemyState.current.stolenGold;
            log(`🪙 Вы возвращаете украденное: +${enemyState.current.stolenGold} золота.`, 'system');
            enemyState.current.stolenGold = 0;
        }
        
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
