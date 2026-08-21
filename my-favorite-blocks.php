<?php
/**
 * Plugin Name: My Blocks Launcher
 * Description:ブロック追加ボタンの「最近使ったブロック」エリアを、自分で選んだお気に入りブロックだけに置き換え、ブロック挿入作業を高速化するプラグインです。各種テーマ・ブロック拡張プラグイン・VK Block Patternsにも対応しています。
 * Version: 1.4.17
 * Requires at least: 6.1
 * Author: Oishi Naoto
 * Text Domain: my-favorite-blocks
 * License: GPL v2 or later
 * Update URI: https://github.com/cni-works/My-Blocks-Launcher
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

$my_blocks_launcher_updater_file = __DIR__ . '/includes/updater/class-github-release-updater.php';

if ( is_readable( $my_blocks_launcher_updater_file ) ) {
    require_once $my_blocks_launcher_updater_file;

    $my_blocks_launcher_headers = get_file_data(
        __FILE__,
        array(
            'version'    => 'Version',
            'update_uri' => 'Update URI',
        ),
        'plugin'
    );

    new \CniWorks\MyBlocksLauncher\Updater\GitHub_Release_Updater(
        array(
            'type'          => 'plugin',
            'owner'         => 'cni-works',
            'repository'    => 'My-Blocks-Launcher',
            'slug'          => 'My-Blocks-Launcher',
            'plugin_file'   => plugin_basename( __FILE__ ),
            'version'       => $my_blocks_launcher_headers['version'],
            'update_uri'    => $my_blocks_launcher_headers['update_uri'],
            'requires'      => '6.1',
            'cache_hours'   => 12,
            'failure_hours' => 1,
            'timeout'       => 5,
        )
    );
}

class My_Favorite_Blocks_Plugin {

    const OPTION_KEY = 'my_favorite_blocks_options';

    public function __construct() {
        add_action( 'admin_menu', array( $this, 'add_settings_page' ) );
        add_action( 'admin_init', array( $this, 'register_settings' ) );

        add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue_editor_assets' ) );
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
    }

    public function get_default_options() {
        return array(
            'enabled'         => 1,
            'columns'         => 4,
            'limit'           => 12,
            'favorite_blocks' => array(
                'core/paragraph',
                'core/heading',
                'core/image',
                'core/gallery',
                'core/list',
            ),
            'favorite_labels' => array(),
        );
    }

    public function get_options() {
        $defaults = $this->get_default_options();
        $options  = get_option( self::OPTION_KEY, array() );

        if ( ! is_array( $options ) ) {
            $options = array();
        }

        $options = wp_parse_args( $options, $defaults );

        $options['favorite_blocks'] = array_values(
            array_filter(
                array_map( 'sanitize_text_field', (array) $options['favorite_blocks'] )
            )
        );
        $options['favorite_labels'] = $this->sanitize_favorite_labels(
            isset( $options['favorite_labels'] ) ? $options['favorite_labels'] : array(),
            $options['favorite_blocks']
        );
        $options['enabled'] = isset( $options['enabled'] ) ? (int) $options['enabled'] : 0;
        $options['columns'] = isset( $options['columns'] ) ? max( 1, min( 8, (int) $options['columns'] ) ) : 4;
        $options['limit']   = isset( $options['limit'] ) ? max( 1, min( 48, (int) $options['limit'] ) ) : 12;

        return $options;
    }

    private function sanitize_favorite_labels( $labels, $favorite_blocks ) {
        $sanitized = array();

        if ( ! is_array( $labels ) ) {
            return $sanitized;
        }

        foreach ( $labels as $name => $label ) {
            if ( ! is_scalar( $label ) ) {
                continue;
            }

            $name  = sanitize_text_field( (string) $name );
            $label = sanitize_text_field( (string) $label );

            if ( $name && '' !== $label && in_array( $name, $favorite_blocks, true ) ) {
                $sanitized[ $name ] = $label;
            }
        }

        return $sanitized;
    }

    public function add_settings_page() {
        add_options_page(
            'My Blocks Launcher',
            'My Blocks Launcher',
            'manage_options',
            'my-favorite-blocks',
            array( $this, 'render_settings_page' )
        );
    }

    public function register_settings() {
        register_setting(
            'my_favorite_blocks_options_group',
            self::OPTION_KEY,
            array( $this, 'sanitize_options' )
        );
    }

    public function sanitize_options( $input ) {
        $defaults = $this->get_default_options();
        $output   = $defaults;
        $input    = is_array( $input ) ? $input : array();

        $import_raw = isset( $_POST['my_favorite_blocks_import'] )
            ? wp_unslash( $_POST['my_favorite_blocks_import'] )
            : '';

        // まず通常のフォーム入力を $input にまとめる
        // （この前に $input を組み立てている想定）

        // --- Base64 インポートを上書き適用 ---
        if ( ! empty( $import_raw ) ) {
            $decoded = base64_decode( trim( $import_raw ), true );
            if ( false !== $decoded ) {
                $json = json_decode( $decoded, true );
                if ( is_array( $json ) ) {
                    // ここで $input にマージ。JSON 側が優先される。
                    $input = array_merge( $input, $json );
                }
            }
        }

        // 有効／カラム数／表示数
        $output['enabled'] = isset( $input['enabled'] ) ? (int) $input['enabled'] : 0;

        $output['columns'] = isset( $input['columns'] ) ? (int) $input['columns'] : $defaults['columns'];
        $output['columns'] = max( 1, min( 8, $output['columns'] ) );

        $output['limit'] = isset( $input['limit'] ) ? (int) $input['limit'] : $defaults['limit'];
        $output['limit'] = max( 1, min( 48, $output['limit'] ) );

        // --- お気に入りブロック（元データ） ---
        $base_favorites = array();
        if ( isset( $input['favorite_blocks'] ) && is_array( $input['favorite_blocks'] ) ) {
            foreach ( $input['favorite_blocks'] as $name ) {
                $name = sanitize_text_field( $name );
                if ( $name ) {
                    $base_favorites[] = $name;
                }
            }
            // 重複を前から詰めて削除（順番は保つ）
            $base_favorites = array_values( array_unique( $base_favorites ) );
        }

        // --- 並び順の指定（hidden: my_favorite_blocks_order） ---
        $order_raw = isset( $_POST['my_favorite_blocks_order'] )
            ? sanitize_text_field( wp_unslash( $_POST['my_favorite_blocks_order'] ) )
            : '';

        if ( $order_raw ) {
            $order = array_filter( array_map( 'trim', explode( ',', $order_raw ) ) );

            $reordered = array();
            $pool      = $base_favorites;

            // 1) 並び順に従って先に詰める
            foreach ( $order as $name ) {
                $idx = array_search( $name, $pool, true );
                if ( false !== $idx ) {
                    $reordered[] = $pool[ $idx ];
                    unset( $pool[ $idx ] );
                }
            }

            // 2) order に含まれていなかった新規項目を後ろに追加
            foreach ( $pool as $name ) {
                $reordered[] = $name;
            }

            $output['favorite_blocks'] = array_values( $reordered );
        } else {
            // 並び順指定が無い場合（＝インポートのみ、またはドラッグ未使用）は
            // 配列に入ってきた順番（= インポート JSON の順番）をそのまま信用する
            $output['favorite_blocks'] = $base_favorites;
        }

        // 並び順の適用（ドラッグ＆ドロップで並べ替えた結果）
        $order_raw = isset( $_POST['my_favorite_blocks_order'] )
            ? sanitize_text_field( wp_unslash( $_POST['my_favorite_blocks_order'] ) )
            : '';
        if ( $order_raw ) {
            $order = array_filter( array_map( 'trim', explode( ',', $order_raw ) ) );
            if ( $order ) {
                usort(
                    $output['favorite_blocks'],
                    function( $a, $b ) use ( $order ) {
                        $pos_a = array_search( $a, $order, true );
                        $pos_b = array_search( $b, $order, true );
                        if ( false === $pos_a ) {
                            $pos_a = PHP_INT_MAX;
                        }
                        if ( false === $pos_b ) {
                            $pos_b = PHP_INT_MAX;
                        }
                        return $pos_a - $pos_b;
                    }
                );
            }
        }

        $output['favorite_labels'] = $this->sanitize_favorite_labels(
            isset( $input['favorite_labels'] ) ? $input['favorite_labels'] : array(),
            $output['favorite_blocks']
        );

        return $output;
    }

    private function get_category_label( $slug ) {
        switch ( $slug ) {
            case 'text':
                return 'テキスト';
            case 'media':
                return 'メディア';
            case 'design':
                return 'デザイン';
            case 'widgets':
                return 'ウィジェット';
            case 'theme':
                return 'テーマ';
            case 'reusable':
                return '再利用ブロック';
            case 'vk-blocks':
                return 'VK ブロック';
            case 'getwid':
            case 'getwid-blocks':
                return 'Getwid ブロック';
            default:
                return $slug ? $slug : 'その他';
        }
    }

    private function get_all_blocks_for_admin() {
        if ( ! class_exists( 'WP_Block_Type_Registry' ) ) {
            return array();
        }

$registry  = WP_Block_Type_Registry::get_instance();
$all_types = $registry->get_all_registered();

$blocks = array();

foreach ( $all_types as $name => $type ) {

    // ★ ここでカテゴリだけは拾っておく（ラベルに使うので）
    $category = isset( $type->category ) ? $type->category : '';

    // ★ 追加：インサーター非対応（内部専用）ブロックは候補から除外
    // supports['inserter'] === false のものは、
    // 標準の「＋」にも出ないブロックなので一覧に含めない。
    if (
        isset( $type->supports )
        && is_array( $type->supports )
        && array_key_exists( 'inserter', $type->supports )
        && $type->supports['inserter'] === false
    ) {
        continue;
    }

    $blocks[] = array(
        'name'     => $name,
        'title'    => isset( $type->title ) ? $type->title : $name,
        'category' => $category,
    );
}


        usort(
            $blocks,
            function( $a, $b ) {
                return strcasecmp( $a['title'], $b['title'] );
            }
        );

        return $blocks;
    }

    
    private function get_vk_patterns_for_admin( $favorite_names = null ) {
        $patterns        = array();
        $is_filtered     = is_array( $favorite_names );
        $requested_names = array();
        $requested_ids   = array();
        $found_names     = array();

        if ( $is_filtered ) {
            foreach ( $favorite_names as $name ) {
                $name = sanitize_text_field( (string) $name );

                if ( 0 !== strpos( $name, 'vk-block-patterns/' ) ) {
                    continue;
                }

                $requested_names[ $name ] = true;
                if ( preg_match( '#^vk-block-patterns/pattern-([0-9]+)$#', $name, $matches ) ) {
                    $requested_ids[] = (int) $matches[1];
                }
            }

            if ( empty( $requested_names ) ) {
                return $patterns;
            }
        }

        /**
         * 1) Lightning VK Block Patterns のカスタム投稿から取得
         *
         * 管理画面で作成したパターンは post_type = vk-block-patterns
         * として保存されているので、まずはこちらを優先して読み込みます。
         */
        if ( post_type_exists( 'vk-block-patterns' ) && ( ! $is_filtered || ! empty( $requested_ids ) ) ) {
            $query_args = array(
                'post_type'      => 'vk-block-patterns',
                'post_status'    => 'publish',
                'posts_per_page' => $is_filtered ? count( $requested_ids ) : -1,
                'no_found_rows'  => true,
            );

            if ( $is_filtered ) {
                $query_args['post__in'] = array_values( array_unique( $requested_ids ) );
            }

            $posts = get_posts(
                $query_args
            );

            foreach ( $posts as $post ) {
                $name    = 'vk-block-patterns/pattern-' . $post->ID;
                $title   = get_the_title( $post );
                $content = $post->post_content;

                $patterns[] = array(
                    'name'     => $name,
                    'title'    => $title,
                    'content'  => $content,
                    'category' => 'vk-block-patterns',
                    'plugin'   => 'VK Block Patterns',
                );
                $found_names[ $name ] = true;
            }
        }

        /**
         * 2) 念のため、WP_Block_Patterns_Registry からのフォールバックも残す
         *    （テーマ / 他プラグイン経由で register_block_pattern されている場合用）
         */
        if ( ( empty( $patterns ) || $is_filtered ) && class_exists( 'WP_Block_Patterns_Registry' ) ) {

            $registry = WP_Block_Patterns_Registry::get_instance();
            $all      = $registry->get_all_registered();

            foreach ( $all as $pattern ) {
                if ( ! is_array( $pattern ) || empty( $pattern['name'] ) ) {
                    continue;
                }

                $name = sanitize_text_field( (string) $pattern['name'] );

                if ( 0 !== strpos( $name, 'vk-block-patterns/' ) ) {
                    continue;
                }

                if ( $is_filtered && ! isset( $requested_names[ $name ] ) ) {
                    continue;
                }

                if ( isset( $found_names[ $name ] ) ) {
                    continue;
                }

                $title   = isset( $pattern['title'] ) ? $pattern['title'] : $name;
                $content = isset( $pattern['content'] ) ? $pattern['content'] : '';

                $patterns[] = array(
                    'name'     => $name,
                    'title'    => $title,
                    'content'  => $content,
                    'category' => 'vk-block-patterns',
                    'plugin'   => 'VK Block Patterns',
                );
            }
        }

        // タイトル順にソート
        if ( ! empty( $patterns ) ) {
            usort(
                $patterns,
                function( $a, $b ) {
                    return strcasecmp( $a['title'], $b['title'] );
                }
            );
        }

        return $patterns;
    }

    public function render_settings_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        $options      = $this->get_options();
        $all_blocks   = $this->get_all_blocks_for_admin();
        $vk_patterns  = $this->get_vk_patterns_for_admin();
        $export_value = base64_encode( wp_json_encode( $options ) );

        $grouped = array();
        foreach ( $all_blocks as $block ) {
            $cat_label = $this->get_category_label( $block['category'] );
            if ( ! isset( $grouped[ $cat_label ] ) ) {
                $grouped[ $cat_label ] = array();
            }
            $grouped[ $cat_label ][] = $block;
        }

        ksort( $grouped );
        ?>
        <div class="wrap my-favorite-blocks-admin">
            <h1>My Blocks Launcher</h1>

            <form method="post" action="options.php" class="my-favorite-blocks-form" id="my-favorite-blocks-form">
                <?php
                settings_fields( 'my_favorite_blocks_options_group' );

                // 上部にも保存ボタン
                submit_button( '変更を保存', 'primary', 'submit', false );
                ?>

                <h2 class="title">基本設定</h2>
                <table class="form-table" role="presentation">
                    <tbody>
                    <tr>
                        <th scope="row">お気に入り機能</th>
                        <td>
                            <label>
                                <input type="checkbox"
                                       name="<?php echo esc_attr( self::OPTION_KEY ); ?>[enabled]"
                                       value="1" <?php checked( $options['enabled'], 1 ); ?> />
                                ブロック追加ボタンの「最近使ったブロック」エリアを、お気に入りブロックだけに置き換えます。
                            </label>
                            <p class="description">
                                「すべて表示」で開く全ブロック一覧には影響しません。
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">表示カラム数</th>
                        <td>
<input type="number" min="1" max="8"
       id="mfb-columns"
       name="<?php echo esc_attr( self::OPTION_KEY ); ?>[columns]"
       value="<?php echo esc_attr( $options['columns'] ); ?>" />

                            <p class="description">
                                現在は参考用の設定です（クイックインサーター側の見た目は Gutenberg 側に依存します）。
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <th scope="row">表示上限数</th>
                        <td>
                            <input type="number" min="1" max="48"
                                   id="mfb-limit"
                                   name="<?php echo esc_attr( self::OPTION_KEY ); ?>[limit]"
                                   value="<?php echo esc_attr( $options['limit'] ); ?>" />
                            <p class="description">
                                チェックできるお気に入り（ブロック + VK Block Patterns）の合計上限数です。
                            </p>
                        </td>
                    </tr>
                    </tbody>
                </table>

                <hr />

                <h2 class="title">お気に入りの並び順（プレビュー）</h2>
                <p class="description">
                    下の一覧でチェックしたブロック / VK Block Patterns がここに表示されます。ドラッグ＆ドロップで順序を変更できます。<br>
                    表示名欄を空にすると元の名前を使い、入力するとランチャー内だけその別名で表示します。<br>
                    上から順番に、ブロックエディタの「＋」ボタンで表示されます。
                </p>

<ul id="mfb-favorite-preview"
    data-label-option-name="<?php echo esc_attr( self::OPTION_KEY . '[favorite_labels]' ); ?>"></ul>
<input
    type="hidden"
    name="my_favorite_blocks_order"
    id="mfb-favorite-order"
    value="<?php echo esc_attr( implode( ',', $options['favorite_blocks'] ) ); ?>"/>


                <hr />

                <h2 class="title">お気に入りブロック一覧</h2>
                <p class="description">
                    よく使うブロックにチェックを入れてください。Lightning / Getwid / WooCommerce など、登録済みのブロックも対象です。
                </p>

                <p>
                    <button type="button" class="button" id="mfb-clear-all">すべてのチェックを外す</button>
                </p>

                <?php foreach ( $grouped as $cat_label => $blocks_in_cat ) : ?>
                    <h3 class="mfb-category-title"><?php echo esc_html( $cat_label ); ?></h3>
                    <div class="my-favorite-blocks-grid">
                        <?php foreach ( $blocks_in_cat as $block ) : ?>
                            <?php
                            $name     = $block['name'];
                            $title    = $block['title'];
                            $category = $block['category'];
                            $checked      = in_array( $name, $options['favorite_blocks'], true );
                            $custom_label = isset( $options['favorite_labels'][ $name ] )
                                ? $options['favorite_labels'][ $name ]
                                : '';
                            ?>
                            <label class="my-favorite-blocks-item"
                                   data-block-name="<?php echo esc_attr( $name ); ?>"
                                   data-custom-label="<?php echo esc_attr( $custom_label ); ?>">
                                <input type="checkbox"
                                       class="mfb-favorite-checkbox"
                                       name="<?php echo esc_attr( self::OPTION_KEY ); ?>[favorite_blocks][]"
                                       value="<?php echo esc_attr( $name ); ?>"
                                       <?php checked( $checked ); ?> />
                                <span class="mfb-item-title"><?php echo esc_html( $title ); ?></span>
                                <span class="mfb-item-name"><?php echo esc_html( $name ); ?></span>
                                <?php if ( $category ) : ?>
                                    <span class="mfb-item-category"><?php echo esc_html( $category ); ?></span>
                                <?php endif; ?>
                            </label>
                        <?php endforeach; ?>
                    </div>
                <?php endforeach; ?>

                <?php if ( ! empty( $vk_patterns ) ) : ?>
                    <hr />
                    <h2 class="title">VK Block Patterns（パターン）</h2>
                    <p class="description">
                        VK Block Patterns で作成したパターンも、お気に入りとして登録できます。
                        チェックすると、クイックインサーターから 1クリックで呼び出せます。
                    </p>
                    <div class="my-favorite-blocks-grid">
                        <?php foreach ( $vk_patterns as $pattern ) : ?>
                            <?php
                            $name    = $pattern['name'];   // 例: vk-block-patterns/pattern-2212
                            $title   = $pattern['title'];  // 例: 釣果情報
                            $checked      = in_array( $name, $options['favorite_blocks'], true );
                            $custom_label = isset( $options['favorite_labels'][ $name ] )
                                ? $options['favorite_labels'][ $name ]
                                : '';
                            ?>
                            <label class="my-favorite-blocks-item"
                                   data-block-name="<?php echo esc_attr( $name ); ?>"
                                   data-custom-label="<?php echo esc_attr( $custom_label ); ?>">
                                <input type="checkbox"
                                       class="mfb-favorite-checkbox"
                                       name="<?php echo esc_attr( self::OPTION_KEY ); ?>[favorite_blocks][]"
                                       value="<?php echo esc_attr( $name ); ?>"
                                       <?php checked( $checked ); ?> />
                                <span class="mfb-item-title"><?php echo esc_html( $title ); ?></span>
                                <span class="mfb-item-name"><?php echo esc_html( $name ); ?></span>
                                <span class="mfb-item-category">VK Block Pattern</span>
                            </label>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>

                <hr />

                <h2 class="title">設定のインポート / エクスポート</h2>

                <h3>エクスポート</h3>
                <p class="description">
                    現在の設定（お気に入り / 上限数 など）を、他サイトへコピーするための文字列です。<br>
                    クリックするとすべて選択されます。
                </p>
                <textarea readonly
                          onclick="this.focus();this.select();"
                          rows="3"
                          style="width:100%;max-width:700px;"><?php echo esc_textarea( $export_value ); ?></textarea>

                <h3>インポート</h3>
                <p class="description">
                    他サイトでエクスポートした文字列をここに貼り付けて「変更を保存」すると、上記の設定がすべて上書きされます。<br>
                    ※現在の設定は失われますのでご注意ください。
                </p>
                <textarea name="my_favorite_blocks_import"
                          rows="3"
                          style="width:100%;max-width:700px;"></textarea>

                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    public function enqueue_editor_assets() {
        $options = $this->get_options();

        if ( empty( $options['enabled'] ) ) {
            return;
        }

        $vk_patterns = $this->get_vk_patterns_for_admin( $options['favorite_blocks'] );
        $editor_script_path = plugin_dir_path( __FILE__ ) . 'editor.js';
        $editor_script_version = file_exists( $editor_script_path )
            ? (string) filemtime( $editor_script_path )
            : '1.4.17';

        wp_enqueue_script(
            'my-favorite-blocks-editor',
            plugins_url( 'editor.js', __FILE__ ),
            array( 'wp-blocks', 'wp-data', 'wp-dom-ready' ),
            $editor_script_version,
            true
        );

        wp_enqueue_style(
            'my-favorite-blocks-editor',
            plugins_url( 'editor.css', __FILE__ ),
            array(),
            '1.4.17'
        );

        wp_localize_script(
            'my-favorite-blocks-editor',
            'MyFavoriteBlocksSettings',
            array(
                'enabled'        => (bool) $options['enabled'],
                'columns'        => (int) $options['columns'],
                'limit'          => (int) $options['limit'],
                'favoriteBlocks' => $options['favorite_blocks'],
                'favoriteLabels' => $options['favorite_labels'],
                'vkPatterns'     => $vk_patterns,
            )
        );
    }

    public function enqueue_admin_assets( $hook ) {
        if ( 'settings_page_my-favorite-blocks' !== $hook ) {
            return;
        }

        wp_enqueue_style(
            'my-favorite-blocks-admin',
            plugins_url( 'admin.css', __FILE__ ),
            array(),
            '1.4.8'
        );

        wp_enqueue_script(
            'my-favorite-blocks-admin',
            plugins_url( 'admin.js', __FILE__ ),
            array( 'jquery', 'jquery-ui-sortable' ),
            '1.4.8',
            true
        );
    }
}

new My_Favorite_Blocks_Plugin();
// プラグイン一覧に「設定」リンクを追加
add_filter(
    'plugin_action_links_' . plugin_basename(__FILE__),
    function ($links) {
        $url = admin_url('options-general.php?page=my-favorite-blocks');
        $links[] = '<a href="' . esc_url($url) . '">設定</a>';
        return $links;
    }
);
