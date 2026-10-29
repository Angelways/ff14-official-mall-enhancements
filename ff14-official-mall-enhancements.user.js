// ==UserScript==
// @name         一系列FF14官网&商城功能优化
// @namespace    https://github.com/Angelways/ff14-official-mall-enhancements
// @version      3.2.1
// @author       Angelways, annangela
// @homepageURL  https://github.com/Angelways
// @description  保留独立登录配置和商城收录面板，另提供总配置悬浮窗控制登录、官网、仓库及收录功能。
// @license      GPL-3.0-or-later
// @match        *://*.sdo.com/*
// @match        *://sdo.com/*
// @run-at       document-idle
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      sqmallservice.u.sdo.com
// ==/UserScript==

// 统一配置与悬浮窗：Angelways
const FF14Enhancements = (() => {
    'use strict';
    const descriptors = [
        ['整体', 'angelways.masterEnabled', '启用全部脚本功能（总开关）', true],
        ['登录', 'angelways.autoAgreement', '自动勾选登录协议', true],
        ['登录', 'angelways.dismissPassport', '自动关闭通行证提示', true],
        ['登录', 'angelways.loginEnabled', '登录方式与账号填写', true],
        ['登录', 'angelways.defaultWeGame', '默认自动 WeGame 登录', false],
        ['商城', 'angelways.batchClaim', '仓库批量领取入口', true],
        ['商城', 'omni-shop-enabled-v1', '商城道具收录', true],
        ['商城', 'angelways.ownedImageBadge', '商品图片显示获取标记', true],
        ['商城', 'angelways.ownedNameBadge', '商品名称显示获取标记', true],
        ['官网', 'ff14RedirectToSimple', '进入官网时自动进入简约版', true],
        ['官网', 'angelways.simpleNavigation', '补充简约版顶部导航', true]
    ];
    const get = (key, fallback) => typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
    const enabled = key => get('angelways.masterEnabled', true) !== false && get(key, true) !== false;
    const LOGIN_KEY = 'angelways.loginPreferences.v1';
    const POSITION_KEY = 'angelways.panelCoordinates';
    let host, root, windowBox, body, select, pending = false;
    let drag, suppressClickUntil = 0;
    const controls = new Map();
    function set(key, value) {
        if (typeof GM_setValue === 'function') GM_setValue(key, value);
        document.dispatchEvent(new Event('ff14-enhancements-change'));
        refresh();
    }
    function setWeGame(value) {
        const saved = get(LOGIN_KEY, {});
        const prefs = saved && typeof saved === 'object' ? saved : {};
        if (value && prefs.mode !== 'wegame') set('angelways.previousLoginMode', prefs.mode || 'keep');
        const previous = get('angelways.previousLoginMode', 'keep');
        set(LOGIN_KEY, {...prefs, mode: value ? 'wegame'
            : ['keep','password','one','qr'].includes(previous) ? previous : 'keep'});
    }
    const visible = node => Boolean(node?.isConnected && node.getClientRects().length)
        && getComputedStyle(node).visibility !== 'hidden';
    function ensure() {
        if (host || !document.body || window !== window.top || !/(^|\.)sdo\.com$/i.test(location.hostname)
            || /register|signup/i.test(location.pathname)) return;
        host = document.createElement('div');
        host.id = 'ff14-enhancements-settings';
        host.style.cssText = 'position:fixed;z-index:2147483647;width:300px;max-width:calc(100vw - 16px);right:12px;bottom:12px';
        root = host.attachShadow({mode:'open'});
        root.innerHTML = `<style>
            :host{font:14px/1.6 "Microsoft YaHei",system-ui,sans-serif;color:#222;color-scheme:light;text-align:left;letter-spacing:normal}
            *{box-sizing:border-box}details.window{border:1px solid #ddd;border-radius:10px;background:#fff;box-shadow:0 4px 20px #0003;overflow:hidden}
            summary{cursor:pointer;list-style:none;padding:11px 14px;font-size:15px;font-weight:700}
            summary::-webkit-details-marker{display:none}.window>summary{display:flex;justify-content:space-between;gap:8px;color:#16734b;touch-action:none;user-select:none;cursor:grab}
            .window>summary::after{content:'展开';font-size:12px;color:#777;font-weight:400}.window[open]>summary::after{content:'收起'}
            .body{overflow:auto;max-height:calc(100vh - 76px);padding:0 14px 14px}fieldset{border:0;border-top:1px solid #eee;padding:8px 0;margin:8px 0}
            legend{color:#16734b;font-weight:700;padding:0 5px 0 0}label.check{display:flex;gap:8px;align-items:center;margin:7px 0;font-weight:400;cursor:pointer}
            input[type=checkbox]{accent-color:#16734b;margin:0;flex:none}select,button{font:inherit;color:#222;border:1px solid #ddd;border-radius:5px;background:#fff;padding:5px 8px}
            select{width:100%;margin:5px 0}button{cursor:pointer;margin-top:6px}.hint{font-size:12px;color:#777;margin:8px 0}.status{color:#a8003b;font-size:12px}
            :focus-visible{outline:2px solid #16734b;outline-offset:2px}
        </style><details class="window"><summary>FF14网站优化 总配置</summary><div class="body"><div class="switches"></div>
            <fieldset><legend>总配置窗口</legend><label for="position">收纳位置</label><select id="position"><option value="auto">自动（优先左下角）</option><option value="right">右下角</option><option value="left">左下角</option><option value="custom">已保存的拖动位置</option></select>
            <p class="hint">拖动标题可移动窗口，位置自动保存。每次进入页面默认收起，点击标题或按 Esc 收起。自动 WeGame 开关与独立登录配置同步；总开关关闭时保留各功能设置。</p></fieldset>
            </div></details>`;
        windowBox = root.querySelector('.window'); body = root.querySelector('.body');
        select = root.getElementById('position');
        const switches = root.querySelector('.switches');
        for (const group of ['整体', '登录', '商城', '官网']) {
            const fieldset = document.createElement('fieldset');
            const legend = document.createElement('legend'); legend.textContent = group; fieldset.append(legend);
            for (const [category, key, text] of descriptors) {
                if (category !== group) continue;
                const label = document.createElement('label'); label.className = 'check';
                const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.setting = key;
                input.addEventListener('change', () => key === 'angelways.defaultWeGame'
                    ? setWeGame(input.checked) : set(key, input.checked));
                label.append(input, document.createTextNode(text)); fieldset.append(label); controls.set(key, input);
            }
            switches.append(fieldset);
        }
        select.addEventListener('change', () => set('angelways.panelPosition', select.value));
        windowBox.open = false;
        windowBox.addEventListener('toggle', position);
        installDrag();
        root.addEventListener('keydown', event => { if (event.key === 'Escape') windowBox.open = false; });
        // Prevent the login page's document-level Enter listener from submitting the form.
        for (const type of ['keydown','keyup','keypress']) root.addEventListener(type, event => event.stopPropagation());
        document.body.append(host);
        refresh();
    }
    function installDrag() {
        const title = windowBox.querySelector('summary');
        title.addEventListener('pointerdown', event => {
            if (event.button !== 0 || drag) return;
            const rect = host.getBoundingClientRect();
            drag = {id:event.pointerId, x:event.clientX, y:event.clientY, left:rect.left, top:rect.top, moved:false};
            title.setPointerCapture(event.pointerId);
        });
        title.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.id) return;
            const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            if (!drag.moved && Math.hypot(dx,dy) < 5) return;
            drag.moved = true;
            event.preventDefault();
            placeCustom({x:drag.left + dx, y:drag.top + dy});
        });
        const finish = event => {
            if (!drag || event.pointerId !== drag.id) return;
            const moved = drag.moved;
            drag = undefined;
            if (title.hasPointerCapture(event.pointerId)) title.releasePointerCapture(event.pointerId);
            if (!moved) return;
            suppressClickUntil = Date.now() + 500;
            const rect = host.getBoundingClientRect();
            set(POSITION_KEY, {x:rect.left,y:rect.top});
            set('angelways.panelPosition', 'custom');
        };
        title.addEventListener('pointerup', finish);
        title.addEventListener('pointercancel', finish);
        title.addEventListener('lostpointercapture', finish);
        title.addEventListener('click', event => {
            if (Date.now() >= suppressClickUntil) return;
            event.preventDefault(); event.stopImmediatePropagation();
        }, true);
    }
    function placeCustom(point) {
        const rect = host.getBoundingClientRect();
        const x = Math.max(8, Math.min(point.x, innerWidth - rect.width - 8));
        const y = Math.max(8, Math.min(point.y, innerHeight - rect.height - 8));
        for (const [key,value] of Object.entries({left:`${x}px`,top:`${y}px`,right:'auto',bottom:'auto'})) {
            if (host.style[key] !== value) host.style[key] = value;
        }
    }
    function position() {
        if (!host) return;
        const mode = get('angelways.panelPosition', 'auto');
        const width = Math.min(300, Math.max(120, innerWidth - 16));
        if (host.style.width !== `${width}px`) host.style.width = `${width}px`;
        const maxHeight = `${Math.max(60, innerHeight - 76)}px`;
        if (body.style.maxHeight !== maxHeight) body.style.maxHeight = maxHeight;
        if (drag?.moved) return;
        const point = get(POSITION_KEY, null);
        if (mode === 'custom' && Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
            placeCustom(point); return;
        }
        let left = mode === 'right' ? innerWidth - width - 12 : 8;
        let bottom = 12;
        const height = host.getBoundingClientRect().height;
        // Keep the independent panels in their original positions; move only the total settings.
        for (const node of document.querySelectorAll('#angelways-login-settings, #omni-owned-panel')) {
            if (!visible(node)) continue;
            const rect = node.getBoundingClientRect();
            if (left + width > rect.left && left < rect.right && innerHeight - bottom > rect.top
                && innerHeight - bottom - height < rect.bottom) {
                const otherLeft = left < innerWidth / 2 ? innerWidth - width - 12 : 8;
                if (otherLeft + width <= rect.left || otherLeft >= rect.right) left = otherLeft;
                else if (rect.top >= height + 20) bottom = innerHeight - rect.top + 12;
                else bottom = Math.max(12, innerHeight - height - 8);
            }
        }
        for (const [key,value] of Object.entries({display:'block',width:`${width}px`,left:`${Math.max(8,left)}px`,right:'auto',
            top:'auto',bottom:`${bottom}px`})) {
            if (host.style[key] !== value) host.style[key] = value;
        }
    }
    function refresh() {
        for (const [key, input] of controls) input.checked = key === 'angelways.defaultWeGame'
            ? get(LOGIN_KEY, {})?.mode === 'wegame' : get(key, true) !== false;
        if (select) select.value = ['auto','left','right','custom'].includes(get('angelways.panelPosition', 'auto')) ? get('angelways.panelPosition','auto') : 'auto';
        position();
    }
    function schedule() { if (!pending) { pending = true; setTimeout(() => {
        pending = false;
        if (!host && document.querySelector('#app_sdo_login, .login_wrap, iframe#login-frame, iframe[src*="sdo.com/sdo/"]')) ensure();
        refresh();
    }, 100); } }
    function open() { ensure(); if (windowBox) windowBox.open = true; position(); }
    function start() {
        if (window === window.top && (['qu.sdo.com','mall.sdo.com','ff.web.sdo.com'].includes(location.hostname)
            || /(?:^|[./_-])(?:login|signin|passport|cas)(?:[./_-]|$)/i.test(location.hostname + location.pathname))) ensure();
        new MutationObserver(schedule).observe(document.documentElement, {childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
    }
    window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
    document.addEventListener('ff14-enhancements-change', refresh);
    if (typeof GM_addValueChangeListener === 'function') {
        for (const [,key] of descriptors) GM_addValueChangeListener(key, () => document.dispatchEvent(new Event('ff14-enhancements-change')));
        GM_addValueChangeListener('angelways.panelPosition', refresh);
        GM_addValueChangeListener(POSITION_KEY, refresh);
        GM_addValueChangeListener(LOGIN_KEY, refresh);
    }
    if (window === window.top && typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('FF14网站优化 总配置', open);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
    return {get, enabled, set, open, position};
})();


// 登录协议自动勾选及合集维护：Angelways
// 作者主页：https://github.com/Angelways
(() => {
    'use strict';

    const HOST = location.hostname.toLowerCase();
    if (HOST !== 'sdo.com' && !HOST.endsWith('.sdo.com')) return;

    const CHECKBOX = 'input[type="checkbox"], [role="checkbox"]';
    const LOGIN_SCOPE = '#app_sdo_login, .login_wrap, [id*="login" i], [class*="login" i]';
    const LOGIN_URL = /(?:^|[./_-])(?:login|signin|passport|cas)(?:[./_-]|$)/i;
    const REGISTER_URL = /register|signup|sign-up/i;
    const AGREEMENT = /(?:我?已阅读(?:并)?(?:同意|接受)|阅读并同意|同意并接受)/;
    const POLICY = /隐私|协议|条款|政策/;
    const skipped = new WeakSet();
    const lastAttempt = new WeakMap();
    const dismissedNotices = new WeakSet();
    let pending = false;
    let timer;
    let observer;

    const normalize = text => (text || '').replace(/\s+/g, '');
    const isNative = element => element.matches('input[type="checkbox"]');
    const isChecked = element => isNative(element)
        ? element.checked
        : element.getAttribute('aria-checked') === 'true';

    function isLogin(element) {
        const address = HOST + location.pathname;
        if (LOGIN_URL.test(address)) return true;
        if (REGISTER_URL.test(address)) return false;
        return Boolean(element.closest(LOGIN_SCOPE));
    }

    function hasAgreement(text) {
        const value = normalize(text);
        return value.length <= 450 && AGREEMENT.test(value) && POLICY.test(value);
    }

    function isAgreement(element) {
        if (!isLogin(element)) return false;

        // Verified on login.u.sdo.com/sdo/Login/LoginFrameFC.php.
        if (isNative(element) && element.id === 'isAgreementAccept') return true;

        if (hasAgreement(element.getAttribute('aria-label'))) return true;
        for (const attribute of ['aria-labelledby', 'aria-describedby']) {
            const ids = (element.getAttribute(attribute) || '').split(/\s+/);
            const text = ids.map(id => document.getElementById(id)?.textContent || '').join(' ');
            if (hasAgreement(text)) return true;
        }
        if (isNative(element) && Array.from(element.labels || []).some(label => hasAgreement(label.textContent))) {
            return true;
        }

        // Never borrow agreement text from a container with another checkbox.
        let container = isNative(element) ? element.parentElement : element;
        for (let depth = 0; container && depth < 3; depth++, container = container.parentElement) {
            if (container === document.body || container === document.documentElement) break;
            if (container.querySelectorAll(CHECKBOX).length > 1) break;
            if (hasAgreement(container.textContent)) return true;
        }
        return false;
    }

    document.addEventListener('ff14-enhancements-change', schedule);
    function dismissPassportNotice() {
        const visible = element => Boolean(element?.getClientRects().length)
            && getComputedStyle(element).visibility === 'visible';
        for (const dialog of document.querySelectorAll('.mask-tips-box')) {
            const content = dialog.querySelector('.mask-tips-content');
            const button = dialog.querySelector('.action-confirm-btn');
            if (!isLogin(dialog) || !visible(dialog) || !visible(button)
                || normalize(content?.textContent) !== '请使用盛趣游戏通行证访问本站'
                || normalize(button.textContent) !== '我已知晓，重新登录') {
                dismissedNotices.delete(dialog);
                continue;
            }
            if (button.matches(':disabled') || button.getAttribute('aria-disabled') === 'true'
                || dismissedNotices.has(dialog)) continue;
            // Use the site's callback to clear the incompatible session and its overlay.
            dismissedNotices.add(dialog);
            button.click();
        }
    }

    function scan() {
        pending = false;
        if (document.hidden) return;
        if (FF14Enhancements.enabled('angelways.dismissPassport')) dismissPassportNotice();
        if (!FF14Enhancements.enabled('angelways.autoAgreement')) return;
        for (const element of document.querySelectorAll(CHECKBOX)) {
            if (isChecked(element) || skipped.has(element) || !isAgreement(element)) continue;
            if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') continue;

            // SDO also checks its native checkbox while the agreement row is hidden.
            if (element.id !== 'isAgreementAccept' && !element.getClientRects().length) continue;
            const previous = lastAttempt.get(element);
            if (previous !== undefined && Date.now() - previous < 1000) continue;
            lastAttempt.set(element, Date.now());
            element.click();
        }
    }

    function schedule() {
        if (pending) return;
        pending = true;
        setTimeout(scan, 100);
    }

    // A user's deliberate uncheck is respected for the lifetime of this control.
    document.addEventListener('click', event => {
        if (!event.isTrusted || !(event.target instanceof Element)) return;
        const element = event.target.closest(CHECKBOX);
        if (!element || !isAgreement(element)) return;
        if (isNative(element)) {
            if (element.checked) skipped.delete(element);
            else skipped.add(element);
        } else {
            // Custom controls usually toggle aria-checked after the click handler.
            setTimeout(() => {
                if (isChecked(element)) skipped.delete(element);
                else skipped.add(element);
            }, 0);
        }
    }, true);

    function start() {
        if (observer || !document.documentElement) return;
        observer = new MutationObserver(schedule);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['type', 'id', 'class', 'style', 'hidden', 'checked', 'disabled',
                'aria-checked', 'aria-disabled', 'aria-label', 'aria-labelledby', 'aria-describedby']
        });
        // checked-property assignments do not generate DOM mutation records.
        timer = setInterval(scan, 1000);
        scan();
    }

    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('hashchange', schedule);
    window.addEventListener('popstate', schedule);
    window.addEventListener('pagehide', () => {
        observer?.disconnect();
        observer = undefined;
        clearInterval(timer);
    });
    window.addEventListener('pageshow', start);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();

// 登录界面优化：Angelways https://github.com/Angelways
(() => {
    'use strict';
    if (!/(^|\.)sdo\.com$/i.test(location.hostname) || /register|signup/i.test(location.pathname)) return;
    const KEY = 'angelways.loginPreferences.v1';
    const FILL = 'angelways.loginFillRequest.v1';
    const MODES = { keep: '保持网站默认', password: '密码登录', one: '一键登录', qr: '二维码', wegame: 'WeGame 登录' };
    const TABS = { password: '#nav_btn_index', one: '#nav_btn_mobile', qr: '#nav_btn_code2d' };
    const get = (key, fallback) => typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
    const put = (key, value) => { if (typeof GM_setValue === 'function') GM_setValue(key, value); };
    const normalize = text => (text || '').replace(/\s+/g, '');
    const visible = element => Boolean(element?.isConnected && element.getClientRects().length)
        && getComputedStyle(element).visibility === 'visible';
    const enabled = element => visible(element) && !element.matches(':disabled')
        && element.getAttribute('aria-disabled') !== 'true';
    function load() {
        const saved = get(KEY, {});
        const accounts = Array.isArray(saved?.accounts)
            ? [...new Set(saved.accounts.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))].slice(0, 50) : [];
        return { mode: Object.hasOwn(MODES, saved?.mode) ? saved.mode : 'keep',
            autoFill: saved?.autoFill === true, accounts,
            defaultAccount: accounts.includes(saved?.defaultAccount) ? saved.defaultAccount : '' };
    }
    let prefs = load();
    let applied = new WeakSet();
    const edited = new WeakSet();
    const filled = new WeakMap();
    let anchor, activeAnchor, host, ui, hosted = false, manual = false, firstSeen = 0, forcedPanel = false;
    let contextId = `${Date.now()}-${Math.random()}`;
    let managedWeGame = false;
    let pending = false, lastFill = get(FILL, {})?.id;
    let selection = prefs.defaultAccount;
    const isMall = ['qu.sdo.com', 'mall.sdo.com'].includes(location.hostname);
    const frameSelector = 'iframe[src*="sdo.com/sdo/"], iframe#login-frame';

    function findAnchor() {
        if (isMall) {
            const box = document.querySelector('#login-box');
            return visible(box) ? [...box.querySelectorAll('.login-content')].find(visible) || box : null;
        }
        const root = document.querySelector('#app_sdo_login, .login_wrap');
        if (visible(root)) return root;
        if (window === window.top) return [...document.querySelectorAll(frameSelector)].find(visible) || null;
        return null;
    }

    function save(next) {
        if (next.mode === 'wegame' && prefs.mode !== 'wegame') put('angelways.previousLoginMode', prefs.mode);
        FF14Enhancements.set(KEY, next);
        prefs = load();
        applied = new WeakSet(); manual = false; firstSeen = Date.now();
        render(); schedule();
    }

    function createPanel() {
        host = document.createElement('div');
        host.id = 'angelways-login-settings';
        host.style.cssText = 'position:fixed;z-index:2147483647;display:none;width:270px;max-width:calc(100vw - 16px)';
        ui = host.attachShadow({ mode: 'open' });
        ui.innerHTML = `<style>
            :host{font:14px/1.5 "Microsoft YaHei",sans-serif;color:#242424;color-scheme:light;text-align:left}
            *{box-sizing:border-box} details{background:#fff;border:1px solid #e3e3e3;border-radius:10px;box-shadow:0 6px 24px #0003;overflow:hidden}
            summary{cursor:pointer;padding:11px 14px;font-weight:700;background:#fff;list-style:none;display:flex;justify-content:space-between;align-items:center}
            summary::-webkit-details-marker{display:none} summary::after{content:'展开';font-size:12px;color:#888;font-weight:400} details[open] summary::after{content:'收起'}
            .content{padding:0 14px 14px;max-height:calc(100vh - 100px);overflow:auto}label{display:block;margin:10px 0 5px;font-weight:600}
            select,input[type=text]{font:inherit;width:100%;height:36px;border:1px solid #d9d9d9;border-radius:5px;background:#fff;padding:5px 8px;color:#222}
            .check{font-weight:400;display:flex;align-items:center;gap:6px}.check input{margin:0;accent-color:#e60050}
            .row{display:flex;gap:7px;margin-top:8px}button{font:inherit;cursor:pointer;flex:1;min-height:32px;padding:5px 8px;border:1px solid #ddd;border-radius:5px;background:#fafafa;color:#333}
            button.primary{background:#e60050;border-color:#e60050;color:#fff}button:disabled{opacity:.45;cursor:default}select:focus,input:focus,button:focus-visible{outline:2px solid #e60050;outline-offset:1px}
            .hint{font-size:12px;color:#777;margin:10px 0 0}.status{font-size:12px;color:#a8003b;min-height:18px;margin-top:8px}
        </style><details><summary>登录界面优化</summary><div class="content">
            <label for="mode">默认登录方式</label><select id="mode"></select>
            <label class="check"><input type="checkbox" id="auto">自动填写默认账号</label>
            <label for="accounts">已保存账号</label><select id="accounts"></select>
            <div class="row"><button class="primary" id="fill">填写此账号</button><button id="default">设为默认</button></div>
            <div class="row"><button id="delete">删除此账号</button><button id="clear">取消默认</button></div>
            <label for="new">添加账号</label><input id="new" type="text" maxlength="100" placeholder="手机 / 邮箱 / 个性账号" autocomplete="off">
            <div class="row"><button id="add">保存账号</button></div>
            <p class="hint" id="default-label"></p><p class="hint">设置自动保存；账号保存在 Tampermonkey 本地。仅填写账号，密码由你输入。手动切换登录方式后，本次不再自动切回。</p>
            <div class="status" id="status" role="status"></div>
        </div></details>`;
        const el = id => ui.getElementById(id);
        for (const [value, label] of Object.entries(MODES)) el('mode').add(new Option(label, value));
        el('mode').onchange = () => save({ ...prefs, mode: el('mode').value });
        el('auto').onchange = () => save({ ...prefs, autoFill: el('auto').checked });
        el('accounts').onchange = () => { selection = el('accounts').value; render(); };
        el('default').onclick = () => save({ ...prefs, defaultAccount: selection });
        el('clear').onclick = () => save({ ...prefs, defaultAccount: '' });
        el('delete').onclick = () => {
            const account = selection;
            selection = '';
            save({ ...prefs, accounts: prefs.accounts.filter(value => value !== account),
                defaultAccount: prefs.defaultAccount === account ? '' : prefs.defaultAccount });
        };
        el('add').onclick = () => {
            const account = el('new').value.trim();
            if (!account) return status('请先输入账号。');
            if (prefs.accounts.length >= 50 && !prefs.accounts.includes(account)) return status('最多保存 50 个账号。');
            selection = account;
            save({ ...prefs, accounts: [...new Set([...prefs.accounts, account])] });
            el('new').value = ''; status('账号已保存。');
        };
        el('new').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); el('add').click(); } };
        el('fill').onclick = () => {
            if (!selection) return;
            const request = { id: `${Date.now()}-${Math.random()}`, account: selection, at: Date.now(), contextId };
            put(FILL, request); handleFill(request);
            status('已发送填写请求；需显示盛趣账号输入框。');
        };
        // SDO listens for Enter on document and would otherwise submit login.
        for (const type of ['keydown', 'keyup', 'keypress']) ui.addEventListener(type, event => event.stopPropagation());
        ui.querySelector('details').addEventListener('toggle', position);
        document.body.append(host);
        render();
    }

    function status(message) { if (ui) ui.getElementById('status').textContent = message; }
    function render() {
        if (!ui) return;
        ui.getElementById('mode').value = prefs.mode;
        ui.getElementById('auto').checked = prefs.autoFill;
        const select = ui.getElementById('accounts');
        if (!prefs.accounts.includes(selection)) selection = prefs.defaultAccount || prefs.accounts[0] || '';
        select.replaceChildren();
        select.add(new Option(prefs.accounts.length ? '请选择账号' : '暂无已保存账号', ''));
        for (const account of prefs.accounts) select.add(new Option(account + (account === prefs.defaultAccount ? '（默认）' : ''), account));
        select.value = selection;
        for (const id of ['fill', 'default', 'delete']) ui.getElementById(id).disabled = !selection;
        ui.getElementById('clear').disabled = !prefs.defaultAccount;
        ui.getElementById('default-label').textContent = `默认账号：${prefs.defaultAccount || '未设置'}`;
    }

    function position() {
        if (!host || (!forcedPanel && !FF14Enhancements.enabled('angelways.loginEnabled')) || !anchor || hosted || !visible(anchor)) { if (host) host.style.display = 'none'; return; }
        const rect = anchor.getBoundingClientRect();
        const width = Math.min(270, innerWidth - 16);
        let left = rect.right + 12;
        let top = Math.max(8, rect.top);
        if (left + width > innerWidth - 8) {
            if (rect.left - width - 12 >= 8 && window === window.top) left = rect.left - width - 12;
            else { left = innerWidth - width - 8; top = 8; }
        }
        host.style.display = 'block';
        const height = host.getBoundingClientRect().height;
        const style = `position:fixed;z-index:2147483647;display:block;width:${width}px;max-width:calc(100vw - 16px);left:${Math.max(8, left)}px;top:${Math.max(8, Math.min(top, innerHeight - height - 8))}px`;
        if (host.style.cssText !== style) host.style.cssText = style;
    }

    function accountInputs() {
        const root = document.querySelector('#app_sdo_login, .login_wrap');
        return root ? [...root.querySelectorAll('input#username, input[name="username"], input.username')]
            .filter(input => ['text', 'email', 'tel'].includes(input.type) && enabled(input) && !input.readOnly) : [];
    }
    function fillAccount(account, explicit) {
        if (!FF14Enhancements.enabled('angelways.loginEnabled')) return 0;
        let count = 0;
        for (const input of accountInputs()) {
            if (!explicit && (edited.has(input) || (input.value.trim() && input.value !== filled.get(input))
                || filled.get(input) === account)) continue;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, account);
            filled.set(input, account);
            for (const label of input.parentElement.querySelectorAll('.cell_input_notice')) {
                label.classList.add('cell_input_notice_hide');
            }
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            if (explicit) edited.add(input);
            count++;
        }
        return count;
    }
    function handleFill(request) {
        if (!request || request.contextId !== contextId || request.id === lastFill || Date.now() - request.at > 5000
            || !prefs.accounts.includes(request.account)) return;
        // Keep it pending until the requested form is visible.
        if (fillAccount(request.account, true)) lastFill = request.id;
    }

    function clickOnce(element) {
        if (!enabled(element) || applied.has(element)) return;
        applied.add(element);
        element.click();
    }
    function chooseMode() {
        if (!FF14Enhancements.enabled('angelways.loginEnabled') || manual || prefs.mode === 'keep' || Date.now() - firstSeen < 400) return;
        if (prefs.mode !== 'wegame') {
            if (isMall) {
                const toggle = [...document.querySelectorAll('#login-box .login-tips-pop')]
                    .find(element => enabled(element) && normalize(element.textContent) === '盛趣游戏登录');
                clickOnce(toggle);
                return;
            }
            const tab = document.querySelector(TABS[prefs.mode]);
            if (!enabled(tab) || applied.has(tab)) return;
            if (tab.closest('li')?.classList.contains('cur') || tab.getAttribute('aria-selected') === 'true') applied.add(tab);
            else clickOnce(tab);
            return;
        }
        if (managedWeGame) return;
        if (isMall) {
            const box = document.querySelector('#login-box');
            if (!visible(box)) return;
            const node = [...box.querySelectorAll('.other-login-node')].find(element => enabled(element)
                && /otherLoginFF14\.png(?:[?#]|$)/i.test(element.querySelector('.other-login-game-icon')?.getAttribute('src') || '')
                && /wegame/i.test(element.querySelector('.other-login-icon')?.getAttribute('src') || ''));
            if (node) { clickOnce(node); return; }
            const toggle = [...box.querySelectorAll('.login-tips-pop')].find(element => enabled(element) && normalize(element.textContent) === '其他平台登录');
            clickOnce(toggle);
        } else {
            // goClick=wegame is already handled by the website itself.
            if (new URL(location.href).searchParams.get('goClick') === 'wegame') return;
            const button = document.querySelector('#wegame_btn');
            const agreement = document.querySelector('#isAgreementAccept');
            if (agreement && !agreement.checked) return;
            clickOnce(button);
        }
    }

    function scan() {
        pending = false;
        if (document.hidden) return;
        const fresh = load();
        if (JSON.stringify(fresh) !== JSON.stringify(prefs)) {
            prefs = fresh; applied = new WeakSet(); manual = false; firstSeen = Date.now(); render();
        }
        anchor = findAnchor();
        // Both platform views belong to the same mall login session.
        const session = isMall && anchor ? document.querySelector('#login-box') : anchor;
        if (!session) {
            activeAnchor = null; manual = false;
            if (forcedPanel) { anchor = document.documentElement; position(); }
            else if (host) host.style.display = 'none';
            return;
        }
        forcedPanel = false;
        if (session !== activeAnchor) { activeAnchor = session; applied = new WeakSet(); manual = false; firstSeen = Date.now(); }
        if (!host && document.body) createPanel();
        position();
        chooseMode();
        if (prefs.autoFill && prefs.defaultAccount && prefs.mode !== 'wegame') fillAccount(prefs.defaultAccount, false);
        handleFill(get(FILL, null));
    }
    function schedule() { if (!pending) { pending = true; setTimeout(scan, 120); } }

    document.addEventListener('input', event => {
        if (event.isTrusted && event.target instanceof HTMLInputElement) edited.add(event.target);
    }, true);
    document.addEventListener('click', event => {
        if (!event.isTrusted || !(event.target instanceof Element)) return;
        if (event.target.closest('#nav > li, #wegame_btn, .login-tips-pop, .login-type-switch, .other-login-node')) manual = true;
    }, true);

    // The parent hosts the panel beside a cross-origin iframe, avoiding clipping.
    window.addEventListener('message', event => {
        if (!event.data || !/(^|\.)sdo\.com$/i.test((() => { try { return new URL(event.origin).hostname; } catch { return ''; } })())) return;
        if (window === window.top && event.data.type === 'angelways-login-ready') {
            const frame = [...document.querySelectorAll(frameSelector)].find(frame => frame.contentWindow === event.source);
            if (frame) event.source.postMessage({ type: 'angelways-login-hosted', contextId, managedWeGame: isMall }, event.origin);
        } else if (event.source === window.top && event.data.type === 'angelways-login-hosted') {
            hosted = true; contextId = event.data.contextId; managedWeGame = event.data.managedWeGame === true; position();
        }
    });
    if (window !== window.top) {
        const announce = () => { if (!hosted && document.querySelector('#app_sdo_login, .login_wrap')) window.top.postMessage({ type: 'angelways-login-ready' }, '*'); };
        setInterval(announce, 1000); setTimeout(announce, 200);
    }
    if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener(KEY, schedule);
        GM_addValueChangeListener(FILL, schedule);
    }
    if (window === window.top && typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('登录界面优化设置', () => {
            if (!host) createPanel();
            hosted = false;
            forcedPanel = true;
            if (!anchor) anchor = document.documentElement;
            ui.querySelector('details').open = true; position();
        });
    }
    document.addEventListener('ff14-enhancements-change', schedule);
    const observer = new MutationObserver(records => {
        if (records.some(record => record.target !== host && !host?.contains(record.target))) schedule();
    });
    function start() {
        observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
            attributeFilter: ['style', 'class', 'hidden', 'src', 'disabled', 'aria-disabled'] });
        scan();
    }
    setInterval(scan, 700);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('visibilitychange', schedule);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();

// FF14 道具仓库批量领取功能作者：annangela
// 作者主页：https://greasyfork.org/zh-CN/users/129402-annangela
// License: GPL-3.0-or-later
(() => {
    'use strict';
    if (!['qu.sdo.com', 'mall.sdo.com'].includes(location.hostname) || window.top !== window.self) return;
    const page = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    let initialized = false;
    let positionButton = () => {};
    let queued = false;
    let retryTimer;

    function boot() {
        queued = false;
        if (!initialized && FF14Enhancements.enabled('angelways.batchClaim') && location.pathname === '/personal-center' && page.jQuery) {
            initialized = true;
            setup(page.jQuery);
        }
        positionButton();
    }

    function retryAfterRouteChange() {
        clearTimeout(retryTimer);
        // The mall changes the hash first and renders the Vue warehouse a little later.
        const delays = [0, 50, 100, 150, 300, 400, 800];
        let index = 0;
        const retry = () => {
            boot();
            if (index < delays.length) retryTimer = setTimeout(retry, delays[index++]);
        };
        retry();
    }

    function schedule() {
        if (queued) return;
        queued = true;
        setTimeout(boot, 100);
    }

    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
    });
    window.addEventListener('hashchange', retryAfterRouteChange);
    window.addEventListener('popstate', retryAfterRouteChange);
    window.addEventListener('resize', schedule);
    document.addEventListener('ff14-enhancements-change', boot);
    setInterval(boot, 1000);
    boot();

    function setup($) {
        function formatWarehouseDate(value) {
            const moment = page.moment || window.moment;
            if (typeof moment === 'function') return moment(value).format("YYYY年M月D日HH点mm分");
            if (value == null || value === '') return '--';
            const date = new Date(typeof value === 'string' ? value.replace(' ', 'T') : value);
            if (Number.isNaN(date.getTime())) return String(value);
            const pad = number => String(number).padStart(2, '0');
            return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日${pad(date.getHours())}点${pad(date.getMinutes())}分`;
        }
        const button = $('<button type="button">').attr({
            id: 'ff14-batch-claim-button',
            title: '批量领取 FF14 仓库道具'
        }).text('批量领取道具');
        button.css({
            background: '#ce0f30', border: '1px solid #ce0f30',
            'border-radius': '4px', color: '#fff', cursor: 'pointer',
            'font-family': 'inherit', 'font-size': '14px', 'font-weight': '600',
            'letter-spacing': '0', height: '36px', width: '180px',
            padding: '0 18px', 'white-space': 'nowrap', 'box-sizing': 'border-box'
        });
        button.on('mouseenter focus', () => button.css('background', '#b50c29'));
        button.on('mouseleave blur', () => button.css('background', '#ce0f30'));
        const slot = document.createElement('div');
        slot.id = 'ff14-batch-claim-toolbar';
        slot.hidden = true;
        slot.appendChild(button[0]);

        function setStyle(element, property, value) {
            if (element.style[property] !== value) element.style[property] = value;
        }

        let paddedHost;
        let originalPaddingTop;
        let basePaddingTop;
        function clearExtraRow() {
            if (!paddedHost) return;
            setStyle(paddedHost, 'paddingTop', originalPaddingTop);
            paddedHost = undefined;
        }

        positionButton = () => {
            const root = document.getElementById('personal-center-gameitem');
            const host = document.getElementById('gameitem-body');
            const appId = root?.__vue__?.appId;
            const hash = location.hash || '';
            const hashAppId = hash.match(/(?:^#\/?|[/?])itemindex-(\d+)(?:-|$)/)?.[1];
            // The route is current even while Vue still holds the previous game's appId.
            const isFF14 = hashAppId ? hashAppId === '100001900' : !hash && String(appId) === '100001900';
            const visible = FF14Enhancements.enabled('angelways.batchClaim') && isFF14 && host && host.getClientRects().length &&
                getComputedStyle(host).visibility !== 'hidden';
            if (!visible) {
                if (!slot.hidden) slot.hidden = true;
                setStyle(slot, 'display', 'none');
                clearExtraRow();
                return;
            }
            // Keep the action outside Vue's warehouse subtree; anchor it to the toolbar.
            const anchor = root?.parentElement;
            if (!anchor) return;
            for (const duplicate of document.querySelectorAll('#ff14-batch-claim-toolbar')) {
                if (duplicate !== slot) duplicate.remove();
            }
            if (slot.parentElement !== anchor) anchor.appendChild(slot);
            if (getComputedStyle(anchor).position === 'static') setStyle(anchor, 'position', 'relative');
            setStyle(slot, 'position', 'absolute');
            setStyle(slot, 'zIndex', '1');
            setStyle(slot, 'width', '180px');
            setStyle(slot, 'height', '36px');
            if (paddedHost && paddedHost !== host) clearExtraRow();
            const menu = host.querySelector('.el-menu-center');
            const search = host.querySelector('.game-item-search');
            const tabs = menu ? Array.from(menu.children).filter(el =>
                el.matches('.el-menu-item') && el.getClientRects().length) : [];
            const lastTab = tabs.at(-1);
            const tabRect = lastTab?.getBoundingClientRect();
            const searchRect = search?.getBoundingClientRect();
            const left = tabRect ? tabRect.right + 32 : 0;
            let x;
            let y;
            if (searchRect && tabRect && searchRect.left - left >= 196) {
                clearExtraRow();
                x = left;
                // Clearing a reserved row moves the search field up.
                y = search.getBoundingClientRect().top;
            } else {
                if (paddedHost !== host) {
                    paddedHost = host;
                    originalPaddingTop = host.style.paddingTop;
                    basePaddingTop = parseFloat(getComputedStyle(host).paddingTop) || 0;
                }
                setStyle(host, 'paddingTop', (basePaddingTop + 48) + 'px');
                const hostRect = host.getBoundingClientRect();
                x = hostRect.left + (parseFloat(getComputedStyle(host).paddingLeft) || 0);
                y = hostRect.top + basePaddingTop;
            }
            const anchorRect = anchor.getBoundingClientRect();
            setStyle(slot, 'left', (x - anchorRect.left - anchor.clientLeft + anchor.scrollLeft) + 'px');
            setStyle(slot, 'top', (y - anchorRect.top - anchor.clientTop + anchor.scrollTop) + 'px');
            setStyle(slot, 'display', 'block');
            setStyle(slot, 'visibility', 'visible');
            if (slot.hidden) slot.hidden = false;
        };
        positionButton();
        button.on("click", () => {
            if (!FF14Enhancements.enabled('angelways.batchClaim')) return;
            if (document.getElementById("ff14-batch-claim-dialog")) return;
            const container = $("<div>").attr({ id: "ff14-batch-claim-dialog", role: "dialog", "aria-label": "批量领取道具" });
            container.css({
                "background-color": "#fff",
                border: "gray solid 1px",
                "border-radius": "4px",
                bottom: "2rem",
                color: "#303133",
                "font-size": "14px",
                left: "50%",
                transform: "translateX(-50%)",
                "box-sizing": "border-box",
                "line-height": "1.5",
                position: "fixed",
                top: "2rem",
                width: "min(1200px, calc(100vw - 32px))",
                "z-index": 137,
                overflow: "auto",
            });
            container.appendTo("body");
            const closeButton = $("<button type=\"button\" aria-label=\"Close\" class=\"el-dialog__headerbtn\"><i class=\"el-dialog__close el-icon el-icon-close\"></i></button>");
            closeButton.on("click", () => {
                if (closeButton.is(":not(:disabled)")) {
                    container.remove();
                }
            });
            container.append(closeButton);
            const title = $("<div>");
            title.text("批量领取道具");
            title.css({
                "border-bottom": "gray solid 1px",
                "font-size": "20px",
                margin: ".5rem auto",
                "text-align": "center",
                width: "calc(100% - 32px)",
            });
            container.append(title);
            const chooseContainer = $("<div>");
            chooseContainer.text("选择仓库：");
            chooseContainer.css({
                "border-bottom": "gray solid 1px",
                left: "50px",
                margin: ".5rem auto",
                "padding-bottom": ".5rem",
                position: "sticky",
                "text-align": "center",
                top: ".5rem",
                width: "calc(100% - 32px)",
                background: "white",
            });
            const paidWarehouseInput = $("<input>");
            paidWarehouseInput.attr({
                id: "3a755830-cfd0-4999-a79b-9dcf62e6669f",
                type: "radio",
            }).css("margin", "0 .5rem");
            const freeWarehouseInput = $("<input>");
            freeWarehouseInput.attr({
                id: "005c8d3a-4594-4e7b-af4d-865498126a36",
                type: "radio",
            }).css("margin", "0 .5rem");
            const paidWarehouseInputLabel = $("<label>");
            paidWarehouseInputLabel.attr("for", "3a755830-cfd0-4999-a79b-9dcf62e6669f").text("购买仓库").css("margin-right", ".5rem");
            const freeWarehouseInputLabel = $("<label>");
            freeWarehouseInputLabel.attr("for", "005c8d3a-4594-4e7b-af4d-865498126a36").text("奖励仓库").css("margin-right", ".5rem");
            paidWarehouseInput.data({
                otherInput: freeWarehouseInput,
                sourceType: 0,
            });
            freeWarehouseInput.data({
                otherInput: paidWarehouseInput,
                sourceType: 1,
            });
            chooseContainer.append(paidWarehouseInput).append(paidWarehouseInputLabel).append("·").append(freeWarehouseInput).append(freeWarehouseInputLabel);
            const submitContainer = $("<span>");
            submitContainer.css({
                "border-left": "gray solid 1px",
                "margin-left": ".5rem",
                padding: "0 .5rem",
            });
            chooseContainer.append(submitContainer);
            container.append(chooseContainer);
            const resultCotainer = $("<div>");
            resultCotainer.css({
                margin: "0 auto",
                padding: ".5rem",
                "text-align": "center",
            });
            container.append(resultCotainer);
            const count = $("<span>");
            count.text("道具数量：--");
            submitContainer.append(count);
            const submitButton = $("<button>");
            submitButton.text("开始批量领取").css("margin", "0 .5rem");
            submitContainer.append(submitButton);
            const selectAllButton = $("<button>");
            selectAllButton.text("全选");
            selectAllButton.on("click", () => {
                if (selectAllButton.is(":not(:disabled)")) {
                    resultCotainer.find("input").prop("checked", true);
                }
            });
            submitContainer.append(selectAllButton);
            const selectNoneButton = $("<button>");
            selectNoneButton.text("全不选");
            selectNoneButton.on("click", () => {
                if (selectNoneButton.is(":not(:disabled)")) {
                    resultCotainer.find("input").prop("checked", false);
                }
            });
            submitContainer.append(selectNoneButton);
            paidWarehouseInput.add(freeWarehouseInput).on("change", async ({ target }) => {
                const self = $(target);
                const warehouseSourceType = self.data("sourceType");
                self.data("otherInput").prop("checked", false);
                resultCotainer.empty().text("加载中……");
                try {
                    const apiResult = await $.ajax({
                        data: {
                            _: Math.random(),
                            appId: 100001900,
                            keyword: "",
                            order: 0,
                            page: 1,
                            pageSize: 100,
                            sourceType: warehouseSourceType,
                            status: 0,
                        },
                        type: "GET",
                        url: "https://sqmallservice.u.sdo.com/api/us/gameItem/list",
                        xhrFields: {
                            withCredentials: true,
                        },
                    });
                    resultCotainer.empty();
                    if (apiResult.resultCode !== 0) {
                        resultCotainer.text(`请求发生错误！错误信息：[${apiResult.resultCode}] ${apiResult.resultMsg}`);
                        return;
                    }
                    const { propsList, totalCount } = apiResult.data;
                    if (totalCount > 100) {
                        resultCotainer.append("<div>仓库中包含超过100件道具，为了避免出现问题，脚本只支持前100件道具的批量领取，请领取完前100件后刷新页面继续。</div>");
                    }
                    if (totalCount === 0) {
                        resultCotainer.html("该仓库无道具~");
                        return;
                    }
                    const resultTable = $("<table>");
                    resultTable.css("border-collapse", "collapse");
                    resultTable.append("<thead><tr><th>序号</th><th>名称</th><th>获得日期</th><th>是否批量领取</th></tr></thead><tbody></tbody>");
                    resultCotainer.append($("<div>").css({
                        margin: "auto",
                        width: "fit-content",
                    }).append(resultTable));
                    const resultTableBody = resultTable.find("tbody");
                    propsList.forEach(({ propsWarehouseId, productUrl, productName, purchaseDate, exchangeDate, skuId }, _index) => {
                        const index = _index + 1;
                        const row = $("<tr>");
                        row.html('<td style="border: gray solid 1px; padding: .5rem;"></td>'.repeat(4));
                        row.find("td").eq(0).text(index);
                        const textCol = row.find("td").eq(1);
                        textCol.css("padding", ".125rem .5rem");
                        textCol.text(`${productName} `);
                        if (productUrl) {
                            const img = $("<img>");
                            img.css({
                                height: "2.5rem",
                                "vertical-align": "inherit",
                            });
                            img.attr("src", productUrl);
                            img.on("click", () => {
                                open(productUrl, "_blank");
                            });
                            textCol.prepend(img);
                        }
                        if (skuId) {
                            const link = $("<a>");
                            link.css({
                                color: "#3273dc",
                                "text-decoration": "underline",
                            }).attr({
                                href: `https://qu.sdo.com/product-detail/${skuId}`,
                                target: "_blank",
                            }).text("[商品页面](外链)");
                            textCol.append(link);
                        } else {
                            textCol.append(" [非卖品]");
                        }
                        row.find("td").eq(2).text(formatWarehouseDate(purchaseDate || exchangeDate));
                        const input = $("<input>");
                        // The requested warehouse determines the category, not each item's source metadata.
                        input.attr("type", "checkbox").data({ propsWarehouseId, sourceType: warehouseSourceType });
                        row.find("td").eq(3).append(input);
                        resultTableBody.append(row);
                    });
                    count.text(`道具数量：${propsList.length}`);
                }
                catch (e) {
                    resultCotainer.text(`发生网络错误！错误信息：${e}`);
                }
            });
            submitButton.on("click", async () => {
                if (submitButton.is(":not(:disabled)")) {
                    if (resultCotainer.find("input").length === 0) {
                        alert("尚未加载数据！");
                        return;
                    }
                    const selected = resultCotainer.find("input:checked").toArray().map((ele) => $(ele).data());
                    if (selected.length === 0) {
                        alert("尚未选择道具！");
                        return;
                    }
                    const choosed = {
                        free: selected.filter(({ sourceType }) => sourceType === 1).map(({ propsWarehouseId }) => propsWarehouseId),
                        paid: selected.filter(({ sourceType }) => sourceType === 0).map(({ propsWarehouseId }) => propsWarehouseId),
                    };
                    const confirmText = [];
                    if (choosed.paid.length > 0) {
                        confirmText.push(`${choosed.paid.length} 个购买仓库的道具`);
                    }
                    if (choosed.free.length > 0) {
                        confirmText.push(`${choosed.free.length} 个奖励仓库的道具`);
                    }
                    if (!confirm(`你选择了 ${confirmText.join(" 和 ")} ，是否确认批量领取？`)) {
                        return;
                    }
                    submitButton.add(selectAllButton).add(selectNoneButton).add(closeButton).add(paidWarehouseInput).add(freeWarehouseInput).add(resultCotainer.find("input")).attr("disabled", "disabled");
                    const characterSelectorContainer = $("<div>");
                    characterSelectorContainer.css({
                        "background-color": "#fff",
                        border: "gray solid 1px",
                        "border-radius": "4px",
                        "font-size": "14px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        "box-sizing": "border-box",
                        "line-height": "1.5",
                        padding: "25px 25px 30px",
                        position: "fixed",
                        "text-align": "center",
                        top: "15vh",
                        width: "min(650px, calc(100vw - 32px))",
                        "z-index": 713,
                    });
                    const area = $("<div>");
                    area.css("margin", ".5rem 0");
                    const areaSelect = $("<select>");
                    areaSelect.attr({
                        disabled: "disabled",
                        id: "b5970252-6c7e-4603-928f-ae80b7ed1409",
                    }).html('<option selected="selected">加载中……</option>');
                    const areaLabel = $("<label>");
                    areaLabel.attr("for", "b5970252-6c7e-4603-928f-ae80b7ed1409").text("选择游戏大区：");
                    area.append(areaLabel).append(areaSelect).appendTo(characterSelectorContainer);
                    const character = $("<div>");
                    character.css("margin", ".5rem 0");
                    const characterSelect = $("<select>");
                    characterSelect.attr({
                        disabled: "disabled",
                        id: "f601bc1a-95c8-42ce-81b3-0081bec56f58",
                    }).html('<option selected="selected">请先选择大区……</option>');
                    const characterLabel = $("<label>");
                    characterLabel.attr("for", "f601bc1a-95c8-42ce-81b3-0081bec56f58").text("选择游戏角色：");
                    character.append(characterLabel).append(characterSelect).appendTo(characterSelectorContainer);
                    const buttonRow = $("<div>");
                    buttonRow.css("margin", ".5rem 0");
                    const confirmButton = $("<button>");
                    confirmButton.css({
                        "background-color": "#ce0f30",
                        border: "1px solid #ce0f30",
                        "border-radius": "4px",
                        "box-sizing": "border-box",
                        color: "#FFF",
                        cursor: "pointer",
                        display: "inline-block",
                        "font-family": "inherit",
                        "font-size": "14px",
                        "font-weight": "500",
                        "line-height": "1",
                        margin: "0",
                        outline: "0",
                        overflow: "visible",
                        padding: "12px 20px",
                        "text-align": "center",
                        "text-transform": "none",
                        transition: ".1s",
                        "white-space": "nowrap",
                    }).text("确认批量领取在此角色");
                    const cancelButton = $("<button>");
                    cancelButton.css({
                        "background-color": "rgb(51, 51, 51)",
                        border: "1px solid rgb(51, 51, 51)",
                        "border-radius": "4px",
                        "box-sizing": "border-box",
                        color: "#FFF",
                        cursor: "pointer",
                        display: "inline-block",
                        "font-family": "inherit",
                        "font-size": "14px",
                        "font-weight": "500",
                        "line-height": "1",
                        margin: "0 0 0 10px",
                        outline: "0",
                        overflow: "visible",
                        padding: "12px 20px",
                        "text-align": "center",
                        "text-transform": "none",
                        transition: ".1s",
                        "white-space": "nowrap",
                    }).text("取消");
                    cancelButton.on("click", () => {
                        submitButton.add(selectAllButton).add(selectNoneButton).add(closeButton).add(paidWarehouseInput).add(freeWarehouseInput).add(resultCotainer.find("input")).removeAttr("disabled");
                        characterSelectorContainer.remove();
                    });
                    buttonRow.append(confirmButton).append(cancelButton).appendTo(characterSelectorContainer);
                    characterSelectorContainer.appendTo("body");
                    try {
                        const areaResult = await $.ajax({
                            data: {
                                _: Math.random(),
                                appId: 100001900,
                            },
                            type: "GET",
                            url: "https://sqmallservice.u.sdo.com/api/us/accountInfo/getArea",
                            xhrFields: {
                                withCredentials: true,
                            },
                        });
                        if (areaResult.resultCode !== 0) {
                            alert(`请求发生错误！错误信息：[${areaResult.resultCode}] ${areaResult.resultMsg}`);
                            cancelButton.trigger("click");
                            return;
                        }
                        const areas = JSON.parse(areaResult.data);
                        const defaultArea = GM_getValue("areaSelected", "-1");
                        areaSelect.removeAttr("disabled").html(defaultArea === "-1" ? '<option value="-1">请选择大区……</option>' : "");
                        areas.forEach(({ areaId, areaName }) => {
                            areaSelect.append(`<option value="${areaId}-${areaName}">${areaName}</option>`);
                        });
                        areaSelect.on("change", async () => {
                            const areaId = areaSelect.val();
                            if (areaId === "-1") {
                                characterSelect.attr("disabled", "disabled").html('<option selected="selected">请先选择大区……</option>');
                                return;
                            }
                            try {
                                const characterResult = await $.ajax({
                                    data: {
                                        _: Math.random(),
                                        appId: 100001900,
                                        areaId: areaId.replace(/-.+$/, ""),
                                    },
                                    type: "GET",
                                    url: "https://sqmallservice.u.sdo.com/api/us/accountInfo/getCharacter",
                                    xhrFields: {
                                        withCredentials: true,
                                    },
                                });
                                if (characterResult.resultCode !== 0) {
                                    alert(`请求发生错误！错误信息：[${characterResult.resultCode}] ${characterResult.resultMsg}`);
                                    cancelButton.trigger("click");
                                    return;
                                }
                                const defaultCharacter = GM_getValue("characterSelected", "-1");
                                const characters = characterResult.data.roleInfos;
                                characterSelect.removeAttr("disabled").html(defaultCharacter === "-1" ? '<option value="-1">请选择角色……</option>' : "");
                                characters.forEach(({ characterId, groupId, groupName, roleName }) => {
                                    characterSelect.append(`<option value="${groupId}-${groupName}-${characterId}-${roleName}">[${groupName}]${roleName}</option>`);
                                });
                                characterSelect.val(defaultCharacter);
                            }
                            catch (e) {
                                alert(`发生网络错误！错误信息：${e}`);
                                cancelButton.trigger("click");
                                return;
                            }
                        });
                        areaSelect.val(defaultArea).change();
                        confirmButton.on("click", async () => {
                            const characterSelected = characterSelect.val();
                            const areaSelected = areaSelect.val();
                            if (!/([^-]+)-([^-]+)/.test(areaSelected)) {
                                alert("请选择大区！");
                                return;
                            }
                            if (!/([^-]+)-([^-]+)-([^-]+)-([^-]+)/.test(characterSelected)) {
                                alert("请选择角色！");
                                return;
                            }
                            const [, areaId, areaName] = Array.from(areaSelected.match(/([^-]+)-([^-]+)/));
                            const [, groupId, groupName, characterId, roleName] = Array.from(characterSelected.match(/([^-]+)-([^-]+)-([^-]+)-([^-]+)/));
                            if (!confirm(`确定要将 ${confirmText} 领取到 [${groupName}]${roleName} 上吗？`)) {
                                return;
                            }
                            GM_setValue("characterSelected", characterSelected);
                            GM_setValue("areaSelected", areaSelected);
                            submitButton.add(selectAllButton).add(selectNoneButton).add(closeButton).remove().off();
                            let successCount = 0;
                            let failedCount = 0;
                            const log = count.add(characterSelectorContainer);
                            const target = choosed.paid.concat(choosed.free);
                            log.text(`成功：0 失败：0 / ${target.length}`);
                            let startFlag = true;
                            for (const propsWarehouseId of target) {
                                if (startFlag) {
                                    startFlag = false;
                                    await new Promise((res) => setTimeout(res, 1500));
                                }
                                try {
                                    const apiResult = await $.ajax({
                                        data: {
                                            _: Math.random(),
                                            appId: "100001900",
                                            areaId,
                                            areaName,
                                            characterId,
                                            groupId,
                                            groupName,
                                            propsWarehouseId,
                                            roleName,
                                        },
                                        type: "GET",
                                        url: "https://sqmallservice.u.sdo.com/api/us/gameItem/spend",
                                        xhrFields: {
                                            withCredentials: true,
                                        },
                                    });
                                    if (apiResult.resultCode === 0 && apiResult.data.success) {
                                        successCount++;
                                    }
                                    else {
                                        failedCount++;
                                    }
                                } catch {
                                    failedCount++;
                                }
                                log.text(`成功：${successCount} 失败：${failedCount} / ${target.length}`);
                            }
                            setTimeout(() => {
                                alert(`批量领取完成！共成功 ${successCount} 个，失败 ${failedCount} 个！`);
                                location.reload(false);
                            }, 50);
                        });
                    }
                    catch (e) {
                        alert(`发生网络错误！错误信息：${e}`);
                        cancelButton.trigger("click");
                        return;
                    }
                }
            });
        });
    }
})();

// 官网简约版优化：Angelways，https://github.com/Angelways
(() => {
    'use strict';
    if (location.hostname !== 'ff.web.sdo.com' || !/^\/web8\/(?:index\.html)?$/.test(location.pathname) || window.top !== window.self) return;
    const SETTING = 'ff14RedirectToSimple';
    const BASE = 'https://ff.web.sdo.com/web8/index.html';
    const enabled = () => FF14Enhancements.enabled(SETTING);
    let allowFullHome = false;
    let queued = false;
    let nav, preference, menu, categories, closeTimer;
    let opened = false;

    function registerMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        GM_registerMenuCommand(`进入官网时自动重定向至简约版：${enabled() ? '已开启' : '已关闭'}`,
            () => savePreference(!enabled()), { id: 'ff14-simple-redirect', autoClose: true });
    }
    function savePreference(value) {
        FF14Enhancements.set(SETTING, value);
        allowFullHome = false;
        registerMenu();
        synchronize();
    }
    function showFullHome(event) {
        if (event && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
        event?.preventDefault();
        allowFullHome = true;
        location.hash = '/home';
        synchronize();
    }
    function link(label, href, external = false) {
        const anchor = document.createElement('a');
        anchor.textContent = label;
        anchor.href = href;
        if (external) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
        return anchor;
    }
    function setOpened(value) {
        clearTimeout(closeTimer);
        opened = value;
        if (!nav) return;
        menu.hidden = !value;
        categories.querySelectorAll('button').forEach(button => button.setAttribute('aria-expanded', String(value)));
    }
    function buildNav() {
        nav = document.createElement('nav');
        nav.id = 'ff14-simple-navigation';
        nav.setAttribute('aria-label', '最终幻想14官网导航');
        const logo = link('', BASE + '#/home');
        logo.className = 'ff14-nav-logo';
        logo.setAttribute('aria-label', '官网首页');
        logo.addEventListener('click', showFullHome);
        nav.appendChild(logo);
        const right = document.createElement('div');
        right.className = 'ff14-nav-right';
        categories = document.createElement('div');
        categories.className = 'ff14-nav-categories';
        // Links verified against the official site's Headers component.
        const groups = [
            ['HOME', '官网首页', []],
            ['NEWS', '新闻中心', [['最新情报', BASE + '#/newstab/newslist'], ['版本更新笔记', BASE + '#/patchnote'], ['服务器状况', BASE + '#/servers']]],
            ['GAME INFO', '游戏资料', [['客户端下载', BASE + '#/download'], ['壁纸/铃声下载', 'https://ff.web.sdo.com/special/maverick7.0.html', true], ['游戏指南', BASE + '#/guide'], ['资料站', BASE + '#/station']]],
            ['SERVICE', '客户服务', [['注册账号', 'https://ff.web.sdo.com/web8/register.html', true], ['意见反馈', 'https://survey.dw.sdo.com/3Mvc8', true], ['用户协议', BASE + '#/newstab/newscont/217463', true], ['账号处罚细则', BASE + '#/newstab/newscont/268832', true], ['违规处理平台', 'https://actff1.web.sdo.com/project/20210621ffviolation/index.html', true], ['隐私政策', BASE + '#/newstab/newscont/333945', true]]],
            ['LINK', '相关网站', [['最新活动', 'https://actff1.web.sdo.com/Project/20181018ffactive/index.html', true], ['官方论坛', 'https://ff.web.sdo.com/bbs', true], ['海德林咖啡餐厅', 'https://ff.web.sdo.com/ffcafe/index.html#/index', true], ['FF14 X ARTIST', 'https://actff1.web.sdo.com/project/20250601artist/index.html#/index', true], ['萌新招待站', 'https://actff1.web.sdo.com/20250713_ZhaoDaiNew/index.html#/index', true]]]
        ];
        menu = document.createElement('div');
        menu.id = 'ff14-simple-navigation-menu';
        menu.className = 'ff14-nav-dropdown';
        menu.hidden = true;
        const columns = document.createElement('div');
        columns.className = 'ff14-nav-columns';
        for (const [en, zh, children] of groups) {
            const control = en === 'HOME' ? link('', BASE + '#/home') : document.createElement('button');
            control.className = 'ff14-nav-category';
            for (const [className, text] of [['en', en], ['zh', zh]]) {
                const span = document.createElement('span');
                span.className = className; span.textContent = text; control.appendChild(span);
            }
            if (en === 'HOME') control.addEventListener('click', showFullHome);
            else {
                control.type = 'button';
                control.setAttribute('aria-expanded', 'false');
                control.setAttribute('aria-controls', menu.id);
                control.addEventListener('click', () => setOpened(true));
            }
            categories.appendChild(control);
            const column = document.createElement('div');
            column.className = 'ff14-nav-column';
            if (children.length) {
                const heading = document.createElement('strong');
                heading.className = 'ff14-nav-column-title'; heading.textContent = zh;
                column.appendChild(heading);
            }
            children.forEach(([text, href, external]) => column.appendChild(link(text, href, external)));
            columns.appendChild(column);
        }
        menu.appendChild(columns);
        right.appendChild(categories);
        const actions = document.createElement('div');
        actions.className = 'ff14-nav-actions';
        for (const [label, href, icon, external] of [['商城', BASE + '#/shop', 'icon-shopcar', false], ['充值', 'https://pay.sdo.com/item/GWPAY-100001900', 'icon-time', true]]) {
            const anchor = link(label, href, external);
            anchor.className = 'ff14-nav-action';
            const symbol = document.createElement('i');
            symbol.className = 'icon iconfontWsyy ' + icon; symbol.setAttribute('aria-hidden', 'true');
            anchor.prepend(symbol); actions.appendChild(anchor);
        }
        const full = link('进入完整版', BASE + '#/home');
        full.className = 'ff14-nav-full'; full.addEventListener('click', showFullHome); actions.appendChild(full);
        const label = document.createElement('label'); label.className = 'ff14-nav-preference';
        preference = document.createElement('input'); preference.type = 'checkbox'; preference.checked = enabled();
        preference.addEventListener('change', () => savePreference(preference.checked));
        label.append(preference, '自动简约版'); actions.appendChild(label);
        right.appendChild(actions); nav.append(right, menu);
        categories.addEventListener('mouseenter', () => setOpened(true));
        menu.addEventListener('mouseenter', () => setOpened(true));
        nav.addEventListener('mouseleave', () => {
            closeTimer = setTimeout(() => { if (!nav.contains(document.activeElement)) setOpened(false); }, 120);
        });
        categories.addEventListener('focusin', () => setOpened(true));
        nav.addEventListener('focusout', () => {
            setTimeout(() => { if (!nav.contains(document.activeElement) && !nav.matches(':hover')) setOpened(false); }, 0);
        });
        nav.addEventListener('keydown', event => { if (event.key === 'Escape') setOpened(false); });
    }

    const style = document.createElement('style');
    style.textContent = `
        html.ff14-simple-enhanced .pageSimple .head { display: none !important; }
        #ff14-simple-navigation, #ff14-simple-navigation * { box-sizing: border-box; letter-spacing: 0; }
        #ff14-simple-navigation { position: absolute; inset: 0 0 auto; z-index: 50; min-height: 76px; padding: 0 40px;
            display: flex; align-items: center; justify-content: space-between; gap: 16px; background: rgba(0,0,0,.88); color: #fff; }
        #ff14-simple-navigation a { text-decoration: none; }
        #ff14-simple-navigation .ff14-nav-logo { display: block; flex: 0 0 133px; height: 39px; background: url(https://static.web.sdo.com/jijiamobile/pic/ff14/190110ffweb/logo.png) center/contain no-repeat; }
        #ff14-simple-navigation .ff14-nav-right { display: flex; align-items: center; gap: 16px; }
        #ff14-simple-navigation .ff14-nav-categories { display: flex; }
        #ff14-simple-navigation .ff14-nav-category { width: 120px; height: 76px; border: 0; padding: 0; background: transparent; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; font: inherit; cursor: pointer; }
        #ff14-simple-navigation .en { color: #9e9e9e; font-size: 10px; line-height: 12px; }
        #ff14-simple-navigation .zh { color: #c9c9c9; font-size: 16px; font-weight: 700; line-height: 20px; }
        #ff14-simple-navigation .ff14-nav-category:hover .zh, #ff14-simple-navigation .ff14-nav-category:focus .zh { color: #fff; }
        #ff14-simple-navigation .ff14-nav-actions { display: flex; align-items: center; gap: 16px; }
        #ff14-simple-navigation .ff14-nav-action { display: flex; justify-content: center; align-items: center; gap: 4px; width: 94px; height: 32px; border: 1px solid #ae9550; color: #e3c461; font-size: 16px; font-weight: 700; white-space: nowrap; }
        #ff14-simple-navigation .ff14-nav-action:hover { background: #64542a; color: #fff; }
        #ff14-simple-navigation .ff14-nav-full { height: 32px; padding: 0 16px; border-radius: 16px; background: #777; display: flex; align-items: center; color: #fff; font-size: 14px; font-weight: 700; white-space: nowrap; }
        #ff14-simple-navigation .ff14-nav-full:hover { background: #64542a; }
        #ff14-simple-navigation .ff14-nav-preference { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #ccc; white-space: nowrap; cursor: pointer; }
        #ff14-simple-navigation .ff14-nav-preference input { margin: 0; width: 15px; height: 15px; accent-color: #e3c461; }
        #ff14-simple-navigation .ff14-nav-dropdown { position: absolute; inset: 100% 0 auto; background: rgba(0,0,0,.92); border-top: 1px solid #444; padding: 18px 40px 24px; }
        #ff14-simple-navigation .ff14-nav-columns { display: grid; grid-template-columns: repeat(5,120px); justify-content: end; margin-right: 438px; }
        #ff14-simple-navigation .ff14-nav-column a { display: block; color: #bbb; font-size: 16px; font-weight: 700; line-height: 24px; padding: 6px 0; text-align: center; overflow-wrap: anywhere; }
        #ff14-simple-navigation .ff14-nav-column a:hover { color: #e3c461; }
        #ff14-simple-navigation .ff14-nav-column-title { display: none; }
        #ff14-simple-navigation [hidden] { display: none !important; }
        #ff14-simple-navigation :focus-visible { outline: 2px solid #e3c461; outline-offset: 2px; }
        @media(max-width:1400px) {
            #ff14-simple-navigation { padding: 0 20px; gap: 12px; }
            #ff14-simple-navigation .ff14-nav-actions, #ff14-simple-navigation .ff14-nav-right { gap: 10px; }
            #ff14-simple-navigation .ff14-nav-columns { margin-right: 414px; }
        }
        @media(max-width:1150px) {
            #ff14-simple-navigation .ff14-nav-logo { display: none; }
            #ff14-simple-navigation .ff14-nav-category { width: 94px; }
            #ff14-simple-navigation .ff14-nav-right { width: 100%; justify-content: center; }
            #ff14-simple-navigation .ff14-nav-columns { grid-template-columns: repeat(4,minmax(0,1fr)); margin: 0; }
            #ff14-simple-navigation .ff14-nav-column:first-child { display: none; }
        }
        @media(max-width:960px) {
            #ff14-simple-navigation .ff14-nav-right { flex-direction: column; gap: 0; padding-bottom: 12px; }
            #ff14-simple-navigation .ff14-nav-category { height: 62px; }
            html.ff14-simple-enhanced .pageSimple .simHead { padding-top: 180px; }
        }
        @media(max-width:540px) {
            #ff14-simple-navigation { padding: 0 12px; }
            #ff14-simple-navigation .ff14-nav-categories { width: 100%; }
            #ff14-simple-navigation .ff14-nav-category { width: 20%; }
            #ff14-simple-navigation .zh { font-size: 13px; }
            #ff14-simple-navigation .ff14-nav-actions { flex-wrap: wrap; justify-content: center; gap: 8px; }
            #ff14-simple-navigation .ff14-nav-action { width: 76px; font-size: 14px; }
            #ff14-simple-navigation .ff14-nav-full { padding: 0 12px; }
            #ff14-simple-navigation .ff14-nav-dropdown { padding: 12px; max-height: 70vh; overflow: auto; }
            #ff14-simple-navigation .ff14-nav-columns { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
            #ff14-simple-navigation .ff14-nav-column-title { display: block; text-align: center; color: #e3c461; font-size: 14px; padding: 8px 0; }
        }
    `;
    document.documentElement.appendChild(style);
    function synchronize() {
        queued = false;
        const route = location.hash.slice(1).split('?')[0].replace(/\/$/, '');
        if (route !== '/home') allowFullHome = false;
        if (route === '/home' && enabled() && !allowFullHome) {
            const query = location.hash.includes('?') ? '?' + location.hash.split('?').slice(1).join('?') : '';
            location.replace(BASE + location.search + '#/simple' + query);
            return;
        }
        const simple = route === '/simple';
        const navEnabled = FF14Enhancements.enabled('angelways.simpleNavigation');
        document.documentElement.classList.toggle('ff14-simple-enhanced', simple && navEnabled);
        if (!simple || !navEnabled) { if (nav?.isConnected) nav.remove(); setOpened(false); return; }
        if (!document.body) return;
        if (!nav) buildNav();
        if (!nav.isConnected) document.body.appendChild(nav);
        preference.checked = enabled();
    }
    function schedule() {
        if (queued) return;
        queued = true;
        setTimeout(synchronize, 50);
    }
    // Respect the simple page's original manual full-version button, too.
    document.addEventListener('click', event => {
        const button = event.target instanceof Element ? event.target.closest('.pageSimple .head .desbutton') : null;
        if (!button) return;
        event.stopImmediatePropagation(); showFullHome(event);
    }, true);
    window.addEventListener('hashchange', synchronize);
    window.addEventListener('popstate', synchronize);
    document.addEventListener('DOMContentLoaded', synchronize, { once: true });
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('ff14-enhancements-change', synchronize);
    registerMenu(); synchronize();
})();


// FF14 商城道具收录：OmniShopOwned
(function () {
    'use strict';
    if (!['qu.sdo.com','mall.sdo.com'].includes(location.hostname) || window !== window.top
        || !(location.pathname === '/tools-shop' || /^\/product-detail\//.test(location.pathname))) return;
    const BUNDLED = {"revision":3,"updatedAt":"2026-10-29T12:54:25.076724+00:00","products":[{"skuId":"2113165536521342976","name":"欢庆新式文化衫组合","items":["欢庆新式文化衫","大码欢庆新式文化衫","紧身欢庆新式文化衫"]},{"skuId":"2113164278221754368","name":"迷你文森特","items":["迷你文森特"]},{"skuId":"2113170356154126336","name":"管弦乐琴乐谱：重返擂台套装","items":["管弦乐琴乐谱:邪欲(重返擂台)","管弦乐琴乐谱:镜中的自我(重返擂台)","管弦乐琴乐谱:绝对霸道(重返擂台)","管弦乐琴乐谱:微笑(重返擂台)","管弦乐琴乐谱:原始的审判:复审(重返擂台)"]},{"skuId":"2113166386828398592","name":"管弦乐琴乐谱：泪流至曦明套装","items":["管弦乐琴乐谱:微笑(泪流至曦明)","管弦乐琴乐谱:金曦之都(泪流至曦明)","管弦乐琴乐谱:甜甜蜜蜜(泪流至曦明)","管弦乐琴乐谱:不会失效的约定(泪流至曦明)","管弦乐琴乐谱:五月的玫瑰 ~金曦~(泪流至曦明)"]},{"skuId":"2108821708490395648","name":"演技教材·霹雳舞","items":["演技教材·霹雳舞"]},{"skuId":"2108823239763677184","name":"南瓜行者","items":["南瓜行者"]},{"skuId":"2108822797029724160","name":"夜魔套装","items":["夜魔角","夜魔衬衫","夜魔露指护手","夜魔长裤","夜魔短靴"]},{"skuId":"2108823507645485056","name":"特制守护天节海报2025","items":["特制守护天节海报2025"]},{"skuId":"2108823767520366592","name":"特制蝙蝠南瓜","items":["特制蝙蝠南瓜"]},{"skuId":"2080512509356527616","name":"夜樱套装","items":["夜樱上衣","夜樱手套","夜樱软裤","夜樱草履"]},{"skuId":"2080510310131945472","name":"特制新生桌面台灯","items":["特制新生桌面台灯"]},{"skuId":"2080510010440536064","name":"新型迷你可露儿","items":["新型迷你可露儿"]},{"skuId":"2080509717027999744","name":"迷你古鲁加加","items":["迷你古鲁加加"]},{"skuId":"2080507827359830016","name":"零点套装","items":["零点铠甲","零点手铠","零点打底裤","零点锁甲靴"]},{"skuId":"2080508429078876160","name":"滨海套装","items":["滨海镜面太阳镜","滨海泳衣","滨海紧身短裤","滨海沙滩凉鞋"]},{"skuId":"2080509240269852672","name":"演技教材·扇大团扇","items":["演技教材·扇大团扇"]},{"skuId":"2080508893862285312","name":"特制爆弹怪气球","items":["特制爆弹怪气球"]},{"skuId":"2080510846021390336","name":"红莲之狂潮系列主题海报套装","items":["特制英雄归来海报","特制曙光微明海报","特制月下芳华海报","特制狂乱前奏海报","特制英雄挽歌海报"]},{"skuId":"2080511190637989888","name":"晓月之终途系列主题海报套装","items":["特制崭新的冒险海报","特制禁断的记忆海报","特制天上欢庆,地下轰鸣海报","特制负罪的王座海报","特制光明的零点海报"]},{"skuId":"2080511510441086976","name":"金曦之遗辉系列主题海报套装","items":["特制与未知邂逅海报","特制永久探求者海报","特制明日的路标海报","特制雾中奇境海报","特制天际的行路海报"]},{"skuId":"2029847141449646080","name":"哈迪-戴托纳启动钥匙","items":["哈迪-戴托纳启动钥匙"]},{"skuId":"2029848962742272000","name":"缇姨塔可饼新式文化衫组合","items":["缇姨塔可饼新式文化衫","大码缇姨塔可饼新式文化衫","紧身缇姨塔可饼新式文化衫"]},{"skuId":"2074332245840351232","name":"涂鸦新式文化衫组合","items":["涂鸦新式文化衫","大码涂鸦新式文化衫","紧身涂鸦新式文化衫"]},{"skuId":"2029855260351315968","name":"演技教材·模特步","items":["演技教材·模特步"]},{"skuId":"2074334873932517376","name":"演技教材·声援套装（橙粉靛）","items":["演技教材·前后声援小橙","演技教材·挥舞声援小粉","演技教材·蹦跳声援小靛"]},{"skuId":"2074333796348710912","name":"演技教材·前后声援小橙","items":["演技教材·前后声援小橙"]},{"skuId":"2074334077031534592","name":"演技教材·挥舞声援小粉","items":["演技教材·挥舞声援小粉"]},{"skuId":"2074334333387395072","name":"演技教材·蹦跳声援小靛","items":["演技教材·蹦跳声援小靛"]},{"skuId":"2029847697723408384","name":"迷你赤红XIII","items":["迷你赤红XIII"]},{"skuId":"2074333245380743168","name":"迷你尤菲","items":["迷你尤菲"]},{"skuId":"2054809453612748800","name":"新生国民套装","items":["新生国民卫衣","新生国民短裤","新生国民鞋"]},{"skuId":"2056571689595293696","name":"演技教材·击飞","items":["演技教材·击飞"]},{"skuId":"2056576312422944768","name":"河童蓑衣装备套装","items":["河童蓑衣头套","河童蓑衣套装"]},{"skuId":"2056571996907753472","name":"演技教材·大惊小怪","items":["演技教材·大惊小怪"]},{"skuId":"2056576797888466944","name":"特制仙人刺餐桌","items":["特制仙人刺餐桌"]},{"skuId":"2056579087127007232","name":"特制仙人刺先生时钟","items":["特制仙人刺先生时钟"]},{"skuId":"2047568766613766144","name":"新生女王套装","items":["新生女王华冠","新生女王礼服"]},{"skuId":"2048956922269450240","name":"远北套装","items":["远北帽","远北束腰衣","远北纤维手套","远北裙裤","远北筒靴"]},{"skuId":"2029854379551670272","name":"管弦乐琴乐谱：脉动电音2套装I","items":["管弦乐琴乐谱:山峡凉风(脉动电音2)","管弦乐琴乐谱:近在天边(脉动电音2)","管弦乐琴乐谱:满月之夜(脉动电音2)","管弦乐琴乐谱:甜甜蜜蜜(脉动电音2)","管弦乐琴乐谱:贤王莫古尔·莫古十二世(脉动电音2)"]},{"skuId":"2074338759758041088","name":"管弦乐琴乐谱：脉动电音2套装II","items":["管弦乐琴乐谱:忘却的此岸(脉动电音2)","管弦乐琴乐谱:末路尽头(脉动电音2)","管弦乐琴乐谱:魔神(脉动电音2)","管弦乐琴乐谱:不倦之人雅典娜(脉动电音2)","管弦乐琴乐谱:智慧的海螺(脉动电音2)"]},{"skuId":"2029853918446665728","name":"管弦乐琴乐谱：蛮荒神影乐团套装","items":["管弦乐琴乐谱:重压灭顶(蛮荒神影)","管弦乐琴乐谱:混沌的漩涡(蛮荒神影)","管弦乐琴乐谱:魔神(蛮荒神影)","管弦乐琴乐谱:轨迹(蛮荒神影)","管弦乐琴乐谱:金属 - 正义无情(蛮荒神影)"]},{"skuId":"2074338026493038592","name":"管弦乐琴乐谱：交响音乐会套装II","items":["管弦乐琴乐谱:呐喊(交响乐版)","管弦乐琴乐谱:盐与苦难之歌(交响乐版)","管弦乐琴乐谱:明日与未来(交响乐版)","管弦乐琴乐谱:山峡凉风(交响乐版)","管弦乐琴乐谱:孤注一掷(交响乐版)"]},{"skuId":"2031559588220944384","name":"预言蛋阳伞","items":["预言蛋阳伞"]},{"skuId":"2013467544156028928","name":"管家王子套装","items":["管家王子头戴式拾音器","管家王子外套","管家王子手套","管家王子长裤","管家王子长靴"]},{"skuId":"2013466075814084608","name":"皮蒂角笛","items":["皮蒂角笛"]},{"skuId":"2013457610513235968","name":"战场玫瑰套装","items":["战场玫瑰眼罩","战场玫瑰大衣","战场玫瑰袖甲","战场玫瑰紧身裤","战场玫瑰锁甲靴"]},{"skuId":"2013464743485030400","name":"演技教材·赠送花束","items":["演技教材·赠送花束"]},{"skuId":"2013458376439283712","name":"演技教材·比心","items":["演技教材·比心"]},{"skuId":"2013465134859730944","name":"特制恋人节海报2025","items":["特制恋人节海报2025"]},{"skuId":"2013459313811701760","name":"特制恋人节心形椅","items":["特制恋人节心形椅"]},{"skuId":"2008066946300559360","name":"同步优惠礼包","items":["梅茵菲娜耳坠","传送网使用券","演技教材·前后声援小白","红月油纸伞","幻想药"]},{"skuId":"2008069259626987520","name":"平民套装","items":["平民连体衣","平民手套","平民短靴"]},{"skuId":"2001213230381449216","name":"东方科技套装","items":["东方科技面罩","东方科技外套","东方科技手套","东方科技束膝裤","东方科技运动鞋"]},{"skuId":"2001209839265693696","name":"特制东方新年佳肴X5","items":["特制东方新年佳肴"]},{"skuId":"2001211647535005696","name":"特制迎春扇","items":["特制迎春扇"]},{"skuId":"2001208763288305664","name":"东方的白色土龙？","items":["东方的白色土龙?"]},{"skuId":"1993567572103184384","name":"正统圣人套装","items":["正统圣人帽","正统圣人短袍","正统圣人手套","正统圣人打底裤","正统圣人长靴"]},{"skuId":"1993568068297736192","name":"特制陆行鸟照明灌木","items":["特制陆行鸟照明灌木"]},{"skuId":"1985220796115763200","name":"发型样式：欧米茄F","items":["发型样式:欧米茄F"]},{"skuId":"1985220377327091712","name":"发型样式：欧米茄M","items":["发型样式:欧米茄M"]},{"skuId":"1976524872858386432","name":"伽拉忒亚装备套装","items":["伽拉忒亚王冠","伽拉忒亚上衣","伽拉忒亚吊带袜","伽拉忒亚高跟鞋"]},{"skuId":"1976227696420765696","name":"特制壁挂式吸血蝙蝠装饰","items":["特制壁挂式吸血蝙蝠装饰"]},{"skuId":"1976226904523587584","name":"演技教材·守护天节的魔咒","items":["演技教材·守护天节的魔咒"]},{"skuId":"1971110760481472512","name":"奥薇莉亚装备套装","items":["奥薇莉亚礼裙","奥薇莉亚衬裤","奥薇莉亚皮靴"]},{"skuId":"1971109785733611520","name":"拉姆萨装备套装","items":["拉姆萨外衣","拉姆萨手套","拉姆萨长靴"]},{"skuId":"1971116530103140352","name":"加夫加利昂装备套装","items":["加夫加利昂轻盔","加夫加利昂战甲","加夫加利昂手甲","加夫加利昂束膝裤","加夫加利昂筒靴"]},{"skuId":"1971123277979107328","name":"管弦乐琴乐谱：黄道勇士传奇套装","items":["管弦乐琴乐谱:开场动画","管弦乐琴乐谱:回忆","管弦乐琴乐谱:编队画面","管弦乐琴乐谱:勇士传奇","管弦乐琴乐谱:雷神西德主题曲"]},{"skuId":"1963179826939609088","name":"长绒猫笛","items":["长绒猫笛"]},{"skuId":"1963184187182858240","name":"另类套装","items":["另类针织帽","另类上衣","另类皮手镯","另类布袋裤","另类铆钉鞋"]},{"skuId":"1949686657350574080","name":"新生不死鸟角笛","items":["新生不死鸟角笛"]},{"skuId":"1949691210586333184","name":"管弦乐琴乐谱：重生的大地","items":["管弦乐琴乐谱:重生的大地"]},{"skuId":"1949691464291393536","name":"管弦乐琴乐谱：天降之绒","items":["管弦乐琴乐谱:天降之绒"]},{"skuId":"1949696744932712448","name":"东方旅行艺人套装","items":["东方旅行艺人面具","东方旅行艺人复衫","东方旅行艺人长裤","东方旅行艺人皮鞋"]},{"skuId":"1949687095588233216","name":"特制新生庆典海报2024","items":["特制新生庆典海报2024"]},{"skuId":"1935613274161852416","name":"狒狒","items":["狒狒"]},{"skuId":"1945401878773964800","name":"水晶都叛逆者套装","items":["水晶都叛逆者上装","水晶都叛逆者腕环","水晶都叛逆者紧身短裤","水晶都叛逆者长靴"]},{"skuId":"1942102752430858240","name":"不死鸟英雄套装","items":["不死鸟英雄头盔","不死鸟英雄战衣"]},{"skuId":"1935302041047052288","name":"阿泽玛装备箱","items":["阿泽玛装备箱"]},{"skuId":"1935302717189828608","name":"发型样式：阿泽玛","items":["发型样式:阿泽玛"]},{"skuId":"1931923235129176064","name":"进击的好脑袋笛","items":["进击的好脑袋笛"]},{"skuId":"1935304459444989952","name":"皮带上衣软甲裤3件套","items":["皮带上衣","皮带软甲裤","皮带皮靴"]},{"skuId":"1935612348030169088","name":"皮带开口上衣七分裤3件套","items":["皮带开口上衣","皮带七分裤","皮带便鞋"]},{"skuId":"1935303376886738944","name":"皮带贝雷帽指套2件套","items":["皮带贝雷帽","皮带指套"]},{"skuId":"1911626652982620160","name":"发型样式：编发高马尾","items":["发型样式:编发高马尾"]},{"skuId":"1920662644313993216","name":"特制园艺棕榈树","items":["特制园艺棕榈树"]},{"skuId":"1920661376912764928","name":"特制仙人掌花园","items":["特制仙人掌花园"]},{"skuId":"1920663254203543552","name":"迷你戈德伯特","items":["迷你戈德伯特"]},{"skuId":"1909852969326784512","name":"零风套装","items":["零风礼帽","零风胸甲","零风重足铠","零风耳坠"]},{"skuId":"1909855008630943744","name":"发型样式：蓬松短发","items":["发型样式:蓬松短发"]},{"skuId":"1909860335640293376","name":"零风死镰","items":["零风死镰"]},{"skuId":"1905462743309398016","name":"血盟公爵套装","items":["血盟公爵上衣","血盟公爵弓术手套","血盟公爵五分裤","血盟公爵皮靴"]},{"skuId":"1905464835012997120","name":"发型样式：血盟公爵","items":["发型样式:血盟公爵"]},{"skuId":"1905464059628793856","name":"血盟公爵武器套装","items":["血盟公爵幻杖","血盟公爵咒杖"]},{"skuId":"1906961554691239936","name":"特制酒杯塔","items":["特制酒杯塔"]},{"skuId":"1904003150968434688","name":"演技教材·公主之舞","items":["演技教材·公主之舞"]},{"skuId":"1904003602128744448","name":"特制女儿节海报2022","items":["特制女儿节海报2022"]},{"skuId":"1904005429859627008","name":"管弦乐琴乐谱：进退","items":["管弦乐琴乐谱:进退"]},{"skuId":"1904002621110398976","name":"冬贝利套装","items":["冬贝利头套","冬贝利身体","冬贝利手套","冬贝利短裤","冬贝利短靴"]},{"skuId":"1904007693382889472","name":"演技教材·吓唬人","items":["演技教材·吓唬人"]},{"skuId":"1904006951637004288","name":"特制彩蛋狩猎海报2023","items":["特制彩蛋狩猎海报2023"]},{"skuId":"1904010452039544832","name":"管弦乐琴乐谱：啪啪呀降质版","items":["管弦乐琴乐谱:啪啪呀降质版"]},{"skuId":"1900496259004936192","name":"演技教材·吹泡泡","items":["演技教材·吹泡泡"]},{"skuId":"1900495380923199488","name":"运动休闲套装","items":["运动休闲针织帽","运动休闲破烂罩衫上衣","运动休闲运动裤","运动休闲运动鞋","运动休闲短罩衫上衣"]},{"skuId":"1893876437248815104","name":"蒙特套装","items":["雷欧尼斯国王战铠","雷欧尼斯国王护臂","雷欧尼斯国王衬裤","雷欧尼斯国王战靴"]},{"skuId":"1893877531580477440","name":"玛雪莉套装","items":["霍伦女王外袍","霍伦女王紧身裤","霍伦女王长靴"]},{"skuId":"1889586305301655552","name":"风火锅笛","items":["风火锅笛"]},{"skuId":"1887824550330281984","name":"特制恋人节心形桌台","items":["特制恋人节心形桌台"]},{"skuId":"1887823970593583104","name":"演技教材·吃恋人巧克力","items":["演技教材·吃恋人巧克力"]},{"skuId":"1887822633977950208","name":"爱情传道士套装（夹克版）","items":["爱情传道士圆礼帽","爱情传道士外套","爱情传道士长裤","爱情传道士短靴"]},{"skuId":"1887823158127538176","name":"爱情传道士套装（连衣裙版）","items":["爱情传道士礼帽","爱情传道士褶边连衣裙","爱情传道士短裤","爱情传道士礼靴"]},{"skuId":"1874031463124611072","name":"特制戌狗娃娃","items":["特制戌狗娃娃"]},{"skuId":"1874031057627688960","name":"辰龙巧儿陆行鸟","items":["辰龙巧儿陆行鸟"]},{"skuId":"1874026717294800896","name":"暗影之逆焰系列主题海报套装","items":["特制纯白誓约、漆黑密约海报","特制追忆的凶星海报","特制水晶的残光海报","特制另一个未来海报","特制死斗至黎明海报"]},{"skuId":"1865954548748824576","name":"林地守护者套装","items":["林地守护者上装","林地守护者指套","林地守护者马裤","林地守护者长靴","林地守护者短裙"]},{"skuId":"1865955440340414464","name":"演技教材·煎蛋","items":["演技教材·煎蛋"]},{"skuId":"1865956171579568128","name":"幻象闪电角笛","items":["幻象闪电角笛"]},{"skuId":"1865956726079139840","name":"特制幻光枯树","items":["特制幻光枯树"]},{"skuId":"1861245207516983296","name":"苍穹之禁城系列主题海报套装","items":["特制光与暗的分界海报","特制命运的齿轮海报","特制绝命怒嚎海报","特制灵魂继承者海报","特制命运的止境海报"]},{"skuId":"1861244532565389312","name":"重生之境系列主题海报套装","items":["特制觉醒之境海报","特制混沌的漩涡海报","特制艾欧泽亚的守护者海报","特制寒冰的幻想海报","特制希望的灯火海报"]},{"skuId":"1848658398039666688","name":"复制原画«金曦群像»","items":["复制原画«金曦群像»"]},{"skuId":"1848656843609632768","name":"守夜医套装","items":["守夜医面具","守夜医白大褂","守夜医橡胶手套","守夜医打底裤","守夜医皮鞋"]},{"skuId":"1848657447174172672","name":"演技教材·吃南瓜曲奇","items":["演技教材·吃南瓜曲奇"]},{"skuId":"1848658118334115840","name":"特制鬼火灯笼","items":["特制鬼火灯笼"]},{"skuId":"1832976282513784832","name":"7.0电子典藏包","items":["陆行鸟之笔","方舟认证密钥","迷你嘉妮特"]},{"skuId":"1831934513189699584","name":"晓月主线直升礼包","items":["晓月冒险录","白银陆行鸟羽毛","亚拉戈白金币"]},{"skuId":"1832011497345335296","name":"绝枪战士90级直升礼包","items":["绝枪战士冒险录·晓月之章","信条御敌饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832010984310652928","name":"暗黑骑士90级直升礼包","items":["暗黑骑士冒险录·晓月之章","信条御敌饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1831942112022839296","name":"战士90级直升礼包","items":["战士冒险录·晓月之章","信条御敌饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1831939616185466880","name":"骑士90级直升礼包","items":["骑士冒险录·晓月之章","信条御敌饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832013408077299712","name":"占星术士90级直升礼包","items":["占星术士冒险录·晓月之章","信条治愈饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832013778195267584","name":"贤者90级直升礼包","items":["贤者冒险录·晓月之章","信条治愈饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832013008636952576","name":"学者90级直升礼包","items":["学者冒险录·晓月之章","信条治愈饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832012395664588800","name":"白魔法师90级直升礼包","items":["白魔法师冒险录·晓月之章","信条治愈饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832021271063511040","name":"钐镰客90级直升礼包","items":["钐镰客冒险录·晓月之章","信条强攻饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832016044046368768","name":"龙骑士90级直升礼包","items":["龙骑士冒险录·晓月之章","信条强攻饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832014195293634560","name":"武僧90级直升礼包","items":["武僧冒险录·晓月之章","信条强攻饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832016879669166080","name":"武士90级直升礼包","items":["武士冒险录·晓月之章","信条强攻饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832022109148364800","name":"忍者90级直升礼包","items":["忍者冒险录·晓月之章","信条精准饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832024012640960512","name":"机工士90级直升礼包","items":["机工士冒险录·晓月之章","信条精准饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832025174832267264","name":"舞者90级直升礼包","items":["舞者冒险录·晓月之章","信条精准饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832022999519412224","name":"吟游诗人90级直升礼包","items":["吟游诗人冒险录·晓月之章","信条精准饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832965726843125760","name":"黑魔法师90级直升礼包","items":["黑魔法师冒险录·晓月之章","信条咏咒饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832968853260550144","name":"召唤师90级直升礼包","items":["召唤师冒险录·晓月之章","信条咏咒饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832972205608353792","name":"赤魔法师90级直升礼包","items":["赤魔法师冒险录·晓月之章","信条咏咒饰品箱(品级660)","亚拉戈白金币"]},{"skuId":"1832974455089086464","name":"出众雇员直升冒险录X1","items":["出众雇员冒险录"]},{"skuId":"1832974811797864448","name":"出众雇员直升冒险录X3","items":["出众雇员冒险录"]},{"skuId":"1832975080333983744","name":"出众雇员直升冒险录X5","items":["出众雇员冒险录"]},{"skuId":"1815998486096785408","name":"发条索鲁斯","items":["发条索鲁斯"]},{"skuId":"1815996683317817344","name":"特制夏日篝火","items":["特制夏日篝火"]},{"skuId":"1815996216512753664","name":"夏暮套装","items":["夏暮头带","夏暮沙滩罩衫","夏暮腕环","夏暮泳裤","夏暮凉鞋"]},{"skuId":"1775399899772428288","name":"加隆德GL-IS钥匙","items":["加隆德GL-IS钥匙"]},{"skuId":"2007730954511237120","name":"演技教材·声援套装","items":["演技教材·前后声援小蓝","演技教材·挥舞声援小黄","演技教材·蹦跳声援小红"]},{"skuId":"1775402439427694592","name":"演技教材·威光降临","items":["演技教材·威光降临"]},{"skuId":"2007744923489714176","name":"演技教材·挥舞声援小黄","items":["演技教材·前后声援小黄"]},{"skuId":"2007744724432240640","name":"演技教材·前后声援小蓝","items":["演技教材·前后声援小蓝"]},{"skuId":"2007745236556759040","name":"演技教材·蹦跳声援小红","items":["演技教材·前后声援小红"]},{"skuId":"1775408079202099200","name":"演技教材·声援套装（白紫绿）","items":["演技教材·前后声援小白","演技教材·挥舞声援小紫","演技教材·蹦跳声援小绿"]},{"skuId":"2007744364212830208","name":"演技教材·蹦跳声援小绿","items":["演技教材·前后声援小绿"]},{"skuId":"2007741066671996928","name":"演技教材·前后声援小白","items":["演技教材·前后声援小白"]},{"skuId":"2007744110012841984","name":"演技教材·挥舞声援小紫","items":["演技教材·挥舞声援小紫"]},{"skuId":"1775410997821120512","name":"管弦乐琴乐谱：继续前进套装Ⅱ","items":["管弦乐琴乐谱:生如归流(继续前进)","管弦乐琴乐谱:远古的昊空(继续前进)","管弦乐琴乐谱:开开心心胡萝卜(继续前进)","管弦乐琴乐谱:迷津(继续前进)","管弦乐琴乐谱:满月之夜(Amanda Achen演唱版)"]},{"skuId":"1775410492331991040","name":"管弦乐琴乐谱：继续前进套装Ⅰ","items":["管弦乐琴乐谱:末路尽头(继续前进)","管弦乐琴乐谱:相白质黑(继续前进)","管弦乐琴乐谱:尖叫(继续前进)","管弦乐琴乐谱:生命的天平(继续前进)","管弦乐琴乐谱:不倦之人雅典娜(继续前进)"]},{"skuId":"1775409976092860416","name":"管弦乐琴乐谱：脉动电音套装Ⅱ","items":["管弦乐琴乐谱:坚不可摧(脉动电音)","管弦乐琴乐谱:平衡(脉动电音)","管弦乐琴乐谱:阴谋美计(脉动电音)","管弦乐琴乐谱:伟大的母港(脉动电音)","管弦乐琴乐谱:一瞬千里(脉动电音)"]},{"skuId":"1775409566791704576","name":"管弦乐琴乐谱：交响音乐会套装","items":["管弦乐琴乐谱:暗影使者(交响乐版)","管弦乐琴乐谱:呼唤终结之神(交响乐版)","管弦乐琴乐谱:你的答案(交响乐版)","管弦乐琴乐谱:近在天边(交响乐版)","管弦乐琴乐谱:终结之战(交响乐版)"]},{"skuId":"1795445658844602368","name":"演技教材·展现","items":["演技教材·展现"]},{"skuId":"1775369477554380800","name":"弦月","items":["弦月"]},{"skuId":"1775356173654106112","name":"5个红肠披萨套餐","items":["红肠披萨套餐"]},{"skuId":"1775355320276819968","name":"演技教材·吃披萨","items":["演技教材·吃披萨"]},{"skuId":"1768216540340232192","name":"特制猎蛋装甲","items":["特制猎蛋装甲"]},{"skuId":"1768217739957313536","name":"演技教材·吃水煮蛋","items":["演技教材·吃水煮蛋"]},{"skuId":"1768217030528540672","name":"开心彩蛋幸福兔","items":["开心彩蛋幸福兔"]},{"skuId":"1768218294062620672","name":"特制彩蛋篮","items":["特制彩蛋篮"]},{"skuId":"1768222481324384256","name":"特制彩蛋狩猎旋转挂饰","items":["特制彩蛋狩猎旋转挂饰"]},{"skuId":"1760603642285727744","name":"公主迷你王冠","items":["公主迷你王冠"]},{"skuId":"1744622164276117504","name":"邮差装甲","items":["邮差装甲"]},{"skuId":"1744622586097270784","name":"特制情人装甲","items":["特制情人装甲"]},{"skuId":"1744899800780996608","name":"特制恋人节旋转挂饰","items":["特制恋人节旋转挂饰"]},{"skuId":"1744310113972486144","name":"特制降神节朱红白鹤旗","items":["特制降神节朱红白鹤旗"]},{"skuId":"1744309232715661312","name":"降神猛士套装","items":["降神猛士胴丸","降神猛士笼手","降神猛士佩楯","降神猛士护胫"]},{"skuId":"1729029334363242496","name":"冰心套装","items":["冰心长袍","冰心护臂","冰心打底裤","冰心高筒靴"]},{"skuId":"1729030369123205120","name":"复制原画«晓月群像»","items":["复制原画«晓月群像»"]},{"skuId":"1729035160180195328","name":"复制原画套装2023","items":["复制原画《拂晓血盟》","复制原画《龙诗群像》","复制原画《红莲群像》","复制原画《暗影群像》","复制原画«晓月群像»"]},{"skuId":"1729034224800071680","name":"特制星光旋转挂饰","items":["特制星光旋转挂饰"]},{"skuId":"1729031707244593152","name":"鲁迪玩偶","items":["鲁迪玩偶"]},{"skuId":"1729032138008002560","name":"幻栗斋","items":["幻栗斋"]},{"skuId":"1711300698663751680","name":"领主套装","items":["领主贝雷帽","领主皮衣","领主手套","领主马裤","领主长靴"]},{"skuId":"1711646553061134336","name":"小丑套装","items":["小丑帽","小丑上装","小丑短手套","小丑打底裤","小丑长靴"]},{"skuId":"1711643429361618944","name":"面妆样式：小丑","items":["面妆样式:小丑"]},{"skuId":"1701436239656980480","name":"影狼","items":["影之角笛"]},{"skuId":"1711644543469424640","name":"特制南瓜鬼魂组合","items":["特制南瓜鬼魂组合"]},{"skuId":"1711644095282876416","name":"特制南瓜花盆","items":["特制南瓜花盆"]},{"skuId":"1701434368003346432","name":"魔导套装","items":["魔导护耳","魔导外套","魔导指套","魔导打底裤","魔导短靴"]},{"skuId":"1701435104179195904","name":"演技教材·雀跃","items":["演技教材·雀跃"]},{"skuId":"1681541410244440064","name":"就学套装（裤装版）","items":["就学帽","就学外套","就学长裤","就学皮鞋"]},{"skuId":"1681541907114274816","name":"就学套装（裙装版）","items":["就学水手服","就学水手短裙","就学便鞋"]},{"skuId":"1681542770054574080","name":"管弦乐琴乐谱：无限循环（交响乐版）","items":["管弦乐琴乐谱:无限循环(交响乐版)"]},{"skuId":"1681542478944710656","name":"管弦乐琴乐谱：华彩的山麓（交响乐版）","items":["管弦乐琴乐谱:华彩的山麓(交响乐版)"]},{"skuId":"1681545714829275136","name":"红月油纸伞","items":["红月油纸伞"]},{"skuId":"1678335269519642624","name":"极地熊角笛","items":["极地熊角笛"]},{"skuId":"1678336211866505216","name":"特制卖面具的摊位","items":["特制卖面具的摊位"]},{"skuId":"1678337883527335936","name":"5个特制烤玉米","items":["特制烤玉米"]},{"skuId":"1678336782971326464","name":"5个特制冰海岸","items":["特制冰海岸"]},{"skuId":"1795005867304886272","name":"水晶都神童套装","items":["水晶都神童上装","水晶都神童半指护手","水晶都神童骑兵裤","水晶都神童高筒靴"]},{"skuId":"1673893209894965248","name":"新款阿莉塞服装套装","items":["发型样式:萨雷安叛逆者","新款阿莉塞服装套装"]},{"skuId":"1663826591630405632","name":"演技教材·困惑","items":["演技教材·困惑"]},{"skuId":"1655430314286804992","name":"演技教材·魔术","items":["演技教材·魔术"]},{"skuId":"1655435556067897344","name":"约定之锤武器箱","items":["约定之锤武器箱"]},{"skuId":"1655445924001509376","name":"盖娅服装套装","items":["盖娅服装套装"]},{"skuId":"1655434557370560512","name":"幽暗的约定之锤","items":["幽暗的约定之锤"]},{"skuId":"1655434132982493184","name":"黄道的约定之锤","items":["黄道的约定之锤"]},{"skuId":"1655432967871950848","name":"荒芜的约定之锤","items":["荒芜的约定之锤"]},{"skuId":"1655432579399708672","name":"漆黑的约定之锤","items":["漆黑的约定之锤"]},{"skuId":"1655431855949377536","name":"蔽日的约定之锤","items":["蔽日的约定之锤"]},{"skuId":"1655433344595947520","name":"暗影的约定之锤","items":["暗影的约定之锤"]},{"skuId":"1655433786042249216","name":"灵极的约定之锤","items":["灵极的约定之锤"]},{"skuId":"1657956297762041856","name":"青磷气球","items":["青磷气球"]},{"skuId":"ba74b28d5c262bb8e2b4","name":"幻想药X1","items":["幻想药"]},{"skuId":"b794d087023392307efb","name":"山间少女套","items":["山间少女帽","山间少女束腰紧身衣","山间少女腕环","山间少女长裙","山间少女礼鞋"]},{"skuId":"e4d75218ab8d814069b8","name":"登山套","items":["登山帽","登山外套","登山半指手套","登山五分裤","登山长靴"]},{"skuId":"5bf4d2feaa335a243727","name":"小黄莺套装","items":["小黄莺礼帽","小黄莺上衣","小黄莺手套","小黄莺短裙","小黄莺矮靴"]},{"skuId":"7d2f6ac8eda02a376a85","name":"总管套装","items":["总管礼帽","总管外套","总管半指护手","总管马裤","总管矮靴"]},{"skuId":"3f987a32f8601df76310","name":"恋人节套装（短裙）","items":["恋人帽 \" / 1 \"恋人围裙装","恋人连指手套 \" / 1 \"恋人短裙 \" / 1 \"恋人厚底鞋"]},{"skuId":"a76ea5f8616dc0a447cd","name":"恋人节套装（长裤）","items":["恋人帽 \" / 1 \"恋人围裙服","恋人连指手套 \" / 1 \"恋人长裤 \" / 1 \"恋人厚底鞋"]},{"skuId":"1612348088183861248","name":"魔法雨伞","items":["魔法雨伞"]},{"skuId":"1612354540336230400","name":"魔法阳伞","items":["魔法阳伞"]},{"skuId":"1608307313301172224","name":"演技教材·叛逆精神","items":["演技教材·叛逆精神"]},{"skuId":"1608309545211965440","name":"猫小胖套装","items":["猫小胖兜帽","猫小胖家居服","猫小胖家居五分裤","猫小胖拖鞋","猫小胖家居短裤"]},{"skuId":"1557311014276083712","name":"阿拉米格莉瑟服装套装","items":["阿拉米格莉瑟服装套装","发型样式:莉瑟"]},{"skuId":"1557306089861197824","name":"街头套装","items":["街头鸭舌帽","街头上装","街头外套","街头手饰","街头工装裤","街头高帮鞋"]},{"skuId":"1516685614428884992","name":"欧米茄F服装套装","items":["欧米茄F服装套装","欧米茄F耳环"]},{"skuId":"1516685016157556736","name":"欧米茄M服装套装","items":["欧米茄M服装套装","欧米茄M耳夹"]},{"skuId":"1510165899808256000","name":"机巧莲座","items":["机巧莲座启动钥匙"]},{"skuId":"1575075534964662272","name":"大大柴笛","items":["大大柴笛"]},{"skuId":"1499243317902897152","name":"6.0电子典藏包","items":["死亡镰刀","阿里翁角笛","迷你普罗姆"]},{"skuId":"60f5bbf61d6a18f07fab","name":"5.0电子典藏包","items":["格拉尼角笛","迷你芙兰","左轮枪刃"]},{"skuId":"1831924339234258944","name":"苍穹主线直升礼包","items":["苍穹冒险录","白银陆行鸟羽毛","亚拉戈白金币"]},{"skuId":"1831925230922317824","name":"重生之境主线直升礼包","items":["重生冒险录","白银陆行鸟羽毛","亚拉戈白金币"]},{"skuId":"1831926999387684864","name":"红莲主线直升礼包","items":["红莲冒险录","白银陆行鸟羽毛","亚拉戈白金币"]},{"skuId":"1831929594122551296","name":"暗影主线直升礼包","items":["暗影冒险录","白银陆行鸟羽毛","亚拉戈白金币"]},{"skuId":"9285e265be3b8505f325","name":"巡航驱逐者认证密钥","items":["巡航驱逐者认证密钥"]},{"skuId":"2043d7f3272aecda7596","name":"志士套装","items":["志士钵铁","志士羽织","志士筒袴","志士草履"]},{"skuId":"c7090d9a43be6abbf6e0","name":"学院制服（领带）套装","items":["学院制服(领带)","学院长裤","学院便鞋(短袜)"]},{"skuId":"e46a4f31d216464d3448","name":"学院制服（蝴蝶结）套装","items":["学院制服(蝴蝶结)","学院短裙","学院便鞋(高筒袜)"]},{"skuId":"2e4dabedce92c5ab4bad","name":"真月魔导鲸认证密钥","items":["真月魔导鲸认证密钥"]},{"skuId":"c80087d9b75a2b4cac14","name":"新款阿尔菲诺服装套装","items":["新款阿尔菲诺服装套装","发型样式:萨雷安神童"]},{"skuId":"1557310121375870976","name":"演技教材·饮用红茶","items":["演技教材·饮用红茶"]},{"skuId":"2221c14eff8e4f76f6fb","name":"演技教材·默剧","items":["演技教材·默剧"]},{"skuId":"be1fe64525dfb90e2fd3","name":"女仆套装","items":["女仆发带","女仆围裙装","女仆腕带","女仆蓬松裤","女仆礼鞋"]},{"skuId":"392a0e83fcb02dd3feb8","name":"管家套装","items":["管家单眼镜","管家燕尾服","管家手套","管家长裤","管家礼鞋"]},{"skuId":"1777990241872977920","name":"美格雅卡套装","items":["美格雅卡头冠","美格雅卡长袍","美格雅卡软甲裤","美格雅卡长靴"]},{"skuId":"0393a928806be8f6b2fa","name":"巫女套装","items":["巫女上装","巫女热裤","巫女护腿"]},{"skuId":"10d73429f0e4ec678a17","name":"东方贵人套装","items":["东方贵人爵弁","东方贵人玄端","东方贵人腕饰","东方贵人帷裳","东方贵人舄履"]},{"skuId":"b76fe674147004048ec5","name":"风雅套装","items":["风雅长羽织","风雅袴"]},{"skuId":"d926f382039d7919683f","name":"孔雀套","items":["孔雀帽","孔雀玄端","孔雀笼手","孔雀帷裳","孔雀靴"]},{"skuId":"8e253c0d35b9f60c1590","name":"东方美玉套装","items":["东方美玉帽","东方美玉服","东方美玉腕饰","东方美玉衬裙","东方美玉靴"]},{"skuId":"d4f5cf57ed90cf12946f","name":"东方雅士套装","items":["东方雅士帽","东方雅士服","东方雅士腕饰","东方雅士长裤","东方雅士靴"]},{"skuId":"63ddbb7427d0fda349a7","name":"东方丽人套装","items":["东方丽人发饰","东方丽人服","东方丽人衬裙","东方丽人靴"]},{"skuId":"8b0f54b9b6147185359e","name":"东方雅人套装","items":["东方雅人帽","东方雅人服","东方雅人佩楯","东方雅人靴"]},{"skuId":"3dab257d315500d90305","name":"东方秀女套装","items":["东方秀女旗袍","东方秀女旗裙","东方秀女布鞋"]},{"skuId":"8ddb2593e90a4293f221","name":"东方公子套装","items":["东方公子长衫","东方公子长裤","东方公子布鞋"]},{"skuId":"4f9f32a263ee537c0971","name":"东方女官套装","items":["东方女官帽","东方女官服","东方女官靴"]},{"skuId":"b70142cdaa706f03d1da","name":"东方武官套","items":["东方武官帽","东方武官服","东方武官腕环","东方武官裤","东方武官鞋"]},{"skuId":"1e3280e1173b96b9d5a1","name":"东方书生套","items":["东方书生帽","东方书生袴","东方书生草履"]},{"skuId":"81433db83a10fe38ae7a","name":"东方女生套","items":["东方女生发带","东方女生袴","东方女生皮靴"]},{"skuId":"369de7c00b7d321af57c","name":"东方美姬套","items":["东方美姬帽","东方美姬服","东方美姬腕环","东方美姬裤","东方美姬鞋"]},{"skuId":"bf0d15b17f78827df21a","name":"东方警卫套装","items":["东方警卫帽","东方警卫制服","东方警卫长靴"]},{"skuId":"037c11149442c1fbe99d","name":"辨天套装","items":["辨天帽","辨天服","辨天手套","辨天衬裙","辨天短靴"]},{"skuId":"f639271d42579d7c5eff","name":"门客套装","items":["门客帽","门客斗衣","门客袖饰","门客长裤","门客皮鞋"]},{"skuId":"25af48e95c7f66074d32","name":"哪吒白莲套装","items":["哪吒白莲花钿","哪吒白莲斗衣","哪吒白莲手套","哪吒白莲斗裤","哪吒白莲斗靴"]},{"skuId":"df82f768dfea8ddee818","name":"哪吒赤莲套装","items":["哪吒赤莲花钿","哪吒赤莲斗衣","哪吒赤莲手套","哪吒赤莲斗裤","哪吒赤莲斗靴"]},{"skuId":"15659bcf629eca9b5e3f","name":"天使套装","items":["天使光环","天使羽衣","天使手环","天使长裤","天使长靴"]},{"skuId":"c0bf3ad6150be0398f84","name":"恶魔套装","items":["恶魔弯角","恶魔羽衣","恶魔手环","恶魔长裤","恶魔长靴"]},{"skuId":"ee73c5184a8ef2078cfc","name":"上仙套装","items":["上仙紧箍","上仙斗衣","上仙数珠","上仙长裤","上仙缠足"]},{"skuId":"5ce8c34a82e5373ceb16","name":"王子套装","items":["王子头冠","王子礼服","王子手套","王子长裤","王子长靴"]},{"skuId":"1777991409021952000","name":"公主套装","items":["公主华冠","公主礼服","公主手套","公主长裙","公主高跟鞋"]},{"skuId":"06603348f535d4f7831d","name":"大召唤士套装","items":["大召唤士礼服","大召唤士护臂","大召唤士长靴"]},{"skuId":"e40a04d2a3f066b7e220","name":"艾普套装","items":["艾普上衣","艾普手套","艾普短裤","艾普矮靴"]},{"skuId":"50d377c609048e2342f8","name":"绿宝石兽套装","items":["绿宝石兽发箍","绿宝石兽上衣","绿宝石兽长靴"]},{"skuId":"af11d066f1d2a30ee2d8","name":"绿宝石兽拖鞋","items":["绿宝石兽拖鞋"]},{"skuId":"fe84f89100ce90342cbc","name":"黄宝石兽套装","items":["黄宝石兽发箍","黄宝石兽上衣","黄宝石兽长靴"]},{"skuId":"ce492c872cde5ced5c8d","name":"黄宝石兽拖鞋","items":["黄宝石兽拖鞋"]},{"skuId":"e382d8c84742990124f5","name":"红宝石兽套装","items":["红宝石兽发箍","红宝石兽外套","红宝石兽长靴"]},{"skuId":"e035448b0b425f9eff8c","name":"红宝石兽拖鞋","items":["红宝石拖鞋"]},{"skuId":"76573ffc33704e2024c2","name":"莫古莫古套装","items":["莫古莫古头套","莫古莫古身体","莫古莫古手臂","莫古莫古短裙","莫古莫古长靴"]},{"skuId":"a7ab2de06377222840a4","name":"黄色绒球莫古莫古帽","items":["黄色绒球莫古莫古帽"]},{"skuId":"ec8889d1553038ee35ef","name":"凯特西猫耳","items":["凯特西猫耳"]},{"skuId":"74457e67ccc15a9e41c8","name":"钟情之誓（白金方案）","items":["钟情之誓(白金方案)"]},{"skuId":"cf7342df4897de1397cb","name":"激情之誓（黄金方案）","items":["激情之誓(黄金方案)"]},{"skuId":"5a5345b81181598c7b00","name":"4.0电子典藏包","items":["希尔德拉角笛","迷你赤魔法师","迷你巴兹","弱鸡匕首","阿拉米格耳坠"]},{"skuId":"40aaab0a598b4f8e7665","name":"3.0开服纪念特典","items":["迷你凯因","巴隆头盔"]},{"skuId":"0c51662c172d0a2f356c","name":"纯情之誓（标准方案）","items":["纯情之誓(标准方案)"]},{"skuId":"a711386e73f00e8cb63a","name":"2.0典藏包数字版","items":["光之头盔","贝希摩斯装甲","阿修罗护臂","古菩角笛"]},{"skuId":"ea0b00a666945a85a6f5","name":"SDS芬里尔密钥","items":["SDS芬里尔密钥"]},{"skuId":"14c6a35ee998cf49e8eb","name":"猫大胖角笛","items":["猫大胖角笛"]},{"skuId":"59685ad6971c15decf5a","name":"胖莫古力角笛","items":["胖莫古力角笛"]},{"skuId":"1527210330839224320","name":"黑色胖陆行鸟笛","items":["黑色胖陆行鸟笛"]},{"skuId":"1555094940252024832","name":"猴面爸爸笛","items":["猴面爸爸笛"]},{"skuId":"22af9d105a25564d5e28","name":"须鲸角笛","items":["须鲸角笛"]},{"skuId":"efa5589f502b4012ab17","name":"陆行鸟篷车角笛","items":["陆行鸟篷车角笛"]},{"skuId":"1777537114547888128","name":"筋斗云之书","items":["筋斗云之书"]},{"skuId":"b2a8f24e4c8d5458cc96","name":"魔石精笛","items":["魔石精笛"]},{"skuId":"0f07c33fc67ac98b3d14","name":"孔雀笛","items":["孔雀笛"]},{"skuId":"333e17a635ef8ef89c54","name":"魔法飞毯","items":["魔法飞毯"]},{"skuId":"36d5d22b27a5cb359a93","name":"赤兔马角笛","items":["赤兔马角笛"]},{"skuId":"5084cfa5129b5dd92d40","name":"仙术熊猫笛","items":["仙术熊猫笛"]},{"skuId":"f63c264e5df48a506204","name":"风火轮","items":["风火轮"]},{"skuId":"3e90033a23003661d5d0","name":"海蓝宝石兽笛","items":["海蓝宝石兽笛"]},{"skuId":"58f0ac4fef375191401b","name":"红电气宝石兽笛","items":["红电气宝石兽笛"]},{"skuId":"75f41538917e1965d121","name":"黄水晶宝石兽笛","items":["黄水晶宝石兽笛"]},{"skuId":"154147dc6d0d1f6f7b7d","name":"斯莱普尼尔角笛","items":["斯莱普尼尔角笛"]},{"skuId":"7c1cbac8515c56635bb5","name":"狮鹫角笛","items":["狮鹫角笛"]},{"skuId":"65a561f76b94940a30f2","name":"贝努鸟角笛","items":["贝努鸟角笛"]},{"skuId":"f55b85a185007f6a2e80","name":"初代胖陆行鸟笛","items":["初代胖陆行鸟笛"]},{"skuId":"1602243362796761088","name":"雪人铃铛","items":["雪人铃铛"]},{"skuId":"5dbec4d15d6a0ca1fbb5","name":"星芒熊角笛","items":["星芒熊角笛"]},{"skuId":"a42a105b690b738cd271","name":"大陆之眼音叉","items":["大陆之眼音叉"]},{"skuId":"3ffce150015d52ad1132","name":"魔女扫帚","items":["魔女扫帚"]},{"skuId":"6e156bdd46eac4029120","name":"夕兽魔笛","items":["夕兽魔笛"]},{"skuId":"f3f627f7e589fcc197f5","name":"彩蛋系统认证密钥","items":["彩蛋系统认证密钥"]},{"skuId":"be9d666019c72745af56","name":"飞天半心椅（左）","items":["飞天半心椅(左)"]},{"skuId":"fc32ac6f07a507e91594","name":"飞天半心椅（右）","items":["飞天半心椅(右)"]},{"skuId":"b15a25df456cc8c0cc23","name":"尼禄专用魔导装甲认证密钥","items":["尼禄专用魔导装甲认证密钥"]},{"skuId":"f6c158235ca34e2c1377","name":"莉维亚专用魔导装甲认证密钥","items":["莉维亚专用魔导装甲认证密钥"]},{"skuId":"3eba6d8c6ba71422f77e","name":"遗产鸟笛","items":["遗产鸟笛"]},{"skuId":"1547051319405752320","name":"演技教材·火焰之舞","items":["演技教材·火焰之舞"]},{"skuId":"c3aff28b8a3529de36d2","name":"演技教材·装死","items":["演技教材·装死"]},{"skuId":"4204cc5c089a7f289a70","name":"演技教材·战队演武全套","items":["演技教材·战队演武红一式","演技教材·战队演武黑二式","演技教材·战队演武黄三式"]},{"skuId":"ec4234042f70941edb23","name":"战队演武红一式","items":["演技教材·战队演武红一式"]},{"skuId":"d246366d13bf90ad1efb","name":"战队演武黑二式","items":["演技教材·战队演武黑二式"]},{"skuId":"b62eaface706010de226","name":"战队演武黄三式","items":["演技教材·战队演武黄三式"]},{"skuId":"a8214abc123e96a4451c","name":"演技教材·百万核爆","items":["演技教材·百万核爆"]},{"skuId":"deb4464c4110f1e63b34","name":"演技教材·东方传统舞蹈","items":["演技教材·东方传统舞蹈"]},{"skuId":"27ee9e98ebbcc3c0062a","name":"演技教材·幻想舞步","items":["演技教材·幻想舞步"]},{"skuId":"6d1a069e051ea0eb2a10","name":"演技教材·波波托步","items":["演技教材·波波托步"]},{"skuId":"aac35ff306c7474e40db","name":"演技教材·古菩步","items":["演技教材·古菩步"]},{"skuId":"adaa2470e5f749e136a3","name":"演技教材·趾踵步","items":["演技教材·趾踵步"]},{"skuId":"ca8bda0ecab58b64d051","name":"演技教材·侧步","items":["演技教材·侧步"]},{"skuId":"eadcf4082703936103cc","name":"演技教材·方形步","items":["演技教材·方形步"]},{"skuId":"91167ded6ce883c974c7","name":"演技教材·花雨","items":["演技教材·花雨"]},{"skuId":"1788068006198452224","name":"演技教材·小黄莺之舞","items":["演技教材·小黄莺之舞"]},{"skuId":"97a789e67dcc427d36c5","name":"演技教材·撒娇","items":["演技教材·撒娇"]},{"skuId":"caac93ed2ef80cbe2c50","name":"演技教材·表达爱意","items":["演技教材·表达爱意"]},{"skuId":"1526838851593211904","name":"演技教材·疑问","items":["演技教材·疑问"]},{"skuId":"091a7f498374d800d4f9","name":"演技教材·优雅仙人刺","items":["演技教材·优雅仙人刺"]},{"skuId":"1e22f00bc718cdd47d59","name":"演技教材·后空翻","items":["演技教材·后空翻"]},{"skuId":"92eca27889891a466209","name":"演技教材·抱拳礼","items":["演技教材·抱拳礼"]},{"skuId":"9563ef51377d1613709f","name":"演技教材·干杯","items":["演技教材·干杯"]},{"skuId":"96af1fa548137e3cc627","name":"演技教材·热身","items":["演技教材·热身"]},{"skuId":"9db05f4676a4e0542910","name":"演技教材·蓄力迸发","items":["演技教材·蓄力迸发"]},{"skuId":"bd99283b261f2c675ca3","name":"演技教材·嘿哟","items":["演技教材·嘿哟"]},{"skuId":"d248fce8afc94bc3f369","name":"演技教材·灵光一现","items":["演技教材·灵光一现"]},{"skuId":"d386b827efdada06f514","name":"演技教材·练武","items":["演技教材·练武"]},{"skuId":"e35ce02f87dbb5ff2c4c","name":"演技教材·打响指","items":["演技教材·打响指"]},{"skuId":"fc1930b4890ac5bf976a","name":"演技教材·撩水","items":["演技教材·撩水"]},{"skuId":"00f192754904f87559b8","name":"演技教材·火盆舞","items":["演技教材·火盆舞"]},{"skuId":"dc42d1dd2d22bbad28f0","name":"演技教材·胜利欢呼","items":["演技教材·胜利欢呼"]},{"skuId":"58675f5a134151bb0b93","name":"纯白套装","items":["纯白礼服","纯白短裙"]},{"skuId":"83e20739c35936fd0e77","name":"血盟魔女套装","items":["血盟魔女头饰","血盟魔女长袍","血盟魔女影爪","血盟魔女高筒靴"]},{"skuId":"47816fd4b1f79b404b55","name":"雅·修特拉新装","items":["血盟治疗师长袍","血盟治疗师紧身短裤","血盟治疗师高筒靴","发型样式:血盟治疗师"]},{"skuId":"69be7e4c5ed32e4acd1a","name":"逐夜者","items":["逐夜者"]},{"skuId":"2b00f8891dfeda4d9526","name":"血盟女士套装","items":["血盟女士套装","发型样式:拂晓盟主"]},{"skuId":"2b228e70c2e02a775a47","name":"桑克瑞德新装","items":["血盟双剑师外套","血盟双剑师护臂","血盟双剑师膝裤","血盟双剑师长靴","发型样式:血盟双剑师"]},{"skuId":"f6523eb2fc38c8fd11b7","name":"艾达套装","items":["漆黑的宽边帽","漆黑的礼服","漆黑的礼服手套","漆黑的长靴"]},{"skuId":"1499218137809874944","name":"漆黑的武器箱","items":["漆黑的武器箱"]},{"skuId":"1499217054693781504","name":"漆黑的虚无巨镰","items":["漆黑的虚无巨镰"]},{"skuId":"8397084604baa1989d5b","name":"漆黑的心灵巨镰","items":["漆黑的心灵巨镰"]},{"skuId":"bbc3e50c4d45b8e65cd1","name":"漆黑的死亡巨镰","items":["漆黑的死亡巨镰"]},{"skuId":"bde7f87c64bcd2218445","name":"漆黑的命运巨镰","items":["漆黑的命运巨镰"]},{"skuId":"e3318806879cbab89d8a","name":"漆黑的鲜血巨镰","items":["漆黑的鲜血巨镰"]},{"skuId":"fb67ed5d1a2f225d6d14","name":"漆黑的精魂巨镰","items":["漆黑的精魂巨镰"]},{"skuId":"e0ffe7338e3224f858d7","name":"威风凛凛套装","items":["威风凛凛礼服","威风凛凛腕带","威风凛凛礼鞋"]},{"skuId":"54f859b7ef62ac2aaf95","name":"萨雷安神童装","items":["萨雷安神童装"]},{"skuId":"62dd29c49ebc0f83cb09","name":"飞燕套装","items":["飞燕胴着","飞燕笼手","飞燕长裤","飞燕缠足"]},{"skuId":"8a7242aea6919c77db70","name":"破损的绅士套装","items":["破损的绅士单眼镜","破损的绅士短上衣","破损的绅士手套","破损的绅士打底裤","破损的绅士高跟鞋"]},{"skuId":"dbd36155f79ff87c49cf","name":"豪雪套装","items":["豪雪之斗笠","豪雪之胴着","豪雪之手甲","豪雪之筒袴","豪雪之木屐"]},{"skuId":"4b4e12c1c53d4a540b76","name":"总骑士长套装","items":["发型样式:总骑士长","总骑士长战甲","总骑士长手套"]},{"skuId":"063e574dcf9a7f0e052b","name":"苍穹骑士套装","items":["苍穹骑士铠甲","苍穹骑士手铠","苍穹骑士锁甲骑兵裤","苍穹骑士铠靴"]},{"skuId":"fb5e93dbfdf2eaba42c2","name":"苍穹法师套装","items":["苍穹法师长袍","苍穹法师礼服手套","苍穹法师软甲裤","苍穹法师铠靴"]},{"skuId":"43ca7d7b7f69f1fc3568","name":"绝孀","items":["绝孀"]},{"skuId":"de22218d43d152fe3031","name":"碎心","items":["碎心"]},{"skuId":"231052c9eb578d6aab7a","name":"苍穹骑士圣枪系列","items":["寒冬","龙祸","神益"]},{"skuId":"548d8c2b9716b03feca8","name":"苍穹骑士圣斧系列","items":["灰云","血腥安妮","溃逃"]},{"skuId":"674bbe0580f278c39978","name":"苍穹骑士圣杖系列","items":["奇思妙想","幽谷蠕虫"]},{"skuId":"fda20bb74710bdb5849f","name":"苍穹骑士圣剑系列","items":["光辉","终斩","苍穹骑士盾"]},{"skuId":"012ce1c4ce700cd7774f","name":"血盟解放者套装","items":["血盟解放者短衣","血盟解放者半指护手","血盟解放者热裤","血盟解放者铠靴","血盟解放者耳坠"]},{"skuId":"2809f79aa105bc8931e5","name":"血盟咒术套装","items":["血盟咒术师单眼镜","血盟咒术师长袍","血盟咒术师手铠","血盟咒术师束膝裤","血盟咒术师狩猎靴"]},{"skuId":"30da7de6e878d1c5666f","name":"血盟聆听者套装","items":["血盟聆听者兜帽","血盟聆听者长衣","血盟聆听者靴"]},{"skuId":"47e3a46fd02be80db9e1","name":"西德套装","items":["首席机械师护目镜","首席机械师套装"]},{"skuId":"4d1bea3a8b40927029f2","name":"血盟拳手套装","items":["血盟拳手面罩","血盟拳手套装"]},{"skuId":"75e608e1d8207888e9fe","name":"血盟幻术套装","items":["血盟幻术师厚袍","血盟幻术师长裤","血盟幻术师木鞋"]},{"skuId":"79def9c6a36f2234b43e","name":"血盟盗贼套装","items":["血盟盗贼束腰衣","血盟盗贼半指手套","血盟盗贼束膝裤","血盟盗贼战靴"]},{"skuId":"81ad8a5199f8f15f86b5","name":"血盟记录者套装","items":["血盟记录者僧袍","血盟记录者手箍","血盟记录者紧身裤","血盟记录者战靴"]},{"skuId":"c0bb8f3f4c8dd0ee37f8","name":"加隆德套装","items":["炼铁厂护目镜","炼铁厂工作服","炼铁厂手套","炼铁厂长裤","炼铁厂长靴"]},{"skuId":"089dd1f72ee6b3d3ab05","name":"莫古力娃娃","items":["莫古力娃娃"]},{"skuId":"64a4065418ddfccd69b4","name":"道士莫古力娃娃","items":["道士莫古力娃娃"]},{"skuId":"73d4dca07cb7af8dd284","name":"萌神乐团","items":["萌神乐团"]},{"skuId":"e3a3097b3a01f3cca24c","name":"邮差莫古力娃娃","items":["邮差莫古力娃娃"]},{"skuId":"73973563b1150318ff41","name":"迷你罗莎","items":["迷你罗莎"]},{"skuId":"61a414020d2b6551bde0","name":"迷你莉迪亚","items":["迷你莉迪亚"]},{"skuId":"f4a34378f070bfa76e3c","name":"迷你艾吉","items":["迷你艾吉"]},{"skuId":"eda8c603e5c05a15264d","name":"迷你露露","items":["迷你露露"]},{"skuId":"718cebdee80767a2389a","name":"迷你琉克","items":["迷你琉克"]},{"skuId":"f866af465042248cd096","name":"迷你蒂法","items":["迷你蒂法"]},{"skuId":"0abcd0b1a2ee9766e187","name":"迷你克劳德","items":["迷你克劳德"]},{"skuId":"1557308304042668032","name":"迷你阿尔博特","items":["迷你阿尔博特"]},{"skuId":"72e564d92372ae539f2a","name":"迷你第一世界雅·修特拉","items":["迷你第一世界雅·修特拉"]},{"skuId":"58cd4451adfea64e261b","name":"新型迷你雅·修特拉","items":["新型迷你雅·修特拉"]},{"skuId":"bb73217672a563b1604c","name":"迷你雅·修特拉","items":["迷你雅·修特拉"]},{"skuId":"3b314c394b0e408b2ff7","name":"复活小天使","items":["复活小天使"]},{"skuId":"48a3c18da0ac5f987262","name":"迷你尤娜","items":["迷你尤娜"]},{"skuId":"63b75df4f5caac02cbdc","name":"迷你爱丽丝","items":["迷你爱丽丝"]},{"skuId":"0804f3bafa0f73c8e898","name":"迷你塔塔露","items":["迷你塔塔露"]},{"skuId":"1d4368b5cf787067e0e0","name":"睡羊羊","items":["睡羊羊"]},{"skuId":"2be4271858f7ed1083e5","name":"迷你可露儿","items":["迷你可露儿"]},{"skuId":"38ec992a637e0702656a","name":"小丑预言蛋","items":["小丑预言蛋"]},{"skuId":"3a7832250b189d9d9590","name":"迷你夕雾","items":["迷你夕雾"]},{"skuId":"48a1a431f868ca5b9a13","name":"阴小幽","items":["阴小幽"]},{"skuId":"497c86ebc32b2e4838ab","name":"南瓜管家","items":["南瓜管家"]},{"skuId":"539f5170f2c2a1323b34","name":"喜鹊儿","items":["喜鹊儿"]},{"skuId":"5c579ffee28e7d33f21c","name":"橄榄宝石兽","items":["橄榄宝石兽"]},{"skuId":"88f5de461d14f274efed","name":"香托托人偶","items":["香托托人偶"]},{"skuId":"8ed2cd2340c3864df738","name":"迷你帕帕力莫","items":["迷你帕帕力莫"]},{"skuId":"96fcecc4b0c031e4f603","name":"迷你莉瑟","items":["迷你莉瑟"]},{"skuId":"9879655f4d84a66089c4","name":"迷你桑克瑞德","items":["迷你桑克瑞德"]},{"skuId":"9f334a281793eac99e48","name":"雪孩子","items":["雪孩子"]},{"skuId":"a211f63b334add27a799","name":"迷你其日娜","items":["迷你其日娜"]},{"skuId":"a622a2be6922c0d30f2f","name":"阳小灵","items":["阳小灵"]},{"skuId":"bf1e877d8c39b678db41","name":"金绿宝石兽","items":["金绿宝石兽"]},{"skuId":"c42d6702dc8004541b7a","name":"迷你敏菲利亚","items":["迷你敏菲利亚"]},{"skuId":"d3d6700581865929a0d2","name":"迷你豪雪","items":["迷你豪雪"]},{"skuId":"d7a835850b9e941ec950","name":"大陆小眼","items":["大陆小眼"]},{"skuId":"d97cd23b31d97b4c447e","name":"迷你于里昂热","items":["迷你于里昂热"]},{"skuId":"e44837df7449127a2009","name":"熊猫宝宝","items":["熊猫宝宝"]},{"skuId":"f54c06d4735234452929","name":"迷你阿莉塞","items":["迷你阿莉塞"]},{"skuId":"f5c0fa013d4088f29ff2","name":"迷你冰之巫女","items":["迷你冰之巫女"]},{"skuId":"f7e466d0bacf4001d25f","name":"迷你伊达","items":["迷你伊达"]},{"skuId":"4200611ab82b736b5a60","name":"恶魔装甲","items":["恶魔装甲"]},{"skuId":"935c2f1f7a9b9ec31eba","name":"天使装甲","items":["天使装甲"]},{"skuId":"27ca07fc0ff479cebb2a","name":"圣人装甲","items":["圣人装甲"]},{"skuId":"868591bf8907e4b8f35d","name":"特制星芒装甲","items":["特制星芒装甲"]},{"skuId":"3beb9e1fd40b56b2979d","name":"猎蛋人装甲","items":["猎蛋人装甲"]},{"skuId":"699df7c7e2e037149ac8","name":"管家装甲","items":["管家装甲"]},{"skuId":"8248616ec7544e021cb7","name":"哪吒装甲","items":["哪吒装甲"]},{"skuId":"cd31cd561d1c23dd2db9","name":"东方装甲","items":["东方装甲"]},{"skuId":"de21c958816e407c3676","name":"怪诞装甲","items":["怪诞装甲"]},{"skuId":"1632681209538179072","name":"管弦乐琴乐谱：红色夜阑（钢琴集）","items":["管弦乐琴乐谱:红色夜阑(钢琴集)"]},{"skuId":"1632681437725093888","name":"管弦乐琴乐谱：深宵之海（钢琴集）","items":["管弦乐琴乐谱:深宵之海(钢琴集)"]},{"skuId":"0865220f18044561d4d1","name":"管弦乐琴乐谱：脉动电音套装","items":["管弦乐琴乐谱:起义(脉动电音)","管弦乐琴乐谱:混沌的漩涡(脉动电音)","管弦乐琴乐谱:幽冥水底(脉动电音)","管弦乐琴乐谱:天使醒来(脉动电音)","管弦乐琴乐谱:千年旭光(脉动电音)"]},{"skuId":"4760bc0b4eb42686c528","name":"管弦乐琴乐谱：古裔今罪套装（乐团版）","items":["管弦乐琴乐谱:平衡(古裔今罪:乐团版)","管弦乐琴乐谱:天使醒来(古裔今罪:乐团版)","管弦乐琴乐谱:暗影使者(古裔今罪:乐团版)","管弦乐琴乐谱:耀眼浪苍(古裔今罪:乐团版)","管弦乐琴乐谱:贪欲(古裔今罪:乐团版)"]},{"skuId":"cb30d14c3d639ea64564","name":"管弦乐琴乐谱：古裔今罪套装（钢琴编曲）","items":["管弦乐琴乐谱:不灭孤念(古裔今罪:钢琴版)","管弦乐琴乐谱:明日与未来(古裔今罪:Amanda Achen演唱版)","管弦乐琴乐谱:忘却的此岸(古裔今罪:Amanda Achen演唱版)","管弦乐琴乐谱:天使醒来(古裔今罪:Amanda Achen演唱版)","管弦乐琴乐谱:一瞬千里(古裔今罪:钢琴版)"]},{"skuId":"1541683824398364672","name":"管弦乐琴乐谱：万世箴言（钢琴集）","items":["管弦乐琴乐谱:万世箴言(钢琴集)"]},{"skuId":"1541686401508765696","name":"管弦乐琴乐谱：英杰（钢琴集）","items":["管弦乐琴乐谱:英杰(钢琴集)"]},{"skuId":"1594937338662400000","name":"管弦乐琴乐谱：古伤（钢琴集）","items":["管弦乐琴乐谱:古伤(钢琴集)"]},{"skuId":"1594937720193069056","name":"管弦乐琴乐谱：异想天开（钢琴集）","items":["管弦乐琴乐谱:异想天开(钢琴集)"]},{"skuId":"1481218215789608960","name":"管弦乐琴乐谱：乘上西风（钢琴集）","items":["管弦乐琴乐谱:乘上西风(钢琴集)"]},{"skuId":"1481219423736578048","name":"管弦乐琴乐谱：沉静（钢琴集）","items":["管弦乐琴乐谱:沉静(钢琴集)"]},{"skuId":"1481219996804333568","name":"管弦乐琴乐谱：灼热之地（钢琴集）","items":["管弦乐琴乐谱:灼热之地(钢琴集)"]},{"skuId":"df91521431bafd8572f3","name":"管弦乐琴乐谱：华彩的山麓（钢琴集）","items":["管弦乐琴乐谱:华彩的山麓(钢琴集)"]},{"skuId":"eddab7c4dc7083a226ef","name":"管弦乐琴乐谱：夜雾缭绕（钢琴集）","items":["管弦乐琴乐谱:夜雾缭绕(钢琴集)"]},{"skuId":"34b98169dfd301ba6e05","name":"管弦乐琴乐谱：凶兆（钢琴集）","items":["管弦乐琴乐谱:凶兆(钢琴集)"]},{"skuId":"4925c9eb03e1add0d126","name":"管弦乐琴乐谱：伟大的母港（钢琴集）","items":["管弦乐琴乐谱:伟大的母港(钢琴集)"]},{"skuId":"59422b09f3159a44bc01","name":"管弦乐琴乐谱：希望之都（钢琴集）","items":["管弦乐琴乐谱:希望之都(钢琴集)"]},{"skuId":"721fac5e529330d5c1c8","name":"管弦乐琴乐谱：水车低鸣（钢琴集）","items":["管弦乐琴乐谱:水车低鸣(钢琴集)"]},{"skuId":"06ed842fb775580c5145","name":"管弦乐谱:灾厄蔓延(交)","items":["管弦乐琴乐谱:灾厄蔓延(交响乐版)"]},{"skuId":"0a926552da20ff36d176","name":"乐谱:复仇的怒嚎(交)","items":["管弦乐琴乐谱:复仇的怒嚎(交响乐版)"]},{"skuId":"0bc9432dfaef2694a1fe","name":"乐谱:忘却的彼岸(交)","items":["管弦乐琴乐谱:忘却的彼岸(交响乐版)"]},{"skuId":"21205323d937b3da6f41","name":"管弦乐琴乐谱:沉静(交)","items":["管弦乐琴乐谱:沉静(交响乐版)"]},{"skuId":"2ec06dbabc4b307f2b63","name":"管弦乐琴乐谱:凶兆(交)","items":["管弦乐琴乐谱:凶兆(交响乐版)"]},{"skuId":"30b16d1885069bcddfbe","name":"乐谱:白银凶鸟(交)","items":["管弦乐琴乐谱:白银凶鸟展翅翱翔(交响乐版)"]},{"skuId":"adc61aaf83b10026ee37","name":"管弦乐琴乐谱：陆行鸟星芒","items":["管弦乐琴乐谱:陆行鸟星芒"]},{"skuId":"7e7bfd9511522ae60644","name":"管弦乐琴乐谱：星芒之歌","items":["管弦乐琴乐谱:星芒之歌"]},{"skuId":"c09b5be792d0ec581960","name":"管弦乐谱：星芒之门","items":["管弦乐琴乐谱:星芒之门"]},{"skuId":"c61ccfe5fc45ffea1e38","name":"管弦乐琴乐谱:星芒节","items":["管弦乐琴乐谱:星芒节"]},{"skuId":"a030edd926716c3db39b","name":"管弦乐琴乐谱:彻夜狂欢","items":["管弦乐琴乐谱:彻夜狂欢"]},{"skuId":"cf6567aa7bc54c8c126a","name":"管弦乐琴乐谱:守护天节","items":["管弦乐琴乐谱:守护天节"]},{"skuId":"7b488e1d2c2f279f3838","name":"管弦乐琴乐谱：红莲节","items":["管弦乐琴乐谱:红莲节"]},{"skuId":"923da4fa1b5de27fafc6","name":"管弦乐谱：超级虹彩战队Z","items":["管弦乐琴乐谱:超级虹彩战队Z"]},{"skuId":"033f6d4c7ccadba2bd57","name":"管弦乐谱:-血雨狂潮-","items":["管弦乐琴乐谱:Stormblood -血雨狂潮-"]},{"skuId":"2bc23e20b3f82abc41f8","name":"管弦乐谱：飞向苍穹","items":["管弦乐琴乐谱:Heavensward -飞向苍穹-"]},{"skuId":"5a812aa9af8ecf9de58a","name":"管弦乐谱:生死答问-回响","items":["管弦乐琴乐谱:生死答问 - 回响"]},{"skuId":"67b4bcc37b5e288a36a4","name":"管弦乐琴乐谱：Revolutions　-变革之时-","items":["管弦乐琴乐谱:Revolutions -变革之时-"]},{"skuId":"f29c242d6d7b56e78948","name":"管弦乐琴乐谱:纯爱之吻","items":["管弦乐琴乐谱:纯爱之吻"]},{"skuId":"4bec167a41888d9853ba","name":"管弦乐琴乐谱：啪啪呀","items":["管弦乐琴乐谱:啪啪呀"]},{"skuId":"74fe9a2b018e73c18577","name":"管弦乐谱:塞壬的歌声","items":["管弦乐琴乐谱:塞壬的歌声"]},{"skuId":"d53525c32b1e7d548e30","name":"管弦乐琴乐谱：降神节","items":["管弦乐琴乐谱:降神节"]},{"skuId":"1547048731146891264","name":"夏炎套装","items":["夏炎草帽","夏炎上装","夏炎腕环","夏炎裹身裙","夏炎沙滩凉鞋"]},{"skuId":"978928e51954e0b8bd93","name":"红莲节足袋","items":["红莲节足袋"]},{"skuId":"90806f5195ebd7d44ac9","name":"红莲节黑染法被","items":["红莲节黑染法被"]},{"skuId":"10634a4ce7ee9b656653","name":"红莲节红染法被","items":["红莲节红染法被"]},{"skuId":"44e396466909d56ec9f3","name":"红莲节白染法被","items":["红莲节白染法被"]},{"skuId":"8d0d04f06e293a4583c4","name":"红莲节缠头带","items":["红莲节缠头带"]},{"skuId":"296567f1a2f5c8b88d5a","name":"涂漆鲶鱼精面具","items":["涂漆鲶鱼精面具"]},{"skuId":"fe3c55bbdb88e344f4ab","name":"黑漆莫古力面具","items":["黑漆莫古力面具"]},{"skuId":"f1ef921a04157de98e59","name":"白漆莫古力面具","items":["白漆莫古力面具"]},{"skuId":"8e6aa88764c8e5f9174b","name":"永夏套装","items":["永夏墨镜","永夏短衣","永夏短裤","永夏凉鞋"]},{"skuId":"9a9e7b1f8ded06272938","name":"红莲节套装","items":["红莲节上衣","红莲节小袴","红莲节草履"]},{"skuId":"bc578a4c34536ddbd37f","name":"传代战士套装","items":["传代战士战冠","传代战士铠甲","传代战士护臂","传代战士马裤","传代战士铠靴"]},{"skuId":"72a331d7fdd57dc2dae6","name":"南海女式夏裤","items":["南海女式夏裤"]},{"skuId":"b00eaad01a033769ae92","name":"条纹女式夏装","items":["条纹女式夏衣","条纹女式夏裤"]},{"skuId":"cb72749143cffb3b6d46","name":"南海女式连衣裙","items":["南海女式连衣裙"]},{"skuId":"da34d03b236d52f0b0bf","name":"南海女式条纹连衣裙","items":["南海女式条纹连衣裙"]},{"skuId":"0b12c27669dcbb320a87","name":"条纹男式夏装","items":["条纹男式夏衣","条纹男式夏裤"]},{"skuId":"850ad866095f6fe3fbb9","name":"南海男式条纹坎肩","items":["南海男式条纹坎肩"]},{"skuId":"d3033adaaa99c1b7c867","name":"南海男式短裤","items":["南海男式短裤"]},{"skuId":"d901604ab342e2d1c35f","name":"南海男式坎肩","items":["南海男式坎肩"]},{"skuId":"21244cf92ff1e4779254","name":"苍炎君子浴衣","items":["苍炎君子浴衣"]},{"skuId":"27c85ae78611f6715b45","name":"碧绿君子浴衣套装","items":["碧绿君子浴衣","粉白君子束裤","二齿木屐"]},{"skuId":"8d73e0cab0dacc85c35d","name":"墨黑君子浴衣套装","items":["墨黑君子浴衣","金黄君子束裤","二齿木屐"]},{"skuId":"b22fb4eb8ae63eeee349","name":"苍蝶淑女浴衣","items":["苍蝶淑女浴衣"]},{"skuId":"bc56ef846b226a70d664","name":"青蓝淑女浴衣套装","items":["青蓝淑女浴衣","粉白淑女束裤","舟形木屐"]},{"skuId":"c441b6fb567cf188c2af","name":"白炎君子浴衣","items":["白炎君子浴衣"]},{"skuId":"cf8d50d55fcebdd93b96","name":"丹红淑女浴衣套装","items":["丹红淑女浴衣","墨黑淑女束裤","舟形木屐"]},{"skuId":"dc9d7e05a496c3a0e277","name":"红蝶淑女浴衣","items":["红蝶淑女浴衣"]},{"skuId":"e03980e2d995b0aaed89","name":"桃蝶淑女浴衣","items":["桃蝶淑女浴衣"]},{"skuId":"e82da656df6b22c59a99","name":"黑炎君子浴衣","items":["黑炎君子浴衣"]},{"skuId":"e91a25f11e736438b1b8","name":"青蓝君子浴衣套装","items":["青蓝君子浴衣","墨黑君子束裤","二齿木屐"]},{"skuId":"f56dfbd844748a73dae3","name":"墨黑淑女浴衣套装","items":["墨黑淑女浴衣","金黄淑女束裤","舟形木屐"]},{"skuId":"b98a666cb36b9c1910ea","name":"银月男式夏装","items":["银月男式夏衣","银月男式夏裤"]},{"skuId":"f3302e2ff3b7d68dd253","name":"银月女式夏装","items":["银月女式夏衣","银月女式夏裤"]},{"skuId":"6eaf8451d3c9da7205d4","name":"夜暮男式夏装","items":["夜暮男式夏衣","夜暮男式夏裤"]},{"skuId":"b8dc19bbc4977b7aa4d1","name":"晨曦女式夏装","items":["晨曦女式夏衣","晨曦女式夏裤"]},{"skuId":"3a7b16b865a082a40c51","name":"蔚蓝女式夏装","items":["蔚蓝女式夏衣","蔚蓝女式夏裤"]},{"skuId":"5816b571b199bc5cb00c","name":"蔚蓝男式夏装","items":["蔚蓝男式夏衣","蔚蓝男式夏裤"]},{"skuId":"126568c2f2f432dd5011","name":"金阳女式夏装","items":["金阳女式夏衣","金阳女式夏裤"]},{"skuId":"8cf460da830f56ab9338","name":"金阳男式夏装","items":["金阳男式夏衣","金阳男式夏裤"]},{"skuId":"5b40bab64c87738661fb","name":"火红女式夏装","items":["火红女式夏衣","火红女式夏裤"]},{"skuId":"8255f6affa3c8e96a612","name":"火红男式夏装","items":["火红男式夏衣","火红男式夏裤"]},{"skuId":"0eaf4f696f5eecb2633a","name":"翠绿男式夏装","items":["翠绿男式夏衣","翠绿男式夏裤"]},{"skuId":"23b2134ad8edb6c42eab","name":"翠绿女式夏装","items":["翠绿女式夏衣","翠绿女式夏裤"]},{"skuId":"2f48529185e0ced33517","name":"圣府军套装-女","items":["圣府军外套","圣府军手套","圣府军短裙","圣府军长靴","发型样式:雷光&斯诺"]},{"skuId":"2fbc0581db0038939d33","name":"诺拉套装-男","items":["诺拉长袍","诺拉手套","诺拉长裤","诺拉短靴","发型样式:雷光&斯诺"]},{"skuId":"020bad7ebfb68d7ca8f8","name":"镶边杖","items":["镶边杖"]},{"skuId":"0e5da09ff216e9c63151","name":"莫古力手杖","items":["莫古力手杖"]},{"skuId":"1c371a6ad309c56f0ba6","name":"魔导翼书","items":["魔导翼书"]},{"skuId":"1f681391892e7d932d6b","name":"路希巨斧","items":["路希巨斧"]},{"skuId":"6020a0a33c460edb0534","name":"逐星者","items":["逐星者"]},{"skuId":"6fc0d2887db1cf88ca3c","name":"刃状长矛","items":["刃状长矛"]},{"skuId":"b16f0eb55cef8807e6b3","name":"织女星指虎","items":["织女星指虎"]},{"skuId":"f2bf01295b6c06347978","name":"怒火剑","items":["怒火剑"]},{"skuId":"2a45ba60f84fefb2278e","name":"君子套","items":["君子水干","君子木屐"]},{"skuId":"abeaca33dc7d34b6c34d","name":"淑女套","items":["淑女水干","淑女木屐"]},{"skuId":"1491363312476835840","name":"总管单眼镜","items":["总管单眼镜"]},{"skuId":"1491362433203916800","name":"皇家桃花头花","items":["皇家桃花头花"]},{"skuId":"116411b68451c30326ee","name":"桃香项环","items":["桃香项环"]},{"skuId":"271ba0dbfc062991fb9f","name":"花冠","items":["花冠"]},{"skuId":"b48d4ecd6941609074d9","name":"桃香","items":["桃香"]},{"skuId":"1491348904824492032","name":"玫瑰花恋人套（裤装版）","items":["玫瑰花恋人帽","玫瑰花恋人坎肩","玫瑰花恋人手套","玫瑰花恋人长裤","玫瑰花恋人皮鞋"]},{"skuId":"1491350926604849152","name":"相思树恋人套（裤装版）","items":["相思树恋人帽","相思树恋人坎肩","相思树恋人手套","相思树恋人长裤","相思树恋人皮鞋"]},{"skuId":"1491357150910042112","name":"勿忘草恋人套（裙装版）","items":["勿忘草恋人缎带帽","勿忘草恋人礼服","勿忘草恋人缎带手套","勿忘草恋人紧身裤","勿忘草恋人高跟鞋"]},{"skuId":"1491355694328926208","name":"玫瑰花恋人套（裙装版）","items":["玫瑰花恋人缎带帽","玫瑰花恋人礼服","玫瑰花恋人缎带手套","玫瑰花恋人紧身裤","玫瑰花恋人高跟鞋"]},{"skuId":"1491358336253906944","name":"相思树恋人套（裙装版）","items":["相思树恋人缎带帽","相思树恋人礼服","相思树恋人缎带手套","相思树恋人紧身裤","相思树恋人高跟鞋"]},{"skuId":"1621342049632124928","name":"莫古莫古恋心帽","items":["莫古莫古恋心帽"]},{"skuId":"1491350265427349504","name":"勿忘草恋人套（裤装版）","items":["勿忘草恋人帽","勿忘草恋人坎肩","勿忘草恋人手套","勿忘草恋人长裤","勿忘草恋人皮鞋"]},{"skuId":"6ef6b721871e92eada57","name":"红羽平顶帽","items":["红羽平顶帽"]},{"skuId":"2e09643d01aeecb3b9e0","name":"黑羽平顶帽","items":["黑羽平顶帽"]},{"skuId":"ad95d85c3f1eaeb63988","name":"基迦巨剑","items":["基迦巨剑"]},{"skuId":"5f0a65f2a2617b05864b","name":"冬贝利菜刀","items":["冬贝利菜刀"]},{"skuId":"ebf1f83f1e31ddfd8fc0","name":"面妆样式：守护天节","items":["面妆样式:守护天节"]},{"skuId":"52a5f4d9df029953f2c0","name":"吸血鬼坎肩","items":["吸血鬼坎肩"]},{"skuId":"9f9b5c5e8dffc07a3a26","name":"怪诞套装","items":["怪诞帽子","怪诞长袍","怪诞紧身裤","怪诞尖头靴"]},{"skuId":"cfee0f4a34f0d991a224","name":"哭泣幽灵套装","items":["哭泣幽灵套装"]},{"skuId":"ee1b02577e7ce6a367c7","name":"尖啸幽灵套装","items":["尖啸幽灵套装"]},{"skuId":"13631fd60ac22d7c1dff","name":"魔女套装","items":["魔女帽","魔女短上衣","魔女手套","魔女长靴"]},{"skuId":"10de907d27d4b9e035b0","name":"男性人狼套装","items":["人狼耳朵","人狼身体","人狼手臂","人狼臀部","人狼脚掌"]},{"skuId":"1219ec3aadc2fc4daaf5","name":"女性人狼套装","items":["人狼耳朵","人狼身体","人狼手臂","人狼臀部","人狼脚爪"]},{"skuId":"1d56686babfcdcb658ad","name":"白南瓜头","items":["白南瓜头"]},{"skuId":"4decc470160666129d93","name":"南瓜头","items":["南瓜头"]},{"skuId":"712d36a495830cb47310","name":"青嫩南瓜头","items":["青嫩南瓜头"]},{"skuId":"fba8cd8c435627cb87c3","name":"成熟南瓜头","items":["成熟南瓜头"]},{"skuId":"5b04beca8aa0991ecd55","name":"南瓜耳坠","items":["南瓜耳坠"]},{"skuId":"fe9cb27b95c1051d7a2a","name":"白金情人坠饰","items":["白金情人坠饰"]},{"skuId":"b70d940fae5530e52f7f","name":"白金情人耳坠","items":["白金情人耳坠"]},{"skuId":"b20353a373ccb5a330d0","name":"情人耳坠","items":["情人耳坠"]},{"skuId":"c7c2112a00a708337a9a","name":"永恋之羁绊","items":["永恋之羁绊"]},{"skuId":"915e0ccb39bc74ab1f3a","name":"情人坠饰","items":["情人坠饰"]},{"skuId":"a432300f320c42bd1160","name":"幻想药X3","items":["幻想药*3"]},{"skuId":"757bb1acf3b079e7183f","name":"曼德维尔耳环（复制品）","items":["曼德维尔耳环(复制品)"]},{"skuId":"c78d8e0a895d9c876a9e","name":"白鸦（复制品）","items":["白鸦(复制品)"]},{"skuId":"96b81cce568061055889","name":"唱诗班套装","items":["唱诗班礼帽","唱诗班长袍","唱诗班皮靴"]},{"skuId":"f558d6578004241c12ae","name":"美梦套装","items":["美梦帽","美梦装","美梦靴"]},{"skuId":"98e85c737f4690d8fa59","name":"2016驯鹿套装","items":["驯鹿茸角","驯鹿手套","驯鹿蹄靴"]},{"skuId":"daee31c1c82c6a1b796d","name":"星芒套装","items":["星芒圆锥帽","星芒装","飘雪紧身裤","飘雪高筒靴"]},{"skuId":"06634fe22069df84dbb9","name":"雪人套装","items":["雪人头","雪人服","雪人手套"]},{"skuId":"95478abc7b928ee1c89e","name":"驯鹿套装","items":["驯鹿角","驯鹿装"]},{"skuId":"0d527e640bd3ada51565","name":"星芒长袍","items":["星芒长袍"]},{"skuId":"aad919eeca62c4a50318","name":"圣人帽","items":["圣人帽"]},{"skuId":"02aa0df20fd3c03f5931","name":"圣人胡须","items":["圣人胡"]},{"skuId":"efa1cce747755374e357","name":"假胡子","items":["假胡子"]},{"skuId":"ae66571ee6bef86019db","name":"明月耳环","items":["明月耳环"]},{"skuId":"1638418796454244352","name":"小鸡套装","items":["小鸡头套","小鸡玩偶服"]},{"skuId":"1512356561551003648","name":"兔子礼服","items":["兔子礼服"]},{"skuId":"1512356107710533632","name":"兔子服","items":["兔子服"]},{"skuId":"1512355251820859392","name":"兔子头","items":["兔子头"]},{"skuId":"1e563565644af3247a50","name":"魔石精套装","items":["魔石精外套","魔石精打底裤","魔石精皮靴"]},{"skuId":"b0ba676e512871ed29b6","name":"质朴蛋壳帽","items":["质朴蛋壳帽"]},{"skuId":"c1359f5071b8548294d6","name":"质朴蛋戒指","items":["质朴蛋戒指"]},{"skuId":"ca01e29542dae2c838e1","name":"质朴蛋耳坠","items":["质朴蛋耳坠"]},{"skuId":"5548bfcff421cd460c84","name":"三色蛋壳帽","items":["三色蛋壳帽"]},{"skuId":"790c6236edcc12f5dd0c","name":"三色蛋戒指","items":["三色蛋戒指"]},{"skuId":"537cfc2061a4d1cb8ddc","name":"三色蛋耳坠","items":["三色蛋耳坠"]},{"skuId":"d3d7578c113001fb867f","name":"暗黑蛋壳帽","items":["暗黑蛋壳帽"]},{"skuId":"ad13579227f69119b50c","name":"暗黑蛋戒指","items":["暗黑蛋戒指"]},{"skuId":"8c8849a0912ebdc1826b","name":"暗黑蛋耳坠","items":["暗黑蛋耳坠"]},{"skuId":"d4b4a7b7133abbf04bc9","name":"陆行鸟蛋壳帽","items":["陆行鸟蛋壳帽"]},{"skuId":"6f74b76fe2d321d2e9cd","name":"陆行鸟蛋戒指","items":["陆行鸟蛋戒指"]},{"skuId":"a51d4de1a3b20f3bd056","name":"迷彩蛋壳帽","items":["迷彩蛋壳帽"]},{"skuId":"ba32af2703bbe1e684f3","name":"迷彩蛋戒指","items":["迷彩蛋戒指"]},{"skuId":"dcff3c9d4060e0e36354","name":"迷彩蛋耳坠","items":["迷彩蛋耳坠"]},{"skuId":"1612342697081352192","name":"银漆猛虎武士盔","items":["银漆猛虎武士盔"]},{"skuId":"1612340685115666432","name":"金漆猛虎武士盔","items":["金漆猛虎武士盔"]},{"skuId":"1481222170414301184","name":"黑漆壮牛武士盔","items":["黑漆壮牛武士盔"]},{"skuId":"1481221545853075456","name":"朱漆壮牛武士盔","items":["朱漆壮牛武士盔"]},{"skuId":"9130b77d7dd89e8d92b4","name":"黑漆忠犬武士盔","items":["黑漆忠犬武士盔"]},{"skuId":"b6140fb8293e64b8c84d","name":"白漆忠犬武士盔","items":["白漆忠犬武士盔"]},{"skuId":"3688b0bd8e1c14403ef3","name":"铁质银箔玉兔武士盔","items":["铁质银箔玉兔武士盔"]},{"skuId":"62b4c13f2f5ebf19a9e8","name":"铁质玉兔武士盔","items":["铁质玉兔武士盔"]},{"skuId":"be6652d588cb2ed78260","name":"铁质黑漆玉兔武士盔","items":["铁质黑漆玉兔武士盔"]},{"skuId":"264761ad99181feb9184","name":"勿言武士盔","items":["勿言武士盔"]},{"skuId":"78481a0cff64183b90d9","name":"勿视武士盔","items":["勿视武士盔"]},{"skuId":"b8d0c33a2c188513703d","name":"勿听武士盔","items":["勿听武士盔"]},{"skuId":"28525d6cb75908d3895a","name":"银箔灵蛇武士盔","items":["银箔灵蛇武士盔"]},{"skuId":"1750469314360868864","name":"黑漆奔马武士盔","items":["黑漆奔马武士盔"]},{"skuId":"21b9f5290d66d9da8e4e","name":"朱漆奔马武士盔","items":["朱漆奔马武士盔"]},{"skuId":"35009c25fae31c17cf86","name":"奔马武士盔","items":["奔马武士盔"]},{"skuId":"4918aa444633301d0297","name":"金箔奔马武士盔","items":["金箔奔马武士盔"]},{"skuId":"4ef116548888d4aaa8bd","name":"朱漆福鼠武士盔","items":["朱漆福鼠武士盔"]},{"skuId":"638f61eabe419ed4725a","name":"青漆福鼠武士盔","items":["青漆福鼠武士盔"]},{"skuId":"18964ff12d08f9e43737","name":"白漆吉羊武士盔","items":["白漆吉羊武士盔"]},{"skuId":"26570a7f5dd86b13096e","name":"吉羊武士盔","items":["吉羊武士盔"]},{"skuId":"63936853ff5e928150d1","name":"朱漆吉羊武士盔","items":["朱漆吉羊武士盔"]},{"skuId":"8b955141f64dfcc31f6e","name":"黑漆吉羊武士盔","items":["黑漆吉羊武士盔"]},{"skuId":"023bb5ad0ce5cbed811f","name":"朱漆金猪武士盔","items":["朱漆金猪武士盔"]},{"skuId":"d7f297e9ce033eaf90d3","name":"金猪武士盔","items":["金猪武士盔"]},{"skuId":"642b2b65ae2e4e8b3349","name":"黑漆天龙武士盔","items":["黑漆天龙武士盔"]},{"skuId":"9255ffa218f234b03189","name":"金箔天龙武士盔","items":["金箔天龙武士盔"]},{"skuId":"c857458b58e4dcf230f8","name":"天龙武士盔","items":["天龙武士盔"]},{"skuId":"f2d387e5e3e346e05564","name":"朱漆天龙武士盔","items":["朱漆天龙武士盔"]},{"skuId":"5b8258987628f7443180","name":"朱漆雄鸡武士盔","items":["朱漆雄鸡武士盔"]},{"skuId":"bd2ed916f394ae58ca64","name":"黑漆雄鸡武士盔","items":["黑漆雄鸡武士盔"]},{"skuId":"efc52571e303d7cf46cc","name":"幻想药X5","items":["幻想药*5"]},{"skuId":"7f00b2754d5dca3fa290","name":"复制原画《拂晓血盟》","items":["复制原画《拂晓血盟》"]},{"skuId":"2969e3b96c874f7837b7","name":"复制原画《龙诗群像》","items":["复制原画《龙诗群像》"]},{"skuId":"e929f1f07f999e26f876","name":"复制原画《红莲群像》","items":["复制原画《红莲群像》"]},{"skuId":"45ef1039989898eb1be2","name":"复制原画《暗影群像》","items":["复制原画《暗影群像》"]},{"skuId":"e2df88f64fb807c9af8e","name":"特制红莲群像海报","items":["特制红莲群像海报"]},{"skuId":"c4423cddf0654d959924","name":"巴哈姆特模型","items":["巴哈姆特模型"]},{"skuId":"54bbb111ab96e84040f2","name":"阿尔法高级玩偶","items":["阿尔法高级玩偶"]},{"skuId":"1621342507377491968","name":"特制毛绒绒库普卡·叩普","items":["特制毛绒绒库普卡·叩普"]},{"skuId":"0bab914bf990ec29c0c7","name":"莫古力管弦乐琴","items":["莫古力管弦乐琴"]},{"skuId":"79682839eefec519f7d8","name":"高级毛绒绒莫古力","items":["高级毛绒绒莫古力"]},{"skuId":"0814d1c958c5a370def1","name":"巧儿陆行鸟大台灯","items":["巧儿陆行鸟大台灯"]},{"skuId":"3ca9fe81c00bed2e1a56","name":"胖陆行鸟台钟","items":["胖陆行鸟台钟"]},{"skuId":"02cd3babcf562690f517","name":"黄宝石兽台灯","items":["黄宝石兽台灯"]},{"skuId":"9d91d903bc1d3c4b026f","name":"红宝石兽台灯","items":["红宝石兽台灯"]},{"skuId":"e2b8c7704be4fc522483","name":"绿宝石兽台灯","items":["绿宝石兽台灯"]},{"skuId":"1612343742977191936","name":"特制东方白虎屏风","items":["特制东方白虎屏风"]},{"skuId":"a2e7ef71e2a9c5aea1fd","name":"5个特制恋人节特制龙虾大餐","items":["特制恋人节特制龙虾大餐"]},{"skuId":"bca5a01d0304261e0230","name":"5个特制恋人节特制蛋糕组合","items":["特制恋人节特制蛋糕组合"]},{"skuId":"1491359951773978624","name":"5个特制巧克力喷泉","items":["特制巧克力喷泉"]},{"skuId":"b3f7de51e76a640bae37","name":"5个特制星芒蛋糕卷","items":["特制星芒蛋糕卷"]},{"skuId":"df0b5da06e6c2dd7ecce","name":"5个特制星芒节甜甜圈组合","items":["特制星芒节甜甜圈组合"]},{"skuId":"9ca617b3467ebcb40c65","name":"5个特制星芒树桩蛋糕组合","items":["特制星芒树桩蛋糕组合"]},{"skuId":"218b02690317fa64cdc2","name":"5个特制星芒炖牛肉组合","items":["特制星芒炖牛肉组合"]},{"skuId":"18f18a1b601a74dc27b5","name":"5个特制东方橘篮","items":["特制东方橘篮"]},{"skuId":"54b79a0c0d3c89eba1ef","name":"5个特制南瓜布丁组合","items":["特制南瓜布丁组合"]},{"skuId":"9b2e72bf1c43b4ad3358","name":"5个特制南瓜派组合","items":["特制南瓜派组合"]},{"skuId":"459027ce06948fe6c547","name":"5个特制庆典用的手鞠寿司","items":["特制庆典用的手鞠寿司"]},{"skuId":"570b9f5cb63f177f6b57","name":"5个特制彩蛋特制巧克力蛋糕","items":["特制彩蛋特制巧克力蛋糕"]},{"skuId":"5d18bb8bd8bce260a697","name":"5个特制庆典用的散寿司","items":["特制庆典用的散寿司"]},{"skuId":"6687177afc4035552844","name":"5个特制咖喱饭","items":["特制咖喱饭"]},{"skuId":"7d870b01947ce48fbd4e","name":"5个特制彩蛋特制皇冠羊排","items":["特制彩蛋特制皇冠羊排"]},{"skuId":"af15f531eb6bab48ef3e","name":"5个特制南瓜蛋糕组合","items":["特制南瓜蛋糕组合"]},{"skuId":"2032291015677886464","name":"特制女儿节海报2017","items":["特制女儿节海报2017"]},{"skuId":"2032037214194679808","name":"特制红莲节海报2019","items":["特制红莲节海报2019"]},{"skuId":"2032035272445837312","name":"特制红莲节海报2015","items":["特制红莲节海报2015"]},{"skuId":"2032034384616538112","name":"特制恋人节海报2015","items":["特制恋人节海报2015"]},{"skuId":"5b61742df9049cd95746","name":"特制情人装饰花瓶","items":["特制情人装饰花瓶"]},{"skuId":"348e65f407f16f99d87c","name":"特制恋心床","items":["特制恋心床"]},{"skuId":"5ecf86e0aa4296bdeaae","name":"特制半心椅（左）","items":["特制半心椅(左)"]},{"skuId":"a97b838a3471fc1df040","name":"特制半心椅（右）","items":["特制半心椅(右)"]},{"skuId":"1557307821836120064","name":"新生庆典的特制玻璃画","items":["新生庆典的特制玻璃画"]},{"skuId":"1547050121487364096","name":"卖水球的特制摊位","items":["卖水球的特制摊位"]},{"skuId":"7bb1796d1ade0f5e35a0","name":"特制恋人节气球","items":["特制恋人节气球"]},{"skuId":"1491364620046913536","name":"女儿节特制吊旗","items":["女儿节特制吊旗"]},{"skuId":"1491363956893896704","name":"特制东方舞台","items":["特制东方舞台"]},{"skuId":"1481220353857044480","name":"特制纸制红牛","items":["特制纸制红牛"]},{"skuId":"7517b3b44b35b6a3a8bf","name":"空的特制星芒礼盒","items":["空的特制星芒礼盒"]},{"skuId":"b2ce9b9cc1b8951c1551","name":"卖风铃的特制摊位","items":["卖风铃的特制摊位"]},{"skuId":"34b614f874576a60910f","name":"特制携带型泳池","items":["特制携带型泳池"]},{"skuId":"05252546fb1cad343d3a","name":"艾德薇雅人偶","items":["艾德薇雅人偶"]},{"skuId":"0548e7dc2ce048770200","name":"特制镜饼","items":["特制镜饼"]},{"skuId":"0c2490192ffb63979d7c","name":"特制毛绒绒梦魔","items":["特制毛绒绒梦魔"]},{"skuId":"0fa4ea231b1dea97d274","name":"特制莫古力蚊香罐","items":["特制莫古力蚊香罐"]},{"skuId":"2dfeeabea49edd2bd609","name":"特制彩蛋狩猎锦旗","items":["特制彩蛋狩猎锦旗"]},{"skuId":"4585a169814a23aafa9f","name":"特制仙人刺先生奖杯","items":["特制仙人刺先生奖杯"]},{"skuId":"4e68e7011fc707d6bdea","name":"特制东方樱花树","items":["特制东方樱花树"]},{"skuId":"51226d03feb8b7afba04","name":"特制索恩王朝展示台","items":["特制索恩王朝展示台"]},{"skuId":"6c641f6f0f40a5842141","name":"特制堆起来的彩蛋","items":["特制堆起来的彩蛋"]},{"skuId":"74a5b65ad626c699c4a6","name":"特制夫妻羊羊","items":["特制夫妻羊羊"]},{"skuId":"7680c15cd4e5fd67e77b","name":"特制东方风铃","items":["特制东方风铃"]},{"skuId":"861a8ba5033e985a7dbc","name":"特制陆行鸟不倒翁","items":["特制陆行鸟不倒翁"]},{"skuId":"a841dc3c05eb91704597","name":"特制小猪门松","items":["特制小猪门松"]},{"skuId":"bee3ba7397cdd80da465","name":"降神节的特制米袋组合","items":["降神节的特制米袋组合"]},{"skuId":"c5425df8024037f46668","name":"特制猴面达摩","items":["特制猴面达摩"]},{"skuId":"c629e6f951177eb6af53","name":"特制女儿节衣柜","items":["特制女儿节衣柜"]},{"skuId":"d3d488f8811438f021bd","name":"特制猫咪脚印","items":["特制猫咪脚印"]},{"skuId":"e8374db2e8c9143ca3e6","name":"特制彩蛋落地灯","items":["特制彩蛋落地灯"]},{"skuId":"fffe0eb67af1d4e1395d","name":"特制七彩刨冰","items":["特制七彩刨冰"]},{"skuId":"16e438fb1ea2674d8925","name":"特制新生气球","items":["特制新生气球"]},{"skuId":"e90957412a94914629db","name":"特制新生锦旗","items":["特制新生锦旗"]},{"skuId":"2032037874730450944","name":"特制星芒节海报2019","items":["特制星芒节海报2019"]},{"skuId":"2032035951407185920","name":"特制星芒节海报2015","items":["特制星芒节海报2015"]},{"skuId":"1512357761973391360","name":"特制彩蛋狩猎海报2019","items":["特制彩蛋狩猎海报2019"]},{"skuId":"1638440059956523008","name":"5个特制彩蛋狩猎小茶点","items":["特制彩蛋狩猎小茶点"]},{"skuId":"1638439394559553536","name":"特制预言蛋肩包","items":["特制预言蛋肩包"]},{"skuId":"1602241130181324800","name":"特制魔力寒冰隔离墙","items":["特制魔力寒冰隔离墙"]},{"skuId":"1602240684704296960","name":"特制白雪覆盖的树","items":["特制白雪覆盖的树"]},{"skuId":"1602242642701873152","name":"特制魔力寒冰夹层楼板","items":["特制魔力寒冰夹层楼板"]},{"skuId":"1512357318316691456","name":"特制兔子玩偶","items":["特制兔子玩偶"]},{"skuId":"4515473b534d099c363b","name":"特制星芒古菩花环","items":["特制星芒古菩花环"]},{"skuId":"4081d65997b0045906ab","name":"特制空的礼物箱","items":["特制空的礼物箱"]},{"skuId":"f2c6137f85c3710f1561","name":"特制星芒节雪人","items":["特制星芒节雪人"]},{"skuId":"9dd856b9804b8b6cd634","name":"特制星芒节的海报","items":["特制星芒节的海报"]},{"skuId":"49a1105f212186f8e001","name":"特制小型星芒树","items":["特制小型星芒树"]},{"skuId":"03cafb09190d7675d6bd","name":"特制双星挂饰","items":["特制双星挂饰"]},{"skuId":"a0e67f4cb223b63eb75e","name":"特制星芒挂饰","items":["特制星芒挂饰"]},{"skuId":"f832ee68facf52079993","name":"特制星芒节花环","items":["特制星芒节花环"]},{"skuId":"8d75cb92490c66aec62c","name":"特制星芒节小卢恩人","items":["特制星芒节小卢恩人"]},{"skuId":"2032036632859951104","name":"特制守护天节海报2016","items":["特制守护天节海报2016"]},{"skuId":"2032025632559513600","name":"特制守护天节海报2014","items":["特制守护天节海报2014"]},{"skuId":"81d0ef69884d9f35f640","name":"特制人偶娃娃","items":["特制人偶娃娃"]},{"skuId":"55c5e724e85828b0f903","name":"特制南瓜马车","items":["特制南瓜马车"]},{"skuId":"1506d221044650d579d3","name":"特制南瓜旗帜","items":["特制南瓜旗帜"]},{"skuId":"2a7fce8e9ae53d208b24","name":"特制南瓜烛台","items":["特制南瓜烛台"]},{"skuId":"2e9fe1509ede0395c95a","name":"特制南瓜篮","items":["特制南瓜篮"]},{"skuId":"6dcb3a20897d0cf70dc0","name":"特制南瓜桌台","items":["特制南瓜桌台"]},{"skuId":"7366759436983eddc7b4","name":"特制南瓜炖菜","items":["特制南瓜炖菜"]},{"skuId":"8200ea192b20e1211808","name":"特制幽灵烛台","items":["特制幽灵烛台"]},{"skuId":"a2ad0768fd45c7946bfd","name":"特制南瓜座椅","items":["特制南瓜座椅"]},{"skuId":"d8885d8e7d6a7af7171a","name":"特制南瓜塔","items":["特制南瓜塔"]},{"skuId":"82213dfe1be182cdaad7","name":"特制轰击怪灯笼","items":["特制轰击怪灯笼"]},{"skuId":"f33dec85d4ec7247fc22","name":"特制守护天内墙","items":["特制守护天内墙"]},{"skuId":"89e614a73b85f9ae0570","name":"特制星芒内墙","items":["特制星芒内墙"]},{"skuId":"83dc0e5c684c3fda66a1","name":"特制预言蛋内墙","items":["特制预言蛋内墙"]},{"skuId":"cb92cb4057c67649cdf9","name":"金箔笠松内墙","items":["金箔笠松内墙"]},{"skuId":"4b73521dea5099a7fcc5","name":"金箔笠松内墙*3","items":["金箔笠松内墙"]},{"skuId":"ed6375741e2c0702785b","name":"金织内墙","items":["金织内墙"]},{"skuId":"29a4b3b401bde5dc8864","name":"金织内墙*3","items":["金织内墙"]},{"skuId":"eafe75204bbb6220c21f","name":"贴金地板","items":["贴金地板"]},{"skuId":"23ef92afd578f24442c7","name":"贴金地板*3","items":["贴金地板"]},{"skuId":"2bec49e65052a26fbfd7","name":"贴金内墙","items":["贴金内墙"]},{"skuId":"722a362b1ad88cd0d57c","name":"贴金内墙*3","items":["贴金内墙"]},{"skuId":"9b12026b6d9e68d2f8ff","name":"特制门松","items":["特制门松"]},{"skuId":"4248049ab5cb6900d283","name":"特制西瓜水盆","items":["特制西瓜水盆"]},{"skuId":"b80c37a89a8ca55bcc0a","name":"特制鲜红纤维毯","items":["特制鲜红纤维毯"]},{"skuId":"731cbde2a63d6f54e179","name":"特制激情之火","items":["特制激情之火"]},{"skuId":"5c0f9ecc14a87ba70b51","name":"特制东方的许愿竹","items":["特制东方的许愿竹"]},{"skuId":"7025c4aac070d6f281c8","name":"特制东方落樱","items":["特制东方落樱"]},{"skuId":"2ac5f98d43922bab707e","name":"特制红莲灯笼","items":["特制红莲灯笼"]},{"skuId":"a5716e4a32dd3a15ab8a","name":"特制玫瑰花手推车","items":["特制玫瑰花手推车"]},{"skuId":"ec3e5d0e21355692e120","name":"特制新生立柱","items":["特制新生立柱"]},{"skuId":"3f6347649cfdf076be05","name":"空的特制星芒礼箱","items":["空的特制星芒礼箱"]},{"skuId":"c56338893a695eedd9de","name":"特制纯白星芒树","items":["特制纯白星芒树"]},{"skuId":"89825044b2eeac214608","name":"特制明星星芒树","items":["特制明星星芒树"]},{"skuId":"89649f0193b72cbc5996","name":"特制弯月星芒树","items":["特制弯月星芒树"]},{"skuId":"91179ab168c000e40968","name":"特制星芒树","items":["特制星芒树"]},{"skuId":"d581fd80788e1d6de62d","name":"特制星芒柱","items":["特制星芒柱"]},{"skuId":"239e30afe74f0b73e43c","name":"特制旭日星芒树","items":["特制旭日星芒树"]},{"skuId":"7eb78fa6b8255960fcf5","name":"特制雪堆","items":["特制雪堆"]},{"skuId":"405291e6cbab0073dbec","name":"特制雪人","items":["特制雪人"]},{"skuId":"421312d5ec0977bb653c","name":"特制萤笼","items":["特制萤笼"]},{"skuId":"bd9b7379127418292618","name":"特制预言蛋巨塔","items":["特制预言蛋巨塔"]},{"skuId":"cdff5553ab250903ad2c","name":"特制无瑕白染剂","items":["特制无瑕白染剂"]},{"skuId":"77227791c1493bac150e","name":"10瓶特制无瑕白染剂","items":["特制无瑕白染剂"]},{"skuId":"af21234601236ca97545","name":"特制煤玉黑染剂","items":["特制煤玉黑染剂"]},{"skuId":"a96dc131e8c6141004cf","name":"10瓶特制煤玉黑染剂","items":["特制煤玉黑染剂"]},{"skuId":"2de273d73fc4be017c8b","name":"特制柔彩粉染剂","items":["特制柔彩粉染剂"]},{"skuId":"dec68734a5532ec39627","name":"10瓶特制柔彩粉染剂","items":["特制柔彩粉染剂"]},{"skuId":"c58915bfb6b1eb9b7a18","name":"特制闪耀银染剂","items":["特制闪耀银染剂"]},{"skuId":"4a59d6c6e7d3a3d440a0","name":"10瓶特制闪耀银染剂","items":["特制闪耀银染剂"]},{"skuId":"561ebe12ac6aa39d7739","name":"特制闪耀金染剂","items":["特制闪耀金染剂"]},{"skuId":"badf5e273264e0c4b145","name":"10瓶特制闪耀金染剂","items":["特制闪耀金染剂"]},{"skuId":"b5619b74231a2f3d921d","name":"特制柔彩紫染剂","items":["特制柔彩紫染剂"]},{"skuId":"04de079051633527eabc","name":"10瓶特制柔彩紫染剂","items":["特制柔彩紫染剂"]},{"skuId":"71ceadaee283cd53b1dd","name":"特制柔彩蓝染剂","items":["特制柔彩蓝染剂"]},{"skuId":"600196b45aeeb583c2e1","name":"10瓶特制柔彩蓝染剂","items":["特制柔彩蓝染剂"]},{"skuId":"34a173ed37a6f7a5449d","name":"特制柔彩绿染剂","items":["特制柔彩绿染剂"]},{"skuId":"f4509c54c89ac412c80b","name":"10瓶特制柔彩绿染剂","items":["特制柔彩绿染剂"]},{"skuId":"e9af345045bc34913fec","name":"特制金属紫染剂","items":["特制金属紫染剂"]},{"skuId":"dd3719e87c360d06ded6","name":"10瓶特制金属紫染剂","items":["特制金属紫染剂"]},{"skuId":"beb205063dec4310f3b2","name":"特制金属绿染剂","items":["特制金属绿染剂"]},{"skuId":"8c9584866bc7c223ed5c","name":"10瓶特制金属绿染剂","items":["特制金属绿染剂"]},{"skuId":"d30195a54259a13081d5","name":"特制金属蓝染剂","items":["特制金属蓝染剂"]},{"skuId":"9c472f2cf48de67de420","name":"10瓶特制金属蓝染剂","items":["特制金属蓝染剂"]},{"skuId":"ad51c97372e3df3b195a","name":"特制金属黄染剂","items":["特制金属黄染剂"]},{"skuId":"45b27052d0b46cebd4cb","name":"10瓶特制金属黄染剂","items":["特制金属黄染剂"]},{"skuId":"2455b1920b53b8f3dcf1","name":"特制金属红染剂","items":["特制金属红染剂"]},{"skuId":"28d2b01856ef9b714a19","name":"10瓶特制金属红染剂","items":["特制金属红染剂"]},{"skuId":"a6f0200620800818270d","name":"特制金属靛染剂","items":["特制金属靛染剂"]},{"skuId":"6985032a0036491151a9","name":"10瓶特制金属靛染剂","items":["特制金属靛染剂"]},{"skuId":"958b631172da8bd0c76a","name":"特制金属橙染剂","items":["特制金属橙染剂"]},{"skuId":"d86fbd16d1fb41952b53","name":"10瓶特制金属橙染剂","items":["特制金属橙染剂"]},{"skuId":"f5e0bbf26efaea3a869c","name":"特制黑暗棕染剂","items":["特制黑暗棕染剂"]},{"skuId":"efefeb2225d7db3de0eb","name":"10瓶特制黑暗棕染剂","items":["特制黑暗棕染剂"]},{"skuId":"1f38404f20897b746f60","name":"特制黑暗紫染剂","items":["特制黑暗紫染剂"]},{"skuId":"5a5cd5912d674ec0aad2","name":"10瓶特制黑暗紫染剂","items":["特制黑暗紫染剂"]},{"skuId":"756195521fae432e066d","name":"特制黑暗绿染剂","items":["特制黑暗绿染剂"]},{"skuId":"97208419de574250c794","name":"10瓶特制黑暗绿染剂","items":["特制黑暗绿染剂"]},{"skuId":"a386ff98361a12dc8dc6","name":"特制黑暗蓝染剂","items":["特制黑暗蓝染剂"]},{"skuId":"eac63fc28199c5272510","name":"10瓶特制黑暗蓝染剂","items":["特制黑暗蓝染剂"]},{"skuId":"2a271dfdd3e688d540a6","name":"特制黑暗红染剂","items":["特制黑暗红染剂"]},{"skuId":"3d741da0f00d2bc742eb","name":"10瓶特制黑暗红染剂","items":["特制黑暗红染剂"]},{"skuId":"178bd3784c4407916042","name":"窜地鼠","items":["窜地鼠"]}]};
    const KEY = 'omni-shop-owned-v1';
    const CATALOG_KEY = 'omni-shop-catalog-v1';
    const ENABLED_KEY = 'omni-shop-enabled-v1';
    const FILTER_KEY = 'omni-shop-filter-v1';
    function registerCollectionMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        const active = FF14Enhancements.get(ENABLED_KEY, true) !== false;
        GM_registerMenuCommand(active ? '关闭商城道具收录' : '开启商城道具收录', () => {
            FF14Enhancements.set(ENABLED_KEY, !active);
        }, {id:'ff14-shop-owned-toggle', autoClose:true});
    }
    registerCollectionMenu();
    document.addEventListener('ff14-enhancements-change', registerCollectionMenu);
    const EXCLUDED_CATEGORIES = new Set(['2', '5', '6']);
    const bundledProducts = new Map();
    function cleanName(text) {
        let value = String(text || '').normalize('NFKC').trim();
        const pairs = [['"','"'], ["'","'"], ['“','”'], ['‘','’'], ['「','」'], ['『','』']];
        while (value.length > 1 && pairs.some(([a,b]) => value.startsWith(a) && value.endsWith(b)))
            value = value.slice(1, -1).trim();
        return value;
    }
    const normalize = text => cleanName(text)
        .replace(/[\s·・：:，,]/g, '').toLocaleLowerCase('zh-CN');
    for (const p of BUNDLED.products) bundledProducts.set(normalize(p.name), p);

    function resolveItems(name, parsed) {
        const known = bundledProducts.get(normalize(name))?.items;
        // Image-only descriptions and old saved catalogues fall back to the shop product name.
        return known?.length && parsed.length === 1 && normalize(parsed[0]) === normalize(name)
            ? known : parsed;
    }

    // A script update carries a newer catalog; stale local downloads must not hide new products.
    function selectCatalog(stored) {
        return Array.isArray(stored?.products) &&
            Date.parse(stored.updatedAt) > Date.parse(BUNDLED.updatedAt) ? stored : BUNDLED;
    }

    function shouldShow(mode, result, enabled = true) {
        if (!enabled || mode === 'all') return true;
        return mode === 'owned' ? !!result?.full : !result?.full;
    }

    function validateExport(value) {
        if (!value || value.format !== 'omni-shop-owned' || value.schemaVersion !== 1 || value.language !== 'chs')
            throw new Error('请选择本模块导出的中文 OmniShopOwned.json（版本 1）。原始 InventoryCache.json 不能直接导入。');
        if (!Array.isArray(value.characters) || value.characters.length === 0 || value.characters.length > 200)
            throw new Error('角色列表为空或过大。');
        const ids = new Set();
        for (const c of value.characters) {
            if (!c || typeof c.id !== 'string' || !/^\d{1,20}$/.test(c.id) || ids.has(c.id) ||
                typeof c.name !== 'string' || c.name.length > 100 || !Array.isArray(c.items) || c.items.length > 100000)
                throw new Error('角色数据无效；角色 ID 必须是字符串，不能是可能失去精度的数字。');
            ids.add(c.id);
            if (c.housingItems !== undefined && (!Array.isArray(c.housingItems) || c.housingItems.length > 100000))
                throw new Error('房屋仓库记录无效。');
            for (const item of [...c.items, ...(c.housingItems || [])]) {
                if (!item || !Number.isInteger(item.itemId) || item.itemId <= 0 || item.itemId >= 1000000 ||
                    typeof item.name !== 'string' || item.name.length > 300 || typeof item.unlocked !== 'boolean' ||
                    !Number.isSafeInteger(item.quantity) || item.quantity < 0)
                    throw new Error('物品记录无效。');
            }
        }
        return value;
    }

    function makeOwned(character) {
        const result = new Map();
        for (const [items, housing] of [[character?.items || [], false], [character?.housingItems || [], true]])
        for (const item of items) {
            if (!item.unlocked && item.quantity <= 0) continue;
            const key = normalize(item.name);
            if (!key) continue;
            const previous = result.get(key) || { ...item, quantity: 0, housingQuantity: 0, unlocked: false };
            previous.unlocked ||= item.unlocked;
            if (housing) previous.housingQuantity += item.quantity;
            else previous.quantity += item.quantity;
            if (item.category === 'housing' || housing) previous.category = 'housing';
            result.set(key, previous);
        }
        return result;
    }

    function classify(requirements, owned) {
        const names = [...new Set((requirements || []).map(cleanName).filter(Boolean))];
        if (!names.length) return null;
        const have = names.filter(name => owned.has(normalize(name)));
        if (!have.length) return null;
        const record = names.length === 1 ? owned.get(normalize(names[0])) : null;
        return { full: have.length === names.length, count: have.length, total: names.length, names, have,
            furniture: record?.category === 'housing', quantity: record?.quantity || 0,
            housingQuantity: record?.housingQuantity || 0 };
    }

    function badgeText(result) {
        if (!result.full) return `部分已获取 ${result.count}/${result.total}`;
        if (!result.furniture) return '✓ 已获取';
        const counts = [];
        if (result.quantity) counts.push(`拥有 ×${result.quantity}`);
        if (result.housingQuantity) counts.push(`房库 ×${result.housingQuantity}`);
        return `✓ ${counts.join(' · ')}`;
    }

    function extractItems(content, fallbackName = '') {
        // Parse HTML into inert text, never inject publisher HTML into the page.
        const inert = new DOMParser().parseFromString(content || '', 'text/html');
        for (const node of inert.querySelectorAll('script,style,iframe')) node.remove();
        for (const node of inert.querySelectorAll('br')) node.replaceWith('\n');
        for (const node of inert.querySelectorAll('p,li,tr,div,h1,h2,h3')) node.append('\n');
        return parseItemText(inert.body.textContent || '', fallbackName);
    }

    function parseItemText(text, fallbackName = '') {
        const marker = /购买后(?:将)?(?:可)?(?:在[^\n]{0,40})?获得[：:]?/;
        const section = text.match(marker);
        if (section) {
            const lines = text.slice(section.index + section[0].length).split(/\n/);
            const names = [];
            for (const line of lines) {
                const match = line.trim().match(/^(.+?)\s*[/／×x*]\s*\d+\s*(?:个|件|份|张)?\s*$/i);
                if (match) names.push(cleanName(match[1]));
            }
            if (names.length) return [...new Set(names)];
        }
        // Exact single-item name is safe; no substring or guessed set expansion.
        return fallbackName ? [fallbackName] : [];
    }

    let data = null;
    let characterId = '';
    let owned = new Map();
    let catalog = BUNDLED;
    let timer;
    let refreshing = false;
    let filterMode = 'all';
    try {
        const saved = GM_getValue(KEY, null);
        if (saved) { data = validateExport(saved.data); characterId = saved.characterId; }
        const stored = GM_getValue(CATALOG_KEY, null);
        catalog = selectCatalog(stored);
        const storedFilter = GM_getValue(FILTER_KEY, 'all');
        if (['all', 'owned', 'unowned'].includes(storedFilter)) filterMode = storedFilter;
    } catch (e) { console.warn('[Omni 收录]', e.message); }
    let products = new Map();
    function rebuild() {
        products = new Map(catalog.products.map(p => [normalize(p.name), { ...p, items: resolveItems(p.name, p.items || [p.name]) }]));
        const character = data?.characters.find(c => c.id === characterId) || data?.characters[0];
        characterId = character?.id || '';
        owned = makeOwned(character);
    }
    rebuild();

    const css = document.createElement('style');
    css.textContent = `
      #omni-owned-panel{box-sizing:border-box;width:270px;max-width:100%;margin:0 0 14px auto;background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 3px 14px #0001;color:#222;font:13px/1.6 system-ui,sans-serif;z-index:20}
      #omni-owned-panel{position:fixed;right:16px;bottom:16px;margin:0;max-height:calc(100vh - 32px);overflow-y:auto}
      #omni-owned-panel summary{cursor:pointer;padding:12px 14px;font-weight:700;font-size:15px;color:#16734b}
      #omni-owned-body{padding:0 14px 14px} #omni-owned-body select{width:100%;padding:5px;margin:6px 0}
      #omni-owned-body button{cursor:pointer;border:1px solid #ddd;background:#f7f8fa;border-radius:5px;padding:5px 8px;margin:4px 5px 0 0;color:#222}
      #omni-owned-body button:hover{background:#eaf6ef} #omni-owned-status{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px}
      #omni-owned-help{font-size:12px;line-height:1.75;color:#777;margin:0 0 12px}
      #omni-owned-body [role="group"]{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
      #omni-owned-body [data-filter]{font-size:12px;padding:5px 2px;margin:4px 0 0;white-space:nowrap}
      #omni-owned-body [data-action="import"]{display:block;width:100%;box-sizing:border-box;margin:12px 0 6px;padding:9px 10px;background:#16734b;border-color:#16734b;color:#fff;font-weight:700;font-size:14px}
      #omni-owned-body [data-action="import"]:hover{background:#125c3c;border-color:#125c3c}
      #omni-owned-body button:focus-visible{outline:2px solid #16734b;outline-offset:2px}
      #omni-owned-body button:disabled{cursor:default;opacity:.55}
      #omni-owned-body button[aria-pressed="true"]{background:#16734b;color:white;border-color:#16734b}
      [data-omni-owned-hidden="true"]{display:none!important}
      #omni-owned-filter-note{margin-top:5px;color:#666;font-size:12px}
      .omni-owned-image{position:absolute!important;top:9px!important;right:9px!important;z-index:9!important;background:#15734bef!important;color:#fff!important;padding:4px 9px!important;border-radius:5px!important;font:bold 14px/1.5 system-ui!important;pointer-events:none!important;box-shadow:0 1px 4px #0004}
      .omni-owned-name{display:inline-block!important;background:#e5f5ec!important;color:#146440!important;border:1px solid #9bceb0!important;margin-left:7px!important;padding:1px 6px!important;border-radius:4px!important;font:12px/1.5 system-ui!important;vertical-align:middle!important;white-space:nowrap!important}
      .omni-owned-partial{background:#936000ef!important;color:#fff!important} .omni-owned-name.omni-owned-partial{background:#fff4dc!important;color:#8c5900!important;border-color:#dfc17e!important}
      .qu-grid-image.omni-owned-position{position:relative!important}
      .qu-grid-name.omni-owned-name-row{height:auto!important;min-height:24px!important;overflow:visible!important}
      .qu-grid-name-div.omni-owned-title{overflow:visible!important;white-space:normal!important;height:auto!important;width:auto!important;max-width:none!important}
    `;
    document.head.append(css);
    const panel = document.createElement('details');
    panel.id = 'omni-owned-panel';
    panel.open = !data;
    // Only this constant string is HTML; imported names use textContent throughout.
    panel.innerHTML = `<summary>商城道具收录</summary><div id="omni-owned-body"><p id="omni-owned-help">使用说明：本功能需要游戏内亚拉戈科技读取玩家物品持有情况，如不需要该功能可以在脚本配置中关闭。</p><div>角色</div><select aria-label="收录角色"></select><div role="group" aria-label="商品获取筛选"><button type="button" data-filter="all">全部显示</button><button type="button" data-filter="owned">只显示已获取</button><button type="button" data-filter="unowned">只显示未获取</button></div><div id="omni-owned-filter-note"></div><button type="button" data-action="import">导入收录 JSON</button><button type="button" data-action="refresh">更新商城清单</button><button type="button" data-action="clear">清除收录</button><input type="file" accept=".json,application/json" hidden><div id="omni-owned-status"></div></div>`;
    document.body.append(panel);
    function positionPanel() {
        panel.hidden = !FF14Enhancements.enabled(ENABLED_KEY);
        if (panel.hidden) return;
        const main = document.querySelector('#product-list') || document.querySelector('.detail-right-title')?.closest('.qu-container');
        if (!main) return;
        const anchor = main.matches('.qu-container') ? main : main.querySelector('.qu-container');
        if (!anchor) return;
        // Measure the untouched, centered product column. The floating panel never affects its layout.
        const rect = anchor.getBoundingClientRect();
        const left = rect.right + 12;
        const fits = left + 270 + 16 <= document.documentElement.clientWidth;
        if (fits) {
            panel.dataset.layout = 'sidebar';
            Object.assign(panel.style, { left: `${left}px`, right: 'auto', top: `${Math.max(16, rect.top)}px`, bottom: 'auto' });
            panel.style.maxHeight = `calc(100vh - ${Math.max(16, rect.top) + 16}px)`;
        } else {
            panel.dataset.layout = 'floating';
            Object.assign(panel.style, { left: 'auto', right: '16px', top: 'auto', bottom: '16px', maxHeight: 'calc(100vh - 32px)' });
        }
    }
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, { passive: true });
    const select = panel.querySelector('select');
    const fileInput = panel.querySelector('input');
    const statusEl = panel.querySelector('#omni-owned-status');
    const filterNote = panel.querySelector('#omni-owned-filter-note');
    for (const button of panel.querySelectorAll('[data-filter]')) {
        button.setAttribute('aria-pressed', String(button.dataset.filter === filterMode));
        button.addEventListener('click', () => {
            GM_setValue(FILTER_KEY, button.dataset.filter);
            filterMode = button.dataset.filter;
            panel.querySelectorAll('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === button)));
            scan();
        });
    }
    const say = message => { statusEl.textContent = message; };
    function refreshSelect() {
        select.replaceChildren();
        for (const c of data?.characters || []) {
            const option = document.createElement('option');
            option.value = c.id;
            option.textContent = `${c.name} @ ${c.worldName || c.homeWorldId}`;
            select.append(option);
        }
        select.value = characterId;
        select.disabled = !data;
        const c = data?.characters.find(c => c.id === characterId);
        say(c ? `收录 ${owned.size} 件；导出：${new Date(data.exportedAt).toLocaleString('zh-CN')}\n${c.unlockCapturedAt ? '解锁采集：' + new Date(c.unlockCapturedAt).toLocaleString('zh-CN') : '该角色尚未采集解锁数据，仅依据库存快照。'}\n无标记表示没有匹配的持有记录。` : '请选择模块导出的 JSON。数据只保存在油猴本地，不上传。');
    }
    refreshSelect();
    select.addEventListener('change', () => {
        characterId = select.value; rebuild(); GM_setValue(KEY, { data, characterId }); refreshSelect(); scan();
    });
    panel.querySelector('[data-action="import"]').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
            if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请减少导出角色。');
            const imported = validateExport(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
            const nextId = imported.characters.some(c => c.id === characterId) ? characterId : imported.characters[0].id;
            // Persist first so a quota error cannot silently lose the last good import.
            GM_setValue(KEY, { data: imported, characterId: nextId });
            data = imported; characterId = nextId; rebuild(); refreshSelect(); scan();
        } catch (e) { say(`导入失败：${e.message}`); }
        finally { fileInput.value = ''; }
    });
    panel.querySelector('[data-action="clear"]').addEventListener('click', () => {
        GM_deleteValue(KEY); data = null; characterId = ''; rebuild(); refreshSelect(); scan();
    });

    function requirementFor(name) {
        const key = normalize(name);
        return products.get(key)?.items || bundledProducts.get(key)?.items || [name];
    }
    function mark(host, className, result, title) {
        let badge = host.querySelector(`:scope > .${className}`);
        if (!result) { badge?.remove(); return; }
        if (!badge) { badge = document.createElement('span'); badge.className = className; host.append(badge); }
        const text = badgeText(result);
        if (badge.textContent !== text) badge.textContent = text;
        badge.classList.toggle('omni-owned-partial', !result.full);
        badge.title = title;
    }
    function tooltip(result) {
        if (!result) return '';
        const c = data?.characters.find(c => c.id === characterId);
        return `${c?.name || ''} @ ${c?.worldName || c?.homeWorldId || ''}\n` + result.names.map(name => {
            const record = owned.get(normalize(name));
            return `${record ? '✓' : '○'} ${name}${record ?
                `${record.unlocked ? '（已解锁）' : ''}${record.quantity ? `（角色库存 ${record.quantity} 件）` : ''}${record.housingQuantity ? `（关联房屋仓库 ${record.housingQuantity} 件，可能共享）` : ''}` : '（无持有记录）'}`;
        }).join('\n');
    }
    function scan() {
        positionPanel();
        // Never apply the FF14 catalogue on another game's shop or product detail.
        const merchant = new URL(location.href).searchParams.get('merchantId');
        const ff14Detail = [...document.querySelectorAll('a[href]')].some(node => {
            try { const url = new URL(node.href); return url.pathname === '/game/1' || url.searchParams.get('merchantId') === '1'; }
            catch { return false; }
        });
        const allowed = location.pathname === '/tools-shop' ? (!merchant || merchant === '1') : ff14Detail;
        const params = new URL(location.href).searchParams;
        const selectedCategory = document.querySelector('#product-list .search-item:first-child input[type="radio"]:checked');
        const categoryId = selectedCategory?.value ?? params.get('baseCategoryId');
        const excluded = location.pathname === '/tools-shop' && EXCLUDED_CATEGORIES.has(categoryId);
        const enabled = FF14Enhancements.enabled(ENABLED_KEY) && allowed && !!data && !excluded;
        panel.querySelector('[data-action=refresh]').disabled = refreshing || !FF14Enhancements.enabled(ENABLED_KEY) || !allowed;
        for (const button of panel.querySelectorAll('[data-filter]')) button.disabled = !enabled || location.pathname !== '/tools-shop';
        let visible = 0, total = 0;
        for (const card of document.querySelectorAll('.qu-grid-item')) {
            const nameEl = card.querySelector('.qu-grid-name-div');
            const imageEl = card.querySelector('.qu-grid-image');
            if (!nameEl || !imageEl) continue;
            const name = nameEl.getAttribute('title') || [...nameEl.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
            const result = enabled ? classify(requirementFor(name), owned) : null;
            const show = shouldShow(filterMode, result, enabled);
            const wrapper = card.parentElement?.classList.contains('el-col') ? card.parentElement : card;
            // Restore a previously filtered card if the shop reparents it during navigation.
            if (wrapper !== card) card.removeAttribute('data-omni-owned-hidden');
            if (!show) wrapper.setAttribute('data-omni-owned-hidden', 'true');
            else wrapper.removeAttribute('data-omni-owned-hidden');
            total++; if (show) visible++;
            imageEl.classList.toggle('omni-owned-position', enabled && FF14Enhancements.enabled('angelways.ownedImageBadge'));
            nameEl.classList.toggle('omni-owned-title', enabled && FF14Enhancements.enabled('angelways.ownedNameBadge'));
            nameEl.parentElement?.classList.toggle('omni-owned-name-row', enabled && FF14Enhancements.enabled('angelways.ownedNameBadge'));
            mark(imageEl, 'omni-owned-image', FF14Enhancements.enabled('angelways.ownedImageBadge') ? result : null, tooltip(result));
            mark(nameEl, 'omni-owned-name', FF14Enhancements.enabled('angelways.ownedNameBadge') ? result : null, tooltip(result));
        }
        const detail = document.querySelector('.detail-right-title');
        if (detail) {
            const name = [...detail.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
            const result = enabled ? classify(requirementFor(name), owned) : null;
            mark(detail, 'omni-owned-name', FF14Enhancements.enabled('angelways.ownedNameBadge') ? result : null, tooltip(result));
        }
        filterNote.textContent = !FF14Enhancements.enabled(ENABLED_KEY) ? '商城道具收录已关闭；导入数据保留，所有商品正常显示。'
            : !allowed ? '此商品不属于 FF14，收录标记和筛选不生效。'
            : excluded ? '此分类不显示获取情况，所有商品正常显示。'
            : !data ? '导入收录后可筛选商品。'
            : location.pathname !== '/tools-shop' ? '商品筛选在列表页面生效。'
            : `本页显示 ${visible}/${total} 件；部分已获取归入未获取。筛选依据导入记录，不代表购买历史。`;
    }
    const observer = new MutationObserver(records => {
        const relevant = records.some(r => {
            const element = r.target.nodeType === 1 ? r.target : r.target.parentElement;
            if (element?.closest('#omni-owned-panel,.omni-owned-image,.omni-owned-name')) return false;
            if (r.type === 'attributes' && r.attributeName !== 'title')
                return !!element?.closest('.search-content');
            // Ignore our own badge insertions and removals to prevent an observer loop.
            return [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType !== 1 ||
                !n.matches('.omni-owned-image,.omni-owned-name')) || r.type === 'characterData' || r.type === 'attributes';
        });
        if (relevant) { clearTimeout(timer); timer = setTimeout(scan, 150); }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['title', 'class', 'aria-checked'] });
    window.addEventListener('popstate', scan);
    document.addEventListener('change', event => { if (event.target.closest?.('.search-content')) scan(); });
    document.addEventListener('ff14-enhancements-change', scan);
    scan();

    function getPage(page) {
        return new Promise((resolve, reject) => GM_xmlhttpRequest({
            method: 'GET', anonymous: true, timeout: 20000,
            url: `https://sqmallservice.u.sdo.com/api/ps/product/list?merchantId=1&page=${page}&pageSize=100&categoryType=0&order=0`,
            headers: { 'qu-merchant-id': '1', 'qu-hardware-platform': '3', 'qu-software-platform': '1',
                'qu-deploy-platform': '1', 'qu-web-host': 'qu.sdo.com' },
            onload: response => {
                try {
                    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
                    const json = JSON.parse(response.responseText);
                    if (json.resultCode !== 0 || !Array.isArray(json.data?.productList)) throw new Error(json.resultMsg || '商城响应格式改变');
                    resolve(json.data);
                } catch (e) { reject(e); }
            },
            onerror: () => reject(new Error('商城清单请求失败')),
            ontimeout: () => reject(new Error('商城清单请求超时'))
        }));
    }
    panel.querySelector('[data-action="refresh"]').addEventListener('click', async () => {
        if (refreshing || !FF14Enhancements.enabled(ENABLED_KEY)) return;
        refreshing = true;
        const button = panel.querySelector('[data-action="refresh"]'); button.disabled = true;
        try {
            const records = [];
            let total = Infinity;
            for (let page = 1; records.length < total && page <= 50; page++) {
                say(`正在更新商城清单，第 ${page} 页……`);
                const response = await getPage(page);
                total = response.totalCount;
                if (!Number.isInteger(total) || total <= 0 || total > 5000 || !response.productList.length)
                    throw new Error('商城清单不完整，保留上次清单。');
                records.push(...response.productList);
            }
            if (records.length < total) throw new Error('清单下载不完整');
            const next = { updatedAt: new Date().toISOString(), products: records.map(p => ({
                skuId: String(p.sku.id), name: p.product.productName,
                items: resolveItems(p.product.productName, extractItems(p.product.productContent, p.product.productName))
            })) };
            GM_setValue(CATALOG_KEY, next); catalog = next; rebuild(); scan();
            say(`商城清单更新完成：${next.products.length} 件商品。`);
        } catch (e) { say(`更新失败：${e.message}`); }
        finally { refreshing = false; scan(); }
    });
})();
