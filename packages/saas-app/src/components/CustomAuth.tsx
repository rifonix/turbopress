'use client';

import React, { useState } from 'react';
import { CustomSignIn } from './auth/CustomSignIn';
import { CustomSignUp } from './auth/CustomSignUp';

interface CustomAuthProps {
  initialMode?: 'signin' | 'signup';
  onSuccess?: () => void;
  onToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const CustomAuth: React.FC<CustomAuthProps> = ({
  initialMode = 'signin',
  onSuccess,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);

  return (
    <div className="w-full">
      {mode === 'signin' ? (
        <CustomSignIn
          onSuccess={onSuccess}
          onSwitchToSignUp={() => setMode('signup')}
          showFooter={true}
        />
      ) : (
        <CustomSignUp
          onSuccess={onSuccess}
          onSwitchToSignIn={() => setMode('signin')}
          showFooter={true}
        />
      )}
    </div>
  );
};
