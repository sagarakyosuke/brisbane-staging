<?php

if (!defined('ABSPATH')) :
    exit;
endif;


class MenuController
{
    /*
     * This class is the environment resolver — the single source of truth
     * for every live URL used by the Brisbane API controllers.
     *
     *   is_production()   → true when running on the canonical host
     *   live_root()       → the live REST API base (self on prod, canonical elsewhere)
     *   site_root()       → the live site base (for HTML scraping)
     *   home_permalink()  → the /home/ permalink in the current environment
     *
     * For Live site:  https://brisbanelogistics.com.au/wp-json/wp/v2
     * For Local site: http://localhost/projects/brisbane-logistics/app/wp-json/brisbane
     *
     * Endpoints:
     *   Menu (v2):     http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/menu
     *   Top menu:      http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/top-menu
     *   Site identity: http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/site
     *
     * For Synchronize:
     *   See PageController.php — sync endpoints are owned by PagesController.
     */

    /* ==============================================================
     * Environment resolver — the single source of truth.
     * The ONLY place the production domain is written.
     * ============================================================== */

    const CANONICAL_HOST = 'brisbanelogistics.com.au';

    const MENU_V2_ID  = 34;
    const TOP_MENU_ID = 120;
    const CLIENT_TOOLS_MENU_ID = 130;

    private static ?bool $is_production = null;

    public static function is_production(): bool
    {
        if (self::$is_production !== null) :
            return self::$is_production;
        endif;

        $host = parse_url(home_url('/'), PHP_URL_HOST);
        $host = is_string($host) ? strtolower($host) : '';

        self::$is_production = ($host === self::CANONICAL_HOST);

        return self::$is_production;
    }

    /**
     * Base URL for the live REST API.
     * Production  → this site's own REST endpoint (no external HTTP).
     * Everywhere else → the canonical live site.
     */
    public static function live_root(): string
    {
        if (self::is_production()) :
            return home_url('/wp-json/wp/v2');
        endif;

        return 'https://' . self::CANONICAL_HOST . '/wp-json/wp/v2';
    }

    /**
     * Base URL for the live site itself.
     * Used for HTML scraping (logo / icon fallback).
     */
    public static function site_root(): string
    {
        if (self::is_production()) :
            return home_url('/');
        endif;

        return 'https://' . self::CANONICAL_HOST;
    }

    /**
     * The public home permalink for the current environment.
     * Local:   http://localhost/…/home/
     * Staging: https://staging.example.com/home/
     * Prod:    https://brisbanelogistics.com.au/home/
     */
    public static function home_permalink(): string
    {
        return home_url('/home/');
    }

    /* ==============================================================
     * REST entry points
     * ============================================================== */

    public static function content(WP_REST_Request $request)
    {
        return self::respond(self::MENU_V2_ID);
    }

    public static function client_tools(WP_REST_Request $request)
    {
        return self::respond(self::CLIENT_TOOLS_MENU_ID);
    }

    public static function top_menu(WP_REST_Request $request)
    {
        return self::respond(self::TOP_MENU_ID);
    }

    public static function site(WP_REST_Request $request)
    {
        return rest_ensure_response(self::fetch_live_identity());
    }

    /* ==============================================================
     * Site identity
     * ============================================================== */

    private static function fetch_live_identity(): array
    {
        $cache_key = 'brisbane_live_identity_v1';
        $cached    = get_transient($cache_key);

        if (is_array($cached) && !empty($cached['logo']['url'])) :
            return $cached;
        endif;

        $root = self::live_get('/wp-json/');

        $name    = $root['name']        ?? '';
        $tagline = $root['description'] ?? '';

        $logo_url = self::live_site_logo_url();
        $icon_url = self::live_site_icon_url();

        $payload = [
            'name'    => html_entity_decode($name, ENT_QUOTES | ENT_HTML5),
            'tagline' => html_entity_decode($tagline, ENT_QUOTES | ENT_HTML5),
            'home'    => home_url('/'),
            'logo'    => [
                'id'  => 0,
                'url' => $logo_url,
                'alt' => 'Brisbane Logistics',
            ],
            'icon'    => [
                'id'  => 0,
                'url' => $icon_url,
            ],
        ];

        set_transient($cache_key, $payload, HOUR_IN_SECONDS);

        return $payload;
    }

    private static function live_site_logo_url(): string
    {
        $media = self::live_get('/wp-json/wp/v2/media?search=logo&per_page=5');
        if (is_array($media)) :
            foreach ($media as $item) :
                $src = $item['source_url'] ?? '';
                if ($src !== '') :
                    return $src;
                endif;
            endforeach;
        endif;

        $html = self::live_get_html('/');
        if ($html !== '') :
            if (preg_match('#<img[^>]+class="[^"]*custom-logo[^"]*"[^>]+src="([^"]+)"#i', $html, $m)) :
                return $m[1];
            endif;
            if (preg_match('#<img[^>]+src="([^"]+)"[^>]+class="[^"]*custom-logo[^"]*"#i', $html, $m)) :
                return $m[1];
            endif;
        endif;

        return '';
    }

    private static function live_site_icon_url(): string
    {
        foreach (['favicon', 'icon'] as $term) :
            $media = self::live_get('/wp-json/wp/v2/media?search=' . $term . '&per_page=5');
            if (is_array($media)) :
                foreach ($media as $item) :
                    $src = $item['source_url'] ?? '';
                    if ($src !== '') :
                        return $src;
                    endif;
                endforeach;
            endif;
        endforeach;

        $html = self::live_get_html('/');
        if ($html !== '') :
            if (preg_match('#<link[^>]+rel="[^"]*icon[^"]*"[^>]+href="([^"]+)"#i', $html, $m)) :
                return $m[1];
            endif;
            if (preg_match('#<link[^>]+href="([^"]+)"[^>]+rel="[^"]*icon[^"]*"#i', $html, $m)) :
                return $m[1];
            endif;
        endif;

        return '';
    }

    /* ==============================================================
     * HTTP helpers
     * ============================================================== */

    private static function live_get(string $path): array
    {
        $remote = wp_remote_get(self::site_root() . $path, ['timeout' => 20]);

        if (is_wp_error($remote)) :
            return [];
        endif;

        $data = json_decode(wp_remote_retrieve_body($remote), true);

        return is_array($data) ? $data : [];
    }

    private static function live_get_html(string $path): string
    {
        $remote = wp_remote_get(self::site_root() . $path, ['timeout' => 20]);

        if (is_wp_error($remote)) :
            return '';
        endif;

        return (string) wp_remote_retrieve_body($remote);
    }

    /* ==============================================================
     * Menu tree
     * ============================================================== */

    private static function respond(int $menu_id): WP_REST_Response
    {
        $items = self::fetch_menu_items($menu_id);

        if (empty($items)) :
            return rest_ensure_response(['menu' => []]);
        endif;

        return rest_ensure_response([
            'menu' => self::build_tree($items),
        ]);
    }

    private static function fetch_menu_items(int $menu_id): array
    {
        $remote = wp_remote_get(
            self::live_root() . '/menu-items?per_page=100',
            ['timeout' => 15]
        );

        if (is_wp_error($remote)) :
            return [];
        endif;

        $items = json_decode(wp_remote_retrieve_body($remote), true);

        if (!is_array($items)) :
            return [];
        endif;

        $filtered = [];
        foreach ($items as $item) :
            if ((int) ($item['menus'] ?? 0) === $menu_id) :
                $filtered[] = $item;
            endif;
        endforeach;

        return $filtered;
    }

    private static function build_tree(array $items): array
    {
        usort($items, function ($a, $b) {
            $ao = (int) ($a['menu_order'] ?? 0);
            $bo = (int) ($b['menu_order'] ?? 0);
            if ($ao === $bo) :
                return ((int) $a['id']) <=> ((int) $b['id']);
            endif;
            return $ao <=> $bo;
        });

        $by_id = [];

        foreach ($items as $item) :
            $id = (int) $item['id'];

            $by_id[$id] = [
                'id'          => $id,
                'label'       => html_entity_decode($item['title']['rendered'] ?? '', ENT_QUOTES | ENT_HTML5),
                'link'        => self::to_relative($item['url'] ?? ''),
                'target'      => $item['target'] ?? '',
                'description' => html_entity_decode($item['description'] ?? '', ENT_QUOTES | ENT_HTML5),
                'icon'        => self::icon_from_classes($item['classes'] ?? []),
                'children'    => [],
            ];
        endforeach;

        $roots = [];

        foreach ($items as $item) :
            $id     = (int) $item['id'];
            $parent = (int) ($item['parent'] ?? 0);

            if ($parent > 0 && isset($by_id[$parent])) :
                $by_id[$parent]['children'][] = &$by_id[$id];
            else :
                $roots[] = &$by_id[$id];
            endif;
        endforeach;

        unset($by_id);

        return $roots;
    }

    /* ==============================================================
     * URL resolver — environment-agnostic.
     * ============================================================== */

    private static function to_relative(string $url): string
    {
        $url = trim($url);

        if ($url === '' || $url === '#') :
            return '#';
        endif;

        $live_base = self::site_root();
        $live_host = self::CANONICAL_HOST;

        /* ---- 1) Placeholder / malformed URLs ----
         * Anything pointing at an invalid host (e.g. "http://home")
         * gets rewritten to the current environment's home permalink. */
        $host = parse_url($url, PHP_URL_HOST);

        if (is_string($host) && $host !== '') :
            $host_lower = strtolower($host);

            $is_placeholder =
                $host_lower === 'home' ||
                (
                    $host_lower !== 'localhost' &&
                    $host_lower !== '127.0.0.1' &&
                    strpos($host_lower, '.') === false
                );

            if ($is_placeholder) :
                return self::home_permalink();
            endif;
        endif;

        /* ---- 2) Canonical host → local equivalent ---- */
        if (strpos($url, 'https://' . $live_host) === 0) :
            $path = substr($url, strlen('https://' . $live_host));
            return home_url($path === '' ? '/' : $path);
        endif;

        /* ---- 2b) Bare "home" style permalinks — normalize trailing slash ---- */
        if (strtolower(trim($url, '/')) === 'home') :
            return self::home_permalink();
        endif;

        if (strpos($url, 'http://' . $live_host) === 0) :
            $path = substr($url, strlen('http://' . $live_host));
            return home_url($path === '' ? '/' : $path);
        endif;

        if (strpos($url, $live_base) === 0) :
            $path = substr($url, strlen($live_base));
            return home_url($path === '' ? '/' : $path);
        endif;

        /* ---- 3) Relative URLs ---- */
        if ($url[0] === '/') :

            // Special-case "/home" (with or without trailing slash) so it
            // always resolves to the exact /home/ permalink — matches the
            // template_redirect rule in functions.php and avoids a
            // mid-redirect on click.
            if (strtolower(rtrim($url, '/')) === '/home') :
                return self::home_permalink();
            endif;

            return home_url($url);
        endif;

        /* ---- 4) Bare "home" string ---- */
        if (strtolower(rtrim($url, '/')) === 'home') :
            return self::home_permalink();
        endif;

        return $url;
    }

    private static function icon_from_classes(array $classes): string
    {
        $fa = [];

        foreach ($classes as $c) :
            if (strpos($c, 'fa-') === 0) :
                $fa[] = $c;
            endif;
        endforeach;

        return implode(' ', $fa);
    }
}
