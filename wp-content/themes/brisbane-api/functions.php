<?php

add_theme_support('title-tag');

require_once get_template_directory() . '/api/MenuController.php';
require_once get_template_directory() . '/api/ContentController.php';
require_once get_template_directory() . '/api/CategoriesController.php';
require_once get_template_directory() . '/api/PageController.php';
require_once get_template_directory() . '/api/TestController.php';

function brisbane_assets() {
    $dir = get_template_directory();
    $rel = get_template_directory_uri();

    // Handle WordPress generates for js/main.js inside the loop below.
    $main_handle = 'brisbane-script-js/main.js';

    $styles = [
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
        'css/main.css',
        'css/loader.css',
        'css/hero-custom.css',
        'css/section-custom.css',
        'css/footer.css',
        'css/stylesheet.css',
    ];

    $scripts = [
        // file              => deps
        'js/main.js'         => ['jquery'],
        'js/animation.js'    => ['jquery', $main_handle],
        'js/content.js'      => ['jquery', $main_handle],
    ];

    /* ---- Styles ---- */
    foreach ($styles as $i => $file) {
        if (preg_match('#^https?://#', $file)) {
            wp_enqueue_style("brisbane-style-$i", $file, [], null);
            continue;
        }

        $path = "$dir/$file";
        $ver  = file_exists($path) ? filemtime($path) : null;

        wp_enqueue_style("brisbane-style-$i", "$rel/$file", [], $ver);
    }

    /* ---- Scripts ---- */
    wp_enqueue_script('jquery');

    foreach ($scripts as $file => $deps) {
        $path = "$dir/$file";
        $ver  = file_exists($path) ? filemtime($path) : null;

        wp_enqueue_script("brisbane-script-$file", "$rel/$file", $deps, $ver, true);
    }

    wp_localize_script($main_handle, 'BL_CONFIG', [
        'apiBase' => rest_url('brisbane'),
        'homeUrl' => home_url('/'),
    ]);
}
add_action('wp_enqueue_scripts', 'brisbane_assets');

/**
 * Register REST routes
 */
add_action('rest_api_init', function () {
    register_rest_route('brisbane', '/site', [
        'methods'             => 'GET',
        'callback'            => ['MenuController', 'site'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/menu', [
        'methods'             => 'GET',
        'callback'            => ['MenuController', 'content'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/top-menu', [
        'methods'             => 'GET',
        'callback'            => ['MenuController', 'top_menu'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/client-tools', [
        'methods'  => 'GET',
        'callback' => ['MenuController', 'client_tools'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/breadcrumbs', [
        'methods'             => 'GET',
        'callback'            => ['ContentController', 'breadcrumbs'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/categories', [
        'methods'             => 'GET',
        'callback'            => ['CategoriesController', 'content'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/content', [
        'methods'             => 'GET',
        'callback'            => ['ContentController', 'content'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/pages', [
        'methods'             => 'GET',
        'callback'            => ['PagesController', 'content'],
        'permission_callback' => '__return_true',
    ]);

    /* Bulk sync endpoints */
    register_rest_route('brisbane', '/sync-all', [
        'methods'             => 'GET',
        'callback'            => ['PagesController', 'sync_everything'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/category-sync', [
        'methods'             => 'GET',
        'callback'            => ['PagesController', 'sync_categories'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/tag-sync', [
        'methods'             => 'GET',
        'callback'            => ['PagesController', 'sync_tags'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/block-sync', [
        'methods'             => 'GET',
        'callback'            => ['PagesController', 'sync_blocks'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/page-sync', [
        'methods'             => 'GET',
        'callback'            => ['PagesController', 'sync'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/post-sync', [
        'methods'             => 'GET',
        'callback'            => ['PagesController', 'sync_posts'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/media-sync', [
        'methods'             => 'GET',
        'callback'            => ['PagesController', 'sync_media'],
        'permission_callback' => '__return_true',
    ]);

    /* Single dispatcher */
    register_rest_route('brisbane', '/sync', [
        'methods'             => 'GET',
        'callback'            => ['PagesController', 'sync_single_dispatch'],
        'permission_callback' => '__return_true',
    ]);

    register_rest_route('brisbane', '/test', [
        'methods'             => 'GET',
        'callback'            => ['TestController', 'content'],
        'permission_callback' => '__return_true',
    ]);
});

/**
 * Breadcrumbs — reads from the local Brisbane API.
 */
function get_brisbane_breadcrumbs(string $slug): array
{
    static $cache = [];

    if (isset($cache[$slug])) {
        return $cache[$slug];
    }

    $url = home_url('/wp-json/brisbane/breadcrumbs?slug=' . rawurlencode($slug));

    $response = wp_remote_get($url, ['timeout' => 15]);

    if (is_wp_error($response)) {
        return $cache[$slug] = [];
    }

    $data = json_decode(wp_remote_retrieve_body($response), true);

    if (!is_array($data) || empty($data['breadcrumbs'])) {
        return $cache[$slug] = [];
    }

    return $cache[$slug] = $data['breadcrumbs'];
}

/**
 * Redirect the site root (/) to the /home/ permalink.
 * Environment-agnostic — uses home_url() so it works on local, staging, prod.
 */
add_action('template_redirect', function () {

    if (
        is_admin() ||
        wp_doing_ajax() ||
        wp_doing_cron() ||
        (defined('REST_REQUEST') && REST_REQUEST) ||
        (defined('WP_CLI') && WP_CLI)
    ) :
        return;
    endif;

    if (!is_front_page()) :
        return;
    endif;

    $request_uri = trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '', '/');
    $home_path   = trim(parse_url(home_url('/'), PHP_URL_PATH) ?? '', '/');

    if ($home_path !== '' && strpos($request_uri, $home_path) === 0) :
        $request_uri = trim(substr($request_uri, strlen($home_path)), '/');
    endif;

    if ($request_uri !== '') :
        return;
    endif;

    wp_safe_redirect(MenuController::home_permalink(), 301);
    exit;

}, 1);

