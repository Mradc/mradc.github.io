import { player } from './state.js';
import { ui, updateUI, log } from './ui.js';

export const shopItems =[
    { 
        id: 'heal', name: 'Зелье лечения', desc: 'Складывается в пояс. Восст. 15 ХП в бою (Бонус. действие).', price: 20, 
        buy: () => { player.inventory.heal++; } 
    },
    { 
        id: 'elixir', name: 'Эликсир духа', desc: 'Складывается в пояс. Восст. 1 ячейку и 1 Огн. удар в бою.', price: 50, 
        buy: () => { player.inventory.elixir++; } 
    },
    { 
        id: 'amulet', name: 'Амулет стойкости', desc: '+5 Максимального ХП (Срабатывает сразу)', price: 150, 
        buy: () => { player.maxHp += 5; player.hp += 5; } 
    },
    { 
        id: 'ring', name: 'Кольцо защиты', desc: '+1 Класс Брони (Срабатывает сразу)', price: 300, 
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
        
        // Лимит: Максимум 3 зелья каждого типа в инвентаре
        let isMaxHeal = item.id === 'heal' && player.inventory.heal >= 3;
        let isMaxElixir = item.id === 'elixir' && player.inventory.elixir >= 3;

        btn.disabled = player.gold < item.price || isMaxHeal || isMaxElixir;
        
        if (isMaxHeal || isMaxElixir) btn.innerText = "Максимум (3)";
        
        btn.addEventListener('click', () => {
            if (player.gold >= item.price) {
                player.gold -= item.price;
                item.buy();
                log(`🛒 Куплено: <b>${item.name}</b> за ${item.price} золота.`, 'system');
                updateUI();
                renderShop(); 
            }
        });
    });
}

export function toggleShop(show) {
    if (show) { renderShop(); ui.shopModal.classList.remove('hidden'); } 
    else { ui.shopModal.classList.add('hidden'); }
}
