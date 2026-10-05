import { player, gameState, goldScale } from './state.js';
import { sfx } from './audio.js';

// Реестр всех предметов экипировки в игре (и обычных, и уникальных из поселений).
// slot: 'gloves' | 'wraps' | 'accessory1' | 'accessory2'
// accessory-предметы можно положить в любой из двух аксессуарных слотов, поэтому
// у них slot: 'accessory'.
// stats: { ac, maxHp, giantCharge, spellSlot } — плюсуются при экипировке.
export const equipmentRegistry = {
    // --- Перчатки (руки, ударная часть безоружного боя) ---
    wrapped_knuckles: { id: 'wrapped_knuckles', slot: 'gloves', name: 'Обмотанные костяшки', desc: '+1 Класс Брони', stats: { ac: 1 } },
    iron_grip_gloves: { id: 'iron_grip_gloves', slot: 'gloves', name: 'Перчатки железной хватки', desc: '+2 Класс Брони', stats: { ac: 2 } },
    ember_fist_gloves: { id: 'ember_fist_gloves', slot: 'gloves', name: 'Перчатки тлеющего кулака', desc: '+1 заряд Огненного удара', stats: { giantCharge: 1 } },
    acid_claw_wraps: { id: 'acid_claw_wraps', slot: 'gloves', name: 'Когти разъедающей кислоты', desc: '+1d4 урона кислотой к каждому удару (игнорирует сопротивление огню)', stats: { bonusDmg: { die: 4, type: 'acid' } } },
    saint_knuckle_wraps: { id: 'saint_knuckle_wraps', slot: 'gloves', name: 'Костяшки святого', desc: '+3 Класс Брони и +1 заряд Огненного удара', stats: { ac: 3, giantCharge: 1 }, unique: true },
    world_ender_gauntlets: { id: 'world_ender_gauntlets', slot: 'gloves', name: 'Перчатки Крушителя Миров', desc: '+1d6 урона кислотой к каждому удару и +1 Класс Брони', stats: { bonusDmg: { die: 6, type: 'acid' }, ac: 1 }, unique: true },

    // --- Повязки (тело/ноги — стойкость и живучесть) ---
    linen_wraps: { id: 'linen_wraps', slot: 'wraps', name: 'Льняные повязки', desc: '+10 Максимального ХП', stats: { maxHp: 10 } },
    monk_sash: { id: 'monk_sash', slot: 'wraps', name: 'Пояс странствующего монаха', desc: '+1 Класс Брони и +8 Макс. ХП', stats: { ac: 1, maxHp: 8 } },
    ashen_grave_cloth: { id: 'ashen_grave_cloth', slot: 'wraps', name: 'Пепельные погребальные ленты', desc: '+1 ячейка заклинаний', stats: { spellSlot: 1 } },
    cinder_wraps: { id: 'cinder_wraps', slot: 'wraps', name: 'Тлеющие обмотки', desc: '+1d4 урона огнём к каждому удару (подчиняется сопротивлению огню)', stats: { bonusDmg: { die: 4, type: 'fire' } } },
    alchemist_belt: { id: 'alchemist_belt', slot: 'wraps', name: 'Пояс алхимика', desc: '+2 к макс. количеству зелий и эликсиров в поясе', stats: { consumableCap: 2 } },
    vessel_binding_wraps: { id: 'vessel_binding_wraps', slot: 'wraps', name: 'Путы истинного Сосуда', desc: '+2 Класс Брони, +20 Макс. ХП', stats: { ac: 2, maxHp: 20 }, unique: true },

    // --- Аксессуары (кольца, серьги, обереги) ---
    copper_earring: { id: 'copper_earring', slot: 'accessory', name: 'Медная серьга', desc: '+5 Максимального ХП', stats: { maxHp: 5 } },
    ember_ring: { id: 'ember_ring', slot: 'accessory', name: 'Тлеющее кольцо', desc: '+1 заряд Огненного удара', stats: { giantCharge: 1 } },
    spirit_bead_necklace: { id: 'spirit_bead_necklace', slot: 'accessory', name: 'Ожерелье духовных бусин', desc: '+1 ячейка заклинаний', stats: { spellSlot: 1 } },
    guardian_signet: { id: 'guardian_signet', slot: 'accessory', name: 'Перстень-печать Хранителя', desc: '+1 Класс Брони', stats: { ac: 1 } },
    vampiric_fang: { id: 'vampiric_fang', slot: 'accessory', name: 'Клык вампира', desc: 'Исцеляет на 10% от нанесённого урона', stats: { lifestealPct: 0.10 } },
    ancient_charm: { id: 'ancient_charm', slot: 'accessory', name: 'Оберег древнего пепла', desc: '+2 Класс Брони и +15 Макс. ХП', stats: { ac: 2, maxHp: 15 }, unique: true },
    archon_heart: { id: 'archon_heart', slot: 'accessory', name: 'Сердце Архонта', desc: 'Исцеляет на 15% от нанесённого урона и +1 заряд Огненного удара', stats: { lifestealPct: 0.15, giantCharge: 1 }, unique: true }
};

// Пулы для случайной выдачи предметов. Обычные встречаются у кузнеца и в
// забытых сундуках; редкие (unique: true) — только у кузнеца.
export const commonPool = [
    'wrapped_knuckles', 'iron_grip_gloves', 'ember_fist_gloves', 'acid_claw_wraps',
    'linen_wraps', 'monk_sash', 'ashen_grave_cloth', 'cinder_wraps', 'alchemist_belt',
    'copper_earring', 'ember_ring', 'spirit_bead_necklace', 'guardian_signet', 'vampiric_fang'
];
export const rarePool = ['saint_knuckle_wraps', 'vessel_binding_wraps', 'ancient_charm', 'world_ender_gauntlets', 'archon_heart'];

// Слот, куда фактически кладётся предмет (аксессуары разрешают выбор пользователем между accessory1/accessory2)
export function resolveTargetSlot(item, preferredSlot) {
    if (item.slot === 'accessory') return preferredSlot === 'accessory2' ? 'accessory2' : 'accessory1';
    return item.slot;
}

// Слот, в который предмет уйдёт по умолчанию, если целевой слот не указан
// явно (используется при экипировке из сумки): для аксессуаров — первый
// свободный, а если оба заняты — первый (тогда там произойдёт замена).
export function autoSlotFor(item) {
    if (item.slot !== 'accessory') return item.slot;
    if (!player.equipment.accessory1) return 'accessory1';
    if (!player.equipment.accessory2) return 'accessory2';
    return 'accessory1';
}

export function slotDisplayName(slot) {
    if (slot === 'gloves') return 'Перчатки';
    if (slot === 'wraps') return 'Повязка';
    return 'Аксессуар';
}

// Вес характеристик предмета — общая часть формулы цены, не зависящая
// от того, где и когда предмет оценивается (у кузнеца или в скупке).
function statWeightOf(itemId) {
    const item = equipmentRegistry[itemId];
    let mult = 0;
    if (item.stats.ac) mult += item.stats.ac * 2.2;
    if (item.stats.maxHp) mult += item.stats.maxHp * 0.35;
    if (item.stats.giantCharge) mult += item.stats.giantCharge * 3;
    if (item.stats.spellSlot) mult += item.stats.spellSlot * 3.5;
    if (item.stats.bonusDmg) mult += (item.stats.bonusDmg.die / 2 + 0.5) * 1.8;
    if (item.stats.consumableCap) mult += item.stats.consumableCap * 1.0;
    if (item.stats.lifestealPct) mult += item.stats.lifestealPct * 100 * 1.2;
    if (item.unique) mult *= 1.4;
    return mult;
}

// Цена у кузнеца — масштабируется золотой кривой ТЕКУЩЕГО этажа: чем
// дальше зашла игра, тем дороже там новое снаряжение (как и всё
// остальное в лавке).
export function priceOf(itemId) {
    const g = goldScale(gameState.stage);
    return Math.max(20, Math.floor(g * statWeightOf(itemId)));
}

// Цена скупки (продажа уже полученного или купленного снаряжения) — НЕ
// зависит от текущего этажа. Она берётся от фиксированной базовой
// единицы (курс 1-го этажа), поэтому одна и та же вещь стоит в скупке
// одинаково, найдена она на 2-м этаже или продана на 14-м: иначе
// достаточно было бы просто долго таскать лишнюю вещь с собой, чтобы
// она сама подорожала.
const SELL_BASE_UNIT = goldScale(1);
export function sellPriceOf(itemId) {
    return Math.max(20, Math.floor(SELL_BASE_UNIT * statWeightOf(itemId)));
}

function statsOf(itemId) {
    const item = equipmentRegistry[itemId];
    return item ? item.stats : {};
}

// Пересчитывает AC/заряды/ячейки-бонусы от текущей экипировки.
// HP-бонусы экипировки НЕ входят сюда — они применяются напрямую к maxHp/hp
// в момент экипировки/снятия (см. equipItem/unequipItem), как и левелап.
export function recomputeNonHpEquipStats() {
    let ac = 0, giantCharge = 0, spellSlot = 0, consumableCap = 0, lifestealPct = 0;
    const bonusDamages =[];
    Object.values(player.equipment).forEach(itemId => {
        if (!itemId) return;
        const item = equipmentRegistry[itemId];
        const s = statsOf(itemId);
        ac += s.ac || 0; giantCharge += s.giantCharge || 0; spellSlot += s.spellSlot || 0;
        consumableCap += s.consumableCap || 0; lifestealPct += s.lifestealPct || 0;
        if (s.bonusDmg) bonusDamages.push({ die: s.bonusDmg.die, type: s.bonusDmg.type, name: item.name });
    });
    player.equipAcBonus = ac; player.equipGiantChargeBonus = giantCharge; player.equipSpellSlotBonus = spellSlot;
    player.equipConsumableCapBonus = consumableCap; player.equipLifestealPct = lifestealPct; player.equipBonusDamages = bonusDamages;
    // Ресурсы не должны превышать новый максимум
    if (player.currentGiantStrikeCharges > player.maxGiantStrikeCharges) player.currentGiantStrikeCharges = player.maxGiantStrikeCharges;
    if (player.spellSlots > player.maxSpellSlots) player.spellSlots = player.maxSpellSlots;
    if (player.inventory.heal > player.maxConsumables) player.inventory.heal = player.maxConsumables;
    if (player.inventory.elixir > player.maxConsumables) player.inventory.elixir = player.maxConsumables;
}

// Надевает предмет в указанный слот, автоматически снимая то, что там было.
// Единая точка входа для любой экипировки в игре (покупка у кузнеца,
// надевание из сумки) — поэтому звук щёлкает здесь один раз на все случаи.
export function equipItem(itemId, targetSlot) {
    const item = equipmentRegistry[itemId];
    if (!item) return;

    // Снимаем то, что уже было в этом слоте (возвращаем его HP-бонус)
    const currentInSlot = player.equipment[targetSlot];
    if (currentInSlot) {
        const oldStats = statsOf(currentInSlot);
        if (oldStats.maxHp) { player.maxHp -= oldStats.maxHp; player.hp = Math.min(player.hp, player.maxHp); }
    }

    player.equipment[targetSlot] = itemId;
    const stats = item.stats;
    if (stats.maxHp) { player.maxHp += stats.maxHp; player.hp += stats.maxHp; }

    recomputeNonHpEquipStats();
    sfx.equip();
}

// Снимает предмет из слота и кладёт его в сумку — он не пропадает и его
// можно надеть обратно позже (см. equipFromBag) или продать в лавке.
export function unequipItem(targetSlot) {
    const currentInSlot = player.equipment[targetSlot];
    if (!currentInSlot) return;
    const oldStats = statsOf(currentInSlot);
    if (oldStats.maxHp) { player.maxHp -= oldStats.maxHp; player.hp = Math.min(player.hp, player.maxHp); }
    player.equipment[targetSlot] = null;
    player.equipmentBag.push(currentInSlot);
    recomputeNonHpEquipStats();
    sfx.unequip();
}

// Надевает предмет и отправляет то, что было в этом слоте (если было),
// в сумку — используется и при покупке у кузнеца, и при экипировке
// предмета из сумки. Возвращает { slot, replaced } — id вытесненного
// предмета (или null), чтобы вызывающий код мог сообщить об этом игроку.
export function equipAndStash(itemId, targetSlot) {
    const item = equipmentRegistry[itemId];
    if (!item) return { slot: targetSlot, replaced: null };
    const resolvedSlot = targetSlot || autoSlotFor(item);
    const currentInSlot = player.equipment[resolvedSlot];
    equipItem(itemId, resolvedSlot);
    if (currentInSlot) player.equipmentBag.push(currentInSlot);
    return { slot: resolvedSlot, replaced: currentInSlot || null };
}

// Достаёт предмет из сумки и надевает его (с тем же вытеснением в сумку).
// Возвращает null, если такого предмета в сумке нет.
export function equipFromBag(itemId, targetSlot) {
    const idx = player.equipmentBag.indexOf(itemId);
    if (idx === -1) return null;
    player.equipmentBag.splice(idx, 1);
    return equipAndStash(itemId, targetSlot);
}

// Убирает один экземпляр предмета из сумки (используется при продаже).
// Возвращает true, если предмет действительно был в сумке.
export function removeFromBag(itemId) {
    const idx = player.equipmentBag.indexOf(itemId);
    if (idx === -1) return false;
    player.equipmentBag.splice(idx, 1);
    return true;
}

export const slotLabels = { gloves: '🥊 Перчатки', wraps: '🧣 Повязка', accessory1: '💍 Аксессуар I', accessory2: '📿 Аксессуар II' };
