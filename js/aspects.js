import { player, gameState } from './state.js';
import { ui, log } from './ui.js';
import { saveGame } from './storage.js';
import { sfx } from './audio.js';

// ===================================================================
// НЕЗАПЕЧАТАННЫЕ АСПЕКТЫ (Unsealed Aspects)
// Только аспекты с требованием "Сосуд Х уровня" от 1 до 10 включительно
// (исходные пороги 1/2/7/10) — 14-й и 18-й уровень недостижимы при
// игровом капе в 10 уровней, поэтому не включаются вовсе.
// Слоты выбора открываются на уровнях 1, 2, 4, 7, 10 (как в таблице
// класса: 1→2→2→3→3→3→4→4→4→5 известных аспектов) — 5 выборов за забег.
// Описания — точный перевод оригинального текста, БЕЗ придуманных
// замен. Если механика (захваты, фамильяр со своим ходом, проверки
// навыков, различие ближний/дальний бой и т.д.) не имеет аналога в
// нашей упрощённой пошаговой боёвке, аспект всё равно доступен для
// выбора — он просто помечен как не дающий игрового эффекта.
// ===================================================================

export function aspectSlotsForLevel(lvl) {
    const table = [1, 2, 2, 3, 3, 3, 4, 4, 4, 5];
    return table[Math.min(Math.max(lvl, 1), 10) - 1];
}

export const aspectRegistry = {
    // --- Уровень 1 ---
    ethereal_tendril: {
        name: "Эфирное щупальце", minLevel: 1, functional: false,
        desc: "Действием вы протягиваете (или втягиваете) эфирное щупальце духа: досягаемость 10 футов, Сила равна вашей Харизме. Может манипулировать простыми предметами, совершать Опаловые удары, толчки или захваты."
    },
    spirit_sense: {
        name: "Чувство духа", minLevel: 1, functional: false,
        desc: "Облачённый в Мантию Духа, вы видите магию как по заклинанию обнаружения магии (требует концентрации). Вы также чувствуете родственных вашему Духу существ — Небожителей, Элементалей, Фей, Исчадий — определяя их тип и способность к колдовству."
    },
    striking_presence: {
        name: "Мощь личности", minLevel: 1, functional: false,
        desc: "Дух внутри усиливает силу вашей личности. Вы получаете владение навыком Обман, Запугивание или Убеждение (на выбор), а в Мантии Духа — преимущество на проверки этим навыком."
    },
    uncanny_strength: {
        name: "Неестественная сила", minLevel: 1, functional: false,
        desc: "Связанная с вами сущность увеличивает вашу мощь. Вы получаете владение Атлетикой и можете использовать Харизму вместо Силы для проверок Атлетики, включая захваты и толчки."
    },

    // --- Уровень 2 ---
    iridescent_shield: {
        name: "Опаловый щит", minLevel: 2, functional: true,
        desc: "Пока вы в Мантии Духа, реакцией вы поглощаете часть урона по себе (или существу в пределах досягаемости): снижение на (уровень Сосуда + мод. Харизмы)."
    },
    opalescent_armor: {
        name: "Опаловая броня", minLevel: 2, functional: true,
        desc: "Облачаясь в Мантию Духа, вы усиливаете её: пока вы в бою, у вас Сопротивление дробящему, колющему и рубящему урону (весь входящий урон снижен вдвое)."
    },
    shimmering_lance: {
        name: "Мерцающее копьё", minLevel: 2, functional: false,
        desc: "Вы можете метать сгустки чистой духовной силы: Опаловый удар совершается как дальнобойная атака заклинанием (Дальность 30/90)."
    },
    vexing_strike: {
        name: "Раздражающий удар", minLevel: 2, functional: false,
        desc: "При попадании Опаловым ударом в ближнем бою цель получает помеху на атаки против существ, отличных от вас, до начала вашего следующего хода."
    },

    // --- Уровень 7 ---
    dire_stature: {
        name: "Исполинский рост", minLevel: 7, functional: true,
        desc: "Превращаясь в Форму Архонта, вы можете вырасти на 1 категорию размера: удары наносят +1d4 урона, досягаемость +5 футов, КБ Формы +1."
    },
    ethereal_grasp: {
        name: "Эфирная хватка", minLevel: 7, prereq: 'uncanny_strength', functional: false,
        desc: "Ваша хватка держит и тело, и дух. Захватывая существо в Мантии Духа, вы заставляете его использовать Харизму вместо Силы, чтобы вырваться."
    },
    evoke_spirit: {
        name: "Малый дух", minLevel: 7, functional: false,
        desc: "Вы высвобождаете малую форму запечатанного Духа: изучаете заклинание Призыв фамильяра (не считается за известное, можно творить ритуалом). Фамильяр выглядит как крошечная версия вашего Архонта и действует в свой ход."
    },
    minor_magick: {
        name: "Малое волшебство", minLevel: 7, functional: true,
        desc: "Вы обретаете больший контроль над мощью Духа. Раз за бой (в оригинале — раз за долгий отдых) вы можете сотворить одно из известных заклинаний на минимальном уровне без затраты ячейки."
    },
    iridescent_aegis: {
        name: "Опаловая эгида", minLevel: 7, prereq: 'iridescent_shield', functional: false,
        desc: "Использовав Опаловый щит на другом существе, если оно всё ещё получает урон — вы можете забрать половину оставшегося урона на себя той же реакцией."
    },
    otherworldly_maw: {
        name: "Иномирная пасть", minLevel: 7, functional: true,
        desc: "Голод Духа питает и вашу жизненную силу. Раз за ход в Форме Архонта вы можете отказаться от одной из атак, вынуждая существо в досягаемости пройти спасбросок Харизмы. Провал: 2d6 некротического урона, а ваши врем. ХП растут на половину этого урона (не более чем вдвое от уровня)."
    },
    piercing_gaze: {
        name: "Пронзающий взгляд", minLevel: 7, prereq: 'spirit_sense', functional: false,
        desc: "Дух обостряет ваше зрение до сверхъестественного уровня. К проверкам, основанным на зрении, вы прибавляете мод. Харизмы (не менее +1). В Мантии Духа вы видите в магической тьме и мгновенно замечаете иллюзии и оборотней."
    },

    // --- Уровень 10 ---
    dazzling_lance: {
        name: "Ослепляющее копьё", minLevel: 10, prereq: 'shimmering_lance', functional: true,
        desc: "Дальность Мерцающего копья растёт, оно игнорирует укрытия. При попадании дальнобойным Опаловым ударом вы можете потратить ячейку заклинания и вызвать духовный взрыв: 6d8 урона (Спасбросок Ловкости на половину)."
    },
    perilous_visage: {
        name: "Устрашающий облик", minLevel: 10, functional: true,
        desc: "Вы являете часть истинной мощи Духа. Превращаясь в Форму Архонта, вы вынуждаете видящего вас врага пройти спасбросок Мудрости. Провал: он Испуган (атакует вас с помехой) до конца боя."
    },
    sundering_strike: {
        name: "Сокрушающий удар", minLevel: 10, functional: false,
        desc: "Ваши удары разят и тело, и дух. При попадании Опаловым ударом (раз за ход) вы можете вынудить цель на спасбросок Харизмы. Провал: до начала вашего следующего хода она не может концентрироваться или творить заклинания."
    }
};

export function has(id) {
    return player.knownAspects && player.knownAspects.includes(id);
}

function isEligible(id) {
    const a = aspectRegistry[id];
    if (!a) return false;
    if (player.knownAspects.includes(id)) return false;
    if (player.level < a.minLevel) return false;
    if (a.prereq && !player.knownAspects.includes(a.prereq)) return false;
    return true;
}

export function eligibleAspects() {
    return Object.keys(aspectRegistry).filter(isEligible).map(id => ({ id, ...aspectRegistry[id] }));
}

// Вызывается сразу после player.checkLevelUp() — считает, сколько
// выборов аспекта игрок должен иметь на текущем уровне, и добавляет
// недостающие в очередь (устойчиво к многократному level-up за раз).
export function grantAspectSlotsIfNeeded() {
    const target = aspectSlotsForLevel(player.level);
    const already = player.knownAspects.length + (gameState.pendingAspectChoices || 0);
    if (target > already) {
        gameState.pendingAspectChoices = (gameState.pendingAspectChoices || 0) + (target - already);
    }
}

function anyOtherModalOpen() {
    return !ui.eventModal.classList.contains('hidden') ||
           !ui.settlementModal.classList.contains('hidden') ||
           !ui.shopModal.classList.contains('hidden') ||
           !ui.inventoryModal.classList.contains('hidden') ||
           !ui.mapModal.classList.contains('hidden') ||
           !ui.confirmModal.classList.contains('hidden');
}

// Сообщаем остальной игре, что очередь выборов Аспекта пуста — карта области
// (map.js) слушает это событие, чтобы вернуть игрока к выбору точки.
function notifyIfQueueEmpty() {
    if (!gameState.pendingAspectChoices || gameState.pendingAspectChoices <= 0) {
        document.dispatchEvent(new CustomEvent('aspects:finished'));
    }
}

// Показывает окно выбора аспекта, если есть неизрасходованный выбор
// и ни одна другая модалка сейчас не открыта (иначе — ждём, эта функция
// вызывается повторно из обработчиков закрытия этих модалок).
export function tryShowAspectPicker() {
    if (!gameState.pendingAspectChoices || gameState.pendingAspectChoices <= 0) return;
    if (anyOtherModalOpen()) return;
    if (ui.aspectModal && !ui.aspectModal.classList.contains('hidden')) return; // уже открыто

    const options = eligibleAspects();
    ui.aspectTitle.innerText = `✨ Незапечатанный Аспект (осталось выборов: ${gameState.pendingAspectChoices})`;
    ui.aspectDesc.innerText = `Уровень Сосуда ${player.level} пробуждает новую грань запечатанного духа. Выберите Аспект:`;
    ui.aspectBody.innerHTML = '';

    if (options.length === 0) {
        ui.aspectBody.innerHTML = `<p style="color:#aaa; font-size:13px; text-align:center;">Нет доступных Аспектов для выбора (все подходящие уже открыты).</p>`;
        const skipBtn = document.createElement('button');
        skipBtn.className = 'btn-action'; skipBtn.style.borderColor = '#888'; skipBtn.style.color = '#888';
        skipBtn.innerText = 'Продолжить';
        skipBtn.onclick = () => {
            gameState.pendingAspectChoices--; saveGame();
            ui.aspectModal.classList.add('hidden');
            tryShowAspectPicker();
            notifyIfQueueEmpty();
        };
        ui.aspectBody.appendChild(skipBtn);
    } else {
        options.forEach(opt => {
            const el = document.createElement('div');
            el.className = 'shop-item'; el.style.cursor = 'pointer';
            const funcNote = opt.functional ? '' : `<br><span style="color:#888; font-size:10px;">⚠️ Не даёт игрового эффекта в этой версии (механика не переносится на бой)</span>`;
            el.innerHTML = `
                <div class="shop-item-info">
                    <span class="shop-item-name">✨ ${opt.name}</span>
                    <span class="shop-item-desc">${opt.desc}${funcNote}</span>
                </div>
                <button class="btn-buy" style="border-color:#ba68c8; color:#ba68c8;">Открыть</button>
            `;
            el.querySelector('button').onclick = () => chooseAspect(opt.id);
            ui.aspectBody.appendChild(el);
        });
    }

    ui.aspectModal.classList.remove('hidden');
}

function chooseAspect(id) {
    const a = aspectRegistry[id];
    player.knownAspects.push(id);
    gameState.pendingAspectChoices = Math.max(0, (gameState.pendingAspectChoices || 0) - 1);
    sfx.levelup();
    log(`<span class="aspect-ribbon">✨ АСПЕКТ ✨</span><br><b>${a.name}</b><br><span style="font-weight:normal; font-size:12px; opacity:0.9;">${a.desc}</span>`, 'aspect');
    ui.aspectModal.classList.add('hidden');
    saveGame();
    tryShowAspectPicker(); // Если остались ещё выборы — сразу показать следующий
    notifyIfQueueEmpty();  // Иначе — вернуть игрока к карте области
}
