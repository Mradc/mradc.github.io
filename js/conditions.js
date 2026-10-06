import { player, enemyState } from './state.js';
import { log } from './ui.js';
import { roll } from './utils.js';
import { conditionMeta, saveNames } from './abilities.js';

// ===================================================================
// СОСТОЯНИЯ ИГРОКА (как в D&D 5e) — действуют только в рамках одного боя.
// Хранятся в player.conditions: { id: { turns, dc, tick } }
// ===================================================================

// Состояния, дающие игроку ПОМЕХУ на броски атаки
const ATTACK_DISADVANTAGE = ['poisoned', 'frightened', 'restrained', 'blinded'];
// Состояния, дающие врагу ПРЕИМУЩЕСТВО на атаки по игроку
const ENEMY_ADVANTAGE = ['restrained', 'blinded', 'paralyzed', 'prone'];

const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);

export function hasCond(id) { return !!(player.conditions && player.conditions[id]); }

export function clearConditions() { player.conditions = {}; player.ccImmune = false; }

export function attackDisadvantageNames() {
    return ATTACK_DISADVANTAGE.filter(hasCond).map(id => conditionMeta[id].name);
}
export function enemyAdvantageNames() {
    return ENEMY_ADVANTAGE.filter(hasCond).map(id => conditionMeta[id].name);
}

// Наложить состояние. Возвращает 'applied' | 'extended' | 'immune'.
export function applyCondition(id, opts = {}) {
    const meta = conditionMeta[id];
    if (!meta) return 'immune';
    if (meta.hard && player.ccImmune) return 'immune';
    if (!player.conditions) player.conditions = {};

    const turns = opts.turns || 2;
    const cur = player.conditions[id];
    if (cur) {
        cur.turns = Math.max(cur.turns, turns);
        if (opts.dc) cur.dc = Math.max(cur.dc || 0, opts.dc);
        if (opts.tick) cur.tick = opts.tick;
        return 'extended';
    }
    player.conditions[id] = { turns, dc: opts.dc || null, tick: opts.tick || null };
    return 'applied';
}

function removeCondition(id) {
    const meta = conditionMeta[id];
    delete player.conditions[id];
    // После жёсткого контроля даём передышку до конца следующего хода врага
    if (meta && meta.hard) player.ccImmune = true;
}

// --- Макс. ХП: «Иссушение» (некротическое вытягивание жизни) ---
// Снижает player.maxHp до конца боя; restoreMaxHp() вызывается после боя.
export function drainMaxHp(amount) {
    const n = Math.min(Math.max(0, amount), player.maxHp - 1);
    if (n <= 0) return 0;
    player.maxHp -= n;
    player.hpDrain = (player.hpDrain || 0) + n;
    if (player.hp > player.maxHp) player.hp = player.maxHp;
    return n;
}

export function restoreMaxHp() {
    if (!player.hpDrain) return;
    player.maxHp += player.hpDrain;
    log(`✨ Иссушающая хватка отпускает: максимум ХП восстановлен (+${player.hpDrain}).`, 'system');
    player.hpDrain = 0;
}

// --- Начало хода игрока: эффекты состояний. Возвращает true, если ход пропускается ---
export function applyTurnStartConditions() {
    const c = player.conditions || {};
    let skip = false;

    if (c.prone) {
        delete c.prone;
        player.bonusActions = 0;
        log(`🤸 Вы поднимаетесь с земли — это стоит бонусное действие.`, 'system');
    }
    if (c.slowed) {
        player.bonusActions = 0; player.reactionAvailable = false;
        log(`🐌 <b>Замедлен:</b> на этом ходу у вас нет бонусного действия и реакции.`, 'system');
    }
    if (c.charmed) {
        player.actions = 0; player.attacksRemaining = 0;
        log(`💫 <b>Очарован:</b> вы не в силах поднять руку на очаровавшего — Действие потеряно (зелья и бонусные действия доступны).`, 'enemy-turn');
    }
    if (c.paralyzed) {
        player.actions = 0; player.bonusActions = 0; player.attacksRemaining = 0; player.reactionAvailable = false;
        log(`⚡ <b>Парализован:</b> вы не можете двигаться и теряете весь ход!`, 'enemy-turn');
        skip = true;
    }
    return skip;
}

// --- Конец хода игрока: повторные спасброски и истечение длительности ---
export function processTurnEndConditions() {
    if (!player.conditions) return;
    Object.keys(player.conditions).forEach(id => {
        const c = player.conditions[id];
        const meta = conditionMeta[id];
        if (!c || !meta) { delete player.conditions[id]; return; }

        if (meta.endSave) {
            const r = roll(20);
            const mod = player.saveMod(meta.endSave);
            const total = r + mod;
            const dc = c.dc || (enemyState.current && enemyState.current.saveDc) || 10;
            if (total >= dc) {
                removeCondition(id);
                log(`✅ <b>${meta.name}</b> снято: спасбросок ${saveNames[meta.endSave]} (<span class="dice-roll">${r}</span>${fmt(mod)} = ${total} vs Сл ${dc}).`, 'player-turn');
                return;
            }
            log(`❌ <b>${meta.name}</b> держится: спасбросок ${saveNames[meta.endSave]} (<span class="dice-roll">${r}</span>${fmt(mod)} = ${total} vs Сл ${dc}).`, 'player-turn');
        }

        c.turns--;
        if (c.turns <= 0) {
            removeCondition(id);
            log(`${meta.icon} <b>${meta.name}</b> проходит сам собой.`, 'system');
        }
    });
}

// Вызывается в конце хода врага
export function endEnemyTurnCleanup() { player.ccImmune = false; }
