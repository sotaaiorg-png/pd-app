// === POCKET DOWN PHOENIX — BLOCK HANDLERS PART 1 ===
// Event, Control, Physics, Objects

(function () {
    'use strict';

    /* Wait for base.js to finish (same-frame load order) */
    const H = window.PD_HANDLERS;

    /* ─── HELPER: skip body of loop/if/repeat/for to matching end_block ── */
    function skipBody(thread) {
        let depth = 1, i = thread.pc + 1;
        const scripts = thread.obj.scripts;
        while (i < scripts.length && depth > 0) {
            const t = scripts[i].type;
            if (t==='loop'||t==='if'||t==='repeat'||t==='for_range'||t==='for_each') depth++;
            if (t==='end_block') depth--;
            i++;
        }
        thread.pc = i;
        return null;
    }

    /* ─── EVENT BLOCKS ─────────────────────────────────────────────────── */
    /* All event triggers just advance pc — threads are started externally */
    ['start','tap','tap_screen','back_btn','touch_enter_obj','touch_up_obj',
     'touch_move_screen','touch_up_screen','msg_rx','cond_true',
     'clone_start','scroll','hit_obj'].forEach(type => {
        H[type] = t => { t.pc++; return null; };
    });

    /* ─── CONTROL BLOCKS ───────────────────────────────────────────────── */

    H['wait'] = function (thread, block, runtime) {
        const sec = Number(window.evalFormula(block.params.sec, thread.obj));
        if (sec > 0) { thread.sleeping = sec; thread.pc++; return 'YIELD'; }
        thread.pc++;
        return null;
    };

    H['loop'] = function (thread, block) {
        thread.stack.push({ type:'loop', bodyStart: thread.pc + 1 });
        thread.pc++;
        return null;
    };

    H['if'] = function (thread, block, runtime) {
        const cond = window.evalFormula(block.params.cond, thread.obj);
        if (window.isTruthy(cond)) {
            thread.stack.push({ type:'if', bodyStart: thread.pc + 1 });
            thread.pc++;
        } else {
            skipBody(thread);
        }
        return null;
    };

    H['repeat'] = function (thread, block, runtime) {
        const times = Number(window.evalFormula(block.params.times, thread.obj));
        thread.stack.push({
            type:'repeat',
            bodyStart: thread.pc + 1,
            count: 0,
            max: times === 0 ? Infinity : Math.max(0, times),
        });
        thread.pc++;
        return null;
    };

    H['for_range'] = function (thread, block, runtime) {
        const start = Number(window.evalFormula(block.params.start, thread.obj));
        const end   = Number(window.evalFormula(block.params.end,   thread.obj));
        const varName = String(block.params.var);
        if (start > end) { skipBody(thread); return null; }
        runtime.vars[varName] = start;
        thread.stack.push({ type:'for_range', bodyStart:thread.pc+1, current:start, end, varName });
        thread.pc++;
        return null;
    };

    H['for_each'] = function (thread, block, runtime) {
        const listName = String(block.params.list);
        const varName  = String(block.params.var);
        const list = runtime.lists[listName] || [];
        if (list.length === 0) { skipBody(thread); return null; }
        runtime.vars[varName] = list[0];
        thread.stack.push({ type:'for_each', bodyStart:thread.pc+1, index:0, list:[...list], varName });
        thread.pc++;
        return null;
    };

    H['end_block'] = function (thread, block, runtime) {
        if (thread.stack.length === 0) { thread.pc++; return null; }

        const frame = thread.stack[thread.stack.length - 1];

        switch (frame.type) {
            case 'loop':
                thread.pc = frame.bodyStart;
                return 'YIELD';   /* yield every iteration — allows Ждать inside */

            case 'repeat':
                frame.count++;
                if (frame.count < frame.max) { thread.pc = frame.bodyStart; return null; }
                thread.stack.pop(); thread.pc++; return null;

            case 'for_range':
                frame.current++;
                if (frame.current <= frame.end) {
                    runtime.vars[frame.varName] = frame.current;
                    thread.pc = frame.bodyStart; return null;
                }
                thread.stack.pop(); thread.pc++; return null;

            case 'for_each':
                frame.index++;
                if (frame.index < frame.list.length) {
                    runtime.vars[frame.varName] = frame.list[frame.index];
                    thread.pc = frame.bodyStart; return null;
                }
                thread.stack.pop(); thread.pc++; return null;

            case 'if':
                thread.stack.pop(); thread.pc++; return null;

            default:
                thread.pc++; return null;
        }
    };

    /* ─── SCENE ─────────────────────────────────────────────────────────── */

    H['scene_start'] = function (thread, block, runtime) {
        const name = String(window.evalFormula(block.params.name, thread.obj));
        const idx = runtime.projectData.scenes.findIndex(s => s.name === name);
        if (idx >= 0) window.loadScene(idx, false);
        return 'STOP';
    };

    H['scene_continue'] = function (thread, block, runtime) {
        const name = String(window.evalFormula(block.params.name, thread.obj));
        const idx = runtime.projectData.scenes.findIndex(s => s.name === name);
        if (idx >= 0) window.loadScene(idx, true);
        return 'STOP';
    };

    /* ─── CLONES ────────────────────────────────────────────────────────── */

    function _deepClone(obj) {
        return {
            ...obj,
            id: 'clone_' + Math.random().toString(36).substr(2),
            looks:     JSON.parse(JSON.stringify(obj.looks)),
            sounds:    JSON.parse(JSON.stringify(obj.sounds)),
            localVars: { ...obj.localVars },
            cloneId:   null,
            isClone:   true,
        };
    }

    function _spawnClone(parent, cloneId, runtime) {
        const clone = _deepClone(parent);
        if (cloneId !== null) clone.cloneId = cloneId;
        runtime.objects.push(clone);
        clone.scripts.forEach((b, i) => {
            if (b.cat === 'event' && b.type === 'clone_start' && !b.disabled)
                window.startThread(clone, i);
        });
    }

    H['clone_obj'] = function (thread, block, runtime) {
        _spawnClone(thread.obj, null, runtime);
        thread.pc++; return null;
    };

    H['clone_obj_id'] = function (thread, block, runtime) {
        const id = String(window.evalFormula(block.params.id, thread.obj));
        _spawnClone(thread.obj, id, runtime);
        thread.pc++; return null;
    };

    H['del_clone'] = function (thread, block, runtime) {
        if (thread.obj.isClone) {
            const idx = runtime.objects.indexOf(thread.obj);
            if (idx > -1) runtime.objects.splice(idx, 1);
            return 'STOP';
        }
        thread.pc++; return null;
    };

    H['del_clone_id'] = function (thread, block, runtime) {
        const id = String(window.evalFormula(block.params.id, thread.obj));
        const idx = runtime.objects.findIndex(o => o.cloneId === id);
        if (idx > -1) runtime.objects.splice(idx, 1);
        thread.pc++; return null;
    };

    /* ─── BROADCAST ─────────────────────────────────────────────────────── */

    function _fireBroadcast(msg, runtime) {
        const spawned = [];
        runtime.objects.forEach(obj => {
            obj.scripts.forEach((b, i) => {
                if (b.cat === 'event' && b.type === 'msg_rx' && !b.disabled &&
                    String(b.params.msg) === msg) {
                    spawned.push(window.startThread(obj, i));
                }
            });
        });
        return spawned;
    }

    H['broadcast'] = function (thread, block, runtime) {
        const msg = String(window.evalFormula(block.params.msg, thread.obj));
        _fireBroadcast(msg, runtime);
        thread.pc++; return null;
    };

    H['broadcast_wait'] = function (thread, block, runtime) {
        const msg = String(window.evalFormula(block.params.msg, thread.obj));
        const spawned = _fireBroadcast(msg, runtime);
        if (spawned.length === 0) { thread.pc++; return null; }
        thread.waitingFor = 'broadcast_wait';
        thread.broadcastWaitIds = spawned.map(t => t.id);
        thread.pc++;
        return 'YIELD';
    };

    /* ─── PHYSICS BLOCKS ────────────────────────────────────────────────── */

    const _ef = (p, b, o) => window.evalFormula(b.params[p], o);
    const _n  = (p, b, o) => Number(_ef(p, b, o));
    const _s  = (p, b, o) => String(_ef(p, b, o));

    function _simple(prop, param, transform) {
        return function (thread, block) {
            thread.obj[prop] = transform ? transform(_n(param, block, thread.obj)) : _n(param, block, thread.obj);
            thread.pc++; return null;
        };
    }

    H['set_x']    = _simple('x',   'val');
    H['set_y']    = _simple('y',   'val');
    H['change_x'] = function (t, b) { t.obj.x += _n('val',b,t.obj); t.pc++; return null; };
    H['change_y'] = function (t, b) { t.obj.y += _n('val',b,t.obj); t.pc++; return null; };
    H['set_layer']= _simple('layer','val');
    H['set_mass'] = _simple('mass','val', v => Math.max(0.001, v));
    H['set_gravity'] = _simple('gravity','val');
    H['set_vel_x']   = _simple('vx','val');
    H['set_vel_y']   = _simple('vy','val');
    H['set_restitution'] = _simple('restitution','val', v => Math.max(0,Math.min(1,v)));
    H['set_friction']    = _simple('friction','val',    v => Math.max(0,Math.min(1,v)));

    H['jump_x'] = function (t, b) { t.obj.vx += _n('pow',b,t.obj); t.pc++; return null; };
    H['jump_y'] = function (t, b) { t.obj.vy += _n('pow',b,t.obj); t.pc++; return null; };

    H['turn_left'] = function (t, b) {
        t.obj.direction = (((t.obj.direction - _n('deg',b,t.obj)) % 360) + 360) % 360;
        t.pc++; return null;
    };
    H['turn_right'] = function (t, b) {
        t.obj.direction = (((t.obj.direction + _n('deg',b,t.obj)) % 360) + 360) % 360;
        t.pc++; return null;
    };
    H['set_dir'] = function (t, b) {
        const p = b.params.val !== undefined ? 'val' : 'deg';
        t.obj.direction = (((_n(p,b,t.obj) % 360) + 360) % 360);
        t.pc++; return null;
    };

    H['move_steps'] = function (t, b) {
        const steps = _n('steps', b, t.obj);
        const rad = t.obj.direction * Math.PI / 180;
        t.obj.x += Math.cos(rad) * steps;
        t.obj.y += Math.sin(rad) * steps;
        t.pc++; return null;
    };

    H['point_to'] = function (t, b, runtime) {
        const name = _s('obj', b, t.obj);
        let tx, ty;
        if (name === 'touch' || name === 'палец') {
            tx = runtime.lastTouch.x; ty = runtime.lastTouch.y;
        } else {
            const target = runtime.objects.find(o => o.name === name);
            if (!target) { t.pc++; return null; }
            tx = target.x; ty = target.y;
        }
        t.obj.direction = ((Math.atan2(ty - t.obj.y, tx - t.obj.x) * 180 / Math.PI) + 360) % 360;
        t.pc++; return null;
    };

    H['set_rot_style']  = function (t, b) { t.obj.rotationStyle = _s('style', b, t.obj); t.pc++; return null; };
    H['set_phys_type']  = function (t, b) { t.obj.physType = _s('type', b, t.obj);        t.pc++; return null; };

    /* ─── OBJECT BLOCKS ─────────────────────────────────────────────────── */

    H['set_look'] = function (t, b) {
        const name = _s('name', b, t.obj);
        const idx = t.obj.looks.findIndex(l => l.name === name);
        if (idx >= 0) t.obj.lookIdx = idx;
        t.pc++; return null;
    };
    H['set_look_idx'] = function (t, b) {
        const num = _n('num', b, t.obj) - 1;
        if (num >= 0 && num < t.obj.looks.length) t.obj.lookIdx = num;
        t.pc++; return null;
    };
    H['next_look'] = function (t) {
        if (t.obj.looks.length) t.obj.lookIdx = (t.obj.lookIdx + 1) % t.obj.looks.length;
        t.pc++; return null;
    };
    H['prev_look'] = function (t) {
        if (t.obj.looks.length) t.obj.lookIdx = (t.obj.lookIdx - 1 + t.obj.looks.length) % t.obj.looks.length;
        t.pc++; return null;
    };
    H['set_size']    = function (t, b) { t.obj.size = _n('val', b, t.obj);          t.pc++; return null; };
    H['change_size'] = function (t, b) { t.obj.size += _n('val', b, t.obj);         t.pc++; return null; };
    H['hide']        = function (t)    { t.obj.show = false;                         t.pc++; return null; };
    H['show']        = function (t)    { t.obj.show = true;                          t.pc++; return null; };
    H['set_bg_color']= function (t, b, rt) { rt.backgroundColor = _s('hex', b, t.obj); t.pc++; return null; };

    H['set_alpha']    = function (t, b) { t.obj.alpha = Math.max(0, Math.min(1, _n('val',b,t.obj)/100)); t.pc++; return null; };
    H['change_alpha'] = function (t, b) { t.obj.alpha = Math.max(0, Math.min(1, t.obj.alpha + _n('val',b,t.obj)/100)); t.pc++; return null; };
    H['set_bri']      = function (t, b) { t.obj.brightness = _n('val', b, t.obj);   t.pc++; return null; };
    H['change_bri']   = function (t, b) { t.obj.brightness += _n('val', b, t.obj);  t.pc++; return null; };
    H['set_hue']      = function (t, b) { t.obj.hue = _n('val', b, t.obj);           t.pc++; return null; };
    H['change_hue']   = function (t, b) { t.obj.hue += _n('val', b, t.obj);          t.pc++; return null; };
    H['set_sat']      = function (t, b) { t.obj.saturation = _n('val', b, t.obj);    t.pc++; return null; };
    H['change_sat']   = function (t, b) { t.obj.saturation += _n('val', b, t.obj);   t.pc++; return null; };

    /* Camera */
    H['cam_follow']   = function (t, _, rt) { rt.camera.following = t.obj.name; t.pc++; return null; };
    H['cam_unfollow'] = function (t, _, rt) { rt.camera.following = null;       t.pc++; return null; };
    H['cam_zoom']     = function (t, b, rt) { rt.camera.zoom = Math.max(0.1, _n('val',b,t.obj)); t.pc++; return null; };
    H['cam_x']        = function (t, b, rt) { rt.camera.x = _n('val',b,t.obj); t.pc++; return null; };
    H['cam_y']        = function (t, b, rt) { rt.camera.y = _n('val',b,t.obj); t.pc++; return null; };

    /* Ask dialog */
    H['ask'] = function (thread, block, runtime) {
        const question = String(window.evalFormula(block.params.q,   thread.obj));
        const varName  = String(block.params.var);

        const overlay = document.createElement('div');
        overlay.className = 'pd-ask-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:999998;';
        overlay.innerHTML = `
          <div style="background:#1a1a1a;border-radius:18px;padding:24px 20px;width:min(320px,90vw);border:1px solid #2e2e2e;">
            <div style="color:#fff;font-size:15px;margin-bottom:16px;text-align:center;line-height:1.4;">${question}</div>
            <input id="pd-ask-inp" type="text" autocomplete="off"
              style="width:100%;padding:11px 14px;background:#252525;border:1px solid #3a3a3a;border-radius:10px;color:#fff;font-size:15px;box-sizing:border-box;outline:none;">
            <div style="display:flex;gap:10px;margin-top:14px;">
              <button id="pd-ask-cancel" style="flex:1;padding:11px;background:#252525;border:1px solid #3a3a3a;border-radius:10px;color:#999;font-size:14px;cursor:pointer;">Отмена</button>
              <button id="pd-ask-ok"     style="flex:1;padding:11px;background:#3d7eff;border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">OK</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);

        const inp = overlay.querySelector('#pd-ask-inp');
        const confirm = () => { runtime.vars[varName] = inp.value; overlay.remove(); thread.waitingFor = null; };
        const cancel  = () => { overlay.remove(); thread.waitingFor = null; };

        setTimeout(() => inp?.focus(), 60);
        overlay.querySelector('#pd-ask-ok').onclick     = confirm;
        overlay.querySelector('#pd-ask-cancel').onclick = cancel;
        inp.onkeydown = e => { if (e.key==='Enter') confirm(); if (e.key==='Escape') cancel(); };

        thread.waitingFor = 'ask';
        thread.pc++;
        return 'YIELD';
    };

    /* Image from URL */
    H['img_from_url'] = function (thread, block, runtime) {
        const url = String(window.evalFormula(block.params.url, thread.obj));
        const obj = thread.obj;
        thread.waitingFor = 'img';
        thread.pc++;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                c.getContext('2d').drawImage(img, 0, 0);
                const newLook = { id:'url_'+Date.now(), name:'URL', src:c.toDataURL() };
                obj.looks.push(newLook);
                runtime.images[newLook.id] = img;
                obj.lookIdx = obj.looks.length - 1;
            } catch {}
            thread.waitingFor = null;
        };
        img.onerror = () => { thread.waitingFor = null; };
        img.src = url;
        return 'YIELD';
    };

})();
