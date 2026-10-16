<?php

if (!defined('ABSPATH')) :
    exit;
endif;


class ContentController
{
    /*
     * All live requests now resolve through MenuController::live_root(),
     * which returns either:
     *   - this site's own REST endpoint (when running on the canonical host), or
     *   - the canonical live site's REST endpoint (everywhere else).
     */

    /*
     * For Live site:  https://brisbanelogistics.com.au/wp-json/wp/v2
     * For Local site: http://localhost/projects/brisbane-logistics/app/wp-json/brisbane
     *
     * Endpoints:
     *   Single page:  http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/content?slug=about-us
     *   Full dump:    http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/content
     *   Breadcrumbs:  http://localhost/projects/brisbane-logistics/app/wp-json/brisbane/breadcrumbs?slug=about-us
     *
     * For Synchronize:
     *   See PageController.php — sync endpoints are owned by PagesController.
     */
    public static function content(WP_REST_Request $request)
    {
        $slug = trim((string) $request->get_param('slug'));

        if ($slug !== '') :
            // Single page — fetch and parse only that one.
            $payload = [
                'website'      => 'Brisbane LOGISTICS',
                'page-content' => [
                    'categories' => [],       // skip; not needed for single page
                    'pages'      => self::single_page($slug),
                ],
            ];

            return rest_ensure_response($payload);
        endif;

        // No slug → full dump (fallback).
        $payload = [
            'website'      => 'Brisbane LOGISTICS',
            'page-content' => [
                'categories' => self::categories(),
                'pages'      => self::pages(),
            ],
        ];

        return rest_ensure_response($payload);
    }

    /* Fetch and parse a single page by slug. */
    private static function single_page(string $slug): array
    {
        // Try as a page first, then as a post.
        $item = self::find_post($slug);

        if (!$item) :
            return [];
        endif;

        $parsed = self::build_page_content($slug);

        return [
            [
                'name'     => $parsed['name']     ?? ($item['title']['rendered'] ?? ''),
                'slug'     => $parsed['slug']     ?? $slug,
                'category' => $parsed['category'] ?? '',
                'content'  => $parsed['content']  ?? [],
            ],
        ];
    }

    public static function breadcrumbs(WP_REST_Request $request)
    {
        $slug = (string) $request->get_param('slug');

        if ($slug === '') :
            return rest_ensure_response(['breadcrumbs' => []]);
        endif;

        return rest_ensure_response([
            'breadcrumbs' => self::build_breadcrumbs($slug),
        ]);
    }

    private static function categories(): array
    {
        $cache_key = 'brisbane_categories_v1';
        $cached    = get_transient($cache_key);

        if (is_array($cached)) :
            return $cached;
        endif;

        $data = CategoriesController::content(new WP_REST_Request())->get_data();
        $cats = $data['categories'] ?? [];

        set_transient($cache_key, $cats, 15 * MINUTE_IN_SECONDS);

        return $cats;
    }

    private static function pages(): array
    {
        $categories   = self::categories();
        $slug_to_name = [];

        self::flatten($categories, $slug_to_name);

        $response = PagesController::content();
        $data     = $response->get_data();

        $pages = $data['pages'] ?? [];

        foreach ($pages as &$page) :

            $slug = $page['category'] ?? '';

            $page['category'] = ($slug !== '' && isset($slug_to_name[$slug]))
                ? $slug_to_name[$slug]
                : '';

            $parsed = self::build_page_content($page['slug'] ?? '');

            $page['content'] = $parsed['content'] ?? [];

        endforeach;
        unset($page);

        return $pages;
    }

    private static function raw_pages(): array
    {
        $cache_key = 'brisbane_raw_pages';
        $cached    = get_transient($cache_key);

        if (is_array($cached)) :
            return $cached;
        endif;

        $remote = wp_remote_get(MenuController::live_root() . '/pages?per_page=100', [
            'timeout' => 15,
        ]);

        if (is_wp_error($remote)) :
            return [];
        endif;

        $pages = json_decode(wp_remote_retrieve_body($remote), true);

        if (!is_array($pages)) :
            return [];
        endif;

        set_transient($cache_key, $pages, 5 * MINUTE_IN_SECONDS);

        return $pages;
    }

    private static function find_raw_page(string $slug): ?array
    {
        foreach (self::raw_pages() as $page) :
            if (($page['slug'] ?? '') === $slug) :
                return $page;
            endif;
        endforeach;

        return null;
    }

    private static function find_raw_page_by_id(int $id): ?array
    {
        foreach (self::raw_pages() as $page) :
            if ((int) ($page['id'] ?? 0) === $id) :
                return $page;
            endif;
        endforeach;

        return null;
    }

    private static function build_breadcrumbs(string $page_slug): array
    {
        $crumbs = [];

        $crumbs[] = [
            'label' => 'Home',
            'link'  => home_url('/'),
        ];

        $page_slug = trim($page_slug, '/');

        if ($page_slug === '' || strtolower($page_slug) === 'home') :
            return $crumbs;
        endif;

        $menu_response = MenuController::content(new WP_REST_Request());

        if (is_wp_error($menu_response)) :
            return $crumbs;
        endif;

        $menu_data = $menu_response->get_data();
        $items     = $menu_data['menu'] ?? [];

        if (empty($items)) :
            return $crumbs;
        endif;

        $path = self::find_menu_path($items, $page_slug);

        if (empty($path)) :
            return $crumbs;
        endif;

        foreach ($path as $i => $node) :

            $label = $node['label'] ?? '';
            $link  = $node['link'] ?? '';

            if ($label === '' || $link === '') :
                continue;
            endif;

            if ($i === 0 && strtolower($label) === 'home') :
                continue;
            endif;

            $crumbs[] = [
                'label' => $label,
                'link'  => $link,
            ];

        endforeach;

        return $crumbs;
    }

    private static function find_menu_path(array $items, string $target, array $parents = []): array
    {
        $target    = trim($target, '/');
        $home_path = trim(parse_url(home_url('/'), PHP_URL_PATH) ?? '', '/');

        foreach ($items as $item) :

            $link = $item['link'] ?? '';

            $parsed = parse_url($link, PHP_URL_PATH);
            $path   = trim($parsed ?? '', '/');

            if ($home_path !== '' && strpos($path, $home_path) === 0) :
                $path = trim(substr($path, strlen($home_path)), '/');
            endif;

            $current_path = array_merge($parents, [$item]);

            if ($path === $target) :
                return $current_path;
            endif;

            if (!empty($item['children'])) :
                $found = self::find_menu_path($item['children'], $target, $current_path);
                if (!empty($found)) :
                    return $found;
                endif;
            endif;

        endforeach;

        return [];
    }

    public static function build_page_content(string $slug): array
    {
        $post = self::find_post($slug);

        if (!$post) :
            return [
                'name'     => '',
                'slug'     => $slug,
                'category' => '',
                'content'  => [],
            ];
        endif;

        $html = $post['content']['rendered'] ?? '';
        $dom = self::load_dom($html);
        $breadcrumbs = self::build_breadcrumbs($slug);

        return [
            'name'     => $post['title']['rendered'] ?? '',
            'slug'     => $post['slug']              ?? '',
            'category' => self::category_name_for($slug),
            'content'  => [
                ['tabs' => self::parse_tabs($dom)],
                ['hero-content' => self::parse_hero($dom, $breadcrumbs)],
                ['section-contents' => self::parse_sections($dom)],
            ],
        ];
    }

    private static function find_post(string $slug): ?array
    {
        $remote = wp_remote_get(MenuController::live_root() . '/posts?slug=' . rawurlencode($slug), [
            'timeout' => 15,
        ]);

        if (is_wp_error($remote)) :
            return null;
        endif;

        $posts = json_decode(wp_remote_retrieve_body($remote), true);

        if (!is_array($posts) || empty($posts)) :
            return null;
        endif;

        return $posts[0];
    }

    private static function category_name_for(string $slug): string
    {
        $categories = self::categories();

        $map = [];
        self::flatten($categories, $map);

        return $map[$slug] ?? '';
    }

    private static function load_dom(string $html): ?DOMDocument
    {
        if (trim($html) === '') :
            return null;
        endif;

        $dom = new DOMDocument('1.0', 'UTF-8');

        libxml_use_internal_errors(true);

        $wrapped = '<?xml encoding="UTF-8">' . $html;
        $dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);

        libxml_clear_errors();

        return $dom;
    }

    private static function node_text(DOMNode $node): string
    {
        return trim(html_entity_decode($node->textContent ?? '', ENT_QUOTES | ENT_HTML5));
    }

    private static function elements_by_class(DOMNode $context, string $class): array
    {
        if (!($context instanceof DOMElement) && !($context instanceof DOMDocument)) :
            return [];
        endif;

        $dom  = $context instanceof DOMDocument ? $context : $context->ownerDocument;
        $xp   = new DOMXPath($dom);
        $node = $context instanceof DOMDocument ? $context->documentElement : $context;

        if (!$node) :
            return [];
        endif;

        $query  = './/*[contains(concat(" ", normalize-space(@class), " "), " ' . $class . ' ")]';
        $result = $xp->query($query, $node);

        if ($result === false || $result->length === 0) :
            return [];
        endif;

        $out = [];
        foreach ($result as $n) :
            $out[] = $n;
        endforeach;

        return $out;
    }

    private static function find_region_bounds(DOMDocument $dom): array
    {
        $xp = new DOMXPath($dom);

        $hero_h2     = null;
        $sections_h2 = null;

        $h2s = $xp->query('//h2[contains(concat(" ", normalize-space(@class), " "), " wp-block-heading ")]');

        if ($h2s === false) :
            return [null, null];
        endif;

        foreach ($h2s as $h2) :
            $text = self::node_text($h2);

            if ($text === 'Hero Content' && $hero_h2 === null) :
                $hero_h2 = $h2;
            elseif ($text === 'Section Contents' && $sections_h2 === null) :
                $sections_h2 = $h2;
            endif;
        endforeach;

        return [$hero_h2, $sections_h2];
    }

    private static function collect_from(DOMNode $start, ?DOMNode $end): DOMElement
    {
        $dom  = new DOMDocument('1.0', 'UTF-8');
        $root = $dom->createElement('div');
        $dom->appendChild($root);

        $node = $start->nextSibling;

        while ($node !== null) :

            if ($end !== null && $node->isSameNode($end)) :
                break;
            endif;

            $root->appendChild($dom->importNode($node, true));

            $node = $node->nextSibling;

        endwhile;

        return $root;
    }

    private static function parse_tabs(?DOMDocument $dom): array
    {
        if (!$dom) :
            return [];
        endif;

        $tabs = [];

        // 1) Hero block — the first Media & Text block in the "Hero Content" region.
        list($hero_h2, $sections_h2) = self::find_region_bounds($dom);

        if ($hero_h2) :
            $hero_el   = self::collect_from($hero_h2, $sections_h2);
            $hero_blocks = self::parse_hero_block_for_tab($hero_el);

            if (!empty($hero_blocks)) :
                $tabs[] = $hero_blocks;
            endif;
        endif;

        // 2) Section blocks — everything after "Section Contents".
        $blocks = self::extract_section_blocks($dom);

        foreach ($blocks as $block) :
            $tabs[] = [
                'section-id' => $block['section-id'],
                'label'      => $block['tab-label'],
            ];
        endforeach;

        return $tabs;
    }

    /* Extract a single tab entry from the hero region's Media & Text block. */
    private static function parse_hero_block_for_tab(DOMElement $hero_el): array
    {
        $media_divs = self::elements_by_class($hero_el, 'wp-block-media-text');

        if (empty($media_divs) || !($media_divs[0] instanceof DOMElement)) :
            return [];
        endif;

        $block = $media_divs[0];

        $anchor   = self::find_anchor($block, '');
        $tab_text = '';

        // Look for <h4> first.
        $h4s = $block->getElementsByTagName('h4');
        if ($h4s->length > 0) :
            $text = self::node_text($h4s->item(0));
            if ($text !== '') : $tab_text = $text;
            endif;
        endif;

        // Fall back to first <p> inside the content column (before <h2>).
        if ($tab_text === '') :
            foreach ($block->getElementsByTagName('div') as $inner) :
                if (strpos($inner->getAttribute('class'), 'wp-block-media-text__content') === false) :
                    continue;
                endif;

                foreach ($inner->childNodes as $node) :
                    if (!($node instanceof DOMElement)) : continue;
                    endif;
                    if ($node->tagName === 'h2') : break 2;
                    endif;
                    if ($node->tagName === 'p') :
                        $text = self::node_text($node);
                        if ($text !== '') :
                            $tab_text = $text;
                            break 2;
                        endif;
                    endif;
                endforeach;

                break;
            endforeach;
        endif;

        $tab_slug   = $tab_text !== '' ? self::slugify($tab_text) : '';
        $section_id = trim($tab_slug . '-' . $anchor, '-');

        return [
            'section-id' => $section_id,
            'label'      => $tab_text,
        ];
    }

    private static function parse_hero(?DOMDocument $dom, array $breadcrumbs = []): array
    {
        $empty_image = [
            'title'       => '',
            'img'         => '',
            'caption'     => '',
            'alt-text'    => '',
            'description' => '',
            'file-url'    => '',
        ];

        $default = [
            [
                'section-id'        => '',
                'tab-label'         => '',
                'hero-bread-crumbs' => $breadcrumbs,
                'hero-image'        => $empty_image,
                'hero-title'        => '',
                'hero-description'  => [
                    [
                        'paragraph' => '',
                        'list-text' => [],
                    ],
                ],
                'hero-actions'      => [
                    [
                        'links'   => [],
                        'buttons' => [],
                    ],
                ],
            ],
        ];

        if (!$dom) :
            return $default;
        endif;

        list($hero_h2, $sections_h2) = self::find_region_bounds($dom);

        if (!$hero_h2) :
            return $default;
        endif;

        $hero_el = self::collect_from($hero_h2, $sections_h2);

        $hero_section_id = '';
        $hero_tab_label  = '';

        $media_divs = self::elements_by_class($hero_el, 'wp-block-media-text');

        if (!empty($media_divs) && $media_divs[0] instanceof DOMElement) :

            $hero_block = $media_divs[0];

            // Find <h4> inside the block (same rule as parse_section_block).
            $h4s = $hero_block->getElementsByTagName('h4');
            if ($h4s->length > 0) :
                $text = self::node_text($h4s->item(0));
                if ($text !== '') :
                    $hero_tab_label = $text;
                endif;
            endif;

            // Fall back to first <p> inside the content column (before <h2>).
            if ($hero_tab_label === '') :
                foreach ($hero_block->getElementsByTagName('div') as $inner) :
                    if (strpos($inner->getAttribute('class'), 'wp-block-media-text__content') === false) :
                        continue;
                    endif;

                    foreach ($inner->childNodes as $node) :
                        if (!($node instanceof DOMElement)) : continue;
                        endif;
                        if ($node->tagName === 'h2') : break 2;
                        endif;
                        if ($node->tagName === 'p') :
                            $text = self::node_text($node);
                            if ($text !== '') :
                                $hero_tab_label = $text;
                                break 2;
                            endif;
                        endif;
                    endforeach;

                    break;
                endforeach;
            endif;

            // Same rule as parse_section_block: slugify(<h4>) + "-" + <anchor>
            $anchor          = self::find_anchor($hero_block, '');
            $tab_slug        = $hero_tab_label !== '' ? self::slugify($hero_tab_label) : '';
            $hero_section_id = trim($tab_slug . '-' . $anchor, '-');

        endif;

        $tab_label = '';

        if (!empty($media_divs) && $media_divs[0] instanceof DOMElement) :

            foreach ($media_divs[0]->getElementsByTagName('div') as $inner) :

                if (strpos($inner->getAttribute('class'), 'wp-block-media-text__content') === false) :
                    continue;
                endif;

                foreach ($inner->childNodes as $node) :

                    if (!$node instanceof DOMElement) :
                        continue;
                    endif;

                    if ($node->tagName === 'h2') :
                        break;
                    endif;

                    if ($node->tagName === 'p') :
                        $text = self::node_text($node);
                        if ($text !== '') :
                            $tab_label = $text;
                            break 2;
                        endif;
                    endif;

                endforeach;

                break;

            endforeach;

        endif;

        $title = '';
        $h2s   = $hero_el->getElementsByTagName('h2');
        if ($h2s->length > 0) :
            $title = self::node_text($h2s->item(0));
        endif;

        // First eligible <p> (no <a>, not inside <figure>) becomes the lead.
        // The next eligible <p> AFTER an <hr> becomes the sub-paragraph.
        $paragraph    = '';
        $subParagraph = '';
        $saw_hr       = false;

        foreach ($hero_el->getElementsByTagName('p') as $p) :

            // Skip paragraphs inside a <figure>.
            $parent = $p->parentNode;
            $in_fig = false;
            while ($parent !== null && !$parent->isSameNode($hero_el)) :
                if ($parent instanceof DOMElement && $parent->tagName === 'figure') :
                    $in_fig = true;
                    break;
                endif;
                $parent = $parent->parentNode;
            endwhile;
            if ($in_fig) :
                continue;
            endif;

            // Skip paragraphs that contain a link.
            $has_a = false;
            foreach ($p->childNodes as $child) :
                if ($child instanceof DOMElement && $child->tagName === 'a') :
                    $has_a = true;
                    break;
                endif;
            endforeach;
            if ($has_a) :
                continue;
            endif;

            $text = self::node_text($p);
            if ($text === '') :
                continue;
            endif;

            // Walk previous siblings of this <p>; if we hit an <hr> first,
            // flag it so this paragraph becomes the sub-paragraph.
            $sib = $p->previousSibling;
            while ($sib !== null) :
                if ($sib instanceof DOMElement) :
                    if ($sib->tagName === 'hr') :
                        $saw_hr = true;
                        break;
                    endif;
                    // Any other element sibling stops the look-back
                    // (keeps the <hr> → <p> pairing tight).
                    if ($sib->tagName !== 'p') :
                        break;
                    endif;
                endif;
                $sib = $sib->previousSibling;
            endwhile;

            if ($paragraph === '') :
                $paragraph = $text;
                continue;
            endif;

            if ($saw_hr && $subParagraph === '') :
                $subParagraph = $text;
                break;
            endif;

        endforeach;

        $actions = self::extract_actions_dom($hero_el);

        $hero_lists = self::extract_all_lists_dom($hero_el);

        $image = self::extract_media_text_image_dom($hero_el);

        return [
            [
                'section-id'        => $hero_section_id,
                'tab-label'         => $tab_label,
                'hero-bread-crumbs' => $breadcrumbs,
                'hero-image'        => $image,
                'hero-title'        => $title,
                'hero-description'  => [
                    [
                        'paragraph'     => $paragraph,
                        'sub-paragraph' => $subParagraph,
                        'list-text'     => $hero_lists,
                    ],
                ],
                'hero-actions'      => [
                    [
                        'links'   => $actions['links'],
                        'buttons' => $actions['buttons'],
                    ],
                ],
            ],
        ];
    }

    private static function parse_sections(?DOMDocument $dom): array
    {
        $raw = self::extract_section_blocks($dom);

        if (empty($raw)) :
            return [];
        endif;

        $out = [];

                foreach ($raw as $block) :

            $out[] = [
                'section-id'  => $block['section-id'],
                'icon-class'  => $block['icon-class'] ?? '',
                'tab-label'   => $block['tab-label'],
                'title'       => $block['title'],
                'sub-title'   => $block['sub-title'],
                'description' => [
                    [
                        'details' => [
                            'main-text'  => $block['main-text'],
                            'sub-text'   => $block['sub-text'] ?? '',
                            'lists-text' => $block['lists-text'],
                            'embedded'   => $block['embedded'] ?? [],
                            'map-embed'  => $block['map-embed'],
                            'images'     => [
                                [
                                    'image-feature'   => $block['image-feature'],
                                    'image-galleries' => $block['image-galleries'],
                                ],
                            ],
                            'actions'    => [
                                [
                                    'links'   => $block['links'],
                                    'buttons' => $block['buttons'],
                                ],
                            ],
                        ],
                    ],
                ],
            ];

        endforeach;

        return $out;
    }

    private static function extract_section_blocks(?DOMDocument $dom): array
    {
        if (!$dom) :
            return [];
        endif;

        list(, $sections_h2) = self::find_region_bounds($dom);

        if (!$sections_h2) :
            return [];
        endif;

        $region_el = self::collect_from($sections_h2, null);

        $out           = [];
        $current_group = '';

        foreach ($region_el->childNodes as $node) :

            if (!($node instanceof DOMElement)) :
                continue;
            endif;

            if ($node->tagName === 'h4') :
                $text = self::node_text($node);
                if ($text !== '') :
                    $current_group = $text;
                endif;
                continue;
            endif;

            $classes       = $node->getAttribute('class');
            $is_media_text = $classes !== '' && strpos($classes, 'wp-block-media-text') !== false;

            if ($is_media_text) :
                $block = self::parse_section_block($node, $current_group);
                if ($block !== null) :
                    $out[] = $block;
                endif;
                continue;
            endif;

            $inner_blocks = self::elements_by_class($node, 'wp-block-media-text');

            foreach ($inner_blocks as $inner) :
                if (!($inner instanceof DOMElement)) :
                    continue;
                endif;
                $block = self::parse_section_block($inner, $current_group);
                if ($block !== null) :
                    $out[] = $block;
                endif;
            endforeach;

        endforeach;

        return $out;
    }

    private static function parse_section_block(DOMElement $div, string $current_group): ?array
    {
        $content_div = null;
        foreach ($div->getElementsByTagName('div') as $inner) :
            if (strpos($inner->getAttribute('class'), 'wp-block-media-text__content') !== false) :
                $content_div = $inner;
                break;
            endif;
        endforeach;

        if (!$content_div instanceof DOMElement) :
            return null;
        endif;

        $title     = '';
        $sub_title = '';
        $tab_label = '';

        // find <h4> anywhere in the content column (blockquote-wrapped or direct)
        if ($tab_label === '') :
            $h4s = $content_div->getElementsByTagName('h4');
            if ($h4s->length > 0) :
                $text = self::node_text($h4s->item(0));
                if ($text !== '') :
                    $tab_label = $text;
                endif;
            endif;
        endif;

        foreach ($content_div->childNodes as $node) :

            if (!$node instanceof DOMElement) :
                continue;
            endif;

            if ($node->tagName === 'h2') :
                if ($title === '') :
                    $title = self::node_text($node);
                endif;
                continue;
            endif;

            if ($node->tagName === 'h3') :
                if ($sub_title === '') :
                    $sub_title = self::node_text($node);
                endif;
                continue;
            endif;

            if ($title === '' && $tab_label === '' && $node->tagName === 'p') :
                $text = self::node_text($node);
                if ($text !== '') :
                    $tab_label = $text;
                endif;
            endif;

        endforeach;

        if ($title === '') :
            return null;
        endif;

        if ($tab_label === '' && $current_group !== '') :
            $tab_label = $current_group;
        endif;

        $anchor     = self::find_anchor($div, '');
        $tab_slug   = $tab_label !== '' ? self::slugify($tab_label) : '';
        $section_id = trim($tab_slug . '-' . $anchor, '-');

        $main_text  = self::extract_main_text_dom($div);
        $sub_text   = self::extract_sub_text_dom($div);
        $lists_text = self::extract_lists_dom($div);
        $galleries  = self::extract_galleries_dom($div);
        $actions    = self::extract_actions_dom($div);
        $image_feat = self::extract_media_text_image_dom($div);
        $embedded   = self::extract_embedded_dom($div);
        $map_embed  = self::extract_iframe_dom($div);

        // ---- Extract any fa-* icon classes from the block wrapper ----
        // Pulled from the block's "Additional CSS Class(es)" field,
        // e.g. "fa-solid fa-camera" → "fa-solid fa-camera".
        $icon_classes = [];
        if ($div->hasAttribute('class')) :
            $raw = preg_split('/\s+/', trim($div->getAttribute('class')));
            foreach ($raw as $c) :
                if ($c !== '' && strpos($c, 'fa-') === 0) :
                    $icon_classes[] = $c;
                endif;
            endforeach;
        endif;
        $icon_class = implode(' ', $icon_classes);

        return [
            'section-id'      => $section_id,
            'icon-class'      => $icon_class,
            'tab-label'       => $tab_label,
            'title'           => $title,
            'sub-title'       => $sub_title,
            'main-text'       => $main_text,
            'sub-text'        => $sub_text,
            'lists-text'      => $lists_text,
            'image-feature'   => $image_feat,
            'image-galleries' => $galleries,
            'embedded'        => $embedded,
            'map-embed'       => $map_embed,
            'links'           => $actions['links'],
            'buttons'         => $actions['buttons'],
        ];
    }

    private static function slugify(string $text): string
    {
        $text = strtolower(trim($text));
        $text = preg_replace('/[^a-z0-9]+/', '-', $text);
        return trim($text, '-');
    }

    private static function find_anchor(DOMElement $el, string $fallback): string
    {
        if ($el->hasAttribute('id') && $el->getAttribute('id') !== '') :
            return $el->getAttribute('id');
        endif;

        $node = $el->parentNode;
        while ($node instanceof DOMElement) :
            if ($node->hasAttribute('id') && $node->getAttribute('id') !== '') :
                return $node->getAttribute('id');
            endif;
            $node = $node->parentNode;
        endwhile;

        $h2s = $el->getElementsByTagName('h2');
        if ($h2s->length > 0) :
            $h2 = $h2s->item(0);
            if ($h2 instanceof DOMElement && $h2->hasAttribute('id') && $h2->getAttribute('id') !== '') :
                return $h2->getAttribute('id');
            endif;
        endif;

        return $fallback;
    }

    private static function extract_main_text_dom(DOMElement $div): string
    {
        foreach ($div->getElementsByTagName('p') as $p) :

            $parent = $p->parentNode;
            $in_fig = false;
            while ($parent !== null && !$parent->isSameNode($div)) :
                if ($parent instanceof DOMElement && $parent->tagName === 'figure') :
                    $in_fig = true;
                    break;
                endif;
                $parent = $parent->parentNode;
            endwhile;

            if ($in_fig) :
                continue;
            endif;

            $has_a = false;
            foreach ($p->childNodes as $child) :
                if ($child instanceof DOMElement && $child->tagName === 'a') :
                    $has_a = true;
                    break;
                endif;
            endforeach;

            if ($has_a) :
                continue;
            endif;

            $text = self::node_text($p);
            if ($text !== '') :
                return $text;
            endif;

        endforeach;

        return '';
    }

    /* Extract paragraphs that come AFTER an <hr> inside the content column. */
    private static function extract_sub_text_dom(DOMElement $div): string
    {
        $content_div = null;

        foreach ($div->getElementsByTagName('div') as $inner) :
            if (strpos($inner->getAttribute('class'), 'wp-block-media-text__content') !== false) :
                $content_div = $inner;
                break;
            endif;
        endforeach;

        if (!$content_div instanceof DOMElement) :
            return '';
        endif;

        // Walk children in order. Once we see an <hr>, the next <p> we find
        // (that is not inside a figure and has no <a>) is the sub-text.
        $found_hr = false;

        foreach ($content_div->childNodes as $node) :

            if (!($node instanceof DOMElement)) :
                continue;
            endif;

            if ($node->tagName === 'hr') :
                $found_hr = true;
                continue;
            endif;

            if (!$found_hr) :
                continue;
            endif;

            if ($node->tagName !== 'p') :
                continue;
            endif;

            $has_a = false;
            foreach ($node->childNodes as $child) :
                if ($child instanceof DOMElement && $child->tagName === 'a') :
                    $has_a = true;
                    break;
                endif;
            endforeach;

            if ($has_a) :
                continue;
            endif;

            $text = self::node_text($node);
            if ($text !== '') :
                return $text;
            endif;

        endforeach;

        return '';
    }

    private static function extract_lists_dom(DOMElement $div): array
    {
        $uls = $div->getElementsByTagName('ul');

        if ($uls->length === 0) :
            return [];
        endif;

        $outer = $uls->item(0);
        while ($outer->parentNode instanceof DOMElement && $outer->parentNode->tagName === 'ul') :
            $outer = $outer->parentNode;
        endwhile;

        return self::parse_list_items($outer);
    }

        /* Same as extract_lists_dom(), but captures EVERY top-level <ul>
     * in the region — not just the first. Used only for the hero,
     * where multiple sibling <ul> blocks are common. */
    private static function extract_all_lists_dom(DOMElement $div): array
    {
        $uls = $div->getElementsByTagName('ul');

        if ($uls->length === 0) :
            return [];
        endif;

        // Collect every <ul> that has NO <ul> ancestor — i.e. truly
        // top-level. Nested <ul>s are handled by parse_list_items() recursion.
        $tops = [];
        foreach ($uls as $ul) :
            if (!($ul instanceof DOMElement)) :
                continue;
            endif;

            $has_ul_ancestor = false;
            $node = $ul->parentNode;

            while ($node !== null) :
                if ($node instanceof DOMElement && $node->tagName === 'ul') :
                    $has_ul_ancestor = true;
                    break;
                endif;
                $node = $node->parentNode;
            endwhile;

            if ($has_ul_ancestor) :
                continue;
            endif;

            $tops[] = $ul;
        endforeach;

        if (empty($tops)) :
            return [];
        endif;

        $out = [];
        foreach ($tops as $top) :
            $items = self::parse_list_items($top);
            foreach ($items as $item) :
                $out[] = $item;
            endforeach;
        endforeach;

        // Sequential list-index across all <ul>s.
        foreach ($out as $i => &$item) :
            $item['list-index'] = $i;
        endforeach;
        unset($item);

        return $out;
    }

    private static function parse_list_items(DOMElement $ul): array
    {
        $out   = [];
        $index = 0;

        foreach ($ul->childNodes as $child) :

            if (!$child instanceof DOMElement || $child->tagName !== 'li') :
                continue;
            endif;

            $title      = '';
            $desc       = '';
            $nested_uls = [];
            $text_parts = [];

            foreach ($child->childNodes as $inner) :

                if ($inner instanceof DOMElement) :

                    if ($inner->tagName === 'strong') :
                        $title = self::node_text($inner);
                    elseif ($inner->tagName === 'ul') :
                        $nested_uls[] = $inner;
                    elseif ($inner->tagName === 'p') :
                        $text_parts[] = self::node_text($inner);
                    endif;

                elseif ($inner instanceof DOMText) :

                    $t = trim(html_entity_decode($inner->nodeValue, ENT_QUOTES | ENT_HTML5));
                    if ($t !== '') :
                        $text_parts[] = $t;
                    endif;

                endif;

            endforeach;

            if ($title === '' && !empty($text_parts)) :
                $desc = array_shift($text_parts);
            elseif (!empty($text_parts)) :
                $desc = implode(' ', $text_parts);
            endif;

            if ($title === '' && $desc !== '') :
                $title = $desc;
                $desc  = '';
            endif;

            $children = [];
            foreach ($nested_uls as $nested) :
                $children = array_merge($children, self::parse_list_items($nested));
            endforeach;

            // ← THIS IS THE BLOCK YOU ASKED ABOUT
            $out[] = [
                'list-title'       => $title,
                'list-description' => $desc,
                'list-index'       => $index,
                'children'         => $children,
            ];

            $index++;

        endforeach;

        return $out;
    }

    private static function extract_galleries_dom(DOMElement $div): array
    {
        $figs = self::elements_by_class($div, 'wp-block-gallery');

        $out = [];

        foreach ($figs as $fig) :

            if (!($fig instanceof DOMElement)) :
                continue;
            endif;

            // Pair every <figure class="wp-block-image"> with its caption, if any.
            // Walk in document order so we don't mismatch image → caption.

            $items = [];
            $captions = [];

            foreach ($fig->getElementsByTagName('figcaption') as $cap) :
                $captions[] = self::node_text($cap);
            endforeach;

            $idx = 0;

            foreach ($fig->getElementsByTagName('img') as $img) :

                if (!$img instanceof DOMElement) :
                    continue;
                endif;

                $src         = $img->getAttribute('src');
                $alt         = $img->getAttribute('alt');
                $img_title   = $img->getAttribute('title');
                $caption     = $captions[$idx] ?? '';
                $attachment  = self::attachment_data_from_img($img);

                $out[] = [
                    'title'       => $attachment['title']       ?: $img_title,
                    'img'         => $src,
                    'caption'     => $caption ?: $attachment['caption'],
                    'alt-text'    => $alt ?: $attachment['alt-text'],
                    'description' => $attachment['description'],
                    'file-url'    => $attachment['file-url'] ?: $src,
                ];

                $idx++;

            endforeach;

        endforeach;

        return $out;
    }

    /* ---------------------------------------------------------------
    * Resolve a WP attachment's media-library metadata (Title, Caption,
    * Description, Alt, File URL) from the rendered <img> in a gallery.
    *
    * The rendered content only embeds the src/alt/title attributes; the
    * Caption and Description fields live on the attachment record, so
    * we read the `wp-image-<ID>` class from the <img> and fetch the
    * media item once, caching by ID.
    * --------------------------------------------------------------- */

    private static function attachment_data_from_img(DOMElement $img): array
    {
        static $cache = [];

        $empty = [
            'title'       => '',
            'caption'     => '',
            'alt-text'    => '',
            'description' => '',
            'file-url'    => '',
        ];

        $class = $img->getAttribute('class');

        if ($class === '' || !preg_match('/wp-image-(\d+)/', $class, $m)) :
            return $empty;
        endif;

        $id = (int) $m[1];

        if ($id === 0) :
            return $empty;
        endif;

        if (isset($cache[$id])) :
            return $cache[$id];
        endif;

        $remote = wp_remote_get(
            MenuController::live_root() . '/media/' . $id,
            ['timeout' => 15]
        );

        if (is_wp_error($remote)) :
            return $cache[$id] = $empty;
        endif;

        $item = json_decode(wp_remote_retrieve_body($remote), true);

        if (!is_array($item)) :
            return $cache[$id] = $empty;
        endif;

        $cache[$id] = [
            'title'       => html_entity_decode($item['title']['rendered']       ?? '', ENT_QUOTES | ENT_HTML5),
            'caption'     => html_entity_decode($item['caption']['rendered']     ?? '', ENT_QUOTES | ENT_HTML5),
            'alt-text'    => $item['alt_text']                                   ?? '',
            'description' => html_entity_decode($item['description']['rendered'] ?? '', ENT_QUOTES | ENT_HTML5),
            'file-url'    => $item['source_url']                                 ?? '',
        ];

        return $cache[$id];
    }

    private static function extract_media_text_image_dom(DOMElement $div): array
    {
        $empty = [
            'title'       => '',
            'img'         => '',
            'caption'     => '',
            'alt-text'    => '',
            'description' => '',
            'file-url'    => '',
        ];

        // 1) Prefer the Media Area (left column of the block)
        $media_figs = self::elements_by_class($div, 'wp-block-media-text__media');
        foreach ($media_figs as $fig) :
            if (!($fig instanceof DOMElement)) :
                continue;
            endif;
            $img = $fig->getElementsByTagName('img')->item(0);
            if (!$img instanceof DOMElement) :
                continue;
            endif;
            return [
                'title'       => $img->getAttribute('title'),
                'img'         => $img->getAttribute('src'),
                'caption'     => '',
                'alt-text'    => $img->getAttribute('alt'),
                'description' => '',
                'file-url'    => $img->getAttribute('src'),
            ];
        endforeach;

        // 2) Fallback — first standalone <figure><img> inside the content column
        // that is NOT inside a wp-block-gallery
        $content_div = null;
        foreach ($div->getElementsByTagName('div') as $inner) :
            if (strpos($inner->getAttribute('class'), 'wp-block-media-text__content') !== false) :
                $content_div = $inner;
                break;
            endif;
        endforeach;

        if (!$content_div instanceof DOMElement) :
            return $empty;
        endif;

        foreach ($content_div->getElementsByTagName('figure') as $fig) :
            if (!($fig instanceof DOMElement)) :
                continue;
            endif;

            // skip gallery figures
            $cls = $fig->getAttribute('class');
            if ($cls !== '' && strpos($cls, 'wp-block-gallery') !== false) :
                continue;
            endif;

            $img = $fig->getElementsByTagName('img')->item(0);
            if (!$img instanceof DOMElement) :
                continue;
            endif;

            return [
                'title'       => $img->getAttribute('title'),
                'img'         => $img->getAttribute('src'),
                'caption'     => '',
                'alt-text'    => $img->getAttribute('alt'),
                'description' => '',
                'file-url'    => $img->getAttribute('src'),
            ];
        endforeach;

        return $empty;
    }

    /* ---------------------------------------------------------------
     * Embedded HTML — pulls any element carrying a `data-embed`
     * attribute out of the content column and returns its outerHTML.
     * The value of `data-embed` is returned as `kind` so the frontend
     * can decide how to render it. Nested data-embeds are skipped so
     * the outer element's outerHTML is not duplicated.
     * --------------------------------------------------------------- */

    private static function extract_embedded_dom(DOMElement $div): array
    {
        $out = [];

        $content_div = null;

        foreach ($div->getElementsByTagName('div') as $inner) :
            if (strpos($inner->getAttribute('class'), 'wp-block-media-text__content') !== false) :
                $content_div = $inner;
                break;
            endif;
        endforeach;

        if (!$content_div instanceof DOMElement) :
            return $out;
        endif;

        // Registered markers: CSS class => embed kind
        $markers = [
            'newsletter-form' => 'newsletter',
        ];

        foreach ($markers as $class => $kind) :

            $matches = self::elements_by_class($content_div, $class);

            foreach ($matches as $el) :

                if (!($el instanceof DOMElement)) :
                    continue;
                endif;

                // Skip nested matches — the outer wrapper already contains them.
                $parent = $el->parentNode;
                $nested = false;
                while ($parent instanceof DOMElement && !$parent->isSameNode($content_div)) :
                    if (strpos($parent->getAttribute('class'), $class) !== false) :
                        $nested = true;
                        break;
                    endif;
                    $parent = $parent->parentNode;
                endwhile;
                if ($nested) :
                    continue;
                endif;

                $out[] = [
                    'kind' => $kind,
                    'html' => self::outer_html($el),
                ];

            endforeach;

        endforeach;

        return $out;
    }

    /* Return the outerHTML of a DOMElement. */
    private static function outer_html(DOMElement $el): string
    {
        $dom  = $el->ownerDocument;
        $html = $dom->saveHTML($el);

        return $html === false ? '' : $html;
    }

    /* ---------------------------------------------------------------
     * Extract the src of the first <iframe> inside a block
     * (e.g. Google Maps embed). Trims DOM-parser artifacts such as
     * a src value that accidentally swallowed a trailing "%22 width=".
     * --------------------------------------------------------------- */

    private static function extract_iframe_dom(DOMElement $div): string
    {
        $iframes = $div->getElementsByTagName('iframe');

        if ($iframes->length === 0) :
            return '';
        endif;

        $first = $iframes->item(0);

        if (!$first instanceof DOMElement) :
            return '';
        endif;

        $src = (string) ($first->getAttribute('src') ?? '');

        // Trim at first whitespace or literal quote.
        $cut = strcspn($src, " \t\r\n\"'");
        $src = substr($src, 0, $cut);

        // Strip a trailing encoded quote (%22) if it slipped through.
        $src = rtrim($src, "%22");

        return $src;
    }

    private static function extract_actions_dom(DOMElement $div): array
    {
        $links   = [];
        $buttons = [];

        $button_blocks = self::elements_by_class($div, 'wp-block-button');

        foreach ($button_blocks as $block) :

            if (!($block instanceof DOMElement)) :
                continue;
            endif;

            $a = $block->getElementsByTagName('a')->item(0);

            if (!$a instanceof DOMElement) :
                continue;
            endif;

            $label = self::node_text($a);
            if ($label === '') :
                continue;
            endif;

            $a_class       = $a->getAttribute('class');
            $wrapper_class = $block->getAttribute('class');
            $combined      = trim($a_class . ' ' . $wrapper_class);

            $icon = '';
            if ($block->hasAttribute('id') && $block->getAttribute('id') !== '') :
                $icon = $block->getAttribute('id');
            elseif (preg_match('/(fa-[a-z0-9-]+(?:\s+fa-[a-z0-9-]+)*)/i', $combined, $m)) :
                $icon = $m[1];
            endif;

            $combined = trim(preg_replace('/\bfa-[a-z0-9-]+\b/i', '', $combined));

            $style_attr  = $a->getAttribute('style');
            $block_style = $block->getAttribute('style');
            $all_styles  = trim($style_attr . ';' . $block_style, ';');

            $bg     = self::style_value($all_styles, 'background-color');
            $color  = self::style_value($all_styles, 'color');
            $radius = self::style_value($all_styles, 'border-radius');

            $buttons[] = [
                'label'           => $label,
                'class'           => $combined,
                'icon'            => $icon,
                'background'      => $bg,
                'text-color'      => $color,
                'border-radius'   => $radius,
            ];

        endforeach;

        foreach ($div->getElementsByTagName('a') as $a) :

            if (!$a instanceof DOMElement) :
                continue;
            endif;

            $parent    = $a->parentNode;
            $in_button = false;

            while ($parent instanceof DOMElement) :
                $cls = $parent->getAttribute('class');
                if ($cls !== '' && strpos($cls, 'wp-block-button') !== false) :
                    $in_button = true;
                    break;
                endif;
                $parent = $parent->parentNode;
            endwhile;

            if ($in_button) :
                continue;
            endif;

            $label = self::node_text($a);
            if ($label === '') :
                continue;
            endif;

            $links[] = [
                'label' => $label,
                'class' => trim($a->getAttribute('class')),
                'icon'  => self::find_icon_upward($a),
                'link'  => $a->getAttribute('href') ?: '#',
            ];

        endforeach;

        return [
            'links'   => $links,
            'buttons' => $buttons,
        ];
    }

    private static function style_value(string $styles, string $property): string
    {
        if (preg_match('/' . preg_quote($property, '/') . '\s*:\s*([^;]+)/i', $styles, $m)) :
            return trim($m[1]);
        endif;
        return '';
    }

    private static function find_icon_upward(DOMElement $el): string
    {
        $node = $el;

        while ($node instanceof DOMElement) :

            $class = $node->getAttribute('class');

            if ($class !== '' && preg_match('/(fa-[a-z0-9-]+(?:\s+fa-[a-z0-9-]+)*)/i', $class, $m)) :
                return $m[1];
            endif;

            $parent = $node->parentNode;
            $node   = $parent instanceof DOMElement ? $parent : null;

        endwhile;

        return '';
    }

    private static function flatten(array $categories, array &$map): void
    {
        foreach ($categories as $category) :

            $slug = $category['slug'] ?? '';
            $name = $category['name'] ?? '';

            if ($slug !== '') :
                $map[$slug] = $name;
            endif;

            if (!empty($category['children'])) :
                self::flatten($category['children'], $map);
            endif;

        endforeach;
    }
}
