import { player, gameState, stageConfigs, stagePools, goldScale, enemyState } from './state.js';
import { roll } from './utils.js';
import { ui, updateUI, showLoseScreen, log, showConfirm, showNotice } from './ui.js';
import { startStage } from './combat.js';
import { saveGame } from './storage.js';
import { sfx } from './audio.js';
import { startSettlement, resetSettlementState } from './settlement.js';
import { grantAspectSlotsIfNeeded, tryShowAspectPicker } from './aspects.js';
import { renderTerrain } from './terrain.js';
import { equipmentRegistry, commonPool } from './equipment.js';
import { eventRegistry, randomEventId, eventDefOf, choiceText } from './events.js';

// ===================================================================
// КАРТА ОБЛАСТИ (заменяет старую систему "путей")
//
// Каждый этап — это небольшая область с разбросанными точками интереса.
// Правила:
//   • За этап можно отыграть не более MAX_INTERACTIONS (2) точек;
//   • Бой можно принять только ОДИН раз за этап (обычный ИЛИ элитный) —
//     взяв одного врага, второй запечатывается;
//   • Обычный враг есть в области ВСЕГДА, элитный — с шансом;
//   • Перейти на следующий этап можно в любой момент, даже не потратив
//     взаимодействия (выводится предупреждение);
//   • Этапы BOSS_STAGES — это "Врата Босса": в области только страж,
//     и обойти его нельзя;
//   • На новом этапе область генерируется заново — и так до 16-го.
// ===================================================================

export const MAX_INTERACTIONS = 2;
export const BOSS_STAGES = [10, 16];

// Базовые шансы мирных точек. Раньше все три типа выпадали примерно с
// одинаковой частотой (~82%). Теперь Забытый сундук и Поселение выпадают
// вдвое реже — по прямому требованию баланса; Случайное событие остаётся
// на прежней (базовой) частоте.
const EVENT_CHANCE = 0.82;
const TREASURE_CHANCE = EVENT_CHANCE / 2;
const SETTLEMENT_CHANCE = EVENT_CHANCE / 2;

// Шанс, что сундук вместо чистого золота отсыпет ещё и вещь в сумку
// снаряжения (см. player.equipmentBag) — тогда золота будет заметно меньше.
const TREASURE_GEAR_CHANCE = 0.32;

function isBossStage(stage) { return BOSS_STAGES.includes(stage); }
function isCombatType(type) { return type === 'combat' || type === 'combat_elite' || type === 'combat_boss'; }

// Как точка выглядит на карте. Для события — иконка, подпись, цвет и
// описание берутся из его записи в events.js, поэтому вместо «?» игрок
// сразу видит, что именно его там ждёт. Для боя — из конкретной особи,
// выбранной для этой области (см. enemyVariantOf), а не из общей
// заглушки: игрок видит, кто именно его ждёт, ещё до боя.
function visualOf(node) {
    if (node.type === 'event') {
        const ev = eventDefOf(node);
        return { icon: ev.icon, name: ev.name, short: ev.short, color: ev.color, desc: () => ev.map };
    }
    if (isCombatType(node.type)) {
        const variant = enemyVariantOf(node);
        const base = nodeTypes[node.type];
        const desc = node.type === 'combat_elite'
            ? () => `Усиленный «${variant.name}»: +50% ХП, +1 КБ и меткость. Опыт вдвое больше, золота примерно вдвое больше.`
            : node.type === 'combat_boss'
                ? () => `${variant.name}. Страж этапа: пока он жив, дороги дальше нет.`
                : () => `${variant.name}. Стандартный бой этапа: полный опыт и золото.`;
        return { icon: base.icon, name: base.name, short: base.short, color: base.color, desc };
    }
    return nodeTypes[node.type];
}

// Особь, выбранная для боевой точки этой области (см. generateMapForStage) —
// одна и та же для обычного боя и элиты в пределах одной области, поэтому
// местность (terrain.js) и описание везде говорят об одном и том же звере.
function enemyVariantOf(node) {
    const pool = stagePools[gameState.stage - 1] || stagePools[stagePools.length - 1];
    return pool[node.variantIdx] ?? pool[0];
}

// Старые сохранения (и любая точка без привязанного события/особи)
// получают их при первой же отрисовке карты.
function ensureEventIds(m) {
    let changed = false;
    m.nodes.forEach(node => {
        if (node.type === 'event' && !eventRegistry[node.eventId]) { node.eventId = randomEventId(); changed = true; }
    });
    return changed;
}

function ensureEnemyVariants(m) {
    const pool = stagePools[m.stage - 1] || stagePools[stagePools.length - 1];
    let sharedIdx = null, changed = false;
    m.nodes.forEach(node => {
        if (node.type === 'combat_boss' && node.variantIdx === undefined) { node.variantIdx = 0; changed = true; }
        else if ((node.type === 'combat' || node.type === 'combat_elite') && node.variantIdx === undefined) {
            if (sharedIdx === null) sharedIdx = Math.floor(Math.random() * pool.length);
            node.variantIdx = sharedIdx; changed = true;
        }
    });
    return changed;
}

// ===================================================================
// ТИПЫ ТОЧЕК НА КАРТЕ
// ===================================================================
// Тип боя (combat/combat_elite/combat_boss) ниже задаёт только иконку/
// подпись/цвет — итоговое описание строится в visualOf() из конкретной
// особи, выбранной для области (там и живой текст с её именем).
const nodeTypes = {
    combat: {
        icon: '⚔️', name: 'Обычный враг', short: 'Враг', color: '#e0e0e0'
    },
    combat_elite: {
        icon: '👹', name: 'Элитный враг', short: 'Элита', color: '#d84b20'
    },
    combat_boss: {
        icon: '💀', name: 'Врата Босса', short: 'Босс', color: '#d32f2f'
    },
    event: {
        icon: '❓', name: 'Случайное событие', short: 'Событие', color: '#ba68c8',
        desc: () => 'Неизвестная находка. Может обернуться наградой, а может и бедой.'
    },
    treasure: {
        icon: '🎁', name: 'Забытый сундук', short: 'Сундук', color: '#ffd700',
        desc: () => 'Брошенный сундук: обычно золото, но иногда — вещь в сумку снаряжения (и золота тогда меньше).'
    },
    settlement: {
        icon: '🏘️', name: 'Поселение', short: 'Поселение', color: '#64b5f6',
        desc: () => 'Таверна (отдых и задание), кузнец (экипировка) и помощь местным.'
    },
    exit: {
        icon: '🚪', name: 'Переход дальше', short: 'Дальше', color: '#4caf50',
        desc: () => 'Покинуть область и отправиться на следующий этап. Неиспользованные взаимодействия сгорят.'
    }
};

// ===================================================================
// ГЕНЕРАЦИЯ ОБЛАСТИ
// Позиции берутся из фиксированной сетки 3x3 (в процентах от размера
// карты) со случайным сдвигом — так точки всегда разбросаны и никогда
// не наезжают друг на друга на маленьком экране.
// ===================================================================
const SLOTS = [
    [20, 34], [50, 34], [80, 34],
    [20, 60], [50, 60], [80, 60],
    [20, 84], [50, 84], [80, 84]
];

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function generateMapForStage(stage) {
    const nodes = [];
    // Одна и та же случайно выбранная особь из пула этапа обслуживает и
    // обычный бой, и элиту в пределах ОДНОЙ области — иначе местность не
    // знала бы, под кого рисовать сцену (лес под волка или пустыню под
    // разбойника), если бы у двух точек оказались разные звери.
    const pool = stagePools[stage - 1] || stagePools[stagePools.length - 1];
    const variantIdx = Math.floor(Math.random() * pool.length);

    if (isBossStage(stage)) {
        nodes.push({ id: 'n0', type: 'combat_boss', x: 50, y: 55, done: false, variantIdx: 0 });
    } else {
        const types = ['combat'];                                   // обычный враг — обязательно
        if (Math.random() < 0.55) types.push('combat_elite');        // элита — с шансом

        // Мирные возможности решаются независимо друг от друга: сундук и
        // поселение — частые гости области, событие выпадает вдвое реже.
        const peaceful = [];
        if (Math.random() < TREASURE_CHANCE) peaceful.push('treasure');
        if (Math.random() < SETTLEMENT_CHANCE) peaceful.push('settlement');
        if (Math.random() < EVENT_CHANCE) peaceful.push('event');
        if (peaceful.length === 0) peaceful.push(shuffle(['event', 'treasure', 'settlement'])[0]); // область не бывает совсем пустой
        types.push(...peaceful);

        const slots = shuffle(SLOTS);
        shuffle(types).forEach((type, i) => {
            const [sx, sy] = slots[i];
            const node = {
                id: 'n' + i, type, done: false,
                x: Math.round(sx + (Math.random() * 6 - 3)),
                y: Math.round(sy + (Math.random() * 4 - 2))
            };
            // Конкретное событие определяется здесь же — карта должна
            // показывать его заранее, а местность вокруг рисуется под него.
            if (type === 'event') node.eventId = randomEventId();
            if (type === 'combat' || type === 'combat_elite') node.variantIdx = variantIdx;
            nodes.push(node);
        });
    }

    // На боссе взаимодействие ровно одно — сам страж, поэтому предупреждение
    // о "несобранных возможностях" там не появляется.
    const limit = isBossStage(stage) ? 1 : MAX_INTERACTIONS;

    gameState.map = {
        stage,
        nodes,
        maxInteractions: limit,
        interactionsLeft: limit,
        enemyTaken: false,
        selected: null
    };
}

function bossDefeated() {
    const m = gameState.map;
    if (!m) return false;
    const boss = m.nodes.find(n => n.type === 'combat_boss');
    return boss ? boss.done : true;
}

// Причина, по которой точка недоступна (или null, если доступна)
function lockReason(node) {
    const m = gameState.map;
    if (node.done) return 'Вы уже побывали здесь на этом этапе.';
    if (m.interactionsLeft <= 0) return 'Взаимодействия этапа исчерпаны — осталось только идти дальше.';
    if (isCombatType(node.type) && m.enemyTaken) return 'В одной области можно принять лишь один бой.';
    return null;
}

function exitLockReason() {
    if (gameState.stage >= gameState.maxStage) return 'Это последний этап — дальше только победа или смерть.';
    if (isBossStage(gameState.stage) && !bossDefeated()) return 'Врата запечатаны, пока страж этапа жив.';
    return null;
}

// ===================================================================
// ОТРИСОВКА КАРТЫ
// ===================================================================
export function renderMap() {
    const m = gameState.map;
    if (!m) return;

    ui.mapStageLabel.innerText = `Этап ${gameState.stage} / ${gameState.maxStage}`;

    // Индикатор оставшихся взаимодействий
    ui.mapPips.innerHTML = '';
    for (let i = 0; i < (m.maxInteractions || MAX_INTERACTIONS); i++) {
        const pip = document.createElement('span');
        pip.className = 'pip' + (i < m.interactionsLeft ? '' : ' spent');
        ui.mapPips.appendChild(pip);
    }

    if (ensureEventIds(m) || ensureEnemyVariants(m)) saveGame();

    ui.mapNodes.innerHTML = '';
    m.nodes.forEach(node => renderNode(node, lockReason(node)));

    // Точка перехода на следующий этап — всегда наверху области
    const exitNode = { id: 'exit', type: 'exit', x: 50, y: 10, done: false };
    const showExit = gameState.stage < gameState.maxStage;
    if (showExit) renderNode(exitNode, exitLockReason());

    // Местность под точками. Координаты и состав точек не меняются —
    // ландшафт лишь подстраивается под них: под конкретное событие (его
    // decor-ключ) или под конкретного зверя боевой точки (его theme —
    // именно он решает, каким этапу быть на вид, а не номер этапа).
    const sites = (showExit ? [...m.nodes, exitNode] : m.nodes).map(nd => {
        if (nd.type === 'event') return { type: nd.type, x: nd.x, y: nd.y, terrain: eventDefOf(nd).terrain };
        if (isCombatType(nd.type)) {
            const variant = enemyVariantOf(nd);
            return { type: nd.type, x: nd.x, y: nd.y, enemyTheme: variant.theme, enemyName: variant.name };
        }
        return { type: nd.type, x: nd.x, y: nd.y };
    });
    renderTerrain(ui.mapTerrain, ui.mapArea, gameState.stage, sites);

    renderDetail();
}

function renderNode(node, locked) {
    const t = visualOf(node);
    const el = document.createElement('div');
    el.className = 'map-node';
    if (node.done) el.classList.add('done');
    else if (locked) el.classList.add('locked');
    if (gameState.map.selected === node.id) el.classList.add('selected');
    if (node.type === 'combat_boss') el.classList.add('boss');

    el.style.left = node.x + '%';
    el.style.top = node.y + '%';
    el.style.color = t.color;
    el.innerHTML = `
        <div class="circle" style="border-color:${t.color};">${node.done ? '✓' : t.icon}</div>
        <div class="caption">${t.short}</div>
    `;
    el.addEventListener('click', () => {
        gameState.map.selected = node.id;
        renderMap();
    });
    ui.mapNodes.appendChild(el);
}

function renderDetail() {
    const m = gameState.map;
    const detail = ui.mapDetail;

    if (!m.selected) {
        detail.className = '';
        detail.style.borderLeftColor = '#3a3a45';
        detail.innerHTML = `<p class="map-hint">Выберите точку на карте. Доступно взаимодействий: <b>${m.interactionsLeft}</b> из ${m.maxInteractions || MAX_INTERACTIONS}.</p>`;
        return;
    }

    let node = m.nodes.find(n => n.id === m.selected);
    let locked;
    if (!node && m.selected === 'exit') {
        node = { id: 'exit', type: 'exit', done: false };
        locked = exitLockReason();
    } else if (node) {
        locked = lockReason(node);
    } else {
        m.selected = null; renderDetail(); return;
    }

    const t = visualOf(node);
    detail.style.borderLeftColor = t.color;
    detail.innerHTML = `
        <p class="map-detail-name" style="color:${t.color};">${t.icon} ${t.name}</p>
        <p class="map-detail-desc">${t.desc()}</p>
    `;

    const btn = document.createElement('button');
    btn.className = 'btn-action';
    btn.style.borderColor = t.color; btn.style.color = t.color; btn.style.marginTop = '8px';

    if (locked) {
        btn.disabled = true;
        btn.innerText = locked;
        btn.style.fontSize = '11px';
    } else if (node.type === 'exit') {
        btn.innerText = '➡️ Идти дальше';
        btn.onclick = requestNextStage;
    } else {
        btn.innerText = '▶️ Отправиться';
        btn.onclick = () => travelTo(node);
    }
    detail.appendChild(btn);
}

// ===================================================================
// ОТКРЫТИЕ/ЗАКРЫТИЕ КАРТЫ
// ===================================================================
export function openMap() {
    if (gameState.inCombat) return;
    if (!gameState.map) generateMapForStage(gameState.stage);
    gameState.map.selected = null;
    ui.mapModal.classList.remove('hidden'); // сначала показываем окно, чтобы местность знала свои размеры
    renderMap();
}

export function closeMap() {
    ui.mapModal.classList.add('hidden');
}

// Обновляет нижнюю панель этапа и (если карта открыта) саму карту
export function refreshStageUi() {
    updateUI();
    if (!ui.mapModal.classList.contains('hidden')) renderMap();
}

export function logStageHint() {
    const m = gameState.map;
    if (!m) return;
    if (m.interactionsLeft > 0) log(`<i>Осталось взаимодействий на этапе: ${m.interactionsLeft}. Откройте карту и выберите точку.</i>`, 'system');
    else log(`<i>Взаимодействия этапа исчерпаны. Откройте карту и переходите на следующий этап.</i>`, 'system');
}

// ===================================================================
// ПЕРЕХОД К ТОЧКЕ
// Взаимодействие списывается СРАЗУ при входе — чтобы выход из игры
// посреди боя/поселения не позволял отыграть точку дважды.
// ===================================================================
function travelTo(node) {
    const m = gameState.map;
    if (lockReason(node)) return;

    node.done = true;
    m.interactionsLeft--;
    m.selected = null;
    if (isCombatType(node.type)) m.enemyTaken = true;

    closeMap();
    saveGame();

    if (node.type === 'combat') startStage(false, node.variantIdx || 0);
    else if (node.type === 'combat_elite') startStage(true, node.variantIdx || 0);
    else if (node.type === 'combat_boss') startStage(false, node.variantIdx || 0);
    else if (node.type === 'event') startEvent(node);
    else if (node.type === 'treasure') startTreasure();
    else if (node.type === 'settlement') startSettlement();
}

// ===================================================================
// ПЕРЕХОД НА СЛЕДУЮЩИЙ ЭТАП
// ===================================================================
export function requestNextStage() {
    if (gameState.inCombat) return;
    const m = gameState.map;

    const blocked = exitLockReason();
    if (blocked) { showNotice('Путь закрыт', blocked); return; }

    if (m && m.interactionsLeft > 0) {
        showConfirm(
            '⚠️ Покинуть область?',
            `У вас осталось <b>${m.interactionsLeft}</b> неиспользованных взаимодействий на этом этапе.<br>` +
            `Переход сгенерирует новую область, и всё несобранное здесь будет потеряно навсегда.<br>` +
            `<span style="color:#aaa; font-size:12px;">Пропуская бои, вы уходите вперёд без опыта и золота — следующие враги будут заметно сильнее вас.</span>`,
            goNextStage,
            { yesLabel: 'Идти дальше', noLabel: 'Остаться' }
        );
    } else {
        goNextStage();
    }
}

// onYes-колбэк для showConfirm — модалка уже закрыта самим ui.js к
// моменту вызова колбэка, здесь остаётся только сам переход.
function goNextStage() {
    enterStage(gameState.stage + 1);
}// Вход в новый этап: генерируем область, чистим врага и визит в поселение
export function enterStage(stage) {
    gameState.stage = stage;
    gameState.inCombat = false;
    enemyState.current = null;
    resetSettlementState();
    gameState.settlementVisit = null;
    generateMapForStage(stage);

    if (isBossStage(stage)) {
        log(`<b>— Этап ${stage} / ${gameState.maxStage} —</b> Воздух густеет: впереди только <span style="color:#d32f2f;">Врата Босса</span>.`, 'system');
    } else {
        log(`<b>— Этап ${stage} / ${gameState.maxStage} —</b> Новая область. Доступно взаимодействий: ${MAX_INTERACTIONS} из ${gameState.map.nodes.length} точек.`, 'system');
    }

    refreshStageUi();
    saveGame();
    if (!gameState.pendingAspectChoices) openMap();
}

// Восстановление после "Продолжить игру"
export function resumeStageArea(openIfIdle = true) {
    if (!gameState.map || gameState.map.stage !== gameState.stage) {
        generateMapForStage(gameState.stage);
        saveGame();
    }
    gameState.map.selected = null;
    refreshStageUi();
    if (openIfIdle && !gameState.pendingAspectChoices) openMap();
}

// ===================================================================
// СОБЫТИЯ И СУНДУКИ
// ===================================================================
function startEvent(node) {
    const ev = eventDefOf(node);
    ui.eventTitle.innerText = `${ev.icon} ${ev.title}`; ui.eventTitle.style.color = ev.color;
    ui.eventDesc.innerText = ev.desc; ui.eventActions.innerHTML = '';
    ev.choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'btn-action'; btn.style.borderColor = ev.color; btn.innerText = choiceText(choice);
        if (choice.req && !choice.req()) btn.disabled = true;
        btn.onclick = () => {
            const result = choice.action();
            ui.eventActions.classList.add('hidden');
            ui.eventResult.innerHTML = result.msg; ui.eventResult.style.color = result.color;
            ui.eventResult.classList.remove('hidden'); ui.btnCloseEvent.classList.remove('hidden');
            updateUI();

            if (player.hp <= 0) {
                ui.eventModal.classList.add('hidden');
                showLoseScreen(gameState.stage, player.level);
            } else {
                saveGame(); // Сохраняем результат
            }
        };
        ui.eventActions.appendChild(btn);
    });
    ui.eventActions.classList.remove('hidden'); ui.eventResult.classList.add('hidden'); ui.btnCloseEvent.classList.add('hidden');
    ui.eventModal.classList.remove('hidden');
}

function startTreasure() {
    ui.eventTitle.innerText = "Забытый Сундук"; ui.eventTitle.style.color = "#ffd700";
    ui.eventDesc.innerText = "Вы нашли старый сундук в углу комнаты. К счастью, это не мимик.";
    ui.eventActions.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn-action'; btn.style.borderColor = '#ffd700'; btn.innerText = "Открыть";
    btn.onclick = () => {
        const dropsGear = Math.random() < TREASURE_GEAR_CHANCE;
        // С вещью: сначала скрип крышки и блеск находки, звон монет — following.
        // Без вещи: как раньше, сразу звон монет.
        if (dropsGear) { sfx.chestFind(); setTimeout(() => sfx.coin(), 220); }
        else sfx.coin();
        // Сундук с вещью платит заметно меньше золотом, чем сундук с чистым золотом.
        const goldMult = dropsGear ? 1.1 : 2.2;
        const base = Math.floor(goldScale(gameState.stage) * goldMult);
        const gold = base + roll(base);
        player.gold += gold;

        let msg = `Вы нашли 💰 ${gold} золота`;
        if (dropsGear) {
            const itemId = commonPool[Math.floor(Math.random() * commonPool.length)];
            const item = equipmentRegistry[itemId];
            player.equipmentBag.push(itemId); // находка уходит в сумку — экипировать можно позже
            msg += ` и <b>${item.name}</b> — находка отправилась в сумку снаряжения.`;
        } else {
            msg += '!';
        }

        ui.eventActions.classList.add('hidden');
        ui.eventResult.innerHTML = msg; ui.eventResult.style.color = '#ffd700';
        ui.eventResult.classList.remove('hidden'); ui.btnCloseEvent.classList.remove('hidden');
        updateUI(); saveGame();
    };
    ui.eventActions.appendChild(btn);
    ui.eventActions.classList.remove('hidden'); ui.eventResult.classList.add('hidden'); ui.btnCloseEvent.classList.add('hidden');
    ui.eventModal.classList.remove('hidden');
}

// ===================================================================
// ВОЗВРАТ НА КАРТУ ПОСЛЕ ТОЧЕК
// ===================================================================
ui.btnCloseEvent.addEventListener('click', () => {
    ui.eventModal.classList.add('hidden');
    logStageHint();
    refreshStageUi();
    saveGame();
    tryShowAspectPicker();                              // Если набрался выбор Аспекта — сначала он
    if (!gameState.pendingAspectChoices) openMap();     // Иначе сразу возвращаемся к карте
});

ui.btnCloseSettlement.addEventListener('click', () => {
    ui.settlementModal.classList.add('hidden');
    resetSettlementState();
    gameState.settlementVisit = null;
    log(`<i>Вы покидаете поселение.</i>`, 'system');
    logStageHint();
    refreshStageUi();
    saveGame();
    tryShowAspectPicker();
    if (!gameState.pendingAspectChoices) openMap();
});

// Когда игрок закончил выбирать Аспекты — возвращаем его к карте
document.addEventListener('aspects:finished', () => {
    if (!gameState.inCombat && gameState.map) openMap();
});
