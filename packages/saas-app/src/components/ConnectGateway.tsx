import React, { useState } from 'react';
import { Zap, Check, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';

interface ConnectGatewayProps {
  domain: string;
  state: string;
  returnUrl: string;
  onAuthorize: (domain: string, state: string, returnUrl: string) => Promise<string>;
}

export const ConnectGateway: React.FC<ConnectGatewayProps> = ({
  domain,
  state,
  returnUrl,
  onAuthorize,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [pairedUrl, setPairedUrl] = useState<string | null>(null);

  const handlePair = async () => {
    setIsProcessing(true);
    try {
      const redirectTarget = await onAuthorize(domain, state, returnUrl);
      setPairedUrl(redirectTarget);
      // Automatically redirect after 1.5 seconds
      setTimeout(() => {
        window.location.href = redirectTarget;
      }, 1200);
    } catch (err: any) {
      alert('Error pairing site: ' + (err.message || 'Unknown error'));
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-800 text-center">
        {/* Brand Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-white mx-auto mb-6 shadow-lg shadow-sky-500/30">
          <Zap className="w-8 h-8 fill-current" />
        </div>

        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Connect Turbopress</h1>
        <p className="text-xs text-slate-500 mb-6">
          Authorize 1-Click Zero-DNS Edge Optimization for your WordPress site.
        </p>

        {/* Site Details Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 text-left space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Domain:</span>
            <span className="font-bold text-slate-900">{domain || 'mysite.com'}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Authentication:</span>
            <span className="font-semibold text-emerald-600 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              HMAC Verified
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Assigned Plan:</span>
            <span className="font-bold text-sky-600">Starter (5 Sites)</span>
          </div>
        </div>

        {/* Features list */}
        <div className="space-y-2 text-left mb-8">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Check className="w-4 h-4 text-emerald-500" />
            <span>Automated Mobile & Desktop Critical CSS Extraction</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Check className="w-4 h-4 text-emerald-500" />
            <span>Sub-15ms TTFB Caching & W3C Speculation Rules</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Check className="w-4 h-4 text-emerald-500" />
            <span>3-Tier Interaction-delayed JS with jQuery Queue</span>
          </div>
        </div>

        {/* Actions */}
        {pairedUrl ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700 text-xs font-bold flex items-center justify-center gap-2">
            <Check className="w-4 h-4" />
            <span>Successfully Paired! Redirecting to WordPress...</span>
          </div>
        ) : (
          <button
            onClick={handlePair}
            disabled={isProcessing}
            className="w-full py-3.5 px-6 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm shadow-lg shadow-sky-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Pairing Edge Engine...</span>
              </>
            ) : (
              <>
                <span>Authorize & Connect Site</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
