export const TIMINGS = { strikeDelay: 500, enemyTurnStart: 1500, enemyTurnEnd: 1000, stageTransition: 2500, gameOver: 1500 };

export const roll = (sides, count = 1) => {
    let total = 0;
    for(let i=0; i<count; i++) total += Math.floor(Math.random() * sides) + 1;
    return total;
};

export const xpThresholds =[0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000];
export const slotLevelByVesselLevel =[0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3];

// Зелья лечения по редкости (как в ДнД 5е): кости, средний хил и цена в магазине.
// Улучшение в магазине заменяет ВСЕ зелья лечения в поясе на новый (более сильный) вид.
export const healPotionTiers =[
    { id: 0, name: 'Зелье лечения', rarity: 'Обычное',      diceCount: 2,  diceSides: 4, bonus: 2,  price: 10 },
    { id: 1, name: 'Большое зелье лечения', rarity: 'Необычное',    diceCount: 4,  diceSides: 4, bonus: 4,  price: 60 },
    { id: 2, name: 'Превосходное зелье лечения', rarity: 'Редкое',       diceCount: 8,  diceSides: 4, bonus: 8,  price: 140 },
    { id: 3, name: 'Высшее зелье лечения', rarity: 'Очень редкое', diceCount: 10, diceSides: 4, bonus: 20, price: 250 }
];