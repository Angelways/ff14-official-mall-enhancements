const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');
const script = fs.readFileSync(path.join(__dirname, '../ff14-official-mall-enhancements.user.js'), 'utf8');
const fixtures = require('./mall-new-products-20261029.json');
const start = script.indexOf('    const BUNDLED = ');
const end = script.indexOf('    let data = null;', start);
const parserDom = new JSDOM('');
const core = vm.runInNewContext(script.slice(start, end) +
    '\n({catalog:BUNDLED, selectCatalog, classify, makeOwned, extractItems, resolveItems})',
    {DOMParser: parserDom.window.DOMParser, document: parserDom.window.document});

test('all nine official additions have exact item requirements, including complete bundles', () => {
    assert.equal(core.catalog.products.length, 815);
    assert.equal(new Set(core.catalog.products.map(p => p.skuId)).size, 815);
    const counts = [3, 1, 5, 5, 1, 1, 5, 1, 1];
    fixtures.forEach((fixture, index) => {
        const product = core.catalog.products.find(p => p.name === fixture.name);
        assert.ok(product, fixture.name);
        assert.equal(product.items.length, counts[index], fixture.name);
        assert.deepEqual(Array.from(product.items), fixture.items);
        assert.deepEqual(Array.from(core.extractItems(fixture.content, fixture.name)), fixture.items);
        if (product.items.length > 1) {
            const owned = core.makeOwned({items: [{name: product.items[0], quantity: 1, unlocked: false}]});
            assert.equal(core.classify(product.items, owned).full, false, fixture.name);
            assert.equal(core.classify(product.items, owned).count, 1, fixture.name);
        }
    });
});

test('November additions include the complete outfit and both boost bundle items', () => {
    const expected = [
        ['2117185344854282240', '另类褶边连衣裙套装', ['另类皮革缎带', '另类褶边连衣裙', '另类甲片', '另类蓬松裤', '另类皮靴']],
        ['2118606257592193024', '晓月金曦主线直升礼包', ['金曦冒险录·银冬将至', '亚拉戈白金币']]
    ];
    for (const [skuId, name, items] of expected) {
        const product = core.catalog.products.find(p => p.skuId === skuId);
        assert.equal(product?.name, name);
        assert.deepEqual(Array.from(product.items), items);
    }
});

test('older or undated caches cannot hide bundled additions; newer downloads remain authoritative', () => {
    for (const updatedAt of [undefined, 'invalid', '2026-10-12T00:00:00Z'])
        assert.equal(core.selectCatalog({updatedAt, products: []}), core.catalog);
    const newer = {updatedAt: '2099-01-01T00:00:00Z', products: []};
    assert.equal(core.selectCatalog(newer), newer);
});

function page(items, values = new Map(), url = 'https://qu.sdo.com/tools-shop') {
    const cards = fixtures.map(p => `<div class="el-col"><div class="qu-grid-item"><div class="qu-grid-image"></div><div class="qu-grid-name"><div class="qu-grid-name-div" title="${p.name}">${p.name}</div></div></div></div>`).join('');
    const content = url.includes('/product-detail/')
        ? `<div class="qu-container"><div class="detail-right-title">${fixtures[0].name}</div></div>`
        : `<div id="product-list"><div class="qu-container"><div class="search-content"></div><div class="el-row">${cards}</div></div></div>`;
    const dom = new JSDOM(`<a href="/game/1">FF14</a>${content}`, {url, runScripts: 'outside-only'});
    const data = {format: 'omni-shop-owned', schemaVersion: 1, language: 'chs', characters: [
        {id: '1', name: '测试角色', items}, {id: '2', name: '未收录角色', items: []}]};
    if (items) values.set('omni-shop-owned-v1', {data, characterId: '1'});
    values.set('omni-shop-catalog-v1', {updatedAt: '2026-10-12T00:00:00Z', products: []});
    dom.window.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
    dom.window.GM_setValue = (key, value) => values.set(key, value);
    dom.window.GM_deleteValue = key => values.delete(key);
    dom.window.GM_addValueChangeListener = () => {};
    dom.window.GM_registerMenuCommand = () => {};
    dom.window.GM_xmlhttpRequest = () => {throw new Error('Unexpected network request');};
    dom.window.eval(script);
    return dom;
}

test('new products show ownership with stale cache; role switching and filters isolate the records', () => {
    const items = fixtures.flatMap((p, index) => p.items.map((name, component) => ({
        itemId: 50000 + index * 10 + component, name, quantity: index === 1 ? 0 : 1,
        unlocked: index === 1, category: index >= 7 ? 'housing' : 'item'
    })));
    const dom = page(items);
    try {
        const document = dom.window.document;
        assert.equal(document.querySelectorAll('.omni-owned-image').length, 9);
        assert.equal(document.querySelectorAll('.omni-owned-image')[7].textContent, '✓ 拥有 ×1');
        document.querySelector('[data-filter="unowned"]').click();
        assert.equal(document.querySelectorAll('[data-omni-owned-hidden]').length, 9);
        const select = document.querySelector('select[aria-label="收录角色"]');
        select.value = '2'; select.dispatchEvent(new dom.window.Event('change'));
        assert.equal(document.querySelectorAll('.omni-owned-image').length, 0);
        assert.equal(document.querySelectorAll('[data-omni-owned-hidden]').length, 0);
    } finally { dom.window.close(); }
});

test('culture shirts, Night of Devil and music bundles show partial ownership until every component is present', () => {
    const bundles = fixtures.filter(p => p.items.length > 1);
    const dom = page(bundles.map((p, index) => ({itemId: 60000 + index, name: p.items[0], quantity: 1, unlocked: false})));
    try {
        const badges = [...dom.window.document.querySelectorAll('.omni-owned-image')];
        assert.equal(badges.length, 4);
        assert.deepEqual(badges.map(el => el.textContent), ['部分已获取 1/3', '部分已获取 1/5', '部分已获取 1/5', '部分已获取 1/5']);
    } finally { dom.window.close(); }
});

function selectValue(dom, selector, value) {
    const control = dom.window.document.querySelector(selector);
    control.value = value;
    control.dispatchEvent(new dom.window.Event('change', {bubbles: true}));
}

test('manual marks work without an import, filter the list, and persist across list and detail pages', () => {
    const values = new Map();
    const list = page(null, values);
    try {
        const document = list.window.document;
        let cardClicks = 0;
        document.querySelector('.qu-grid-item').addEventListener('click', () => cardClicks++);
        document.querySelector('.omni-owned-manual').click();
        assert.equal(cardClicks, 0);
        selectValue(list, '.omni-owned-manual', 'owned');
        assert.equal(document.querySelector('.omni-owned-image').textContent, '✓ 手动已获取');
        document.querySelector('[data-filter="owned"]').click();
        assert.equal(document.querySelectorAll('[data-omni-owned-hidden]').length, fixtures.length - 1);
    } finally { list.window.close(); }

    const detail = page(null, values, 'https://mall.sdo.com/product-detail/2113165536521342976');
    try {
        const document = detail.window.document;
        assert.equal(document.querySelector('.omni-owned-manual').value, 'owned');
        selectValue(detail, '.omni-owned-manual', 'unowned');
        assert.equal(document.querySelector('.omni-owned-name').textContent, '手动未获取');
        selectValue(detail, '.omni-owned-manual', 'auto');
        assert.equal(document.querySelector('.omni-owned-name'), null);
    } finally { detail.window.close(); }
    assert.deepEqual(Object.keys(values.get('omni-shop-manual-v1')), []);
});

test('manual overrides are local to a character and automatic restores imported bundle ownership', () => {
    const bundle = fixtures[0];
    const dom = page(bundle.items.map((name, i) => ({name, itemId: i + 1, quantity: 1, unlocked: false})));
    try {
        const document = dom.window.document;
        const badge = () => document.querySelector('.omni-owned-image')?.textContent;
        const role = '[aria-label="收录角色"]';
        assert.equal(badge(), '✓ 已获取');
        selectValue(dom, '.omni-owned-manual', 'unowned');
        assert.equal(badge(), '手动未获取');
        selectValue(dom, role, '2');
        assert.equal(badge(), undefined);
        selectValue(dom, role, '');
        assert.equal(badge(), undefined);
        selectValue(dom, role, '1');
        assert.equal(badge(), '手动未获取');
        selectValue(dom, '.omni-owned-manual', 'auto');
        assert.equal(badge(), '✓ 已获取');
    } finally { dom.window.close(); }
});

test.after(() => parserDom.window.close());
