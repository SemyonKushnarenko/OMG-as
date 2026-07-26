var currentLevelName = 'level_1';
var levelOrder = ['level_1', 'level_2', 'level_3'];
var collisionHandlerRegistered = 0;
var BULLET_LIFETIME = 3; // seconds
var MAX_SHOTS = 3;
var LOSE_CHECK_DELAY = BULLET_LIFETIME + 0.5;
var SCORE_PER_BLOCK = 1000;
var SCORE_PER_EFFICIENCY = 500;
options.__soundDisabled = 0; 

var level;
var rubber;
var blocks = [];
var big_blocks = 0;
var totalBlocks = 0;
var shotsCount = 0;
var lastScore = 0;
var lastStars = 0;
var levelEnded = 0;
var shotsHud;
var damageEnabled = 0;
var SETTLE_GRACE = 1.2; // сек: игнор урона, пока блоки «усядутся»
var sessionProgress = { level_1: 0, level_2: 0, level_3: 0 };
var levelEpoch = 0;
var loseCheckTimeout = 0;
var settleTimeout = 0;
var winResultTimeout = 0;

function loadProgress() {
    return sessionProgress;
}

function saveProgress(progress) {
    sessionProgress = progress;
}

function getLevelStars(levelName) {
    return loadProgress()[levelName] || 0;
}

function isLevelUnlocked(levelName) {
    var index = levelOrder.indexOf(levelName);
    if (index <= 0)
        return 1;
    return getLevelStars(levelOrder[index - 1]) > 0;
}

function saveLevelResult(levelName, stars) {
    var progress = loadProgress();
    if (stars > (progress[levelName] || 0)) {
        progress[levelName] = stars;
        saveProgress(progress);
    }
}

function clearLevelTimeouts() {
    if (loseCheckTimeout) {
        _clearTimeout(loseCheckTimeout);
        loseCheckTimeout = 0;
    }
    if (settleTimeout) {
        _clearTimeout(settleTimeout);
        settleTimeout = 0;
    }
    if (winResultTimeout) {
        _clearTimeout(winResultTimeout);
        winResultTimeout = 0;
    }
}

function teardownLevel() {
    clearLevelTimeouts();
    levelEpoch++;
    if (level) {
        level.__removeFromParent();
        level = 0;
    }
    rubber = 0;
    blocks = [];
    big_blocks = 0;
    shotsHud = 0;
}

function looperPostOne(f, delay) {
    if (f.__posted > 0) {
        f.__posted = _clearTimeout(f.__posted);
    }

    if (!f.__posted) {
        if (delay) {
            f.__posted = _setTimeout(() => {
                f.__posted = 0;
                f();
            }, delay);
        } else {
            f.__posted = -1;
            looperPost(() => {
                f.__posted = 0;
                f();
            });
        };
    }
}

function relImpactSpeed(bodyA, bodyB) {
    const va = bodyA.velocity
    const vb = bodyB.velocity
    const v = new Vector2(va.x - vb.x, va.y - vb.y);
    return v.__length();
}

function addBreakBlock(x, y, velocity){
    var epoch = levelEpoch;
    var breack_block = level.__addChildBox({
        __img: 'break_' + randomInt(1, 9),
        __ofs: [x, y, -20],
        __rotate: randomInt(0, 360),
        __physics: {
            __isStatic: false,
            __friction: 10,
            __frictionAir: 1,
            __frictionStatic: 50,
            __restitution: 0,
            __density: 1,
            __bodyType: 1
        }
    });
    looperPost(a => {
        if (epoch !== levelEpoch || !breack_block.__ph_body)
            return;
        ph_Body.setVelocity(breack_block.__ph_body, new Vector2(velocity.x + randomFloat(-10, 10),velocity.y + randomFloat(-8, 3)));
        _setTimeout(() => {
            if (epoch !== levelEpoch || !breack_block.__ph_body)
                return;
            initCollision(breack_block.__ph_body, breack_block, 50);
            _setTimeout(() => {
                if (epoch !== levelEpoch || breack_block.__destructed)
                    return;
                removeBlock(breack_block);
            }, randomFloat(5, 10));
        }, 1);
    });
}

function awakeBlocks(){
    $each(blocks, b => {
        if (b && b.__ph_awake)
            b.__ph_awake();
    });
}

function removeBlock(block){
    removeFromArray(block, blocks);
    var size = block.__size
        , body = block.__ph_body
        , v = body ? body.velocity : { x: 0, y: 0 };

    block.__removeFromParent();

    looperPostOne(awakeBlocks);
    
    
    if (block.__needBreaks) {
        
        playSound('break_' + randomInt(1, 4), 0, 0, 0.5);
        
        var step = 50,
            bx = block.__x - size.x/2, 
            by = block.__y - size.y/2;

        // todo: не учитывается вращение блока
        for (var x = 0; x < size.x; x += step) {
            for (var y = 0; y < size.y; y += step) {
                addBreakBlock(bx + x, by + y, v);
            }
        }

        big_blocks--;
        if (big_blocks <= 0 && !levelEnded) {
            var epoch = levelEpoch;
            if (winResultTimeout)
                _clearTimeout(winResultTimeout);
            winResultTimeout = _setTimeout(() => {
                winResultTimeout = 0;
                if (epoch !== levelEpoch)
                    return;
                show_result(1);
            }, 1);
        }
    } else {
        if (random() > 0.5 && !windowManager.__hasOpenedWindow()) {
            playSound('break_' + randomInt(1, 4), 0, 0, 0.5);
        }
    }

}

function initCollision(body, node, hp){
    blocks.push(node);
    body.__hp = hp;
    body.__onCollision = (speed) => {
        // Пока физика стабилизирует стартовые касания с землёй — урон не наносим
        if (!damageEnabled)
            return;
        var dmg = floor(clamp((speed - 1) * (speed - 2), 0, 100));
        if (dmg && body.__hp) {
            // consoleLog('damage', dmg);
            body.__hp = mmax(0, body.__hp - dmg);
            if (!body.__hp) {
                body.__onCollision = 0;
                looperPost(a => {
                    removeBlock(node);
                });
            }
        }
    }
}

function resetScoreState() {
    shotsCount = 0;
    totalBlocks = 0;
    lastScore = 0;
    lastStars = 0;
    levelEnded = 0;
    damageEnabled = 0;
}

function canShoot() {
    return !levelEnded && shotsCount < MAX_SHOTS && !windowManager.__hasOpenedWindow();
}

function ensureLoseSound() {
    // Строковый ключ: после minify sounds.lose не совпадает со спрайтом sounds['lose']
    if (sounds['lose'] || !__window.Howl)
        return;
    try {
        sounds['lose'] = {
            howl: new Howl({
                src: ['sounds/lose.mp3'],
                onend: __onSoundEnd
            })
        };
    } catch (err) { }
}

function countRemainingBigBlocks() {
    var n = 0;
    if (!level)
        return mmax(0, big_blocks);
    level.__traverse(node => {
        if (node && node.__needBreaks && !node.__destructed)
            n++;
    });
    return n;
}

function getShotBall(i) {
    if (!shotsHud)
        return;
    var name = 'ball_' + i
        , ball = shotsHud[name] || (shotsHud.__alias && shotsHud.__alias(name));
    if (ball)
        return ball;
    if (shotsHud.__childs) {
        for (var c = 0; c < shotsHud.__childs.length; c++) {
            if (shotsHud.__childs[c] && shotsHud.__childs[c].name === name)
                return shotsHud.__childs[c];
        }
        // запасной порядок: дети по индексу
        if (shotsHud.__childs[i])
            return shotsHud.__childs[i];
    }
}

function createShotsHud() {
    if (!level)
        return;

    // Предпочитаем узел из layout (shots_hud), чтобы позицию/иконки править в редакторе
    shotsHud = level.__alias('shots_hud') || level.shots_hud;
    if (!shotsHud) {
        shotsHud = level.__addChildBox({
            name: 'shots_hud',
            __size: [200, 56],
            __ofs: [-500, -300, 100],
            __alpha: 1
        });
        for (var i = 0; i < MAX_SHOTS; i++) {
            shotsHud.__addChildBox({
                name: 'ball_' + i,
                __img: 'circle1',
                __size: [48, 48],
                __ofs: [i * 56, 0],
                __alpha: 1
            });
        }
    } else {
        shotsHud.__alpha = 1;
        shotsHud.__z = 100;
        for (var i = 0; i < MAX_SHOTS; i++) {
            var ball = getShotBall(i);
            if (ball)
                ball.__alpha = 1;
        }
    }

    updateShotsHud();
}

function updateShotsHud() {
    if (!shotsHud)
        return;

    // Скрываем израсходованные слева направо: 1 выстрел → нет ball_0, и т.д.
    for (var i = 0; i < MAX_SHOTS; i++) {
        var ball = getShotBall(i)
            , on = i >= shotsCount;
        if (!ball)
            continue;
        ball.__visible = on ? 1 : 0;
        ball.__alpha = on ? 1 : 0;
    }
}

function calcScoreAndStars() {
    var efficiencyBonus = mmax(0, MAX_SHOTS - shotsCount) * SCORE_PER_EFFICIENCY;
    lastScore = totalBlocks * SCORE_PER_BLOCK + efficiencyBonus;
    // 1 бросок → 3★, 2 → 2★, 3 → 1★; при 0 бросках тоже не больше 3
    lastStars = mmin(3, mmax(1, MAX_SHOTS + 1 - shotsCount));
    return { score: lastScore, stars: lastStars };
}

function applyWinStars(starsNode, starCount) {
    if (!starsNode)
        return;

    // Только __childs по индексу: имена _0/_1/_2 в билде пакуются, строки/alias ломаются
    var childs = starsNode.__childs || []
        , i
        , star;
    for (i = 0; i < childs.length; i++) {
        star = childs[i];
        if (!star)
            continue;
        if (i >= starCount) {
            star.__killAllAnimations();
            star.__visible = 0;
            star.__scaleF = 0;
        }
    }
}

function clearLevelFromScene() {
    teardownLevel();
}

function scheduleLoseCheck() {
    var epoch = levelEpoch;
    if (loseCheckTimeout)
        _clearTimeout(loseCheckTimeout);
    loseCheckTimeout = _setTimeout(() => {
        loseCheckTimeout = 0;
        if (epoch !== levelEpoch || levelEnded)
            return;
        if (countRemainingBigBlocks() > 0)
            show_result(0);
    }, LOSE_CHECK_DELAY);
}

function show_result(isVictory) {
    if (levelEnded)
        return;
    levelEnded = 1;

    // не даём сработать отложенному win/lose поверх уже показанного результата
    if (loseCheckTimeout) {
        _clearTimeout(loseCheckTimeout);
        loseCheckTimeout = 0;
    }
    if (winResultTimeout) {
        _clearTimeout(winResultTimeout);
        winResultTimeout = 0;
    }

    if (isVictory) {
        calcScoreAndStars();
        saveLevelResult(currentLevelName, lastStars);
    } else {
        lastScore = 0;
        lastStars = 0;
    }

    var winStarsNode = 0;
    showWindow('win', wnd => {
        wnd.__setAliasesData({
            title: {
                __text: isVictory ? 'you_win' : 'you_lose'
            },
            score: {
                __text: TR('score') + ': ' + lastScore,
                __visible: isVictory ? 1 : 0
            },
            // Функция-alias: ключ пакуется вместе с layout, узел сохраняем в замыкание
            stars(node) {
                winStarsNode = node;
                node.__visible = isVictory ? 1 : 0;
            },
            next_level: {
                __text: isVictory ? 'next_level' : 'restart',
                __visible: isVictory ? (currentLevelName !== 'level_3' ? 1 : 0) : 1,
                __onTap() {
                    if (isVictory) {
                        var currentLevelIndex = levelOrder.indexOf(currentLevelName);
                        var next = levelOrder[currentLevelIndex + 1];
                        if (next && isLevelUnlocked(next))
                            loadLevel(next);
                    } else {
                        loadLevel(currentLevelName);
                    }
                    closeWindow('win');
                },
                __onTapHighlight: 1
            },
            btn_menu: {
                __onTap() {
                    clearLevelFromScene();
                    resetScoreState();
                    closeWindow('win');
                    show_menu();
                },
                __onTapHighlight: 1
            }
        });
    }, () => {
        applyWinStars(winStarsNode, isVictory ? lastStars : 0);
    });

    // звук после UI — ошибка Howl не должна блокировать окно
    try {
        if (isVictory) {
            playSound('win');
        } else {
            ensureLoseSound();
            playSound('lose');
        }
    } catch (err) { }
}

function getLevelAliasesData() {
    return {
        rubber(node) {
            rubber = node;
        },

        shots_hud(node) {
            shotsHud = node;
        },

        userInputArea: {
            __dragDist: 1,
            __drag(x, y, dx, dy) {
                if (!canShoot())
                    return;
                // натягиваем резинку
                var dmouse = this.__dmouse = this.__worldPosition.__clone().sub(new Vector2(x, y));
                rubber.__parent.__rotate = -dmouse.__angle() * RAD2DEG;
                rubber.__width = dmouse.__length();
            },
            __dragStart() {
                if (!canShoot())
                    return;
                rubber.__killAllAnimations();
            },
            __dragEnd() {
                rubber.__anim({
                    __width: 10
                }, 0.4, 0, easeElasticO);

                if (!canShoot() || !this.__dmouse)
                    return;

                playSound('punch');
                shotsCount++;
                updateShotsHud();

                var epoch = levelEpoch
                    , wp = this.__worldPosition
                    , bullet = level.__addChildBox({
                        __effect: 'tail',
                        __img: 'circle1',
                        __size: [28, 28],
                        __ofs: [wp.x, wp.y, -20],
                        __physics: {
                            __isStatic: false,
                            __friction: 130,
                            __frictionAir: 0.2,
                            __frictionStatic: 500,
                            __restitution: 10,
                            __density: 4,
                            __bodyType: 1
                        }
                    }).update()
                    , velocity = this.__dmouse.__multiplyScalar(0.2);

                if (bullet.__ph_body) {
                    ph_Body.setVelocity(bullet.__ph_body, velocity);
                }

                // пуля исчезает через BULLET_LIFETIME сек
                _setTimeout(() => {
                    if (epoch !== levelEpoch || bullet.__destructed)
                        return;
                    bullet.__removeFromParent();
                }, BULLET_LIFETIME);

                if (shotsCount >= MAX_SHOTS)
                    scheduleLoseCheck();
            }
        }
    };
}

function setupCollisionHandler() {
    if (collisionHandlerRegistered)
        return;

    initPhysics();

    if (!ph_Events || !ph_Engine)
        return;

    collisionHandlerRegistered = 1;

    ph_Events.on(ph_Engine, 'collisionStart', (event) => {
        var pairs = event.pairs, i, pair, bodyA, bodyB, speed;
        for (i = 0; i < pairs.length; i++) {
            pair = pairs[i];
            bodyA = pair.bodyA;
            bodyB = pair.bodyB;
            speed = relImpactSpeed(bodyA, bodyB);

            if (bodyA && bodyA.__onCollision) bodyA.__onCollision(speed);
            if (bodyB && bodyB.__onCollision) bodyB.__onCollision(speed);
        }
    });
}

function initLevelBlocks() {
    var epoch = levelEpoch;
    damageEnabled = 0;
    level.__traverse(node => {
        var body = node.__ph_body;
        if (body && !body.isStatic) {
            node.__needBreaks = 1;
            big_blocks++;
            initCollision(body, node, 100);
        }
    });
    totalBlocks = big_blocks;
    // Даем блокам упасть/улечься без урона, затем включаем разрушение
    if (settleTimeout)
        _clearTimeout(settleTimeout);
    settleTimeout = _setTimeout(() => {
        settleTimeout = 0;
        if (epoch !== levelEpoch)
            return;
        damageEnabled = 1;
    }, SETTLE_GRACE);
}

function loadLevel(layoutName) {
    teardownLevel();
    resetScoreState();
    currentLevelName = layoutName;

    var epoch = levelEpoch;

    level = scene
        .__addChildBox(layoutName)
        .__setAliasesData(getLevelAliasesData());

    _setTimeout(() => {
        if (epoch !== levelEpoch || !level)
            return;
        setupCollisionHandler();
        level.update(1);
        initLevelBlocks();
        createShotsHud();
    }, 0);
}

function ensureMenuStars(btn) {
    var row = btn['menu_stars'];
    if (row)
        return row;

    row = btn.__addChildBox({
        name: 'menu_stars',
        __needScissor: false,
        __size: [90, 26],
        __y: -48
    });

    for (var i = 0; i < 3; i++) {
        row.__addChildBox({
            name: 's' + i,
            __img: 'star2',
            __alpha: 1,
            __visible: 0,
            __size: [24, 24],
            __ofs: [(i - 1) * 28, 0]
        });
    }

    return row;
}

function updateMenuLevelVisuals(menuBtns) {
    // menuBtns — массив узлов кнопок из aliases (имена в билде пакуются, __alias('btn_level_N') ломается)
    for (var i = 0; i < levelOrder.length; i++) {
        var levelName = levelOrder[i]
            , btn = menuBtns[i]
            , unlocked = isLevelUnlocked(levelName)
            , starsCount = getLevelStars(levelName)
            , row
            , s
            , star
            , stars;

        if (!btn)
            continue;

        btn.__needScissor = false;
        btn.__alpha = unlocked ? 1 : 0.35;
        btn.__disabled = unlocked ? 0 : 1;

        row = ensureMenuStars(btn);
        row.__needScissor = false;
        stars = row.__childs || [];
        for (s = 0; s < 3; s++) {
            star = stars[s] || row['s' + s];
            if (!star)
                continue;
            star.__alpha = 1;
            star.__visible = s < starsCount ? 1 : 0;
        }
    }
}

function bindMenuLevelButton(node, levelName, menuBtns, index) {
    menuBtns[index] = node;
    var handler = makeLevelButtonHandler(levelName);
    node.__onTap = handler.__onTap;
    node.__onTapHighlight = 1;
}

function makeLevelButtonHandler(levelName) {
    return {
        __onTap() {
            if (!isLevelUnlocked(levelName))
                return;
            loadLevel(levelName);
            closeWindow('menu');
        },
        __onTapHighlight: 1
    };
}

function show_menu() {
    var menuBtns = [];
    showWindow('menu', wnd => {
        // Ключи btn_level_* пакуются вместе с layout; узлы сохраняем в menuBtns по индексу
        wnd.__setAliasesData({
            btn_level_1(node) { bindMenuLevelButton(node, 'level_1', menuBtns, 0); },
            btn_level_2(node) { bindMenuLevelButton(node, 'level_2', menuBtns, 1); },
            btn_level_3(node) { bindMenuLevelButton(node, 'level_3', menuBtns, 2); }
        });
    }, () => {
        updateMenuLevelVisuals(menuBtns);
    });
}

BUS.__addEventListener(
    __ON_GAME_LOADED, () => {
        loadLevel(currentLevelName);
        return 1;
    }
);
