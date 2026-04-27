import { roll, xpThresholds, slotLevelByVesselLevel } from './utils.js';

export const gameState = { stage: 1, maxStage: 16, turn: 'player', inCombat: false, isAnimating: false };

export const player = {
    level: 1, xp: 0, gold: 0,
    conMod: 3, chaMod: 3, dexMod: 0, bonusAc: 0,
    maxHp: 13, hp: 13, tempHp: 0,
    
    get ac() { return 10 + this.conMod + this.chaMod + this.bonusAc; }, 
    get pb() { return Math.ceil(this.level / 4) + 1; },  
    get hitMod() { return this.pb + this.chaMod; },      
    get dmgMod() { return this.chaMod; },
    get dmgDie() { return this.level >= 17 ? 12 : (this.level >= 11 ? 10 : (this.level >= 5 ? 8 : 6)); }, 
    get attacksPerAction() { return this.level >= 5 ? 2 : 1; }, 
    get xpNeeded() { return xpThresholds[this.level] || 999999; },

    get maxGiantStrikeCharges() { return this.pb; }, currentGiantStrikeCharges: 2,
    get maxSpellSlots() { return this.level >= 2 ? 2 : 0; }, spellSlots: 0,
    get slotLevel() { return slotLevelByVesselLevel[this.level] || 1; },

    // НОВОЕ: Инвентарь зелий
    inventory: { heal: 0, elixir: 0 },

    archonActive: false, actions: 1, bonusActions: 1, fireStrikeUsedThisTurn: false, attackedThisTurn: false,

    reset: function() {
        this.level = 1; this.xp = 0; this.gold = 0; this.bonusAc = 0;
        this.conMod = 3; this.chaMod = 3;
        this.maxHp = 10 + this.conMod; this.hp = this.maxHp; this.tempHp = 0;
        this.currentGiantStrikeCharges = this.maxGiantStrikeCharges;
        this.spellSlots = this.maxSpellSlots; this.archonActive = false;
        this.inventory = { heal: 0, elixir: 0 }; // Сброс инвентаря
    },

    checkLevelUp: function() {
        let msgs =[];
        while (this.xp >= this.xpNeeded && this.level < 10) {
            this.level++;
            const hpGain = roll(10) + this.conMod;
            this.maxHp += hpGain; this.hp = this.maxHp; 
            
            let msg = `<b>🎉 УРОВЕНЬ ПОВЫШЕН ДО ${this.level}!</b> Макс. ХП увеличено на ${hpGain}. Здоровье восстановлено.`;
            if (this.level === 2) msg += `<br>🔥 <b>Магия Сосуда:</b> 2 ячейки заклинаний. Реакция "Адское возмездие"!`;
            if (this.level === 3) msg += `<br>🌋 <b>Форма Архонта:</b> Доступно превращение. Базовые удары наносят <span class="dmg-fire">Огонь</span>!`;
            if (this.level === 4 || this.level === 8) { this.chaMod += 1; msg += `<br>🌟 <b>Улучшение:</b> Мод. Харизмы +${this.chaMod}. AC: ${this.ac}.`; }
            if (this.level === 5) msg += `<br>⚔️ <b>Доп. атака</b> (2 удара) и кость урона <b>1d8</b>! Ячейки 2-го уровня.`;
            if (this.level === 6) msg += `<br>🔥 <b>Мощь Древних:</b> В форме Архонта броски огня 1 и 2 считаются как 3!`;
            if (this.level === 7) msg += `<br>⚡ <b>Контролируемое превращение:</b> Архонт бесплатен в начале боя!`;
            if (this.level === 9) msg += `<br>📈 <b>Бонус мастерства</b> +${this.pb}. Ячейки 3-го уровня!`;
            msgs.push(msg);
        }
        return msgs;
    }
};

const stageConfigs =[
    { name: "Гигантская крыса", hp: 10, ac: 11, hit: 2, dmgD: 4, dmgMod: 1, xp: 100, gold: 15, seed: "Rat", traits: [] }, 
    { name: "Гоблин-грабитель", hp: 15, ac: 12, hit: 3, dmgD: 6, dmgMod: 2, xp: 100, gold: 20, seed: "Gobl", traits: ['nimble'] }, 
    { name: "Вожак гоблинов", hp: 25, ac: 13, hit: 4, dmgD: 6, dmgMod: 2, xp: 150, gold: 40, seed: "GobB", traits:['nimble'] }, 
    { name: "Скелет-воин", hp: 30, ac: 13, hit: 4, dmgD: 6, dmgMod: 2, xp: 200, gold: 30, seed: "Skel", traits:['undead_fortitude'] }, 
    { name: "Упырь", hp: 40, ac: 13, hit: 4, dmgD: 8, dmgMod: 2, xp: 250, gold: 50, seed: "Ghoul", traits: ['lifesteal'] }, 
    { name: "Теневой дух", hp: 45, ac: 13, hit: 5, dmgD: 8, dmgMod: 3, xp: 200, gold: 40, seed: "Shad", traits:[] }, 
    { name: "Орк-берсерк", hp: 65, ac: 13, hit: 5, dmgD: 10, dmgMod: 3, xp: 800, gold: 80, seed: "Orc", traits:['reckless'] }, 
    { name: "Тролль", hp: 85, ac: 14, hit: 6, dmgD: 10, dmgMod: 4, xp: 1000, gold: 100, seed: "Trol", traits: ['regeneration'] }, 
    { name: "Демон-охотник", hp: 110, ac: 14, hit: 6, dmgD: 8, dmgC: 2, dmgMod: 4, xp: 1500, gold: 150, seed: "Dem", traits:['fire_resistance'] }, 
    { name: "Огненный Элементаль", hp: 130, ac: 15, hit: 7, dmgD: 10, dmgC: 2, dmgMod: 4, xp: 2500, gold: 200, seed: "Fire", traits:['fire_immunity'] }, 
    { name: "Рыцарь смерти", hp: 150, ac: 16, hit: 8, dmgD: 12, dmgC: 2, dmgMod: 5, xp: 4000, gold: 250, seed: "Kni", traits:[] }, 
    { name: "Гидра", hp: 180, ac: 15, hit: 8, dmgD: 10, dmgC: 3, dmgMod: 5, xp: 4000, gold: 300, seed: "Hydra", traits:['regeneration'] }, 
    { name: "Высший вампир", hp: 200, ac: 17, hit: 9, dmgD: 12, dmgC: 2, dmgMod: 5, xp: 9000, gold: 400, seed: "Vamp", traits:['lifesteal', 'nimble'] }, 
    { name: "Дьявол ямы", hp: 240, ac: 18, hit: 10, dmgD: 12, dmgC: 3, dmgMod: 6, xp: 11000, gold: 500, seed: "Pit", traits:['fire_immunity'] }, 
    { name: "Древний красный дракон", hp: 280, ac: 19, hit: 11, dmgD: 12, dmgC: 4, dmgMod: 7, xp: 15000, gold: 800, seed: "Drag", traits:['fire_immunity'] }, 
    { name: "ЛОРД БЕЗДНЫ (БОСС)", hp: 350, ac: 20, hit: 12, dmgD: 10, dmgC: 4, dmgMod: 8, xp: 15000, gold: 2000, seed: "Boss", traits:['lifesteal', 'reckless'] } 
];

export const enemyState = {
    current: null,
    generate(stage) {
        const config = stageConfigs[stage - 1];
        
        let actualGold = 0; let goldCritMsg = null;
        const luckRoll = roll(20);
        
        if (luckRoll === 20) {
            actualGold = Math.floor(config.gold * (1.5 + Math.random())); 
            goldCritMsg = `<span style="color:#ffd700; text-shadow: 0 0 5px #d84b20;">🌟 ДЖЕКПОТ (d20: 20)! Враг обронил тугой кошель! (+${actualGold} 💰)</span>`;
        } else if (luckRoll === 1) {
            actualGold = 0;
            goldCritMsg = `<span style="color:#9e9e9e;">💔 Неудача (d20: 1)... Пустые карманы. Враг оказался нищим. (0 💰)</span>`;
        } else {
            const variance = 0.8 + (Math.random() * 0.4);
            actualGold = Math.max(1, Math.floor(config.gold * variance));
        }

        this.current = { 
            name: config.name, maxHp: config.hp, hp: config.hp, 
            ac: config.ac, hitMod: config.hit, dmgD: config.dmgD, dmgC: config.dmgC || 1, dmgMod: config.dmgMod, 
            xpGiven: config.xp, goldGiven: actualGold, goldCritMsg: goldCritMsg, 
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${config.seed}${stage}`,
            traits: config.traits ||[],
            hitByFire: false, usedFortitude: false
        };
    }
};
