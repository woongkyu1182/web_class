/* 달빛 카페 — script.js
   메뉴 내용은 index.html에 있고, 여기서는 보여주는 방식과 주문만 다룬다.
   (JS가 꺼져 있어도 모든 메뉴가 보인다.) */
(function () {
    'use strict';

    var menuSection = document.getElementById('menu');
    var tableWrap = menuSection ? menuSection.querySelector('.table-wrap') : null;
    var rows = menuSection ? menuSection.querySelectorAll('tbody tr') : [];

    if (!menuSection || !tableWrap || rows.length === 0) {
        return;
    }

    var STORAGE_KEY = 'moonlight-cafe-cart';
    var TABLE_KEY = 'moonlight-cafe-table';
    var SEQ_KEY = 'moonlight-cafe-order-seq';
    var MAX_QTY = 20;
    var TABLE_MAX = 20;   /* 샘플 카페의 테이블 수 */

    function formatWon(value) {
        return value.toLocaleString('ko-KR') + '원';
    }

    function optionLabel(option) {
        if (option === 'hot') { return 'HOT'; }
        if (option === 'ice') { return 'ICE'; }
        return '';
    }

    /* ==========================================================
       0. 메뉴 정보 (HTML 표에서 읽는다)
       ========================================================== */
    var MENU = {};

    function nameOf(row) {
        var cell = row.querySelector('th').cloneNode(true);
        var mark = cell.querySelector('.mark');
        if (mark) {
            mark.remove();
        }
        return cell.textContent.trim();
    }

    Array.prototype.forEach.call(rows, function (row) {
        MENU[row.dataset.id] = {
            name: nameOf(row),
            hot: row.dataset.hot,
            ice: row.dataset.ice,
            price: row.dataset.price
        };
    });

    /* 메뉴 정보에서 가격을 구한다. 없는 메뉴·옵션이면 null */
    function priceFor(id, option) {
        var item = MENU[id];
        if (!item) { return null; }
        var raw = option === 'hot' ? item.hot : option === 'ice' ? item.ice : option === 'single' ? item.price : undefined;
        return raw === undefined ? null : Number(raw);
    }

    /* ==========================================================
       1. 분류 탭 필터
       ========================================================== */
    var TABS = [
        { key: 'all', label: '전체' },
        { key: 'drink', label: '음료' },
        { key: 'dessert', label: '디저트' }
    ];

    var tabBar = document.createElement('div');
    tabBar.className = 'tabs';
    tabBar.setAttribute('role', 'group');
    tabBar.setAttribute('aria-label', '메뉴 분류');

    var tabButtons = TABS.map(function (tab) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'tab';
        button.textContent = tab.label;
        button.dataset.category = tab.key;
        button.addEventListener('click', function () {
            selectCategory(tab.key);
        });
        tabBar.appendChild(button);
        return button;
    });

    tableWrap.parentNode.insertBefore(tabBar, tableWrap);

    function selectCategory(key) {
        tabButtons.forEach(function (button) {
            var selected = button.dataset.category === key;
            button.setAttribute('aria-pressed', String(selected));
            button.classList.toggle('is-selected', selected);
        });
        rows.forEach(function (row) {
            row.hidden = key !== 'all' && row.dataset.category !== key;
        });
    }

    selectCategory('all');

    /* ==========================================================
       2. 장바구니 상태와 저장 (localStorage)
       항목: { key, id, name, option, price, qty }
       ========================================================== */
    var cart = loadCart();

    /* 저장된 값은 믿지 않고, 지금 메뉴표 기준으로 다시 검증한다 */
    function loadCart() {
        var result = [];
        try {
            var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!Array.isArray(saved)) { return result; }
            saved.forEach(function (entry) {
                if (!entry || typeof entry.id !== 'string') { return; }
                var price = priceFor(entry.id, entry.option);
                var qty = Math.floor(Number(entry.qty));
                if (price === null || !(qty >= 1)) { return; }
                var key = entry.id + ':' + entry.option;
                var found = result.filter(function (item) { return item.key === key; })[0];
                if (found) {
                    found.qty = Math.min(MAX_QTY, found.qty + qty);
                } else {
                    result.push({ key: key, id: entry.id, name: MENU[entry.id].name, option: entry.option, price: price, qty: Math.min(MAX_QTY, qty) });
                }
            });
        } catch (error) {
            return [];
        }
        return result;
    }

    function saveCart() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
        } catch (error) {
            /* 저장이 막힌 환경에서도 장바구니는 화면에서 동작한다 */
        }
    }

    function findEntry(key) {
        return cart.filter(function (entry) { return entry.key === key; })[0];
    }

    function addToCart(item) {
        var key = item.id + ':' + item.option;
        var found = findEntry(key);
        if (found) {
            found.qty = Math.min(MAX_QTY, found.qty + 1);
        } else {
            cart.push({ key: key, id: item.id, name: item.name, option: item.option, price: item.price, qty: 1 });
        }
        refresh({ bump: true });
    }

    function changeQty(key, delta) {
        var entry = findEntry(key);
        if (!entry) { return; }
        entry.qty = Math.max(1, Math.min(MAX_QTY, entry.qty + delta));
        refresh();
    }

    function removeEntry(key) {
        cart = cart.filter(function (entry) { return entry.key !== key; });
        refresh();
    }

    function clearCart() {
        cart = [];
        refresh();
    }

    function cartCount() {
        return cart.reduce(function (sum, entry) { return sum + entry.qty; }, 0);
    }

    function cartTotal() {
        return cart.reduce(function (sum, entry) { return sum + entry.price * entry.qty; }, 0);
    }

    /* 상태가 바뀔 때마다: 저장 → 하단 바 → 열려 있으면 패널 */
    function refresh(options) {
        options = options || {};
        saveCart();
        renderCartBar(options.bump);
        if (cartDialog.open) {
            renderCartList(options.focus);
        }
    }

    /* ==========================================================
       3. 하단 장바구니 바
       ========================================================== */
    var cartBar = document.createElement('div');
    cartBar.className = 'cart-bar';
    cartBar.setAttribute('role', 'status');
    cartBar.setAttribute('aria-live', 'polite');
    cartBar.hidden = true;

    var cartOpenButton = document.createElement('button');
    cartOpenButton.type = 'button';
    cartOpenButton.className = 'cart-bar-inner';
    cartOpenButton.setAttribute('aria-haspopup', 'dialog');

    var cartCountEl = document.createElement('span');
    cartCountEl.className = 'cart-count';
    var cartTotalEl = document.createElement('span');
    cartTotalEl.className = 'cart-total';
    var cartViewEl = document.createElement('span');
    cartViewEl.className = 'cart-view';
    cartViewEl.setAttribute('aria-hidden', 'true');
    cartViewEl.textContent = '보기';

    cartOpenButton.appendChild(cartCountEl);
    cartOpenButton.appendChild(cartTotalEl);
    cartOpenButton.appendChild(cartViewEl);
    cartBar.appendChild(cartOpenButton);
    document.body.appendChild(cartBar);

    function renderCartBar(bump) {
        var count = cartCount();
        if (count === 0) {
            cartBar.hidden = true;
            document.body.classList.remove('has-cart');
            return;
        }
        cartCountEl.textContent = '장바구니 ' + count + '개';
        cartTotalEl.textContent = '합계 ' + formatWon(cartTotal());
        cartOpenButton.setAttribute('aria-label', '장바구니 열기, ' + count + '개, 합계 ' + formatWon(cartTotal()));
        cartBar.hidden = false;
        document.body.classList.add('has-cart');
        if (bump) {
            cartBar.classList.remove('bump');
            void cartBar.offsetWidth; /* 애니메이션 다시 시작 */
            cartBar.classList.add('bump');
        }
    }

    /* ==========================================================
       4. 장바구니 패널 (dialog) : 수량 조절, 삭제, 합계
       ========================================================== */
    var cartDialog = document.createElement('dialog');
    cartDialog.className = 'cart-dialog';
    cartDialog.setAttribute('aria-labelledby', 'cart-title');
    cartDialog.innerHTML =
        '<div class="cart-sheet">' +
        '<div class="cart-head">' +
        '<h2 id="cart-title">장바구니</h2>' +
        '<button type="button" class="cart-close" aria-label="장바구니 닫기">닫기</button>' +
        '</div>' +
        '<p class="cart-empty">담긴 메뉴가 없어요.</p>' +
        '<ul class="cart-items"></ul>' +
        '<p class="cart-sum"><span>합계</span><strong class="cart-sum-value"></strong></p>' +
        '<form class="order-form" novalidate>' +
        '<label for="table-no">테이블 번호</label>' +
        '<input id="table-no" name="table" type="text" inputmode="numeric" maxlength="2" autocomplete="off" aria-describedby="table-hint table-error">' +
        '<p id="table-hint" class="field-hint">자리에 놓인 번호를 입력해 주세요. (1~' + TABLE_MAX + ')</p>' +
        '<p id="table-error" class="field-error" role="alert" hidden></p>' +
        '<button type="submit" class="order-submit">주문하기</button>' +
        '</form>' +
        '<div class="order-done" hidden>' +
        '<div class="done-moon" aria-hidden="true"></div>' +
        '<h3 class="done-title" tabindex="-1">주문이 접수되었어요</h3>' +
        '<p class="done-where"></p>' +
        '<ul class="done-items"></ul>' +
        '<p class="cart-sum"><span>결제하실 금액</span><strong class="done-total"></strong></p>' +
        '<p class="done-note">잠시만 기다려 주세요. 곧 가져다 드릴게요.</p>' +
        '<p class="done-demo">수업 실습용 가상 주문이라 실제로 전달되지 않아요.</p>' +
        '<button type="button" class="order-submit done-ok">확인</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(cartDialog);

    var cartTitleEl = cartDialog.querySelector('#cart-title');
    var cartItemsEl = cartDialog.querySelector('.cart-items');
    var cartEmptyEl = cartDialog.querySelector('.cart-empty');
    var cartSumEl = cartDialog.querySelector('.cart-sum');
    var cartSumValueEl = cartDialog.querySelector('.cart-sum-value');
    var cartCloseButton = cartDialog.querySelector('.cart-close');
    var orderForm = cartDialog.querySelector('.order-form');
    var tableInput = cartDialog.querySelector('#table-no');
    var tableError = cartDialog.querySelector('#table-error');
    var orderDone = cartDialog.querySelector('.order-done');

    function makeButton(className, text, label, key, action) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = text;
        button.setAttribute('aria-label', label);
        button.dataset.key = key;
        button.dataset.action = action;
        return button;
    }

    function renderCartList(focus) {
        cartItemsEl.textContent = '';
        var empty = cart.length === 0;
        cartEmptyEl.hidden = !empty;
        cartSumEl.hidden = empty;
        orderForm.hidden = empty;
        cartSumValueEl.textContent = formatWon(cartTotal());

        cart.forEach(function (entry) {
            var label = entry.name + (entry.option === 'single' ? '' : ' ' + optionLabel(entry.option));
            var li = document.createElement('li');
            li.className = 'cart-item';

            var info = document.createElement('div');
            info.className = 'item-info';
            var name = document.createElement('strong');
            name.textContent = entry.name;
            info.appendChild(name);
            if (entry.option !== 'single') {
                var tag = document.createElement('span');
                tag.className = 'item-opt';
                tag.textContent = optionLabel(entry.option);
                info.appendChild(tag);
            }
            var unit = document.createElement('span');
            unit.className = 'item-unit';
            unit.textContent = formatWon(entry.price);
            info.appendChild(unit);

            var controls = document.createElement('div');
            controls.className = 'item-controls';
            var minus = makeButton('qty-btn', '−', label + ' 수량 줄이기', entry.key, 'minus');
            minus.disabled = entry.qty <= 1;
            var qty = document.createElement('span');
            qty.className = 'item-qty';
            qty.textContent = String(entry.qty);
            var plus = makeButton('qty-btn', '+', label + ' 수량 늘리기', entry.key, 'plus');
            plus.disabled = entry.qty >= MAX_QTY;
            controls.appendChild(minus);
            controls.appendChild(qty);
            controls.appendChild(plus);

            var line = document.createElement('span');
            line.className = 'item-line';
            line.textContent = formatWon(entry.price * entry.qty);

            var remove = makeButton('item-remove', '삭제', label + ' 삭제', entry.key, 'remove');

            li.appendChild(info);
            li.appendChild(controls);
            li.appendChild(line);
            li.appendChild(remove);
            cartItemsEl.appendChild(li);
        });

        /* 다시 그려도 키보드 사용자가 방금 누른 자리를 잃지 않게 한다 */
        if (focus) {
            var target = cartItemsEl.querySelector('button[data-key="' + focus.key + '"][data-action="' + focus.action + '"]:not([disabled])');
            (target || cartCloseButton).focus();
        }
    }

    cartItemsEl.addEventListener('click', function (event) {
        var button = event.target.closest('button[data-action]');
        if (!button) { return; }
        var key = button.dataset.key;
        var action = button.dataset.action;
        if (action === 'plus') {
            changeQty(key, 1);
            renderCartList({ key: key, action: 'plus' });
        } else if (action === 'minus') {
            changeQty(key, -1);
            renderCartList({ key: key, action: 'minus' });
        } else if (action === 'remove') {
            removeEntry(key);
            renderCartList({ key: '', action: '' });
        }
    });

    cartOpenButton.addEventListener('click', function () {
        showCartView();
        renderCartList();
        cartDialog.showModal();
        document.body.classList.add('dialog-open');
    });

    cartCloseButton.addEventListener('click', function () {
        cartDialog.close();
    });

    /* 바깥(어두운 배경)을 누르면 닫힌다 */
    cartDialog.addEventListener('click', function (event) {
        if (event.target === cartDialog) {
            cartDialog.close();
        }
    });

    cartDialog.addEventListener('close', function () {
        document.body.classList.remove('dialog-open');
        showCartView();
    });

    /* ==========================================================
       4-1. 테이블 번호 입력과 주문하기, 주문 완료 화면
       (서버가 없어서 주문은 이 화면 안에서만 이뤄지는 시뮬레이션이다.)
       ========================================================== */
    function parseTable(text) {
        var value = String(text).trim();
        if (!/^\d{1,2}$/.test(value)) { return null; }
        var number = Number(value);
        return number >= 1 && number <= TABLE_MAX ? number : null;
    }

    function loadTable() {
        try {
            var saved = parseTable(localStorage.getItem(TABLE_KEY));
            return saved === null ? '' : String(saved);
        } catch (error) {
            return '';
        }
    }

    function saveTable(number) {
        try {
            localStorage.setItem(TABLE_KEY, String(number));
        } catch (error) {
            /* 저장이 막혀도 주문은 진행된다 */
        }
    }

    function nextOrderNumber() {
        var next = 1;
        try {
            var last = parseInt(localStorage.getItem(SEQ_KEY), 10);
            next = last >= 1 ? last + 1 : 1;
            localStorage.setItem(SEQ_KEY, String(next));
        } catch (error) {
            next = 1;
        }
        return next;
    }

    function showTableError(message) {
        tableError.textContent = message;
        tableError.hidden = false;
        tableInput.setAttribute('aria-invalid', 'true');
    }

    function clearTableError() {
        tableError.textContent = '';
        tableError.hidden = true;
        tableInput.removeAttribute('aria-invalid');
    }

    /* 장바구니 화면 ↔ 주문 완료 화면 */
    function showCartView() {
        orderDone.hidden = true;
        cartTitleEl.textContent = '장바구니';
        renderCartList();
        clearTableError();
    }

    function showDoneView(order) {
        cartItemsEl.textContent = '';
        cartEmptyEl.hidden = true;
        cartSumEl.hidden = true;
        orderForm.hidden = true;
        cartTitleEl.textContent = '주문 완료';

        orderDone.querySelector('.done-where').textContent =
            '테이블 ' + order.table + ' · 주문번호 ' + String(order.number).padStart(3, '0');

        var list = orderDone.querySelector('.done-items');
        list.textContent = '';
        order.items.forEach(function (entry) {
            var li = document.createElement('li');
            var text = entry.name + (entry.option === 'single' ? '' : ' ' + optionLabel(entry.option));
            li.textContent = text + ' × ' + entry.qty;
            list.appendChild(li);
        });
        orderDone.querySelector('.done-total').textContent = formatWon(order.total);

        orderDone.hidden = false;
        orderDone.querySelector('.done-title').focus();
    }

    tableInput.value = loadTable();
    tableInput.addEventListener('input', clearTableError);

    orderForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (cart.length === 0) { return; }

        var table = parseTable(tableInput.value);
        if (table === null) {
            showTableError(tableInput.value.trim() === ''
                ? '테이블 번호를 입력해 주세요.'
                : '1부터 ' + TABLE_MAX + ' 사이의 숫자로 입력해 주세요.');
            tableInput.focus();
            return;
        }

        var order = {
            number: nextOrderNumber(),
            table: table,
            items: cart.map(function (entry) { return { name: entry.name, option: entry.option, qty: entry.qty }; }),
            total: cartTotal()
        };

        saveTable(table);
        clearCart();          /* 주문 완료 시 장바구니를 비운다 */
        showDoneView(order);
    });

    orderDone.querySelector('.done-ok').addEventListener('click', function () {
        cartDialog.close();
    });

    /* ==========================================================
       5. 메뉴 행마다 HOT/ICE 선택과 담기 버튼
       ========================================================== */
    var headRow = menuSection.querySelector('thead tr');
    if (headRow) {
        var orderHead = document.createElement('th');
        orderHead.scope = 'col';
        orderHead.innerHTML = '<span class="visually-hidden">주문</span>';
        headRow.appendChild(orderHead);
    }

    Array.prototype.forEach.call(rows, function (row) {
        var data = row.dataset;
        var name = nameOf(row);

        var cell = document.createElement('td');
        cell.className = 'order';

        var selected = null;   /* 'hot' | 'ice' | 'single' */
        var addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'add';

        function updateAddButton() {
            var price = priceFor(data.id, selected);
            addButton.textContent = '담기 · ' + formatWon(price);
            addButton.setAttribute('aria-label', name + ' ' + optionLabel(selected) + ' 담기, ' + formatWon(price));
        }

        if (data.category === 'drink') {
            var group = document.createElement('div');
            group.className = 'options';
            group.setAttribute('role', 'group');
            group.setAttribute('aria-label', name + ' 온도 선택');

            var optionButtons = ['hot', 'ice'].map(function (option) {
                var button = document.createElement('button');
                button.type = 'button';
                button.className = 'opt';
                button.textContent = option.toUpperCase();
                button.dataset.option = option;
                if (data[option] === undefined) {
                    button.disabled = true;   /* 제공하지 않는 옵션 */
                } else {
                    button.addEventListener('click', function () {
                        choose(option);
                    });
                }
                group.appendChild(button);
                return button;
            });

            var choose = function (option) {
                selected = option;
                optionButtons.forEach(function (button) {
                    var on = button.dataset.option === option;
                    button.setAttribute('aria-pressed', String(on));
                    button.classList.toggle('is-selected', on);
                });
                updateAddButton();
            };

            choose(data.hot !== undefined ? 'hot' : 'ice');
            cell.appendChild(group);
        } else {
            selected = 'single';
            updateAddButton();
        }

        addButton.addEventListener('click', function () {
            addToCart({ id: data.id, name: name, option: selected, price: priceFor(data.id, selected) });
            /* 담았다는 작은 반응 (모션 줄이기 설정에서는 CSS가 꺼 준다) */
            addButton.classList.remove('added');
            void addButton.offsetWidth;
            addButton.classList.add('added');
        });
        addButton.addEventListener('animationend', function () {
            addButton.classList.remove('added');
        });

        cell.appendChild(addButton);
        row.appendChild(cell);
    });

    /* 새로고침 뒤에도 저장된 장바구니를 바에 보여준다 */
    renderCartBar(false);

    /* ==========================================================
       6. 스크롤하면 카드가 부드럽게 떠오른다
       움직임 줄이기 설정이거나 지원하지 않는 브라우저에서는 쓰지 않는다.
       (class를 JS가 붙이므로 JS가 꺼져 있어도 내용은 그대로 보인다.)
       ========================================================== */
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!reduceMotion && 'IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });

        Array.prototype.forEach.call(document.querySelectorAll('.signature-list li, tbody tr'), function (target) {
            target.classList.add('reveal');
            observer.observe(target);
        });
    }
})();
