// === POCKET DOWN PHOENIX — BLOCK HANDLERS PART 2 ===
// Sound, Data, Widgets, Device

(function () {
    'use strict';

    const H  = window.PD_HANDLERS;
    const ev = (p, b, o) => window.evalFormula(b.params[p], o);
    const ns = (p, b, o) => Number(ev(p, b, o));
    const ss = (p, b, o) => String(ev(p, b, o));

    /* ─── SOUND ─────────────────────────────────────────────────────────── */

    H['play_sound'] = function (t, b, rt) {
        const name = ss('name', b, t.obj);
        const src  = rt.sounds[name];
        if (src) {
            const clone = src.cloneNode();
            clone.volume = rt.globalVolume;
            clone.play().catch(() => {});
        }
        t.pc++; return null;
    };

    H['play_sound_wait'] = function (thread, block, rt) {
        const name = ss('name', block, thread.obj);
        const src  = rt.sounds[name];
        if (!src) { thread.pc++; return null; }

        const clone = src.cloneNode();
        clone.volume = rt.globalVolume;
        thread.waitingFor = 'sound';
        thread.pc++;

        const done = () => { thread.waitingFor = null; };
        clone.onended = done;
        clone.onerror = done;
        clone.play().catch(done);

        /* Safety timeout */
        const dur = src.duration;
        const ms  = (dur && isFinite(dur)) ? (dur + 0.5) * 1000 : 8000;
        setTimeout(done, ms);

        return 'YIELD';
    };

    H['stop_all_sounds'] = function (t, _, rt) {
        Object.values(rt.sounds).forEach(a => { try { a.pause(); a.currentTime = 0; } catch {} });
        t.pc++; return null;
    };

    H['stop_sound'] = function (t, b, rt) {
        const a = rt.sounds[ss('name', b, t.obj)];
        if (a) { try { a.pause(); a.currentTime = 0; } catch {} }
        t.pc++; return null;
    };

    H['set_vol'] = function (t, b, rt) {
        rt.globalVolume = Math.max(0, Math.min(1, ns('val', b, t.obj) / 100));
        Object.values(rt.sounds).forEach(a => { try { a.volume = rt.globalVolume; } catch {} });
        t.pc++; return null;
    };

    H['change_vol'] = function (t, b, rt) {
        rt.globalVolume = Math.max(0, Math.min(1, rt.globalVolume + ns('val', b, t.obj) / 100));
        Object.values(rt.sounds).forEach(a => { try { a.volume = rt.globalVolume; } catch {} });
        t.pc++; return null;
    };

    H['set_sound_vol'] = function (t, b, rt) {
        const a   = rt.sounds[ss('name', b, t.obj)];
        const vol = Math.max(0, Math.min(1, ns('val', b, t.obj) / 100));
        if (a) a.volume = vol;
        t.pc++; return null;
    };

    /* ─── DATA ───────────────────────────────────────────────────────────── */

    H['show_var'] = function (t, b, rt) {
        const name  = String(b.params.name);
        const x     = ns('x',   b, t.obj);
        const y     = ns('y',   b, t.obj);
        const color = ss('col', b, t.obj) || '#ffffff';
        const size  = ns('sz',  b, t.obj) || 16;
        const font  = String(b.params.font || 'System');

        const ex = rt.displayVars.find(d => d.name === name);
        if (ex) { ex.x=x; ex.y=y; ex.color=color; ex.size=size; ex.font=font; }
        else      rt.displayVars.push({ name, x, y, color, size, font });
        t.pc++; return null;
    };

    H['hide_var'] = function (t, b, rt) {
        rt.displayVars = rt.displayVars.filter(d => d.name !== String(b.params.name));
        t.pc++; return null;
    };

    H['set_var'] = function (t, b, rt) {
        rt.vars[String(b.params.name)] = ev('val', b, t.obj);
        t.pc++; return null;
    };

    H['change_var'] = function (t, b, rt) {
        const name = String(b.params.name);
        rt.vars[name] = (Number(rt.vars[name]) || 0) + ns('val', b, t.obj);
        t.pc++; return null;
    };

    function _lsKey(rt, name) {
        return 'pd_' + (rt.projectData?.id || 'proj') + '_' + name;
    }

    H['save_var'] = function (t, b, rt) {
        const name = String(b.params.name);
        try { localStorage.setItem(_lsKey(rt, name), JSON.stringify(rt.vars[name])); } catch {}
        t.pc++; return null;
    };

    H['load_var'] = function (t, b, rt) {
        const name = String(b.params.name);
        try {
            const raw = localStorage.getItem(_lsKey(rt, name));
            if (raw !== null) rt.vars[name] = JSON.parse(raw);
        } catch {}
        t.pc++; return null;
    };

    H['list_add'] = function (t, b, rt) {
        const ln = String(b.params.list);
        if (!rt.lists[ln]) rt.lists[ln] = [];
        rt.lists[ln].push(ev('val', b, t.obj));
        t.pc++; return null;
    };

    H['list_ins'] = function (t, b, rt) {
        const ln  = String(b.params.list);
        const idx = Math.max(0, ns('idx', b, t.obj) - 1);
        if (!rt.lists[ln]) rt.lists[ln] = [];
        rt.lists[ln].splice(idx, 0, ev('val', b, t.obj));
        t.pc++; return null;
    };

    H['list_del'] = function (t, b, rt) {
        const ln  = String(b.params.list);
        const idx = ns('idx', b, t.obj) - 1;
        if (rt.lists[ln]) rt.lists[ln].splice(idx, 1);
        t.pc++; return null;
    };

    H['list_del_all'] = function (t, b, rt) {
        rt.lists[String(b.params.list)] = [];
        t.pc++; return null;
    };

    H['list_rep'] = function (t, b, rt) {
        const ln  = String(b.params.list);
        const idx = ns('idx', b, t.obj) - 1;
        if (rt.lists[ln] && idx >= 0 && idx < rt.lists[ln].length)
            rt.lists[ln][idx] = ev('val', b, t.obj);
        t.pc++; return null;
    };

    H['save_list'] = function (t, b, rt) {
        const ln = String(b.params.list);
        try { localStorage.setItem(_lsKey(rt, 'list_' + ln), JSON.stringify(rt.lists[ln] || [])); } catch {}
        t.pc++; return null;
    };

    H['load_list'] = function (t, b, rt) {
        const ln = String(b.params.list);
        try {
            const raw = localStorage.getItem(_lsKey(rt, 'list_' + ln));
            if (raw !== null) rt.lists[ln] = JSON.parse(raw);
        } catch {}
        t.pc++; return null;
    };

    H['req_get'] = function (t, b, rt) {
        const url     = ss('url', b, t.obj);
        const varName = String(b.params.var);
        fetch(url).then(r => r.text()).then(d => { rt.vars[varName] = d; }).catch(() => { rt.vars[varName] = 'Error'; });
        t.pc++; return null;
    };

    H['req_post'] = function (t, b, rt) {
        fetch(ss('url', b, t.obj), {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: ss('json', b, t.obj),
        }).catch(() => {});
        t.pc++; return null;
    };

    H['fb_write'] = function (t, b, rt) {
        const base = ss('url', b, t.obj).replace(/\/$/, '');
        const key  = ss('key', b, t.obj);
        const val  = ev('val', b, t.obj);
        fetch(base + key + '.json', {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(val),
        }).catch(() => {});
        t.pc++; return null;
    };

    H['fb_read'] = function (t, b, rt) {
        const base    = ss('url', b, t.obj).replace(/\/$/, '');
        const key     = ss('key', b, t.obj);
        const varName = String(b.params.var);
        fetch(base + key + '.json')
            .then(r => r.json())
            .then(d => { rt.vars[varName] = d; })
            .catch(() => { rt.vars[varName] = 'Error'; });
        t.pc++; return null;
    };

    H['file_write'] = function (t, b, rt) {
        const val  = ss('val',  b, t.obj);
        const name = ss('name', b, t.obj);
        const blob = new Blob([val], { type:'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        t.pc++; return null;
    };

    H['file_read'] = function (t, b, rt) {
        const varName = String(b.params.var);
        const inp     = document.createElement('input');
        inp.type = 'file';
        inp.onchange = e => {
            const f = e.target.files[0]; if (!f) return;
            const r = new FileReader();
            r.onload = ev2 => { rt.vars[varName] = ev2.target.result; };
            r.readAsText(f);
        };
        inp.click();
        t.pc++; return null;
    };

    /* ─── WIDGETS ────────────────────────────────────────────────────────── */

    function _ui()         { return document.getElementById('run-ui'); }
    function _wFind(id,rt) { return rt.widgets.find(w => w.id === id); }

    /* Scroll — horizontal swipe container */
    H['w_scroll_create'] = function (t, b, rt) {
        const id = ss('id', b, t.obj);
        const x  = ns('x',  b, t.obj), y = ns('y', b, t.obj);
        const w  = ns('w',  b, t.obj), h = ns('h', b, t.obj);

        _wFind(id, rt)?.element.remove();
        rt.widgets = rt.widgets.filter(w => w.id !== id);

        const div = document.createElement('div');
        div.id = 'widget-' + id;
        div.style.cssText =
            `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;` +
            `overflow-x:auto;overflow-y:hidden;display:flex;flex-direction:row;` +
            `gap:8px;padding:8px;box-sizing:border-box;` +
            `-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;`;
        /* Hide scrollbar */
        div.style.scrollbarWidth = 'none';
        const styleTag = document.createElement('style');
        styleTag.textContent = `#widget-${id}::-webkit-scrollbar{display:none}`;
        document.head.appendChild(styleTag);

        _ui().appendChild(div);
        rt.widgets.push({ id, element:div, type:'scroll' });
        t.pc++; return null;
    };

    H['w_scroll_add'] = function (t, b, rt) {
        const id      = ss('id',  b, t.obj);
        const objName = ss('obj', b, t.obj);
        const widget  = _wFind(id, rt);
        if (!widget || widget.type !== 'scroll') { t.pc++; return null; }

        const rtObj = rt.objects.find(o => o.name === objName);
        const item  = document.createElement('div');
        item.style.cssText = 'flex-shrink:0;scroll-snap-align:start;min-width:80px;min-height:80px;' +
            'background:#1e1e1e;border-radius:10px;display:flex;align-items:center;' +
            'justify-content:center;color:#fff;font-size:12px;padding:6px;box-sizing:border-box;';

        if (rtObj && rtObj.looks && rtObj.looks[rtObj.lookIdx]) {
            const look = rtObj.looks[rtObj.lookIdx];
            const img  = rt.images[look.id];
            if (img && img.complete && img.naturalWidth) {
                const el = document.createElement('img');
                el.src = look.src;
                el.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;';
                item.appendChild(el);
            } else {
                item.textContent = objName;
            }
        } else {
            item.textContent = objName;
        }
        widget.element.appendChild(item);
        t.pc++; return null;
    };

    H['w_scroll_clear'] = function (t, b, rt) {
        const w = _wFind(ss('id', b, t.obj), rt);
        if (w) w.element.innerHTML = '';
        t.pc++; return null;
    };

    H['w_del'] = function (t, b, rt) {
        const id = ss('id', b, t.obj);
        const w  = _wFind(id, rt);
        if (w) { w.element.remove(); rt.widgets = rt.widgets.filter(x => x.id !== id); }
        t.pc++; return null;
    };

    H['w_hide'] = function (t, b, rt) {
        const w = _wFind(ss('id', b, t.obj), rt);
        if (w) w.element.style.display = 'none';
        t.pc++; return null;
    };

    H['w_show'] = function (t, b, rt) {
        const w = _wFind(ss('id', b, t.obj), rt);
        if (w) w.element.style.display = '';
        t.pc++; return null;
    };

    H['w_pos'] = function (t, b, rt) {
        const w = _wFind(ss('id', b, t.obj), rt);
        if (w) { w.element.style.left = ns('x',b,t.obj)+'px'; w.element.style.top = ns('y',b,t.obj)+'px'; }
        t.pc++; return null;
    };

    H['w_size'] = function (t, b, rt) {
        const w = _wFind(ss('id', b, t.obj), rt);
        if (w) { w.element.style.width = ns('w',b,t.obj)+'px'; w.element.style.height = ns('h',b,t.obj)+'px'; }
        t.pc++; return null;
    };

    H['w_web'] = function (t, b, rt) {
        const id   = ss('id',  b, t.obj);
        let   url  = ss('url', b, t.obj);
        const x    = ns('x',b,t.obj), y = ns('y',b,t.obj), w = ns('w',b,t.obj), h = ns('h',b,t.obj);
        if (!url.match(/^https?:\/\//)) url = 'https://' + url;

        const iframe = document.createElement('iframe');
        iframe.id    = 'widget-' + id;
        iframe.src   = url;
        iframe.allow = 'autoplay; fullscreen';
        iframe.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:none;border-radius:8px;`;
        _ui().appendChild(iframe);
        rt.widgets.push({ id, element:iframe, type:'web' });
        t.pc++; return null;
    };

    function _makeInput(t, b, rt) {
        const id   = ss('id',  b, t.obj);
        const x    = ns('x',  b, t.obj), y  = ns('y',  b, t.obj);
        const w    = ns('w',  b, t.obj), h  = ns('h',  b, t.obj);
        const txt  = ss('txt', b, t.obj);
        const col  = ss('col', b, t.obj) || '#ffffff';
        const sz   = ns('sz',  b, t.obj) || 16;
        const bg   = String(b.params.bg || 'видимый');

        const isMulti = b.type === 'w_input_m';
        const el = document.createElement(isMulti ? 'textarea' : 'input');
        el.id          = 'widget-' + id;
        el.placeholder = txt;
        el.style.cssText =
            `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;` +
            `color:${col};font-size:${sz}px;box-sizing:border-box;padding:8px 12px;` +
            `border-radius:10px;outline:none;-webkit-user-select:text;user-select:text;resize:none;`;
        if (bg === 'скрытый') {
            el.style.background = 'transparent';
            el.style.border     = 'none';
        } else {
            el.style.background = '#1e1e1e';
            el.style.border     = '1px solid #333';
            el.style.color      = col;
        }
        _ui().appendChild(el);
        rt.widgets.push({ id, element:el, type:'input' });
        t.pc++; return null;
    }
    H['w_input_s'] = _makeInput;
    H['w_input_m'] = _makeInput;

    H['w_btn'] = function (t, b, rt) {
        const id  = ss('id',  b, t.obj);
        const txt = ss('txt', b, t.obj);
        const x   = ns('x',  b, t.obj), y = ns('y', b, t.obj);
        const w   = ns('w',  b, t.obj), h = ns('h', b, t.obj);
        const sig = ss('sig', b, t.obj);

        const btn = document.createElement('button');
        btn.id        = 'widget-' + id;
        btn.textContent = txt;
        btn.style.cssText =
            `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;` +
            `background:#1e1e1e;color:#fff;border:1px solid #333;border-radius:10px;` +
            `font-size:14px;font-weight:700;cursor:pointer;box-sizing:border-box;touch-action:manipulation;`;
        btn.onclick = () => {
            rt.objects.forEach(obj => {
                obj.scripts.forEach((bl, i) => {
                    if (bl.cat==='event' && bl.type==='msg_rx' && !bl.disabled && String(bl.params.msg)===sig)
                        window.startThread(obj, i);
                });
            });
        };
        _ui().appendChild(btn);
        rt.widgets.push({ id, element:btn, type:'button' });
        t.pc++; return null;
    };

    H['w_get_text'] = function (t, b, rt) {
        const id  = ss('id', b, t.obj);
        const vn  = String(b.params.var);
        const w   = _wFind(id, rt);
        if (w) rt.vars[vn] = (w.element.value !== undefined ? w.element.value : w.element.textContent) || '';
        t.pc++; return null;
    };

    H['w_set_text'] = function (t, b, rt) {
        const id  = ss('id',  b, t.obj);
        const txt = ss('txt', b, t.obj);
        const w   = _wFind(id, rt);
        if (!w) { t.pc++; return null; }
        const el = w.element;
        if (el.tagName === 'BUTTON') el.textContent = txt;
        else if (el.value !== undefined) el.value = txt;
        else el.textContent = txt;
        t.pc++; return null;
    };

    /* ─── DEVICE ─────────────────────────────────────────────────────────── */

    H['dev_toast'] = function (t, b, rt) {
        const msg   = ss('msg', b, t.obj);
        const toast = document.createElement('div');
        toast.style.cssText =
            'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
            'background:#555;color:#fff;padding:10px 20px;border-radius:8px;' +
            'font-size:14px;z-index:1000000;max-width:80vw;white-space:nowrap;' +
            'overflow:hidden;text-overflow:ellipsis;pointer-events:none;';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2200);
        t.pc++; return null;
    };

    H['dev_vibrate'] = function (t, b) {
        const ms = ns('ms', b, t.obj);
        if (navigator.vibrate) navigator.vibrate(ms);
        t.pc++; return null;
    };

    H['dev_get_time'] = function (t, b, rt) {
        const n = new Date();
        rt.vars[String(b.params.var)] =
            `${p2(n.getHours())}:${p2(n.getMinutes())}:${p2(n.getSeconds())}`;
        t.pc++; return null;
    };

    H['dev_get_date'] = function (t, b, rt) {
        const n = new Date();
        rt.vars[String(b.params.var)] =
            `${p2(n.getDate())}.${p2(n.getMonth()+1)}.${n.getFullYear()}`;
        t.pc++; return null;
    };

    H['dev_battery'] = function (t, b, rt) {
        const vn = String(b.params.var);
        if (navigator.getBattery) {
            navigator.getBattery().then(bat => { rt.vars[vn] = Math.round(bat.level*100); });
        } else {
            rt.vars[vn] = rt._batteryLevel || 100;
        }
        t.pc++; return null;
    };

    H['dev_clipboard'] = function (t, b, rt) {
        const txt = ss('txt', b, t.obj);
        const fallback = () => {
            const ta = document.createElement('textarea');
            ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0;';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch {}
            document.body.removeChild(ta);
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(txt).catch(fallback);
        } else {
            fallback();
        }
        t.pc++; return null;
    };

    function p2(n) { return String(n).padStart(2,'0'); }

})();
