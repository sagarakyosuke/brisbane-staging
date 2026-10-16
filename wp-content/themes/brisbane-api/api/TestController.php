<?php

if (!defined('ABSPATH')) :
    exit;
endif;


class TestController
{
    const LIVE_SITE = 'https://brisbanelogistics.com.au';

    /* ---------------------------------------------------------------
     * GET /wp-json/brisbane/test
     *
     * Fetches the site identity from the LIVE site's homepage HTML.
     * Cached 1 hour so we don't hammer the live site.
     * --------------------------------------------------------------- */

    public static function content(WP_REST_Request $request)
    {
        $identity = self::live_identity();

        $payload = [
            'name'    => $identity['name']    ?? '',
            'tagline' => $identity['tagline'] ?? '',
            'home'    => home_url('/'),
            'logo'    => [
                'url' => $identity['logo'] ?? '',
                'alt' => 'Brisbane Logistics',
            ],
            'icon'    => [
                'url' => $identity['icon'] ?? '',
            ],
        ];

        return rest_ensure_response($payload);
    }

    /* ---------------------------------------------------------------
     * Scrape the live site's <head> for the favicon + logo.
     * Both are found in the HTML on first load.
     * --------------------------------------------------------------- */

    private static function live_identity(): array
    {
        $cache_key = 'brisbane_live_identity';
        $cached    = get_transient($cache_key);

        if (is_array($cached)) :
            return $cached;
        endif;

        $remote = wp_remote_get(self::LIVE_SITE . '/', [
            'timeout' => 20,
        ]);

        if (is_wp_error($remote)) :
            return [];
        endif;

        $html = wp_remote_retrieve_body($remote);

        if ($html === '') :
            return [];
        endif;

        $identity = [
            'name'    => self::match_title($html),
            'tagline' => '',
            'logo'    => self::match_logo($html),
            'icon'    => self::match_icon($html),
        ];

        set_transient($cache_key, $identity, HOUR_IN_SECONDS);

        return $identity;
    }

    private static function match_title(string $html): string
    {
        if (preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m)) :
            return html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5);
        endif;
        return '';
    }

    private static function match_logo(string $html): string
    {
        // site-logo img, or the first <img> inside a <header> block
        if (preg_match('#<img[^>]+class="[^"]*custom-logo[^"]*"[^>]+src="([^"]+)"#i', $html, $m)) :
            return $m[1];
        endif;

        if (preg_match('#<img[^>]+src="([^"]+)"[^>]+class="[^"]*custom-logo[^"]*"#i', $html, $m)) :
            return $m[1];
        endif;

        if (preg_match('#<header[^>]*>.*?<img[^>]+src="([^"]+)"#is', $html, $m)) :
            return $m[1];
        endif;

        return '';
    }

    private static function match_icon(string $html): string
    {
        if (preg_match('#<link[^>]+rel="[^"]*icon[^"]*"[^>]+href="([^"]+)"#i', $html, $m)) :
            return $m[1];
        endif;

        if (preg_match('#<link[^>]+href="([^"]+)"[^>]+rel="[^"]*icon[^"]*"#i', $html, $m)) :
            return $m[1];
        endif;

        return '';
    }
}