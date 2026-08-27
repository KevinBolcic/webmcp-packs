<?php
/**
 * Plugin Name: PROBULL Agent-Ready (WebMCP)
 * Plugin URI:  https://probull.eu/ai-ready/
 * Description: Makes your site usable by AI agents: WebMCP tool packs (enquiry, booking, quote, restaurant, FAQ/site info), llms.txt, Chrome origin-trial token, declarative form annotations.
 * Version:     0.1.0
 * Author:      PROBULL
 * Author URI:  https://probull.eu
 * License:     MIT
 * Text Domain: probull-agent-ready
 */
if ( ! defined( 'ABSPATH' ) ) exit;

define( 'PAR_VER', '0.1.0' );
define( 'PAR_URL', plugin_dir_url( __FILE__ ) );

function par_opts(): array {
	return wp_parse_args( (array) get_option( 'par_options', [] ), [
		'ot_token' => '', 'packs' => [ 'site' ], 'company' => get_bloginfo( 'name' ), 'lang' => substr( get_locale(), 0, 2 ),
		'lead_to' => get_option( 'admin_email' ), 'pricing' => '', 'booking_hours' => '', 'booking_slot' => 30, 'booking_services' => '',
		'quote_fields' => 'quantity,size,material,deadline', 'quote_products' => '', 'restaurant_menu' => '',
		'llms' => 1, 'llms_extra' => '', 'form_annotations' => '',
	] );
}

/* ---------- frontend: origin trial + packs ---------- */
add_action( 'wp_head', function () {
	$o = par_opts();
	if ( $o['ot_token'] ) echo '<meta http-equiv="origin-trial" content="' . esc_attr( $o['ot_token'] ) . "\">\n";
}, 1 );

add_action( 'wp_enqueue_scripts', function () {
	$o = par_opts(); $packs = (array) $o['packs'];
	wp_enqueue_script( 'par-core', PAR_URL . 'assets/js/core.js', [], PAR_VER, true );
	$cfg = [
		'lead'       => [ 'endpoint' => rest_url( 'probull-agent-ready/v1/lead' ), 'company' => $o['company'], 'lang' => $o['lang'], 'pricing' => json_decode( (string) $o['pricing'] ) ?: null ],
		'booking'    => [ 'endpoint' => rest_url( 'probull-agent-ready/v1/lead' ), 'hours' => json_decode( (string) $o['booking_hours'] ) ?: null, 'slot' => (int) $o['booking_slot'], 'services' => array_filter( array_map( 'trim', explode( ',', (string) $o['booking_services'] ) ) ) ?: null, 'lang' => $o['lang'] ],
		'quote'      => [ 'endpoint' => rest_url( 'probull-agent-ready/v1/lead' ), 'fields' => array_filter( array_map( 'trim', explode( ',', (string) $o['quote_fields'] ) ) ), 'products' => json_decode( (string) $o['quote_products'] ) ?: null, 'lang' => $o['lang'] ],
		'restaurant' => [ 'endpoint' => rest_url( 'probull-agent-ready/v1/lead' ), 'menu' => $o['restaurant_menu'] ?: null, 'lang' => $o['lang'] ],
		'site'       => [ 'name' => $o['company'] ],
	];
	wp_add_inline_script( 'par-core', 'window.WebMCPPacksConfig=' . wp_json_encode( $cfg ) . ';', 'before' );
	foreach ( [ 'site', 'lead', 'booking', 'quote', 'restaurant' ] as $p ) {
		if ( in_array( $p, $packs, true ) ) wp_enqueue_script( 'par-' . $p, PAR_URL . 'assets/js/' . $p . '.js', [ 'par-core' ], PAR_VER, true );
	}
	// Declarative form annotations: "css-selector|tool_name|description" per line → <form toolname tooldescription>.
	$lines = array_filter( array_map( 'trim', preg_split( '/\r?\n/', (string) $o['form_annotations'] ) ) );
	if ( $lines ) {
		$rules = [];
		foreach ( $lines as $ln ) { $p3 = array_map( 'trim', explode( '|', $ln, 3 ) ); if ( count( $p3 ) === 3 ) $rules[] = $p3; }
		wp_add_inline_script( 'par-core', 'document.addEventListener("DOMContentLoaded",function(){' . wp_json_encode( $rules ) . '.forEach(function(r){var f=document.querySelector(r[0]);if(f&&f.tagName==="FORM"){f.setAttribute("toolname",r[1]);f.setAttribute("tooldescription",r[2]);}});});' );
	}
} );

/* ---------- REST lead endpoint (used by lead/booking/quote/restaurant packs) ---------- */
add_action( 'rest_api_init', function () {
	register_rest_route( 'probull-agent-ready/v1', '/lead', [
		'methods' => 'POST', 'permission_callback' => '__return_true',
		'callback' => function ( WP_REST_Request $r ) {
			$o = par_opts();
			$name = sanitize_text_field( (string) $r->get_param( 'name' ) ); $email = sanitize_email( (string) $r->get_param( 'email' ) );
			$msg = sanitize_textarea_field( (string) $r->get_param( 'message' ) ); $type = sanitize_key( (string) ( $r->get_param( 'type' ) ?: 'enquiry' ) );
			if ( ! $name || ! is_email( $email ) || ! $msg ) return new WP_REST_Response( [ 'ok' => false, 'error' => 'missing_fields' ], 400 );
			if ( (string) $r->get_param( 'consent' ) !== '1' ) return new WP_REST_Response( [ 'ok' => false, 'error' => 'consent_required' ], 400 );
			$ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0'; $k = 'par_rl_' . md5( $ip ); $n = (int) get_transient( $k );
			if ( $n >= 5 ) return new WP_REST_Response( [ 'ok' => false, 'error' => 'rate_limited' ], 429 );
			set_transient( $k, $n + 1, HOUR_IN_SECONDS );
			$body = "Type: $type\nName: $name\nEmail: $email\nCompany: " . sanitize_text_field( (string) $r->get_param( 'company' ) ) . "\nPhone: " . sanitize_text_field( (string) $r->get_param( 'phone' ) ) . "\nLang: " . sanitize_key( (string) $r->get_param( 'lang' ) ) . "\nVia: AI agent (WebMCP)\n\n$msg\n";
			$sent = wp_mail( $o['lead_to'], sprintf( '[%s] %s from %s (AI agent)', get_bloginfo( 'name' ), ucfirst( $type ), $name ), $body, [ 'Reply-To: ' . $name . ' <' . $email . '>' ] );
			return [ 'ok' => (bool) $sent ];
		},
	] );
} );

/* ---------- llms.txt ---------- */
add_action( 'init', function () { add_rewrite_rule( '^llms\.txt$', 'index.php?par_llms=1', 'top' ); } );
add_filter( 'query_vars', function ( $v ) { $v[] = 'par_llms'; return $v; } );
add_action( 'template_redirect', function () {
	if ( ! get_query_var( 'par_llms' ) ) return;
	$o = par_opts(); if ( empty( $o['llms'] ) ) return;
	header( 'Content-Type: text/plain; charset=utf-8' );
	echo '# ' . get_bloginfo( 'name' ) . "\n\n> " . ( get_bloginfo( 'description' ) ?: $o['company'] ) . ' · ' . home_url( '/' ) . "\n\n";
	if ( $o['llms_extra'] ) echo trim( (string) $o['llms_extra'] ) . "\n\n";
	echo "## Pages\n";
	foreach ( get_pages( [ 'number' => 40, 'sort_column' => 'menu_order' ] ) as $p ) echo '- [' . $p->post_title . '](' . get_permalink( $p ) . ")\n";
	$posts = get_posts( [ 'numberposts' => 10 ] );
	if ( $posts ) { echo "\n## Latest articles\n"; foreach ( $posts as $p ) echo '- [' . $p->post_title . '](' . get_permalink( $p ) . ")\n"; }
	if ( class_exists( 'WooCommerce' ) ) { echo "\n## Product categories\n"; foreach ( get_terms( [ 'taxonomy' => 'product_cat', 'hide_empty' => true, 'number' => 40 ] ) as $t ) echo '- [' . $t->name . '](' . get_term_link( $t ) . ")\n"; }
	echo "\n## For AI agents\nThis site exposes WebMCP tools (document.modelContext): " . implode( ', ', (array) $o['packs'] ) . " packs — https://github.com/KevinBolcic/webmcp-packs\nContact: " . $o['lead_to'] . "\n";
	exit;
} );
register_activation_hook( __FILE__, function () { add_rewrite_rule( '^llms\.txt$', 'index.php?par_llms=1', 'top' ); flush_rewrite_rules(); } );
register_deactivation_hook( __FILE__, 'flush_rewrite_rules' );

/* ---------- settings ---------- */
add_action( 'admin_menu', function () { add_options_page( 'Agent-Ready (WebMCP)', 'Agent-Ready', 'manage_options', 'probull-agent-ready', 'par_settings_page' ); } );
add_action( 'admin_init', function () {
	register_setting( 'par', 'par_options', [ 'sanitize_callback' => function ( $in ) {
		$in = (array) $in; $out = [];
		foreach ( [ 'ot_token', 'company', 'lang', 'lead_to', 'booking_services', 'quote_fields', 'restaurant_menu' ] as $k ) $out[ $k ] = sanitize_text_field( (string) ( $in[ $k ] ?? '' ) );
		foreach ( [ 'pricing', 'booking_hours', 'quote_products', 'llms_extra', 'form_annotations' ] as $k ) $out[ $k ] = trim( (string) ( $in[ $k ] ?? '' ) );
		$out['booking_slot'] = max( 5, (int) ( $in['booking_slot'] ?? 30 ) ); $out['llms'] = empty( $in['llms'] ) ? 0 : 1;
		$out['packs'] = array_values( array_intersect( (array) ( $in['packs'] ?? [] ), [ 'site', 'lead', 'booking', 'quote', 'restaurant' ] ) );
		return $out;
	} ] );
} );
function par_settings_page() {
	$o = par_opts(); $f = fn( $k ) => 'par_options[' . $k . ']'; $v = fn( $k ) => esc_attr( (string) $o[ $k ] ); ?>
	<div class="wrap"><h1>Agent-Ready (WebMCP)</h1>
	<p>Tools are registered in the visitor's browser via <code>document.modelContext</code>. Test: open the site in Chrome with <code>chrome://flags/#enable-webmcp-testing</code> → console → <code>document.modelContext.getTools()</code>. Free readiness check: <a href="https://probull.eu/ai-ready/?url=<?php echo rawurlencode( home_url() ); ?>" target="_blank">probull.eu/ai-ready</a>.</p>
	<form method="post" action="options.php"><?php settings_fields( 'par' ); ?>
	<table class="form-table">
	<tr><th>Tool packs</th><td><?php foreach ( [ 'site' => 'Site info, FAQ search, services, find page (zero-config, reads your JSON-LD)', 'lead' => 'Enquiry / quote request + published pricing', 'booking' => 'Opening hours, available slots, booking request', 'quote' => 'Structured product quote (quantity, specs)', 'restaurant' => 'Menu, hours, table reservation' ] as $k => $l ) : ?>
		<label><input type="checkbox" name="<?php echo $f( 'packs' ); ?>[]" value="<?php echo $k; ?>" <?php checked( in_array( $k, (array) $o['packs'], true ) ); ?>> <b><?php echo $k; ?></b> — <?php echo $l; ?></label><br><?php endforeach; ?></td></tr>
	<tr><th>Chrome origin-trial token</th><td><input type="text" class="large-text" name="<?php echo $f( 'ot_token' ); ?>" value="<?php echo $v( 'ot_token' ); ?>"><p class="description">Free at developer.chrome.com/origintrials → "WebMCP". Without it, tools work only for users who enabled the Chrome flag.</p></td></tr>
	<tr><th>Company name</th><td><input type="text" name="<?php echo $f( 'company' ); ?>" value="<?php echo $v( 'company' ); ?>"> Language <input type="text" size="3" name="<?php echo $f( 'lang' ); ?>" value="<?php echo $v( 'lang' ); ?>"></td></tr>
	<tr><th>Send enquiries to</th><td><input type="email" name="<?php echo $f( 'lead_to' ); ?>" value="<?php echo $v( 'lead_to' ); ?>"></td></tr>
	<tr><th>Pricing (JSON array)</th><td><textarea class="large-text" rows="3" name="<?php echo $f( 'pricing' ); ?>"><?php echo esc_textarea( (string) $o['pricing'] ); ?></textarea><p class="description">e.g. <code>[{"tier":"Basic","price":"49 EUR/mo"}]</code> → tool <code>get_pricing</code></p></td></tr>
	<tr><th>Booking</th><td>Hours JSON (schema.org openingHoursSpecification; leave empty to use your LocalBusiness JSON-LD):<br><textarea class="large-text" rows="2" name="<?php echo $f( 'booking_hours' ); ?>"><?php echo esc_textarea( (string) $o['booking_hours'] ); ?></textarea>Slot minutes <input type="number" size="4" name="<?php echo $f( 'booking_slot' ); ?>" value="<?php echo $v( 'booking_slot' ); ?>"> Services (comma) <input type="text" name="<?php echo $f( 'booking_services' ); ?>" value="<?php echo $v( 'booking_services' ); ?>"></td></tr>
	<tr><th>Quote</th><td>Fields (comma) <input type="text" name="<?php echo $f( 'quote_fields' ); ?>" value="<?php echo $v( 'quote_fields' ); ?>"><br>Products JSON <textarea class="large-text" rows="2" name="<?php echo $f( 'quote_products' ); ?>"><?php echo esc_textarea( (string) $o['quote_products'] ); ?></textarea></td></tr>
	<tr><th>Restaurant menu JSON URL</th><td><input type="text" class="regular-text" name="<?php echo $f( 'restaurant_menu' ); ?>" value="<?php echo $v( 'restaurant_menu' ); ?>"> (or use schema.org Menu JSON-LD)</td></tr>
	<tr><th>llms.txt</th><td><label><input type="checkbox" name="<?php echo $f( 'llms' ); ?>" value="1" <?php checked( $o['llms'] ); ?>> Serve <a href="<?php echo home_url( '/llms.txt' ); ?>" target="_blank">/llms.txt</a> (auto: pages, posts, product categories)</label><br><textarea class="large-text" rows="3" name="<?php echo $f( 'llms_extra' ); ?>" placeholder="Extra text: what you do, who for, prices, service area"><?php echo esc_textarea( (string) $o['llms_extra'] ); ?></textarea></td></tr>
	<tr><th>Form annotations</th><td><textarea class="large-text" rows="3" name="<?php echo $f( 'form_annotations' ); ?>" placeholder="#contact-form|send_contact_message|Send a message to our team"><?php echo esc_textarea( (string) $o['form_annotations'] ); ?></textarea><p class="description">One per line: <code>css-selector|tool_name|description</code> → adds WebMCP declarative attributes to existing forms (Contact Form 7, WPForms, Gravity…).</p></td></tr>
	</table><?php submit_button(); ?></form></div><?php
}
