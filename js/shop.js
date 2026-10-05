import { player } from './state.js';
import { ui, updateUI, log, showConfirm } from './ui.js';
import { sfx } from './audio.js';
import { saveGame } from './storage.js';
import { healPotionTiers } from './utils.js';
import { equipmentRegistry, sellPriceOf, removeFromBag, slotDisplayName } from './equipment.js';

// Скупка платит долю от фиксированной цены предмета (см. sellPriceOf в
// equipment.js) — она НЕ растёт с этажом, в отличие от цены у кузнеца,
// иначе продажа была бы выгоднее покупки и росла бы просто от того,
// что вещь долго лежит в сумке.
const BUYBACK_FACTOR = 0.4;

// Зелье лечения и его улучшение считаются динамически (зависят от player.healTier),
// поэтому список товаров строится функцией getShopItems(), а не статическим массивом.
function getShopItems() {
    const tier = healPotionTiers[player.healTier];
    const nextTier = healPotionTiers[player.healTier + 1];

    const items =[
        {
            id: 'heal', name: tier.name,
            desc: `Складывается в пояс. Восст. ${tier.diceCount}к${tier.diceSides}+${tier.bonus} ХП в бою (Бонус. действие).`,
            price: tier.price,
            buy: () => { player.inventory.heal++; }
        },
        {
            id: 'elixir', name: 'Эликсир духа', desc: 'Складывается в пояс. Восст. 1 ячейку и 1 Огн. удар в бою.', price: 50,
            buy: () => { player.inventory.elixir++; }
        }
    ];

    if (nextTier) {
        items.push({
            id: 'healUpgrade', name: `Рецепт: ${nextTier.name} (${nextTier.rarity})`,
            desc: `Заменяет ВСЕ зелья лечения в поясе на более сильные: ${nextTier.diceCount}к${nextTier.diceSides}+${nextTier.bonus} ХП. Открывает их для дальнейшей покупки.`,
            price: nextTier.price + 100,
            buy: () => {
                const heldCount = player.inventory.heal;
                player.healTier++;
                player.inventory.heal = heldCount; // старые зелья заменяются на новые того же количества
            }
        });
    }

    return items;
}

export function renderShop() {
    ui.shopGold.innerText = `💰 ${player.gold}`;
    ui.shopList.innerHTML = '';

    const shopItems = getShopItems();

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
        
        // Лимит: Максимум зелий каждого типа зависит от экипировки (пояс алхимика и т.п.)
        let isMaxHeal = item.id === 'heal' && player.inventory.heal >= player.maxConsumables;
        let isMaxElixir = item.id === 'elixir' && player.inventory.elixir >= player.maxConsumables;

        btn.disabled = player.gold < item.price || isMaxHeal || isMaxElixir;
        
        if (isMaxHeal || isMaxElixir) btn.innerText = `Максимум (${player.maxConsumables})`;
        
        btn.addEventListener('click', () => {
            if (player.gold >= item.price) {
                sfx.coin();
                player.gold -= item.price;
                item.buy();
                log(`🛒 Куплено: <b>${item.name}</b> за ${item.price} золота.`, 'system');
                updateUI();
                renderShop();
                saveGame();
            }
        });
    });

    renderBuyback();
}

// Скупка снаряжения: список ненужных предметов из сумки (player.equipmentBag) —
// то, что накопилось от находок в сундуках, покупок у кузнеца не по размеру
// или снятого через инвентарь. Продаём по одному экземпляру за клик.
function renderBuyback() {
    ui.shopBuybackList.innerHTML = '';

    if (!player.equipmentBag.length) {
        ui.shopBuyback.classList.add('hidden');
        return;
    }
    ui.shopBuyback.classList.remove('hidden');

    const counts = {};
    player.equipmentBag.forEach(id => { counts[id] = (counts[id] || 0) + 1; });

    Object.keys(counts).forEach(itemId => {
        const item = equipmentRegistry[itemId];
        const count = counts[itemId];
        const price = Math.max(5, Math.floor(sellPriceOf(itemId) * BUYBACK_FACTOR));

        const el = document.createElement('div');
        el.className = 'shop-item';
        el.innerHTML = `
            <div class="shop-item-info">
                <span class="shop-item-name">${item.name}${count > 1 ? ` <span style="color:#888; font-size:11px;">×${count}</span>` : ''} <span style="font-size:10px; color:#888;">(${slotDisplayName(item.slot)})</span></span>
                <span class="shop-item-desc">${item.desc}</span>
            </div>
            <button class="btn-buy" id="sell-${itemId}" style="border-color:#81c784; color:#81c784;">💰 ${price}</button>
        `;
        ui.shopBuybackList.appendChild(el);

        el.querySelector(`#sell-${itemId}`).addEventListener('click', () => {
            showConfirm(
                '⚠️ Продать снаряжение?',
                `Продать <b>${item.name}</b> торговцу за 💰${price}?<br>` +
                `<span style="color:#aaa; font-size:12px;">Предмет будет утрачен безвозвратно — надеть его снова будет уже нельзя.</span>`,
                () => {
                    if (!removeFromBag(itemId)) return;
                    player.gold += price; sfx.sell();
                    log(`💰 Продано торговцу: <b>${item.name}</b> за ${price} золота.`, 'system');
                    updateUI(); saveGame(); renderShop();
                },
                { yesLabel: 'Продать', noLabel: 'Отмена' }
            );
        });
    });
}

export function toggleShop(show) {
    if (show) { renderShop(); ui.shopModal.classList.remove('hidden'); } 
    else { ui.shopModal.classList.add('hidden'); }
}
