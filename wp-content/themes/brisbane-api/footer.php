<?php

/**
 * Fetch the site identity from the Brisbane API.
 * Used for the footer logo.
 */
$footer_site = wp_remote_get(home_url('/wp-json/brisbane/site'), ['timeout' => 15]);
$footer_site_data = [];
if (!is_wp_error($footer_site)) :
    $decoded = json_decode(wp_remote_retrieve_body($footer_site), true);
    if (is_array($decoded)) :
        $footer_site_data = $decoded;
    endif;
endif;

/**
 * Fetch the main menu from the Brisbane API.
 * Used for the Explore column.
 */
$footer_menu = wp_remote_get(home_url('/wp-json/brisbane/menu'), ['timeout' => 15]);
$footer_items = [];
if (!is_wp_error($footer_menu)) :
    $decoded = json_decode(wp_remote_retrieve_body($footer_menu), true);
    if (is_array($decoded) && !empty($decoded['menu'])) :
        $footer_items = $decoded['menu'];
    endif;
endif;
?>

<footer class="site-footer">
    <div class="container">
        <div class="site-footer-row">

            <!-- Column 1: brand (logo from /wp-json/brisbane/site) -->
            <div class="footer-col footer-col--brand">
                <a href="<?php echo esc_url(home_url('/')); ?>" class="footer-logo">
                    <?php if (!empty($footer_site_data['logo']['url'])) : ?>
                        <img src="<?php echo esc_url($footer_site_data['logo']['url']); ?>"
                            alt="<?php echo esc_attr($footer_site_data['logo']['alt'] ?? 'Brisbane Logistics'); ?>">
                    <?php endif; ?>
                </a>
                <p class="footer-tagline">Warehousing, fulfilment and distribution for Brisbane and South East Queensland businesses.</p>
            </div>

            <!-- Column 2: Explore (from /wp-json/brisbane/menu) -->
            <div class="footer-col footer-col--explore">
                <h3 class="footer-col-title">Explore</h3>
                <ul class="footer-menu">
                    <?php foreach ($footer_items as $item) : ?>
                        <li>
                            <a href="<?php echo esc_url($item['link'] ?? '#'); ?>">
                                <?php echo esc_html($item['label'] ?? ''); ?>
                            </a>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </div>

            <!-- Column 3: Contact -->
            <div class="footer-col footer-col--contact">
                <h3 class="footer-col-title">Contact</h3>
                <ul class="footer-menu footer-menu--plain">
                    <li><a href="tel:0733482100">07 3348 2100</a></li>
                    <li><a href="mailto:sales@brisbanelogistics.com.au">sales@brisbanelogistics.com.au</a></li>
                    <li>Brisbane, Queensland</li>
                </ul>
            </div>

        </div>

        <div class="site-footer-bottom">
            <p class="footer-copy">&copy; <?php echo date('Y'); ?> Brisbane Logistics</p>
            <ul class="footer-legal">
                <li><a href="#">Privacy Policy</a></li>
                <li><a href="#">Terms &amp; Conditions</a></li>
            </ul>
        </div>
    </div>
</footer>

<?php wp_footer(); ?>
</body>

</html>