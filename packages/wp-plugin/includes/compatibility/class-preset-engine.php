<?php
namespace Turbopress;

if (!defined('ABSPATH')) {
    exit;
}

class PresetEngine {
    private Config $config;

    public function __construct(Config $config) {
        $this->config = $config;
    }

    public function apply_auto_presets(): void {
        // v1.10.0: this method is retired. The old auto-exclusions
        // ('elementor-frontend', 'elementor-pro', …) silently kept builder
        // scripts SYNCHRONOUS in interaction_delay mode while jQuery and
        // the inline configs were withheld as placeholders — the sync
        // scripts then executed against the loader's jQuery stub, which is
        // precisely the "Cannot read properties of undefined (animate)" /
        // "elementorModules is not defined" / sticky-widget breakage class.
        //
        // The delayed chain is order-preserving (data-tp-order + sequential
        // execution + per-script error isolation), so builder scripts are
        // the ones that MOST need to be inside it. Only the user-managed
        // exclusion list (consent banners, payment SDKs — see Config
        // defaults) keeps scripts outside the chain.
        //
        // The 1.10.0 config migration strips any auto-added keywords that
        // previous releases persisted.
    }
}
