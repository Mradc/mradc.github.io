export const TIMINGS = { strikeDelay: 500, enemyTurnStart: 1500, enemyTurnEnd: 1000, stageTransition: 2500, gameOver: 1500 };

export const roll = (sides, count = 1) => {
    let total = 0;
    for(let i=0; i<count; i++) total += Math.floor(Math.random() * sides) + 1;
    return total;
};

export const xpThresholds =[0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000];
export const slotLevelByVesselLevel =[0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3];