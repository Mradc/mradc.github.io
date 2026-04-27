import { player, enemyState, gameState } from './state.js';
import { xpThresholds } from './utils.js';

export const ui = {
    menu: document.getElementById('menu-screen'), game: document.getElementById('game-screen'), over: document.getElementById('game-over-screen'), log: document.getElementById('combat-log'),
    btnMain: document.getElementById('btn-attack-main'), btnBonus: document.getElementById('btn-attack-bonus'), btnEnd: document.getElementById('btn-end-turn'), btnArchon: document.getElementById('btn-archon'),
    btnStart: document.getElementById('btn-start'), btnRestart: document.getElementById('btn-restart'),
    fireToggle: document.getElementById('fire-toggle'), giantStrikeText: document.getElementById('giant-strike-text'),
    rebukeBox: document.getElementById('rebuke-box'), rebukeToggle: document.getElementById('rebuke-toggle'), rebukeText: document.getElementById('rebuke-text'),
    indAction: document.querySelector('#ind-action .dot'), indBonus: document.querySelector('#ind-bonus .dot'),
    playerHpText: document.getElementById('player-hp-text'), playerHpBar: document.getElementById('player-hp-bar'), playerXpText: document.getElementById('player-xp-text'), playerXpBar: document.getElementById('player-xp-bar'),
    playerLevel: document.getElementById('player-level'), playerAc: document.getElementById('player-ac'), playerGold: document.getElementById('player-gold'),
    enemyHpText: document.getElementById('enemy-hp-text'), enemyHpBar: document.getElementById('enemy-hp-bar'), enemyAvatar: document.getElementById('enemy-avatar'), enemyName: document.getElementById('enemy-name'),
    enemyAc: document.getElementById('enemy-ac'), enemyTraits: document.getElementById('enemy-traits'),
    gameOverTitle: document.getElementById('game-over-title'), gameOverDesc: document.getElementById('game-over-desc'),
    
    combatActions: document.getElementById('combat-actions'), intermissionActions: document.getElementById('intermission-actions'), indicators: document.getElementById('indicators'),
    btnNextStage: document.getElementById('btn-next-stage'), btnOpenShop: document.getElementById('btn-open-shop'),
    shopModal: document.getElementById('shop-modal'), btnCloseShop: document.getElementById('btn-close-shop'), shopList: document.getElementById('shop-list'), shopGold: document.getElementById('shop-gold'),

    // Кнопки инвентаря
    btnPotHeal: document.getElementById('btn-pot-heal'), btnPotElixir: document.getElementById('btn-pot-elixir')
};

const traitNames = {
    'nimble': 'Вёрткий (15% Уклонение)', 'undead_fortitude': 'Стойкость нежити', 'lifesteal': 'Вампиризм',
    'regeneration': 'Регенерация', 'fire_resistance': 'Сопротивление огню', 'fire_immunity': 'Иммунитет к огню', 'reckless': 'Безрассудный (Крит 19-20)'
};

export function log(msg, type = 'system') {
    const el = document.createElement('div');
    el.className = `log-entry ${type}`; el.innerHTML = msg;
    ui.log.appendChild(el); setTimeout(() => { ui.log.scrollTop = ui.log.scrollHeight; }, 10);
}

export function renderNewEnemy() {
    if(!enemyState.current) return;
    ui.enemyAvatar.src = enemyState.current.avatar; ui.enemyName.innerText = enemyState.current.name; ui.enemyAc.innerText = enemyState.current.ac;
    ui.enemyTraits.innerText = enemyState.current.traits.length > 0 ? enemyState.current.traits.map(t => traitNames[t]).join(' • ') : "";
}

export function updateUI() {
    let hpStr = `${Math.max(0, player.hp)} / ${player.maxHp}`;
    if (player.tempHp > 0) hpStr += ` <span class="thp-text">(+${player.tempHp})</span>`;
    ui.playerHpText.innerHTML = hpStr; ui.playerHpBar.style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
    ui.playerGold.innerText = `💰 ${player.gold}`;
    
    if(player.level >= 10) { ui.playerXpBar.style.width = '100%'; ui.playerXpText.innerText = `МАКС. УРОВЕНЬ`; } 
    else {
        let prevXp = xpThresholds[player.level-1] || 0;
        ui.playerXpBar.style.width = `${Math.min(100, ((player.xp - prevXp) / (player.xpNeeded - prevXp)) * 100)}%`;
        ui.playerXpText.innerText = `${player.xp} / ${player.xpNeeded}`;
    }

    ui.playerLevel.innerText = `Ур. ${player.level}`; ui.playerAc.innerText = player.ac;

    if (enemyState.current) {
        ui.enemyHpText.innerText = `${Math.max(0, enemyState.current.hp)} / ${enemyState.current.maxHp}`;
        ui.enemyHpBar.style.width = `${Math.max(0, (enemyState.current.hp / enemyState.current.maxHp) * 100)}%`;
    }

    if (gameState.inCombat) {
        ui.combatActions.classList.remove('hidden'); ui.indicators.classList.remove('hidden'); ui.intermissionActions.classList.add('hidden');
        
        const canAct = gameState.turn === 'player' && !gameState.isAnimating;
        ui.btnMain.disabled = !canAct || player.actions === 0;
        ui.btnBonus.disabled = !canAct || player.bonusActions === 0 || !player.attackedThisTurn;
        ui.btnEnd.disabled = !canAct;
        ui.btnMain.innerText = player.attacksPerAction > 1 ? `Атака (${player.attacksPerAction})` : "Атака (Осн.)";
        
        ui.giantStrikeText.innerText = `Огн. Удар (${player.currentGiantStrikeCharges}/${player.maxGiantStrikeCharges})`;
        ui.fireToggle.disabled = !canAct || player.fireStrikeUsedThisTurn || player.currentGiantStrikeCharges <= 0;
        
        // Кнопки инвентаря
        ui.btnPotHeal.innerText = `❤️ Зелье (${player.inventory.heal})`;
        ui.btnPotHeal.disabled = !canAct || player.bonusActions === 0 || player.inventory.heal === 0 || player.hp >= player.maxHp;

        if (player.level >= 2) {
            ui.btnPotElixir.classList.remove('hidden');
            ui.btnPotElixir.innerText = `💧 Эликсир (${player.inventory.elixir})`;
            let isMaxRes = player.spellSlots >= player.maxSpellSlots && player.currentGiantStrikeCharges >= player.maxGiantStrikeCharges;
            ui.btnPotElixir.disabled = !canAct || player.bonusActions === 0 || player.inventory.elixir === 0 || isMaxRes;

            ui.rebukeBox.classList.remove('hidden'); ui.rebukeText.innerText = `(${player.spellSlots}/${player.maxSpellSlots})`;
            ui.rebukeToggle.disabled = !gameState.inCombat || player.spellSlots <= 0;
        } else {
            ui.btnPotElixir.classList.add('hidden');
            ui.rebukeBox.classList.add('hidden');
        }

        if (player.level >= 3) {
            ui.btnArchon.classList.remove('hidden'); ui.btnMain.style.gridColumn = "span 1";
            if (player.archonActive) { ui.btnArchon.disabled = true; ui.btnArchon.innerText = "Архонт Активен"; } 
            else if (player.level >= 7) { ui.btnArchon.disabled = true; ui.btnArchon.innerText = "Авто-Архонт"; } 
            else { ui.btnArchon.disabled = !canAct || player.bonusActions === 0; ui.btnArchon.innerText = "Форма Архонта"; }
        } else {
            ui.btnArchon.classList.add('hidden'); ui.btnMain.style.gridColumn = "span 2";
        }

        ui.indAction.className = `dot action ${player.actions > 0 ? '' : 'inactive'}`;
        ui.indBonus.className = `dot bonus ${player.bonusActions > 0 ? '' : 'inactive'}`;
    } else {
        ui.combatActions.classList.add('hidden'); ui.indicators.classList.add('hidden'); ui.intermissionActions.classList.remove('hidden');
    }
}

export function showLoseScreen(stage, level) {
    ui.game.classList.add('hidden'); ui.over.classList.remove('hidden');
    ui.gameOverTitle.innerText = "Вы Погибли"; ui.gameOverTitle.style.color = "var(--hp-color)";
    ui.gameOverDesc.innerHTML = `Вы дошли до <b>${stage} стадии</b> (Уровень ${level}).<br>Ваш дух сломлен.`;
}

export function showWinScreen() {
    ui.game.classList.add('hidden'); ui.over.classList.remove('hidden');
    ui.gameOverTitle.innerText = "Легендарная Победа!"; ui.gameOverTitle.style.color = "var(--radiant-color)";
    ui.gameOverDesc.innerText = "Лорд Бездны уничтожен силой вашего Духа. Вы прошли игру!";
}
