import { ui, toggleSpellbook, updateUI, renderNewEnemy } from './ui.js';
import { gameState } from './state.js';
import { startGame, executePlayerAttack, activateArchon, startEnemyTurn, usePotion, castSpell } from './combat.js';
import { toggleShop } from './shop.js';
import { initAudio } from './audio.js';
import { getStats, loadGame } from './storage.js';
import { renderPaths } from './map.js';

function initMenu() {
    const stats = getStats();
    document.getElementById('stat-runs').innerText = stats.runs;
    document.getElementById('stat-wins').innerText = stats.wins;
    document.getElementById('stat-stage').innerText = stats.maxStage;
    
    if (localStorage.getItem('vessel_save')) {
        document.getElementById('btn-continue').classList.remove('hidden');
    } else {
        document.getElementById('btn-continue').classList.add('hidden');
    }
}
initMenu();

// Кнопка ПРОДОЛЖИТЬ
document.getElementById('btn-continue').addEventListener('click', () => {
    initAudio();
    if (loadGame()) {
        ui.menu.classList.add('hidden'); 
        ui.game.classList.remove('hidden'); 
        gameState.inCombat = false; 
        
        renderNewEnemy();   // Отрисовывает мертвого врага спасенного из localStorage
        updateUI();         // Обновляет ХП/Ману и кнопки Привала
        renderPaths(false); // Загружает старые сгенерированные кнопки путей
    }
});

ui.btnStart.addEventListener('click', () => { initAudio(); startGame(); });
ui.btnRestart.addEventListener('click', () => { ui.over.classList.add('hidden'); ui.menu.classList.remove('hidden'); initMenu(); });

ui.btnMain.addEventListener('click', () => executePlayerAttack(false));
ui.btnBonus.addEventListener('click', () => executePlayerAttack(true));
ui.btnArchon.addEventListener('click', () => activateArchon(false));
ui.btnEnd.addEventListener('click', () => { if (gameState.inCombat) startEnemyTurn(); });

ui.btnMagic.addEventListener('click', () => toggleSpellbook(true, castSpell));
ui.btnCloseSpellbook.addEventListener('click', () => toggleSpellbook(false));
ui.btnPotHeal.addEventListener('click', () => usePotion('heal'));
ui.btnPotElixir.addEventListener('click', () => usePotion('elixir'));

ui.btnOpenShop.addEventListener('click', () => toggleShop(true));
ui.btnCloseShop.addEventListener('click', () => toggleShop(false));
