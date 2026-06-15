const URL_REGEX = /(https?:\/\/[^\s<]+)/g;
const URL_TEST = /^https?:\/\//;

export function linkifyText(text: string): (string | { url: string; text: string })[] {
  const parts = text.split(URL_REGEX);
  return parts.map(part => {
    if (URL_TEST.test(part)) {
      return { url: part, text: part };
    }
    return part;
  });
}

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const segments = linkifyText(text);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        typeof seg === 'string' ? (
          <span key={i}>{seg}</span>
        ) : (
          <a
            key={i}
            href={seg.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            {seg.text}
          </a>
        )
      )}
    </span>
  );
}
