/**
 * TurboPress Custom Clerk Appearance Theme
 * Tailored to match TurboPress's high-performance, minimalist aesthetic:
 * Jet Black (#171717), Turbo Red (#f03e2f), Neutral (#f8f8f7), Subtle Slate (#e4e4e7).
 */

export const turbopressClerkAppearance = {
  layout: {
    socialButtonsVariant: 'blockButton' as const,
    socialButtonsPlacement: 'top' as const,
    showOptionalFields: false,
    logoPlacement: 'inside' as const,
  },
  variables: {
    colorPrimary: '#f03e2f',
    colorText: '#171717',
    colorTextSecondary: '#71717a',
    colorBackground: '#ffffff',
    colorInputBackground: '#ffffff',
    colorInputText: '#171717',
    colorDanger: '#dc2626',
    colorSuccess: '#16a34a',
    borderRadius: '0.75rem',
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    fontFamilyButtons: '"Inter", system-ui, -apple-system, sans-serif',
  },
  elements: {
    rootBox: 'w-full',
    card: 'shadow-none p-0 border-0 bg-transparent w-full',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    header: 'hidden',
    socialButtonsBlockButton:
      'border border-[#e4e4e7] hover:bg-[#f8f8f7] text-[#171717] text-xs font-medium py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 hover:border-[#d4d4d8]',
    socialButtonsBlockButtonText: 'text-xs font-semibold text-[#171717]',
    dividerRow: 'my-4',
    dividerText: 'text-[10px] font-mono uppercase tracking-wider text-[#a1a1aa] bg-white px-2.5',
    dividerLine: 'bg-[#f1f1f2]',
    formButtonPrimary:
      'bg-[#171717] hover:bg-black text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition-all shadow-sm active:scale-[0.99]',
    formFieldLabel: 'text-xs font-medium text-[#3f3f46] mb-1.5',
    formFieldInput:
      'border border-[#e4e4e7] text-xs rounded-xl px-3.5 py-2.5 text-[#171717] focus:border-[#f03e2f] focus:ring-2 focus:ring-[#f03e2f]/10 transition-all placeholder:text-[#a1a1aa]',
    footerAction: 'text-xs text-[#71717a] mt-4 pt-3 border-t border-[#f1f1f2] text-center',
    footerActionLink: 'text-[#f03e2f] hover:underline font-medium text-xs ml-1',
    identityPreviewText: 'text-xs font-mono text-[#171717]',
    identityPreviewEditButton: 'text-xs text-[#f03e2f] hover:underline',
    otpCodeFieldInput:
      'border border-[#e4e4e7] text-lg font-mono text-[#171717] rounded-xl focus:border-[#f03e2f] focus:ring-2 focus:ring-[#f03e2f]/10',
    formResendCodeLink: 'text-xs text-[#f03e2f] hover:underline font-medium',
    alert: 'border border-red-200 bg-red-50 text-red-700 text-xs rounded-xl p-3',
    userButtonPopoverCard: 'border border-[#e4e4e7] shadow-xl rounded-2xl p-2 bg-white',
    userButtonPopoverActionButton:
      'hover:bg-[#f8f8f7] text-[#171717] text-xs font-medium rounded-lg p-2 transition-colors',
    userButtonPopoverActionButtonText: 'text-xs font-medium text-[#171717]',
    userButtonPopoverFooter: 'hidden',
  },
};
