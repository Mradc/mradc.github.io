import { ui } from './ui.js';
import { gameState } from './state.js';
import { startGame, startNextStage, executePlayerAttack, activateArchon, startEnemyTurn } from './combat.js';
import { toggleShop } from './shop.js';
window.Telegram.WebApp.expand();

// Боевые кнопки
ui.btnMain.addEventListener('click', () => executePlayerAttack(false));
ui.btnBonus.addEventListener('click', () => executePlayerAttack(true));
ui.btnArchon.addEventListener('click', () => activateArchon(false));
ui.btnEnd.addEventListener('click', () => { if (gameState.inCombat) startEnemyTurn(); });

// Кнопки привала (между боями)
ui.btnNextStage.addEventListener('click', () => startNextStage());
ui.btnOpenShop.addEventListener('click', () => toggleShop(true));

// Кнопки магазина
ui.btnCloseShop.addEventListener('click', () => toggleShop(false));

// Главное меню
ui.btnStart.addEventListener('click', startGame);
ui.btnRestart.addEventListener('click', () => { 
    ui.over.classList.add('hidden'); ui.menu.classList.remove('hidden'); 
});
