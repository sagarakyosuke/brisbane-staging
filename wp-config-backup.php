<?php
/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the website, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * ABSPATH
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/
 *
 * @package WordPress
 */

// ** Database settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
// define( 'DB_NAME', 'brisbane_wp' );
define( 'DB_NAME', 'wp_main_db' );

/** Database username */
// define( 'DB_USER', 'brisbane_user' );
define( 'DB_USER', 'root' );

/** Database password */
// define( 'DB_PASSWORD', 'Lt#6.9XiKGaHko=O' );
define( 'DB_PASSWORD', '' );

/** Database hostname */
// define( 'DB_HOST', 'localhost' );
define( 'DB_HOST', 'localhost' );

/** Database charset to use in creating database tables. */
// define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_CHARSET', 'utf8mb4' );

/** The database collate type. Don't change this if in doubt. */
// define( 'DB_COLLATE', '' );
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 *
 * Change these to different unique phrases! You can generate these using
 * the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}.
 *
 * You can change these at any point in time to invalidate all existing cookies.
 * This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',         '/Qt!R>ovE;gpHI6/nrv@>3%<%8)`,%w+FE].y,egGdlTfxp~gDq,#|)AsM^XctB@' );
define( 'SECURE_AUTH_KEY',  'HT2<x|}eQcf-{(]{nj-2/`;TRrcOYnZ`Ny@t;HvA?IrT`_SU.dJ$@+ZpPrSr|Cv1' );
define( 'LOGGED_IN_KEY',    '_J$8e`Gt_&0+G}X=@O:amxdjT7On&J0gxbFrNi`_I`*5C-DfFr6%1,x9iCYQUC/$' );
define( 'NONCE_KEY',        'Rk,}R~{-t-x~FOh;t;B l}?F;9}[<-W?_D,0JcRv@ +wWrPlP9Wi8Tvo,S1CR47k' );
define( 'AUTH_SALT',        '$sX&<?lFzHq1UDzR*!V610z9{5_aPaOpmbaVX&=UHm)vLY]q]eqY{cqF.gRoO@%z' );
define( 'SECURE_AUTH_SALT', '%[i[1y7s?vK7{S[=?OG|`CbvB_8SX(UYHL#PIvx%v}T[7T@JEp]4BJ(:yCSMRtD&' );
define( 'LOGGED_IN_SALT',   'd@khvaRREkLn]QyfO!]e#4(U|3v[#RRU)tGe&,zUuhiqupA;kNQHCrKu!(|MIy)&' );
define( 'NONCE_SALT',       '0F`$@IWU~mfNsglyVT%0G;|,]Q9(zL?r9,grhpOEz`HdllYOy]4 jEtil(0LW_tW' );

/**#@-*/

/**
 * WordPress database table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 *
 * At the installation time, database tables are created with the specified prefix.
 * Changing this value after WordPress is installed will make your site think
 * it has not been installed.
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/#table-prefix
 */
$table_prefix = 'wp_bl';

/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the documentation.
 *
 * @link https://developer.wordpress.org/advanced-administration/debug/debug-wordpress/
 */
define( 'WP_DEBUG', false );

/* Add any custom values between this line and the "stop editing" line. */



/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';
