import { player } from './state.js';
import { ui, updateUI, log } from './ui.js';

export const shopItems =[
    { 
        id: 'heal', name: 'Зелье лечения', desc: 'Восстанавливает 15 ХП', price: 20, 
        buy: () => { player.hp = Math.min(player.maxHp, player.hp + 15); } 
    },
    { 
        id: 'elixir', name: 'Эликсир духа', desc: 'Восст. 1 ячейку и 1 заряд Огн. удара', price: 50, 
        buy: () => { 
            player.spellSlots = Math.min(player.maxSpellSlots, player.spellSlots + 1); 
            player.currentGiantStrikeCharges = Math.min(player.maxGiantStrikeCharges, player.currentGiantStrikeCharges + 1); 
        } 
    },
    { 
        id: 'amulet', name: 'Амулет стойкости', desc: '+5 Максимального ХП', price: 150, 
        buy: () => { player.maxHp += 5; player.hp += 5; } 
    },
    { 
        id: 'ring', name: 'Кольцо защиты', desc: '+1 Класс Брони (AC)', price: 300, 
        buy: () => { player.bonusAc += 1; } 
    }
];

export function renderShop() {
    ui.shopGold.innerText = `💰 ${player.gold}`;
    ui.shopList.innerHTML = '';
    
    shopItems.forEach(item => {
        const el = document.createElement('div');
        el.className = 'shop-item';
        el.innerHTML = `
            <div class="shop-item-info">
                <span class="shop-item-name">${item.name}</span>
                <span class="shop-item-desc">${item.desc}</span>
            </div>
            <button class="btn-buy" id="buy-${item.id}">💰 ${item.price}</button>
        `;
        ui.shopList.appendChild(el);

        const btn = el.querySelector(`#buy-${item.id}`);
        // Проверка: скрываем зелья и эликсиры, если у нас и так максимум ресурсов
        let isMaxHp = item.id === 'heal' && player.hp >= player.maxHp;
        let isMaxRes = item.id === 'elixir' && player.spellSlots >= player.maxSpellSlots && player.currentGiantStrikeCharges >= player.maxGiantStrikeCharges;

        btn.disabled = player.gold < item.price || isMaxHp || isMaxRes;
        
        btn.addEventListener('click', () => {
            if (player.gold >= item.price) {
                player.gold -= item.price;
                item.buy();
                log(`🛒 Куплено: <b>${item.name}</b> за ${item.price} золота.`, 'system');
                updateUI();
                renderShop(); // Обновляем цены/доступность кнопок
            }
        });
    });
}

export function toggleShop(show) {
    if (show) {
        renderShop();
        ui.shopModal.classList.remove('hidden');
    } else {
        ui.shopModal.classList.add('hidden');
    }
}