<!DOCTYPE html>
<html <?php language_attributes(); ?>>

<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
    <?php wp_body_open(); ?>
    <!-- ========== LOADER ========== -->
    <div class="loader" id="pageLoader" role="status" aria-live="polite" aria-label="Loading">
        <img class="loader-gif"
            src="https://brisbanelogistics.com.au/wp-content/uploads/2026/10/output-onlinegiftools.gif"
            alt="Loading…">
    </div>

    <!-- ========== TOP BAR ========== -->
    <div class="topbar">
        <div class="container">
            <div class="topbar-inner">

                <!-- Group 1: dynamic from /wp-json/brisbane/top-menu -->
                <div class="topbar-group" id="topMenuMount"></div>

                <!-- Group 2: dynamic from /wp-json/brisbane/client-tools -->
                <div class="topbar-group" id="clientToolsMount"></div>

            </div>
        </div>
    </div>

    <!-- ========== SITE HEADER ========== -->
    <header class="site-header" id="siteHeader">
        <div class="container">
            <div class="site-header-row">

                <div class="logo-block">
                    <a href="<?php echo esc_url(home_url('/')); ?>">
                        <img src="" alt="Brisbane Logistics" class="logo-img" id="siteLogo">
                    </a>
                </div>

                <nav class="main-nav" aria-label="Main navigation">
                    <ul id="mainMenuMount"></ul>
                </nav>

                <div class="nav-cta">
                    <a class="btn btn-outline" href="#">Book a Call</a>
                    <a class="btn btn-primary" href="#">
                        Get a 3PL Quote
                        <span class="arrow-circle" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>
                    </a>
                </div>

                <button class="hamburger" id="hamburger"
                    aria-label="Open navigation menu"
                    aria-expanded="false"
                    aria-controls="mobileDrawer">
                    <span class="hamburger-box">
                        <span class="hamburger-line"></span>
                        <span class="hamburger-line"></span>
                        <span class="hamburger-line"></span>
                    </span>
                </button>

            </div>
        </div>
    </header>

    <!-- ========== MOBILE DRAWER ========== -->
    <div class="drawer-overlay" id="drawerOverlay" hidden></div>

    <aside class="mobile-drawer" id="mobileDrawer" aria-hidden="true" aria-label="Mobile navigation">

        <!-- Header -->
        <div class="mobile-drawer-head">
            <img src="" alt="Brisbane Logistics" class="mobile-drawer-logo" id="drawerLogo">
            <button class="drawer-close" id="drawerClose" aria-label="Close navigation menu">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
        </div>

        <!-- Quick contact strip -->
        <div class="mobile-drawer-quick">
            <a class="drawer-quick-btn" href="#">
                <i class="fa-solid fa-phone" aria-hidden="true"></i>
                <span>Call Us</span>
            </a>
            <a class="drawer-quick-btn" href="#">
                <i class="fa-solid fa-envelope" aria-hidden="true"></i>
                <span>Email</span>
            </a>
            <a class="drawer-quick-btn" href="#">
                <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
                <span>Visit</span>
            </a>
        </div>

        <!-- Primary nav (dynamic from /wp-json/brisbane/menu) -->
        <nav class="mobile-nav" aria-label="Mobile navigation">
            <ul id="mobileMenuMount"></ul>
        </nav>

        <!-- Client tools -->
        <div class="mobile-drawer-tools">
            <a href="#" class="drawer-tool">
                <span class="drawer-tool-icon"><i class="fa-solid fa-lock" aria-hidden="true"></i></span>
                <span class="drawer-tool-body">
                    <strong>Client Portal Login</strong>
                    <small>Track your consignments</small>
                </span>
                <i class="fa-solid fa-chevron-right drawer-tool-arrow" aria-hidden="true"></i>
            </a>
            <a href="#" class="drawer-tool">
                <span class="drawer-tool-icon"><i class="fa-solid fa-box" aria-hidden="true"></i></span>
                <span class="drawer-tool-body">
                    <strong>BL Express Tracking</strong>
                    <small>Follow your delivery</small>
                </span>
                <i class="fa-solid fa-chevron-right drawer-tool-arrow" aria-hidden="true"></i>
            </a>
        </div>

        <!-- CTA block -->
        <div class="mobile-drawer-cta">
            <a class="btn btn-primary" href="#">
                Get a 3PL Quote
                <span class="arrow-circle" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>
            </a>
            <a class="btn btn-outline" href="#">Book a Call</a>
        </div>

        <!-- Footer strip -->
        <div class="mobile-drawer-footer">
            <a href="#"><i class="fa-solid fa-phone" aria-hidden="true"></i> 07 3348 2100</a>
            <a href="#"><i class="fa-solid fa-envelope" aria-hidden="true"></i> sales@brisbanelogistics.com.au</a>
        </div>

    </aside>