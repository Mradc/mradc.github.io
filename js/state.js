import { roll, xpThresholds, slotLevelByVesselLevel, healPotionTiers } from './utils.js';
import { abilityCatalog } from './abilities.js';

// ===================================================================
// ТИПЫ УРОНА (как в D&D 5e) — сейчас нужны только для атак ВРАГОВ
// (см. поле dmgType у stageConfigs ниже и takePlayerDamage в combat.js).
// label — короткая подпись в боевом логе ("10 кол. урона"), full — как
// показывается на карточке врага, className — CSS-класс подсветки текста.
// ===================================================================
export const damageTypeMeta = {
    bludgeoning: { label: 'дроб.', full: 'Дробящий урон', icon: '🔨', className: 'dmg-bludgeoning' },
    piercing:    { label: 'кол.',  full: 'Колющий урон',  icon: '🗡️', className: 'dmg-piercing' },
    slashing:    { label: 'руб.',  full: 'Рубящий урон',  icon: '⚔️', className: 'dmg-slashing' },
    fire:        { label: 'огн.',  full: 'Огненный урон', icon: '🔥', className: 'dmg-fire' },
    necrotic:    { label: 'некр.', full: 'Некротический урон', icon: '💀', className: 'dmg-necrotic' },
    acid:        { label: 'кисл.', full: 'Кислотный урон', icon: '🧪', className: 'dmg-acid' },
    poison:      { label: 'яд.',   full: 'Урон ядом',      icon: '☠️', className: 'dmg-poison' },
    psychic:     { label: 'псих.', full: 'Психический урон', icon: '🧠', className: 'dmg-psychic' }
};

// map — сгенерированная область текущего этапа (см. map.js): точки интереса,
// остаток взаимодействий и флаг "бой на этом этапе уже принят".
export const gameState = { stage: 1, maxStage: 16, turn: 'player', inCombat: false, isAnimating: false, map: null, settlementVisit: null, pendingAspectChoices: 0 };

export const player = {
    level: 1, xp: 0, gold: 0,
    conMod: 3, chaMod: 3, dexMod: 0, bonusAc: 0,
    // Остальные модификаторы характеристик (нужны только для спасбросков от способностей врагов)
    strMod: 0, intMod: 0, wisMod: 0,
    // Владение спасбросками (прибавляется бонус мастерства). Меняется одной строкой.
    saveProf: ['con', 'cha'],
    saveMod(ability) {
        const base = { str: this.strMod, dex: this.dexMod, con: this.conMod, int: this.intMod, wis: this.wisMod, cha: this.chaMod }[ability] || 0;
        return base + (this.saveProf.includes(ability) ? this.pb : 0);
    },
    // Боевые состояния (см. conditions.js): { id: { turns, dc, tick } }. Живут только в бою.
    conditions: {}, ccImmune: false,
    // Макс. ХП, временно «выпитое» некротикой (возвращается после боя)
    hpDrain: 0,
    maxHp: 13, hp: 13, tempHp: 0,
    
    get ac() { return 10 + this.conMod + this.chaMod + this.bonusAc + this.equipAcBonus + (this.archonActive ? this.archonAspectAcBonus : 0); }, 
    get pb() { return Math.ceil(this.level / 4) + 1; },  
    get hitMod() { return this.pb + this.chaMod; },      
    get dmgMod() { return this.chaMod; },
    get dmgDie() { return this.level >= 17 ? 12 : (this.level >= 11 ? 10 : (this.level >= 5 ? 8 : 6)); }, 
    get attacksPerAction() { return this.level >= 5 ? 2 : 1; }, 
    get xpNeeded() { return xpThresholds[this.level] || 999999; },
    get spellSaveDc() { return 8 + this.pb + this.chaMod; },
    get maxGiantStrikeCharges() { return this.pb + this.equipGiantChargeBonus; }, currentGiantStrikeCharges: 2,
    get maxSpellSlots() { return (this.level >= 2 ? 2 : 0) + this.equipSpellSlotBonus; }, spellSlots: 0,
    get slotLevel() { return slotLevelByVesselLevel[this.level] || 1; },
    // Тело Сосуда с 3-го уровня само пропускает через себя пламя Архонта —
    // отсюда врождённое (постоянное, не зависящее от Формы) Сопротивление
    // огненному урону. См. takePlayerDamage в combat.js.
    get fireResistant() { return this.level >= 3; },

    // Бонусы от надетой экипировки, не завязанные на HP (AC/заряды/ячейки пересчитываются функцией recomputeEquipmentStats)
    equipAcBonus: 0, equipGiantChargeBonus: 0, equipSpellSlotBonus: 0,
    // НОВОЕ: доп. эффекты экипировки — урон стихией за удар, доп. слоты под зелья, вампиризм
    equipBonusDamages:[], equipConsumableCapBonus: 0, equipLifestealPct: 0,
    get maxConsumables() { return 3 + this.equipConsumableCapBonus; },

    // НОВОЕ: Инвентарь зелий
    inventory: { heal: 0, elixir: 0 },
    // Текущий уровень качества зелий лечения (индекс в healPotionTiers, см. utils.js)
    healTier: 0,
    get healPotionInfo() { return healPotionTiers[this.healTier]; },

    // НОВОЕ: Экипировка — 4 слота, каждый держит id предмета из equipment.js или null
    equipment: { gloves: null, wraps: null, accessory1: null, accessory2: null },
    // НОВОЕ: Сумка снаряжения — снятые и найденные (но не надетые) предметы.
    // Хранит id предметов, дубликаты допустимы (массив, не Set).
    equipmentBag: [],
    // Товары поселения, купленные единожды за прохождение (id -> true)
    ownedUnique: {},

    // НОВОЕ: Незапечатанные Аспекты — открытые id (см. aspects.js)
    knownAspects: [],
    // Ресурсы функциональных аспектов, сбрасываются в combat.js
    minorMagickUsedThisCombat: false, otherworldlyMawUsedThisTurn: false,
    archonAspectAcBonus: 0, enemyFrightened: false,

    archonActive: false, actions: 1, bonusActions: 1, attacksRemaining: 1, fireStrikeUsedThisTurn: false, attackedThisTurn: false,
    // Реакция: Опаловый щит и Адское возмездие расходуют один и тот же ресурс Реакции (раз в свой ход)
    reactionAvailable: true,

    reset: function() {
        this.level = 1; this.xp = 0; this.gold = 0; this.bonusAc = 0;
        this.conMod = 3; this.chaMod = 3;
        this.maxHp = 10 + this.conMod; this.hp = this.maxHp; this.tempHp = 0;
        this.inventory = { heal: 0, elixir: 0 };
        this.healTier = 0;
        this.equipment = { gloves: null, wraps: null, accessory1: null, accessory2: null };
        this.equipmentBag = [];
        this.ownedUnique = {};
        this.knownAspects = [];
        // Бонусы экипировки обнуляем ДО расчёта зарядов/ячеек — иначе новая игра
        // стартует с зарядами, унаследованными от снаряжения прошлого забега.
        this.equipAcBonus = 0; this.equipGiantChargeBonus = 0; this.equipSpellSlotBonus = 0;
        this.equipBonusDamages =[]; this.equipConsumableCapBonus = 0; this.equipLifestealPct = 0;
        this.currentGiantStrikeCharges = this.maxGiantStrikeCharges;
        this.spellSlots = this.maxSpellSlots; this.archonActive = false;
        this.reactionAvailable = true;
        this.conditions = {}; this.ccImmune = false; this.hpDrain = 0;
    },

    loadData: function(data) {
        this.level = data.level; this.xp = data.xp; this.gold = data.gold;
        this.bonusAc = data.bonusAc; this.maxHp = data.maxHp; this.hp = data.hp;
        this.currentGiantStrikeCharges = data.currentGiantStrikeCharges;
        this.spellSlots = data.spellSlots; this.inventory = data.inventory;
        this.healTier = data.healTier || 0;
        this.equipment = data.equipment || { gloves: null, wraps: null, accessory1: null, accessory2: null };
        this.equipmentBag = data.equipmentBag || [];
        this.ownedUnique = data.ownedUnique || {};
        this.knownAspects = data.knownAspects || [];
        // equipAcBonus/equipGiantChargeBonus/equipSpellSlotBonus пересчитываются из equipment
        // вызовом recomputeEquipmentStats() из equipment.js после loadData (см. storage.js)
        
        // Харизма пересчитывается в зависимости от уровня
        this.conMod = 3;
        this.chaMod = 3;
        if (this.level >= 4) this.chaMod += 1;
        if (this.level >= 8) this.chaMod += 1;
        
        this.archonActive = false; this.tempHp = 0; // Врем. баффы сбрасываем
        this.reactionAvailable = true;
        this.conditions = {}; this.ccImmune = false; this.hpDrain = 0;
    },

    checkLevelUp: function() {
        let msgs =[];
        while (this.xp >= this.xpNeeded && this.level < 10) {
            this.level++;
            const hpGain = roll(10) + this.conMod;
            this.maxHp += hpGain; this.hp = this.maxHp; 
            
            let msg = `<b>🎉 УРОВЕНЬ ПОВЫШЕН ДО ${this.level}!</b> Макс. ХП увеличено на ${hpGain}. Здоровье восстановлено.`;
            if (this.level === 2) msg += `<br>🔥 <b>Магия Сосуда:</b> 2 ячейки заклинаний. Реакция "Адское возмездие"!`;
            if (this.level === 3) msg += `<br>🌋 <b>Форма Архонта:</b> Доступно превращение. Базовые удары наносят <span class="dmg-fire">Огонь</span>!<br>🛡️ <b>Огнестойкость:</b> тело Сосуда закаляется пламенем Архонта — вы получаете постоянное Сопротивление огненному урону.`;
            if (this.level === 4 || this.level === 8) { this.chaMod += 1; msg += `<br>🌟 <b>Улучшение:</b> Мод. Харизмы +${this.chaMod}. AC: ${this.ac}.`; }
            if (this.level === 5) msg += `<br>⚔️ <b>Доп. атака</b> (2 удара) и кость <b>1d8</b>! Доступен удар бонусом после каста Магии. Ячейки 2-го ур.`;
            if (this.level === 6) msg += `<br>🔥 <b>Мощь Древних:</b> В форме Архонта броски огня 1 и 2 считаются как 3!`;
            if (this.level === 7) msg += `<br>⚡ <b>Контролируемое превращение:</b> Архонт бесплатен в начале боя!`;
            if (this.level === 9) msg += `<br>📈 <b>Бонус мастерства</b> +${this.pb}. Ячейки 3-го уровня!`;
            msgs.push(msg);
        }
        return msgs;
    }
};

// Кроме привычных hp/ac/hit/dmg у части врагов — поле `atk`: число
// отдельных ударов за ход (Мультиатака, как в D&D Monster Manual).
// Без поля `atk` враг бьёт один раз за ход, как раньше. dmgC у таких
// врагов держим на 1 (несколько кубиков в одном ударе заменены на
// несколько ПОЛНОЦЕННЫХ ударов — иначе урон удваивался бы дважды).
// dmgType — тип урона атаки (см. damageTypeMeta выше); без поля
// считается дробящим. Игрок получает Сопротивление огню с 3 уровня
// (player.fireResistant) — оно применяется именно к этому полю.
//
// abilities — id особых способностей из abilities.js (спасброски игрока,
// состояния, дыхание, захваты...). heads — механика гидры (см. updateHeads
// в combat.js). Трейт 'frenzy' — «Кровавая ярость»: ниже 50% ХП +1 удар.
//
// ВАРИАЦИИ ВРАГОВ: каждый этап — это МАССИВ возможных особей (пул), а не
// одна фиксированная. При генерации области (map.js) для этапа выбирается
// одна случайная особь из пула — она и определяет, кто выйдет и в обычном
// бою, и на элитной точке той же области, и какую местность рисует
// terrain.js (см. поле theme — тему берёт именно выбранная особь, а не
// номер этапа). У этапов-врат босса (10 и 16) пул из одной особи —
// вариаций у боссов нет.
export const stagePools = [
    // 1 — Луга
    [
        { name: "Гигантская крыса", hp: 10, ac: 11, hit: 2, dmgD: 4, dmgMod: 1, xp: 100, gold: 15, seed: "Rat", traits: [], dmgType: 'piercing', abilities: ['rat_bite'], theme: 'meadow' },
        { name: "Дикий кабан", hp: 13, ac: 11, hit: 2, dmgD: 4, dmgMod: 2, xp: 100, gold: 15, seed: "Boar", traits: ['reckless'], dmgType: 'bludgeoning', abilities: ['boar_charge'], theme: 'meadow' }
    ],
    // 2 — Лес
    [
        { name: "Гоблин-грабитель", hp: 15, ac: 12, hit: 3, dmgD: 6, dmgMod: 2, xp: 100, gold: 20, seed: "Gobl", traits: ['nimble'], dmgType: 'slashing', abilities: ['goblin_pilfer'], theme: 'forest' },
        { name: "Лесной волк", hp: 14, ac: 12, hit: 3, dmgD: 6, dmgMod: 2, xp: 100, gold: 18, seed: "Wolf", traits: ['nimble'], dmgType: 'piercing', abilities: ['wolf_trip'], theme: 'forest' }
    ],
    // 3 — Лес
    [
        { name: "Вожак гоблинов", hp: 25, ac: 13, hit: 4, dmgD: 6, dmgMod: 2, xp: 150, gold: 40, seed: "GobB", traits: ['nimble'], dmgType: 'slashing', abilities: ['goblin_warcry'], theme: 'forest' },
        { name: "Падший друид", hp: 24, ac: 13, hit: 4, dmgD: 6, dmgMod: 2, xp: 150, gold: 35, seed: "Drui", traits: [], dmgType: 'necrotic', abilities: ['druid_roots'], theme: 'forest' }
    ],
    // 4 — Кладбище (либо пустынная гробница)
    [
        { name: "Скелет-воин", hp: 30, ac: 13, hit: 4, dmgD: 6, dmgMod: 2, xp: 200, gold: 30, seed: "Skel", traits: ['undead_fortitude'], dmgType: 'bludgeoning', abilities: ['skeleton_burst'], theme: 'graveyard' },
        { name: "Иссохшая мумия", hp: 34, ac: 12, hit: 4, dmgD: 6, dmgMod: 2, xp: 200, gold: 35, seed: "Mumm", traits: ['undead_fortitude'], dmgType: 'necrotic', abilities: ['mummy_glare', 'mummy_rot'], theme: 'desert' }
    ],
    // 5 — Кладбище
    [
        { name: "Упырь", hp: 40, ac: 13, hit: 4, dmgD: 8, dmgMod: 2, xp: 250, gold: 50, seed: "Ghoul", traits: ['lifesteal'], atk: 2, dmgType: 'piercing', abilities: ['ghoul_claws'], theme: 'graveyard' },
        { name: "Гниющий зомби", hp: 46, ac: 11, hit: 3, dmgD: 8, dmgMod: 3, xp: 240, gold: 45, seed: "Zomb", traits: ['undead_fortitude'], dmgType: 'bludgeoning', abilities: ['zombie_miasma'], theme: 'graveyard' }
    ],
    // 6 — Проклятые земли
    [
        { name: "Теневой дух", hp: 45, ac: 13, hit: 5, dmgD: 8, dmgMod: 3, xp: 200, gold: 40, seed: "Shad", traits: [], dmgType: 'necrotic', abilities: ['shadow_drain'], theme: 'haunted' },
        { name: "Буйный полтергейст", hp: 42, ac: 12, hit: 6, dmgD: 8, dmgMod: 2, xp: 200, gold: 40, seed: "Polt", traits: [], dmgType: 'bludgeoning', abilities: ['poltergeist_slam'], theme: 'haunted' }
    ],
    // 7 — Нагорья (либо пустынный кочевник)
    [
        { name: "Орк-берсерк", hp: 65, ac: 13, hit: 5, dmgD: 10, dmgMod: 3, xp: 800, gold: 80, seed: "Orc", traits: ['reckless', 'frenzy'], atk: 2, dmgType: 'slashing', theme: 'highland' },
        { name: "Песчаный разбойник", hp: 62, ac: 13, hit: 5, dmgD: 10, dmgMod: 3, xp: 800, gold: 90, seed: "Raid", traits: ['reckless'], atk: 2, dmgType: 'slashing', abilities: ['bandit_sand'], theme: 'desert' }
    ],
    // 8 — Топи
    [
        { name: "Тролль", hp: 85, ac: 14, hit: 6, dmgD: 10, dmgMod: 4, xp: 1000, gold: 100, seed: "Trol", traits: ['regeneration'], atk: 2, dmgType: 'bludgeoning', abilities: ['troll_grab'], theme: 'swamp' },
        { name: "Гигантская пиявка", hp: 78, ac: 13, hit: 6, dmgD: 10, dmgMod: 4, xp: 1000, gold: 95, seed: "Leech", traits: ['lifesteal'], dmgType: 'piercing', abilities: ['leech_attach'], theme: 'swamp' }
    ],
    // 9 — Пепелища
    [
        { name: "Демон-охотник", hp: 110, ac: 14, hit: 6, dmgD: 8, dmgMod: 4, xp: 1500, gold: 150, seed: "Dem", traits: ['fire_resistance'], atk: 2, dmgType: 'piercing', abilities: ['demon_chains'], theme: 'ashen' },
        { name: "Пепельный голем", hp: 125, ac: 13, hit: 5, dmgD: 12, dmgMod: 4, xp: 1500, gold: 150, seed: "Gole", traits: ['fire_immunity'], dmgType: 'bludgeoning', abilities: ['golem_ash'], theme: 'ashen' }
    ],
    // 10 — Врата Босса (без вариаций)
    [
        { name: "Огненный Элементаль", hp: 130, ac: 15, hit: 7, dmgD: 10, dmgMod: 4, xp: 2500, gold: 200, seed: "Fire", traits: ['fire_immunity'], atk: 2, dmgType: 'fire', abilities: ['elemental_ignite', 'elemental_vortex'], theme: 'volcanic' }
    ],
    // 11 — Руины
    [
        { name: "Рыцарь смерти", hp: 150, ac: 16, hit: 8, dmgD: 12, dmgMod: 5, xp: 4000, gold: 250, seed: "Kni", traits: [], atk: 2, dmgType: 'slashing', abilities: ['dk_hellfire'], theme: 'ruins' },
        { name: "Каменный страж руин", hp: 160, ac: 17, hit: 7, dmgD: 10, dmgMod: 5, xp: 4000, gold: 250, seed: "Guar", traits: ['undead_fortitude'], dmgType: 'bludgeoning', abilities: ['guardian_slow'], theme: 'ruins' }
    ],
    // 12 — Топи (либо пустынный хищник)
    [
        { name: "Гидра", hp: 180, ac: 15, hit: 8, dmgD: 10, dmgMod: 5, xp: 4000, gold: 300, seed: "Hydra", traits: ['regeneration'], atk: 3, dmgType: 'piercing', abilities: ['hydra_venom'], heads: { cut: 25, max: 5 }, theme: 'swamp' },
        { name: "Гигантский скорпион", hp: 170, ac: 16, hit: 8, dmgD: 10, dmgMod: 5, xp: 4000, gold: 310, seed: "Scor", traits: ['reckless'], atk: 2, dmgType: 'piercing', abilities: ['scorpion_pincers', 'scorpion_sting'], theme: 'desert' }
    ],
    // 13 — Проклятые земли
    [
        { name: "Высший вампир", hp: 200, ac: 17, hit: 9, dmgD: 12, dmgMod: 5, xp: 9000, gold: 400, seed: "Vamp", traits: ['lifesteal', 'nimble'], atk: 2, dmgType: 'piercing', abilities: ['vampire_charm', 'vampire_bite'], theme: 'haunted' },
        { name: "Воющая баньши", hp: 190, ac: 16, hit: 9, dmgD: 16, dmgMod: 5, xp: 9000, gold: 400, seed: "Bans", traits: ['undead_fortitude'], dmgType: 'necrotic', abilities: ['banshee_visage', 'banshee_wail'], theme: 'haunted' }
    ],
    // 14 — Пепелища
    [
        { name: "Дьявол ямы", hp: 240, ac: 18, hit: 10, dmgD: 12, dmgMod: 6, xp: 11000, gold: 500, seed: "Pit", traits: ['fire_immunity'], atk: 3, dmgType: 'fire', abilities: ['pit_aura', 'pit_fireball'], theme: 'ashen' },
        { name: "Гончая преисподней", hp: 200, ac: 16, hit: 11, dmgD: 8, dmgMod: 5, xp: 11000, gold: 500, seed: "Hell", traits: ['fire_immunity'], atk: 3, dmgType: 'fire', abilities: ['hound_breath'], theme: 'ashen' }
    ],
    // 15 — Вулкан (либо пустынные каньоны)
    [
        { name: "Древний красный дракон", hp: 280, ac: 19, hit: 11, dmgD: 12, dmgC: 2, dmgMod: 7, xp: 15000, gold: 800, seed: "Drag", traits: ['fire_immunity'], atk: 2, dmgType: 'fire', abilities: ['dragon_presence', 'dragon_breath', 'dragon_wing'], theme: 'volcanic' },
        { name: "Древний медный дракон", hp: 275, ac: 19, hit: 11, dmgD: 12, dmgC: 2, dmgMod: 7, xp: 15000, gold: 800, seed: "Copp", traits: ['nimble'], atk: 2, dmgType: 'acid', abilities: ['dragon_presence', 'copper_acid_breath', 'copper_slow_breath'], theme: 'desert' }
    ],
    // 16 — Бездна, БОСС (без вариаций)
    [
        { name: "ЛОРД БЕЗДНЫ (БОСС)", hp: 350, ac: 20, hit: 12, dmgD: 10, dmgMod: 8, xp: 15000, gold: 2000, seed: "Boss", traits: ['lifesteal', 'reckless'], atk: 3, dmgType: 'necrotic', abilities: ['boss_dread', 'boss_void_blast', 'boss_soul_drain'], theme: 'abyss' }
    ]
];

// Совместимость: код, которому нужен просто "типичный враг этапа" для
// баланса наград (events.js, settlement.js) или запасной местности
// (terrain.js), берёт первую (исходную) особь из пула — числа там не
// изменились ни на йоту относительно прежней единственной таблицы.
export const stageConfigs = stagePools.map(pool => pool[0]);

// Плавная кривая золота для наград/цен вне боя (события, поселения, кузнец).
// Специально НЕ привязана к stageConfigs[].gold — та таблица скачет очень
// неравномерно (15 → 2000 к 16 этажу), из-за чего проценты от неё давали
// абсурдные числа поздней игры (тысячи золота за мелкое поручение,
// предметы по 5000+). Эта кривая растёт плавно и предсказуемо.
export function goldScale(stage) {
    return 10 + stage * 10 + Math.pow(stage, 1.5) * 2;
}

export const enemyState = {
    current: null,
    generate(stage, isElite = false, variantIdx = 0) {
        const pool = stagePools[stage - 1] || stagePools[stagePools.length - 1];
        const config = pool[variantIdx] || pool[0];
        
        const hpMult = isElite ? 1.5 : 1;
        const goldMult = isElite ? 2 : 1;

        let actualGold = 0; let goldCritMsg = null;
        const luckRoll = roll(20);
        
        if (luckRoll === 20) {
            actualGold = Math.floor((config.gold * goldMult) * (1.5 + Math.random())); 
            goldCritMsg = `<span style="color:#ffd700; text-shadow: 0 0 5px #d84b20;">🌟 ДЖЕКПОТ (d20: 20)! Враг обронил тугой кошель! (+${actualGold} 💰)</span>`;
        } else if (luckRoll === 1) {
            actualGold = 0;
            goldCritMsg = `<span style="color:#9e9e9e;">💔 Неудача (d20: 1)... Враг оказался нищим. (0 💰)</span>`;
        } else {
            const variance = 0.8 + (Math.random() * 0.4);
            actualGold = Math.max(1, Math.floor((config.gold * goldMult) * variance));
        }

        this.current = { 
            name: (isElite ? "Элитный " : "") + config.name, 
            maxHp: Math.floor(config.hp * hpMult), hp: Math.floor(config.hp * hpMult), 
            ac: config.ac + (isElite ? 1 : 0), hitMod: config.hit + (isElite ? 1 : 0), 
            dmgD: config.dmgD, dmgC: config.dmgC || 1, dmgMod: config.dmgMod, 
            dmgType: config.dmgType || 'bludgeoning', // тип урона атаки — см. damageTypeMeta
            attacks: config.atk || 1, // число ударов за ход (Мультиатака) — см. комментарий у stageConfigs
            xpGiven: isElite ? config.xp * 2 : config.xp, 
            goldGiven: actualGold, goldCritMsg: goldCritMsg, 
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${config.seed}${stage}`,
            traits: config.traits || [],
            hitByFire: false, usedFortitude: false,

            // --- Особые способности (см. abilities.js) ---
            // Сл спасбросков врага = 8 + бонус мастерства этапа + ⅓ мод. урона (+1 у элиты);
            // у отдельных способностей может быть своя надбавка dcBonus.
            saveDc: 8 + (Math.ceil(stage / 4) + 1) + Math.floor((config.dmgMod || 0) / 3) + (isElite ? 1 : 0),
            // Состояние способностей: ready — для «Перезарядки», usesLeft — для «N раз за бой»
            abilities: (config.abilities || []).map(id => ({
                id, ready: true,
                usesLeft: (abilityCatalog[id] && abilityCatalog[id].uses != null) ? abilityCatalog[id].uses : null
            })),
            heads: config.heads ? { ...config.heads } : null, // Гидра: порог урона за раунд и макс. число голов
            turnFlags: {}, hpAtRoundStart: Math.floor(config.hp * hpMult),
            stolenGold: 0, frenzied: false, deathDone: false
        };
    }
};
