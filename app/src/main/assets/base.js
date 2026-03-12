// === POCKET DOWN PHOENIX — LAUNCH ENGINE v7 ===

(function () {
    'use strict';

    /* ─── RUNTIME STATE ─────────────────────────────────────── */
    let _canvas, _ctx, _raf = null;

    const RT = {
        vars: {}, lists: {}, objects: [], threads: [],
        images: {}, sounds: {}, widgets: [], displayVars: [],
        camera: { x: 0, y: 0, zoom: 1, following: null },
        backgroundColor: '#000000',
        currentScene: 0, projectData: null,
        orientation: 'p', globalVolume: 1,
        lastTouch: { x: 0, y: 0 }, isPressingScreen: false,
        fonts: {}, resources: {},
        fps: 60, _fpsF: 0, _fpsT: 0,
        scrollDelta: 0, _batteryLevel: 100,
    };

    window.runtime = RT;

    /* ─── FORMULA EVALUATOR ──────────────────────────────────── */
    function evalFormula(expr, obj) {
        if (typeof expr === 'number')  return expr;
        if (typeof expr === 'boolean') return expr;
        if (expr === null || expr === undefined) return 0;

        let s = String(expr).trim();

        /* String literals */
        if ((s[0] === '"' && s[s.length-1] === '"') ||
            (s[0] === "'" && s[s.length-1] === "'")) return s.slice(1, -1);

        /* Pure number */
        if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);

        /* Device */
        s = s.replace(/\bфпс\b/g,       () => Math.round(RT.fps));
        s = s.replace(/\bпрокрутка\b/g, () => RT.scrollDelta);
        s = s.replace(/\bвремя\b/g, () => {
            const n = new Date();
            return `"${pad2(n.getHours())}:${pad2(n.getMinutes())}"`;
        });
        s = s.replace(/\bдата\b/g, () => {
            const n = new Date();
            return `"${pad2(n.getDate())}.${pad2(n.getMonth()+1)}.${n.getFullYear()}"`;
        });
        s = s.replace(/\bбатарея\b/g, () => RT._batteryLevel);

        /* Object properties */
        if (obj) {
            s = s.replace(/\bпалец_X\b/g, RT.lastTouch.x);
            s = s.replace(/\bпалец_Y\b/g, RT.lastTouch.y);
            s = s.replace(/\bкоорд_X\b/g, obj.x);
            s = s.replace(/\bкоорд_Y\b/g, obj.y);
            s = s.replace(/\bразмер\b/g,  obj.size);
            s = s.replace(/\bнаправление\b/g, obj.direction);
            s = s.replace(/\bслой\b/g,    obj.layer);
            s = s.replace(/\bпрозрачность\b/g, (obj.alpha * 100).toFixed(0));
            s = s.replace(/\bяркость\b/g, obj.brightness);
            s = s.replace(/\bоттенок\b/g, obj.hue);
            s = s.replace(/\bнасыщенность\b/g, obj.saturation);
            s = s.replace(/\bномер_образа\b/g,  (obj.lookIdx || 0) + 1);
            s = s.replace(/\bимя_образа\b/g,    () => {
                const l = obj.looks && obj.looks[obj.lookIdx];
                return l ? `"${l.name}"` : '""';
            });
            s = s.replace(/\bкол-во_образов\b/g, (obj.looks && obj.looks.length) || 0);
            s = s.replace(/\bскорость_X\b/g, obj.vx || 0);
            s = s.replace(/\bскорость_Y\b/g, obj.vy || 0);

            s = s.replace(/касается_объекта\(([^)]+)\)/g, (_, name) => {
                const t = RT.objects.find(o => o.name === name.trim().replace(/['"]/g,'') && o.show);
                if (!t || !obj.show) return 'false';
                return String(Math.hypot(obj.x-t.x, obj.y-t.y) < (obj.size+t.size)/4);
            });
            s = s.replace(/\bкасается_края\b/g, () => {
                if (!_canvas) return 'false';
                const hw = _canvas.width/2, hh = _canvas.height/2, r = obj.size/2;
                return String(obj.x-r<-hw || obj.x+r>hw || obj.y-r<-hh || obj.y+r>hh);
            });
            s = s.replace(/\bкасается_пальца\b/g, () =>
                String(Math.hypot(obj.x-RT.lastTouch.x, obj.y-RT.lastTouch.y) < obj.size/2));
            s = s.replace(/расстояние_до\(([^)]+)\)/g, (_, name) => {
                const t = RT.objects.find(o => o.name === name.trim().replace(/['"]/g,''));
                return t ? String(Math.hypot(obj.x-t.x, obj.y-t.y)) : '0';
            });
        }

        /* List functions */
        s = s.replace(/размер_списка\(([^)]+)\)/g, (_, ln) => {
            const list = RT.lists[ln.trim().replace(/['"]/g,'')];
            return list ? list.length : 0;
        });
        s = s.replace(/элемент\(([^,]+),([^)]+)\)/g, (_, idx, ln) => {
            const list = RT.lists[ln.trim().replace(/['"]/g,'')];
            try { const i = Number(safeEval(idx.trim())) - 1; return list && list[i]!==undefined ? JSON.stringify(String(list[i])) : '""'; } catch { return '""'; }
        });
        s = s.replace(/индекс\(([^,]+),([^)]+)\)/g, (_, val, ln) => {
            const list = RT.lists[ln.trim().replace(/['"]/g,'')];
            if (!list) return 0;
            try { const v = String(safeEval(val.trim())); return list.findIndex(x => String(x)===v)+1; } catch { return 0; }
        });
        s = s.replace(/содержит_список\(([^,]+),([^)]+)\)/g, (_, ln, val) => {
            const list = RT.lists[ln.trim().replace(/['"]/g,'')];
            if (!list) return 'false';
            try { const v = String(safeEval(val.trim())); return String(list.some(x => String(x)===v)); } catch { return 'false'; }
        });
        s = s.replace(/соеденить_эл\(([^,]+),([^)]+)\)/g, (_, ln, sep) => {
            const list = RT.lists[ln.trim().replace(/['"]/g,'')];
            try { return JSON.stringify((list||[]).join(safeEval(sep.trim()))); } catch { return '""'; }
        });

        /* Math */
        s = s.replace(/рандом\(([^,]+),([^)]+)\)/g, (_,mn,mx) => `(Math.random()*(${mx}-(${mn}))+(${mn}))`);
        s = s.replace(/степень\(([^,]+),([^)]+)\)/g, (_,b,e) => `Math.pow(${b},${e})`);
        s = s.replace(/мин\(([^,]+),([^)]+)\)/g,     (_,a,b) => `Math.min(${a},${b})`);
        s = s.replace(/макс\(([^,]+),([^)]+)\)/g,     (_,a,b) => `Math.max(${a},${b})`);
        s = s.replace(/\bсинус\b/g,      'Math.sin');
        s = s.replace(/\bкосинус\b/g,    'Math.cos');
        s = s.replace(/\bтангенс\b/g,    'Math.tan');
        s = s.replace(/\bарксинус\b/g,   'Math.asin');
        s = s.replace(/\bарккосинус\b/g, 'Math.acos');
        s = s.replace(/арктангенс2\(/g,  'Math.atan2(');
        s = s.replace(/арктангенс\(/g,   'Math.atan(');
        s = s.replace(/\bкорень\b/g,     'Math.sqrt');
        s = s.replace(/\bокруглить\b/g,  'Math.round');
        s = s.replace(/\bокр_вверх\b/g,  'Math.ceil');
        s = s.replace(/\bокр_вниз\b/g,   'Math.floor');
        s = s.replace(/\bабс\b/g,        'Math.abs');
        s = s.replace(/\bлогарифм\b/g,   'Math.log');
        s = s.replace(/\bе_степень\b/g,  'Math.exp');
        s = s.replace(/\bпи\b/g,         'Math.PI');

        /* Strings */
        s = s.replace(/длина\(([^)]+)\)/g,                     (_, t)        => `(String(${t}).length)`);
        s = s.replace(/символ\(([^,]+),([^)]+)\)/g,            (_, i, t)     => `(String(${t})[${i}-1]||"")`);
        s = s.replace(/соединить\(([^,]+),([^,]+),([^)]+)\)/g, (_, a, b, c)  => `(String(${a})+String(${b})+String(${c}))`);
        s = s.replace(/соединить\(([^,]+),([^)]+)\)/g,         (_, a, b)     => `(String(${a})+String(${b}))`);
        s = s.replace(/заменить\(([^,]+),([^,]+),([^)]+)\)/g,  (_, t, o, n)  => `(String(${t}).split(String(${o})).join(String(${n})))`);
        s = s.replace(/верхний_регистр\(([^)]+)\)/g,           (_, t)        => `(String(${t}).toUpperCase())`);
        s = s.replace(/нижний_регистр\(([^)]+)\)/g,            (_, t)        => `(String(${t}).toLowerCase())`);
        s = s.replace(/начинается\(([^,]+),([^)]+)\)/g,        (_, t, sub)   => `(String(${t}).startsWith(String(${sub})))`);
        s = s.replace(/заканчивается\(([^,]+),([^)]+)\)/g,     (_, t, sub)   => `(String(${t}).endsWith(String(${sub})))`);
        s = s.replace(/содержит_текст\(([^,]+),([^)]+)\)/g,    (_, t, sub)   => `(String(${t}).includes(String(${sub})))`);
        s = s.replace(/содержит\(([^,]+),([^)]+)\)/g,          (_, t, sub)   => `(String(${t}).includes(String(${sub})))`);

        /* Variable substitution — longest names first, Unicode-safe boundaries */
        const allVars = {};
        if (obj && obj.localVars) Object.assign(allVars, obj.localVars);
        Object.assign(allVars, RT.vars);
        Object.keys(allVars).sort((a,b) => b.length - a.length).forEach(k => {
            const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(
                `(?<![а-яёА-ЯЁa-zA-Z0-9_])${esc}(?![а-яёА-ЯЁa-zA-Z0-9_])`, 'g'
            );
            const v = allVars[k];
            const rep = (typeof v === 'string' && isNaN(v) && v !== '') ? JSON.stringify(v) : String(v);
            s = s.replace(re, rep);
        });

        /* Logic */
        s = s.replace(/\bистина\b/g, 'true');
        s = s.replace(/\bложь\b/g,   'false');
        s = s.replace(/ и /g,   ' && ');
        s = s.replace(/ или /g, ' || ');
        s = s.replace(/\bне\b /g, '!');
        s = s.replace(/≠/g, '!==');
        s = s.replace(/≤/g, '<=');
        s = s.replace(/≥/g, '>=');
        /* Single = (equality comparison, not ===, !==, <=, >=, ==) → === */
        s = s.replace(/([^!<>=])=([^>=])/g, (m, a, b) => a + '===' + b);

        return safeEval(s);
    }

    function safeEval(s) {
        try {
            const r = eval(s);
            return r === undefined ? s : r;
        } catch {
            const n = parseFloat(s);
            return isNaN(n) ? s.replace(/['"]/g, '') : n;
        }
    }

    function pad2(n) { return String(n).padStart(2,'0'); }

    window.evalFormula = evalFormula;

    /* ─── THREAD ─────────────────────────────────────────────── */
    let _tid = 0;

    function startThread(obj, startPc) {
        const t = {
            id: ++_tid,
            obj,
            startPc,
            pc: startPc,
            sleeping: 0,
            waitingFor: null,      // 'ask' | 'sound' | 'img' | 'broadcast_wait'
            broadcastWaitIds: [],
            stack: [],             // [{type, bodyStart, count, max, varName, end, list, index}]
            finished: false,
            isClone: obj.isClone || false,
        };
        RT.threads.push(t);
        return t;
    }
    window.startThread = startThread;

    /* ─── UPDATE THREADS ─────────────────────────────────────── */
    function updateThreads(dt) {
        /* Tick sleeping */
        for (const t of RT.threads) {
            if (t.sleeping > 0) { t.sleeping -= dt; if (t.sleeping < 0) t.sleeping = 0; }
        }

        /* Resolve broadcast_wait */
        for (const t of RT.threads) {
            if (t.waitingFor === 'broadcast_wait') {
                const done = t.broadcastWaitIds.every(id =>
                    !RT.threads.some(o => o.id === id && !o.finished)
                );
                if (done) { t.waitingFor = null; t.broadcastWaitIds = []; }
            }
        }

        /* Fire cond_true events each frame */
        for (const obj of RT.objects) {
            for (let i = 0; i < obj.scripts.length; i++) {
                const b = obj.scripts[i];
                if (b.cat !== 'event' || b.type !== 'cond_true' || b.disabled) continue;
                try {
                    if (isTruthy(evalFormula(b.params.cond, obj)) &&
                        !RT.threads.some(t => t.obj === obj && t.startPc === i && !t.finished)) {
                        startThread(obj, i);
                    }
                } catch {}
            }
        }

        /* Run each thread */
        for (const t of RT.threads) {
            if (!t.finished) _runThread(t, dt);
        }

        /* Purge finished */
        RT.threads = RT.threads.filter(t => !t.finished);
    }

    function _runThread(thread) {
        const MAX_OPS = 20000;
        let ops = 0;
        while (ops++ < MAX_OPS) {
            if (thread.sleeping > 0)  return;
            if (thread.waitingFor)    return;

            const scripts = thread.obj.scripts;
            if (thread.pc < 0 || thread.pc >= scripts.length) { thread.finished = true; return; }

            const block = scripts[thread.pc];
            if (!block) { thread.finished = true; return; }

            /* Stop if we hit another event block (not our start) */
            if (block.cat === 'event' && thread.pc !== thread.startPc) {
                thread.finished = true;
                return;
            }

            if (block.disabled) { thread.pc++; continue; }

            const result = _exec(thread, block);
            if (result === 'YIELD') return;
            if (result === 'STOP')  { thread.finished = true; return; }
        }
    }

    function _exec(thread, block) {
        const H = window.PD_HANDLERS;
        if (!H) return null;
        const h = H[block.type];
        if (h) return h(thread, block, RT);
        thread.pc++;
        return null;
    }

    /* ─── HELPERS ────────────────────────────────────────────── */
    function isTruthy(v) {
        if (v === true  || v === 'true')  return true;
        if (v === false || v === 'false') return false;
        if (typeof v === 'number') return v !== 0;
        if (typeof v === 'string') return v !== '' && v !== '0';
        return Boolean(v);
    }
    window.isTruthy = isTruthy;

    /* ─── SCENE LOADING ──────────────────────────────────────── */
    function loadScene(sceneIdx, continueMode) {
        const project = RT.projectData;
        if (!project || !project.scenes[sceneIdx]) return;

        RT.currentScene = sceneIdx;
        const scene = project.scenes[sceneIdx];

        if (!continueMode) {
            RT.threads = []; RT.objects = [];
            RT.displayVars = []; RT.widgets = [];
            const ui = document.getElementById('run-ui');
            if (ui) ui.innerHTML = '';
        }

        /* Load fonts */
        if (project.resources) {
            project.resources.forEach(res => {
                RT.resources[res.name] = res;
                if (res.type === 'font' && res.data && !RT.fonts[res.name]) {
                    new FontFace(res.name, `url(${res.data})`).load()
                        .then(f => { document.fonts.add(f); RT.fonts[res.name] = true; })
                        .catch(() => {});
                }
            });
        }

        scene.objects.forEach(objDef => {
            if (continueMode && RT.objects.find(o => o.defId === objDef.id)) return;

            (objDef.looks || []).forEach(look => {
                if (!RT.images[look.id]) {
                    const img = new Image();
                    img.src = look.src;
                    RT.images[look.id] = img;
                }
            });

            (objDef.sounds || []).forEach(snd => {
                if (!RT.sounds[snd.name]) {
                    const a = new Audio(snd.src);
                    a.volume = RT.globalVolume;
                    RT.sounds[snd.name] = a;
                }
            });

            const rtObj = {
                defId: objDef.id,
                id: 'o' + (++_tid),
                name: objDef.name,
                x: 0, y: 0, size: 100,
                lookIdx: 0,
                looks:   JSON.parse(JSON.stringify(objDef.looks  || [])),
                sounds:  JSON.parse(JSON.stringify(objDef.sounds || [])),
                scripts: objDef.scripts,   /* read-only flat array */
                show: true,
                direction: 90,
                rotationStyle: 'вокруг',
                layer: 1,
                alpha: 1,
                brightness: 100, hue: 0, saturation: 100,
                physType: 'без физики',
                vx: 0, vy: 0, mass: 1, gravity: 0, restitution: 0.5, friction: 0.5,
                localVars: {},
                cloneId: null,
                isClone: false,
            };

            RT.objects.push(rtObj);

            if (!continueMode) {
                rtObj.scripts.forEach((b, i) => {
                    if (b.cat === 'event' && b.type === 'start' && !b.disabled)
                        startThread(rtObj, i);
                });
            }
        });
    }
    window.loadScene = loadScene;

    /* ─── PHYSICS ────────────────────────────────────────────── */
    function _updatePhysics(dt) {
        for (const obj of RT.objects) {
            if (obj.physType !== 'динамичный') continue;
            obj.vy += obj.gravity * dt * 60;
            obj.x  += obj.vx * dt * 60;
            obj.y  += obj.vy * dt * 60;

            for (const other of RT.objects) {
                if (other === obj || other.physType !== 'статичный') continue;
                const dist = Math.hypot(obj.x - other.x, obj.y - other.y);
                const minD = (obj.size + other.size) / 4;
                if (dist < minD && dist > 0) {
                    const nx = (obj.x - other.x) / dist;
                    const ny = (obj.y - other.y) / dist;
                    obj.x += nx * (minD - dist);
                    obj.y += ny * (minD - dist);
                    const dot = obj.vx*nx + obj.vy*ny;
                    if (dot < 0) {
                        const e = (obj.restitution + other.restitution) / 2;
                        obj.vx -= (1+e)*dot*nx;
                        obj.vy -= (1+e)*dot*ny;
                        const f = (obj.friction + other.friction) / 2;
                        obj.vx *= (1 - f*0.1);
                        obj.vy *= (1 - f*0.1);
                    }
                }
            }
        }
    }

    /* ─── RENDER ─────────────────────────────────────────────── */
    function _render() {
        if (!_canvas || !_ctx) return;

        /* Camera follow */
        if (RT.camera.following) {
            const t = RT.objects.find(o => o.name === RT.camera.following && o.show);
            if (t) { RT.camera.x = -t.x; RT.camera.y = -t.y; }
        }

        _ctx.fillStyle = RT.backgroundColor;
        _ctx.fillRect(0, 0, _canvas.width, _canvas.height);

        const sorted = [...RT.objects].sort((a,b) => a.layer - b.layer);
        const cx = _canvas.width / 2, cy = _canvas.height / 2;
        const zoom = RT.camera.zoom;

        for (const obj of sorted) {
            if (!obj.show || !obj.looks || obj.looks.length === 0) continue;
            const look = obj.looks[obj.lookIdx];
            if (!look) continue;
            const img = RT.images[look.id];
            if (!img || !img.complete || !img.naturalWidth) continue;

            _ctx.save();

            const sx = (obj.x + RT.camera.x) * zoom + cx;
            const sy = (obj.y + RT.camera.y) * zoom + cy;
            _ctx.translate(sx, sy);

            const rs = obj.rotationStyle;
            if (!rs || rs === 'вокруг') {
                _ctx.rotate((obj.direction - 90) * Math.PI / 180);
            } else if (rs === 'слева-направо' || rs === 'налево-направо') {
                if (Math.cos(obj.direction * Math.PI / 180) < 0) _ctx.scale(-1, 1);
            }
            // 'не вращать' → no rotation

            _ctx.globalAlpha = Math.max(0, Math.min(1, obj.alpha));

            const filters = [];
            if (obj.brightness !== 100) filters.push(`brightness(${obj.brightness}%)`);
            if (obj.hue !== 0)          filters.push(`hue-rotate(${obj.hue}deg)`);
            if (obj.saturation !== 100) filters.push(`saturate(${obj.saturation}%)`);
            if (filters.length) _ctx.filter = filters.join(' ');

            const w = obj.size * zoom;
            const h = (img.naturalHeight / img.naturalWidth) * w;
            _ctx.imageSmoothingEnabled = true;
            _ctx.imageSmoothingQuality = 'high';
            _ctx.drawImage(img, -w/2, -h/2, w, h);

            _ctx.restore();
        }

        /* Display variables — value only, no shadow */
        for (const dv of RT.displayVars) {
            const val = RT.vars[dv.name];
            if (val === undefined && val === null) continue;
            const ff = (dv.font && dv.font !== 'System' && RT.fonts[dv.font]) ? dv.font : 'sans-serif';
            _ctx.save();
            _ctx.font = `${dv.size || 16}px "${ff}"`;
            _ctx.fillStyle = dv.color || '#ffffff';
            _ctx.fillText(String(val !== undefined ? val : 0), dv.x, dv.y);
            _ctx.restore();
        }
    }

    /* ─── EVENTS ─────────────────────────────────────────────── */
    let _evCache = {}, _wheelH = null, _backH = null;

    function _canvasPos(cx, cy) {
        if (!_canvas) return { x:0, y:0 };
        const r = _canvas.getBoundingClientRect();
        const sx = _canvas.width  / r.width;
        const sy = _canvas.height / r.height;
        const x = ((cx - r.left) * sx - _canvas.width  / 2) / RT.camera.zoom;
        const y = ((cy - r.top)  * sy - _canvas.height / 2) / RT.camera.zoom;
        return { x, y };
    }

    function _hitTest(obj, x, y) {
        return obj.show && Math.hypot(obj.x - x, obj.y - y) < obj.size / 2;
    }

    function _fire(type, x, y) {
        for (const obj of RT.objects) {
            for (let i = 0; i < obj.scripts.length; i++) {
                const b = obj.scripts[i];
                if (b.cat !== 'event' || b.disabled || b.type !== type) continue;
                if (type === 'tap' || type === 'touch_enter_obj') {
                    if (x !== null && _hitTest(obj, x, y)) startThread(obj, i);
                } else {
                    startThread(obj, i);
                }
            }
        }
    }

    function _setupEvents() {
        if (!_canvas) return;

        const down = (cx, cy) => {
            const p = _canvasPos(cx, cy);
            RT.lastTouch = p; RT.isPressingScreen = true;
            _fire('tap', p.x, p.y);
            _fire('tap_screen', p.x, p.y);
        };
        const move = (cx, cy) => {
            const p = _canvasPos(cx, cy);
            RT.lastTouch = p;
            if (RT.isPressingScreen) {
                _fire('touch_enter_obj', p.x, p.y);
                _fire('touch_move_screen', p.x, p.y);
            }
        };
        const up = () => {
            RT.isPressingScreen = false;
            _fire('touch_up_obj',    null, null);
            _fire('touch_up_screen', null, null);
        };

        const oTS  = e => { e.preventDefault(); down(e.touches[0].clientX, e.touches[0].clientY); };
        const oTM  = e => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); };
        const oTU  = e => { e.preventDefault(); up(); };
        const oMD  = e => down(e.clientX, e.clientY);
        const oMM  = e => { if (e.buttons) move(e.clientX, e.clientY); };
        const oMU  = () => up();

        _canvas.addEventListener('touchstart', oTS, { passive:false });
        _canvas.addEventListener('touchmove',  oTM, { passive:false });
        _canvas.addEventListener('touchend',   oTU, { passive:false });
        _canvas.addEventListener('mousedown',  oMD);
        _canvas.addEventListener('mousemove',  oMM);
        _canvas.addEventListener('mouseup',    oMU);

        _wheelH = e => {
            e.preventDefault();
            RT.scrollDelta = e.deltaY > 0 ? 1 : -1;
            _fire('scroll', null, null);
            setTimeout(() => { RT.scrollDelta = 0; }, 120);
        };
        _canvas.addEventListener('wheel', _wheelH, { passive:false });

        _backH = () => _fire('back_btn', null, null);
        window.addEventListener('popstate', _backH);

        _evCache = { oTS, oTM, oTU, oMD, oMM, oMU };
    }

    function _removeEvents() {
        if (_canvas) {
            const c = _evCache;
            _canvas.removeEventListener('touchstart', c.oTS);
            _canvas.removeEventListener('touchmove',  c.oTM);
            _canvas.removeEventListener('touchend',   c.oTU);
            _canvas.removeEventListener('mousedown',  c.oMD);
            _canvas.removeEventListener('mousemove',  c.oMM);
            _canvas.removeEventListener('mouseup',    c.oMU);
            if (_wheelH) _canvas.removeEventListener('wheel', _wheelH);
        }
        if (_backH) window.removeEventListener('popstate', _backH);
        _evCache = {}; _wheelH = null; _backH = null;
    }

    /* ─── STOP BUTTON ────────────────────────────────────────── */
    function _injectStopBtn() {
        document.getElementById('pd-stop-btn')?.remove();
        const btn = document.createElement('button');
        btn.id = 'pd-stop-btn';
        btn.textContent = '✕';
        btn.style.cssText = 'position:fixed;top:14px;left:14px;z-index:999999;width:38px;height:38px;background:rgba(0,0,0,0.55);color:#fff;border:none;border-radius:50%;font-size:18px;cursor:pointer;touch-action:manipulation;';
        btn.onclick = () => { window.stopLaunch?.(); window.handleBack?.(); };
        document.body.appendChild(btn);
    }

    /* ─── GAME LOOP ──────────────────────────────────────────── */
    let _lastT = 0;

    function _loop(now) {
        if (!_raf) return;
        _raf = requestAnimationFrame(_loop);

        const dt = Math.min((now - _lastT) / 1000, 0.05);
        _lastT = now;

        RT._fpsF++;
        RT._fpsT += dt;
        if (RT._fpsT >= 1) {
            RT.fps = RT._fpsF / RT._fpsT;
            RT._fpsF = 0; RT._fpsT = 0;
        }

        updateThreads(dt);
        _updatePhysics(dt);
        _render();
    }

    /* ─── START / STOP ───────────────────────────────────────── */
    window.startLaunch = function (projectData, context) {
        const project = Array.isArray(projectData)
            ? projectData.find(p => p.id === context.pid)
            : projectData;
        if (!project) { console.error('PD: project not found'); return; }

        /* Reset runtime */
        RT.projectData = project;
        RT.orientation = project.orientation || 'p';
        RT.vars = {}; RT.lists = {};
        RT.images = {}; RT.sounds = {};
        RT.fonts = {}; RT.resources = {};
        RT.objects = []; RT.threads = [];
        RT.widgets = []; RT.displayVars = [];
        RT.camera = { x:0, y:0, zoom:1, following:null };
        RT.backgroundColor = '#000000';
        RT.globalVolume = 1;
        RT.lastTouch = { x:0, y:0 };
        RT.isPressingScreen = false;
        RT.scrollDelta = 0;
        RT.fps = 60; RT._fpsF = 0; RT._fpsT = 0;

        /* Init project vars */
        if (project.vars) project.vars.forEach(v => {
            if (v.isList) RT.lists[v.name] = [];
            else RT.vars[v.name] = 0;
        });

        _canvas = document.getElementById('game-canvas');
        if (!_canvas) { console.error('PD: no canvas'); return; }
        _ctx = _canvas.getContext('2d', { alpha:false });

        const resize = () => {
            if (!_canvas) return;
            _canvas.width  = window.innerWidth;
            _canvas.height = window.innerHeight;
        };
        resize();
        window._pdResize = resize;
        window.addEventListener('resize', resize);

        loadScene(0, false);
        _setupEvents();
        _injectStopBtn();

        /* Battery */
        if (navigator.getBattery) {
            navigator.getBattery().then(b => { RT._batteryLevel = Math.round(b.level*100); });
        }

        _lastT = performance.now();
        _raf = 1;
        requestAnimationFrame(_loop);
    };

    window.stopLaunch = function () {
        _raf = null;
        _removeEvents();
        if (window._pdResize) { window.removeEventListener('resize', window._pdResize); window._pdResize = null; }

        Object.values(RT.sounds).forEach(a => { try { a.pause(); a.currentTime = 0; } catch {} });

        document.getElementById('pd-stop-btn')?.remove();
        document.querySelectorAll('.pd-ask-overlay').forEach(el => el.remove());

        const ui = document.getElementById('run-ui');
        if (ui) ui.innerHTML = '';

        RT.threads = []; RT.objects = [];
        _canvas = null; _ctx = null;
    };

    /* ─── EXPORTS ────────────────────────────────────────────── */
    window.PD_HANDLERS = {};
    window.updateThreads = updateThreads;   // expose for debugging

})();
