// ===================================================================
// ПРОЦЕДУРНАЯ МЕСТНОСТЬ ПОД КАРТОЙ ОБЛАСТИ
//
// Этот модуль НЕ участвует в механике: он ничего не знает про
// взаимодействия, блокировки и переходы. Он получает готовый список
// точек (их координаты задаёт map.js — сетка 3x3 со смещением) и
// рисует под ними SVG-ландшафт: рельеф, биомы, дороги между точками,
// постройки и атмосферу.
//
// Всё детерминировано: зерно считается из номера этапа и координат
// точек, поэтому местность не «дрожит» при перерисовке карты и
// полностью восстанавливается после перезахода в игру.
// ===================================================================

// ---------- Детерминированный генератор случайных чисел ----------
function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

function makeRng(seed) {
    let a = seed >>> 0;
    const next = () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        range: (min, max) => min + next() * (max - min),
        int: (min, max) => Math.floor(min + next() * (max - min + 1)),
        pick: arr => arr[Math.floor(next() * arr.length)],
        chance: p => next() < p,
        sign: () => (next() < 0.5 ? -1 : 1)
    };
}

const n = v => Math.round(v * 10) / 10;

// Выбор из списка [значение, вес]
function weighted(list, r) {
    let total = 0;
    for (const item of list) total += item[1];
    let roll = r.next() * total;
    for (const item of list) { roll -= item[1]; if (roll <= 0) return item[0]; }
    return list[list.length - 1][0];
}

// ===================================================================
// ТЕМЫ МЕСТНОСТИ
// ===================================================================
const THEMES = {
    meadow: {
        label: 'Предгорья и луга',
        sky: ['#1f2a1b', '#151d13'], alt: '#25331d', patch: '#2c3d22',
        road: '#6b5738', roadEdge: '#453520', soil: '#3a2f1f',
        water: '#1d3b48', waterLight: '#2d6076',
        rock: '#3b4148', rockLight: '#4e5760',
        canopy: ['#3c7a3f', '#336b35', '#478a46'], trunk: '#44311f',
        wood: '#4a3622', roof: '#6b4b2c', stone: '#4a4f55',
        fog: 'rgba(200,220,190,0.05)', mote: '#a5d178', moteCount: 10,
        density: 1.0,
        props: [['tree', 34], ['bush', 20], ['grass', 26], ['rock', 8], ['stump', 4], ['flower', 8]],
        regions: [['water', 1], ['field', 2], ['grove', 2]]
    },
    forest: {
        label: 'Густой лес',
        sky: ['#18251a', '#101710'], alt: '#1d2c1c', patch: '#24351f',
        road: '#5d4b30', roadEdge: '#3b2f1c', soil: '#332a1c',
        water: '#1b3540', waterLight: '#2b5666',
        rock: '#353b3a', rockLight: '#485150',
        canopy: ['#2f6134', '#27522b', '#3a7440'], trunk: '#3b2a1c',
        wood: '#41301e', roof: '#5b4026', stone: '#454a49',
        fog: 'rgba(180,210,180,0.06)', mote: '#9fd07a', moteCount: 12,
        density: 1.45,
        props: [['pine', 30], ['tree', 26], ['bush', 16], ['grass', 12], ['mushroom', 6], ['log', 6], ['rock', 4]],
        regions: [['grove', 3], ['water', 1], ['clearing', 1]]
    },
    graveyard: {
        label: 'Мёртвые земли',
        sky: ['#1e2023', '#141519'], alt: '#24262a', patch: '#2a2b2f',
        road: '#4d4740', roadEdge: '#332f2a', soil: '#2e2a26',
        water: '#20303a', waterLight: '#2e4b58',
        rock: '#3a3d42', rockLight: '#4c5158',
        canopy: ['#2e3330', '#272b29', '#353a36'], trunk: '#332f2a',
        wood: '#3a342c', roof: '#44403a', stone: '#585e66',
        fog: 'rgba(160,180,190,0.09)', mote: '#c3d2d6', moteCount: 14,
        density: 1.1,
        props: [['grave', 26], ['cross', 16], ['deadTree', 18], ['bone', 12], ['rock', 10], ['grass', 10], ['ruinWall', 8]],
        regions: [['graves', 2], ['ruinField', 2], ['water', 1]]
    },
    haunted: {
        label: 'Проклятые земли',
        sky: ['#1d1726', '#120f19'], alt: '#231b2e', patch: '#291f35',
        road: '#4a4152', roadEdge: '#2f2838', soil: '#2b2335',
        water: '#231f45', waterLight: '#3a3570',
        rock: '#38333f', rockLight: '#4b4554',
        canopy: ['#2c2b3a', '#25242f', '#353349'], trunk: '#312a36',
        wood: '#3a3142', roof: '#473a55', stone: '#55506b',
        fog: 'rgba(180,160,220,0.10)', mote: '#c9a7ea', moteCount: 16,
        density: 1.0,
        props: [['deadTree', 26], ['column', 14], ['ruinWall', 14], ['grave', 12], ['crystal', 10], ['bone', 10], ['rock', 8], ['grass', 6]],
        regions: [['ruinField', 2], ['graves', 1], ['water', 1]]
    },
    highland: {
        label: 'Скалистые нагорья',
        sky: ['#282520', '#1a1816'], alt: '#2e2a24', patch: '#37312a',
        road: '#6a5a44', roadEdge: '#443a2b', soil: '#463a2a',
        water: '#20404c', waterLight: '#31687c',
        rock: '#4a4740', rockLight: '#655f54',
        canopy: ['#3a5c3a', '#31502f', '#436a40'], trunk: '#4a3626',
        wood: '#53402a', roof: '#6d5231', stone: '#5c574e',
        fog: 'rgba(210,205,190,0.06)', mote: '#d8cdb4', moteCount: 10,
        density: 1.2,
        props: [['boulder', 28], ['rock', 24], ['pine', 16], ['grass', 12], ['bone', 6], ['stump', 6], ['tent', 4], ['spikes', 4]],
        regions: [['ridge', 3], ['field', 1], ['water', 1]]
    },
    swamp: {
        label: 'Гнилые топи',
        sky: ['#1b2420', '#121815'], alt: '#202c24', patch: '#26332a',
        road: '#4f4630', roadEdge: '#322c1e', soil: '#2d2a1e',
        water: '#1f3a2c', waterLight: '#356b4a',
        rock: '#343a36', rockLight: '#47504a',
        canopy: ['#33563a', '#2a4831', '#3d6742'], trunk: '#38301f',
        wood: '#3f3421', roof: '#4e3f26', stone: '#464c48',
        fog: 'rgba(150,190,160,0.10)', mote: '#8fd6a0', moteCount: 14,
        density: 1.25,
        props: [['deadTree', 24], ['reed', 22], ['bush', 14], ['mushroom', 10], ['log', 10], ['rock', 8], ['bone', 6], ['grass', 6]],
        regions: [['water', 3], ['grove', 1]]
    },
    ashen: {
        label: 'Выжженные земли',
        sky: ['#261915', '#170f0d'], alt: '#2c1d18', patch: '#33231b',
        road: '#5a4234', roadEdge: '#38261d', soil: '#3a271d',
        water: '#4a2415', waterLight: '#a8421a',
        rock: '#3a3230', rockLight: '#514744',
        canopy: ['#3a2a22', '#33241d', '#46332a'], trunk: '#332420',
        wood: '#432e22', roof: '#5a3a26', stone: '#4e4644',
        fog: 'rgba(230,170,120,0.07)', mote: '#ff9c4a', moteCount: 18,
        density: 1.0,
        props: [['deadTree', 22], ['emberRock', 20], ['rock', 16], ['ashMound', 16], ['bone', 12], ['ruinWall', 8], ['spikes', 6]],
        regions: [['cracks', 2], ['lava', 1], ['ruinField', 1]]
    },
    volcanic: {
        label: 'Вулканические пустоши',
        sky: ['#2b1310', '#150a09'], alt: '#331714', patch: '#3b1d16',
        road: '#5c3527', roadEdge: '#351d16', soil: '#3d211a',
        water: '#802c10', waterLight: '#ff7a24',
        rock: '#332b2b', rockLight: '#4a3e3d',
        canopy: ['#3a221e', '#2f1c19', '#452a24'], trunk: '#2e1e1b',
        wood: '#472a20', roof: '#5d3421', stone: '#4a4040',
        fog: 'rgba(255,140,70,0.09)', mote: '#ffb14a', moteCount: 24,
        density: 1.05,
        props: [['emberRock', 28], ['rock', 22], ['ashMound', 16], ['deadTree', 12], ['bone', 10], ['spikes', 6], ['crystal', 6]],
        regions: [['lava', 3], ['cracks', 2], ['ridge', 1]]
    },
    ruins: {
        label: 'Павшая крепость',
        sky: ['#232320', '#161615'], alt: '#2a2a26', patch: '#31312c',
        road: '#645c4c', roadEdge: '#3f392f', soil: '#3b362e',
        water: '#233a44', waterLight: '#325b6b',
        rock: '#43423d', rockLight: '#5a584f',
        canopy: ['#38453a', '#2f3b31', '#415041'], trunk: '#3b342a',
        wood: '#4a3f2e', roof: '#5c4b34', stone: '#6a675d',
        fog: 'rgba(200,200,190,0.07)', mote: '#cdc9b8', moteCount: 12,
        density: 1.15,
        props: [['ruinWall', 24], ['column', 20], ['rock', 16], ['grave', 10], ['bone', 10], ['deadTree', 10], ['grass', 10]],
        regions: [['ruinField', 3], ['field', 1], ['water', 1]]
    },
    desert: {
        label: 'Пески и руины',
        sky: ['#3a2d1e', '#251c12'], alt: '#41331f', patch: '#4a3a24',
        road: '#7a6440', roadEdge: '#4e3e26', soil: '#553f25',
        water: '#2a4a4a', waterLight: '#3f7a72',
        rock: '#5b4c36', rockLight: '#75644a',
        canopy: ['#4a6a3a', '#3e5a31', '#567a42'], trunk: '#4b3a22',
        wood: '#5e4a2c', roof: '#7d6238', stone: '#78684a',
        fog: 'rgba(240,220,170,0.07)', mote: '#e8d199', moteCount: 14,
        density: 0.9,
        props: [['dune', 24], ['sandRock', 22], ['cactus', 14], ['bone', 14], ['column', 12], ['ruinWall', 10], ['grass', 4]],
        regions: [['dunes', 3], ['ruinField', 2]]
    },
    abyss: {
        label: 'Бездна',
        sky: ['#181026', '#0a0711'], alt: '#1e1430', patch: '#241838',
        road: '#4a3a66', roadEdge: '#2b2040', soil: '#281c3d',
        water: '#2a1150', waterLight: '#7a3bd6',
        rock: '#332a44', rockLight: '#473a5e',
        canopy: ['#2c2440', '#241d35', '#392f52'], trunk: '#2b2340',
        wood: '#392c52', roof: '#4a3768', stone: '#5a4c7a',
        fog: 'rgba(170,120,240,0.12)', mote: '#c08cff', moteCount: 26,
        density: 0.95,
        props: [['crystal', 30], ['rock', 22], ['bone', 16], ['column', 12], ['deadTree', 10], ['spikes', 10]],
        regions: [['void', 3], ['ridge', 1], ['ruinField', 1]]
    }
};

// Тема всей области — то, что реально определяет вид местности. Раньше
// её вычисляли по номеру этапа (гадая по названию/чертам "типичного"
// врага); теперь у каждой особи в stagePools (state.js) есть явное поле
// theme, и map.js прокидывает его сюда как enemyTheme боевой точки —
// именно она и решает, каким быть этой области на вид, а не этап.
// combat/combat_elite в одной области всегда делят одного зверя (см.
// map.js), так что достаточно взять тему первой попавшейся боевой точки.
function pickAreaTheme(sites) {
    const combatSite = sites.find(s => s.enemyTheme && THEMES[s.enemyTheme]);
    return combatSite ? combatSite.enemyTheme : 'meadow';
}

// ===================================================================
// ГЕОМЕТРИЯ
// ===================================================================
function blobPath(cx, cy, rx, ry, pts, wobble, r) {
    const coords = [];
    for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const k = 1 + r.range(-wobble, wobble);
        coords.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    let d = `M${n(coords[0][0])} ${n(coords[0][1])}`;
    for (let i = 0; i < coords.length; i++) {
        const cur = coords[i], nx = coords[(i + 1) % coords.length];
        const mx = (cur[0] + nx[0]) / 2, my = (cur[1] + nx[1]) / 2;
        d += ` Q${n(cur[0])} ${n(cur[1])} ${n(mx)} ${n(my)}`;
    }
    return d + 'Z';
}

function polyRock(cx, cy, rx, ry, r) {
    const pts = [];
    const count = r.int(5, 7);
    for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + r.range(-0.2, 0.2);
        pts.push(`${n(cx + Math.cos(a) * rx * r.range(0.75, 1.15))},${n(cy + Math.sin(a) * ry * r.range(0.7, 1.1))}`);
    }
    return pts.join(' ');
}

function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = dx * dx + dy * dy;
    let t = len === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ===================================================================
// ОБЪЕКТЫ ОКРУЖЕНИЯ
// Каждая функция рисует один предмет "стоящим" на точке (x, y).
// ===================================================================
const PROPS = {
    tree(x, y, s, r, t) {
        const h = s * 1.5, c = r.pick(t.canopy);
        return `<g><rect x="${n(x - s * 0.1)}" y="${n(y - h * 0.55)}" width="${n(s * 0.2)}" height="${n(h * 0.55)}" fill="${t.trunk}"/>`
            + `<ellipse cx="${n(x)}" cy="${n(y - h * 0.72)}" rx="${n(s * 0.62)}" ry="${n(s * 0.55)}" fill="${c}"/>`
            + `<ellipse cx="${n(x - s * 0.4)}" cy="${n(y - h * 0.55)}" rx="${n(s * 0.42)}" ry="${n(s * 0.38)}" fill="${c}" opacity="0.9"/>`
            + `<ellipse cx="${n(x + s * 0.38)}" cy="${n(y - h * 0.58)}" rx="${n(s * 0.4)}" ry="${n(s * 0.36)}" fill="${c}" opacity="0.8"/>`
            + `<ellipse cx="${n(x - s * 0.18)}" cy="${n(y - h * 0.85)}" rx="${n(s * 0.3)}" ry="${n(s * 0.24)}" fill="#fff" opacity="0.06"/></g>`;
    },
    pine(x, y, s, r, t) {
        const h = s * 1.9, w = s * 0.62, c = r.pick(t.canopy);
        return `<g><rect x="${n(x - s * 0.08)}" y="${n(y - h * 0.32)}" width="${n(s * 0.16)}" height="${n(h * 0.32)}" fill="${t.trunk}"/>`
            + `<path d="M${n(x)} ${n(y - h)} L${n(x + w * 0.75)} ${n(y - h * 0.55)} L${n(x - w * 0.75)} ${n(y - h * 0.55)}Z" fill="${c}"/>`
            + `<path d="M${n(x)} ${n(y - h * 0.78)} L${n(x + w)} ${n(y - h * 0.28)} L${n(x - w)} ${n(y - h * 0.28)}Z" fill="${c}" opacity="0.92"/>`
            + `<path d="M${n(x)} ${n(y - h * 0.5)} L${n(x + w * 1.15)} ${n(y)} L${n(x - w * 1.15)} ${n(y)}Z" fill="${c}" opacity="0.82"/></g>`;
    },
    deadTree(x, y, s, r, t) {
        const h = s * 1.8;
        let g = `<path d="M${n(x)} ${n(y)} L${n(x + r.range(-2, 2))} ${n(y - h)}" stroke="${t.trunk}" stroke-width="${n(s * 0.16)}" fill="none" stroke-linecap="round"/>`;
        for (let i = 0; i < 4; i++) {
            const by = y - h * r.range(0.35, 0.95), dir = r.sign();
            g += `<path d="M${n(x)} ${n(by)} Q${n(x + dir * s * 0.4)} ${n(by - s * 0.12)} ${n(x + dir * s * r.range(0.5, 0.85))} ${n(by - s * r.range(0.3, 0.6))}" stroke="${t.trunk}" stroke-width="${n(s * 0.09)}" fill="none" stroke-linecap="round"/>`;
        }
        return `<g>${g}</g>`;
    },
    bush(x, y, s, r, t) {
        const c = r.pick(t.canopy);
        return `<g><ellipse cx="${n(x)}" cy="${n(y - s * 0.22)}" rx="${n(s * 0.5)}" ry="${n(s * 0.34)}" fill="${c}"/>`
            + `<ellipse cx="${n(x - s * 0.28)}" cy="${n(y - s * 0.1)}" rx="${n(s * 0.3)}" ry="${n(s * 0.22)}" fill="${c}" opacity="0.85"/>`
            + `<ellipse cx="${n(x + s * 0.26)}" cy="${n(y - s * 0.12)}" rx="${n(s * 0.28)}" ry="${n(s * 0.2)}" fill="${c}" opacity="0.8"/></g>`;
    },
    grass(x, y, s, r, t) {
        let g = '';
        for (let i = 0; i < 4; i++) {
            const dx = r.range(-s * 0.35, s * 0.35);
            g += `<path d="M${n(x + dx)} ${n(y)} Q${n(x + dx + r.sign() * s * 0.15)} ${n(y - s * 0.3)} ${n(x + dx + r.sign() * s * 0.22)} ${n(y - s * r.range(0.35, 0.6))}" stroke="${r.pick(t.canopy)}" stroke-width="${n(s * 0.07)}" fill="none" opacity="0.75" stroke-linecap="round"/>`;
        }
        return `<g>${g}</g>`;
    },
    flower(x, y, s, r, t) {
        return `<g><path d="M${n(x)} ${n(y)} L${n(x)} ${n(y - s * 0.4)}" stroke="${t.canopy[0]}" stroke-width="${n(s * 0.06)}"/>`
            + `<circle cx="${n(x)}" cy="${n(y - s * 0.45)}" r="${n(s * 0.11)}" fill="${r.pick(['#e6c86a', '#d98fb0', '#e8e0c0'])}" opacity="0.85"/></g>`;
    },
    mushroom(x, y, s, r, t) {
        return `<g><rect x="${n(x - s * 0.06)}" y="${n(y - s * 0.28)}" width="${n(s * 0.12)}" height="${n(s * 0.28)}" fill="#c9bfa5" opacity="0.7"/>`
            + `<ellipse cx="${n(x)}" cy="${n(y - s * 0.3)}" rx="${n(s * 0.22)}" ry="${n(s * 0.14)}" fill="${r.pick(['#8e4b3a', '#7a5ea8', '#a06a3c'])}" opacity="0.85"/></g>`;
    },
    rock(x, y, s, r, t) {
        return `<g><polygon points="${polyRock(x, y - s * 0.22, s * 0.45, s * 0.34, r)}" fill="${t.rock}"/>`
            + `<polygon points="${polyRock(x - s * 0.08, y - s * 0.32, s * 0.24, s * 0.16, r)}" fill="${t.rockLight}" opacity="0.55"/></g>`;
    },
    boulder(x, y, s, r, t) {
        return `<g><polygon points="${polyRock(x, y - s * 0.45, s * 0.8, s * 0.6, r)}" fill="${t.rock}"/>`
            + `<polygon points="${polyRock(x - s * 0.16, y - s * 0.62, s * 0.42, s * 0.3, r)}" fill="${t.rockLight}" opacity="0.5"/>`
            + `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(s * 0.85)}" ry="${n(s * 0.16)}" fill="#000" opacity="0.22"/></g>`;
    },
    sandRock(x, y, s, r, t) {
        return `<g><polygon points="${polyRock(x, y - s * 0.35, s * 0.7, s * 0.45, r)}" fill="${t.rock}"/>`
            + `<path d="M${n(x - s * 0.6)} ${n(y - s * 0.35)} L${n(x + s * 0.6)} ${n(y - s * 0.4)}" stroke="${t.rockLight}" stroke-width="${n(s * 0.08)}" opacity="0.6"/></g>`;
    },
    emberRock(x, y, s, r, t) {
        return `<g><polygon points="${polyRock(x, y - s * 0.32, s * 0.55, s * 0.42, r)}" fill="#241a18"/>`
            + `<path d="M${n(x - s * 0.3)} ${n(y - s * 0.2)} L${n(x)} ${n(y - s * 0.45)} L${n(x + s * 0.25)} ${n(y - s * 0.18)}" stroke="${t.waterLight}" stroke-width="${n(s * 0.09)}" fill="none" opacity="0.9"/></g>`;
    },
    ashMound(x, y, s, r, t) {
        return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(s * 0.7)}" ry="${n(s * 0.22)}" fill="${t.patch}" opacity="0.8"/>`;
    },
    dune(x, y, s, r, t) {
        return `<path d="M${n(x - s * 1.3)} ${n(y)} Q${n(x)} ${n(y - s * 0.55)} ${n(x + s * 1.3)} ${n(y)}Z" fill="${t.patch}" opacity="0.75"/>`;
    },
    stump(x, y, s, r, t) {
        return `<g><rect x="${n(x - s * 0.2)}" y="${n(y - s * 0.3)}" width="${n(s * 0.4)}" height="${n(s * 0.3)}" fill="${t.trunk}"/>`
            + `<ellipse cx="${n(x)}" cy="${n(y - s * 0.3)}" rx="${n(s * 0.2)}" ry="${n(s * 0.09)}" fill="${t.wood}"/></g>`;
    },
    log(x, y, s, r, t) {
        const a = r.range(-0.3, 0.3);
        return `<g transform="rotate(${n(a * 40)} ${n(x)} ${n(y)})"><rect x="${n(x - s * 0.6)}" y="${n(y - s * 0.16)}" width="${n(s * 1.2)}" height="${n(s * 0.22)}" rx="${n(s * 0.11)}" fill="${t.trunk}"/>`
            + `<ellipse cx="${n(x + s * 0.6)}" cy="${n(y - s * 0.05)}" rx="${n(s * 0.08)}" ry="${n(s * 0.11)}" fill="${t.wood}"/></g>`;
    },
    reed(x, y, s, r, t) {
        let g = '';
        for (let i = 0; i < 3; i++) {
            const dx = r.range(-s * 0.3, s * 0.3), h = s * r.range(0.6, 1.0);
            g += `<path d="M${n(x + dx)} ${n(y)} L${n(x + dx + r.range(-2, 2))} ${n(y - h)}" stroke="${t.canopy[1]}" stroke-width="${n(s * 0.07)}" stroke-linecap="round"/>`
                + `<ellipse cx="${n(x + dx)}" cy="${n(y - h)}" rx="${n(s * 0.06)}" ry="${n(s * 0.13)}" fill="${t.trunk}" opacity="0.8"/>`;
        }
        return `<g>${g}</g>`;
    },
    cactus(x, y, s, r, t) {
        return `<g><rect x="${n(x - s * 0.13)}" y="${n(y - s * 1.1)}" width="${n(s * 0.26)}" height="${n(s * 1.1)}" rx="${n(s * 0.13)}" fill="${t.canopy[0]}"/>`
            + `<rect x="${n(x + s * 0.13)}" y="${n(y - s * 0.8)}" width="${n(s * 0.3)}" height="${n(s * 0.16)}" rx="${n(s * 0.08)}" fill="${t.canopy[1]}"/>`
            + `<rect x="${n(x + s * 0.3)}" y="${n(y - s * 0.95)}" width="${n(s * 0.15)}" height="${n(s * 0.3)}" rx="${n(s * 0.07)}" fill="${t.canopy[1]}"/></g>`;
    },
    grave(x, y, s, r, t) {
        return `<g><ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(s * 0.5)}" ry="${n(s * 0.14)}" fill="#000" opacity="0.28"/>`
            + `<path d="M${n(x - s * 0.28)} ${n(y - s * 0.05)} L${n(x - s * 0.28)} ${n(y - s * 0.52)} Q${n(x)} ${n(y - s * 0.78)} ${n(x + s * 0.28)} ${n(y - s * 0.52)} L${n(x + s * 0.28)} ${n(y - s * 0.05)}Z" fill="${t.stone}"/>`
            + `<path d="M${n(x - s * 0.12)} ${n(y - s * 0.45)} L${n(x + s * 0.12)} ${n(y - s * 0.45)}" stroke="#000" stroke-width="${n(s * 0.05)}" opacity="0.35"/></g>`;
    },
    cross(x, y, s, r, t) {
        const a = r.range(-8, 8);
        return `<g transform="rotate(${n(a)} ${n(x)} ${n(y)})"><rect x="${n(x - s * 0.07)}" y="${n(y - s * 0.8)}" width="${n(s * 0.14)}" height="${n(s * 0.8)}" fill="${t.stone}"/>`
            + `<rect x="${n(x - s * 0.3)}" y="${n(y - s * 0.62)}" width="${n(s * 0.6)}" height="${n(s * 0.12)}" fill="${t.stone}"/></g>`;
    },
    bone(x, y, s, r, t) {
        return `<g opacity="0.75"><ellipse cx="${n(x)}" cy="${n(y - s * 0.12)}" rx="${n(s * 0.2)}" ry="${n(s * 0.16)}" fill="#cfc8b4"/>`
            + `<rect x="${n(x - s * 0.04)}" y="${n(y - s * 0.08)}" width="${n(s * 0.08)}" height="${n(s * 0.12)}" fill="#cfc8b4"/>`
            + `<circle cx="${n(x - s * 0.07)}" cy="${n(y - s * 0.14)}" r="${n(s * 0.04)}" fill="#20201c"/>`
            + `<circle cx="${n(x + s * 0.07)}" cy="${n(y - s * 0.14)}" r="${n(s * 0.04)}" fill="#20201c"/></g>`;
    },
    column(x, y, s, r, t) {
        const h = s * r.range(0.8, 1.6);
        return `<g><ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(s * 0.4)}" ry="${n(s * 0.12)}" fill="#000" opacity="0.25"/>`
            + `<rect x="${n(x - s * 0.18)}" y="${n(y - h)}" width="${n(s * 0.36)}" height="${n(h)}" fill="${t.stone}"/>`
            + `<rect x="${n(x - s * 0.26)}" y="${n(y - h - s * 0.1)}" width="${n(s * 0.52)}" height="${n(s * 0.12)}" fill="${t.rockLight}"/>`
            + `<path d="M${n(x - s * 0.08)} ${n(y - h * 0.9)} L${n(x - s * 0.08)} ${n(y - h * 0.1)}" stroke="#000" stroke-width="${n(s * 0.04)}" opacity="0.3"/></g>`;
    },
    ruinWall(x, y, s, r, t) {
        const w = s * r.range(0.9, 1.6), h = s * r.range(0.4, 0.8);
        let g = `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(w * 0.6)}" ry="${n(s * 0.12)}" fill="#000" opacity="0.22"/>`;
        g += `<path d="M${n(x - w / 2)} ${n(y)} L${n(x - w / 2)} ${n(y - h)} L${n(x - w * 0.15)} ${n(y - h * 0.75)} L${n(x + w * 0.2)} ${n(y - h)} L${n(x + w / 2)} ${n(y - h * 0.55)} L${n(x + w / 2)} ${n(y)}Z" fill="${t.stone}"/>`;
        for (let i = 0; i < 2; i++) g += `<path d="M${n(x - w / 2)} ${n(y - h * (0.3 + i * 0.28))} L${n(x + w / 2)} ${n(y - h * (0.3 + i * 0.28))}" stroke="#000" stroke-width="${n(s * 0.04)}" opacity="0.28"/>`;
        return `<g>${g}</g>`;
    },
    crystal(x, y, s, r, t) {
        const h = s * r.range(0.7, 1.3);
        return `<g><path d="M${n(x)} ${n(y - h)} L${n(x + s * 0.22)} ${n(y - h * 0.35)} L${n(x + s * 0.1)} ${n(y)} L${n(x - s * 0.14)} ${n(y)} L${n(x - s * 0.24)} ${n(y - h * 0.4)}Z" fill="${t.waterLight}" opacity="0.75"/>`
            + `<path d="M${n(x)} ${n(y - h)} L${n(x + s * 0.22)} ${n(y - h * 0.35)} L${n(x + s * 0.1)} ${n(y)}Z" fill="#fff" opacity="0.14"/></g>`;
    },
    spikes(x, y, s, r, t) {
        let g = '';
        for (let i = 0; i < 3; i++) {
            const dx = (i - 1) * s * 0.28;
            g += `<path d="M${n(x + dx)} ${n(y)} L${n(x + dx + s * 0.07)} ${n(y - s * r.range(0.5, 0.9))} L${n(x + dx + s * 0.14)} ${n(y)}Z" fill="${t.trunk}"/>`;
        }
        return `<g>${g}</g>`;
    },
    tent(x, y, s, r, t) {
        return `<g><path d="M${n(x - s * 0.55)} ${n(y)} L${n(x)} ${n(y - s * 0.8)} L${n(x + s * 0.55)} ${n(y)}Z" fill="${t.roof}"/>`
            + `<path d="M${n(x)} ${n(y - s * 0.8)} L${n(x + s * 0.12)} ${n(y)} L${n(x - s * 0.12)} ${n(y)}Z" fill="#000" opacity="0.4"/></g>`;
    },
    hut(x, y, s, r, t) {
        const w = s * r.range(0.9, 1.15), h = s * 0.55;
        return `<g><ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(w * 0.65)}" ry="${n(s * 0.14)}" fill="#000" opacity="0.28"/>`
            + `<rect x="${n(x - w / 2)}" y="${n(y - h)}" width="${n(w)}" height="${n(h)}" fill="${t.wood}"/>`
            + `<path d="M${n(x - w * 0.62)} ${n(y - h)} L${n(x)} ${n(y - h - s * 0.5)} L${n(x + w * 0.62)} ${n(y - h)}Z" fill="${t.roof}"/>`
            + `<rect x="${n(x - w * 0.12)}" y="${n(y - h * 0.62)}" width="${n(w * 0.24)}" height="${n(h * 0.62)}" fill="#1a1410"/>`
            + `<rect x="${n(x + w * 0.2)}" y="${n(y - h * 0.72)}" width="${n(w * 0.16)}" height="${n(h * 0.3)}" fill="#e0b25c" opacity="0.5"/></g>`;
    }
};

// ===================================================================
// СБОРКА КАРТИНКИ
// ===================================================================
function buildRegions(t, r, W, H, sites, kindList, roadSegs, placed) {
    const out = [];
    const regionDefs = [];
    kindList.forEach(kind => {
        const blocking = (kind === 'water' || kind === 'lava' || kind === 'void');
        const rx = r.range(W * 0.11, blocking ? W * 0.2 : W * 0.23);
        const ry = r.range(H * 0.08, blocking ? H * 0.14 : H * 0.16);

        // Ищем лучшее место: подальше от точек интереса, троп и уже размещённых биомов.
        // Озёра и лавовые разливы не должны наезжать на дороги — иначе тропа
        // выглядит проложенной прямо по воде.
        let cx = W / 2, cy = H / 2, bestScore = -Infinity;
        for (let tries = 0; tries < 46; tries++) {
            const tx = r.range(W * 0.1, W * 0.9), ty = r.range(H * 0.12, H * 0.92);
            let score = Infinity;
            sites.forEach(s => { score = Math.min(score, Math.hypot(s.x - tx, s.y - ty) - rx * 0.9); });
            if (blocking && roadSegs) {
                roadSegs.forEach(sg => { score = Math.min(score, distToSegment(tx, ty, sg[0], sg[1], sg[2], sg[3]) - rx * 0.85); });
            }
            placed.forEach(pr => { score = Math.min(score, Math.hypot(pr.cx - tx, pr.cy - ty) - (pr.rx + rx) * 0.55); });
            if (score > bestScore) { bestScore = score; cx = tx; cy = ty; }
            if (bestScore > W * 0.05) break;
        }
        const region = { kind, cx, cy, rx, ry, inProps: null };
        placed.push(region);

        if (blocking) {
            const fill = kind === 'water' ? t.water : (kind === 'lava' ? t.water : t.water);
            const glow = kind === 'water' ? t.waterLight : t.waterLight;
            let g = `<path d="${blobPath(cx, cy, rx, ry, 9, 0.22, r)}" fill="${t.soil}" opacity="0.6" transform="translate(0,2)"/>`;
            g += `<path d="${blobPath(cx, cy, rx * 0.95, ry * 0.95, 9, 0.2, r)}" fill="${fill}"/>`;
            g += `<path d="${blobPath(cx, cy, rx * 0.58, ry * 0.52, 8, 0.25, r)}" fill="${glow}" opacity="${kind === 'water' ? 0.32 : 0.5}"/>`;
            if (kind !== 'water') g += `<path d="${blobPath(cx, cy, rx * 0.26, ry * 0.24, 7, 0.3, r)}" fill="#ffd9a0" opacity="0.3"/>`;
            else g += `<path d="M${n(cx - rx * 0.5)} ${n(cy - ry * 0.2)} Q${n(cx)} ${n(cy - ry * 0.45)} ${n(cx + rx * 0.5)} ${n(cy - ry * 0.15)}" stroke="#fff" stroke-width="1.2" fill="none" opacity="0.18"/>`;
            regionDefs.push(g);
            region.inProps = kind === 'water' ? [['reed', 1]] : null;
            region.blocking = true;
        } else if (kind === 'cracks') {
            let g = `<path d="${blobPath(cx, cy, rx, ry, 8, 0.25, r)}" fill="${t.patch}" opacity="0.7"/>`;
            for (let i = 0; i < 5; i++) {
                const x1 = cx + r.range(-rx, rx), y1 = cy + r.range(-ry, ry);
                g += `<path d="M${n(x1)} ${n(y1)} l${n(r.range(-14, 14))} ${n(r.range(-8, 8))} l${n(r.range(-12, 12))} ${n(r.range(-6, 6))}" stroke="${t.waterLight}" stroke-width="${n(r.range(0.6, 1.4))}" fill="none" opacity="0.6"/>`;
            }
            regionDefs.push(g);
        } else if (kind === 'ridge') {
            let g = '';
            for (let i = 0; i < 5; i++) {
                const bx = cx + r.range(-rx, rx), by = cy + r.range(-ry * 0.6, ry * 0.6);
                g += PROPS.boulder(bx, by, r.range(8, 15), r, t);
            }
            regionDefs.push(g);
        } else if (kind === 'dunes') {
            let g = '';
            for (let i = 0; i < 4; i++) g += PROPS.dune(cx + r.range(-rx, rx), cy + r.range(-ry, ry), r.range(12, 22), r, t);
            regionDefs.push(g);
        } else if (kind === 'graves' || kind === 'ruinField') {
            regionDefs.push(`<path d="${blobPath(cx, cy, rx, ry, 8, 0.22, r)}" fill="${t.patch}" opacity="0.55"/>`);
            region.inProps = kind === 'graves' ? [['grave', 3], ['cross', 2], ['bone', 1]] : [['ruinWall', 3], ['column', 2], ['rock', 1]];
        } else if (kind === 'grove') {
            regionDefs.push(`<path d="${blobPath(cx, cy, rx, ry, 8, 0.24, r)}" fill="${t.alt}" opacity="0.8"/>`);
            region.inProps = [['pine', 2], ['tree', 3], ['bush', 1]];
        } else { // field / clearing
            regionDefs.push(`<path d="${blobPath(cx, cy, rx, ry, 9, 0.2, r)}" fill="${t.patch}" opacity="0.6"/>`);
            region.inProps = [['grass', 3], ['flower', 1]];
        }
        out.push(region);
    });
    return { regions: out, svg: regionDefs.join('') };
}

// Минимальное остовное дерево: тропы, связывающие все точки со входом
function buildRoads(points, r, t) {
    const connected = [0];
    const edges = [];
    while (connected.length < points.length) {
        let best = null;
        for (const i of connected) {
            for (let j = 0; j < points.length; j++) {
                if (connected.includes(j)) continue;
                const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
                if (!best || d < best.d) best = { i, j, d };
            }
        }
        edges.push([best.i, best.j]);
        connected.push(best.j);
    }
    const segs = [];
    let path = '';
    edges.forEach(([a, b]) => {
        const p1 = points[a], p2 = points[b];
        const mx = (p1.x + p2.x) / 2 + r.range(-18, 18);
        const my = (p1.y + p2.y) / 2 + r.range(-12, 12);
        path += `M${n(p1.x)} ${n(p1.y)} Q${n(mx)} ${n(my)} ${n(p2.x)} ${n(p2.y)}`;
        segs.push([p1.x, p1.y, mx, my], [mx, my, p2.x, p2.y]);
    });
    const svg = `<path d="${path}" stroke="${t.roadEdge}" stroke-width="9" fill="none" stroke-linecap="round" opacity="0.85"/>`
        + `<path d="${path}" stroke="${t.road}" stroke-width="5.5" fill="none" stroke-linecap="round" opacity="0.9"/>`
        + `<path d="${path}" stroke="#000" stroke-width="1" fill="none" stroke-dasharray="3 7" opacity="0.18"/>`;
    return { svg, segs };
}

// ===================================================================
// ДЕКОР СОБЫТИЙ
// Ключ приходит из events.js (поле terrain), поэтому точка события
// выглядит на карте тем, чем она является: кузницей, шахтой, клеткой.
// Центр остаётся свободным — там стоит сама иконка точки.
// ===================================================================
const EVENT_DECOR = {
    altar(x, y, s, r, t) {
        let g = `<ellipse cx="${n(x)}" cy="${n(y + s * 0.5)}" rx="${n(s * 1.1)}" ry="${n(s * 0.5)}" fill="#ba68c8" opacity="0.13"/>`;
        for (let i = 0; i < 5; i++) {
            const a = Math.PI * (0.1 + i * 0.2);
            g += PROPS.column(x + Math.cos(a) * s * 1.55, y + s * 0.55 + Math.sin(a) * s * 0.8, s * 0.5, r, t);
        }
        g += `<rect x="${n(x - s * 0.5)}" y="${n(y + s * 0.75)}" width="${n(s)}" height="${n(s * 0.22)}" rx="${n(s * 0.05)}" fill="${t.stone}"/>`;
        return g;
    },
    merchant(x, y, s, r, t) {
        let g = `<ellipse cx="${n(x - s * 1.5)}" cy="${n(y + s * 0.75)}" rx="${n(s * 0.95)}" ry="${n(s * 0.2)}" fill="#000" opacity="0.3"/>`;
        // телега с навесом
        g += `<rect x="${n(x - s * 2.2)}" y="${n(y + s * 0.15)}" width="${n(s * 1.5)}" height="${n(s * 0.5)}" fill="${t.wood}"/>`;
        g += `<path d="M${n(x - s * 2.2)} ${n(y + s * 0.15)} Q${n(x - s * 1.45)} ${n(y - s * 0.8)} ${n(x - s * 0.7)} ${n(y + s * 0.15)}Z" fill="#cfc3a6" opacity="0.85"/>`;
        g += `<circle cx="${n(x - s * 1.95)}" cy="${n(y + s * 0.72)}" r="${n(s * 0.24)}" fill="none" stroke="${t.trunk}" stroke-width="${n(s * 0.1)}"/>`;
        g += `<circle cx="${n(x - s * 0.95)}" cy="${n(y + s * 0.72)}" r="${n(s * 0.24)}" fill="none" stroke="${t.trunk}" stroke-width="${n(s * 0.1)}"/>`;
        // разложенный товар
        g += `<rect x="${n(x + s * 1.0)}" y="${n(y + s * 0.3)}" width="${n(s * 0.55)}" height="${n(s * 0.4)}" fill="${t.wood}"/>`;
        g += `<rect x="${n(x + s * 1.65)}" y="${n(y + s * 0.45)}" width="${n(s * 0.4)}" height="${n(s * 0.3)}" fill="${t.roof}"/>`;
        for (let i = 0; i < 3; i++) g += `<circle cx="${n(x + s * (1.05 + i * 0.22))}" cy="${n(y + s * 0.25)}" r="${n(s * 0.09)}" fill="#e0b25c" opacity="0.8"/>`;
        return g;
    },
    battlefield(x, y, s, r, t) {
        let g = '';
        for (let i = 0; i < 5; i++) {
            const dx = (i - 2) * s * 0.85 + r.range(-3, 3), sx = x + dx, sy = y + s * (0.55 + r.range(-0.25, 0.35));
            const h = s * r.range(0.8, 1.2), tilt = r.range(-0.18, 0.18);
            g += `<g transform="rotate(${n(tilt * 40)} ${n(sx)} ${n(sy)})">`
                + `<rect x="${n(sx - s * 0.05)}" y="${n(sy - h)}" width="${n(s * 0.1)}" height="${n(h)}" fill="#8d8f96"/>`
                + `<rect x="${n(sx - s * 0.22)}" y="${n(sy - h * 0.95)}" width="${n(s * 0.44)}" height="${n(s * 0.08)}" fill="${t.trunk}"/></g>`;
        }
        g += `<ellipse cx="${n(x + s * 1.75)}" cy="${n(y + s * 0.85)}" rx="${n(s * 0.38)}" ry="${n(s * 0.42)}" fill="${t.rock}" transform="rotate(20 ${n(x + s * 1.75)} ${n(y + s * 0.85)})"/>`;
        g += `<path d="M${n(x + s * 1.4)} ${n(y + s * 0.85)} L${n(x + s * 2.1)} ${n(y + s * 0.85)}" stroke="${t.rockLight}" stroke-width="${n(s * 0.1)}" opacity="0.7"/>`;
        g += `<path d="M${n(x - s * 2.1)} ${n(y + s * 0.7)} L${n(x - s * 2.1)} ${n(y - s * 0.7)}" stroke="${t.trunk}" stroke-width="${n(s * 0.1)}"/>`;
        g += `<path d="M${n(x - s * 2.1)} ${n(y - s * 0.7)} L${n(x - s * 1.4)} ${n(y - s * 0.5)} L${n(x - s * 2.1)} ${n(y - s * 0.2)}Z" fill="#7a3b3b" opacity="0.8"/>`;
        g += PROPS.bone(x - s * 1.2, y + s * 1.05, s * 0.8, r, t);
        return g;
    },
    forge(x, y, s, r, t) {
        let g = `<ellipse cx="${n(x)}" cy="${n(y + s * 0.8)}" rx="${n(s * 2.0)}" ry="${n(s * 0.6)}" fill="${t.soil}" opacity="0.5"/>`;
        // кузня с трубой
        g += `<rect x="${n(x - s * 2.3)}" y="${n(y - s * 0.55)}" width="${n(s * 1.5)}" height="${n(s * 1.2)}" fill="${t.stone}"/>`;
        g += `<path d="M${n(x - s * 2.45)} ${n(y - s * 0.55)} L${n(x - s * 1.55)} ${n(y - s * 1.15)} L${n(x - s * 0.65)} ${n(y - s * 0.55)}Z" fill="${t.roof}"/>`;
        g += `<rect x="${n(x - s * 1.05)}" y="${n(y - s * 1.5)}" width="${n(s * 0.3)}" height="${n(s * 0.5)}" fill="${t.stone}"/>`;
        g += `<ellipse cx="${n(x - s * 0.9)}" cy="${n(y - s * 1.55)}" rx="${n(s * 0.3)}" ry="${n(s * 0.18)}" fill="#8a8a8a" opacity="0.25"/>`;
        g += `<rect x="${n(x - s * 1.95)}" y="${n(y - s * 0.05)}" width="${n(s * 0.6)}" height="${n(s * 0.45)}" fill="#ff7a2f" opacity="0.55"/>`;
        // наковальня и бочка
        g += `<path d="M${n(x + s * 1.0)} ${n(y + s * 0.75)} l0 ${n(-s * 0.3)} l${n(-s * 0.12)} ${n(-s * 0.1)} l${n(s * 0.95)} 0 l${n(-s * 0.18)} ${n(s * 0.18)} l0 ${n(s * 0.22)}Z" fill="${t.rock}"/>`;
        g += `<rect x="${n(x + s * 1.9)}" y="${n(y + s * 0.35)}" width="${n(s * 0.45)}" height="${n(s * 0.45)}" rx="${n(s * 0.08)}" fill="${t.wood}"/>`;
        return g;
    },
    spring(x, y, s, r, t) {
        let g = `<ellipse cx="${n(x)}" cy="${n(y + s * 0.85)}" rx="${n(s * 2.0)}" ry="${n(s * 0.85)}" fill="${t.water}"/>`;
        g += `<ellipse cx="${n(x)}" cy="${n(y + s * 0.85)}" rx="${n(s * 1.35)}" ry="${n(s * 0.55)}" fill="${t.waterLight}" opacity="0.5"/>`;
        g += `<ellipse cx="${n(x)}" cy="${n(y + s * 0.85)}" rx="${n(s * 2.0)}" ry="${n(s * 0.85)}" fill="none" stroke="${t.stone}" stroke-width="${n(s * 0.16)}" stroke-dasharray="${n(s * 0.5)} ${n(s * 0.22)}" opacity="0.85"/>`;
        g += PROPS.rock(x - s * 2.2, y + s * 0.35, s * 0.8, r, t);
        g += PROPS.rock(x + s * 2.1, y + s * 0.45, s * 0.7, r, t);
        for (let i = 0; i < 3; i++) g += PROPS.reed(x + s * (i - 1) * 0.9, y + s * 1.5, s * 0.8, r, t);
        return g;
    },
    shrine(x, y, s, r, t) {
        let g = `<ellipse cx="${n(x)}" cy="${n(y + s * 0.6)}" rx="${n(s * 1.6)}" ry="${n(s * 0.7)}" fill="#e64a19" opacity="0.12"/>`;
        // идол
        g += `<path d="M${n(x - s * 1.85)} ${n(y + s * 0.7)} L${n(x - s * 1.6)} ${n(y - s * 0.9)} L${n(x - s * 1.0)} ${n(y - s * 0.9)} L${n(x - s * 0.8)} ${n(y + s * 0.7)}Z" fill="${t.stone}"/>`;
        g += `<circle cx="${n(x - s * 1.3)}" cy="${n(y - s * 1.1)}" r="${n(s * 0.32)}" fill="${t.rockLight}"/>`;
        g += `<circle cx="${n(x - s * 1.4)}" cy="${n(y - s * 1.12)}" r="${n(s * 0.07)}" fill="#ff6a2b"/>`;
        g += `<circle cx="${n(x - s * 1.18)}" cy="${n(y - s * 1.12)}" r="${n(s * 0.07)}" fill="#ff6a2b"/>`;
        // жаровня
        g += `<rect x="${n(x + s * 0.95)}" y="${n(y + s * 0.15)}" width="${n(s * 0.16)}" height="${n(s * 0.6)}" fill="${t.rock}"/>`;
        g += `<path d="M${n(x + s * 0.6)} ${n(y + s * 0.15)} L${n(x + s * 1.45)} ${n(y + s * 0.15)} L${n(x + s * 1.25)} ${n(y + s * 0.5)} L${n(x + s * 0.8)} ${n(y + s * 0.5)}Z" fill="${t.rock}"/>`;
        g += `<ellipse cx="${n(x + s * 1.02)}" cy="${n(y + s * 0.12)}" rx="${n(s * 0.3)}" ry="${n(s * 0.16)}" fill="#ff8a3d" opacity="0.85"/>`;
        g += `<path d="M${n(x + s * 1.02)} ${n(y - s * 0.35)} q${n(-s * 0.22)} ${n(s * 0.2)} 0 ${n(s * 0.45)} q${n(s * 0.22)} ${n(-s * 0.25)} 0 ${n(-s * 0.45)}Z" fill="#ffb14a" opacity="0.8"/>`;
        return g;
    },
    cage(x, y, s, r, t) {
        let g = `<ellipse cx="${n(x + s * 1.5)}" cy="${n(y + s * 0.9)}" rx="${n(s * 0.8)}" ry="${n(s * 0.22)}" fill="#000" opacity="0.3"/>`;
        // столб с перекладиной и цепью
        g += `<rect x="${n(x - s * 0.08 + s * 0.4)}" y="${n(y - s * 1.6)}" width="${n(s * 0.18)}" height="${n(s * 2.4)}" fill="${t.trunk}"/>`;
        g += `<rect x="${n(x + s * 0.4)}" y="${n(y - s * 1.6)}" width="${n(s * 1.3)}" height="${n(s * 0.16)}" fill="${t.trunk}"/>`;
        g += `<path d="M${n(x + s * 1.55)} ${n(y - s * 1.45)} L${n(x + s * 1.55)} ${n(y - s * 0.9)}" stroke="#8d8f96" stroke-width="${n(s * 0.08)}" stroke-dasharray="${n(s * 0.12)} ${n(s * 0.08)}"/>`;
        // клетка
        g += `<rect x="${n(x + s * 1.0)}" y="${n(y - s * 0.9)}" width="${n(s * 1.1)}" height="${n(s * 1.1)}" fill="#120f0d" opacity="0.85"/>`;
        for (let i = 0; i <= 4; i++) g += `<rect x="${n(x + s * (1.0 + i * 0.275))}" y="${n(y - s * 0.9)}" width="${n(s * 0.07)}" height="${n(s * 1.1)}" fill="${t.trunk}"/>`;
        g += `<rect x="${n(x + s * 1.0)}" y="${n(y - s * 0.95)}" width="${n(s * 1.1)}" height="${n(s * 0.1)}" fill="${t.trunk}"/>`;
        g += `<rect x="${n(x + s * 1.0)}" y="${n(y + s * 0.1)}" width="${n(s * 1.1)}" height="${n(s * 0.1)}" fill="${t.trunk}"/>`;
        g += PROPS.bone(x - s * 1.4, y + s * 0.9, s * 0.8, r, t);
        return g;
    },
    mine(x, y, s, r, t) {
        let g = `<path d="${blobPath(x, y - s * 0.1, s * 2.6, s * 1.5, 8, 0.16, r)}" fill="${t.rock}"/>`;
        g += `<path d="${blobPath(x - s * 0.5, y - s * 0.5, s * 1.3, s * 0.7, 7, 0.2, r)}" fill="${t.rockLight}" opacity="0.35"/>`;
        // вход со срубом
        g += `<path d="M${n(x - s * 0.85)} ${n(y + s * 0.85)} L${n(x - s * 0.85)} ${n(y - s * 0.25)} Q${n(x)} ${n(y - s * 0.75)} ${n(x + s * 0.85)} ${n(y - s * 0.25)} L${n(x + s * 0.85)} ${n(y + s * 0.85)}Z" fill="#0c0a09"/>`;
        g += `<rect x="${n(x - s * 1.05)}" y="${n(y - s * 0.35)}" width="${n(s * 0.2)}" height="${n(s * 1.2)}" fill="${t.trunk}"/>`;
        g += `<rect x="${n(x + s * 0.85)}" y="${n(y - s * 0.35)}" width="${n(s * 0.2)}" height="${n(s * 1.2)}" fill="${t.trunk}"/>`;
        g += `<rect x="${n(x - s * 1.15)}" y="${n(y - s * 0.5)}" width="${n(s * 2.3)}" height="${n(s * 0.2)}" fill="${t.trunk}"/>`;
        // вагонетка
        g += `<rect x="${n(x + s * 1.45)}" y="${n(y + s * 0.5)}" width="${n(s * 0.85)}" height="${n(s * 0.45)}" fill="${t.wood}"/>`;
        g += `<circle cx="${n(x + s * 1.65)}" cy="${n(y + s * 1.0)}" r="${n(s * 0.15)}" fill="${t.trunk}"/>`;
        g += `<circle cx="${n(x + s * 2.1)}" cy="${n(y + s * 1.0)}" r="${n(s * 0.15)}" fill="${t.trunk}"/>`;
        return g;
    },
    nest(x, y, s, r, t) {
        let g = `<ellipse cx="${n(x)}" cy="${n(y + s * 0.65)}" rx="${n(s * 2.1)}" ry="${n(s * 1.0)}" fill="${t.trunk}" opacity="0.65"/>`;
        g += `<ellipse cx="${n(x)}" cy="${n(y + s * 0.65)}" rx="${n(s * 1.5)}" ry="${n(s * 0.68)}" fill="#120f0d" opacity="0.5"/>`;
        for (let i = 0; i < 10; i++) {
            const a = r.range(0, Math.PI * 2), rad = s * r.range(1.4, 2.2);
            const px = x + Math.cos(a) * rad, py = y + s * 0.65 + Math.sin(a) * rad * 0.48;
            g += `<path d="M${n(px)} ${n(py)} l${n(r.range(-s * 0.5, s * 0.5))} ${n(r.range(-s * 0.2, s * 0.2))}" stroke="${t.trunk}" stroke-width="${n(s * 0.09)}" stroke-linecap="round"/>`;
        }
        [[-0.75, 0.75], [0.1, 0.95], [0.8, 0.7]].forEach(([dx, dy]) => {
            g += `<ellipse cx="${n(x + s * dx)}" cy="${n(y + s * dy)}" rx="${n(s * 0.3)}" ry="${n(s * 0.38)}" fill="#ddd3bb" opacity="0.85"/>`;
        });
        g += PROPS.bone(x + s * 1.9, y + s * 1.1, s * 0.8, r, t);
        return g;
    },
    obelisk(x, y, s, r, t) {
        let g = `<ellipse cx="${n(x)}" cy="${n(y + s * 0.85)}" rx="${n(s * 1.5)}" ry="${n(s * 0.55)}" fill="#000" opacity="0.3"/>`;
        g += `<path d="M${n(x - s * 0.55)} ${n(y + s * 0.85)} L${n(x - s * 0.34)} ${n(y - s * 1.9)} L${n(x + s * 0.34)} ${n(y - s * 1.9)} L${n(x + s * 0.55)} ${n(y + s * 0.85)}Z" fill="#1a1622"/>`;
        g += `<path d="M${n(x - s * 0.34)} ${n(y - s * 1.9)} L${n(x)} ${n(y - s * 2.25)} L${n(x + s * 0.34)} ${n(y - s * 1.9)}Z" fill="#241d30"/>`;
        for (let i = 0; i < 4; i++) {
            g += `<path d="M${n(x - s * 0.2)} ${n(y - s * (1.5 - i * 0.45))} l${n(s * 0.4)} 0" stroke="${t.waterLight}" stroke-width="${n(s * 0.07)}" opacity="0.7"/>`;
        }
        g += PROPS.rock(x - s * 1.6, y + s * 0.8, s * 0.7, r, t);
        g += PROPS.rock(x + s * 1.55, y + s * 0.9, s * 0.6, r, t);
        return g;
    },
    camp(x, y, s, r, t) {
        let g = `<ellipse cx="${n(x)}" cy="${n(y + s * 0.7)}" rx="${n(s * 1.9)}" ry="${n(s * 0.8)}" fill="${t.soil}" opacity="0.45"/>`;
        g += PROPS.tent(x - s * 1.7, y + s * 0.6, s * 1.0, r, t);
        g += PROPS.tent(x + s * 1.75, y + s * 0.75, s * 0.85, r, t);
        // костёр с треногой
        const fx = x, fy = y + s * 1.15;
        g += `<path d="M${n(fx - s * 0.45)} ${n(fy)} l${n(s * 0.9)} ${n(-s * 0.12)} M${n(fx - s * 0.35)} ${n(fy - s * 0.12)} l${n(s * 0.8)} ${n(s * 0.14)}" stroke="${t.trunk}" stroke-width="${n(s * 0.12)}" stroke-linecap="round"/>`;
        g += `<path d="M${n(fx)} ${n(fy - s * 0.65)} q${n(-s * 0.3)} ${n(s * 0.3)} 0 ${n(s * 0.6)} q${n(s * 0.3)} ${n(-s * 0.32)} 0 ${n(-s * 0.6)}Z" fill="#ffb14a" opacity="0.85"/>`;
        g += `<ellipse cx="${n(fx)}" cy="${n(fy)}" rx="${n(s * 0.7)}" ry="${n(s * 0.3)}" fill="#ff8a3d" opacity="0.18"/>`;
        return g;
    },
    ritual(x, y, s, r, t) {
        let g = `<ellipse cx="${n(x)}" cy="${n(y + s * 0.55)}" rx="${n(s * 1.9)}" ry="${n(s * 0.85)}" fill="#ce93d8" opacity="0.14"/>`;
        g += `<ellipse cx="${n(x)}" cy="${n(y + s * 0.55)}" rx="${n(s * 1.75)}" ry="${n(s * 0.78)}" fill="none" stroke="#ce93d8" stroke-width="${n(s * 0.08)}" opacity="0.7"/>`;
        g += `<ellipse cx="${n(x)}" cy="${n(y + s * 0.55)}" rx="${n(s * 1.2)}" ry="${n(s * 0.52)}" fill="none" stroke="#ce93d8" stroke-width="${n(s * 0.05)}" stroke-dasharray="${n(s * 0.2)} ${n(s * 0.16)}" opacity="0.55"/>`;
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const cx = x + Math.cos(a) * s * 1.75, cy = y + s * 0.55 + Math.sin(a) * s * 0.78;
            g += `<rect x="${n(cx - s * 0.07)}" y="${n(cy - s * 0.35)}" width="${n(s * 0.14)}" height="${n(s * 0.35)}" fill="#ded3c0" opacity="0.85"/>`;
            g += `<circle cx="${n(cx)}" cy="${n(cy - s * 0.42)}" r="${n(s * 0.09)}" fill="#ffd27a" opacity="0.9"/>`;
        }
        return g;
    }
};

// Декорации вокруг конкретной точки интереса
function siteDecor(site, s, r, t) {
    const x = site.x, y = site.y;
    const pad = `<ellipse cx="${n(x)}" cy="${n(y + s * 0.5)}" rx="${n(s * 1.5)}" ry="${n(s * 0.75)}" fill="${t.patch}" opacity="0.65"/>`;
    let g = pad;

    if (site.type === 'event') {
        const draw = EVENT_DECOR[site.terrain] || EVENT_DECOR.altar;
        g += draw(x, y, s, r, t);
    } else if (site.type === 'settlement') {
        g += PROPS.hut(x - s * 1.15, y + s * 0.3, s * 0.6, r, t);
        g += PROPS.hut(x + s * 1.2, y + s * 0.45, s * 0.7, r, t);
        g += PROPS.hut(x - s * 0.5, y + s * 1.0, s * 0.55, r, t);
        g += PROPS.hut(x + s * 0.45, y - s * 0.75, s * 0.5, r, t);
        // частокол
        let fence = '';
        for (let i = 0; i < 9; i++) {
            const a = Math.PI * (0.15 + i * 0.09);
            const fx = x + Math.cos(a) * s * 1.85, fy = y + s * 0.5 + Math.sin(a) * s * 0.95;
            fence += `<rect x="${n(fx)}" y="${n(fy - s * 0.3)}" width="${n(s * 0.09)}" height="${n(s * 0.3)}" fill="${t.wood}" opacity="0.8"/>`;
        }
        g += fence;
    } else if (site.type === 'treasure') {
        g += `<ellipse cx="${n(x)}" cy="${n(y + s * 0.55)}" rx="${n(s * 0.8)}" ry="${n(s * 0.4)}" fill="${t.soil}" opacity="0.8"/>`;
        g += `<rect x="${n(x + s * 0.95)}" y="${n(y + s * 0.1)}" width="${n(s * 0.55)}" height="${n(s * 0.4)}" fill="${t.wood}"/>`;
        g += `<rect x="${n(x - s * 1.5)}" y="${n(y + s * 0.2)}" width="${n(s * 0.45)}" height="${n(s * 0.32)}" fill="${t.wood}" opacity="0.85"/>`;
        g += `<path d="M${n(x - s * 0.9)} ${n(y + s * 0.85)} l${n(s * 0.5)} ${n(-s * 0.25)}" stroke="${t.trunk}" stroke-width="${n(s * 0.1)}" stroke-linecap="round"/>`;
        g += PROPS.bone(x + s * 1.5, y + s * 0.8, s * 0.7, r, t);
    } else if (site.type === 'combat' || site.type === 'combat_elite') {
        const big = site.type === 'combat_elite';
        g += PROPS.tent(x - s * 1.25, y + s * 0.5, s * (big ? 0.85 : 0.65), r, t);
        g += PROPS.spikes(x + s * 1.2, y + s * 0.55, s * (big ? 1.0 : 0.8), r, t);
        g += PROPS.bone(x - s * 0.7, y + s * 1.0, s * 0.75, r, t);
        // костёр
        g += `<path d="M${n(x + s * 0.7)} ${n(y + s * 1.05)} l${n(s * 0.4)} ${n(-s * 0.12)}" stroke="${t.trunk}" stroke-width="${n(s * 0.12)}" stroke-linecap="round"/>`;
        g += `<ellipse cx="${n(x + s * 0.9)}" cy="${n(y + s * 0.95)}" rx="${n(s * 0.18)}" ry="${n(s * 0.12)}" fill="#ff8a3d" opacity="0.7"/>`;
        if (big) {
            g += `<path d="M${n(x + s * 1.75)} ${n(y + s * 0.6)} L${n(x + s * 1.75)} ${n(y - s * 0.55)}" stroke="${t.trunk}" stroke-width="${n(s * 0.1)}"/>`;
            g += `<path d="M${n(x + s * 1.75)} ${n(y - s * 0.55)} L${n(x + s * 2.35)} ${n(y - s * 0.35)} L${n(x + s * 1.75)} ${n(y - s * 0.1)}Z" fill="#d84b20" opacity="0.8"/>`;
        }
    } else if (site.type === 'combat_boss') {
        g += `<ellipse cx="${n(x)}" cy="${n(y + s * 0.5)}" rx="${n(s * 2.2)}" ry="${n(s * 1.05)}" fill="#d32f2f" opacity="0.12"/>`;
        [-1, 1].forEach(dir => {
            g += `<rect x="${n(x + dir * s * 1.6 - s * 0.22)}" y="${n(y - s * 1.1)}" width="${n(s * 0.44)}" height="${n(s * 1.75)}" fill="${t.stone}"/>`;
            g += `<rect x="${n(x + dir * s * 1.6 - s * 0.32)}" y="${n(y - s * 1.25)}" width="${n(s * 0.64)}" height="${n(s * 0.2)}" fill="${t.rockLight}"/>`;
            g += `<circle cx="${n(x + dir * s * 1.6)}" cy="${n(y - s * 0.75)}" r="${n(s * 0.12)}" fill="#ff5a3c" opacity="0.85"/>`;
        });
        g += `<path d="M${n(x - s * 1.6)} ${n(y - s * 1.15)} Q${n(x)} ${n(y - s * 1.95)} ${n(x + s * 1.6)} ${n(y - s * 1.15)}" stroke="${t.stone}" stroke-width="${n(s * 0.22)}" fill="none"/>`;
        g += PROPS.bone(x - s * 2.0, y + s * 1.0, s * 0.9, r, t);
        g += PROPS.bone(x + s * 2.1, y + s * 1.1, s * 0.8, r, t);
    } else if (site.type === 'exit') {
        g += `<path d="M${n(x)} ${n(y)} L${n(x + r.range(-10, 10))} ${n(-10)}" stroke="${t.roadEdge}" stroke-width="9" opacity="0.8" stroke-linecap="round"/>`;
        g += `<path d="M${n(x)} ${n(y)} L${n(x)} ${n(-10)}" stroke="${t.road}" stroke-width="5" opacity="0.9" stroke-linecap="round"/>`;
        [-1, 1].forEach(dir => {
            g += `<rect x="${n(x + dir * s * 1.25 - s * 0.16)}" y="${n(y - s * 0.95)}" width="${n(s * 0.32)}" height="${n(s * 1.45)}" fill="${t.stone}"/>`;
        });
        g += `<path d="M${n(x - s * 1.25)} ${n(y - s * 0.95)} L${n(x + s * 1.25)} ${n(y - s * 0.95)}" stroke="${t.rockLight}" stroke-width="${n(s * 0.22)}"/>`;
        g += `<path d="M${n(x + s * 1.55)} ${n(y + s * 0.5)} L${n(x + s * 1.55)} ${n(y - s * 0.1)} L${n(x + s * 2.2)} ${n(y - s * 0.15)}" stroke="${t.wood}" stroke-width="${n(s * 0.12)}" fill="none"/>`;
    }
    return g;
}

function buildSvg(W, H, stage, sites, seed) {
    const r = makeRng(seed);
    const t = THEMES[pickAreaTheme(sites)];
    const scale = Math.min(W, H * 1.35) / 340; // базовый масштаб мелочи
    const sizeOf = v => v * scale;

    const defs = `<defs>
        <linearGradient id="tg${seed}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${t.sky[0]}"/><stop offset="100%" stop-color="${t.sky[1]}"/>
        </linearGradient>
        <radialGradient id="tv${seed}" cx="50%" cy="45%" r="72%">
            <stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
        </radialGradient>
        <filter id="tn${seed}" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed % 100}"/>
            <feColorMatrix type="saturate" values="0"/>
        </filter>
        <filter id="tb${seed}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${n(6 * scale)}"/></filter>
    </defs>`;

    let g = `<rect width="${W}" height="${H}" fill="url(#tg${seed})"/>`;

    // Крупный рельеф: мягкие перепады земли
    for (let i = 0; i < 5; i++) {
        g += `<path d="${blobPath(r.range(0, W), r.range(0, H), r.range(W * 0.18, W * 0.42), r.range(H * 0.12, H * 0.3), 8, 0.28, r)}" fill="${t.alt}" opacity="${n(r.range(0.4, 0.75))}"/>`;
    }
    // Протоптанная почва/песок пятнами
    for (let i = 0; i < 4; i++) {
        g += `<path d="${blobPath(r.range(0, W), r.range(0, H), r.range(W * 0.08, W * 0.18), r.range(H * 0.05, H * 0.12), 7, 0.3, r)}" fill="${t.soil}" opacity="0.35"/>`;
    }

    const sitesPx = sites.map(s => ({ x: s.x / 100 * W, y: s.y / 100 * H, type: s.type, terrain: s.terrain }));

    // Тропы: вход снизу → все точки (строятся первыми, чтобы биомы их обходили)
    const entry = { x: W * 0.5, y: H * 1.06 };
    const roads = buildRoads([entry, ...sitesPx], r, t);

    // Биомы
    const kinds = [];
    t.regions.forEach(([kind, count]) => { for (let i = 0; i < count; i++) kinds.push(kind); });
    const { regions, svg: regionSvg } = buildRegions(t, r, W, H, sitesPx, kinds, roads.segs, []);
    g += regionSvg;
    g += roads.svg;

    // Отбор мест под мелочь
    const items = [];
    const minSiteDist = Math.max(46, W * 0.14); // вокруг точек оставляем место под их собственный декор
    const target = Math.round((W * H) / 1500 * t.density);
    let guard = 0;
    while (items.length < target && guard++ < target * 12) {
        const x = r.range(-4, W + 4), y = r.range(H * 0.04, H + 4);
        if (sitesPx.some(s => Math.hypot(s.x - x, s.y - y) < minSiteDist)) continue;
        if (roads.segs.some(sg => distToSegment(x, y, sg[0], sg[1], sg[2], sg[3]) < 7)) continue;

        const inside = regions.find(rg => ((x - rg.cx) ** 2) / (rg.rx * rg.rx) + ((y - rg.cy) ** 2) / (rg.ry * rg.ry) < 0.92);
        let list = t.props;
        if (inside) {
            if (inside.blocking && !inside.inProps) continue;
            if (inside.inProps) list = inside.inProps;
        }
        const kind = weighted(list, r);
        const size = sizeOf(r.range(9, 17)) * (kind === 'grass' || kind === 'flower' || kind === 'bone' ? 0.85 : 1);
        items.push({ x, y, kind, size, seedFrac: r.next() });
    }

    // Декорации точек интереса — в общий список, чтобы корректно перекрывались
    sitesPx.forEach(site => {
        items.push({ x: site.x, y: site.y, decor: site, size: sizeOf(19) });
    });

    // Художник рисует от дальнего к ближнему
    items.sort((a, b) => a.y - b.y);
    items.forEach(it => {
        if (it.decor) g += siteDecor(it.decor, it.size, r, t);
        else g += PROPS[it.kind](it.x, it.y, it.size, r, t);
    });

    // Атмосфера: туман, частицы, виньетка, шум
    let fog = '';
    for (let i = 0; i < 3; i++) {
        const fx = r.range(0, W), fy = r.range(H * 0.15, H * 0.95);
        fog += `<ellipse class="terr-fog" cx="${n(fx)}" cy="${n(fy)}" rx="${n(r.range(W * 0.18, W * 0.34))}" ry="${n(r.range(H * 0.04, H * 0.08))}" fill="${t.fog}" filter="url(#tb${seed})" style="animation-delay:${n(-r.range(0, 18))}s"/>`;
    }
    g += `<g opacity="0.55">${fog}</g>`;

    let motes = '';
    for (let i = 0; i < t.moteCount; i++) {
        motes += `<circle class="terr-mote" cx="${n(r.range(0, W))}" cy="${n(r.range(H * 0.1, H))}" r="${n(r.range(0.7, 1.9))}" fill="${t.mote}" style="animation-delay:${n(-r.range(0, 9))}s;animation-duration:${n(r.range(5, 11))}s"/>`;
    }
    g += motes;

    g += `<rect width="${W}" height="${H}" filter="url(#tn${seed})" opacity="0.05" style="mix-blend-mode:overlay"/>`;
    g += `<rect width="${W}" height="${H}" fill="url(#tv${seed})"/>`;

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${defs}${g}</svg>`;
}

// ===================================================================
// ТОЧКА ВХОДА
// container — слой под точками; areaEl — сама рамка карты (для размеров);
// sites — те же объекты точек, что рисует map.js (в процентах).
// ===================================================================
let cacheKey = null;

export function renderTerrain(container, areaEl, stage, sites) {
    if (!container) return;
    const rect = areaEl ? areaEl.getBoundingClientRect() : { width: 0, height: 0 };
    const W = Math.round(rect.width) || 340;
    const H = Math.round(rect.height) || 250;

    const seedStr = `s${stage}|` + sites.map(s => `${s.type}${s.terrain ? '/' + s.terrain : ''}${s.enemyTheme ? '/' + s.enemyTheme : ''}:${s.x},${s.y}`).join(';');
    const key = `${seedStr}@${W}x${H}`;
    if (key === cacheKey && container.firstChild) return; // местность не перерисовывается при выборе точки
    cacheKey = key;

    container.innerHTML = buildSvg(W, H, stage, sites, hashString(seedStr));
}

export function resetTerrainCache() { cacheKey = null; }
