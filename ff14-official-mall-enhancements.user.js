// ==UserScript==
// @name         一系列FF14官网&商城功能优化
// @namespace    https://github.com/Angelways/ff14-official-mall-enhancements
// @version      3.1.3
// @author       Angelways, annangela
// @homepageURL  https://github.com/Angelways
// @description  盛趣登录自动勾选协议、FF14 仓库批量领取、官网自动进入简约版及完整导航。
// @license      GPL-3.0-or-later
// @match        *://*.sdo.com/*
// @match        *://sdo.com/*
// @run-at       document-idle
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

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

    function scan() {
        pending = false;
        if (document.hidden) return;
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
        if (!initialized && location.pathname === '/personal-center' && page.jQuery) {
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
            const visible = isFF14 && host && host.getClientRects().length &&
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
    const enabled = () => GM_getValue(SETTING, true) !== false;
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
        GM_setValue(SETTING, value);
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
            ['LINK', '相关网站', [['最新活动', 'https://actff1.web.sdo.com/Project/20181018ffactive/index.html', true], ['官方论坛', 'https://ff.web.sdo.com/bbs', true], ['海德林咖啡餐厅', 'https://ff.web.sdo.com/ffcafe/index.html#/index', true], ['FF14 X ARTIST', 'https://actff1.web.sdo.com/project/20250601artist/index.html#/index', true]]]
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
        #ff14-simple-navigation .ff14-nav-category { width: 110px; height: 76px; border: 0; padding: 0; background: transparent; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; font: inherit; cursor: pointer; }
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
        #ff14-simple-navigation .ff14-nav-columns { display: grid; grid-template-columns: repeat(5,110px); justify-content: end; margin-right: 438px; }
        #ff14-simple-navigation .ff14-nav-column a { display: block; color: #bbb; font-size: 14px; line-height: 20px; padding: 8px 0; text-align: center; overflow-wrap: anywhere; }
        #ff14-simple-navigation .ff14-nav-column a:hover { color: #e3c461; }
        #ff14-simple-navigation .ff14-nav-column-title { display: none; }
        #ff14-simple-navigation [hidden] { display: none !important; }
        #ff14-simple-navigation :focus-visible { outline: 2px solid #e3c461; outline-offset: 2px; }
        @media(max-width:1400px) {
            #ff14-simple-navigation { padding: 0 20px; gap: 12px; }
            #ff14-simple-navigation .ff14-nav-category { width: 94px; }
            #ff14-simple-navigation .ff14-nav-actions, #ff14-simple-navigation .ff14-nav-right { gap: 10px; }
            #ff14-simple-navigation .ff14-nav-columns { grid-template-columns: repeat(5,94px); margin-right: 414px; }
        }
        @media(max-width:1150px) {
            #ff14-simple-navigation .ff14-nav-logo { display: none; }
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
        document.documentElement.classList.toggle('ff14-simple-enhanced', simple);
        if (!simple) { if (nav?.isConnected) nav.remove(); setOpened(false); return; }
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
    registerMenu(); synchronize();
})();
