(function () {
  if (typeof window.wp === 'undefined' || !window.MyFavoriteBlocksSettings) {
    return;
  }

  const settings = window.MyFavoriteBlocksSettings;
  const wp = window.wp || {};
  const blocks = wp.blocks;
  const domReady = wp.domReady;
  const data = wp.data;
  const favoriteLabels =
    settings.favoriteLabels && typeof settings.favoriteLabels === 'object'
      ? settings.favoriteLabels
      : {};
  const inserterSelectors = {
    toggle: [
      '.block-editor-button-block-appender',
      '.block-editor-inserter__toggle',
      '.block-editor-block-list__insertion-point button',
      '.block-editor-default-block-appender button',
      '.edit-post-header-toolbar__inserter-toggle',
      '.editor-document-tools__inserter-toggle',
    ].join(', '),
    documentToggle:
      '.edit-post-header-toolbar__inserter-toggle, ' +
      '.editor-document-tools__inserter-toggle',
    panel: '.block-editor-inserter__panel-content',
    popover: '.components-popover',
    scope: '.block-editor-inserter__popover, .block-editor-inserter',
    searchArea:
      '.block-editor-inserter__search, ' +
      '.block-editor-inserter__search-input, ' +
      '.components-search-control',
    blockList: '.block-editor-block-types-list',
    quickBlockList:
      '.block-editor-block-types-list[aria-orientation="horizontal"]',
  };

  if (!blocks || !domReady || !data) {
    return;
  }

  // ------------------------------------------
  // VK Block Patterns（PHP から渡されたもの）をマップ化
  // ------------------------------------------
  const vkPatternsMap = {};
  if (Array.isArray(settings.vkPatterns)) {
    settings.vkPatterns.forEach(function (p) {
      if (p && p.name) {
        vkPatternsMap[p.name] = p;
      }
    });
  }

  let openedInserterPoint = null;
  let openedInserterPointTime = 0;

  function copyInsertionPoint(point) {
    if (!point || typeof point.index !== 'number' || point.index < 0) {
      return null;
    }

    return {
      rootClientId: point.rootClientId || null,
      index: point.index,
    };
  }

  function captureInsertionPoint() {
    try {
      const selector = data.select('core/block-editor');
      if (!selector || typeof selector.getBlockInsertionPoint !== 'function') {
        return null;
      }

      return copyInsertionPoint(selector.getBlockInsertionPoint());
    } catch (e) {
      return null;
    }
  }

  function rootsMatch(firstRootClientId, secondRootClientId) {
    return (firstRootClientId || null) === (secondRootClientId || null);
  }

  function captureVisibleInsertionPoint() {
    try {
      const selector = data.select('core/block-editor');
      if (!selector) return null;

      if (typeof selector.isBlockInsertionPointVisible !== 'function') {
        return null;
      }

      if (!selector.isBlockInsertionPointVisible()) {
        return null;
      }

      return captureInsertionPoint();
    } catch (e) {
      return null;
    }
  }

  function getPreferredInsertionPoint() {
    const savedPoint = getRememberedInserterPoint();

    if (savedPoint) {
      return savedPoint;
    }

    const visiblePoint = captureVisibleInsertionPoint();

    if (visiblePoint) {
      return copyInsertionPoint(visiblePoint);
    }

    return captureInsertionPoint();
  }

  function getRememberedInserterPoint() {
    const savedPoint = copyInsertionPoint(openedInserterPoint);
    const savedRecently = Date.now() - openedInserterPointTime < 30000;

    return savedPoint && savedRecently ? savedPoint : null;
  }

  function clearOpenedInserterPoint() {
    openedInserterPoint = null;
    openedInserterPointTime = 0;
  }

  function getInnerBlocksRootFromToggle(toggle, selector) {
    let node = toggle;
    const ownerBody =
      toggle.ownerDocument && toggle.ownerDocument.body
        ? toggle.ownerDocument.body
        : document.body;

    while (node) {
      if (node.matches && node.matches('[data-block]')) {
        const clientId = node.getAttribute('data-block');

        if (clientId && typeof selector.getBlock === 'function') {
          try {
            if (selector.getBlock(clientId)) {
              return clientId;
            }
          } catch (e) {}
        }
      }

      if (node === ownerBody) break;
      node = node.parentElement;
    }

    return null;
  }

  function getBlockListInsertionPointFromToggle(toggle, selector) {
    if (!toggle || typeof toggle.closest !== 'function') return null;

    const blockList = toggle.closest('.block-editor-block-list__layout');
    if (!blockList) return null;

    const ownerBlock = blockList.closest('[data-block]');
    const rootClientId = ownerBlock
      ? ownerBlock.getAttribute('data-block') || null
      : null;

    const order =
      typeof selector.getBlockOrder === 'function'
        ? selector.getBlockOrder(rootClientId || undefined)
        : [];

    if (!Array.isArray(order)) return null;

    const ownerDocument = toggle.ownerDocument || document;
    let index = 0;

    order.some(function (clientId, orderIndex) {
      let blockNode = null;

      try {
        blockNode = ownerDocument.querySelector(
          '[data-block="' + String(clientId).replace(/"/g, '\\"') + '"]'
        );
      } catch (e) {}

      if (!blockNode) return false;

      if (blockNode === toggle || blockNode.contains(toggle)) {
        index = orderIndex;
        return true;
      }

      const relation = blockNode.compareDocumentPosition(toggle);
      if (relation & 4) {
        index = orderIndex + 1;
        return false;
      }

      index = orderIndex;
      return true;
    });

    return copyInsertionPoint({ rootClientId: rootClientId, index: index });
  }

  function getSelectedBlockContextPoint(selector) {
    try {
      if (
        typeof selector.getSelectedBlockClientId !== 'function' ||
        typeof selector.getBlockIndex !== 'function'
      ) {
        return null;
      }

      const selectedId = selector.getSelectedBlockClientId();
      if (!selectedId) return null;

      const rootClientId =
        typeof selector.getBlockRootClientId === 'function'
          ? selector.getBlockRootClientId(selectedId)
          : null;
      const index = selector.getBlockIndex(selectedId, rootClientId || undefined);

      return copyInsertionPoint({
        rootClientId: rootClientId || null,
        index: typeof index === 'number' && index >= 0 ? index + 1 : 0,
      });
    } catch (e) {
      return null;
    }
  }

  function rememberOpenedInserter(event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;

    let toggle = target.closest(inserterSelectors.toggle);
    const visiblePoint = captureVisibleInsertionPoint();

    // WordPress 7.1では非黒色の挿入ポイントがPopover経由で描画され、
    // 従来の内部classに一致しない場合がある。表示中の挿入ポイントを持つ
    // canvas内ボタンであれば、同じインサーター操作として扱う。
    if (!toggle && visiblePoint) {
      const button = target.closest('button');
      if (button && button.ownerDocument !== document) {
        toggle = button;
      }
    }

    if (!toggle) return;

    try {
      const selector = data.select('core/block-editor');
      if (!selector) return;

      const blockListPoint = getBlockListInsertionPointFromToggle(toggle, selector);
      const domRootClientId = getInnerBlocksRootFromToggle(toggle, selector);
      const currentPoint = visiblePoint || captureInsertionPoint();
      const selectedPoint = getSelectedBlockContextPoint(selector);
      const isDocumentInserter = toggle.matches(inserterSelectors.documentToggle);
      const isTrailingAppender = toggle.matches(
        '.block-editor-button-block-appender, ' +
          '.block-editor-default-block-appender button'
      );
      let rootClientId = blockListPoint
        ? blockListPoint.rootClientId
        : domRootClientId;

      // ブロック間の非黒色「＋」はData APIの表示位置が最も正確。
      // 末尾AppenderはDOM上の親ブロックを優先する。
      if (isDocumentInserter) {
        rootClientId = null;
      } else if (!blockListPoint && !isTrailingAppender && visiblePoint) {
        rootClientId = visiblePoint.rootClientId || null;
      }

      const fallbackPoint =
        !rootClientId &&
        !isDocumentInserter &&
        selectedPoint &&
        selectedPoint.rootClientId
          ? selectedPoint
          : currentPoint;
      const effectiveRootClientId = isDocumentInserter
        ? null
        : rootClientId || (fallbackPoint && fallbackPoint.rootClientId) || null;
      let index = null;

      // WordPress 7.1の非黒色「＋」は、Data APIの挿入キューが
      // トップレベルへ戻る場合がある。クリック元のBlockListを優先する。
      if (blockListPoint) {
        index = blockListPoint.index;
      }

      // ブロック間の「＋」ではData APIが持つ正確なindexを使う。
      // DOMから判定したInnerBlocksと同じrootの場合だけ採用する。
      if (
        typeof index !== 'number' &&
        currentPoint &&
        rootsMatch(currentPoint.rootClientId, effectiveRootClientId)
      ) {
        index = currentPoint.index;
      }

      if (
        typeof index !== 'number' &&
        fallbackPoint &&
        rootsMatch(fallbackPoint.rootClientId, effectiveRootClientId)
      ) {
        index = fallbackPoint.index;
      }

      // ButtonBlockAppenderは、そのInnerBlocks領域の末尾を表す。
      if (
        typeof index !== 'number' &&
        typeof selector.getBlockCount === 'function'
      ) {
        index = selector.getBlockCount(effectiveRootClientId || undefined);
      }

      openedInserterPoint = copyInsertionPoint({
        rootClientId: effectiveRootClientId,
        index:
          typeof index === 'number'
            ? index
            : currentPoint && typeof currentPoint.index === 'number'
              ? currentPoint.index
              : 0,
      });
      openedInserterPointTime = Date.now();
    } catch (e) {}
  }

  function canInsertBlocksAt(selector, blocksArray, rootClientId) {
    try {
      if (typeof selector.canInsertBlockType === 'function') {
        return blocksArray.every(function (block) {
          return (
            block &&
            block.name &&
            selector.canInsertBlockType(block.name, rootClientId || undefined) !== false
          );
        });
      }
    } catch (e) {
      return false;
    }

    return true;
  }

  function getInsertionTarget(selector, blocksArray, preferredPoint) {
    const savedPoint = copyInsertionPoint(preferredPoint);

    // 1) 実際に開いたインサーターの位置。挿入禁止なら外側へ逃がさない。
    if (savedPoint) {
      const canInsert = canInsertBlocksAt(
        selector,
        blocksArray,
        savedPoint.rootClientId
      );
      if (canInsert) {
        return savedPoint;
      }

      // 実際に押した「＋」の位置で挿入できない場合、別階層へ逃がさない。
      return null;
    }

    const selectedId =
      typeof selector.getSelectedBlockClientId === 'function'
        ? selector.getSelectedBlockClientId()
        : null;

    // 2) 選択中ブロックに、Data APIへ登録されたInnerBlocks領域がある場合。
    if (selectedId && typeof selector.getBlockListSettings === 'function') {
      try {
        const listSettings = selector.getBlockListSettings(selectedId);
        if (typeof listSettings !== 'undefined') {
          const innerCount =
            typeof selector.getBlockCount === 'function'
              ? selector.getBlockCount(selectedId)
              : typeof selector.getBlockOrder === 'function'
                ? selector.getBlockOrder(selectedId).length
                : 0;

          if (canInsertBlocksAt(selector, blocksArray, selectedId)) {
            return { rootClientId: selectedId, index: innerCount };
          }
        }
      } catch (e) {}
    }

    // 3) 選択中ブロックと同じ親階層で、その直後。
    if (selectedId && typeof selector.getBlockIndex === 'function') {
      try {
        const rootClientId =
          typeof selector.getBlockRootClientId === 'function'
            ? selector.getBlockRootClientId(selectedId)
            : null;
        const indexInRoot = selector.getBlockIndex(selectedId, rootClientId || undefined);

        if (
          typeof indexInRoot === 'number' &&
          indexInRoot >= 0 &&
          canInsertBlocksAt(selector, blocksArray, rootClientId)
        ) {
          return { rootClientId: rootClientId || null, index: indexInRoot + 1 };
        }
      } catch (e) {}
    }

    // 4) 最終フォールバックはトップレベル。ただし挿入可能な場合だけ。
    if (canInsertBlocksAt(selector, blocksArray, null)) {
      const topLevelIndex =
        typeof selector.getBlockCount === 'function'
          ? selector.getBlockCount()
          : typeof selector.getBlockOrder === 'function'
            ? selector.getBlockOrder().length
            : undefined;

      return {
        rootClientId: null,
        index: typeof topLevelIndex === 'number' ? topLevelIndex : undefined,
      };
    }

    return null;
  }

  // --------------------------------------------------
  // 保存済み挿入ポイントから共通ルールで挿入先を決める
  // --------------------------------------------------
  function insertAtCurrentPosition(blocksToInsert, preferredPoint) {
    const selector = data.select('core/block-editor');
    const dispatcher = data.dispatch('core/block-editor');

    if (!selector || !dispatcher || typeof dispatcher.insertBlocks !== 'function') {
      return false;
    }

    const blocksArray = Array.isArray(blocksToInsert)
      ? blocksToInsert
      : [blocksToInsert];

    const target = getInsertionTarget(selector, blocksArray, preferredPoint);
    if (!target) return false;

    try {
      dispatcher.insertBlocks(blocksArray, target.index, target.rootClientId || undefined);
      return true;
    } catch (e) {
      return false;
    }
  }

  // --------------------------------------------------
  // 空段落なら置き換え / それ以外は共通の挿入先へ
  // --------------------------------------------------
  function insertBlocksSmart(blocksToInsert, preferredPoint) {
    const selector = data.select('core/block-editor');
    const dispatcher = data.dispatch('core/block-editor');

    if (!selector || !dispatcher || typeof dispatcher.insertBlocks !== 'function') {
      return false;
    }

    const blocksArray = Array.isArray(blocksToInsert)
      ? blocksToInsert
      : [blocksToInsert];

    const selectedId =
      typeof selector.getSelectedBlockClientId === 'function'
        ? selector.getSelectedBlockClientId()
        : null;

    const selectedBlock =
      selectedId && typeof selector.getBlock === 'function'
        ? selector.getBlock(selectedId)
        : null;

    // 1) 空の段落なら置き換え
    if (selectedBlock && selectedBlock.name === 'core/paragraph') {
      const content = (selectedBlock.attributes && selectedBlock.attributes.content) || '';
      const hasInner =
        Array.isArray(selectedBlock.innerBlocks) && selectedBlock.innerBlocks.length > 0;

      if (!hasInner && !content.replace(/&nbsp;/gi, ' ').trim()) {
        const rootClientId =
          typeof selector.getBlockRootClientId === 'function'
            ? selector.getBlockRootClientId(selectedId)
            : null;
        const selectedIndex =
          typeof selector.getBlockIndex === 'function'
            ? selector.getBlockIndex(selectedId, rootClientId || undefined)
            : -1;
        const savedPoint = copyInsertionPoint(preferredPoint);
        const pointsAtSelectedParagraph =
          !savedPoint ||
          (rootsMatch(savedPoint.rootClientId, rootClientId) &&
            savedPoint.index === selectedIndex + 1);

        if (
          pointsAtSelectedParagraph &&
          canInsertBlocksAt(selector, blocksArray, rootClientId)
        ) {
          dispatcher.replaceBlocks(selectedId, blocksArray);
          return true;
        }
      }
    }

    return insertAtCurrentPosition(blocksArray, preferredPoint);
  }

  // 最後の保険も、通常挿入と同じ保存済み挿入先を使う。
  function insertFallbackParagraph(preferredPoint) {
    try {
      const paragraph = blocks.createBlock('core/paragraph', { content: '' });
      return paragraph ? insertBlocksSmart(paragraph, preferredPoint) : false;
    } catch (e) {
      return false;
    }
  }

  function createFavoriteBlock(blockName) {
    try {
      const blockTypesSelector = data.select('core/blocks');
      const defaultVariation =
        blockTypesSelector &&
        typeof blockTypesSelector.getDefaultBlockVariation === 'function'
          ? blockTypesSelector.getDefaultBlockVariation(blockName, 'inserter')
          : null;
      const variationScope =
        defaultVariation && Array.isArray(defaultVariation.scope)
          ? defaultVariation.scope
          : ['block', 'inserter'];
      const shouldApplyVariation =
        defaultVariation &&
        defaultVariation.isDefault === true &&
        variationScope.indexOf('inserter') !== -1;

      if (!shouldApplyVariation) {
        return blocks.createBlock(blockName);
      }

      const innerBlocks =
        Array.isArray(defaultVariation.innerBlocks) &&
        typeof blocks.createBlocksFromInnerBlocksTemplate === 'function'
          ? blocks.createBlocksFromInnerBlocksTemplate(defaultVariation.innerBlocks)
          : [];

      return blocks.createBlock(
        blockName,
        defaultVariation.attributes || {},
        innerBlocks
      );
    } catch (e) {
      return blocks.createBlock(blockName);
    }
  }

  // ------------------------------------------
  // 検索ボックス右側に「無反応時段落」ボタンを追加
  // ------------------------------------------
  function getInserterScope(panel) {
    return (
      panel.closest(inserterSelectors.scope) ||
      panel.parentElement ||
      panel
    );
  }

  function getInserterSearchArea(panel) {
    if (!panel) return null;
    return getInserterScope(panel).querySelector(inserterSelectors.searchArea);
  }

  function getInserterSearchInput(panel) {
    if (!panel) return null;

    const searchArea = getInserterSearchArea(panel);

    if (!searchArea) return null;

    return (
      searchArea.querySelector('input.components-search-control__input') ||
      searchArea.querySelector('input[type="search"]') ||
      searchArea.querySelector('input')
    );
  }

  function addEmergencyParagraphButton(panel, initialInsertionPoint) {
    if (!panel || panel.dataset.mfbEmergencyPara === '1') return;

    // パネル周辺（ポップアップ全体）から検索エリアを探す
    const searchArea = getInserterSearchArea(panel);

    if (!searchArea) return;

    const input = getInserterSearchInput(panel);

    if (!input) return;

    // 既に追加済みなら何もしない
    if (searchArea.querySelector('.mfb-quick-chip-holder')) {
      panel.dataset.mfbEmergencyPara = '1';
      return;
    }

    // 右側に置くのでパディングを確保（必要なら後で調整）
    try {
      const prevPaddingRight = parseInt(window.getComputedStyle(input).paddingRight || '0', 10);
      if (!Number.isNaN(prevPaddingRight) && prevPaddingRight < 160) {
        input.style.paddingRight = '160px';
      }
    } catch (e) {
      input.style.paddingRight = '160px';
    }

    searchArea.style.position = searchArea.style.position || 'relative';

    const holder = document.createElement('div');
    holder.className = 'mfb-quick-chip-holder';
    holder.style.position = 'absolute';
    holder.style.right = '8px';
    holder.style.top = '50%';
    holder.style.transform = 'translateY(-50%)';
    holder.style.display = 'flex';
    holder.style.gap = '6px';
    holder.style.zIndex = '9999';

    const paraBtn = document.createElement('button');
    paraBtn.type = 'button';
    paraBtn.className = 'components-button is-small mfb-quick-chip';
    paraBtn.textContent = '無反応時段落';
    paraBtn.title = 'ブロックが追加できない時の緊急用段落';

    paraBtn.style.padding = '2px 10px';
    paraBtn.style.minHeight = '24px';
    paraBtn.style.lineHeight = '1.2';
    paraBtn.style.borderRadius = '999px';
    paraBtn.style.whiteSpace = 'nowrap';
    paraBtn.style.backgroundColor = '#999';
    paraBtn.style.color = '#fff';
    paraBtn.style.border = 'none';

    let buttonInsertionPoint = copyInsertionPoint(initialInsertionPoint);

    paraBtn.addEventListener('mouseenter', function () {
      paraBtn.style.backgroundColor = '#333';
    });

    paraBtn.addEventListener('mouseleave', function () {
      paraBtn.style.backgroundColor = '#000';
    });

    paraBtn.addEventListener(
      'pointerdown',
      function () {
        buttonInsertionPoint =
          getRememberedInserterPoint() ||
          captureVisibleInsertionPoint() ||
          buttonInsertionPoint;
      },
      true
    );

    paraBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const insertionPoint =
        getRememberedInserterPoint() || buttonInsertionPoint;
      insertFallbackParagraph(insertionPoint);
      clearOpenedInserterPoint();
    });

    holder.appendChild(paraBtn);
    searchArea.appendChild(holder);

    panel.dataset.mfbEmergencyPara = '1';
  }

  domReady(function () {
    if (!settings.enabled) return;

    const favorites = Array.isArray(settings.favoriteBlocks)
      ? settings.favoriteBlocks.slice()
      : [];

    if (!favorites.length) return;

    const limit = parseInt(settings.limit || favorites.length, 10) || favorites.length;
    const columns = parseInt(settings.columns || 4, 10) || 4;

    // ------------------------------------------
    // お気に入りグリッドを生成
    // ------------------------------------------
    function createGridElement(initialInsertionPoint) {
      const wrapper = document.createElement('div');
      wrapper.className = 'my-favorite-blocks-grid';
      wrapper.style.gridTemplateColumns = 'repeat(' + columns + ', minmax(0, 1fr))';

      let count = 0;
      let gridInsertionPoint = copyInsertionPoint(initialInsertionPoint);

      favorites.forEach(function (name) {
        if (count >= limit) return;

        let isPattern = false;
        let label = name;
        let patternContent = '';

        // 1) 通常ブロック
        const blockType =
          blocks.getBlockType && typeof blocks.getBlockType === 'function'
            ? blocks.getBlockType(name)
            : null;

        if (blockType) {
          label = favoriteLabels[name] || blockType.title || name;
        } else if (vkPatternsMap[name]) {
          // 2) VK Block Patterns
          isPattern = true;
          const p = vkPatternsMap[name];
          label = favoriteLabels[name] || p.title || name;
          patternContent = p.content || '';
        } else {
          return; // 見つからなければスキップ
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'components-button my-favorite-blocks-item';
        btn.textContent = label;

        // clickでフォーカスが移る前に、開いたインサーターの位置を保存する。
        btn.addEventListener(
          'pointerdown',
          function () {
            // WordPress 7.1はクイックインサーターのDOMを再利用するため、
            // グリッド生成時ではなく、選択の直前に最新の開いた位置へ更新する。
            gridInsertionPoint =
              getRememberedInserterPoint() ||
              captureVisibleInsertionPoint() ||
              gridInsertionPoint;
          },
          true
        );

        btn.addEventListener('click', function () {
          const insertionPoint =
            getRememberedInserterPoint() || copyInsertionPoint(gridInsertionPoint);

          try {
            // -----------------------------
            // VK パターン
            // -----------------------------
            if (isPattern) {
              if (!patternContent) {
                insertFallbackParagraph(insertionPoint);
                return;
              }

              const content = patternContent || '';
              let inserted = false;

              // ブロックコメント（<!-- wp:）が無い = ただのHTML と判断
              if (content.indexOf('<!-- wp:') === -1) {
                const text = content
                  .replace(/<script[\s\S]*?<\/script>/gi, '')
                  .replace(/<style[\s\S]*?<\/style>/gi, '')
                  .replace(/<br\s*\/?>/gi, '\n')
                  .replace(/<\/p>/gi, '\n')
                  .replace(/<[^>]+>/g, '')
                  .replace(/&nbsp;/gi, ' ')
                  .trim();

                const paragraph = blocks.createBlock('core/paragraph', {
                  content: text,
                });

                if (paragraph) {
                  inserted = insertBlocksSmart(paragraph, insertionPoint);
                }
              } else {
                // ブロック構文付きパターンは parse してそのまま挿入
                const parsed = blocks.parse(content);
                if (parsed && parsed.length) {
                  inserted = insertBlocksSmart(parsed, insertionPoint);
                }
              }

              // ここまで何も挿入できなかった場合 → 空段落だけでも入れる
              if (!inserted) {
                insertFallbackParagraph(insertionPoint);
              }

              return;
            }

            // -----------------------------
            // 通常ブロック
            // -----------------------------
            const newBlock = createFavoriteBlock(name);
            if (newBlock) {
              insertBlocksSmart(newBlock, insertionPoint);
            } else {
              insertFallbackParagraph(insertionPoint);
            }
          } catch (e) {
            insertFallbackParagraph(insertionPoint);
          } finally {
            clearOpenedInserterPoint();
          }
        });

        wrapper.appendChild(btn);
        count++;
      });

      if (!wrapper.childNodes.length) {
        const p = document.createElement('p');
        p.className = 'my-favorite-blocks-empty';
        p.textContent =
          'お気に入りに登録したブロック / パターンが見つかりません。設定画面を確認してください。';
        wrapper.appendChild(p);
      }

      return wrapper;
    }

    // ------------------------------------------
    // Gutenberg の + パネルを書き換え
    // ------------------------------------------
    function isQuickInserterPanel(panel) {
      // 「すべてのブロックを表示」で開く左サイドバーにも同じ
      // panel-contentがあるため、＋から開くポップオーバー内だけを対象にする。
      return Boolean(
        panel &&
          typeof panel.closest === 'function' &&
          panel.closest(inserterSelectors.popover)
      );
    }

    function syncQuickInserterSearch(panel) {
      if (!panel || !isQuickInserterPanel(panel)) return;

      const input = getInserterSearchInput(panel);
      const grid = panel.querySelector('.my-favorite-blocks-grid');
      const isSearching = Boolean(input && input.value.trim());

      if (grid) {
        grid.style.display = isSearching ? 'none' : '';
      }

      panel
        .querySelectorAll(inserterSelectors.blockList)
        .forEach(function (blockList) {
          if (isSearching) {
            blockList.style.display = '';
            blockList.removeAttribute('aria-hidden');
          } else if (blockList.getAttribute('aria-orientation') === 'horizontal') {
            blockList.style.display = 'none';
            blockList.setAttribute('aria-hidden', 'true');
          }
        });

      const scope = getInserterScope(panel);
      const emergencyButton = scope.querySelector('.mfb-quick-chip-holder');
      if (emergencyButton) {
        emergencyButton.style.display = isSearching ? 'none' : 'flex';
      }
    }

    function enableQuickInserterSearch(panel) {
      const input = getInserterSearchInput(panel);
      if (!input || input.dataset.mfbSearchListener === '1') return;

      input.dataset.mfbSearchListener = '1';
      input.addEventListener('input', function () {
        // Gutenbergの検索結果再描画後に表示を切り替える。
        window.setTimeout(function () {
          syncQuickInserterSearch(panel);
        }, 0);
      });
    }

    function applyToPanels(root) {
      if (!root) return;

      const panels = [];
      if (root.closest) {
        const containingPanel = root.closest(inserterSelectors.panel);
        if (containingPanel) panels.push(containingPanel);
      }
      if (
        root.matches &&
        root.matches(inserterSelectors.panel)
      ) {
        panels.push(root);
      }
      if (root.querySelectorAll) {
        root
          .querySelectorAll(inserterSelectors.panel)
          .forEach(function (panel) {
            panels.push(panel);
          });
      }

      panels.forEach(function (panel) {
        if (!isQuickInserterPanel(panel)) return;
        if (panel.dataset.mfbApplied === '1') {
          syncQuickInserterSearch(panel);
          return;
        }

        const quickList = panel.querySelector(inserterSelectors.quickBlockList);

        if (!quickList) return;

        panel.dataset.mfbApplied = '1';

        // DOMを書き換える前に、このパネルを開いた挿入位置を保存する。
        const panelInsertionPoint = getPreferredInsertionPoint();

        // 元の「最近使ったブロック」を隠す
        quickList.style.display = 'none';
        quickList.setAttribute('aria-hidden', 'true');

        // 代わりにお気に入りグリッドを挿入
        const grid = createGridElement(panelInsertionPoint);
        panel.insertBefore(grid, quickList);

        // 検索ボックス右に「無反応時段落」ボタンを追加
        addEmergencyParagraphButton(panel, panelInsertionPoint);
        enableQuickInserterSearch(panel);
        syncQuickInserterSearch(panel);
      });
    }

    const observedDocuments = new WeakSet();
    const observedIframes = new WeakSet();
    const observedIframeDocuments = new WeakMap();

    function observeIframe(iframe) {
      if (!iframe) return;

      function observeContentDocument() {
        try {
          const editorDocument = iframe.contentDocument;
          if (!editorDocument || !editorDocument.body) return;
          if (observedIframeDocuments.get(iframe) === editorDocument) return;

          observedIframeDocuments.set(iframe, editorDocument);
          observeEditorDocument(editorDocument);
        } catch (e) {}
      }

      if (!observedIframes.has(iframe)) {
        observedIframes.add(iframe);
        iframe.addEventListener('load', observeContentDocument);
      }

      observeContentDocument();
    }

    function findAndObserveIframes(root) {
      if (!root) return;

      if (root.matches && root.matches('iframe')) {
        observeIframe(root);
      }
      if (root.querySelectorAll) {
        root.querySelectorAll('iframe').forEach(observeIframe);
      }
    }

    function observeEditorDocument(editorDocument) {
      if (
        !editorDocument ||
        !editorDocument.body ||
        observedDocuments.has(editorDocument)
      ) {
        return;
      }

      observedDocuments.add(editorDocument);
      // Gutenbergがフォーカスや一時的な挿入位置を変更する前に保持する。
      editorDocument.addEventListener('pointerdown', rememberOpenedInserter, true);
      editorDocument.addEventListener(
        'keydown',
        function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            rememberOpenedInserter(event);
          }
        },
        true
      );
      applyToPanels(editorDocument);
      findAndObserveIframes(editorDocument);

      const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          mutation.addedNodes.forEach(function (node) {
            if (!node || node.nodeType !== 1) return;
            applyToPanels(node);
            findAndObserveIframes(node);
          });
        });
      });

      observer.observe(editorDocument.body, {
        childList: true,
        subtree: true,
      });
    }

    // 親画面と同一オリジンの編集キャンバスiframeを両方監視する。
    observeEditorDocument(document);

    // WordPress 7.1は同じiframe要素のcontentDocumentだけを交換する場合がある。
    // iframe要素の追加/loadを取り逃しても、新しいdocumentへ監視を再接続する。
    window.setInterval(function () {
      findAndObserveIframes(document);
    }, 1000);
  });
})();
