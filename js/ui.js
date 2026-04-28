import { player, enemyState, gameState, subclassData } from './state.js';
import { xpThresholds } from './utils.js';

export const ui = {
    menu: document.getElementById('menu-screen'), game: document.getElementById('game-screen'), over: document.getElementById('game-over-screen'), log: document.getElementById('combat-log'),
    btnMain: document.getElementById('btn-attack-main'), btnBonus: document.getElementById('btn-attack-bonus'), btnEnd: document.getElementById('btn-end-turn'), btnArchon: document.getElementById('btn-archon'),
    btnStart: document.getElementById('btn-start'), btnRestart: document.getElementById('btn-restart'),
    fireToggle: document.getElementById('fire-toggle'), giantStrikeText: document.getElementById('giant-strike-text'),
    reactionBox: document.getElementById('reaction-box'), reactionToggle: document.getElementById('reaction-toggle'), reactionText: document.getElementById('reaction-text'), reactionName: document.getElementById('reaction-name'),
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
    
    eventModal: document.getElementById('event-modal'), eventTitle: document.getElementById('event-title'), eventDesc: document.getElementById('event-desc'), 
    eventActions: document.getElementById('event-actions'), eventResult: document.getElementById('event-result'), btnCloseEvent: document.getElementById('btn-close-event'),
    
    subclassSelect: document.getElementById('subclass-select'), subclassDesc: document.getElementById('subclass-desc')
};

// Динамическое обновление описания класса в меню
export function updateMenuSubclass() {
    const sub = ui.subclassSelect.value;
    const data = subclassData[sub];
    ui.subclassDesc.innerHTML = data.desc;
    document.documentElement.style.setProperty('--sub-color', data.color);
}
ui.subclassSelect.addEventListener('change', updateMenuSubclass);

const traitNames = { 'nimble': 'Вёрткий', 'undead_fortitude': 'Стойкость нежити', 'lifesteal': 'Вампиризм', 'regeneration': 'Регенерация', 'fire_resistance': 'Сопр. Огню', 'fire_immunity': 'Иммунитет к Огню', 'acid_immunity': 'Иммунитет к Кислоте', 'radiant_resistance': 'Сопр. Свету', 'radiant_weakness': 'Уязвимость к Свету', 'reckless': 'Безрассудный' };

export function log(msg, type = 'system') {
    const el = document.createElement('div'); el.className = `log-entry ${type}`; el.innerHTML = msg;
    ui.log.appendChild(el); setTimeout(() => { ui.log.scrollTop = ui.log.scrollHeight; }, 10);
}

export function renderNewEnemy() {
    if(!enemyState.current) return;
    ui.enemyAvatar.src = enemyState.current.avatar; ui.enemyName.innerText = enemyState.current.name; ui.enemyAc.innerText = enemyState.current.ac;
    ui.enemyTraits.innerText = enemyState.current.traits.length > 0 ? enemyState.current.traits.map(t => traitNames[t]).join(' • ') : "";
}

// Заклинания теперь зависят от выбранного класса!
export function getAvailableSpells() {
    if (player.subclass === 'cataclysm') {
        return[
            { id: 'create_bonfire', name: 'Сотворение костра', type: 'Заговор', reqLevel: 2, costSlot: 0, desc: (p) => `Спасбросок. Урон: ${p.level >= 5 ? '2d8' : '1d8'} огн.` },
            { id: 'thunderwave', name: 'Громовая волна', type: 'Магия (1 д.)', reqLevel: 3, costSlot: 1, desc: (p) => `Спасбросок. Урон: ${p.slotLevel + 1}d8 грома.` },
            { id: 'fireball', name: 'Огненный шар', type: 'Магия (1 д.)', reqLevel: 9, costSlot: 1, desc: (p) => `Спасбросок. Урон: 8d6 огн.` }
        ];
    } else if (player.subclass === 'formless') {
        return[
            { id: 'acid_splash', name: 'Брызги кислоты', type: 'Заговор', reqLevel: 2, costSlot: 0, desc: (p) => `Спасбросок. Урон: ${p.level >= 5 ? '2d6' : '1d6'} кисл.` },
            { id: 'caustic_brew', name: 'Едкое варево', type: 'Магия (1 д.)', reqLevel: 3, costSlot: 1, desc: (p) => `Спасбросок. Урон: ${p.slotLevel + 2}d4 кисл.` },
            { id: 'vitriolic_sphere', name: 'Взрыв слизи', type: 'Магия (1 д.)', reqLevel: 9, costSlot: 1, desc: (p) => `Спасбросок. Урон: 8d4 кисл.` }
        ];
    } else if (player.subclass === 'fallen') {
        return[
            { id: 'sacred_flame', name: 'Священное пламя', type: 'Заговор', reqLevel: 2, costSlot: 0, desc: (p) => `Спасбросок. Урон: ${p.level >= 5 ? '2d8' : '1d8'} свет.` },
            { id: 'guiding_bolt', name: 'Направляющий луч', type: 'Магия (1 д.)', reqLevel: 3, costSlot: 1, desc: (p) => `Атака. Урон: ${p.slotLevel + 3}d6 свет.` },
            { id: 'flame_strike', name: 'Удар небес', type: 'Магия (1 д.)', reqLevel: 9, costSlot: 1, desc: (p) => `Спасбросок. Урон: 6d6 свет.` }
        ];
    }
}

export function toggleSpellbook(show, castCallback) {
    if (show) {
        ui.spellbookSlots.innerText = `Ячейки: ${player.spellSlots}/${player.maxSpellSlots}`;
        ui.spellList.innerHTML = '';
        getAvailableSpells().forEach(spell => {
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
        
        ui.giantStrikeText.innerText = `Стих. Удар (${player.currentGiantStrikeCharges}/${player.maxGiantStrikeCharges})`;
        ui.fireToggle.disabled = !canAct || player.fireStrikeUsedThisTurn || player.currentGiantStrikeCharges <= 0;
        
        ui.btnPotHeal.innerText = `❤️ Зелье (${player.inventory.heal})`;
        ui.btnPotHeal.disabled = !canAct || player.bonusActions === 0 || player.inventory.heal === 0 || player.hp >= player.maxHp;

        if (player.level >= 2) {
            ui.btnMagic.classList.remove('hidden'); ui.btnMain.style.gridColumn = "span 1";
            ui.btnMagic.disabled = !canAct || player.actions === 0;

            ui.btnPotElixir.classList.remove('hidden'); ui.btnPotElixir.innerText = `💧 Эликсир (${player.inventory.elixir})`;
            let isMaxRes = player.spellSlots >= player.maxSpellSlots && player.currentGiantStrikeCharges >= player.maxGiantStrikeCharges;
            ui.btnPotElixir.disabled = !canAct || player.bonusActions === 0 || player.inventory.elixir === 0 || isMaxRes;

            ui.reactionBox.classList.remove('hidden'); 
            ui.reactionText.innerText = `(${player.spellSlots}/${player.maxSpellSlots})`;
            ui.reactionName.innerText = subclassData[player.subclass].reaction;
            ui.reactionToggle.disabled = !gameState.inCombat || player.spellSlots <= 0;
        } else {
            ui.btnMagic.classList.add('hidden'); ui.btnMain.style.gridColumn = "span 2";
            ui.btnPotElixir.classList.add('hidden'); ui.reactionBox.classList.add('hidden');
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
