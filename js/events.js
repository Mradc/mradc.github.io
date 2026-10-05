import { player, gameState, stageConfigs, goldScale } from './state.js';
import { roll } from './utils.js';
import { sfx } from './audio.js';
import { grantAspectSlotsIfNeeded } from './aspects.js';

// ===================================================================
// СОБЫТИЯ ОБЛАСТИ
//
// Событие выбирается в момент генерации карты и сохраняется в самой
// точке (node.eventId), поэтому игрок видит на карте не безликий «?»,
// а конкретное место — алтарь, кузницу, шахту — и местность вокруг
// точки рисуется под него (terrain.js).
//
// Поля события:
//   name/short/icon/color — как точка выглядит и подписана на карте
//   terrain               — какой декор рисует terrain.js
//   map                   — короткое описание в панели выбора точки
//   title/desc            — заголовок и текст в окне события
//   choices               — варианты: { text, req, action }
//     req()    — доступен ли вариант (иначе кнопка заблокирована)
//     action() — применяет эффект и возвращает { msg, color }
// ===================================================================

// ---------- Масштабирование наград под текущий этап ----------
function baseXp() {
    const cfg = stageConfigs[Math.min(gameState.stage, stageConfigs.length) - 1];
    return cfg.xp;
}

function coins(mult) {
    return Math.max(1, Math.floor(goldScale(gameState.stage) * mult));
}

function gainGold(mult) {
    const g = coins(mult);
    player.gold += g; sfx.coin();
    return g;
}

function gainXp(mult) {
    const xp = Math.floor(baseXp() * mult);
    player.xp += xp;
    const msgs = player.checkLevelUp();
    grantAspectSlotsIfNeeded();
    return { xp, msgs };
}

// Урон событий считается в долях от макс. ХП: на 1 этапе это пара
// единиц, на 15-м — ощутимый кусок, но никогда не убьёт с полного ХП.
function hurt(pct, min = 3) {
    const dmg = Math.max(min, Math.floor(player.maxHp * pct));
    player.hp -= dmg;
    return dmg;
}

function healPct(pct) {
    const amount = Math.min(player.maxHp - player.hp, Math.ceil(player.maxHp * pct));
    player.hp += amount;
    if (amount > 0) sfx.heal();
    return amount;
}

function restoreResources() {
    const slots = player.maxSpellSlots - player.spellSlots;
    const charges = player.maxGiantStrikeCharges - player.currentGiantStrikeCharges;
    player.spellSlots = player.maxSpellSlots;
    player.currentGiantStrikeCharges = player.maxGiantStrikeCharges;
    return { slots, charges };
}

function resourceNote(res) {
    const parts = [];
    if (res.slots > 0) parts.push(`+${res.slots} яч.`);
    if (res.charges > 0) parts.push(`+${res.charges} Огн. удар`);
    return parts.length ? ` (${parts.join(', ')})` : '';
}

function potionRoom() { return player.inventory.heal < player.maxConsumables; }
function elixirRoom() { return player.inventory.elixir < player.maxConsumables; }

function addPotions(count) {
    const before = player.inventory.heal;
    player.inventory.heal = Math.min(player.maxConsumables, before + count);
    return player.inventory.heal - before;
}

function withLevels(msg, res, color) {
    let text = msg;
    if (res && res.msgs && res.msgs.length) text += '<br>' + res.msgs.join('<br>');
    return { msg: text, color };
}

const pass = text => ({ text: 'Пройти мимо', req: null, action: () => ({ msg: text, color: '#aaa' }) });

// ===================================================================
export const eventRegistry = {

    ancient_altar: {
        name: 'Древний алтарь', short: 'Алтарь', icon: '🗿', color: '#ba68c8', terrain: 'altar',
        map: 'Круг стоячих камней вокруг чёрного алтаря. Дух отзовётся — вопрос лишь как.',
        title: 'Древний алтарь',
        desc: 'Алтарь из чёрного камня в кольце менгиров. Руны ещё тёплые, а на плите — засохшие подношения тех, кто проходил здесь до вас.',
        choices: [
            {
                text: 'Воззвать к духу (Харизма)', req: null,
                action: () => {
                    const total = roll(20) + player.chaMod;
                    if (total >= 10) {
                        const res = gainXp(1.6);
                        return withLevels(`Успех (${total})! Руны вспыхивают, и чужая память вливается в вас: +${res.xp} опыта.`, res, '#4caf50');
                    }
                    const dmg = hurt(0.08, 5);
                    return { msg: `Провал (${total})! Алтарь отвергает вас, и по рукам бьёт разрядом: ${dmg} урона.`, color: '#e53935' };
                }
            },
            {
                text: 'Разбить алтарь и забрать подношения', req: null,
                action: () => {
                    const g = gainGold(2.2);
                    const dmg = hurt(0.1, 6);
                    return { msg: `Плита трескается, и вы выгребаете ${g} золота из тайника под ней. Откат бьёт в грудь: ${dmg} урона.`, color: '#ffd700' };
                }
            },
            pass('Вы обходите камни по широкой дуге. Некоторые двери лучше не трогать.')
        ]
    },

    wandering_merchant: {
        name: 'Бродячий торговец', short: 'Торговец', icon: '🛒', color: '#ffd700', terrain: 'merchant',
        map: 'Скрипучая телега у обочины. Старик неприлично рад видеть живого покупателя.',
        title: 'Бродячий торговец',
        desc: 'Телега с перекошенным колесом, тощий мул и старик под навесом. «Дальше по дороге покупателей нет, так что цена — как для родного».',
        choices: [
            {
                text: () => `Связка из 2 зелий (💰 ${coins(1.6)})`,
                req: () => player.gold >= coins(1.6) && potionRoom(),
                action: () => {
                    player.gold -= coins(1.6); sfx.coin();
                    const got = addPotions(2);
                    return { msg: `Старик заворачивает ${got} зелья в тряпицу. «Пей не залпом, герой».`, color: '#ffd700' };
                }
            },
            {
                text: () => `Эликсир духа (💰 ${coins(1.0)})`,
                req: () => player.gold >= coins(1.0) && elixirRoom(),
                action: () => {
                    player.gold -= coins(1.0); sfx.coin();
                    player.inventory.elixir++;
                    return { msg: 'Мутная синяя склянка перекочёвывает вам в пояс.', color: '#64b5f6' };
                }
            },
            {
                text: 'Сбыть трофеи из сумки', req: null,
                action: () => {
                    const g = gainGold(1.3);
                    return { msg: `Старик долго щурится на ваши трофеи и отсыпает ${g} золота.`, color: '#ffd700' };
                }
            },
            pass('Вы киваете торговцу и идёте дальше.')
        ]
    },

    fallen_field: {
        name: 'Поле павших', short: 'Павшие', icon: '⚔️', color: '#b0bec5', terrain: 'battlefield',
        map: 'Место старой резни: вбитые в землю клинки, щиты и выцветшее знамя.',
        title: 'Поле павших',
        desc: 'Здесь давно отгремел бой. Клинки вбиты в землю как надгробия, доспехи проржавели, а знамя уже не разобрать, чьё.',
        choices: [
            {
                text: 'Обобрать тела', req: null,
                action: () => {
                    const g = gainGold(1.8);
                    let msg = `Вы снимаете с павших ${g} золота.`;
                    if (roll(2) === 1 && potionRoom()) { addPotions(1); msg += ' В сумке одного из них уцелело зелье лечения.'; }
                    return { msg, color: '#ffd700' };
                }
            },
            {
                text: 'Похоронить павших', req: null,
                action: () => {
                    const res = gainXp(0.9);
                    const r = restoreResources();
                    return withLevels(`Вы складываете тела и читаете короткое прощание. Духи отвечают покоем: +${res.xp} опыта${resourceNote(r)}.`, res, '#4caf50');
                }
            },
            pass('Вы идёте дальше, стараясь не наступать на кости.')
        ]
    },

    ruined_forge: {
        name: 'Заброшенная кузница', short: 'Кузница', icon: '🔨', color: '#ff8a65', terrain: 'forge',
        map: 'Остывший горн под дырявой крышей. Наковальня цела — а это главное.',
        title: 'Заброшенная кузница',
        desc: 'Крыша провалилась, мехи сгнили, но наковальня цела, а в углях ещё теплится жар. Хватит, чтобы подогнать снаряжение под себя.',
        choices: [
            {
                text: () => `Перековать снаряжение (💰 ${coins(3.2)})`,
                req: () => player.gold >= coins(3.2),
                action: () => {
                    player.gold -= coins(3.2); sfx.coin();
                    player.bonusAc += 1;
                    return { msg: `Вы правите пластины и подгоняете ремни по фигуре. <b>+1 Класс Брони</b> навсегда (КБ: ${player.ac}).`, color: '#4caf50' };
                }
            },
            {
                text: 'Разобрать горн на металл', req: null,
                action: () => {
                    const g = gainGold(1.5);
                    return { msg: `Вы выламываете скобы и обрезки хорошей стали: ${g} золота.`, color: '#ffd700' };
                }
            },
            pass('Вы оставляете кузницу ржаветь дальше.')
        ]
    },

    spirit_spring: {
        name: 'Источник духа', short: 'Источник', icon: '💧', color: '#64b5f6', terrain: 'spring',
        map: 'Светящийся ключ в каменной чаше. Вода то ли целебная, то ли нет.',
        title: 'Источник духа',
        desc: 'Из трещины в скале бьёт ручей, светящийся синим. Вокруг чаши — кости мелкого зверья, и это немного настораживает.',
        choices: [
            {
                text: 'Испить из источника', req: null,
                action: () => {
                    if (Math.random() > 0.3) {
                        const healed = healPct(1);
                        const r = restoreResources();
                        return { msg: `Вода обжигает холодом и разом смывает усталость: +${healed} ХП${resourceNote(r)}.`, color: '#64b5f6' };
                    }
                    const dmg = hurt(0.12, 6);
                    return { msg: `Вода горчит — источник давно отравлен: ${dmg} урона.`, color: '#e53935' };
                }
            },
            {
                text: 'Наполнить флягу', req: () => potionRoom(),
                action: () => { addPotions(1); return { msg: 'Вы сцеживаете светящуюся воду во флягу — сойдёт за зелье лечения.', color: '#4caf50' }; }
            },
            pass('Вы решаете не пить из светящихся луж.')
        ]
    },

    ember_shrine: {
        name: 'Пепельное святилище', short: 'Святилище', icon: '🔥', color: '#e64a19', terrain: 'shrine',
        map: 'Каменный идол над жаровней. Пламя внутри не гаснет столетиями.',
        title: 'Пепельное святилище',
        desc: 'Обугленный идол склонился над жаровней, в которой до сих пор гудит огонь. У подножия — подношения, к которым никто не решился притронуться.',
        choices: [
            {
                text: 'Принять пламя', req: null,
                action: () => {
                    const r = restoreResources();
                    const res = gainXp(0.7);
                    return withLevels(`Огонь втягивается в ваши ладони и уходит под кожу${resourceNote(r)}. Дух внутри откликается: +${res.xp} опыта.`, res, '#e64a19');
                }
            },
            {
                text: 'Забрать подношения', req: null,
                action: () => {
                    const g = gainGold(1.9);
                    const dmg = hurt(0.08, 5);
                    return { msg: `Вы выгребаете ${g} золота, но жаровня плюётся углями: ${dmg} урона.`, color: '#ffd700' };
                }
            },
            pass('Вы кланяетесь идолу и проходите мимо.')
        ]
    },

    caged_prisoner: {
        name: 'Клетка на перепутье', short: 'Клетка', icon: '⛓️', color: '#81c784', terrain: 'cage',
        map: 'Подвешенная у дороги клетка, и в ней кто-то ещё дышит.',
        title: 'Клетка на перепутье',
        desc: 'Ржавая клетка покачивается на цепи. Внутри — исхудавший наёмник; он смотрит на вас и молча трясёт решётку.',
        choices: [
            {
                text: 'Сорвать замок (Харизма)', req: null,
                action: () => {
                    const total = roll(20) + player.chaMod;
                    if (total >= 12) {
                        const g = gainGold(2.0);
                        let msg = `Успех (${total})! Наёмник вываливается наружу, суёт вам ${g} золота`;
                        if (elixirRoom()) { player.inventory.elixir++; msg += ' и свой последний эликсир'; }
                        return { msg: msg + ' и уходит, не оглядываясь.', color: '#4caf50' };
                    }
                    const dmg = hurt(0.09, 5);
                    return { msg: `Провал (${total})! На замке оказалась охранная печать: ${dmg} урона, а клетка так и не открылась.`, color: '#e53935' };
                }
            },
            {
                text: 'Перерезать цепь и опустить клетку', req: () => player.inventory.heal > 0,
                action: () => {
                    player.inventory.heal--;
                    const g = gainGold(2.6);
                    const res = gainXp(0.5);
                    return withLevels(`Вы опускаете клетку и отдаёте наёмнику зелье. Он расплачивается всем, что при нём: ${g} золота (+${res.xp} опыта).`, res, '#ffd700');
                }
            },
            pass('Вы отводите взгляд и идёте дальше. Он что-то кричит вслед.')
        ]
    },

    abandoned_mine: {
        name: 'Заброшенная шахта', short: 'Шахта', icon: '⛏️', color: '#a1887f', terrain: 'mine',
        map: 'Штольня с прогнившими подпорками. Внизу что-то блестит.',
        title: 'Заброшенная шахта',
        desc: 'Вход в штольню подпёрт гнилыми брёвнами, из глубины тянет сыростью. У самого входа брошена вагонетка с недобранной породой.',
        choices: [
            {
                text: 'Спуститься к жиле', req: null,
                action: () => {
                    if (Math.random() > 0.4) {
                        const g = gainGold(3.0);
                        return { msg: `Жила богатая, и вы выносите ${g} золота.`, color: '#ffd700' };
                    }
                    const g = gainGold(1.0);
                    const dmg = hurt(0.12, 6);
                    return { msg: `Свод осыпается на полпути: ${dmg} урона. Из-под завала вы вытаскиваете лишь ${g} золота.`, color: '#e53935' };
                }
            },
            {
                text: 'Собрать породу у входа', req: null,
                action: () => {
                    const g = gainGold(0.9);
                    return { msg: `Вы выбираете руду из вагонетки: ${g} золота. Скучно, зато целы.`, color: '#ffd700' };
                }
            },
            pass('Гнилые подпорки убеждают вас пройти мимо.')
        ]
    },

    beast_nest: {
        name: 'Логово зверя', short: 'Логово', icon: '🥚', color: '#8d6e63', terrain: 'nest',
        map: 'Гнездо из веток и костей. Хозяин где-то рядом.',
        title: 'Логово зверя',
        desc: 'Гнездо в человеческий рост свито из веток, костей и обрывков чужого снаряжения. В нём — кладка и то, что зверь стащил у прежних гостей.',
        choices: [
            {
                text: 'Разорить гнездо (Бонус мастерства)', req: null,
                action: () => {
                    const total = roll(20) + player.pb;
                    if (total >= 12) {
                        const g = gainGold(1.5);
                        const res = gainXp(1.2);
                        return withLevels(`Успех (${total})! Вы выгребаете ${g} золота и уходите раньше, чем хозяин вернулся (+${res.xp} опыта).`, res, '#4caf50');
                    }
                    const g = gainGold(0.7);
                    const dmg = hurt(0.12, 6);
                    return { msg: `Провал (${total})! Зверь возвращается и достаёт вас когтями: ${dmg} урона. Успели схватить лишь ${g} золота.`, color: '#e53935' };
                }
            },
            {
                text: 'Тихо забрать одно яйцо', req: null,
                action: () => {
                    const g = gainGold(1.0);
                    return { msg: `Скорлупа тёплая и тяжёлая — за такую дадут ${g} золота. Вы уходите на цыпочках.`, color: '#ffd700' };
                }
            },
            pass('Вы обходите логово, пока хозяин не вернулся.')
        ]
    },

    memory_obelisk: {
        name: 'Обелиск памяти', short: 'Обелиск', icon: '🗼', color: '#b39ddb', terrain: 'obelisk',
        map: 'Чёрный монолит с именами тех, кто шёл этим путём раньше.',
        title: 'Обелиск памяти',
        desc: 'Гладкий чёрный монолит исписан именами. Чем ниже к земле — тем свежее резьба, и внизу осталось довольно много места.',
        choices: [
            {
                text: 'Прочесть письмена', req: null,
                action: () => {
                    const res = gainXp(1.0);
                    return withLevels(`Чужой опыт ложится в память ровными строками: +${res.xp} опыта.`, res, '#4caf50');
                }
            },
            {
                text: 'Вписать своё имя кровью', req: null,
                action: () => {
                    const dmg = hurt(0.15, 6);
                    const res = gainXp(2.0);
                    return withLevels(`Камень пьёт кровь (${dmg} урона) и отдаёт взамен всё, что помнит: +${res.xp} опыта.`, res, '#ba68c8');
                }
            },
            pass('Вы не трогаете обелиск. Имён там и без вас хватает.')
        ]
    },

    wanderers_camp: {
        name: 'Кострище странников', short: 'Привал', icon: '🏕️', color: '#ffb74d', terrain: 'camp',
        map: 'Брошенная стоянка: угли ещё тёплые, пожитки остались.',
        title: 'Кострище странников',
        desc: 'Два навеса, перевёрнутый котелок и угли, которые ещё дышат теплом. Хозяева ушли в спешке и, судя по следам, недалеко.',
        choices: [
            {
                text: 'Отдохнуть у костра', req: null,
                action: () => {
                    const healed = healPct(0.45);
                    const r = restoreResources();
                    return { msg: `Вы раздуваете угли и переводите дух: +${healed} ХП${resourceNote(r)}.`, color: '#4caf50' };
                }
            },
            {
                text: 'Обыскать брошенные пожитки', req: null,
                action: () => {
                    if (roll(2) === 1 && potionRoom()) {
                        addPotions(1);
                        return { msg: 'Под навесом нашлось зелье лечения, забытое впопыхах.', color: '#4caf50' };
                    }
                    const g = gainGold(1.1);
                    return { msg: `В котелке звякает кошель: ${g} золота.`, color: '#ffd700' };
                }
            },
            pass('Вы не задерживаетесь у чужого костра.')
        ]
    },

    ritual_circle: {
        name: 'Незавершённый ритуал', short: 'Ритуал', icon: '🕯️', color: '#ce93d8', terrain: 'ritual',
        map: 'Круг догорающих свечей и меловые знаки. Кто-то не успел закончить.',
        title: 'Незавершённый ритуал',
        desc: 'Круг свечей, меловые знаки и брошенный на полуслове гримуар. Того, кто это начал, рядом нет — только обугленный след на камне.',
        choices: [
            {
                text: 'Завершить ритуал (Харизма)', req: null,
                action: () => {
                    const total = roll(20) + player.chaMod;
                    if (total >= 13) {
                        const res = gainXp(1.8);
                        const r = restoreResources();
                        return withLevels(`Успех (${total})! Круг замыкается, и высвободившаяся сила уходит в вас: +${res.xp} опыта${resourceNote(r)}.`, res, '#4caf50');
                    }
                    const dmg = hurt(0.15, 7);
                    return { msg: `Провал (${total})! Знаки срываются, и отдача бьёт вас: ${dmg} урона.`, color: '#e53935' };
                }
            },
            {
                text: 'Развеять круг', req: null,
                action: () => {
                    const healed = healPct(0.2);
                    const res = gainXp(0.5);
                    return withLevels(`Вы гасите свечи и стираете знаки. Напряжение спадает: +${healed} ХП, +${res.xp} опыта.`, res, '#64b5f6');
                }
            },
            pass('Вы обходите круг, не переступая меловую линию.')
        ]
    }
};

export const eventIds = Object.keys(eventRegistry);

export function randomEventId() {
    return eventIds[Math.floor(Math.random() * eventIds.length)];
}

// Событие точки (с запасным вариантом для старых сохранений)
export function eventDefOf(node) {
    return eventRegistry[node && node.eventId] || eventRegistry.ancient_altar;
}

// Текст кнопки может зависеть от текущих цен/состояния
export function choiceText(choice) {
    return typeof choice.text === 'function' ? choice.text() : choice.text;
}