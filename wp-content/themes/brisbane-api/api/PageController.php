<?php

if (!defined('ABSPATH')) :
    exit;
endif;


class PagesController
{
    /*
     * All live requests now resolve through MenuController::live_root(),
     * which returns either:
     *   - this site's own REST endpoint (when running on the canonical host), or
     *   - the canonical live site's REST endpoint (everywhere else).
     */

    /*
     * For Live site: https://brisbanelogistics.com.au/wp-json/wp/v2
     * For Local site: http://localhost/projects/brisbane-logistics/app/wp-json/brisbane
     *
     * For Synchronize:
     *   Full:      http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/sync
     *              http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/sync-all
     *
     *   Single:    http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/sync?slug=about-us
     *              http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/sync?type=page&slug=about-us
     *              http://localhost/projects/brisbane-logistics/app/wp-jsonwa/brisbane/sync?type=post&slug=some-post
     *              http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/sync?type=category&slug=about-us
     *              http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/sync?type=category&id=117
     *              http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/sync?type=tag&slug=news
     *              http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/sync?type=block&slug=my-block
     *              http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/sync?type=media&id=1916
     */

    private static $media_cache = [];
    private static $term_cache  = [];
    private static $block_map   = [];
    private static $page_seen   = [];

    /* ==============================================================
     * LEGACY — /brisbane/pages
     * ============================================================== */

    private static function category_slugs(): array
    {
        $remote = wp_remote_get(MenuController::live_root() . '/categories', ['timeout' => 15]);
        if (is_wp_error($remote)) : return [];
        endif;

        $items = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($items)) : return [];
        endif;

        $slugs = [];
        foreach ($items as $item) :
            if (($item['slug'] ?? '') === 'uncategorized') : continue;
            endif;
            $slugs[] = $item['slug'] ?? '';
        endforeach;

        return $slugs;
    }

    private static function pages(): array
    {
        $remote = wp_remote_get(MenuController::live_root() . '/pages?per_page=100', ['timeout' => 15]);
        if (is_wp_error($remote)) : return [];
        endif;

        $json = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($json)) : return [];
        endif;

        $category_slugs = self::category_slugs();
        $data           = [];

        foreach ($json as $item) :
            $slug = $item['slug'] ?? '';
            if (!in_array($slug, $category_slugs, true)) : continue;
            endif;

            $data[] = [
                'name'     => $item['title']['rendered'] ?? '',
                'slug'     => $slug,
                'category' => $slug,
                'content'  => [],
            ];
        endforeach;

        return $data;
    }

    public static function content()
    {
        return rest_ensure_response([
            'pages' => self::pages(),
        ]);
    }

    /* ==============================================================
     * SYNC — entry points
     * ============================================================== */

    public static function sync_single_dispatch(WP_REST_Request $request)
    {
        $type = strtolower((string) $request->get_param('type'));
        $slug = (string) $request->get_param('slug');
        $id   = (int)    $request->get_param('id');
        $url  = (string) $request->get_param('url');

        if ($slug === '' && $id === 0 && $url === '') :
            return self::sync_everything($request);
        endif;

        if ($type !== '') :
            return self::dispatch_by_type($type, $request, $slug, $id);
        endif;

        if ($slug !== '') :
            return self::dispatch_auto_by_slug($slug, $request);
        endif;

        return new WP_Error(
            'missing_param',
            'Provide ?slug=, ?id=, or nothing (for full sync)',
            ['status' => 400]
        );
    }

    public static function sync_everything(WP_REST_Request $request)
    {
        self::reset_caches();

        $blocks     = self::sync_all_blocks()->get_data();
        $categories = self::sync_all_categories()->get_data();
        $tags       = self::sync_all_tags()->get_data();
        $pages      = self::sync_all_pages()->get_data();
        $posts      = self::sync_all_posts()->get_data();

        return rest_ensure_response([
            'synced_at'  => current_time('c'),
            'blocks'     => $blocks,
            'categories' => $categories,
            'tags'       => $tags,
            'pages'      => $pages,
            'posts'      => $posts,
        ]);
    }

    public static function sync_categories(WP_REST_Request $request)
    {
        return self::sync_all_categories();
    }

    public static function sync_tags(WP_REST_Request $request)
    {
        return self::sync_all_tags();
    }

    public static function sync_blocks(WP_REST_Request $request)
    {
        return self::sync_all_blocks();
    }

    public static function sync(WP_REST_Request $request)
    {
        $slug = (string) $request->get_param('slug');
        if ($slug !== '') : return self::sync_single_page($slug);
        endif;
        return self::sync_all_pages();
    }

    public static function sync_posts(WP_REST_Request $request)
    {
        $slug = (string) $request->get_param('slug');
        if ($slug !== '') : return self::sync_single_post_by_slug($slug);
        endif;
        return self::sync_all_posts();
    }

    public static function sync_media(WP_REST_Request $request)
    {
        return self::sync_all_media();
    }

    /* ==============================================================
     * Dispatchers
     * ============================================================== */

    private static function dispatch_by_type(string $type, WP_REST_Request $request, string $slug, int $id)
    {
        switch ($type):

            case 'page':
                if ($slug === '') :
                    return new WP_Error('missing_param', 'Provide ?slug=', ['status' => 400]);
                endif;
                return self::sync_single_page($slug);

            case 'post':
                if ($slug === '') :
                    return new WP_Error('missing_param', 'Provide ?slug=', ['status' => 400]);
                endif;
                return self::sync_single_post_by_slug($slug);

            case 'category':
                return self::sync_single_category($request);

            case 'tag':
                return self::sync_single_tag($request);

            case 'block':
                return self::sync_single_block($request);

            case 'media':
                return self::sync_single_media($request);

            default:
                return new WP_Error(
                    'invalid_type',
                    'type must be one of: page, post, category, tag, block, media',
                    ['status' => 400]
                );

        endswitch;
    }

    private static function dispatch_auto_by_slug(string $slug, WP_REST_Request $request)
    {
        $endpoints = [
            'page'     => '/pages?slug=',
            'post'     => '/posts?slug=',
            'category' => '/categories?slug=',
            'tag'      => '/tags?slug=',
            'block'    => '/blocks?slug=',
        ];

        foreach ($endpoints as $type => $path) :

            $url    = MenuController::live_root() . $path . rawurlencode($slug);
            $remote = wp_remote_get($url, ['timeout' => 15]);
            if (is_wp_error($remote)) : continue;
            endif;

            $items = json_decode(wp_remote_retrieve_body($remote), true);
            if (!is_array($items) || empty($items)) : continue;
            endif;

            return self::dispatch_by_type($type, $request, $slug, 0);

        endforeach;

        return new WP_Error(
            'not_found',
            'No item found on live with slug: ' . $slug,
            ['status' => 404]
        );
    }

    /* ==============================================================
     * SINGLE — Category / Tag / Block / Media
     * ============================================================== */

    public static function sync_single_category(WP_REST_Request $request)
    {
        $id   = (int)    $request->get_param('id');
        $slug = (string) $request->get_param('slug');

        if ($id === 0 && $slug === '') :
            return new WP_Error('missing_param', 'Provide ?id= or ?slug=', ['status' => 400]);
        endif;

        $url = $id > 0
            ? MenuController::live_root() . '/categories/' . $id
            : MenuController::live_root() . '/categories?slug=' . rawurlencode($slug);

        $remote = wp_remote_get($url, ['timeout' => 30]);
        if (is_wp_error($remote)) :
            return new WP_Error('live_fetch_failed', $remote->get_error_message(), ['status' => 502]);
        endif;

        $data = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($data)) :
            return new WP_Error('live_invalid_json', 'Invalid JSON', ['status' => 502]);
        endif;

        $item = $id > 0 ? $data : ($data[0] ?? null);
        if (!$item || empty($item['slug'])) :
            return new WP_Error('not_found', 'Category not found on live', ['status' => 404]);
        endif;

        $term_id = self::ensure_category($item);

        return rest_ensure_response([
            'synced_at' => current_time('c'),
            'slug'      => $item['slug'],
            'action'    => $term_id > 0 ? 'synced' : 'failed',
            'term_id'   => $term_id,
        ]);
    }

    public static function sync_single_tag(WP_REST_Request $request)
    {
        $id   = (int)    $request->get_param('id');
        $slug = (string) $request->get_param('slug');

        if ($id === 0 && $slug === '') :
            return new WP_Error('missing_param', 'Provide ?id= or ?slug=', ['status' => 400]);
        endif;

        $url = $id > 0
            ? MenuController::live_root() . '/tags/' . $id
            : MenuController::live_root() . '/tags?slug=' . rawurlencode($slug);

        $remote = wp_remote_get($url, ['timeout' => 30]);
        if (is_wp_error($remote)) :
            return new WP_Error('live_fetch_failed', $remote->get_error_message(), ['status' => 502]);
        endif;

        $data = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($data)) :
            return new WP_Error('live_invalid_json', 'Invalid JSON', ['status' => 502]);
        endif;

        $item = $id > 0 ? $data : ($data[0] ?? null);
        if (!$item || empty($item['slug'])) :
            return new WP_Error('not_found', 'Tag not found on live', ['status' => 404]);
        endif;

        $term_id = self::ensure_tag($item);

        return rest_ensure_response([
            'synced_at' => current_time('c'),
            'slug'      => $item['slug'],
            'action'    => $term_id > 0 ? 'synced' : 'failed',
            'term_id'   => $term_id,
        ]);
    }

    public static function sync_single_block(WP_REST_Request $request)
    {
        $id   = (int)    $request->get_param('id');
        $slug = (string) $request->get_param('slug');

        if ($id === 0 && $slug === '') :
            return new WP_Error('missing_param', 'Provide ?id= or ?slug=', ['status' => 400]);
        endif;

        $url = $id > 0
            ? MenuController::live_root() . '/blocks/' . $id
            : MenuController::live_root() . '/blocks?slug=' . rawurlencode($slug);

        $remote = wp_remote_get($url, ['timeout' => 30]);
        if (is_wp_error($remote)) :
            return new WP_Error('live_fetch_failed', $remote->get_error_message(), ['status' => 502]);
        endif;

        $data = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($data)) :
            return new WP_Error('live_invalid_json', 'Invalid JSON', ['status' => 502]);
        endif;

        $item = $id > 0 ? $data : ($data[0] ?? null);
        if (!$item || empty($item['slug'])) :
            return new WP_Error('not_found', 'Block not found on live', ['status' => 404]);
        endif;

        return self::import_block($item);
    }

    public static function sync_single_media(WP_REST_Request $request)
    {
        $id  = (int)    $request->get_param('id');
        $url = (string) $request->get_param('url');

        if ($id === 0 && $url === '') :
            return new WP_Error('missing_param', 'Provide ?id= or ?url=', ['status' => 400]);
        endif;

        if ($url !== '') :
            $local_id = self::import_media_by_url($url);
            if ($local_id === 0) :
                return new WP_Error('import_failed', 'Could not import media from URL', ['status' => 500]);
            endif;

            return rest_ensure_response([
                'synced_at' => current_time('c'),
                'action'    => 'imported',
                'source'    => $url,
                'post_id'   => $local_id,
                'local_url' => wp_get_attachment_url($local_id),
                'edit_link' => admin_url('post.php?post=' . $local_id . '&action=edit'),
            ]);
        endif;

        $remote = wp_remote_get(MenuController::live_root() . '/media/' . $id, ['timeout' => 30]);
        if (is_wp_error($remote)) :
            return new WP_Error('live_fetch_failed', $remote->get_error_message(), ['status' => 502]);
        endif;

        $item = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($item) || empty($item['source_url'])) :
            return new WP_Error('not_found', 'Media not found on live', ['status' => 404]);
        endif;

        $existing = self::find_attachment_by_source_url($item['source_url']);
        if ($existing) :
            return rest_ensure_response([
                'synced_at' => current_time('c'),
                'action'    => 'skipped',
                'source'    => $item['source_url'],
                'post_id'   => $existing,
                'local_url' => wp_get_attachment_url($existing),
                'edit_link' => admin_url('post.php?post=' . $existing . '&action=edit'),
            ]);
        endif;

        $local_id = self::import_media_by_url(
            $item['source_url'],
            $item['title']['rendered'] ?? '',
            $item['alt_text'] ?? ''
        );

        if ($local_id === 0) :
            return new WP_Error('import_failed', 'Could not download media', ['status' => 500]);
        endif;

        return rest_ensure_response([
            'synced_at' => current_time('c'),
            'action'    => 'imported',
            'source'    => $item['source_url'],
            'post_id'   => $local_id,
            'local_url' => wp_get_attachment_url($local_id),
            'edit_link' => admin_url('post.php?post=' . $local_id . '&action=edit'),
        ]);
    }

    /* ==============================================================
     * SYNC — Reusable blocks
     * ============================================================== */

    private static function sync_all_blocks()
    {
        $remote = wp_remote_get(MenuController::live_root() . '/blocks?per_page=100', ['timeout' => 30]);
        if (is_wp_error($remote)) :
            return new WP_Error('live_fetch_failed', $remote->get_error_message(), ['status' => 502]);
        endif;

        $items = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($items)) :
            return new WP_Error('live_invalid_json', 'Invalid blocks JSON', ['status' => 502]);
        endif;

        $imported = [];
        $updated = [];

        foreach ($items as $item) :
            $slug = $item['slug'] ?? '';
            if ($slug === '') : continue;
            endif;

            $existing = self::find_local_by_slug($slug, 'wp_block');
            $result   = self::import_block($item, false);

            if (is_wp_error($result)) : continue;
            endif;

            if ($existing) : $updated[] = $slug;
            else : $imported[] = $slug;
            endif;
        endforeach;

        return rest_ensure_response([
            'synced_at'   => current_time('c'),
            'total_live'  => count($items),
            'imported'    => $imported,
            'updated'     => $updated,
            'local_count' => self::count_local('wp_block'),
        ]);
    }

    private static function import_block(array $item, bool $as_response = true)
    {
        $live_id = (int) ($item['id'] ?? 0);
        $slug    = $item['slug'] ?? '';
        if ($slug === '') :
            return new WP_Error('invalid_item', 'Block has no slug');
        endif;

        $title   = html_entity_decode($item['title']['rendered'] ?? '', ENT_QUOTES | ENT_HTML5);
        $content = $item['content']['rendered'] ?? '';
        $status  = $item['status'] ?? 'publish';

        $existing = self::find_local_by_slug($slug, 'wp_block');

        $post_data = [
            'post_title'   => $title,
            'post_name'    => $slug,
            'post_content' => $content,
            'post_status'  => $status === 'publish' ? 'publish' : 'draft',
            'post_type'    => 'wp_block',
        ];

        if ($existing instanceof WP_Post) :
            $post_data['ID'] = $existing->ID;
            $local_id = wp_update_post($post_data, true);
            if (is_wp_error($local_id)) : return $local_id;
            endif;
            $action = 'updated';
        else :
            $local_id = wp_insert_post($post_data, true);
            if (is_wp_error($local_id)) : return $local_id;
            endif;
            $action = 'inserted';
        endif;

        if ($live_id > 0) :
            update_post_meta($local_id, '_brisbane_live_block_id', $live_id);
            self::$block_map[$live_id] = $local_id;
        endif;

        if (!$as_response) :
            return $local_id;
        endif;

        return rest_ensure_response([
            'synced_at' => current_time('c'),
            'slug'      => $slug,
            'action'    => $action,
            'post_id'   => $local_id,
            'edit_link' => admin_url('post.php?post=' . $local_id . '&action=edit'),
        ]);
    }

    private static function block_map(): array
    {
        if (!empty(self::$block_map)) : return self::$block_map;
        endif;

        $q = new WP_Query([
            'post_type'      => 'wp_block',
            'post_status'    => ['publish', 'draft'],
            'posts_per_page' => -1,
            'fields'         => 'ids',
        ]);

        foreach ($q->posts as $local_id) :
            $live_id = (int) get_post_meta($local_id, '_brisbane_live_block_id', true);
            if ($live_id) : self::$block_map[$live_id] = (int) $local_id;
            endif;
        endforeach;

        return self::$block_map;
    }

    private static function rewrite_block_refs(string $html): string
    {
        if (strpos($html, 'wp:block') === false) : return $html;
        endif;

        if (preg_match_all('/<!--\s*wp:block\s+\{[^}]*"ref"\s*:\s*(\d+)[^}]*\}\s*\/-->/', $html, $matches)) :
            foreach ($matches[1] as $live_id) :
                $live_id = (int) $live_id;
                if ($live_id > 0 && !isset(self::$block_map[$live_id])) :
                    $remote = wp_remote_get(MenuController::live_root() . '/blocks/' . $live_id, ['timeout' => 30]);
                    if (!is_wp_error($remote)) :
                        $item = json_decode(wp_remote_retrieve_body($remote), true);
                        if (is_array($item) && !empty($item['slug'])) :
                            self::import_block($item, false);
                        endif;
                    endif;
                endif;
            endforeach;
        endif;

        $map = self::$block_map;
        if (empty($map)) : return $html;
        endif;

        return preg_replace_callback(
            '/<!--\s*wp:block\s+(\{[^}]*"ref"\s*:\s*(\d+)[^}]*\})\s*\/-->/',
            function ($m) use ($map) {
                $live_id = (int) $m[2];
                if (!isset($map[$live_id])) : return $m[0];
                endif;

                $local_id = $map[$live_id];
                $new_json = preg_replace('/"ref"\s*:\s*\d+/', '"ref":' . $local_id, $m[1]);
                return '<!-- wp:block ' . $new_json . ' /-->';
            },
            $html
        );
    }

    /* ==============================================================
     * SYNC — Categories
     * ============================================================== */

    private static function sync_all_categories()
    {
        $items = self::fetch_all_live('/categories');
        if (empty($items)) :
            return new WP_Error('live_fetch_failed', 'No categories from live', ['status' => 502]);
        endif;

        $imported = [];
        $updated = [];

        foreach ($items as $item) :
            $slug = $item['slug'] ?? '';
            if ($slug === '' || $slug === 'uncategorized') : continue;
            endif;

            $existing = get_term_by('slug', $slug, 'category');
            $term_id  = self::ensure_category($item);

            if ($term_id === 0) : continue;
            endif;

            if ($existing) : $updated[] = $slug;
            else : $imported[] = $slug;
            endif;
        endforeach;

        return rest_ensure_response([
            'synced_at'   => current_time('c'),
            'total_live'  => count($items),
            'imported'    => $imported,
            'updated'     => $updated,
            'local_count' => (int) wp_count_terms(['taxonomy' => 'category', 'hide_empty' => false]),
        ]);
    }

    /* ==============================================================
     * SYNC — Tags
     * ============================================================== */

    private static function sync_all_tags()
    {
        $items = self::fetch_all_live('/tags');
        if (empty($items)) :
            return rest_ensure_response([
                'synced_at'   => current_time('c'),
                'total_live'  => 0,
                'imported'    => [],
                'updated'     => [],
                'local_count' => (int) wp_count_terms(['taxonomy' => 'post_tag', 'hide_empty' => false]),
            ]);
        endif;

        $imported = [];
        $updated = [];

        foreach ($items as $item) :
            $slug = $item['slug'] ?? '';
            if ($slug === '') : continue;
            endif;

            $existing = get_term_by('slug', $slug, 'post_tag');
            $term_id  = self::ensure_tag($item);

            if ($term_id === 0) : continue;
            endif;

            if ($existing) : $updated[] = $slug;
            else : $imported[] = $slug;
            endif;
        endforeach;

        return rest_ensure_response([
            'synced_at'   => current_time('c'),
            'total_live'  => count($items),
            'imported'    => $imported,
            'updated'     => $updated,
            'local_count' => (int) wp_count_terms(['taxonomy' => 'post_tag', 'hide_empty' => false]),
        ]);
    }

    /* ==============================================================
     * SYNC — Pages
     * ============================================================== */

    private static function sync_all_pages()
    {
        $items = self::fetch_all_live('/pages');
        if (empty($items)) :
            return new WP_Error('live_fetch_failed', 'No pages from live', ['status' => 502]);
        endif;

        $imported = [];
        $updated = [];
        $skipped = [];
        $errors = [];

        foreach ($items as $item) :
            $slug = $item['slug'] ?? '';
            if ($slug === '') : continue;
            endif;

            $result = self::import_page($item, 'page');
            if (is_wp_error($result)) :
                $errors[$slug] = $result->get_error_message();
                continue;
            endif;

            if ($result['action'] === 'inserted') : $imported[] = $slug;
            elseif ($result['action'] === 'updated') : $updated[] = $slug;
            else : $skipped[] = $slug;
            endif;
        endforeach;

        self::link_page_parents($items, 'page');

        return rest_ensure_response([
            'synced_at'   => current_time('c'),
            'total_live'  => count($items),
            'imported'    => $imported,
            'updated'     => $updated,
            'skipped'     => $skipped,
            'errors'      => $errors,
            'local_count' => self::count_local('page'),
        ]);
    }

    private static function sync_single_page(string $slug)
    {
        $remote = wp_remote_get(
            MenuController::live_root() . '/pages?slug=' . rawurlencode($slug),
            ['timeout' => 60]
        );
        if (is_wp_error($remote)) :
            return new WP_Error('live_fetch_failed', $remote->get_error_message(), ['status' => 502]);
        endif;

        $items = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($items) || empty($items)) :
            return new WP_Error('page_not_found', 'No page on live: ' . $slug, ['status' => 404]);
        endif;

        $result = self::import_page($items[0], 'page');
        if (is_wp_error($result)) : return $result;
        endif;

        return rest_ensure_response([
            'synced_at'   => current_time('c'),
            'slug'        => $slug,
            'action'      => $result['action'],
            'post_id'     => $result['post_id'],
            'referenced'  => $result['referenced'] ?? [],
            'edit_link'   => admin_url('post.php?post=' . $result['post_id'] . '&action=edit'),
            'local_count' => self::count_local('page'),
        ]);
    }

    /* ==============================================================
     * SYNC — Posts
     * ============================================================== */

    private static function sync_all_posts()
    {
        $items = self::fetch_all_live('/posts');
        if (empty($items)) :
            return new WP_Error('live_fetch_failed', 'No posts from live', ['status' => 502]);
        endif;

        $imported = [];
        $updated = [];
        $skipped = [];
        $errors = [];

        foreach ($items as $item) :
            $slug = $item['slug'] ?? '';
            if ($slug === '') : continue;
            endif;

            $result = self::import_page($item, 'post');
            if (is_wp_error($result)) :
                $errors[$slug] = $result->get_error_message();
                continue;
            endif;

            if ($result['action'] === 'inserted') : $imported[] = $slug;
            elseif ($result['action'] === 'updated') : $updated[] = $slug;
            else : $skipped[] = $slug;
            endif;
        endforeach;

        return rest_ensure_response([
            'synced_at'   => current_time('c'),
            'total_live'  => count($items),
            'imported'    => $imported,
            'updated'     => $updated,
            'skipped'     => $skipped,
            'errors'      => $errors,
            'local_count' => self::count_local('post'),
        ]);
    }

    private static function sync_single_post_by_slug(string $slug)
    {
        $remote = wp_remote_get(
            MenuController::live_root() . '/posts?slug=' . rawurlencode($slug),
            ['timeout' => 60]
        );
        if (is_wp_error($remote)) :
            return new WP_Error('live_fetch_failed', $remote->get_error_message(), ['status' => 502]);
        endif;

        $items = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($items) || empty($items)) :
            return new WP_Error('post_not_found', 'No post on live: ' . $slug, ['status' => 404]);
        endif;

        $result = self::import_page($items[0], 'post');
        if (is_wp_error($result)) : return $result;
        endif;

        return rest_ensure_response([
            'synced_at'   => current_time('c'),
            'slug'        => $slug,
            'action'      => $result['action'],
            'post_id'     => $result['post_id'],
            'edit_link'   => admin_url('post.php?post=' . $result['post_id'] . '&action=edit'),
            'local_count' => self::count_local('post'),
        ]);
    }

    /* ==============================================================
     * IMPORT — shared by pages / posts
     * ============================================================== */

    private static function import_page(array $item, string $post_type)
    {
        $slug = $item['slug'] ?? '';
        if ($slug === '') :
            return new WP_Error('invalid_item', 'Item has no slug');
        endif;

        $local_parent_id = 0;
        if ($post_type === 'page') :
            $parent_live_id = (int) ($item['parent'] ?? 0);
            if ($parent_live_id > 0) :
                self::sync_parent_chain($parent_live_id, $post_type);
                $local_parent_id = self::local_parent_id_for($parent_live_id);
            endif;
        endif;

        $title    = html_entity_decode($item['title']['rendered'] ?? $slug, ENT_QUOTES | ENT_HTML5);
        $content  = $item['content']['rendered'] ?? '';
        $status   = $item['status']   ?? 'publish';
        $date     = $item['date']     ?? current_time('mysql');
        $modified = $item['modified'] ?? current_time('mysql');

        $content = self::rewrite_block_refs($content);

        $featured_live_id  = (int) ($item['featured_media'] ?? 0);
        $featured_local_id = 0;
        if ($featured_live_id > 0) :
            $featured_local_id = self::import_media_by_live_id($featured_live_id);
        endif;

        $content = self::rewrite_content_media($content);

        $category_ids = [];
        if (!empty($item['categories']) && is_array($item['categories'])) :
            $category_ids = self::resolve_category_ids($item['categories']);
        endif;

        $tag_ids = [];
        if (!empty($item['tags']) && is_array($item['tags'])) :
            $tag_ids = self::resolve_tag_ids($item['tags']);
        endif;

        $referenced = [];
        if ($post_type === 'page' && !isset(self::$page_seen['page:' . $slug])) :
            self::$page_seen['page:' . $slug] = true;
            $referenced = self::sync_referenced_posts($content);
        endif;

        $existing = self::find_local_by_slug($slug, $post_type);

        $post_data = [
            'post_title'        => $title,
            'post_name'         => $slug,
            'post_content'      => $content,
            'post_status'       => $status === 'publish' ? 'publish' : 'draft',
            'post_type'         => $post_type,
            'post_date'         => $date,
            'post_date_gmt'     => get_gmt_from_date($date),
            'post_modified'     => $modified,
            'post_modified_gmt' => get_gmt_from_date($modified),
            'post_parent'       => $local_parent_id,
        ];

        if ($existing instanceof WP_Post) :
            $existing_thumb = (int) get_post_thumbnail_id($existing->ID);
            if ($existing->post_modified === $modified && $existing_thumb === $featured_local_id) :
                return [
                    'action'     => 'skipped',
                    'post_id'    => $existing->ID,
                    'referenced' => $referenced,
                ];
            endif;

            $post_data['ID'] = $existing->ID;
            $post_id = wp_update_post($post_data, true);
            if (is_wp_error($post_id)) : return $post_id;
            endif;
            $action = 'updated';
        else :
            $post_id = wp_insert_post($post_data, true);
            if (is_wp_error($post_id)) : return $post_id;
            endif;
            $action = 'inserted';
        endif;

        if ($featured_local_id > 0) :
            set_post_thumbnail($post_id, $featured_local_id);
        endif;

        if (!empty($category_ids)) :
            wp_set_post_categories($post_id, $category_ids);
        endif;

        if (!empty($tag_ids)) :
            wp_set_post_tags($post_id, $tag_ids);
        endif;

        update_post_meta($post_id, '_brisbane_live_id',   (int) ($item['id'] ?? 0));
        update_post_meta($post_id, '_brisbane_live_slug', $slug);

        return [
            'action'     => $action,
            'post_id'    => $post_id,
            'referenced' => $referenced,
        ];
    }

    private static function local_parent_id_for(int $live_parent_id): int
    {
        if ($live_parent_id <= 0) : return 0;
        endif;

        $remote = wp_remote_get(MenuController::live_root() . '/pages/' . $live_parent_id, ['timeout' => 30]);
        if (is_wp_error($remote)) : return 0;
        endif;

        $item = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($item) || empty($item['slug'])) : return 0;
        endif;

        $local = self::find_local_by_slug($item['slug'], 'page');
        return $local instanceof WP_Post ? (int) $local->ID : 0;
    }

    private static function sync_parent_chain(int $live_parent_id, string $post_type): void
    {
        $key = 'parent:' . $live_parent_id;
        if (isset(self::$page_seen[$key])) : return;
        endif;
        self::$page_seen[$key] = true;

        $endpoint = $post_type === 'page' ? 'pages' : 'posts';

        $remote = wp_remote_get(
            MenuController::live_root() . '/' . $endpoint . '/' . $live_parent_id,
            ['timeout' => 60]
        );
        if (is_wp_error($remote)) : return;
        endif;

        $item = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($item) || empty($item['slug'])) : return;
        endif;

        self::import_page($item, $post_type);
    }

    private static function sync_referenced_posts(string $html): array
    {
        $slugs = self::extract_referenced_posts($html);
        if (empty($slugs)) : return [];
        endif;

        $imported = [];

        foreach ($slugs as $slug) :

            $seen_key = 'ref_post:' . $slug;
            if (isset(self::$page_seen[$seen_key])) : continue;
            endif;
            self::$page_seen[$seen_key] = true;

            $existing = self::find_local_by_slug($slug, 'post');
            if ($existing) :
                $imported[] = [
                    'slug'   => $slug,
                    'action' => 'exists',
                    'id'     => $existing->ID,
                ];
                continue;
            endif;

            $remote = wp_remote_get(
                MenuController::live_root() . '/posts?slug=' . rawurlencode($slug),
                ['timeout' => 30]
            );
            if (is_wp_error($remote)) : continue;
            endif;

            $items = json_decode(wp_remote_retrieve_body($remote), true);
            if (!is_array($items) || empty($items)) : continue;
            endif;

            $result = self::import_page($items[0], 'post');

            if (!is_wp_error($result)) :
                $imported[] = [
                    'slug'   => $slug,
                    'action' => $result['action'],
                    'id'     => $result['post_id'],
                ];
            endif;

        endforeach;

        return $imported;
    }

    private static function extract_referenced_posts(string $html): array
    {
        if (trim($html) === '') : return [];
        endif;

        $slugs = [];

        if (preg_match_all(
            '#<a[^>]+href=["\']https?://' . preg_quote(MenuController::CANONICAL_HOST, '#') . '/([a-z0-9-]+)/?["\']#i',
            $html,
            $matches
        )) :
            foreach ($matches[1] as $slug) :
                $slug = strtolower($slug);

                $skip = ['wp-admin', 'wp-content', 'wp-json', 'wp-includes', 'feed', 'category', 'tag', 'author'];
                if (in_array($slug, $skip, true)) : continue;
                endif;

                $slugs[$slug] = true;
            endforeach;
        endif;

        return array_keys($slugs);
    }

    private static function find_local_by_slug(string $slug, string $post_type): ?WP_Post
    {
        $q = new WP_Query([
            'post_type'      => $post_type,
            'name'           => $slug,
            'posts_per_page' => 1,
            'post_status'    => ['publish', 'draft', 'pending', 'private'],
        ]);

        return $q->have_posts() ? $q->posts[0] : null;
    }

    private static function link_page_parents(array $items, string $post_type): void
    {
        $live_id_to_slug = [];
        foreach ($items as $item) :
            $id   = (int) ($item['id'] ?? 0);
            $slug = $item['slug'] ?? '';
            if ($id && $slug) : $live_id_to_slug[$id] = $slug;
            endif;
        endforeach;

        foreach ($items as $item) :
            $slug = $item['slug'] ?? '';
            $parent_live = (int) ($item['parent'] ?? 0);
            if ($slug === '' || $parent_live === 0) : continue;
            endif;
            if (!isset($live_id_to_slug[$parent_live])) : continue;
            endif;

            $child  = self::find_local_by_slug($slug, $post_type);
            $parent = self::find_local_by_slug($live_id_to_slug[$parent_live], $post_type);
            if (!$child || !$parent) : continue;
            endif;

            wp_update_post([
                'ID'          => $child->ID,
                'post_parent' => $parent->ID,
            ]);
        endforeach;
    }

    /* ==============================================================
     * MEDIA
     * ============================================================== */

    private static function import_media_by_live_id(int $live_id): int
    {
        $cache_key = 'live_id_' . $live_id;
        if (isset(self::$media_cache[$cache_key])) :
            return self::$media_cache[$cache_key];
        endif;

        $remote = wp_remote_get(MenuController::live_root() . '/media/' . $live_id, ['timeout' => 30]);
        if (is_wp_error($remote)) : return 0;
        endif;

        $item = json_decode(wp_remote_retrieve_body($remote), true);
        if (!is_array($item) || empty($item['source_url'])) : return 0;
        endif;

        $local_id = self::import_media_by_url(
            $item['source_url'],
            $item['title']['rendered'] ?? '',
            $item['alt_text'] ?? ''
        );

        self::$media_cache[$cache_key] = $local_id;
        return $local_id;
    }

    private static function import_media_by_url(string $url, string $title = '', string $alt = ''): int
    {
        $url = trim($url);
        if ($url === '') : return 0;
        endif;

        if (isset(self::$media_cache[$url])) :
            return self::$media_cache[$url];
        endif;

        $existing = self::find_attachment_by_source_url($url);
        if ($existing) :
            self::$media_cache[$url] = $existing;
            return $existing;
        endif;

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $tmp = download_url($url, 60);
        if (is_wp_error($tmp)) : return 0;
        endif;

        $file_array = [
            'name'     => basename(parse_url($url, PHP_URL_PATH)),
            'tmp_name' => $tmp,
        ];

        $attachment_id = media_handle_sideload($file_array, 0, $title ?: null);
        if (is_wp_error($attachment_id)) :
            @unlink($tmp);
            return 0;
        endif;

        if ($alt !== '') :
            update_post_meta($attachment_id, '_wp_attachment_image_alt', $alt);
        endif;

        update_post_meta($attachment_id, '_brisbane_source_url', $url);

        self::$media_cache[$url] = $attachment_id;
        return $attachment_id;
    }

    private static function find_attachment_by_source_url(string $url): int
    {
        $q = new WP_Query([
            'post_type'      => 'attachment',
            'post_status'    => 'inherit',
            'posts_per_page' => 1,
            'meta_key'       => '_brisbane_source_url',
            'meta_value'     => $url,
            'fields'         => 'ids',
        ]);

        return $q->have_posts() ? (int) $q->posts[0] : 0;
    }

    private static function rewrite_content_media(string $html): string
    {
        if (trim($html) === '') : return $html;
        endif;

        return preg_replace_callback(
            '#(<img[^>]+src=["\'])(https?://' . preg_quote(MenuController::CANONICAL_HOST, '#') . '[^"\']+)(["\'])#i',
            function ($m) {
                $url      = $m[2];
                $local_id = self::import_media_by_url($url);

                if ($local_id > 0) :
                    $local_url = wp_get_attachment_url($local_id);
                    if ($local_url) :
                        return $m[1] . esc_url($local_url) . $m[3];
                    endif;
                endif;

                return $m[0];
            },
            $html
        );
    }

    private static function sync_all_media()
    {
        $page = 1;
        $imported = 0;
        $skipped  = 0;

        do {
            $remote = wp_remote_get(
                MenuController::live_root() . '/media?per_page=100&page=' . $page,
                ['timeout' => 60]
            );
            if (is_wp_error($remote)) : break;
            endif;

            $items = json_decode(wp_remote_retrieve_body($remote), true);
            if (!is_array($items) || empty($items)) : break;
            endif;

            foreach ($items as $item) :
                $url = $item['source_url'] ?? '';
                if ($url === '') : continue;
                endif;

                if (self::find_attachment_by_source_url($url)) :
                    $skipped++;
                    continue;
                endif;

                $id = self::import_media_by_url(
                    $url,
                    $item['title']['rendered'] ?? '',
                    $item['alt_text'] ?? ''
                );
                if ($id > 0) : $imported++;
                endif;
            endforeach;

            $page++;
        } while (count($items) === 100);

        return rest_ensure_response([
            'synced_at' => current_time('c'),
            'imported'  => $imported,
            'skipped'   => $skipped,
        ]);
    }

    /* ==============================================================
     * TAXONOMY — ensure_* (create on demand) + resolve_*
     * ============================================================== */

    private static function ensure_category(array $item): int
    {
        $slug = $item['slug'] ?? '';
        if ($slug === '' || $slug === 'uncategorized') : return 0;
        endif;

        $key = 'cat:' . $slug;
        if (isset(self::$term_cache[$key]) && self::$term_cache[$key] > 0) :
            return self::$term_cache[$key];
        endif;

        $term = get_term_by('slug', $slug, 'category');
        $args = [
            'name'        => html_entity_decode($item['name'] ?? $slug, ENT_QUOTES | ENT_HTML5),
            'slug'        => $slug,
            'description' => html_entity_decode($item['description'] ?? '', ENT_QUOTES | ENT_HTML5),
        ];

        $parent_live_id = (int) ($item['parent'] ?? 0);
        if ($parent_live_id > 0) :
            $parent_key = 'live_cat_parent:' . $parent_live_id;
            if (isset(self::$term_cache[$parent_key])) :
                $args['parent'] = self::$term_cache[$parent_key];
            else :
                $parent_remote = wp_remote_get(MenuController::live_root() . '/categories/' . $parent_live_id, ['timeout' => 15]);
                if (!is_wp_error($parent_remote)) :
                    $parent_item = json_decode(wp_remote_retrieve_body($parent_remote), true);
                    if (is_array($parent_item) && !empty($parent_item['slug'])) :
                        $parent_local_id = self::ensure_category($parent_item);
                        if ($parent_local_id > 0) :
                            $args['parent'] = $parent_local_id;
                            self::$term_cache[$parent_key] = $parent_local_id;
                        endif;
                    endif;
                endif;
            endif;
        endif;

        if ($term) :
            wp_update_term($term->term_id, 'category', $args);
            self::$term_cache[$key] = (int) $term->term_id;
            return (int) $term->term_id;
        endif;

        $res = wp_insert_term($args['name'], 'category', $args);
        if (is_wp_error($res)) : return 0;
        endif;

        self::$term_cache[$key] = (int) $res['term_id'];
        return (int) $res['term_id'];
    }

    private static function ensure_tag(array $item): int
    {
        $slug = $item['slug'] ?? '';
        if ($slug === '') : return 0;
        endif;

        $key = 'tag:' . $slug;
        if (isset(self::$term_cache[$key]) && self::$term_cache[$key] > 0) :
            return self::$term_cache[$key];
        endif;

        $term = get_term_by('slug', $slug, 'post_tag');
        $args = [
            'name'        => html_entity_decode($item['name'] ?? $slug, ENT_QUOTES | ENT_HTML5),
            'slug'        => $slug,
            'description' => html_entity_decode($item['description'] ?? '', ENT_QUOTES | ENT_HTML5),
        ];

        if ($term) :
            wp_update_term($term->term_id, 'post_tag', $args);
            self::$term_cache[$key] = (int) $term->term_id;
            return (int) $term->term_id;
        endif;

        $res = wp_insert_term($args['name'], 'post_tag', $args);
        if (is_wp_error($res)) : return 0;
        endif;

        self::$term_cache[$key] = (int) $res['term_id'];
        return (int) $res['term_id'];
    }

    private static function resolve_category_ids(array $live_ids): array
    {
        $out = [];

        foreach ($live_ids as $live_id) :
            $live_id = (int) $live_id;
            if (!$live_id) : continue;
            endif;

            $remote = wp_remote_get(MenuController::live_root() . '/categories/' . $live_id, ['timeout' => 15]);
            if (is_wp_error($remote)) : continue;
            endif;

            $item = json_decode(wp_remote_retrieve_body($remote), true);
            if (!is_array($item)) : continue;
            endif;

            $local_id = self::ensure_category($item);
            if ($local_id > 0) : $out[] = $local_id;
            endif;
        endforeach;

        return $out;
    }

    private static function resolve_tag_ids(array $live_ids): array
    {
        $out = [];

        foreach ($live_ids as $live_id) :
            $live_id = (int) $live_id;
            if (!$live_id) : continue;
            endif;

            $remote = wp_remote_get(MenuController::live_root() . '/tags/' . $live_id, ['timeout' => 15]);
            if (is_wp_error($remote)) : continue;
            endif;

            $item = json_decode(wp_remote_retrieve_body($remote), true);
            if (!is_array($item)) : continue;
            endif;

            $local_id = self::ensure_tag($item);
            if ($local_id > 0) : $out[] = $local_id;
            endif;
        endforeach;

        return $out;
    }

    /* ==============================================================
     * Utility
     * ============================================================== */

    private static function fetch_all_live(string $endpoint): array
    {
        $all  = [];
        $page = 1;

        do {
            $remote = wp_remote_get(
                MenuController::live_root() . $endpoint . '?per_page=100&page=' . $page,
                ['timeout' => 60]
            );
            if (is_wp_error($remote)) : break;
            endif;

            $items = json_decode(wp_remote_retrieve_body($remote), true);
            if (!is_array($items) || empty($items)) : break;
            endif;

            $all  = array_merge($all, $items);
            $page++;
        } while (count($items) === 100);

        return $all;
    }

    private static function count_local(string $post_type): int
    {
        $counts = wp_count_posts($post_type);
        return (int) ($counts->publish ?? 0) + (int) ($counts->draft ?? 0);
    }

    private static function reset_caches(): void
    {
        self::$media_cache = [];
        self::$term_cache  = [];
        self::$block_map   = [];
        self::$page_seen   = [];
    }
}
