import { player, gameState } from './state.js';
import { roll } from './utils.js';
import { ui, updateUI, log, showLoseScreen } from './ui.js';
import { startStage } from './combat.js';
import { sfx } from './audio.js';

const events =[
    {
        title: "Древний Алтарь",
        desc: "Вы находите покрытый рунами алтарь. Из него сочится мощная магическая энергия.",
        choices:[
            {
                text: "Молиться (Спасбросок ХАРИЗМЫ)",
                req: null,
                action: () => {
                    const total = roll(20) + player.chaMod;
                    if (total >= 10) {
                        player.xp += 300; 
                        let lvlMsgs = player.checkLevelUp();
                        let msg = `Успех (${total})! Дух откликается. Вы получаете 300 опыта.`;
                        if (lvlMsgs.length > 0) msg += '<br>' + lvlMsgs.join('<br>');
                        return { msg, color: '#4caf50' };
                    } else {
                        player.hp -= 5;
                        return { msg: `Провал (${total})! Энергия обжигает вас на 5 урона.`, color: '#e53935' };
                    }
                }
            },
            {
                text: "Пройти мимо",
                req: null,
                action: () => ({ msg: "Вы осторожно обходите алтарь стороной.", color: '#aaa' })
            }
        ]
    },
    {
        title: "Раненый Гоблин",
        desc: "На земле лежит гоблин-торговец. Его телега сломана, а сам он истекает кровью.",
        choices:[
            {
                text: "Помочь (Отдать Зелье Лечения)",
                req: () => player.inventory.heal > 0,
                action: () => {
                    sfx.coin();
                    player.inventory.heal--;
                    player.gold += 120;
                    return { msg: "Гоблин выпивает зелье и в благодарность отсыпает 120 золота!", color: '#ffd700' };
                }
            },
            {
                text: "Ограбить (Атлетика)",
                req: null,
                action: () => {
                    const total = roll(20) + player.chaMod; // У Сосуда Атлетика идет от Харизмы
                    if (total >= 12) {
                        sfx.coin();
                        player.gold += 80;
                        return { msg: `Успех (${total})! Вы отбираете 80 золота.`, color: '#ffd700' };
                    } else {
                        player.hp -= 5;
                        return { msg: `Провал (${total})! Гоблин кусает вас за руку (5 урона) и убегает.`, color: '#e53935' };
                    }
                }
            },
            {
                text: "Пройти мимо",
                req: null,
                action: () => ({ msg: "Вы не обращаете на него внимания.", color: '#aaa' })
            }
        ]
    },
    {
        title: "Загадочный Источник",
        desc: "Из скалы бьет светящийся синим светом ручей.",
        choices:[
            {
                text: "Выпить воды",
                req: null,
                action: () => {
                    if (Math.random() > 0.3) {
                        sfx.heal()
                        player.hp = player.maxHp;
                        player.spellSlots = player.maxSpellSlots;
                        return { msg: "Вода освежает! Вы полностью восстановили ХП и Ячейки заклинаний.", color: '#64b5f6' };
                    } else {
                        player.hp -= 8;
                        return { msg: "Вода оказалась ядовитой! Вы получаете 8 урона.", color: '#e53935' };
                    }
                }
            },
            {
                text: "Уйти",
                req: null,
                action: () => ({ msg: "Лучше не пить из незнакомых луж.", color: '#aaa' })
            }
        ]
    }
];

export function renderPaths() {
    ui.pathChoices.innerHTML = '';
    const nextStage = gameState.stage + 1;
    
    let paths =[];
    if (nextStage === 10 || nextStage === 16) {
        paths.push({ type: 'combat', label: '💀 Врата Босса', color: '#d32f2f' });
    } else {
        paths.push({ type: 'combat', label: '⚔️ Обычный бой', color: '#e0e0e0' });
        
        const rand = Math.random();
        if (rand < 0.5) {
            paths.push({ type: 'event', label: '❓ Случайное событие', color: '#ba68c8' });
        } else if (rand < 0.8) {
            paths.push({ type: 'combat_elite', label: '👹 Элитный враг (Больше лута)', color: '#d84b20' });
        } else {
            paths.push({ type: 'treasure', label: '🎁 Забытый сундук', color: '#ffd700' });
        }
        
        // Перемешиваем кнопки путей
        paths.sort(() => Math.random() - 0.5);
    }

    paths.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'btn-action';
        btn.style.borderColor = p.color;
        btn.style.color = p.color;
        btn.innerText = p.label;
        btn.addEventListener('click', () => choosePath(p));
        ui.pathChoices.appendChild(btn);
    });
}

function choosePath(path) {
    gameState.stage++; // Переходим на следующий этап
    
    if (path.type === 'combat') {
        startStage(false); 
    } else if (path.type === 'combat_elite') {
        startStage(true); 
    } else if (path.type === 'event') {
        startEvent();
    } else if (path.type === 'treasure') {
        startTreasure();
    }
}

function startEvent() {
    const ev = events[Math.floor(Math.random() * events.length)];
    ui.eventTitle.innerText = ev.title; ui.eventTitle.style.color = "#ba68c8";
    ui.eventDesc.innerText = ev.desc; ui.eventActions.innerHTML = '';
    
    ev.choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'btn-action'; btn.style.borderColor = '#ba68c8'; btn.innerText = choice.text;
        
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
        const gold = 40 + roll(40);
        player.gold += gold;
        ui.eventActions.classList.add('hidden');
        ui.eventResult.innerHTML = `Вы нашли 💰 ${gold} золота!`; ui.eventResult.style.color = '#ffd700';
        ui.eventResult.classList.remove('hidden'); ui.btnCloseEvent.classList.remove('hidden');
        updateUI();
    };
    ui.eventActions.appendChild(btn);
    
    ui.eventActions.classList.remove('hidden'); ui.eventResult.classList.add('hidden'); ui.btnCloseEvent.classList.add('hidden');
    ui.eventModal.classList.remove('hidden');
}

// Кнопка продолжить в Модалке
ui.btnCloseEvent.addEventListener('click', () => {
    ui.eventModal.classList.add('hidden');
    log(`<i>Этап ${gameState.stage} пройден. Выберите следующий путь.</i>`, 'system');
    renderPaths();
});
