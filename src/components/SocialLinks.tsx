import React from 'react';
import { Instagram, Facebook, MessageCircle } from 'lucide-react';

const SOCIAL_LINKS = [
  {
    label: 'Instagram',
    url: 'https://www.instagram.com/sigotuhuella.sicardi/',
    icon: Instagram,
    color: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 hover:opacity-90',
    textColor: 'text-pink-600',
  },
  {
    label: 'Facebook',
    url: 'https://www.facebook.com/profile.php?id=61590735571325',
    icon: Facebook,
    color: 'bg-blue-600 hover:bg-blue-700',
    textColor: 'text-blue-600',
  },
  {
    label: 'WhatsApp',
    url: 'https://wa.me/5492212025190',
    icon: MessageCircle,
    color: 'bg-emerald-500 hover:bg-emerald-600',
    textColor: 'text-emerald-600',
  },
];

interface SocialLinksProps {
  variant?: 'row' | 'column';
  showLabels?: boolean;
}

export default function SocialLinks({ variant = 'row', showLabels = true }: SocialLinksProps) {
  if (variant === 'row') {
    return (
      <div className="flex items-center gap-3">
        {SOCIAL_LINKS.map(link => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all hover:shadow-lg hover:-translate-y-0.5 ${link.color}`}
            title={link.label}
          >
            <link.icon className="w-5 h-5" />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {SOCIAL_LINKS.map(link => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-brand-bg transition-all group`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${link.color}`}>
            <link.icon className="w-4 h-4" />
          </div>
          {showLabels && (
            <span className="text-sm font-bold text-gray-600 group-hover:text-brand-primary transition-colors">
              {link.label}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}
