import { ui, toggleSpellbook } from './ui.js';
import { gameState } from './state.js';
import { startGame, startNextStage, executePlayerAttack, activateArchon, startEnemyTurn, usePotion, castSpell } from './combat.js';
import { toggleShop } from './shop.js';

ui.btnMain.addEventListener('click', () => executePlayerAttack(false));
ui.btnBonus.addEventListener('click', () => executePlayerAttack(true));
ui.btnArchon.addEventListener('click', () => activateArchon(false));
ui.btnEnd.addEventListener('click', () => { if (gameState.inCombat) startEnemyTurn(); });

// Кнопка Магии
ui.btnMagic.addEventListener('click', () => toggleSpellbook(true, castSpell));
ui.btnCloseSpellbook.addEventListener('click', () => toggleSpellbook(false));

ui.btnPotHeal.addEventListener('click', () => usePotion('heal'));
ui.btnPotElixir.addEventListener('click', () => usePotion('elixir'));

ui.btnNextStage.addEventListener('click', () => startNextStage());
ui.btnOpenShop.addEventListener('click', () => toggleShop(true));
ui.btnCloseShop.addEventListener('click', () => toggleShop(false));

ui.btnStart.addEventListener('click', startGame);
ui.btnRestart.addEventListener('click', () => { 
    ui.over.classList.add('hidden'); ui.menu.classList.remove('hidden'); 
});
