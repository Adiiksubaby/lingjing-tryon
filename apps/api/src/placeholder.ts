import type { Silhouette } from '@lingjing/shared';

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return map[char] ?? char;
  });
}

export function placeholderSvg(input: {
  title: string;
  label: string;
  color: string;
  silhouette: Silhouette;
  angle: string;
}) {
  const narrow = input.angle === 'side' ? 0.72 : 1;
  const shape =
    input.silhouette === 'pants'
      ? `<rect x="${230 / narrow}" y="250" width="60" height="390" rx="18" fill="${input.color}"/><rect x="${310 / narrow}" y="250" width="60" height="390" rx="18" fill="${input.color}"/>`
      : input.silhouette === 'skirt'
        ? `<polygon points="250,230 350,230 430,640 170,640" fill="${input.color}"/>`
        : `<path d="M210 250 h180 l24 70 h-40 l-8 300 h-132 l-8-300 h-40 z" fill="${input.color}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <rect width="600" height="800" fill="#f6f1ea"/>
  <rect x="36" y="36" width="528" height="728" fill="none" stroke="#e4dcd2"/>
  <text x="60" y="92" font-size="28" fill="#8a8178" font-family="sans-serif">${escapeXml(input.label)}</text>
  <text x="60" y="136" font-size="26" fill="#221e1a" font-family="sans-serif">${escapeXml(input.title)}</text>
  <g transform="translate(300 460) scale(${narrow} 1) translate(-300 -460)">${shape}</g>
</svg>`;
}
