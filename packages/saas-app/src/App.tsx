import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { SitesTab } from './components/SitesTab';
import { BillingTab } from './components/BillingTab';
import { SiteDetailModal } from './components/SiteDetailModal';
import { ConnectGateway } from './components/ConnectGateway';
import { Site, SiteConfig, PRESETS_RECORD } from '@turbopress/shared';

// Initial Demo State
const INITIAL_SITES: Site[] = [
  {
    id: 'site_e819b2a1',
    user_id: 'user_2x918237',
    subscription_id: 'sub_polar_starter',
    domain: 'speedyshop.com',
    site_api_key_hash: 'hash_sk_live_1234',
    config_json: JSON.stringify(PRESETS_RECORD.ludicrous),
    is_active: 1,
    wp_version: '6.7.1',
    plugin_version: '1.0.0',
    last_ping_at: Date.now() - 120000,
    created_at: Date.now() - 86400000 * 3,
    updated_at: Date.now() - 3600000,
  },
  {
    id: 'site_c478a9d3',
    user_id: 'user_2x918237',
    subscription_id: 'sub_polar_starter',
    domain: 'techblog.io',
    site_api_key_hash: 'hash_sk_live_5678',
    config_json: JSON.stringify(PRESETS_RECORD.aggressive),
    is_active: 1,
    wp_version: '6.6.2',
    plugin_version: '1.0.0',
    last_ping_at: Date.now() - 600000,
    created_at: Date.now() - 86400000 * 7,
    updated_at: Date.now() - 7200000,
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'sites' | 'billing'>('overview');
  const [sites, setSites] = useState<Site[]>(INITIAL_SITES);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const maxSites = 5;

  // Check if current URL is the 1-Click Connect Gateway
  const urlParams = new URLSearchParams(window.location.search);
  const isConnectPath = window.location.pathname === '/connect' || urlParams.has('return_url');
  const connectDomain = urlParams.get('domain') || 'mystore.com';
  const connectState = urlParams.get('state') || 'state_nonce_123';
  const connectReturnUrl = urlParams.get('return_url') || 'https://mystore.com/wp-admin/admin.php?page=turbopress';

  // Handle 1-Click Pairing Authorization
  const handleAuthorizeHandshake = async (domain: string, state: string, returnUrl: string): Promise<string> => {
    // Generate new mock API Key
    const newSiteId = `site_${Math.random().toString(36).substring(2, 10)}`;
    const newApiKey = `sk_live_${Math.random().toString(36).substring(2, 18)}`;

    const newSite: Site = {
      id: newSiteId,
      user_id: 'user_2x918237',
      subscription_id: 'sub_polar_starter',
      domain: domain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      site_api_key_hash: 'hash_' + newApiKey,
      config_json: JSON.stringify(PRESETS_RECORD.ludicrous),
      is_active: 1,
      wp_version: '6.7.1',
      plugin_version: '1.0.0',
      last_ping_at: Date.now(),
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    setSites((prev) => [newSite, ...prev.filter((s) => s.domain !== newSite.domain)]);

    // Construct WordPress callback URL
    const separator = returnUrl.includes('?') ? '&' : '?';
    return `${returnUrl}${separator}turbopress_pair=1&api_key=${newApiKey}&site_id=${newSiteId}&state=${state}`;
  };

  // Handle Save Configuration
  const handleSaveConfig = async (siteId: string, updatedConfig: SiteConfig) => {
    setSites((prev) =>
      prev.map((s) =>
        s.id === siteId
          ? {
              ...s,
              config_json: JSON.stringify(updatedConfig),
              updated_at: Date.now(),
            }
          : s
      )
    );
  };

  // Handle On-Demand Optimize Run
  const handleDispatchOptimize = async (_url: string) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  };

  // Handle Purge Cache
  const handlePurgeSiteCache = async (_siteId: string, _domain: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  };

  // Handle Delete Site
  const handleDeleteSite = async (siteId: string) => {
    setSites((prev) => prev.filter((s) => s.id !== siteId));
    if (selectedSite?.id === siteId) {
      setSelectedSite(null);
    }
  };

  if (isConnectPath) {
    return (
      <ConnectGateway
        domain={connectDomain}
        state={connectState}
        returnUrl={connectReturnUrl}
        onAuthorize={handleAuthorizeHandshake}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        siteCount={sites.length}
        maxSites={maxSites}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <OverviewTab
            sites={sites}
            onSelectSite={(site) => setSelectedSite(site)}
            onNavigateToSites={() => setActiveTab('sites')}
          />
        )}

        {activeTab === 'sites' && (
          <SitesTab
            sites={sites}
            onSelectSite={(site) => setSelectedSite(site)}
            onOpenConnectWizard={() => {
              window.open('/connect?domain=demo-wordpress-site.com&state=demo_nonce_123', '_blank');
            }}
            onPurgeSiteCache={handlePurgeSiteCache}
            onDeleteSite={handleDeleteSite}
          />
        )}

        {activeTab === 'billing' && (
          <BillingTab siteCount={sites.length} maxSites={maxSites} />
        )}
      </main>

      {/* Site Detail & Optimization Modal */}
      {selectedSite && (
        <SiteDetailModal
          site={selectedSite}
          onClose={() => setSelectedSite(null)}
          onSaveConfig={handleSaveConfig}
          onDispatchOptimize={handleDispatchOptimize}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <p>Turbopress SpeedForge Engine • Zero-DNS Edge Optimization for WordPress</p>
      </footer>
    </div>
  );
}
