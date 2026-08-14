import React, { useState, useEffect } from 'react';
import { Check, Copy, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
import { ExtendedSite } from '../types';

interface ConnectFlowProps {
  initialDomain?: string;
  initialState?: string;
  initialReturnUrl?: string;
  sites: ExtendedSite[];
  onAuthorize: (domain: string, state: string, returnUrl: string) => Promise<string>;
  onNavigateToOverview: () => void;
  onToast: (msg: string) => void;
}

export const ConnectFlow: React.FC<ConnectFlowProps> = ({
  initialDomain = 'northwind-retreat.com',
  initialState = 'state_nonce_123',
  initialReturnUrl = 'https://mysite.com/wp-admin/admin.php?page=turbopress',
  sites,
  onAuthorize,
  onNavigateToOverview,
  onToast,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [domain, setDomain] = useState(initialDomain);
  const [isStaging, setIsStaging] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [slotMode, setSlotMode] = useState<'new' | 'existing'>('new');
  const [selectedExistingSite, setSelectedExistingSite] = useState(sites[0]?.domain || '');
  const [isPlanFull, setIsPlanFull] = useState(false);
  const [isKeyRevealed, setIsKeyRevealed] = useState(false);
  const [apiKey, setApiKey] = useState('sk_live_9f2kd74xm8wqc41a');
  const [wpCountdown, setWpCountdown] = useState<number | null>(5);
  const [returnTargetUrl, setReturnTargetUrl] = useState(initialReturnUrl);

  // Validate Domain Input
  useEffect(() => {
    const v = domain.trim().toLowerCase();
    const valid = v.length > 0 && !/\s/.test(v) && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v);
    const staging = valid && (v.endsWith('.test') || v.endsWith('.local') || v.startsWith('localhost') || v.startsWith('staging.'));
    const registered = valid && sites.some((s) => s.domain === v);

    setIsStaging(staging);
    setIsRegistered(registered);
  }, [domain, sites]);

  // Step 3 Countdown
  useEffect(() => {
    let interval: any;
    if (step === 3 && wpCountdown !== null && wpCountdown > 0) {
      interval = setInterval(() => {
        setWpCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            onToast('Redirecting to WordPress admin…');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, wpCountdown, onToast]);

  const handleDomainSubmit = () => {
    const v = domain.trim().toLowerCase();
    const valid = v.length > 0 && !/\s/.test(v) && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v);

    if (!valid) {
      setHasError(true);
      return;
    }

    setHasError(false);
    if (isRegistered) {
      onToast(`Domain ${domain} is already connected`);
      onNavigateToOverview();
      return;
    }

    setStep(2);
  };

  const handleAuthorize = async () => {
    try {
      const generatedKey = `sk_live_${Math.random().toString(36).substring(2, 16)}`;
      setApiKey(generatedKey);

      const targetDomain = isStaging || slotMode === 'new' ? domain : selectedExistingSite;
      const callbackUrl = await onAuthorize(targetDomain, initialState, initialReturnUrl);
      setReturnTargetUrl(callbackUrl);

      setWpCountdown(5);
      setStep(3);
    } catch (err: any) {
      onToast(err.message || 'Authorization failed');
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    onToast('API Key copied to clipboard');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      {/* Step Indicator */}
      <div className="flex items-center" aria-label="Connection progress">
        {/* Step 1 */}
        <div className="flex items-center gap-2">
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-semibold border ${
              step === 1
                ? 'bg-[#171717] border-[#171717] text-white'
                : step > 1
                ? 'bg-[#f0fdf4] border-[#16a34a] text-[#16a34a]'
                : 'bg-white border-[#e4e4e7] text-[#71717a]'
            }`}
          >
            {step > 1 ? <Check className="w-3.5 h-3.5" /> : '1'}
          </span>
          <span className={`text-[12.5px] font-medium hidden sm:inline ${step === 1 ? 'text-[#171717] font-semibold' : 'text-[#71717a]'}`}>
            Domain
          </span>
        </div>

        <span className={`flex-1 h-[1.5px] mx-3 transition-colors ${step > 1 ? 'bg-[#16a34a]' : 'bg-[#e4e4e7]'}`} />

        {/* Step 2 */}
        <div className="flex items-center gap-2">
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-semibold border ${
              step === 2
                ? 'bg-[#171717] border-[#171717] text-white'
                : step > 2
                ? 'bg-[#f0fdf4] border-[#16a34a] text-[#16a34a]'
                : 'bg-white border-[#e4e4e7] text-[#71717a]'
            }`}
          >
            {step > 2 ? <Check className="w-3.5 h-3.5" /> : '2'}
          </span>
          <span className={`text-[12.5px] font-medium hidden sm:inline ${step === 2 ? 'text-[#171717] font-semibold' : 'text-[#71717a]'}`}>
            License slot
          </span>
        </div>

        <span className={`flex-1 h-[1.5px] mx-3 transition-colors ${step > 2 ? 'bg-[#16a34a]' : 'bg-[#e4e4e7]'}`} />

        {/* Step 3 */}
        <div className="flex items-center gap-2">
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-semibold border ${
              step === 3
                ? 'bg-[#171717] border-[#171717] text-white'
                : 'bg-white border-[#e4e4e7] text-[#71717a]'
            }`}
          >
            3
          </span>
          <span className={`text-[12.5px] font-medium hidden sm:inline ${step === 3 ? 'text-[#171717] font-semibold' : 'text-[#71717a]'}`}>
            Connected
          </span>
        </div>
      </div>

      {/* STEP 1: DOMAIN INPUT */}
      {step === 1 && (
        <section className="bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-[#171717]">
            Connect a WordPress site
          </h1>
          <p className="text-[13.5px] text-[#71717a] mt-1.5 mb-6 leading-relaxed">
            {isStaging
              ? 'This looks like a staging or development domain. Staging sites connect to a free development seat and never consume a license slot.'
              : 'The SpeedForge plugin must be active on the site. Enter the domain exactly as it appears in WordPress → Settings → Site Address.'}
          </p>

          <div className="space-y-2">
            <label className="block text-[12.5px] font-medium text-[#3f3f46]">Site domain</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setHasError(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleDomainSubmit()}
              placeholder="example.com"
              className={`w-full px-3.5 py-2.5 bg-white border rounded-lg text-[14px] font-mono text-[#171717] focus:outline-none transition-colors ${
                hasError ? 'border-[#dc2626] focus:ring-2 focus:ring-red-200' : 'border-[#e4e4e7] focus:border-[#f03e2f]'
              }`}
            />
            {hasError && (
              <p className="text-xs text-[#dc2626]">
                Please enter a valid domain (e.g. <code>mysite.com</code> or <code>staging.mysite.com</code>).
              </p>
            )}

            <div className="flex gap-2 min-h-6 items-center pt-1">
              {isRegistered && (
                <span className="chip chip-warn">
                  <span className="chip-dot" /> Already connected on plan
                </span>
              )}
              {isStaging && (
                <span className="chip chip-success">
                  <span className="chip-dot" /> Staging domain — Free development seat
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-[#f1f1f2]">
            <button
              onClick={handleDomainSubmit}
              className="btn btn-primary px-5"
            >
              {isRegistered ? 'View Site' : 'Continue'}
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: LICENSE SLOT */}
      {step === 2 && (
        <section className="bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-sm">
          <h2 className="text-xl font-semibold tracking-tight text-[#171717]">
            License slot
          </h2>
          <p className="text-[13.5px] text-[#71717a] mt-1.5 mb-6">
            Every connected production site uses one slot on your plan.
          </p>

          {isPlanFull && !isStaging ? (
            <div className="p-6 text-center border border-[#fed7aa] bg-[#fffbeb] rounded-xl my-4">
              <span className="w-10 h-10 rounded-xl bg-[#fef3c7] text-[#b45309] grid place-items-center mx-auto mb-3">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h3 className="text-base font-semibold text-[#171717]">All 10 slots in use</h3>
              <p className="text-xs text-[#71717a] mt-1 mb-4">
                The Agency plan includes 10 production slots. Upgrade to add more sites, or disconnect an existing site to free a seat.
              </p>
              <button
                onClick={() => onNavigateToOverview()}
                className="btn btn-secondary text-xs"
              >
                Upgrade plan
              </button>
            </div>
          ) : isStaging ? (
            <div className="p-4 rounded-xl bg-[#f0fdf4] border border-[#dcfce7] text-[#15803d] text-[13px] flex items-start gap-3 my-4">
              <Check className="w-4 h-4 flex-none mt-0.5" />
              <div>
                <strong>No slot needed — staging seats are free.</strong>
                <p className="text-[12.5px] text-[#166534] mt-0.5">
                  <code>{domain}</code> will be connected as a free development seat with full edge optimization.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Plan summary & meter */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-semibold text-[#171717]">Agency plan</p>
                  <p className="text-xs text-[#71717a] font-mono">3 of 10 slots available</p>
                </div>
                <span className="chip chip-neutral">
                  <span className="chip-dot" /> 7/10 in use
                </span>
              </div>

              {/* 10-Segment Slot Meter */}
              <div className="grid grid-cols-10 gap-1.5 py-1">
                {Array.from({ length: 10 }).map((_, idx) => (
                  <span
                    key={idx}
                    className={`h-2 rounded-sm transition-colors ${
                      idx < 7 ? 'bg-[#171717]' : 'bg-[#e4e4e7]'
                    }`}
                  />
                ))}
              </div>

              {/* Radio options */}
              <div className="space-y-2.5 pt-2">
                <label className="flex items-start gap-3 p-3.5 border border-[#e4e4e7] rounded-xl hover:bg-[#f8f8f7] cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="slotMode"
                    value="new"
                    checked={slotMode === 'new'}
                    onChange={() => setSlotMode('new')}
                    className="accent-[#f03e2f] mt-1"
                  />
                  <div>
                    <p className="text-[13.5px] font-medium text-[#171717]">
                      Use a slot for {domain}
                    </p>
                    <p className="text-[12px] text-[#71717a]">
                      1 slot will be consumed · you can disconnect it anytime to free the seat
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 border border-[#e4e4e7] rounded-xl hover:bg-[#f8f8f7] cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="slotMode"
                    value="existing"
                    checked={slotMode === 'existing'}
                    onChange={() => setSlotMode('existing')}
                    className="accent-[#f03e2f] mt-1"
                  />
                  <div className="flex-1">
                    <p className="text-[13.5px] font-medium text-[#171717]">
                      Choose an existing site instead
                    </p>
                    <p className="text-[12px] text-[#71717a] mb-2">
                      Re-issue the key for a site that is already connected
                    </p>
                    {slotMode === 'existing' && (
                      <select
                        value={selectedExistingSite}
                        onChange={(e) => setSelectedExistingSite(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-[#e4e4e7] rounded-lg text-xs font-mono text-[#171717]"
                      >
                        {sites.map((s) => (
                          <option key={s.id} value={s.domain}>
                            {s.domain}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Prototype Simulation Toggle */}
          <div className="flex items-center justify-between pt-4 mt-6 border-t border-dashed border-[#e4e4e7]">
            <span className="meta">prototype</span>
            <button
              onClick={() => {
                setIsPlanFull(!isPlanFull);
                onToast(!isPlanFull ? 'Simulating 10/10 slots full' : 'Simulating available seats (7/10)');
              }}
              className="btn btn-ghost text-xs py-1 px-2.5"
            >
              {isPlanFull ? 'Reset to 7/10 slots' : 'Simulate: plan full'}
            </button>
          </div>

          <div className="flex justify-between items-center pt-6 mt-4 border-t border-[#f1f1f2]">
            <button onClick={() => setStep(1)} className="btn btn-ghost">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </button>
            <button
              onClick={handleAuthorize}
              disabled={isPlanFull && !isStaging}
              className="btn btn-primary px-5 disabled:opacity-50"
            >
              Authorize & Connect
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: CONNECTED */}
      {step === 3 && (
        <section className="bg-white border border-[#e4e4e7] rounded-2xl p-6 sm:p-8 shadow-sm animate-fade-in">
          <div className="w-12 h-12 rounded-full bg-[#f0fdf4] border-2 border-[#16a34a] text-[#16a34a] grid place-items-center mb-4">
            <Check className="w-6 h-6 stroke-[2.5]" />
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-[#171717]">
            Site connected
          </h2>
          <p className="text-[13.5px] text-[#71717a] mt-1 mb-6">
            The 1-Click OAuth handshake completed. Paste this key into the plugin — it also syncs automatically over the handshake channel.
          </p>

          {/* API Key Box */}
          <div className="flex items-center gap-3 p-3.5 bg-[#f8f8f7] border border-[#e4e4e7] rounded-xl flex-wrap">
            <span className="font-mono text-[13px] text-[#171717] flex-1 truncate">
              {isKeyRevealed ? apiKey : `sk_live_••••••••${apiKey.slice(-4)}`}
            </span>
            <button
              onClick={() => setIsKeyRevealed(!isKeyRevealed)}
              className="btn btn-ghost text-xs py-1 px-2.5"
            >
              {isKeyRevealed ? <EyeOff className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
              {isKeyRevealed ? 'Hide' : 'Reveal'}
            </button>
            <button
              onClick={handleCopyKey}
              className="btn btn-secondary text-xs py-1 px-2.5"
            >
              <Copy className="w-3.5 h-3.5 mr-1" /> Copy
            </button>
          </div>

          {/* Next steps list */}
          <ol className="list-decimal pl-5 mt-6 space-y-1.5 text-[13px] text-[#3f3f46]">
            <li>Return to WordPress admin</li>
            <li>The plugin saves the API key automatically</li>
            <li>Edge Critical CSS cache warms within ~5 min</li>
          </ol>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-6 mt-6 border-t border-[#f1f1f2]">
            <button onClick={() => setStep(2)} className="btn btn-ghost">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </button>
            <div className="flex gap-2">
              <button onClick={onNavigateToOverview} className="btn btn-ghost">
                Go to site overview
              </button>
              <button
                onClick={() => {
                  window.location.href = returnTargetUrl;
                }}
                className="btn btn-primary"
              >
                Return to WordPress {wpCountdown && wpCountdown > 0 ? `(${wpCountdown})` : ''} ↗
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Handshake Protocol Architecture Diagram */}
      <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div className="border border-[#e4e4e7] rounded-lg px-3 py-2 bg-white text-center">
            <span className="font-mono text-xs font-semibold text-[#171717] block">wp-plugin</span>
            <span className="text-[10px] text-[#71717a]">WordPress admin</span>
          </div>

          <div className="flex-1 h-[1.5px] bg-[#e4e4e7] mx-3 relative">
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#f03e2f] animate-pulse" />
          </div>

          <div className="border border-[#e4e4e7] rounded-lg px-3 py-2 bg-white text-center">
            <span className="font-mono text-xs font-semibold text-[#171717] block">speedforge.app</span>
            <span className="text-[10px] text-[#71717a]">SaaS dashboard</span>
          </div>

          <div className="flex-1 h-[1.5px] bg-[#e4e4e7] mx-3 relative">
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#f03e2f] animate-pulse" />
          </div>

          <div className="border border-[#e4e4e7] rounded-lg px-3 py-2 bg-white text-center">
            <span className="font-mono text-xs font-semibold text-[#171717] block">edge-api</span>
            <span className="text-[10px] text-[#71717a]">Hono Worker</span>
          </div>
        </div>
        <p className="text-center meta mt-4">1-Click Cryptographic OAuth Handshake Protocol</p>
      </div>
    </div>
  );
};
