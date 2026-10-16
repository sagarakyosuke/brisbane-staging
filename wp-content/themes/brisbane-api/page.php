<?php
$current_path = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '', '/');
$home_path    = trim(parse_url(home_url('/'), PHP_URL_PATH) ?? '', '/');

if ($home_path !== '' && strpos($current_path, $home_path) === 0) :
    $current_path = trim(substr($current_path, strlen($home_path)), '/');
endif;

/**
 * Returns the tab bar markup for a given page path, or '' if the page
 * has no tabs configured.
 *
 * To add tabs to a new parent page, add an entry below.
 * To add tabs to a new child page, add its config under the parent's tabs.
 */
function brisbane_page_tabs(string $current_path): string
{
    // Config — top-level key = parent page slug.
    // Each parent has: 'tabs' (list of {slug, label}).
    // Match happens on either the parent path or any child path.
    $config = [
        'about-us' => [
            'tabs' => [
                ['slug' => 'overview',          'label' => 'Overview'],
                ['slug' => 'our-stories',       'label' => 'Our Story'],
                ['slug' => 'our-teams',         'label' => 'Our Team'],
                ['slug' => 'warehouse-gallery', 'label' => 'Warehouse Gallery'],
            ],
        ],
        // Add more parents here:
        // 'services' => [ 'tabs' => [ ... ] ],
    ];

    // Find the parent that matches the current path.
    $matched_parent = null;

    foreach ($config as $parent_slug => $parent_config) :
        if (
            $current_path === $parent_slug
            || strpos($current_path, $parent_slug . '/') === 0
        ) :
            $matched_parent = $parent_slug;
            break;
        endif;
    endforeach;

    if ($matched_parent === null) :
        return '';
    endif;

    $tabs = $config[$matched_parent]['tabs'] ?? [];

    if (empty($tabs)) :
        return '';
    endif;

    // Determine the active child — the last segment of the current path.
    $parts           = array_values(array_filter(explode('/', $current_path)));
    $current_child   = $parts ? end($parts) : $matched_parent;

    // Build the markup.
    $home_url_path = untrailingslashit(home_url('/'));

    $html  = '<nav class="page-tabs" aria-label="Page sections">';
    $html .= '<div class="container">';
    $html .= '<ul class="page-tabs-list">';

    foreach ($tabs as $tab) :
        $slug  = $tab['slug']  ?? '';
        $label = $tab['label'] ?? '';

        if ($slug === '' || $label === '') :
            continue;
        endif;

        $href     = esc_url($home_url_path . '/' . $matched_parent . '/' . $slug . '/');
        $is_active = ($slug === $current_child);
        $classes  = 'page-tab' . ($is_active ? ' is-active' : '');

        $html .= '<li>';
        $html .= '<a href="' . $href . '" class="' . esc_attr($classes) . '">';
        $html .= esc_html($label);
        $html .= '</a>';
        $html .= '</li>';
    endforeach;

    $html .= '</ul>';
    $html .= '</div>';
    $html .= '</nav>';

    return $html;
}

get_header();
?>

<main id="pageContent" data-slug="<?php echo esc_attr($current_path); ?>">

    <!-- ========== HERO ========== -->
    <section class="hero">
        <div class="container">
            <div class="hero-row">
                <div class="hero-body">
                    <nav class="hero-breadcrumb" id="breadcrumbMount"
                        data-slug="<?php echo esc_attr($current_path); ?>"
                        aria-label="Breadcrumb"></nav>
                    <h1 id="heroTitle"></h1>
                    <p class="hero-lead" id="heroLead"></p>
                    <div id="heroActions"></div>
                </div>
                <div class="hero-media" id="heroMedia"></div>
            </div>
        </div>
    </section>

    <!-- ========== TAB BAR (auto-rendered by brisbane_page_tabs) ========== -->
    <?php echo brisbane_page_tabs($current_path); ?>

    <!-- ========== SECTIONS (looped) ========== -->
    <div id="sectionMount"></div>
</main>

<?php get_footer(); ?>