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
    assert.equal(core.catalog.products.length, 813);
    assert.equal(new Set(core.catalog.products.map(p => p.skuId)).size, 813);
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

test('older or undated caches cannot hide bundled additions; newer downloads remain authoritative', () => {
    for (const updatedAt of [undefined, 'invalid', '2026-10-12T00:00:00Z'])
        assert.equal(core.selectCatalog({updatedAt, products: []}), core.catalog);
    const newer = {updatedAt: '2099-01-01T00:00:00Z', products: []};
    assert.equal(core.selectCatalog(newer), newer);
});

function page(items) {
    const cards = fixtures.map(p => `<div class="el-col"><div class="qu-grid-item"><div class="qu-grid-image"></div><div class="qu-grid-name"><div class="qu-grid-name-div" title="${p.name}">${p.name}</div></div></div></div>`).join('');
    const dom = new JSDOM(`<a href="/game/1">FF14</a><div id="product-list"><div class="qu-container"><div class="search-content"></div><div class="el-row">${cards}</div></div></div>`,
        {url: 'https://qu.sdo.com/tools-shop', runScripts: 'outside-only'});
    const data = {format: 'omni-shop-owned', schemaVersion: 1, language: 'chs', characters: [
        {id: '1', name: '测试角色', items}, {id: '2', name: '未收录角色', items: []}]};
    const values = new Map([
        ['omni-shop-owned-v1', {data, characterId: '1'}],
        ['omni-shop-catalog-v1', {updatedAt: '2026-10-12T00:00:00Z', products: []}]
    ]);
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

test.after(() => parserDom.window.close());
