(function () {
  if (typeof window.wp === 'undefined' || !window.MyFavoriteBlocksSettings) {
    return;
  }

  const settings = window.MyFavoriteBlocksSettings;
  const wp = window.wp || {};
  const blocks = wp.blocks;
  const domReady = wp.domReady;
  const data = wp.data;

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

  // ------------------------------------------
  // 最後の保険：空段落を1つ入れる
  // ------------------------------------------
  function insertFallbackParagraph() {
    try {
      const dispatcher = data.dispatch('core/block-editor');
      if (!dispatcher || typeof dispatcher.insertBlocks !== 'function') return;

      const p = blocks.createBlock('core/paragraph', { content: '' });
      if (p) dispatcher.insertBlocks(p);
    } catch (e) {}
  }

  // --------------------------------------------------
  // できるだけ「挿入ポイント（+の場所）」へ挿入する
  // 取れない/失敗する場合は「選択ブロック直後」→「とにかくinsert」
  // --------------------------------------------------
  function insertAtCurrentPosition(blocksToInsert) {
    const selector = data.select('core/block-editor');
    const dispatcher = data.dispatch('core/block-editor');

    if (!selector || !dispatcher || typeof dispatcher.insertBlocks !== 'function') {
      return;
    }

    const blocksArray = Array.isArray(blocksToInsert)
      ? blocksToInsert
      : [blocksToInsert];

    // A) まずは「+ボタンの挿入ポイント」
    try {
      if (typeof selector.getBlockInsertionPoint === 'function') {
        const point = selector.getBlockInsertionPoint();
        if (point && typeof point.index === 'number') {
          dispatcher.insertBlocks(blocksArray, point.index, point.rootClientId);
          return;
        }
      }
    } catch (e) {}

    // B) 次に「選択中ブロックの直後」
    try {
      const selectedId =
        typeof selector.getSelectedBlockClientId === 'function'
          ? selector.getSelectedBlockClientId()
          : null;

      if (selectedId && typeof selector.getBlockIndex === 'function') {
        const rootClientId =
          typeof selector.getBlockRootClientId === 'function'
            ? selector.getBlockRootClientId(selectedId)
            : null;

        const indexInRoot = selector.getBlockIndex(selectedId, rootClientId || undefined);
        if (typeof indexInRoot === 'number') {
          dispatcher.insertBlocks(blocksArray, indexInRoot + 1, rootClientId || undefined);
          return;
        }
      }
    } catch (e) {}

    // C) 最後：とにかく挿入（無反応を防ぐ）
    try {
      dispatcher.insertBlocks(blocksArray);
    } catch (e) {}
  }

  // --------------------------------------------------
  // 空段落なら置き換え / 空カラムなら中へ / それ以外は挿入ポイントへ
  // --------------------------------------------------
  function insertBlocksSmart(blocksToInsert) {
    const selector = data.select('core/block-editor');
    const dispatcher = data.dispatch('core/block-editor');

    if (!selector || !dispatcher || typeof dispatcher.insertBlocks !== 'function') {
      return;
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
        dispatcher.replaceBlocks(selectedId, blocksArray);
        return;
      }
    }

    // 2) column が選択中なら、その中へ
    if (selectedBlock && selectedBlock.name === 'core/column') {
      const innerCount = Array.isArray(selectedBlock.innerBlocks)
        ? selectedBlock.innerBlocks.length
        : 0;

      dispatcher.insertBlocks(blocksArray, innerCount, selectedId);
      return;
    }

    // 3) それ以外は挿入ポイントへ
    insertAtCurrentPosition(blocksArray);
  }

  // ------------------------------------------
  // 検索ボックス右側に「無反応時段落」ボタンを追加
  // ※ 検索入力での絞り込みは環境差が大きいので行わない
  // ------------------------------------------
  function addEmergencyParagraphButton(panel) {
    if (!panel || panel.dataset.mfbEmergencyPara === '1') return;

    // パネル周辺（ポップアップ全体）から検索エリアを探す
    const scope =
      panel.closest('.block-editor-inserter__popover') ||
      panel.closest('.block-editor-inserter') ||
      panel.parentElement ||
      panel;

    const searchArea =
      scope.querySelector('.block-editor-inserter__search') ||
      scope.querySelector('.block-editor-inserter__search-input') ||
      scope.querySelector('.components-search-control');

    if (!searchArea) return;

    const input =
      searchArea.querySelector('input.components-search-control__input') ||
      searchArea.querySelector('input[type="search"]') ||
      searchArea.querySelector('input');

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

    paraBtn.addEventListener('mouseenter', function () {
      paraBtn.style.backgroundColor = '#333';
    });

    paraBtn.addEventListener('mouseleave', function () {
      paraBtn.style.backgroundColor = '#000';
    });

    // 入れ子コンテナ優先 → 選択ブロック直後 → 最後の保険
    paraBtn.addEventListener(
      'pointerdown',
      function (e) {
        e.preventDefault();
        e.stopPropagation();

        try {
          const selector = data.select('core/block-editor');
          const dispatcher = data.dispatch('core/block-editor');
          if (!selector || !dispatcher || typeof dispatcher.insertBlocks !== 'function') {
            return;
          }

          const p = blocks.createBlock('core/paragraph', { content: '' });
          const selectedId =
            typeof selector.getSelectedBlockClientId === 'function'
              ? selector.getSelectedBlockClientId()
              : null;

          // ① 選択中が入れ子コンテナなら「その中」へ
          if (selectedId && typeof selector.getBlock === 'function') {
            const selectedBlock = selector.getBlock(selectedId);
            if (selectedBlock && Array.isArray(selectedBlock.innerBlocks)) {
              const innerCount = selectedBlock.innerBlocks.length;
              dispatcher.insertBlocks([p], innerCount, selectedId);
              return;
            }
          }

          // ② 選択ブロックの直後へ
          if (selectedId && typeof selector.getBlockIndex === 'function') {
            const rootClientId =
              typeof selector.getBlockRootClientId === 'function'
                ? selector.getBlockRootClientId(selectedId)
                : null;

            const indexInRoot = selector.getBlockIndex(selectedId, rootClientId || undefined);
            if (typeof indexInRoot === 'number') {
              dispatcher.insertBlocks([p], indexInRoot + 1, rootClientId || undefined);
              return;
            }
          }

          // ③ 最後の保険：通常挿入
          dispatcher.insertBlocks([p]);
        } catch (err) {
          insertFallbackParagraph();
        }
      },
      true
    );

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
    function createGridElement() {
      const wrapper = document.createElement('div');
      wrapper.className = 'my-favorite-blocks-grid';
      wrapper.style.gridTemplateColumns = 'repeat(' + columns + ', minmax(0, 1fr))';

      let count = 0;

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
          label = blockType.title || name;
        } else if (vkPatternsMap[name]) {
          // 2) VK Block Patterns
          isPattern = true;
          const p = vkPatternsMap[name];
          label = p.title || name;
          patternContent = p.content || '';
        } else {
          return; // 見つからなければスキップ
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'components-button my-favorite-blocks-item';
        btn.textContent = label;

        btn.addEventListener('click', function () {
          try {
            // -----------------------------
            // VK パターン
            // -----------------------------
            if (isPattern) {
              if (!patternContent) {
                insertFallbackParagraph();
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
                  insertBlocksSmart(paragraph);
                  inserted = true;
                }
              } else {
                // ブロック構文付きパターンは parse してそのまま挿入
                const parsed = blocks.parse(content);
                if (parsed && parsed.length) {
                  insertBlocksSmart(parsed);
                  inserted = true;
                }
              }

              // ここまで何も挿入できなかった場合 → 空段落だけでも入れる
              if (!inserted) {
                insertFallbackParagraph();
              }

              return;
            }

            // -----------------------------
            // 通常ブロック
            // -----------------------------
            const newBlock = blocks.createBlock(name);
            if (newBlock) {
              insertBlocksSmart(newBlock);
            } else {
              insertFallbackParagraph();
            }
          } catch (e) {
            insertFallbackParagraph();
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
    function applyToPanels(root) {
      if (!root || !root.querySelectorAll) return;

      const panels = root.querySelectorAll('.block-editor-inserter__panel-content');

      panels.forEach(function (panel) {
        if (panel.dataset.mfbApplied === '1') return;

        const quickList = panel.querySelector(
          '.block-editor-block-types-list[aria-orientation="horizontal"]'
        );

        if (!quickList) return;

        panel.dataset.mfbApplied = '1';

        // 元の「最近使ったブロック」を隠す
        quickList.style.display = 'none';
        quickList.setAttribute('aria-hidden', 'true');

        // 代わりにお気に入りグリッドを挿入
        const grid = createGridElement();
        panel.insertBefore(grid, quickList);

        // 検索ボックス右に「無反応時段落」ボタンを追加
        addEmergencyParagraphButton(panel);
      });
    }

    // 初期適用
    applyToPanels(document);

    // 動的に開かれたインサーターにも適用
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!(node instanceof HTMLElement)) return;
          applyToPanels(node);
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
})();
