import { player } from './state.js';
import { ui, updateUI, log } from './ui.js';
import { equipmentRegistry, unequipItem, equipFromBag, slotLabels, slotDisplayName } from './equipment.js';
import { saveGame } from './storage.js';

const slotOrder =['gloves', 'wraps', 'accessory1', 'accessory2'];

export function renderInventory() {
    ui.inventoryGold.innerText = `💰 ${player.gold}`;
    ui.inventoryEquipment.innerHTML = '';

    slotOrder.forEach(slotKey => {
        const itemId = player.equipment[slotKey];
        const item = itemId ? equipmentRegistry[itemId] : null;

        const el = document.createElement('div');
        el.className = 'shop-item';
        el.innerHTML = `
            <div class="shop-item-info">
                <span class="shop-item-name">${slotLabels[slotKey]}</span>
                <span class="shop-item-desc">${item ? `${item.name} — ${item.desc}` : 'Пустой слот'}</span>
            </div>
            ${item ? `<button class="btn-buy" id="unequip-${slotKey}" style="border-color:#e53935; color:#e53935;">Снять</button>` : ''}
        `;
        ui.inventoryEquipment.appendChild(el);

        if (item) {
            el.querySelector(`#unequip-${slotKey}`).addEventListener('click', () => {
                unequipItem(slotKey);
                log(`🎒 Вы снимаете <b>${item.name}</b> и убираете в сумку.`, 'system');
                updateUI(); saveGame(); renderInventory();
            });
        }
    });

    ui.inventoryConsumables.innerHTML = '';
    const consumables =[
        { name: `❤️ ${player.healPotionInfo.name}`, count: player.inventory.heal },
        { name: '💧 Эликсир духа', count: player.inventory.elixir }
    ];
    consumables.forEach(c => {
        const el = document.createElement('div');
        el.className = 'shop-item';
        el.innerHTML = `<div class="shop-item-info"><span class="shop-item-name">${c.name}</span></div><span style="color:#ffd700; font-weight:bold;">${c.count} / ${player.maxConsumables}</span>`;
        ui.inventoryConsumables.appendChild(el);
    });

    renderBag();
}

// Сумка снаряжения — предметы, найденные в сундуках или снятые со слотов,
// но пока не надетые. Экипировка отсюда сразу вытесняет прежний предмет
// того же слота обратно в сумку (см. equipFromBag в equipment.js).
function renderBag() {
    ui.inventoryBagSection.classList.toggle('hidden', player.equipmentBag.length === 0);
    ui.inventoryBag.innerHTML = '';
    if (player.equipmentBag.length === 0) return;

    const counts = {};
    player.equipmentBag.forEach(id => { counts[id] = (counts[id] || 0) + 1; });

    Object.keys(counts).forEach(itemId => {
        const item = equipmentRegistry[itemId];
        const count = counts[itemId];

        const el = document.createElement('div');
        el.className = 'shop-item';
        const btnsHtml = item.slot === 'accessory'
            ? `<div style="display:flex; gap:6px;">
                   <button class="btn-buy" id="eq-${itemId}-1" style="border-color:#64b5f6; color:#64b5f6; font-size:11px;">→ Аксесс. I</button>
                   <button class="btn-buy" id="eq-${itemId}-2" style="border-color:#64b5f6; color:#64b5f6; font-size:11px;">→ Аксесс. II</button>
               </div>`
            : `<button class="btn-buy" id="eq-${itemId}" style="border-color:#64b5f6; color:#64b5f6;">Экипировать</button>`;

        el.innerHTML = `
            <div class="shop-item-info">
                <span class="shop-item-name">${item.name}${count > 1 ? ` <span style="color:#888; font-size:11px;">×${count}</span>` : ''} <span style="font-size:10px; color:#888;">(${slotDisplayName(item.slot)})</span></span>
                <span class="shop-item-desc">${item.desc}</span>
            </div>
            ${btnsHtml}
        `;
        ui.inventoryBag.appendChild(el);

        const doEquip = (targetSlot) => {
            const result = equipFromBag(itemId, targetSlot);
            if (!result) return;
            let msg = `🎒 Вы надеваете <b>${item.name}</b> из сумки.`;
            if (result.replaced) msg += ` Прежнее снаряжение (<b>${equipmentRegistry[result.replaced].name}</b>) отправилось в сумку.`;
            log(msg, 'system');
            updateUI(); saveGame(); renderInventory();
        };

        if (item.slot === 'accessory') {
            el.querySelector(`#eq-${itemId}-1`).addEventListener('click', () => doEquip('accessory1'));
            el.querySelector(`#eq-${itemId}-2`).addEventListener('click', () => doEquip('accessory2'));
        } else {
            el.querySelector(`#eq-${itemId}`).addEventListener('click', () => doEquip(item.slot));
        }
    });
}

export function toggleInventory(show) {
    if (show) { renderInventory(); ui.inventoryModal.classList.remove('hidden'); }
    else { ui.inventoryModal.classList.add('hidden'); }
}
