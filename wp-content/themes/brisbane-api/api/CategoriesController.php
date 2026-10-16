<?php

if (!defined('ABSPATH')) :
    exit;
endif;


class CategoriesController
{
    /*
     * For Live site: https://brisbanelogistics.com.au/wp-json/wp/v2/categories
     * For Local site: http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/categories
     *
     * All live requests resolve through MenuController::live_root(),
     * which returns either:
     *   - this site's own REST endpoint (when running on the canonical host), or
     *   - the canonical live site's REST endpoint (everywhere else).
     */

    private static function categories(): array
    {
        $cache_key = 'brisbane_categories_tree_v1';
        $cached    = get_transient($cache_key);

        if (is_array($cached)) :
            return $cached;
        endif;

        $remote = wp_remote_get(MenuController::live_root() . '/categories', [
            'timeout' => 15,
        ]);

        if (is_wp_error($remote)) :
            return [];
        endif;

        $json_decode = json_decode(wp_remote_retrieve_body($remote), true);

        if (!is_array($json_decode)) :
            return [];
        endif;

        // 1) Index every category by id, skip Uncategorized
        $items = [];

        foreach ($json_decode as $raw) :

            if (($raw['slug'] ?? '') === 'uncategorized') :
                continue;
            endif;

            $id = (int) ($raw['id'] ?? 0);

            if ($id === 0) :
                continue;
            endif;

            $items[$id] = [
                'id'          => $id,
                'parent_id'   => (int) ($raw['parent'] ?? 0),
                'name'        => $raw['name']        ?? '',
                'slug'        => $raw['slug']        ?? '',
                'description' => $raw['description'] ?? '',
            ];

        endforeach;

        // 2) Build id → slug map so we can resolve parent slugs
        $id_to_slug = [];

        foreach ($items as $id => $item) :
            $id_to_slug[$id] = $item['slug'];
        endforeach;

        // 3) Recursively build the tree starting from top-level (parent_id = 0)
        $tree = self::build_tree($items, $id_to_slug, 0);

        set_transient($cache_key, $tree, 15 * MINUTE_IN_SECONDS);

        return $tree;
    }

    private static function build_tree(array &$items, array $id_to_slug, int $parent_id): array
    {
        $branch = [];

        foreach ($items as $id => $item) :

            if ($item['parent_id'] !== $parent_id) :
                continue;
            endif;

            $branch[] = [
                'name'        => $item['name'],
                'slug'        => $item['slug'],
                'parent'      => $parent_id > 0
                    ? ($id_to_slug[$parent_id] ?? '')
                    : '',
                'description' => $item['description'],
                'children'    => self::build_tree($items, $id_to_slug, $id),
            ];

        endforeach;

        return $branch;
    }

    public static function content(WP_REST_Request $request)
    {
        $payload = [
            'categories' => self::categories(),
        ];

        return rest_ensure_response($payload);
    }

    public static function reset_cache(): void
    {
        delete_transient('brisbane_categories_tree_v1');
    }
}