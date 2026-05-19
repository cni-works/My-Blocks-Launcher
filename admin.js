(function ($) {
  $(function () {
    var $form = $('#my-favorite-blocks-form');
    if (!$form.length) return;

    var $preview = $('#mfb-favorite-preview');
    var $orderInput = $('#mfb-favorite-order');

    function getLimit() {
      var v = parseInt($('#mfb-limit').val(), 10);
      if (!v || v < 1) v = 1;
      return v;
    }

    function countChecked() {
      return $form.find('.mfb-favorite-checkbox:checked').length;
    }

    // プレビューを「保存された順番」に合わせて組み立てる
function rebuildPreview() {
  $preview.empty();

  // いま保存されている順番（カンマ区切り）
  var orderStr = $orderInput.val() || '';
  var order = orderStr
    .split(',')
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return !!s;
    });

  // チェックされている項目をマップ化
  var checkedMap = {};
  $form.find('.mfb-favorite-checkbox:checked').each(function () {
    var $cb    = $(this);
    var name   = $cb.val();
    var $label = $cb.closest('.my-favorite-blocks-item');
    var title  = $label.find('.mfb-item-title').text() || name;

    checkedMap[name] = { title: title };
  });

  var names = [];

  function appendItem(name, info) {
    var $li = $('<li>')
      .attr('data-name', name)
      .append(
        $('<strong>').text(info.title),
        $('<span class="mfb-preview-name">').text(name),
        $('<button type="button" class="mfb-preview-remove">×</button>')
      );

    $preview.append($li);
    names.push(name);
  }

  // 1. hidden の order に載っているものをその順で並べる
  order.forEach(function (name) {
    if (!checkedMap[name]) return;
    appendItem(name, checkedMap[name]);
    delete checkedMap[name];
  });

  // 2. order に無い「新しくチェックされたもの」を後ろに追加
  $form.find('.mfb-favorite-checkbox:checked').each(function () {
    var name = $(this).val();
    if (!checkedMap[name]) return;
    appendItem(name, checkedMap[name]);
    delete checkedMap[name];
  });

  if (!names.length) {
    var $p = $('<p class="mfb-preview-empty">').text(
      'まだお気に入りが選択されていません。下の一覧からチェックしてください。'
    );
    $preview.append($p);
  }

  // 最終的な順番を hidden にも反映（ドラッグ＆削除後用）
  $orderInput.val(names.join(','));
  // ▼ 表示カラム数の設定とプレビューを連動させる（最後に入れる）
  var columns = parseInt($('#mfb-columns').val(), 10);
  if (!columns || columns < 1) {
    columns = 4; // デフォルト
  }

  // ▼ カラム数に応じてプレビューの最大幅を変える
  var maxWidth = '100%';

  if (columns === 3) {
    maxWidth = '50%';
  } else if (columns === 2) {
    maxWidth = '30%';
  } else if (columns === 1) {
    maxWidth = '20%';
  }
  // 4カラム以上は 100% のまま

  $preview.css({
    display: 'grid',
    gridTemplateColumns: 'repeat(' + columns + ', minmax(0, 1fr))',
    gap: '8px',
    maxWidth: maxWidth,
  });
}

    // ソートで並べ替えた時に hidden を更新
    function updateOrderFromPreview() {
      var names = [];
      $preview.find('li[data-name]').each(function () {
        names.push($(this).attr('data-name'));
      });
      $orderInput.val(names.join(','));
    }

    // ドラッグ＆ドロップで並び替え
    $preview.sortable({
      items: 'li',
      update: function () {
        updateOrderFromPreview();
      },
    });

    // プレビュー側の × ボタンで削除
    $preview.on('click', '.mfb-preview-remove', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var $li = $(this).closest('li');
      var name = $li.attr('data-name');

      // 対応するチェックボックスを OFF
      $form
        .find(
          '.mfb-favorite-checkbox[value="' +
            name.replace(/"/g, '\\"') +
            '"]'
        )
        .prop('checked', false);

      rebuildPreview();
    });

    // チェック状態が変わった時
    $form.on('change', '.mfb-favorite-checkbox', function () {
      var limit = getLimit();
      var checkedCount = countChecked();

      if (checkedCount > limit && this.checked) {
        alert(
          '表示上限数（' +
            limit +
            '）を超えて選択することはできません。上限を増やすか、別の項目のチェックを外してください。'
        );
        this.checked = false;
        return;
      }

      rebuildPreview();
    });

    // 「すべてのチェックを外す」
    $('#mfb-clear-all').on('click', function (e) {
      e.preventDefault();
      if (!window.confirm('すべてのチェックを外しますか？')) {
        return;
      }
      $form.find('.mfb-favorite-checkbox').prop('checked', false);
      rebuildPreview();
    });

    // 初期表示：PHP から埋め込まれた my_favorite_blocks_order を元に並び替え
    rebuildPreview();
  });
})(jQuery);
