import { player, gameState, stageConfigs, goldScale } from './state.js';
import { ui, updateUI, log } from './ui.js';
import { sfx } from './audio.js';
import { saveGame } from './storage.js';
import { equipmentRegistry, equipAndStash, priceOf, commonPool, rarePool, slotDisplayName } from './equipment.js';
import { grantAspectSlotsIfNeeded } from './aspects.js';

// Награды поселения масштабируются от того же "этажного" бенчмарка, что и
// случайные события — привязаны к xp/gold обычного врага текущего этажа.
function stageBaseline() {
    const cfg = stageConfigs[Math.min(gameState.stage, stageConfigs.length) - 1];
    return { xp: cfg.xp, gold: cfg.gold };
}

// Шанс на "город" (более богатое, дорогое поселение) растёт с этажом:
// этажи 1-3 почти всегда деревня, к финалу — почти всегда город.
function rollSettlementType() {
    const cityChance = Math.min(0.85, 0.1 + gameState.stage * 0.05);
    return Math.random() < cityChance ? 'city' : 'village';
}

const villageNames = ["Ольховка", "Тихий Брод", "Заречье", "Сосновка", "Дубравино"];
const cityNames = ["Каменград", "Златолесье", "Новый Порт", "Вышеград", "Серебряный Хребет"];

function randomName(type) {
    const pool = type === 'city' ? cityNames : villageNames;
    return pool[Math.floor(Math.random() * pool.length)];
}

const tavernQuestsEarly =[
    { text: "Прогнать крыс из погреба", flavor: "Вы разбираетесь с крысами за пару минут." },
    { text: "Наколоть дров хозяину", flavor: "Топор в ваших руках так и мелькает." },
    { text: "Проводить пьяницу до дома", flavor: "Не самое героическое дело, но кто-то должен." },
    { text: "Разнести письма по соседям", flavor: "Вы успеваете обойти всю округу до заката." },
    { text: "Помочь на кухне с наплывом гостей", flavor: "Готовка — тоже своего рода бой." }
];
const tavernQuestsLate =[
    { text: "Отогнать мародёров от обоза", flavor: "Пары ударов хватило, чтобы отбить у них охоту." },
    { text: "Успокоить одержимого духом гостя", flavor: "Ваша связь с Сосудом помогает утихомирить чужую ярость." },
    { text: "Выследить лазутчика в толпе", flavor: "Вы находите шпиона раньше, чем он успевает скрыться." },
    { text: "Разобраться с потасовкой у кузницы", flavor: "Несколько кулаков — и порядок восстановлен." },
    { text: "Сопроводить караван через опасный участок", flavor: "Ни один товар не пропал по пути." }
];
function tavernQuestPool() { return gameState.stage >= 7 ? tavernQuestsLate : tavernQuestsEarly; }

const errandsEarly = [
    "Вы чините забор на окраине.",
    "Вы помогаете фермеру собрать урожай.",
    "Вы отгоняете волков от стада.",
    "Вы латаете крышу старосты.",
    "Вы расчищаете заваленную дорогу."
];
const errandsLate = [
    "Вы усмиряете взбунтовавшуюся стражу.",
    "Вы тушите пожар в амбаре голыми руками, не боясь огня.",
    "Вы разгоняете бандитов, осадивших рынок.",
    "Вы укрепляете защитные руны у ворот.",
    "Вы выносите раненых из-под завала."
];
function errandPool() { return gameState.stage >= 7 ? errandsLate : errandsEarly; }

// commonPool/rarePool/priceOf/slotDisplayName теперь живут в equipment.js —
// их же использует забытый сундук на карте (map.js) для выпадения предметов.

let currentSettlement = null;

function ensureVisitState() {
    if (!gameState.settlementVisit) {
        gameState.settlementVisit = { type: currentSettlement.type, name: currentSettlement.name, restUsed: false, favorUsed: false };
    }
}

export function startSettlement() {
    const type = rollSettlementType();
    currentSettlement = { type, name: randomName(type) };
    gameState.settlementVisit = { type, name: currentSettlement.name, restUsed: false, favorUsed: false };
    renderSettlementMain();
    updateUI();
    ui.settlementModal.classList.remove('hidden');
    saveGame(); // Сохраняем сразу, чтобы закрытие игры внутри поселения не "съедало" этап
}

// Восстанавливает открытое поселение после перезагрузки страницы (Продолжить игру),
// если игрок закрыл клиент, находясь внутри поселения. Без этого gameState.stage
// уже был увеличен при входе, и без модалки игрок оказывался на следующем этапе.
// Ассортимент кузнеца и текст задания таверны хранятся внутри gameState.settlementVisit
// (а не в локальной переменной модуля), поэтому переживают перезагрузку без пересчёта.
export function resumeSettlement() {
    const v = gameState.settlementVisit;
    if (!v || !v.type) return false;
    currentSettlement = { type: v.type, name: v.name };
    renderSettlementMain();
    updateUI();
    ui.settlementModal.classList.remove('hidden');
    return true;
}

function setHeader() {
    const isCity = currentSettlement.type === 'city';
    ui.settlementTitle.innerText = `${isCity ? '🏰' : '🏘️'} ${currentSettlement.name}`;
    ui.settlementGold.innerText = `💰 ${player.gold}`;
}

function renderSettlementMain() {
    ensureVisitState();
    setHeader();
    const isCity = currentSettlement.type === 'city';
    ui.settlementDesc.innerText = isCity
        ? "Оживлённый город раскинулся перед вами — стражи, лавки, гомон рынка."
        : "Скромное поселение у дороги. Пара домов, кузница и приветливая таверна.";
    ui.btnSettlementBack.classList.add('hidden');

    ui.settlementBody.innerHTML = '';
    const options =[
        { icon: '🍺', label: 'Заглянуть в таверну', color: '#e0b34a', action: renderTavern },
        { icon: '⚒️', label: 'Заглянуть к Кузнецу', color: '#64b5f6', action: renderBlacksmith },
        { icon: '🤝', label: 'Помочь поселению', color: '#81c784', action: renderHelp }
    ];
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'btn-action'; btn.style.borderColor = opt.color; btn.style.color = opt.color;
        btn.innerText = `${opt.icon} ${opt.label}`;
        btn.onclick = opt.action;
        ui.settlementBody.appendChild(btn);
    });
}

function showBackButton() {
    ui.btnSettlementBack.classList.remove('hidden');
    ui.btnSettlementBack.onclick = renderSettlementMain;
}

function renderTavern() {
    ensureVisitState();
    setHeader();
    showBackButton();
    ui.settlementDesc.innerText = "Тепло очага и запах эля. Здесь можно перевести дух — а хозяин не откажется от лишней пары рук.";
    ui.settlementBody.innerHTML = '';

    const v = gameState.settlementVisit;

    const restBtn = document.createElement('button');
    restBtn.className = 'btn-action'; restBtn.style.borderColor = '#e0b34a'; restBtn.style.color = '#e0b34a';
    if (v.restUsed) {
        restBtn.innerText = "Вы уже отдыхали здесь"; restBtn.disabled = true;
    } else {
        restBtn.innerText = "🛌 Короткий отдых (Восст. ~50% ХП и 1 ячейку)";
        restBtn.onclick = () => {
            sfx.heal();
            const healAmt = Math.ceil(player.maxHp * 0.5);
            player.hp = Math.min(player.maxHp, player.hp + healAmt);
            if (player.spellSlots < player.maxSpellSlots) player.spellSlots++;
            v.restUsed = true;
            log(`🛌 Вы коротко отдыхаете в таверне <b>${currentSettlement.name}</b>. Восстановлено ${healAmt} ХП${player.maxSpellSlots > 0 ? ' и 1 ячейка заклинаний' : ''}.`, 'system');
            updateUI(); saveGame(); renderTavern();
        };
    }
    ui.settlementBody.appendChild(restBtn);

    const questBtn = document.createElement('button');
    questBtn.className = 'btn-action'; questBtn.style.borderColor = '#81c784'; questBtn.style.color = '#81c784';
    if (v.favorUsed) {
        questBtn.innerText = "Вы уже оказали услугу этому поселению"; questBtn.disabled = true;
    } else {
        if (!v.tavernQuest) {
            const pool = tavernQuestPool();
            const picked = pool[Math.floor(Math.random() * pool.length)];
            v.tavernQuest = {
                text: picked.text, flavor: picked.flavor,
                xp: Math.floor(stageBaseline().xp * 0.5),
                gold: Math.floor(goldScale(gameState.stage) * 1.3)
            };
            saveGame(); // Фиксируем конкретное задание, чтобы оно не перегенерировалось
        }
        const quest = v.tavernQuest;
        questBtn.innerText = `📜 Задание: «${quest.text}» (+${quest.xp} опыта, +${quest.gold} золота)`;
        questBtn.onclick = () => {
            sfx.coin();
            player.xp += quest.xp; player.gold += quest.gold;
            let lvlMsgs = player.checkLevelUp();
            grantAspectSlotsIfNeeded();
            v.favorUsed = true;
            log(`📜 <b>${quest.text}.</b> ${quest.flavor} Получено ${quest.xp} опыта и ${quest.gold} золота.`, 'system');
            if (lvlMsgs.length > 0) { sfx.levelup(); lvlMsgs.forEach(msg => log(msg, 'levelup')); }
            updateUI(); saveGame(); renderTavern();
        };
    }
    ui.settlementBody.appendChild(questBtn);
}

function renderBlacksmith() {
    ensureVisitState();
    setHeader();
    showBackButton();
    ui.settlementDesc.innerText = "Кузница гудит от жара горна. На полках — обвязки и амулеты, а не мечи: здесь знают толк в боевых искусствах Сосуда.";
    ui.settlementBody.innerHTML = '';

    const v = gameState.settlementVisit;
    if (!v.blacksmithOffers) {
        const rareChance = Math.min(0.5, 0.05 + gameState.stage * 0.03);
        const offers =[];
        for (let i = 0; i < 3; i++) {
            const useRare = Math.random() < rareChance;
            const pool = useRare ? rarePool : commonPool;
            const pick = pool[Math.floor(Math.random() * pool.length)];
            if (!offers.includes(pick)) offers.push(pick);
        }
        v.blacksmithOffers = offers;
        saveGame(); // Фиксируем ассортимент, чтобы он не перегенерировался при перезаходе/перезагрузке
    }
    const currentBlacksmithOffers = v.blacksmithOffers;

    if (currentBlacksmithOffers.length === 0) {
        ui.settlementBody.innerHTML = `<p style="color:#aaa; font-size:13px; text-align:center;">Кузнец развёл руками — сегодня товара для вас не осталось.</p>`;
        return;
    }

    currentBlacksmithOffers.forEach(itemId => {
        const item = equipmentRegistry[itemId];
        const price = priceOf(itemId);
        const alreadyOwned = player.ownedUnique[itemId];

        const el = document.createElement('div');
        el.className = 'shop-item';
        el.innerHTML = `
            <div class="shop-item-info">
                <span class="shop-item-name">${item.unique ? `<span style="color:#ffd700; font-size:11px;">⭐ Редкий товар</span><br>` : ''}${item.name} <span style="font-size:10px; color:#888;">(${slotDisplayName(item.slot)})</span></span>
                <span class="shop-item-desc">${item.desc}</span>
            </div>
            <button class="btn-buy" id="buy-${item.id}">${alreadyOwned ? 'Куплено' : `💰 ${price}`}</button>
        `;
        ui.settlementBody.appendChild(el);
        const btn = el.querySelector(`#buy-${item.id}`);
        btn.disabled = alreadyOwned || player.gold < price;
        if (!alreadyOwned) {
            btn.addEventListener('click', () => {
                if (player.gold < price) return;
                // У перчаток и повязки только один возможный слот — надеваем
                // сразу, без лишнего экрана подтверждения. У аксессуаров слотов
                // два, и это настоящий выбор, поэтому его оставляем.
                if (item.slot === 'accessory') openEquipPicker(item, price);
                else buyAndEquip(item, price, item.slot);
            });
        }
    });
}

// Покупка и немедленная экипировка. Если целевой слот уже занят, прежний
// предмет не теряется — отправляется в сумку снаряжения (см. equipment.js).
function buyAndEquip(item, price, slotKey) {
    sfx.coin();
    player.gold -= price;
    const result = equipAndStash(item.id, slotKey);
    if (item.unique) player.ownedUnique[item.id] = true;
    let msg = `⚒️ Куплено и экипировано у кузнеца: <b>${item.name}</b> за ${price} золота.`;
    if (result.replaced) msg += ` Прежнее снаряжение (<b>${equipmentRegistry[result.replaced].name}</b>) отправилось в сумку.`;
    log(msg, 'system');
    updateUI(); saveGame(); renderBlacksmith();
}

function openEquipPicker(item, price) {
    ui.settlementBody.innerHTML = '';
    const info = document.createElement('p');
    info.style.cssText = 'font-size:13px; color:#ccc; margin-bottom:10px;';
    info.innerHTML = `Купить <b>${item.name}</b> за 💰${price}?<br><span style="color:#888; font-size:12px;">${item.desc}</span>`;
    ui.settlementBody.appendChild(info);

    const slotsToOffer = item.slot === 'accessory' ? ['accessory1', 'accessory2'] :[item.slot];
    slotsToOffer.forEach(slotKey => {
        const occupied = player.equipment[slotKey];
        const occupiedName = occupied ? equipmentRegistry[occupied].name : 'пусто';
        const label = slotKey === 'accessory1' ? 'Аксессуар I' : (slotKey === 'accessory2' ? 'Аксессуар II' : slotDisplayName(slotKey));
        const btn = document.createElement('button');
        btn.className = 'btn-action'; btn.style.borderColor = '#64b5f6'; btn.style.color = '#64b5f6';
        btn.innerText = `Надеть в: ${label} (сейчас: ${occupiedName})`;
        btn.onclick = () => buyAndEquip(item, price, slotKey);
        ui.settlementBody.appendChild(btn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-action'; cancelBtn.style.borderColor = '#888'; cancelBtn.style.color = '#888';
    cancelBtn.innerText = 'Отмена';
    cancelBtn.onclick = renderBlacksmith;
    ui.settlementBody.appendChild(cancelBtn);
}

function renderHelp() {
    ensureVisitState();
    setHeader();
    showBackButton();
    ui.settlementDesc.innerText = "Местные жители всегда рады лишней паре рук — и не отпустят с пустыми карманами.";
    ui.settlementBody.innerHTML = '';

    const v = gameState.settlementVisit;
    const btn = document.createElement('button');
    btn.className = 'btn-action'; btn.style.borderColor = '#81c784'; btn.style.color = '#81c784';

    if (v.favorUsed) {
        btn.innerText = "Вы уже оказали услугу этому поселению"; btn.disabled = true;
        ui.settlementBody.appendChild(btn);
        return;
    }

    const errandXp = Math.floor(stageBaseline().xp * 0.35);
    const errandGold = Math.floor(goldScale(gameState.stage) * 0.7);
    if (!v.errandFlavor) {
        const pool = errandPool();
        v.errandFlavor = pool[Math.floor(Math.random() * pool.length)];
        saveGame();
    }
    const flavor = v.errandFlavor;

    btn.innerText = `🤝 Помочь местным (+${errandXp} опыта, +${errandGold} золота)`;
    btn.onclick = () => {
        sfx.coin();
        player.xp += errandXp; player.gold += errandGold;
        let lvlMsgs = player.checkLevelUp();
        grantAspectSlotsIfNeeded();
        v.favorUsed = true;
        log(`🤝 ${flavor} Получено ${errandXp} опыта и ${errandGold} золота.`, 'system');
        if (lvlMsgs.length > 0) { sfx.levelup(); lvlMsgs.forEach(msg => log(msg, 'levelup')); }
        updateUI(); saveGame(); renderHelp();
    };
    ui.settlementBody.appendChild(btn);
}

export function resetSettlementState() {
    currentSettlement = null;
}
