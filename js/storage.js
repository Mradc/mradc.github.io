import { player, enemyState, gameState } from './state.js';
import { ui } from './ui.js';
import { recomputeNonHpEquipStats } from './equipment.js';

export function saveGame() {
    const data = {
        player: {
            level: player.level, xp: player.xp, gold: player.gold,
            bonusAc: player.bonusAc, maxHp: player.maxHp, hp: player.hp,
            currentGiantStrikeCharges: player.currentGiantStrikeCharges,
            spellSlots: player.spellSlots, inventory: player.inventory, healTier: player.healTier,
            equipment: player.equipment, equipmentBag: player.equipmentBag, ownedUnique: player.ownedUnique, knownAspects: player.knownAspects
        },
        stage: gameState.stage,
        map: gameState.map,
        enemy: enemyState.current,
        settlementVisit: gameState.settlementVisit,
        pendingAspectChoices: gameState.pendingAspectChoices,
        logHTML: ui.log.innerHTML // Сохраняем весь текст и цветные логи!
    };
    localStorage.setItem('vessel_save', JSON.stringify(data));
}

export function loadGame() {
    const save = localStorage.getItem('vessel_save');
    if (!save) return false;
    const data = JSON.parse(save);
    
    player.loadData(data.player);
    recomputeNonHpEquipStats();
    gameState.stage = data.stage;
    gameState.map = data.map || null; // старые сохранения (с paths) просто сгенерируют новую карту
    gameState.settlementVisit = data.settlementVisit || null;
    gameState.pendingAspectChoices = data.pendingAspectChoices || 0;
    enemyState.current = data.enemy || null;
    
    if (data.logHTML) {
        ui.log.innerHTML = data.logHTML;
        setTimeout(() => { ui.log.scrollTop = ui.log.scrollHeight; }, 10);
    }
    
    return true;
}

export function clearSave() {
    localStorage.removeItem('vessel_save');
}

export function saveStats(stage, won = false) {
    let stats = JSON.parse(localStorage.getItem('vessel_stats')) || { runs: 0, maxStage: 0, wins: 0 };
    stats.runs++;
    if (stage > stats.maxStage) stats.maxStage = stage;
    if (won) stats.wins++;
    localStorage.setItem('vessel_stats', JSON.stringify(stats));
}

export function getStats() {
    return JSON.parse(localStorage.getItem('vessel_stats')) || { runs: 0, maxStage: 0, wins: 0 };
}
