import React, { useState } from 'react';

interface PetImageProps {
  src: string;
  alt: string;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

export default function PetImage({ src, alt, className = '', onError }: PetImageProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className="w-full h-full bg-brand-bg flex items-center justify-center">
        <img src="/sigotuhuella.jpg" alt="" className="w-2/3 h-2/3 object-contain opacity-15" />
      </div>
    );
  }

  return (
    <>
      <img
        src={src}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full blur-2xl scale-110 opacity-70 object-cover"
        onError={() => setError(true)}
      />
      <img
        src={src}
        alt={alt}
        className={`relative w-full h-full object-contain ${className}`}
        onError={(e) => { setError(true); onError?.(e); }}
      />
    </>
  );
}
