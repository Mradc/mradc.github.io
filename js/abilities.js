// ===================================================================
// ОСОБЫЕ СПОСОБНОСТИ ВРАГОВ (как в D&D 5e)
// Чистые данные — без импортов, чтобы их мог подключать любой модуль.
// Логика выполнения живёт в combat.js, логика состояний игрока — в conditions.js.
//
// Поля способности:
//   kind     — когда срабатывает:
//              'rider'  — «при попадании»: после удачного удара из Мультиатаки
//              'action' — ЗАМЕНЯЕТ всю Мультиатаку на этот ход (дыхание, заклинание)
//              'bonus'  — бонусное действие: применяется ДО атак, атаки остаются
//              'death'  — «при смерти»: срабатывает, когда враг погибает
//   recharge — «Перезарядка N–6»: после применения способность «остывает»,
//              в начале каждого хода врага бросается d6, при N+ — готова снова
//   uses     — ограничение «N раз за бой»
//   chance   — шанс применить способность, когда она готова (по умолчанию 1)
//   thenStrikes — для action: после способности враг делает ещё N обычных ударов
//              (для способностей без урона, чтобы они не были «пропуском хода»)
//   onStrike — для rider: 'first' | 'last' | 'any' (какой удар серии её несёт)
//   once     — для rider: не чаще раза за ход (по умолчанию да)
//   requires — для rider: сработает, только если у игрока есть одно из состояний
//   save     — спасбросок ИГРОКА: 'str'|'dex'|'con'|'int'|'wis'|'cha'
//              (без save эффект применяется автоматически)
//   dc/dcBonus — своя Сл или надбавка к базовой Сл врага (enemy.saveDc)
//   dmg      — массив частей урона [{ n, d, type, bonus? }]
//   dmgMode  — 'half' (успех спасброска → половина, по умолчанию),
//              'fail' (успех → урона нет), 'always' (урон всегда, эффект — по провалу)
//   cond     — состояние при провале спасброска { id, turns, tick? }
//   drain    — на провале макс. ХП игрока снижается на нанесённый урон (до конца боя)
//   steal    — на провале враг крадёт долю золота (возвращается, если убить вора)
// ===================================================================

export const saveNames = { str: 'Силы', dex: 'Ловкости', con: 'Телосложения', int: 'Интеллекта', wis: 'Мудрости', cha: 'Харизмы' };

// Состояния игрока. endSave — характеристика повторного спасброска в конце
// каждого СВОЕГО хода (как «повторяет спасбросок в конце каждого своего хода» в D&D).
// hard — «жёсткий контроль»: после его окончания игрок получает защиту до конца
// следующего хода врага, чтобы нельзя было залочить его в бесконечный паралич.
export const conditionMeta = {
    poisoned:   { name: 'Отравлен',    icon: '🤢', endSave: 'con', desc: 'помеха на ваши броски атаки.' },
    frightened: { name: 'Испуган',     icon: '😱', endSave: 'wis', desc: 'помеха на ваши броски атаки.' },
    restrained: { name: 'Опутан',      icon: '🕸️', endSave: 'str', desc: 'помеха на ваши атаки, а атаки по вам — с преимуществом.' },
    blinded:    { name: 'Ослеплён',    icon: '🙈', endSave: 'con', desc: 'помеха на ваши атаки, а атаки по вам — с преимуществом.' },
    burning:    { name: 'Горит',       icon: '🔥', endSave: 'dex', desc: 'вы получаете урон в начале каждого хода врага, пока не потушите огонь.' },
    slowed:     { name: 'Замедлен',    icon: '🐌', endSave: 'con', desc: 'на вашем ходу нет бонусного действия и реакции.' },
    prone:      { name: 'Сбит с ног',  icon: '🤸', desc: 'атаки врага по вам — с преимуществом; на вашем ходу вставание тратит бонусное действие.' },
    paralyzed:  { name: 'Парализован', icon: '⚡', hard: true, desc: 'вы теряете весь следующий ход; атаки по вам — с преимуществом и каждое попадание — критическое.' },
    charmed:    { name: 'Очарован',    icon: '💫', hard: true, desc: 'вы не можете атаковать очаровавшего — Действие на следующий ход потеряно.' }
};

export const abilityCatalog = {
    // ---------- Этапы 1–3 ----------
    rat_bite: {
        name: 'Заразный укус', icon: '🦠', kind: 'rider', save: 'con',
        cond: { id: 'poisoned', turns: 2 },
        text: 'впивается зубами, занося заразу'
    },
    boar_charge: {
        name: 'Таран', icon: '🐗', kind: 'rider', save: 'str',
        dmg: [{ n: 1, d: 6, type: 'bludgeoning' }], dmgMode: 'always', cond: { id: 'prone' },
        text: 'на полном ходу таранит вас клыками', sfx: 'crit'
    },
    goblin_pilfer: {
        name: 'Ловкие пальцы', icon: '🪙', kind: 'rider', save: 'dex', steal: 0.15,
        text: 'пытается срезать ваш кошель', sfx: 'coin'
    },
    wolf_trip: {
        name: 'Подсечка', icon: '🐺', kind: 'rider', save: 'str',
        cond: { id: 'prone' },
        text: 'вцепляется в ногу и валит вас наземь'
    },
    goblin_warcry: {
        name: 'Боевой клич', icon: '📣', kind: 'bonus', uses: 1, save: 'wis',
        cond: { id: 'frightened', turns: 1 },
        text: 'издаёт пронзительный боевой клич'
    },
    druid_roots: {
        name: 'Шипастые корни', icon: '🌿', kind: 'action', recharge: 5, save: 'str',
        dmg: [{ n: 2, d: 6, type: 'piercing' }], dmgMode: 'half', cond: { id: 'restrained', turns: 1 },
        text: 'взывает к тёмной природе — из земли рвутся колючие корни'
    },

    // ---------- Этапы 4–6 ----------
    skeleton_burst: {
        name: 'Костяной взрыв', icon: '💥', kind: 'death', save: 'dex',
        dmg: [{ n: 2, d: 6, type: 'piercing' }], dmgMode: 'half',
        text: 'рассыпается, разбрасывая острые осколки костей', sfx: 'crit'
    },
    mummy_glare: {
        name: 'Ужасающий взгляд', icon: '👁️', kind: 'bonus', uses: 1, save: 'wis',
        cond: { id: 'frightened', turns: 1 },
        text: 'впивается в вас мёртвым взглядом'
    },
    mummy_rot: {
        name: 'Мумийная гниль', icon: '☠️', kind: 'rider', save: 'con',
        dmg: [{ n: 2, d: 6, type: 'necrotic' }], dmgMode: 'fail', drain: true,
        text: 'касается вас гниющим кулаком'
    },
    ghoul_claws: {
        name: 'Паралитические когти', icon: '🧟', kind: 'rider', onStrike: 'last', save: 'con',
        cond: { id: 'paralyzed', turns: 1 },
        text: 'полосует вас когтями, источающими трупный яд'
    },
    zombie_miasma: {
        name: 'Трупные миазмы', icon: '☁️', kind: 'action', recharge: 5, save: 'con',
        dmg: [{ n: 2, d: 6, type: 'poison' }], dmgMode: 'half', cond: { id: 'poisoned', turns: 2 },
        text: 'выдыхает облако трупного смрада'
    },
    shadow_drain: {
        name: 'Вытягивание сил', icon: '🌑', kind: 'rider', save: 'con',
        dmg: [{ n: 2, d: 6, type: 'necrotic' }], dmgMode: 'fail', drain: true,
        text: 'касается вас, высасывая жизненную силу'
    },
    poltergeist_slam: {
        name: 'Телекинетический бросок', icon: '🌀', kind: 'action', recharge: 5, save: 'str',
        dmg: [{ n: 3, d: 8, type: 'bludgeoning' }], dmgMode: 'half', cond: { id: 'prone' },
        text: 'подхватывает вас невидимой силой и швыряет о стену'
    },

    // ---------- Этапы 7–9 ----------
    bandit_sand: {
        name: 'Песок в глаза', icon: '🏜️', kind: 'bonus', uses: 1, save: 'dex',
        cond: { id: 'blinded', turns: 1 },
        text: 'швыряет вам в лицо горсть раскалённого песка'
    },
    troll_grab: {
        name: 'Железная хватка', icon: '🤼', kind: 'rider', onStrike: 'first', save: 'str',
        cond: { id: 'restrained', turns: 2 },
        text: 'хватает вас могучей лапой'
    },
    leech_attach: {
        name: 'Присасывание', icon: '🩸', kind: 'rider', save: 'str',
        cond: { id: 'restrained', turns: 3, tick: { n: 1, d: 6, type: 'necrotic', name: 'Пиявка сосёт кровь' } },
        text: 'присасывается к вам'
    },
    demon_chains: {
        name: 'Цепи Преисподней', icon: '⛓️', kind: 'action', recharge: 5, save: 'dex',
        dmg: [{ n: 3, d: 8, type: 'piercing' }], dmgMode: 'half', cond: { id: 'restrained', turns: 2 },
        text: 'выпускает крючковатые цепи', sfx: 'crit'
    },
    golem_ash: {
        name: 'Раскалённый пепел', icon: '🌫️', kind: 'action', recharge: 5, save: 'con',
        dmg: [{ n: 3, d: 6, type: 'fire' }], dmgMode: 'half', cond: { id: 'blinded', turns: 1 },
        text: 'извергает облако раскалённого пепла', sfx: 'fire'
    },

    // ---------- Этапы 10–12 ----------
    elemental_ignite: {
        name: 'Воспламенение', icon: '🔥', kind: 'rider', save: 'dex',
        cond: { id: 'burning', turns: 3, tick: { n: 1, d: 10, type: 'fire', name: 'Горение' } },
        text: 'касается вас — одежда вспыхивает', sfx: 'fire'
    },
    elemental_vortex: {
        name: 'Огненный вихрь', icon: '🌪️', kind: 'action', recharge: 5, save: 'dex',
        dmg: [{ n: 5, d: 8, type: 'fire' }], dmgMode: 'half',
        text: 'закручивается огненным смерчем', sfx: 'fire', shake: true
    },
    dk_hellfire: {
        name: 'Шар адского пламени', icon: '☄️', kind: 'action', uses: 2, chance: 0.6, dcBonus: 1, save: 'dex',
        dmg: [{ n: 4, d: 6, type: 'fire' }, { n: 4, d: 6, type: 'necrotic' }], dmgMode: 'half',
        text: 'швыряет шар адского пламени', sfx: 'crit', shake: true
    },
    guardian_slow: {
        name: 'Окаменяющая тяжесть', icon: '🗿', kind: 'action', recharge: 5, thenStrikes: 1, save: 'wis',
        cond: { id: 'slowed', turns: 2 },
        text: 'излучает давящую древнюю магию, сковывая ваши движения'
    },
    hydra_venom: {
        name: 'Ядовитые клыки', icon: '🐍', kind: 'rider', save: 'con',
        dmg: [{ n: 2, d: 6, type: 'poison' }], dmgMode: 'half', cond: { id: 'poisoned', turns: 2 },
        text: 'вонзает ядовитые клыки'
    },
    scorpion_pincers: {
        name: 'Клешни', icon: '🦀', kind: 'rider', onStrike: 'first', save: 'str',
        cond: { id: 'restrained', turns: 2 },
        text: 'зажимает вас клешнёй'
    },
    scorpion_sting: {
        name: 'Ядовитое жало', icon: '🦂', kind: 'rider', onStrike: 'last', save: 'con',
        dmg: [{ n: 4, d: 6, type: 'poison' }], dmgMode: 'half', cond: { id: 'poisoned', turns: 2 },
        text: 'вонзает ядовитое жало'
    },

    // ---------- Этапы 13–14 ----------
    vampire_charm: {
        name: 'Очарование', icon: '💫', kind: 'bonus', recharge: 6, dcBonus: 1, save: 'wis',
        cond: { id: 'charmed', turns: 1 },
        text: 'ловит ваш взгляд, подчиняя вашу волю'
    },
    vampire_bite: {
        name: 'Укус вампира', icon: '🦇', kind: 'rider', onStrike: 'last',
        requires: ['charmed', 'restrained', 'paralyzed'],
        dmg: [{ n: 3, d: 6, type: 'necrotic' }], drain: true,
        text: 'впивается клыками в беспомощную жертву'
    },
    banshee_visage: {
        name: 'Ужасающий лик', icon: '😨', kind: 'bonus', uses: 1, save: 'wis',
        cond: { id: 'frightened', turns: 1 },
        text: 'являет вам свой ужасный лик'
    },
    banshee_wail: {
        name: 'Вопль баньши', icon: '📢', kind: 'action', uses: 1, chance: 0.6, dcBonus: 1, save: 'con',
        dmg: [{ n: 12, d: 6, type: 'psychic' }], dmgMode: 'half',
        text: 'испускает нечеловеческий вопль', sfx: 'thunder', shake: true
    },
    pit_aura: {
        name: 'Аура страха', icon: '😈', kind: 'bonus', uses: 1, dcBonus: 1, save: 'wis',
        cond: { id: 'frightened', turns: 1 },
        text: 'окутывает вас аурой первобытного ужаса'
    },
    pit_fireball: {
        name: 'Адский огненный шар', icon: '🔥', kind: 'action', recharge: 5, save: 'dex',
        dmg: [{ n: 10, d: 6, type: 'fire' }], dmgMode: 'half',
        cond: { id: 'burning', turns: 2, tick: { n: 1, d: 8, type: 'fire', name: 'Адское пламя' } },
        text: 'метает огненный шар', sfx: 'crit', shake: true
    },
    hound_breath: {
        name: 'Огненное дыхание', icon: '🔥', kind: 'action', recharge: 5, save: 'dex',
        dmg: [{ n: 9, d: 6, type: 'fire' }], dmgMode: 'half',
        text: 'выдыхает струю адского пламени', sfx: 'fire'
    },

    // ---------- Этапы 15–16 ----------
    dragon_presence: {
        name: 'Устрашающее присутствие', icon: '🐲', kind: 'bonus', uses: 1, dcBonus: 2, save: 'wis',
        cond: { id: 'frightened', turns: 1 },
        text: 'расправляет крылья, внушая животный ужас'
    },
    dragon_breath: {
        name: 'Дыхание дракона', icon: '🔥', kind: 'action', recharge: 5, dcBonus: 1, save: 'dex',
        dmg: [{ n: 12, d: 8, type: 'fire' }], dmgMode: 'half',
        text: 'извергает испепеляющий поток пламени', sfx: 'crit', shake: true
    },
    dragon_wing: {
        name: 'Удар крылом', icon: '🦅', kind: 'bonus', recharge: 5, chance: 0.6, dcBonus: 2, save: 'dex',
        dmg: [{ n: 2, d: 8, type: 'bludgeoning' }], dmgMode: 'half', cond: { id: 'prone' },
        text: 'бьёт вас могучим крылом'
    },
    copper_acid_breath: {
        name: 'Кислотное дыхание', icon: '🧪', kind: 'action', recharge: 5, dcBonus: 2, save: 'dex',
        dmg: [{ n: 10, d: 8, type: 'acid' }], dmgMode: 'half',
        text: 'извергает струю едкой кислоты', sfx: 'crit', shake: true
    },
    copper_slow_breath: {
        name: 'Замедляющее дыхание', icon: '🐌', kind: 'action', recharge: 5, thenStrikes: 1, dcBonus: 2, save: 'con',
        cond: { id: 'slowed', turns: 2 },
        text: 'выдыхает облако вязкого газа'
    },
    boss_dread: {
        name: 'Лик Бездны', icon: '👁️', kind: 'bonus', uses: 1, dcBonus: 1, save: 'wis',
        cond: { id: 'frightened', turns: 1 },
        text: 'раскрывает перед вами истинный лик Бездны'
    },
    boss_void_blast: {
        name: 'Взрыв Пустоты', icon: '🕳️', kind: 'action', recharge: 5, dcBonus: 1, save: 'dex',
        dmg: [{ n: 10, d: 8, type: 'necrotic' }], dmgMode: 'half', cond: { id: 'blinded', turns: 1 },
        text: 'обрушивает на вас сгусток Пустоты', sfx: 'crit', shake: true
    },
    boss_soul_drain: {
        name: 'Пожирание души', icon: '👻', kind: 'rider', onStrike: 'last', dcBonus: 1, save: 'con',
        dmg: [{ n: 4, d: 6, type: 'necrotic' }], dmgMode: 'half', drain: true,
        text: 'вырывает часть вашей души'
    }
};

const DMG_LABEL = { bludgeoning: 'дроб.', piercing: 'кол.', slashing: 'руб.', fire: 'огн.', necrotic: 'некр.', acid: 'кисл.', poison: 'яд.', psychic: 'псих.' };
const KIND_LABEL = { rider: 'при попадании', action: 'вместо атак', bonus: 'бонусное действие', death: 'при смерти' };

// Короткое «описание из карточки монстра» — для лога в начале боя
export function describeAbility(def, dc) {
    const bits = [KIND_LABEL[def.kind]];
    if (def.recharge) bits.push(`перезарядка ${def.recharge}–6`);
    else if (def.uses) bits.push(`${def.uses}/бой`);
    if (def.thenStrikes) bits.push(`+${def.thenStrikes} обычный удар`);
    if (def.requires) bits.push('только по беспомощной цели');
    if (def.save) bits.push(`спасбросок ${saveNames[def.save]} Сл ${dc}`);
    if (def.dmg) {
        let s = def.dmg.map(p => `${p.n}к${p.d}${p.bonus ? '+' + p.bonus : ''} ${DMG_LABEL[p.type] || ''}`).join(' + ');
        if (def.save && (def.dmgMode || 'half') === 'half') s += ' (½ при успехе)';
        bits.push(s);
    }
    if (def.cond && conditionMeta[def.cond.id]) bits.push(`→ ${conditionMeta[def.cond.id].name}`);
    if (def.drain) bits.push('снижает макс. ХП');
    if (def.steal) bits.push(`крадёт ${Math.round(def.steal * 100)}% золота`);
    return bits.join(', ');
}
