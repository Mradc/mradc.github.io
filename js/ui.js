import { player, enemyState, gameState } from './state.js';
import { xpThresholds } from './utils.js';
import { sfx } from './audio.js';

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
    btnOpenShop: document.getElementById('btn-open-shop'), pathChoices: document.getElementById('path-choices'),
    shopModal: document.getElementById('shop-modal'), btnCloseShop: document.getElementById('btn-close-shop'), shopList: document.getElementById('shop-list'), shopGold: document.getElementById('shop-gold'),

    btnPotHeal: document.getElementById('btn-pot-heal'), btnPotElixir: document.getElementById('btn-pot-elixir'),
    btnMagic: document.getElementById('btn-magic'), spellbookModal: document.getElementById('spellbook-modal'),
    btnCloseSpellbook: document.getElementById('btn-close-spellbook'), spellList: document.getElementById('spell-list'), spellbookSlots: document.getElementById('spellbook-slots'),
    
    // Новые элементы для Модалки Событий
    eventModal: document.getElementById('event-modal'), eventTitle: document.getElementById('event-title'), eventDesc: document.getElementById('event-desc'), 
    eventActions: document.getElementById('event-actions'), eventResult: document.getElementById('event-result'), btnCloseEvent: document.getElementById('btn-close-event')
};

const traitNames = { 'nimble': 'Вёрткий', 'undead_fortitude': 'Стойкость нежити', 'lifesteal': 'Вампиризм', 'regeneration': 'Регенерация', 'fire_resistance': 'Сопротивление огню', 'fire_immunity': 'Иммунитет к огню', 'reckless': 'Безрассудный' };

export function log(msg, type = 'system') {
    const el = document.createElement('div'); el.className = `log-entry ${type}`; el.innerHTML = msg;
    ui.log.appendChild(el); setTimeout(() => { ui.log.scrollTop = ui.log.scrollHeight; }, 10);
}

export function spawnFloatingText(targetAvatar, text, color) {
    if (!targetAvatar) return;
    const rect = targetAvatar.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.innerText = text;
    el.style.color = color;
    
    const offsetX = (Math.random() - 0.5) * 30; // Легкий разброс влево-вправо
    el.style.left = (rect.left + rect.width / 2 + offsetX) + 'px';
    el.style.top = (rect.top + rect.height / 2) + 'px';
    
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

export function triggerFlash(targetAvatar) {
    if (!targetAvatar) return;
    targetAvatar.classList.add('flash-red');
    setTimeout(() => targetAvatar.classList.remove('flash-red'), 300);
}

export function triggerShake() {
    ui.game.classList.add('shake');
    setTimeout(() => ui.game.classList.remove('shake'), 400);
}

export function renderNewEnemy() {
    if(!enemyState.current) return;
    ui.enemyAvatar.src = enemyState.current.avatar; ui.enemyName.innerText = enemyState.current.name; ui.enemyAc.innerText = enemyState.current.ac;
    ui.enemyTraits.innerText = enemyState.current.traits.length > 0 ? enemyState.current.traits.map(t => traitNames[t]).join(' • ') : "";
}

export const availableSpells =[
    { 
        id: 'create_bonfire', name: 'Сотворение костра', type: 'Заговор', reqLevel: 2, costSlot: 0, 
        desc: (p) => `Спасбросок (Сл ${p.spellSaveDc}). Урон: ${p.level >= 5 ? '2d8' : '1d8'} огн.` 
    },
    { 
        id: 'thunderwave', name: 'Громовая волна', type: 'Магия (1 д.)', reqLevel: 3, costSlot: 1, 
        desc: (p) => `Спасбросок (Сл ${p.spellSaveDc}). Урон: ${p.slotLevel + 1}d8 грома.` 
    },
    { 
        id: 'fireball', name: 'Огненный шар', type: 'Магия (1 д.)', reqLevel: 9, costSlot: 1, 
        desc: (p) => `Спасбросок (Сл ${p.spellSaveDc}). Урон: 8d6 огн.` 
    }
];

export function toggleSpellbook(show, castCallback) {
    if (show) {
        ui.spellbookSlots.innerText = `Ячейки: ${player.spellSlots}/${player.maxSpellSlots}`;
        ui.spellList.innerHTML = '';
        availableSpells.forEach(spell => {
            if (player.level < spell.reqLevel) return;
            const el = document.createElement('div'); el.className = 'shop-item';
            el.innerHTML = `<div class="shop-item-info"><span class="shop-item-name" style="color: #ba68c8;">${spell.name} <span style="font-size:10px; color:#aaa;">(${spell.type})</span></span><span class="shop-item-desc">${spell.desc(player)}</span></div>
            <button class="btn-buy" id="cast-${spell.id}" style="border-color: #ba68c8; color: #ba68c8;">${spell.costSlot > 0 ? '-1 Ячейка' : 'Каст'}</button>`;
            ui.spellList.appendChild(el);
            const btn = el.querySelector(`#cast-${spell.id}`);
            btn.disabled = (spell.costSlot > 0 && player.spellSlots < spell.costSlot) || player.actions === 0;
            btn.addEventListener('click', () => { ui.spellbookModal.classList.add('hidden'); castCallback(spell); });
        });
        ui.spellbookModal.classList.remove('hidden');
    } else { ui.spellbookModal.classList.add('hidden'); }
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
        
        ui.btnPotHeal.innerText = `❤️ Зелье (${player.inventory.heal})`;
        ui.btnPotHeal.disabled = !canAct || player.bonusActions === 0 || player.inventory.heal === 0 || player.hp >= player.maxHp;

        // Появление Магии и Возмездия
        if (player.level >= 2) {
            ui.btnMagic.classList.remove('hidden'); ui.btnMain.style.gridColumn = "span 1";
            ui.btnMagic.disabled = !canAct || player.actions === 0;

            ui.btnPotElixir.classList.remove('hidden'); ui.btnPotElixir.innerText = `💧 Эликсир (${player.inventory.elixir})`;
            let isMaxRes = player.spellSlots >= player.maxSpellSlots && player.currentGiantStrikeCharges >= player.maxGiantStrikeCharges;
            ui.btnPotElixir.disabled = !canAct || player.bonusActions === 0 || player.inventory.elixir === 0 || isMaxRes;

            ui.rebukeBox.classList.remove('hidden'); ui.rebukeText.innerText = `(${player.spellSlots}/${player.maxSpellSlots})`;
            ui.rebukeToggle.disabled = !gameState.inCombat || player.spellSlots <= 0;
        } else {
            ui.btnMagic.classList.add('hidden'); ui.btnMain.style.gridColumn = "span 2";
            ui.btnPotElixir.classList.add('hidden'); ui.rebukeBox.classList.add('hidden');
        }

        if (player.level >= 3) {
            ui.btnArchon.classList.remove('hidden');
            if (player.archonActive) { ui.btnArchon.disabled = true; ui.btnArchon.innerText = "Архонт Активен"; } 
            else if (player.level >= 7) { ui.btnArchon.disabled = true; ui.btnArchon.innerText = "Авто-Архонт"; } 
            else { ui.btnArchon.disabled = !canAct || player.bonusActions === 0; ui.btnArchon.innerText = "Форма Архонта"; }
        } else { ui.btnArchon.classList.add('hidden'); }

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
