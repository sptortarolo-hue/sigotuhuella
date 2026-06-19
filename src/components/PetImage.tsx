import React, { useState } from 'react';

interface PetImageProps {
  src: string;
  alt: string;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

export default function PetImage({ src, alt, className = '', onError }: PetImageProps) {
  const [error, setError] = useState(false);

  if (!src || error) return null;

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
